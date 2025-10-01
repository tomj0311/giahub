import React, { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { agentRuntimeService } from '../../services/agentRuntimeService';
import sharedApiService from '../../utils/apiService';


const XMLEditor = ({ isOpen, onClose, xmlContent, onUpdate, elementType, selectedNode, selectedEdge, onNodeUpdate, onEdgeUpdate, edges, nodeData }) => {
  const [editedXml, setEditedXml] = useState('');
  const [position, setPosition] = useState({ x: window.innerWidth * 0.25, y: window.innerHeight * 0.2 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  // Accordion state: 0 = XML Editor, 1 = Code Generator, 2 = Assignee, 3 = XML Properties
  const [accordionOpen, setAccordionOpen] = useState(0);
  // Code generator states
  const [cgPrompt, setCgPrompt] = useState('');
  const [cgResponse, setCgResponse] = useState('');
  const [cgLoading, setCgLoading] = useState(false);
  // Assignee states
  const [assigneeResourceRef, setAssigneeResourceRef] = useState('');
  const [editablePotentialOwnerXml, setEditablePotentialOwnerXml] = useState('');
  // XML Properties states
  const [xmlProperties, setXmlProperties] = useState({
    userTask: {
      formData: {
        formFields: [{ id: '', label: '', type: 'string', required: false }],
        jsxCode: ''
      },
      potentialOwner: {
        fields: [{ name: 'dueDate', value: '', type: 'datetime-local', label: 'Due Date' }]
      }
    },
    serviceTask: {
      endpoint: '',
      method: 'POST',
      timeout: '20000',
      retryCount: '2',
      headers: [{ name: 'Content-Type', value: 'application/json' }]
    },
    scriptTask: {
      scriptCode: ''
    },
    gateway: {
      conditions: [{ flowId: '', condition: '', name: '' }]
    }
  });
  // Sub-accordion state for UserTask sections
  const [userTaskAccordion, setUserTaskAccordion] = useState(0); // 0 = formData, 1 = potentialOwner

  // Simple function to update XML from properties
  const updateXmlFromProperties = () => {
    const taskType = selectedNode?.data?.taskType || elementType;
    
    if (taskType === 'userTask') {
      // Generate formData section
      let formDataXml = `<extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <formData xmlns="http://example.org/form">
    <scriptData xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <script xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><![CDATA[
${xmlProperties.userTask.formData.jsxCode || '// JSX code will be generated here'}
]]></script>
    </scriptData>
${xmlProperties.userTask.formData.formFields.map(field => 
  field.id ? `    <formField id="${field.id}" label="${field.label}" type="${field.type}" required="${field.required}"/>` : ''
).filter(Boolean).join('\n')}
  </formData>
</extensionElements>`;

      // Generate potentialOwner section if any values are set
      let potentialOwnerXml = '';
      const potentialOwnerFields = xmlProperties.userTask.potentialOwner.fields.filter(field => field.value.trim());
      
      if (potentialOwnerFields.length > 0) {
        let potentialOwnerContent = `  <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
${potentialOwnerFields.map(field => {
  if (field.name === 'dueDate') {
    return `    <dueDate>${field.value}Z</dueDate>`;
  } else if (field.name === 'userEmail') {
    return `    <userEmail>${field.value}</userEmail>`;
  } else {
    return `    <${field.name}>${field.value}</${field.name}>`;
  }
}).join('\n')}
  </extensionElements>`;
        
        potentialOwnerXml = `<potentialOwner>
${potentialOwnerContent}
</potentialOwner>`;
      }

      // Combine both sections
      const generatedXml = potentialOwnerXml ? `${formDataXml}\n${potentialOwnerXml}` : formDataXml;
      setEditedXml(formatXML(generatedXml));
    } else if (selectedNode?.type && selectedNode.type.includes('gateway')) {
      // Generate gateway sequence flows XML
      const gatewayXml = xmlProperties.gateway.conditions.map(condition => 
        condition.flowId ? `<sequenceFlow id="${condition.flowId}" sourceRef="${selectedNode.id}" targetRef="TARGET_REF" name="${condition.name}">
  <conditionExpression xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xsi:type="tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${condition.condition}</conditionExpression>
</sequenceFlow>` : ''
      ).filter(Boolean).join('\n');
      
      setEditedXml(formatXML(gatewayXml));
    }
  };

  // Function to parse XML and update properties state
  const parseXmlToProperties = (xmlContent) => {
    console.log('🔍 PARSING XML TO PROPERTIES:', xmlContent);
    if (!xmlContent) return;
    
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<root>${xmlContent}</root>`, 'text/xml');
      const taskType = selectedNode?.data?.taskType || elementType;
      
      if (taskType === 'userTask') {
        // Parse formData
        const scriptElement = doc.querySelector('script');
        const jsxCode = scriptElement ? scriptElement.textContent.trim() : '';
        
        const formFields = Array.from(doc.querySelectorAll('formField')).map(field => ({
          id: field.getAttribute('id') || '',
          label: field.getAttribute('label') || '',
          type: field.getAttribute('type') || 'string',
          required: field.getAttribute('required') === 'true'
        }));
        
        // Parse potentialOwner
        const potentialOwnerFields = [];
        const potentialOwner = doc.querySelector('potentialOwner');
        console.log('🎯 Found potentialOwner:', !!potentialOwner);
        
        if (potentialOwner) {
          // Get extensionElements inside potentialOwner
          const extensionElements = potentialOwner.querySelector('extensionElements');
          console.log('📦 Found extensionElements:', !!extensionElements);
          
          if (extensionElements) {
            console.log('🔢 extensionElements children count:', extensionElements.children.length);
            // Parse ALL child elements, not just specific ones
            for (let i = 0; i < extensionElements.children.length; i++) {
              const element = extensionElements.children[i];
              const tagName = element.tagName;
              const value = element.textContent;
              
              console.log(`🏷️ Found element: ${tagName} = ${value}`);
              
              potentialOwnerFields.push({
                name: tagName,
                value: value,
                type: 'text',
                label: tagName
              });
            }
          }
        }
        
        console.log('📋 Final potentialOwnerFields:', potentialOwnerFields);
        
        // Ensure at least one field exists
        if (potentialOwnerFields.length === 0) {
          potentialOwnerFields.push({ name: 'dueDate', value: '', type: 'datetime-local', label: 'Due Date' });
        }
        
        console.log('🔄 About to set state with fields:', potentialOwnerFields);
        
        // Update state
        setXmlProperties(prev => ({
          ...prev,
          userTask: {
            formData: {
              formFields: formFields.length > 0 ? formFields : [{ id: '', label: '', type: 'string', required: false }],
              jsxCode: jsxCode
            },
            potentialOwner: {
              fields: potentialOwnerFields
            }
          }
        }));
      } else if (selectedNode?.type && selectedNode.type.includes('gateway')) {
        // Parse gateway sequence flows
        const sequenceFlows = Array.from(doc.querySelectorAll('sequenceFlow')).map(flow => ({
          flowId: flow.getAttribute('id') || '',
          name: flow.getAttribute('name') || '',
          condition: flow.querySelector('conditionExpression')?.textContent?.trim() || ''
        }));
        
        // Update gateway properties
        setXmlProperties(prev => ({
          ...prev,
          gateway: {
            conditions: sequenceFlows.length > 0 ? sequenceFlows : [{ flowId: '', condition: '', name: '' }]
          }
        }));
      }
    } catch (error) {
      console.error('Error parsing XML to properties:', error);
    }
  };
  // Agent loading exactly like AgentPlayground
  const [selected, setSelected] = useState(null);
  const token = localStorage.getItem('token') || '';

  // Set hardcoded agent based on element type
  useEffect(() => {
    let agentName = 'Python Code Generator'; // default
    
    // Use the taskType from selectedNode data if available
    const taskType = selectedNode?.data?.taskType || elementType;
    
    if (taskType === 'userTask') {
      agentName = 'JSX Component Generator';
    } else if (taskType === 'scriptTask') {
      agentName = 'Python Code Generator';
    } 
    
    setSelected(agentName);
  }, [elementType, selectedNode]);

  useEffect(() => {
    console.log('🚀 XMLEditor useEffect triggered with xmlContent:', xmlContent);
    if (xmlContent && 
        !xmlContent.includes('No XML data available') && 
        !xmlContent.includes('originalNestedElements not found') &&
        !xmlContent.includes('No inner elements found')) {
      
      const taskType = selectedNode?.data?.taskType || elementType;
      console.log('🎯 Task type:', taskType);
      
      // Extract potentialOwner information
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<root>${xmlContent}</root>`, 'text/xml');
        const potentialOwner = doc.querySelector('potentialOwner');
        
        if (potentialOwner) {
          const resourceRef = potentialOwner.querySelector('resourceRef');
          if (resourceRef) {
            setAssigneeResourceRef(resourceRef.textContent || '');
          }
          
          // Set editable potentialOwner inner XML
          let innerXML = '';
          for (let i = 0; i < potentialOwner.childNodes.length; i++) {
            const child = potentialOwner.childNodes[i];
            if (child.nodeType === Node.ELEMENT_NODE) {
              const serializer = new XMLSerializer();
              innerXML += serializer.serializeToString(child);
            }
          }
          setEditablePotentialOwnerXml(formatXML(innerXML));
        } else {
          setAssigneeResourceRef('');
          setEditablePotentialOwnerXml('');
        }
      } catch (error) {
        console.error('Error parsing XML for potentialOwner:', error);
        setAssigneeResourceRef('');
      }
      
      if (taskType === 'userTask') {
        // For UserTask, only show extensionElements content
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(`<root>${xmlContent}</root>`, 'text/xml');
          const extensionElements = doc.querySelector('extensionElements');
          
          if (extensionElements) {
            // Extract only the extensionElements content
            const serializer = new XMLSerializer();
            let extensionXml = serializer.serializeToString(extensionElements);
            const formatted = formatXML(extensionXml);
            setEditedXml(formatted);
          } else {
            // No extensionElements found, set empty
            setEditedXml('');
          }
        } catch (error) {
          console.error('Error parsing XML for UserTask:', error);
          setEditedXml('');
        }
      } else {
        // For other task types, show all content as before
        const formatted = formatXML(xmlContent);
        setEditedXml(formatted);
      }
      
      // Parse XML to populate properties ONLY ONCE when content loads
      parseXmlToProperties(xmlContent);
    } else {
      setEditedXml('');
      setAssigneeResourceRef('');
    }
  }, [xmlContent, elementType, selectedNode]);

  // Watch for changes in editedXml and update properties - REMOVED AUTO PARSING
  // useEffect(() => {
  //   if (editedXml && accordionOpen === 3) { 
  //     parseXmlToProperties(editedXml);
  //   }
  // }, [editedXml, accordionOpen]);

  const formatXML = (xml) => {
    if (!xml) return '';
    
    // Extract and preserve CDATA sections
    const cdataPlaceholders = [];
    let formatted = xml;
    
    // Find all CDATA sections and replace them with placeholders
    formatted = formatted.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (match, content) => {
      const placeholder = `__CDATA_PLACEHOLDER_${cdataPlaceholders.length}__`;
      cdataPlaceholders.push(content); // Preserve original content exactly
      return placeholder;
    });
    
    // Clean up the XML first - remove extra whitespace between tags
    formatted = formatted.replace(/>\s*</g, '><');
    
    // Add line breaks after each closing bracket
    formatted = formatted.replace(/></g, '>\n<');
    
    // Split into lines and format with proper indentation
    const lines = formatted.split('\n');
    let indentLevel = 0;
    let formattedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Handle closing tags - decrease indent before adding line
      if (line.startsWith('</')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      
      // Create indented line
      const indented = '  '.repeat(indentLevel) + line;
      formattedLines.push(indented);
      
      // Handle opening tags - increase indent after adding line
      if (line.startsWith('<') && 
          !line.startsWith('</') && 
          !line.endsWith('/>') && 
          !line.includes('</')) {
        indentLevel++;
      }
    }
    
    let result = formattedLines.join('\n');
    
    // Restore CDATA sections with original formatting
    cdataPlaceholders.forEach((originalContent, index) => {
      const placeholder = `__CDATA_PLACEHOLDER_${index}__`;
      result = result.replace(placeholder, `<![CDATA[${originalContent}]]>`);
    });
    
    return result;
  };

  const handleUpdate = () => {
    onUpdate(editedXml);
    onClose();
  };

  const handleCancel = () => {
    setEditedXml(xmlContent || '');
    // Reset assignee to original value
    if (xmlContent) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<root>${xmlContent}</root>`, 'text/xml');
        const potentialOwner = doc.querySelector('potentialOwner');
        
        if (potentialOwner) {
          const resourceRef = potentialOwner.querySelector('resourceRef');
          if (resourceRef) {
            setAssigneeResourceRef(resourceRef.textContent || '');
          } else {
            setAssigneeResourceRef('');
          }
        } else {
          setAssigneeResourceRef('');
        }
      } catch (error) {
        setAssigneeResourceRef('');
      }
    } else {
      setAssigneeResourceRef('');
    }
    onClose();
  };

  const handleSave = () => {
    console.log('🔥 XML EDITOR SAVE BUTTON CLICKED!');
    console.log('📝 Current editedXml:', editedXml);
    console.log('🎯 Selected Node:', selectedNode);
    console.log('🔗 Selected Edge:', selectedEdge);
    
    // SIMPLE RULE: Whatever is in the XML editor gets saved as finalXml
    let finalXml = editedXml;
    
    console.log('🔥 FINAL XML TO BE SAVED:', finalXml);
    
    // For gateway nodes, ALWAYS update the related sequence flows, not the gateway itself
    if (selectedNode && selectedNode.type && selectedNode.type.includes('gateway')) {
      console.log('🚪 GATEWAY DETECTED - Processing multiple flows');
      // Update all related edges
      const gatewayId = selectedNode.id;
      const relatedEdges = edges.filter(edge => 
        edge.source === gatewayId || edge.target === gatewayId
      );
      
      console.log('🔍 Related edges found:', relatedEdges.length);
      
      // Parse the XML content to extract individual sequence flows
      const parser = new DOMParser();
      const tempDoc = parser.parseFromString(`<root>${finalXml}</root>`, 'text/xml');
      const sequenceFlows = tempDoc.querySelectorAll('sequenceFlow');
      
      console.log('📋 Parsed sequence flows:', sequenceFlows.length);
      
      sequenceFlows.forEach(flow => {
        const flowId = flow.getAttribute('id');
        const relatedEdge = relatedEdges.find(edge => edge.id === flowId);
        console.log(`🔄 Processing flow ${flowId}, found edge:`, !!relatedEdge);
        
        if (relatedEdge) {
          // Extract nested elements
          const childNodes = flow.childNodes;
          let originalNestedElements = '';
          for (let i = 0; i < childNodes.length; i++) {
            const child = childNodes[i];
            if (child.nodeType === Node.ELEMENT_NODE) {
              originalNestedElements += child.outerHTML;
            }
          }
          
          console.log(`📦 Extracted nested elements for ${flowId}:`, originalNestedElements);
          
          // Update the edge with new XML
          const updatedEdge = {
            ...relatedEdge,
            label: flow.getAttribute('name') || '',
            data: {
              ...relatedEdge.data,
              originalNestedElements: originalNestedElements,
              originalXML: new XMLSerializer().serializeToString(flow)
            }
          };
          
          console.log(`🚀 CALLING onEdgeUpdate for ${flowId}`);
          onEdgeUpdate(updatedEdge);
        }
      });
    } else if (selectedEdge) {
      console.log('📄 SINGLE EDGE UPDATE');
            // Single edge update
      const updatedEdge = {
        ...selectedEdge,
        label: nodeData.name,
        data: {
          ...selectedEdge.data,
          label: nodeData.name,
          documentation: nodeData.documentation,
          versionTag: nodeData.versionTag,
          originalNestedElements: finalXml,
          originalXML: finalXml
        }
      };
      console.log('🚀 CALLING onEdgeUpdate for single edge');
      onEdgeUpdate(updatedEdge);
    } else if (selectedNode) {
      console.log('💾 SAVING NODE CHANGES...');
      // Update node (for non-gateway nodes)
      const updatedNode = {
        ...selectedNode,
        data: {
          ...selectedNode.data,
          label: nodeData?.name || selectedNode.data?.name,
          documentation: nodeData?.documentation || selectedNode.data?.documentation,
          versionTag: nodeData?.versionTag || selectedNode.data?.versionTag,
          backgroundColor: nodeData?.backgroundColor || selectedNode.data?.backgroundColor,
          borderColor: nodeData?.borderColor || selectedNode.data?.borderColor,
          originalNestedElements: finalXml,
          originalXML: finalXml
        },
        style: {
          ...selectedNode.style,
          backgroundColor: nodeData?.backgroundColor || selectedNode.style?.backgroundColor,
          borderColor: nodeData?.borderColor || selectedNode.style?.borderColor
        }
      };
      console.log('🚀 CALLING onNodeUpdate with finalXml:', finalXml);
      onNodeUpdate(updatedNode);
    }
    
    console.log('✅ XML EDITOR SAVE FUNCTION COMPLETED - finalXml saved to originalNestedElements:', finalXml);
    
    // Close the editor
    onClose();
  };

  const startDrag = (e) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);


  if (!isOpen) return null;

  // Accordion panel toggler
  const toggleAccordion = (idx) => setAccordionOpen(idx);

  // Code generator: call backend exactly like AgentPlayground
  const handleCgSubmit = async (e) => {
    e.preventDefault();
    if (!cgPrompt.trim()) return;
    setCgLoading(true);
    setCgResponse('');

    // Hardcode agent name based on task type
    let agentName = selected;
    const taskType = selectedNode?.data?.taskType || elementType;
    
    if (taskType === 'userTask') {
      agentName = 'JSX Component Generator';
    } else if (taskType === 'scriptTask') {
      agentName = 'Python Code Generator';
    } else if (taskType === 'serviceTask') {
      agentName = 'Python Code Generator';
    }

    try {
      const response = await agentRuntimeService.runAgentStream(
        {
          agent_name: agentName,
          prompt: cgPrompt,
          conv_id: `xmleditor_${Date.now()}`
        },
        token
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === 'agent_chunk' && event.payload?.content) {
                setCgResponse(prev => prev + event.payload.content);
              } else if (event.type === 'error' || event.error) {
                setCgResponse('Error: ' + (event.error || event.details?.message || 'Unknown error'));
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE event:', line, parseError);
            }
          }
        }
      }
    } catch (err) {
      setCgResponse('Error: ' + (err.message || err));
    } finally {
      setCgLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0,0,0,0.3)',
      zIndex: 9999
    }}>
      <div style={{
        position: 'absolute',
        left: position.x-200,
        top: position.y-100,
        width: '60vw',
        height: '70vh',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        boxShadow: '0 4px 20px var(--shadow)'
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          cursor: 'move',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '8px 8px 0 0'
        }} onMouseDown={startDrag}>
          <h3 style={{ 
            margin: 0, 
            color: 'var(--text-primary)',
            fontSize: '15px',
            fontWeight: '600'
          }}>Edit XML - {elementType}</h3>
          <button onClick={handleCancel} style={{
            background: 'none',
            border: 'none',
            fontSize: '20px',
            cursor: 'pointer',
            color: 'var(--text-secondary)'
          }}>×</button>
        </div>

        {/* Accordion */}
        <div style={{ padding: 0, height: 'calc(100% - 60px)', display: 'flex', flexDirection: 'column' }}>
          {/* Accordion headers */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
            <button
              onClick={() => toggleAccordion(0)}
              style={{
                flex: 1,
                background: accordionOpen === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: 'none',
                borderBottom: accordionOpen === 0 ? '2px solid var(--accent-color)' : 'none',
                padding: '10px',
                fontWeight: accordionOpen === 0 ? 'bold' : 'normal',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0'
              }}
            >XML Editor</button>
            <button
              onClick={() => toggleAccordion(1)}
              style={{
                flex: 1,
                background: accordionOpen === 1 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: 'none',
                borderBottom: accordionOpen === 1 ? '2px solid var(--accent-color)' : 'none',
                padding: '10px',
                fontWeight: accordionOpen === 1 ? 'bold' : 'normal',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0'
              }}
            >Code Generator</button>
            <button
              onClick={() => toggleAccordion(3)}
              style={{
                flex: 1,
                background: accordionOpen === 3 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: 'none',
                borderBottom: accordionOpen === 3 ? '2px solid var(--accent-color)' : 'none',
                padding: '10px',
                fontWeight: accordionOpen === 3 ? 'bold' : 'normal',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0'
              }}
            >XML Properties</button>
            {((selectedNode?.data?.taskType || elementType) === 'userTask' || (selectedNode?.data?.taskType || elementType) === 'manualTask') && (
              <button
                onClick={() => toggleAccordion(2)}
                style={{
                  flex: 1,
                  background: accordionOpen === 2 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderBottom: accordionOpen === 2 ? '2px solid var(--accent-color)' : 'none',
                  padding: '10px',
                  fontWeight: accordionOpen === 2 ? 'bold' : 'normal',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0'
                }}
              >Assignee</button>
            )}
          </div>

          {/* Accordion panels */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
            {accordionOpen === 0 && (
              <>
                <TextField
                  multiline
                  fullWidth
                  value={editedXml}
                  onChange={(e) => setEditedXml(e.target.value)}
                  placeholder={editedXml === '' ? "No XML content available. You can add custom XML elements here or use the Code Generator tab to create content." : "Enter XML content here..."}
                  sx={{
                    '& .MuiInputBase-input': {
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      height: '300px !important',
                      overflow: 'auto !important'
                    }
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1.5, justifyContent: 'flex-end' }}>
                  <Button onClick={handleCancel} variant="outlined">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} variant="contained">
                    SAVE CHANGES
                  </Button>
                </Box>
              </>
            )}
            {accordionOpen === 1 && (
              <form onSubmit={handleCgSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>
                  Agent: {selected || 'Python Code Generator'}
                </div>
                <TextField
                  label="Prompt"
                  variant="outlined"
                  fullWidth
                  value={cgPrompt}
                  onChange={e => setCgPrompt(e.target.value)}
                  placeholder="Enter prompt for code generation..."
                  disabled={cgLoading || !selected}
                  InputProps={{
                    endAdornment: (
                      <Button 
                        type="submit" 
                        variant="contained"
                        disabled={cgLoading || !selected}
                        size="small"
                        disableRipple
                        disableElevation
                        sx={{ 
                          position: 'absolute',
                          right: 8,
                          minWidth: 'auto',
                          fontSize: '12px'
                        }}
                      >
                        {cgLoading ? 'Generating...' : 'Generate'}
                      </Button>
                    )
                  }}
                  sx={{ 
                    mb: 1.25,
                    '& .MuiInputBase-input': {
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      paddingRight: '120px !important'
                    },
                    '& .MuiInputBase-root': {
                      position: 'relative'
                    }
                  }}
                />
                <TextField
                  label="Response"
                  variant="outlined"
                  multiline
                  fullWidth
                  value={cgResponse}
                  onChange={(e) => setCgResponse(e.target.value)}
                  placeholder="Code generation response will appear here..."
                  sx={{
                    '& .MuiInputBase-input': {
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      height: '200px !important',
                      overflow: 'auto !important'
                    }
                  }}
                />
                <Button 
                  onClick={() => {
                    console.log('🟡 [XML DEBUG] Update button clicked');
                    const parser = new DOMParser();
                    let doc;
                    try {
                      doc = parser.parseFromString(`<root>${editedXml}</root>`, 'text/xml');
                      console.log('🟢 [XML DEBUG] XML parsed');
                    } catch (e) {
                      console.error('🔴 [XML DEBUG] Error parsing XML:', e);
                      return;
                    }

                    let updated = false;
                    const taskType = selectedNode?.data?.taskType || elementType;
                    console.log('🔎 [XML DEBUG] Task type detected:', taskType);
                    console.log('🔎 [XML DEBUG] Selected agent:', selected);
                    
                    // 1. Try to update CDATASection node in any <script> element
                    const scripts = doc.querySelectorAll('script');
                    console.log('🟡 [XML DEBUG] Found', scripts.length, '<script> elements');
                    scripts.forEach((script, idx) => {
                      console.log(`🔍 [XML DEBUG] Processing <script> #${idx}, childNodes:`, script.childNodes.length);
                      
                      // Check if script already has CDATA
                      let hasCDATA = false;
                      for (let i = 0; i < script.childNodes.length; i++) {
                        const node = script.childNodes[i];
                        if (node.nodeType === 4) { // CDATASection
                          console.log(`🟢 [XML DEBUG] Found existing CDATA in <script> #${idx}, updating...`);
                          node.data = `\n${cgResponse}\n`;
                          updated = true;
                          hasCDATA = true;
                        }
                      }
                      
                      // If no CDATA found, add it
                      if (!hasCDATA) {
                        console.log(`🟡 [XML DEBUG] No CDATA in <script> #${idx}, adding new CDATA...`);
                        // Clear existing content first
                        script.textContent = '';
                        script.appendChild(doc.createCDATASection(`\n${cgResponse}\n`));
                        updated = true;
                      }
                    });

                    // 2. If no script elements found and task is meant for Python code, create proper script element
                    const isScriptTask = taskType === 'scriptTask' || (taskType === 'task' && selected === 'Python Code Generator');
                    if (!updated && isScriptTask && scripts.length === 0) {
                      console.log('🟡 [XML DEBUG] No script elements found for script-type task, creating script element');
                      const script = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'script');
                      script.setAttribute('xmlns', 'http://www.omg.org/spec/BPMN/20100524/MODEL');
                      script.appendChild(doc.createCDATASection(`\n${cgResponse}\n`));
                      doc.documentElement.appendChild(script);
                      updated = true;
                    }

                    // 2.5. If no updates and this is a userTask with no XML, create extensionElements structure
                    const isUserTask = taskType === 'userTask' || (taskType === 'task' && selected === 'JSX Component Generator');
                    if (!updated && isUserTask && doc.documentElement.children.length === 0) {
                      console.log('🟡 [XML DEBUG] No XML elements found for userTask, creating extensionElements structure');
                      
                      // Create extensionElements
                      const extensionElements = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'extensionElements');
                      extensionElements.setAttribute('xmlns', 'http://www.omg.org/spec/BPMN/20100524/MODEL');
                      
                      // Create formData
                      const formData = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'formData');
                      
                      // Create scriptData
                      const scriptData = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'scriptData');
                      
                      // Create script with CDATA
                      const script = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'script');
                      script.setAttribute('xmlns', 'http://www.omg.org/spec/BPMN/20100524/MODEL');
                      script.appendChild(doc.createCDATASection(`\n${cgResponse}\n`));
                      
                      // Assemble the structure
                      scriptData.appendChild(script);
                      formData.appendChild(scriptData);
                      extensionElements.appendChild(formData);
                      doc.documentElement.appendChild(extensionElements);
                      
                      updated = true;
                    }

                    // 3. If no CDATA was updated, try to update scriptData if formData exists  
                    if (!updated) {
                      let formData = doc.querySelector('formData');
                      if (formData) {
                        console.log('🟡 [XML DEBUG] formData found, updating/creating scriptData');
                        let scriptData = formData.querySelector('scriptData');
                        if (!scriptData) {
                          scriptData = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'scriptData');
                          formData.insertBefore(scriptData, formData.firstChild);
                        }
                        let script = scriptData.querySelector('script');
                        if (!script) {
                          script = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'script');
                          script.setAttribute('xmlns', 'http://www.omg.org/spec/BPMN/20100524/MODEL');
                          scriptData.appendChild(script);
                        }
                        // Clear existing content and add new CDATA
                        script.textContent = '';
                        // Remove any existing CDATA sections
                        for (let i = script.childNodes.length - 1; i >= 0; i--) {
                          const child = script.childNodes[i];
                          if (child.nodeType === 4) { // CDATASection
                            script.removeChild(child);
                          }
                        }
                        script.appendChild(doc.createCDATASection(`\n${cgResponse}\n`));
                        updated = true;
                      } else {
                        console.log('🟠 [XML DEBUG] No formData found, not updating scriptData');
                      }
                    }

                    if (!updated) {
                      console.log('🔴 [XML DEBUG] No updates made to XML');
                      return;
                    }

                    const serializer = new XMLSerializer();
                    let updatedXml = serializer.serializeToString(doc.documentElement);
                    updatedXml = updatedXml.replace('<root>', '').replace('</root>', '');
                    const formattedXml = formatXML(updatedXml);
                    setEditedXml(formattedXml);
                    setCgResponse('');
                    
                    // Parse the updated XML to sync with properties
                    parseXmlToProperties(formattedXml);
                    
                    setAccordionOpen(0);
                    console.log('✅ [XML DEBUG] XML updated and set in editor, response cleared');
                  }} 
                  variant="contained"
                  disabled={!cgResponse}
                  sx={{ mt: 1, fontSize: '12px', alignSelf: 'flex-end' }}
                >
                  Update XML with Generated Code
                </Button>
              </form>
            )}
            {accordionOpen === 2 && ((selectedNode?.data?.taskType || elementType) === 'userTask' || (selectedNode?.data?.taskType || elementType) === 'manualTask') && (
              <>
                <Typography variant="h6" gutterBottom sx={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 'bold' }}>
                  Task Assignee
                </Typography>
                {(() => {
                  try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(`<root>${xmlContent}</root>`, 'text/xml');
                    const potentialOwner = doc.querySelector('potentialOwner');
                    
                    if (potentialOwner) {
                      // Show inner XML of potentialOwner
                      let innerXML = '';
                      for (let i = 0; i < potentialOwner.childNodes.length; i++) {
                        const child = potentialOwner.childNodes[i];
                        if (child.nodeType === Node.ELEMENT_NODE) {
                          const serializer = new XMLSerializer();
                          innerXML += serializer.serializeToString(child);
                        }
                      }
                      const formattedInnerXML = formatXML(innerXML);
                      
                      return (
                        <>
                          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 2 }}>
                            Edit potentialOwner inner XML:
                          </Typography>
                          <TextField
                            multiline
                            fullWidth
                            value={editablePotentialOwnerXml}
                            onChange={(e) => setEditablePotentialOwnerXml(e.target.value)}
                            placeholder="Enter potentialOwner inner XML content..."
                            sx={{
                              '& .MuiInputBase-input': {
                                fontFamily: 'monospace',
                                fontSize: '13px',
                                height: '150px !important',
                                overflow: 'auto !important'
                              }
                            }}
                          />
                        </>
                      );
                    } else {
                      // No potentialOwner, show text field
                      return (
                        <>
                          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 2 }}>
                            Configure who this task is assigned to. This information will be saved as potentialOwner/resourceRef in the BPMN XML.
                          </Typography>
                          <TextField
                            label="Resource Reference"
                            variant="outlined"
                            fullWidth
                            value={assigneeResourceRef}
                            onChange={(e) => setAssigneeResourceRef(e.target.value)}
                            placeholder="e.g., User123, admin, etc."
                            sx={{
                              mb: 2,
                              '& .MuiInputBase-input': {
                                fontFamily: 'monospace',
                                fontSize: '13px'
                              }
                            }}
                          />
                          {assigneeResourceRef && (
                            <Box sx={{ 
                              mt: 2, 
                              p: 2, 
                              backgroundColor: 'var(--bg-secondary)', 
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)'
                            }}>
                              <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 1 }}>
                                Preview XML:
                              </Typography>
                              <pre style={{ 
                                margin: 0, 
                                color: 'var(--text-primary)', 
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap'
                              }}>
{`<potentialOwner>
  <resourceRef>${assigneeResourceRef}</resourceRef>
</potentialOwner>`}
                              </pre>
                            </Box>
                          )}
                        </>
                      );
                    }
                  } catch (error) {
                    return null;
                  }
                })()}
                <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
                  <Button onClick={handleCancel} variant="outlined">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} variant="contained">
                    SAVE CHANGES
                  </Button>
                </Box>
              </>
            )}
            {accordionOpen === 3 && (
              <>
                <Typography variant="h6" gutterBottom sx={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 'bold' }}>
                  XML Properties - {selectedNode?.data?.taskType || elementType}
                </Typography>
                
                {/* UserTask Properties */}
                {(selectedNode?.data?.taskType || elementType) === 'userTask' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Sub-accordion headers */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                      <button
                        onClick={() => setUserTaskAccordion(0)}
                        style={{
                          flex: 1,
                          background: userTaskAccordion === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          border: 'none',
                          borderBottom: userTaskAccordion === 0 ? '2px solid var(--accent-color)' : 'none',
                          padding: '8px',
                          fontWeight: userTaskAccordion === 0 ? 'bold' : 'normal',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >Form Data</button>
                      <button
                        onClick={() => setUserTaskAccordion(1)}
                        style={{
                          flex: 1,
                          background: userTaskAccordion === 1 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          border: 'none',
                          borderBottom: userTaskAccordion === 1 ? '2px solid var(--accent-color)' : 'none',
                          padding: '8px',
                          fontWeight: userTaskAccordion === 1 ? 'bold' : 'normal',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >Potential Owner</button>
                    </div>
                    
                    {/* Form Data Section */}
                    {userTaskAccordion === 0 && (
                      <div style={{ padding: '12px 0' }}>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 1 }}>
                          Form Fields:
                        </Typography>
                        {xmlProperties.userTask.formData.formFields.map((field, index) => (
                          <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <TextField
                              size="small"
                              label="ID"
                              value={field.id}
                              onChange={(e) => {
                                const newFields = [...xmlProperties.userTask.formData.formFields];
                                newFields[index].id = e.target.value;
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    formData: { ...prev.userTask.formData, formFields: newFields }
                                  }
                                }));
                                updateXmlFromProperties();
                              }}
                              sx={{ flex: 1 }}
                            />
                            <TextField
                              size="small"
                              label="Label"
                              value={field.label}
                              onChange={(e) => {
                                const newFields = [...xmlProperties.userTask.formData.formFields];
                                newFields[index].label = e.target.value;
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    formData: { ...prev.userTask.formData, formFields: newFields }
                                  }
                                }));
                                updateXmlFromProperties();
                              }}
                              sx={{ flex: 1 }}
                            />
                            <TextField
                              size="small"
                              select
                              label="Type"
                              value={field.type}
                              onChange={(e) => {
                                const newFields = [...xmlProperties.userTask.formData.formFields];
                                newFields[index].type = e.target.value;
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    formData: { ...prev.userTask.formData, formFields: newFields }
                                  }
                                }));
                                updateXmlFromProperties();
                              }}
                              SelectProps={{ native: true }}
                              sx={{ flex: 1 }}
                            >
                              <option value="string">String</option>
                              <option value="number">Number</option>
                              <option value="boolean">Boolean</option>
                            </TextField>
                            <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => {
                                  const newFields = [...xmlProperties.userTask.formData.formFields];
                                  newFields[index].required = e.target.checked;
                                  setXmlProperties(prev => ({
                                    ...prev,
                                    userTask: { 
                                      ...prev.userTask, 
                                      formData: { ...prev.userTask.formData, formFields: newFields }
                                    }
                                  }));
                                  updateXmlFromProperties();
                                }}
                                style={{ marginRight: '4px' }}
                              />
                              Required
                            </label>
                            <button
                              onClick={() => {
                                const newFields = xmlProperties.userTask.formData.formFields.filter((_, i) => i !== index);
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    formData: { ...prev.userTask.formData, formFields: newFields }
                                  }
                                }));
                                updateXmlFromProperties();
                              }}
                              style={{ background: 'red', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <Button
                          onClick={() => {
                            const newFields = [...xmlProperties.userTask.formData.formFields, { id: '', label: '', type: 'string', required: false }];
                            setXmlProperties(prev => ({
                              ...prev,
                              userTask: { 
                                ...prev.userTask, 
                                formData: { ...prev.userTask.formData, formFields: newFields }
                              }
                            }));
                            updateXmlFromProperties();
                          }}
                          variant="outlined"
                          size="small"
                        >
                          Add Field
                        </Button>
                        
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 2, mt: 2 }}>
                          JSX Code:
                        </Typography>
                        <TextField
                          multiline
                          fullWidth
                          label="React JSX Code"
                          value={xmlProperties.userTask.formData.jsxCode}
                          onChange={(e) => {
                            setXmlProperties(prev => ({
                              ...prev,
                              userTask: { 
                                ...prev.userTask, 
                                formData: { ...prev.userTask.formData, jsxCode: e.target.value }
                              }
                            }));
                            updateXmlFromProperties();
                          }}
                          sx={{
                            mb: 2,
                            '& .MuiInputBase-input': {
                              fontFamily: 'monospace',
                              fontSize: '13px',
                              height: '100px !important',
                              overflow: 'auto !important'
                            }
                          }}
                        />
                      </div>
                    )}
                    
                    {/* Potential Owner Section */}
                    {userTaskAccordion === 1 && (
                      <div style={{ padding: '12px 0' }}>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 1 }}>
                          Potential Owner Fields:
                        </Typography>
                        {xmlProperties.userTask.potentialOwner.fields.map((field, index) => (
                          <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <TextField
                              size="small"
                              label="Field Name"
                              value={field.name}
                              onChange={(e) => {
                                const newFields = [...xmlProperties.userTask.potentialOwner.fields];
                                newFields[index].name = e.target.value;
                                // Auto-update label to match field name
                                newFields[index].label = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1);
                                // Set appropriate input type based on field name
                                if (e.target.value === 'dueDate') {
                                  newFields[index].type = 'datetime-local';
                                } else if (e.target.value === 'userEmail') {
                                  newFields[index].type = 'email';
                                } else {
                                  newFields[index].type = 'text';
                                }
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    potentialOwner: { fields: newFields }
                                  }
                                }));
                                updateXmlFromProperties();
                              }}
                              sx={{ flex: 1 }}
                              placeholder="Enter field name"
                            />
                            <TextField
                              size="small"
                              label={field.label}
                              type={field.type}
                              value={field.value}
                              onChange={(e) => {
                                const newFields = [...xmlProperties.userTask.potentialOwner.fields];
                                newFields[index].value = e.target.value;
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    potentialOwner: { fields: newFields }
                                  }
                                }));
                                updateXmlFromProperties();
                              }}
                              sx={{ flex: 2 }}
                              InputLabelProps={field.type === 'datetime-local' ? { shrink: true } : {}}
                            />
                            <button
                              onClick={() => {
                                const newFields = xmlProperties.userTask.potentialOwner.fields.filter((_, i) => i !== index);
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    potentialOwner: { fields: newFields }
                                  }
                                }));
                                updateXmlFromProperties();
                              }}
                              style={{ background: 'red', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <Button
                          onClick={() => {
                            const newFields = [...xmlProperties.userTask.potentialOwner.fields, { name: 'dueDate', value: '', type: 'datetime-local', label: 'Due Date' }];
                            setXmlProperties(prev => ({
                              ...prev,
                              userTask: { 
                                ...prev.userTask, 
                                potentialOwner: { fields: newFields }
                              }
                            }));
                            updateXmlFromProperties();
                          }}
                          variant="outlined"
                          size="small"
                        >
                          Add Field
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* ServiceTask Properties */}
                {(selectedNode?.data?.taskType || elementType) === 'serviceTask' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <TextField
                      size="small"
                      label="Endpoint URL"
                      value={xmlProperties.serviceTask.endpoint}
                      onChange={(e) => setXmlProperties(prev => ({
                        ...prev,
                        serviceTask: { ...prev.serviceTask, endpoint: e.target.value }
                      }))}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      select
                      label="HTTP Method"
                      value={xmlProperties.serviceTask.method}
                      onChange={(e) => setXmlProperties(prev => ({
                        ...prev,
                        serviceTask: { ...prev.serviceTask, method: e.target.value }
                      }))}
                      SelectProps={{ native: true }}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                    </TextField>
                    <TextField
                      size="small"
                      label="Timeout (ms)"
                      type="number"
                      value={xmlProperties.serviceTask.timeout}
                      onChange={(e) => setXmlProperties(prev => ({
                        ...prev,
                        serviceTask: { ...prev.serviceTask, timeout: e.target.value }
                      }))}
                    />
                    <TextField
                      size="small"
                      label="Retry Count"
                      type="number"
                      value={xmlProperties.serviceTask.retryCount}
                      onChange={(e) => setXmlProperties(prev => ({
                        ...prev,
                        serviceTask: { ...prev.serviceTask, retryCount: e.target.value }
                      }))}
                    />
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      Headers:
                    </Typography>
                    {xmlProperties.serviceTask.headers.map((header, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <TextField
                          size="small"
                          label="Name"
                          value={header.name}
                          onChange={(e) => {
                            const newHeaders = [...xmlProperties.serviceTask.headers];
                            newHeaders[index].name = e.target.value;
                            setXmlProperties(prev => ({
                              ...prev,
                              serviceTask: { ...prev.serviceTask, headers: newHeaders }
                            }));
                          }}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          size="small"
                          label="Value"
                          value={header.value}
                          onChange={(e) => {
                            const newHeaders = [...xmlProperties.serviceTask.headers];
                            newHeaders[index].value = e.target.value;
                            setXmlProperties(prev => ({
                              ...prev,
                              serviceTask: { ...prev.serviceTask, headers: newHeaders }
                            }));
                          }}
                          sx={{ flex: 1 }}
                        />
                        <button
                          onClick={() => {
                            const newHeaders = xmlProperties.serviceTask.headers.filter((_, i) => i !== index);
                            setXmlProperties(prev => ({
                              ...prev,
                              serviceTask: { ...prev.serviceTask, headers: newHeaders }
                            }));
                          }}
                          style={{ background: 'red', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <Button
                      onClick={() => {
                        const newHeaders = [...xmlProperties.serviceTask.headers, { name: '', value: '' }];
                        setXmlProperties(prev => ({
                          ...prev,
                          serviceTask: { ...prev.serviceTask, headers: newHeaders }
                        }));
                      }}
                      variant="outlined"
                      size="small"
                    >
                      Add Header
                    </Button>
                  </div>
                )}

                {/* ScriptTask Properties */}
                {(selectedNode?.data?.taskType || elementType) === 'scriptTask' && (
                  <div>
                    <TextField
                      multiline
                      fullWidth
                      label="Script Code"
                      value={xmlProperties.scriptTask.scriptCode}
                      onChange={(e) => setXmlProperties(prev => ({
                        ...prev,
                        scriptTask: { ...prev.scriptTask, scriptCode: e.target.value }
                      }))}
                      sx={{
                        '& .MuiInputBase-input': {
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          height: '150px !important',
                          overflow: 'auto !important'
                        }
                      }}
                    />
                  </div>
                )}

                {/* Gateway Properties */}
                {(selectedNode?.type && selectedNode.type.includes('gateway')) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      Sequence Flow Conditions:
                    </Typography>
                    {xmlProperties.gateway.conditions.map((condition, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <TextField
                          size="small"
                          label="Flow ID"
                          value={condition.flowId}
                          onChange={(e) => {
                            const newConditions = [...xmlProperties.gateway.conditions];
                            newConditions[index].flowId = e.target.value;
                            setXmlProperties(prev => ({
                              ...prev,
                              gateway: { ...prev.gateway, conditions: newConditions }
                            }));
                            updateXmlFromProperties();
                          }}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          size="small"
                          label="Name"
                          value={condition.name}
                          onChange={(e) => {
                            const newConditions = [...xmlProperties.gateway.conditions];
                            newConditions[index].name = e.target.value;
                            setXmlProperties(prev => ({
                              ...prev,
                              gateway: { ...prev.gateway, conditions: newConditions }
                            }));
                            updateXmlFromProperties();
                          }}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          size="small"
                          label="Condition"
                          value={condition.condition}
                          onChange={(e) => {
                            const newConditions = [...xmlProperties.gateway.conditions];
                            newConditions[index].condition = e.target.value;
                            setXmlProperties(prev => ({
                              ...prev,
                              gateway: { ...prev.gateway, conditions: newConditions }
                            }));
                            updateXmlFromProperties();
                          }}
                          sx={{ flex: 2 }}
                        />
                        <button
                          onClick={() => {
                            const newConditions = xmlProperties.gateway.conditions.filter((_, i) => i !== index);
                            setXmlProperties(prev => ({
                              ...prev,
                              gateway: { ...prev.gateway, conditions: newConditions }
                            }));
                            updateXmlFromProperties();
                          }}
                          style={{ background: 'red', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <Button
                      onClick={() => {
                        const newConditions = [...xmlProperties.gateway.conditions, { flowId: '', condition: '', name: '' }];
                        setXmlProperties(prev => ({
                          ...prev,
                          gateway: { ...prev.gateway, conditions: newConditions }
                        }));
                        updateXmlFromProperties();
                      }}
                      variant="outlined"
                      size="small"
                    >
                      Add Condition
                    </Button>
                  </div>
                )}

                <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
                  <Button
                    onClick={() => {
                      // Generate XML from properties
                      let generatedXml = '';
                      const taskType = selectedNode?.data?.taskType || elementType;
                      
                      if (taskType === 'userTask') {
                        // Generate formData section
                        let formDataXml = `<extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <formData xmlns="http://example.org/form">
    <scriptData xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <script xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><![CDATA[
${xmlProperties.userTask.formData.jsxCode || '// JSX code will be generated here'}
]]></script>
    </scriptData>
${xmlProperties.userTask.formData.formFields.map(field => 
  field.id ? `    <formField id="${field.id}" label="${field.label}" type="${field.type}" required="${field.required}"/>` : ''
).filter(Boolean).join('\n')}
  </formData>
</extensionElements>`;

                        // Generate potentialOwner section if any values are set
                        let potentialOwnerXml = '';
                        const potentialOwnerFields = xmlProperties.userTask.potentialOwner.fields.filter(field => field.value.trim());
                        
                        if (potentialOwnerFields.length > 0) {
                          let potentialOwnerContent = `  <extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
${potentialOwnerFields.map(field => {
  if (field.name === 'dueDate') {
    return `    <dueDate>${field.value}Z</dueDate>`;
  } else if (field.name === 'userEmail') {
    return `    <userEmail>${field.value}</userEmail>`;
  } else {
    return `    <${field.name}>${field.value}</${field.name}>`;
  }
}).join('\n')}
  </extensionElements>`;
                          
                          potentialOwnerXml = `<potentialOwner>
${potentialOwnerContent}
</potentialOwner>`;
                        }

                        // Combine both sections
                        generatedXml = potentialOwnerXml ? `${formDataXml}\n${potentialOwnerXml}` : formDataXml;
                      } else if (taskType === 'serviceTask') {
                        generatedXml = `<extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <serviceConfiguration xmlns="http://example.org/service">
    <endpoint>${xmlProperties.serviceTask.endpoint}</endpoint>
    <method>${xmlProperties.serviceTask.method}</method>
    <timeout>${xmlProperties.serviceTask.timeout}</timeout>
    <retryCount>${xmlProperties.serviceTask.retryCount}</retryCount>
    <headers>
${xmlProperties.serviceTask.headers.map(header => 
  header.name ? `      <header name="${header.name}" value="${header.value}"/>` : ''
).filter(Boolean).join('\n')}
    </headers>
  </serviceConfiguration>
</extensionElements>`;
                      } else if (taskType === 'scriptTask') {
                        generatedXml = `<script xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><![CDATA[
${xmlProperties.scriptTask.scriptCode}
]]></script>`;
                      } else if (selectedNode?.type && selectedNode.type.includes('gateway')) {
                        generatedXml = xmlProperties.gateway.conditions.map(condition => 
                          condition.flowId ? `<sequenceFlow id="${condition.flowId}" sourceRef="${selectedNode.id}" targetRef="TARGET_REF" name="${condition.name}">
  <conditionExpression xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xsi:type="tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${condition.condition}</conditionExpression>
</sequenceFlow>` : ''
                        ).filter(Boolean).join('\n');
                      }
                      
                      setEditedXml(formatXML(generatedXml));
                      setAccordionOpen(0); // Switch to XML Editor tab
                    }}
                    variant="contained"
                    color="primary"
                  >
                    Generate XML
                  </Button>
                  <Button onClick={handleCancel} variant="outlined">
                    Cancel
                  </Button>
                  <Button onClick={handleSave} variant="contained">
                    SAVE CHANGES
                  </Button>
                </Box>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default XMLEditor;
