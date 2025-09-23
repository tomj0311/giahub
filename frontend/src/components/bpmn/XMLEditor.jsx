import React, { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography } from '@mui/material';
import { agentRuntimeService } from '../../services/agentRuntimeService';
import sharedApiService from '../../utils/apiService';


const XMLEditor = ({ isOpen, onClose, xmlContent, onUpdate, elementType, selectedNode, selectedEdge, onNodeUpdate, onEdgeUpdate, edges, nodeData }) => {
  const [editedXml, setEditedXml] = useState('');
  const [position, setPosition] = useState({ x: window.innerWidth * 0.25, y: window.innerHeight * 0.2 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  // Accordion state: 0 = XML Editor, 1 = Code Generator
  const [accordionOpen, setAccordionOpen] = useState(0);
  // Code generator states
  const [cgPrompt, setCgPrompt] = useState('');
  const [cgResponse, setCgResponse] = useState('');
  const [cgLoading, setCgLoading] = useState(false);
  // Agent loading exactly like AgentPlayground
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const token = localStorage.getItem('token') || '';

  // Load agents exactly like AgentPlayground
  useEffect(() => {
    const loadAgents = async () => {
      setLoading(true);
      try {
        const result = await sharedApiService.makeRequest(
          '/api/agents',
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          { endpoint: 'agents', token: token?.substring(0, 10) }
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to load agents');
        }
        
        const agents = result.data.agents || [];
        const groupedByCat = agents.reduce((acc, a) => {
          const cat = a.category || '_root';
          acc[cat] = acc[cat] || [];
          acc[cat].push(a.name);
          return acc;
        }, {});
        Object.keys(groupedByCat).forEach(k => groupedByCat[k].sort());
        setGrouped(groupedByCat);
        
        // Auto-select first agent
        if (agents.length > 0) {
          setSelected(agents[0].name);
        }
      } catch (e) {
        console.error('Failed to load agents', e);
      } finally {
        setLoading(false);
      }
    };
    loadAgents();
  }, [token]);

  useEffect(() => {
    const formatted = xmlContent ? formatXML(xmlContent) : '';
    setEditedXml(formatted);
  }, [xmlContent]);

  const formatXML = (xml) => {
    if (!xml) return '';
    
    // Clean up the XML first
    let formatted = xml.replace(/>\s*</g, '><');
    
    // Add line breaks
    formatted = formatted.replace(/></g, '>\n<');
    
    // Split into lines and format
    const lines = formatted.split('\n');
    let indentLevel = 0;
    
    return lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      
      // Handle closing tags
      if (trimmed.startsWith('</')) {
        indentLevel--;
      }
      
      // Create indented line
      const indented = '  '.repeat(Math.max(0, indentLevel)) + trimmed;
      
      // Handle opening tags (not self-closing)
      if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
        indentLevel++;
      }
      
      return indented;
    }).join('\n');
  };

  const handleUpdate = () => {
    onUpdate(editedXml);
    onClose();
  };

  const handleCancel = () => {
    setEditedXml(xmlContent || '');
    onClose();
  };

  const handleSave = () => {
    console.log('� XML EDITOR SAVE BUTTON CLICKED!');
    console.log('�📝 Current editedXml:', editedXml);
    console.log('🎯 Selected Node:', selectedNode);
    console.log('🔗 Selected Edge:', selectedEdge);
    
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
      const tempDoc = parser.parseFromString(`<root>${editedXml}</root>`, 'text/xml');
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
          originalNestedElements: editedXml,
          originalXML: editedXml
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
          label: nodeData.name,
          documentation: nodeData.documentation,
          versionTag: nodeData.versionTag,
          backgroundColor: nodeData.backgroundColor,
          borderColor: nodeData.borderColor,
          originalNestedElements: editedXml
        },
        style: {
          ...selectedNode.style,
          backgroundColor: nodeData.backgroundColor || selectedNode.style?.backgroundColor,
          borderColor: nodeData.borderColor || selectedNode.style?.borderColor
        }
      };
      console.log('🚀 CALLING onNodeUpdate');
      onNodeUpdate(updatedNode);
    }
    
    console.log('✅ XML EDITOR SAVE FUNCTION COMPLETED');
    
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
    if (!selected || !cgPrompt.trim()) return;
    setCgLoading(true);
    setCgResponse('');
    
    try {
      const response = await agentRuntimeService.runAgentStream(
        {
          agent_name: selected,
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
        left: position.x,
        top: position.y,
        width: '50vw',
        height: '60vh',
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
                  placeholder="Enter XML content here..."
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
                  Agent: {loading ? 'Loading...' : (selected || 'No agents available')}
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
                        sx={{ 
                          position: 'absolute',
                          top: '50%',
                          right: 8,
                          transform: 'translateY(-50%)',
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
                    // Parse existing XML and add formData extension elements
                    const parser = new DOMParser();
                    let doc;
                    
                    if (editedXml.trim()) {
                      try {
                        doc = parser.parseFromString(editedXml, 'text/xml');
                      } catch (e) {
                        doc = parser.parseFromString(`<root>${editedXml}</root>`, 'text/xml');
                      }
                    } else {
                      doc = parser.parseFromString('<root></root>', 'text/xml');
                    }
                    
                    // Create or find extensionElements
                    let extensionElements = doc.querySelector('extensionElements');
                    if (!extensionElements) {
                      extensionElements = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'extensionElements');
                      doc.documentElement.appendChild(extensionElements);
                    }
                    
                    // Add formMetadata with script containing cgResponse
                    const formMetadata = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'formMetadata');
                    formMetadata.setAttribute('formId', 'userInfoForm');
                    formMetadata.setAttribute('version', '1.0');
                    formMetadata.setAttribute('display', 'inline');
                    
                    const script = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'script');
                    script.appendChild(doc.createCDATASection(cgResponse));
                    formMetadata.appendChild(script);
                    
                    // Add formData
                    const formData = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'formData');
                    const formField = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'formField');
                    formField.setAttribute('id', 'review_comments');
                    formField.setAttribute('label', 'Review Comments');
                    formField.setAttribute('type', 'string');
                    formData.appendChild(formField);
                    
                    // Add fromCode
                    const fromCode = doc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'fromCode');
                    
                    extensionElements.appendChild(formMetadata);
                    extensionElements.appendChild(formData);
                    extensionElements.appendChild(fromCode);
                    
                    // Update the XML
                    const serializer = new XMLSerializer();
                    const updatedXml = serializer.serializeToString(doc);
                    setEditedXml(updatedXml);
                    setAccordionOpen(0);
                  }} 
                  variant="contained"
                  disabled={!cgResponse}
                  sx={{ mt: 1, fontSize: '12px', alignSelf: 'flex-end' }}
                >
                  Update XML with FormData
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default XMLEditor;
