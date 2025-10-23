import React, { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions, useTheme, FormControl, InputLabel, Select, MenuItem, CircularProgress } from '@mui/material';
import { agentRuntimeService } from '../../services/agentRuntimeService';
import { apiCall } from '../../config/api';


import Editor from '@monaco-editor/react';

const XMLEditor = ({ isOpen, onClose, xmlContent, elementType, selectedNode, selectedEdge, onNodeUpdate, onEdgeUpdate, edges, nodeData }) => {
  const theme = useTheme();
  const [editedXml, setEditedXml] = useState('');
  const TAB_XML_PROPERTIES = 0;
  const TAB_CODE_GENERATOR = 1;
  const TAB_XML_EDITOR = 2;

  const [accordionOpen, setAccordionOpen] = useState(TAB_XML_PROPERTIES);
  // Code generator states
  const [cgPrompt, setCgPrompt] = useState('');
  const [cgResponse, setCgResponse] = useState('');
  const [cgLoading, setCgLoading] = useState(false);
  // XML Properties states
  const [xmlProperties, setXmlProperties] = useState({
    userTask: {
      formData: {
        formFields: [{ id: '', label: '', type: 'string', required: false }],
        jsxCode: ''
      },
      assignee: {
        fields: [{ name: 'dueDate', value: '', type: 'datetime-local', label: 'Due Date' }]
      }
    },
    serviceTask: {
      function: {
        moduleName: '',
        functionName: '',
        parameters: [{ name: '', value: '' }]
      }
    },
    scriptTask: {
      scriptCode: ''
    },
    gateway: {
      conditions: []
    }
  });
  // Sub-accordion state for UserTask sections
  const [userTaskAccordion, setUserTaskAccordion] = useState(0); // 0 = formData, 1 = assignee

  // Dynamic function states for serviceTask
  const [modules, setModules] = useState([]);
  const [functions, setFunctions] = useState({});
  const [functionDetails, setFunctionDetails] = useState(null);
  const [loadingModules, setLoadingModules] = useState(false);
  const [loadingFunctions, setLoadingFunctions] = useState(false);

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

      // Generate assignee section if any values are set
      let assigneeXml = '';
      const assigneeFields = xmlProperties.userTask.assignee.fields.filter(field => field.value.trim());
      
      if (assigneeFields.length > 0) {
        assigneeXml = `    <assignee>
${assigneeFields.map(field => {
  if (field.name === 'dueDate') {
    return `      <dueDate>${field.value}Z</dueDate>`;
  } else if (field.name === 'userEmail') {
    return `      <userEmail>${field.value}</userEmail>`;
  } else {
    return `      <${field.name}>${field.value}</${field.name}>`;
  }
}).join('\n')}
    </assignee>`;
      }

      // Combine formData and assignee within extensionElements
      const generatedXml = assigneeXml ? 
        formDataXml.replace('</extensionElements>', `${assigneeXml}\n</extensionElements>`) : 
        formDataXml;
      setEditedXml(formatXML(generatedXml));
    } else if (taskType === 'scriptTask') {
      // Generate script task XML
      const scriptXml = `<script xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><![CDATA[
${xmlProperties.scriptTask.scriptCode || '// Script code will be generated here'}
]]></script>`;
      setEditedXml(formatXML(scriptXml));
    } else if (selectedNode?.type && selectedNode.type.includes('gateway')) {
      // For gateways, MERGE the updated conditions with existing XML
      const parser = new DOMParser();
      const currentDoc = parser.parseFromString(`<root>${editedXml}</root>`, 'text/xml');
      const serializer = new XMLSerializer();
      
      // Create a map of all existing flows from the current XML
      const flowsMap = new Map();
      Array.from(currentDoc.querySelectorAll('sequenceFlow')).forEach(flow => {
        const flowId = flow.getAttribute('id');
        if (flowId) {
          flowsMap.set(flowId, flow);
        }
      });
      
      // Update only the flows that are in the properties panel
      const validConditions = xmlProperties.gateway.conditions.filter(condition =>
        condition.flowId?.trim()
      );
      
      validConditions.forEach(condition => {
        // Find the edge to get actual targetRef
        const relatedEdge = edges.find(edge => edge.id === condition.flowId);
        const targetRef = relatedEdge?.target || flowsMap.get(condition.flowId)?.getAttribute('targetRef') || 'TARGET_REF';
        
        // Only update if the edge exists or flow already exists in XML
        if (relatedEdge || flowsMap.has(condition.flowId)) {
          // Create updated flow element
          const flowDoc = parser.parseFromString('<root></root>', 'text/xml');
          const flowElement = flowDoc.createElement('sequenceFlow');
          flowElement.setAttribute('id', condition.flowId);
          flowElement.setAttribute('sourceRef', condition.sourceRef || selectedNode.id);
          flowElement.setAttribute('targetRef', targetRef);
          
          if (condition.name?.trim()) {
            flowElement.setAttribute('name', condition.name);
          }
          
          // Add condition expression if provided
          if (condition.condition?.trim()) {
            const condExpr = flowDoc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'conditionExpression');
            condExpr.setAttribute('xmlns', 'http://www.omg.org/spec/BPMN/20100524/MODEL');
            condExpr.setAttribute('xsi:type', 'tFormalExpression');
            condExpr.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
            condExpr.textContent = condition.condition;
            flowElement.appendChild(condExpr);
          }
          
          // Update the flow in the map
          flowsMap.set(condition.flowId, flowElement);
        }
      });
      
      // Serialize all flows back to XML
      const gatewayXml = Array.from(flowsMap.values())
        .map(flow => serializer.serializeToString(flow))
        .join('\n');
      
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
        
        // Parse assignee
        const assigneeFields = [];
        const assignee = doc.querySelector('assignee');
        console.log('🎯 Found assignee:', !!assignee);
        
        if (assignee) {
          console.log('🔢 assignee children count:', assignee.children.length);
          // Parse ALL child elements inside assignee
          for (let i = 0; i < assignee.children.length; i++) {
            const element = assignee.children[i];
            const tagName = element.tagName;
            const value = element.textContent;
            
            console.log(`🏷️ Found element: ${tagName} = ${value}`);
            
            // Set appropriate input type based on field name
            let inputType = 'text';
            let label = tagName;
            if (tagName === 'dueDate') {
              inputType = 'datetime-local';
              label = 'Due Date';
              // Remove the 'Z' suffix for datetime-local input
              const cleanValue = value.endsWith('Z') ? value.slice(0, -1) : value;
              assigneeFields.push({
                name: tagName,
                value: cleanValue,
                type: inputType,
                label: label
              });
            } else if (tagName === 'userEmail') {
              inputType = 'email';
              label = 'User Email';
              assigneeFields.push({
                name: tagName,
                value: value,
                type: inputType,
                label: label
              });
            } else {
              assigneeFields.push({
                name: tagName,
                value: value,
                type: inputType,
                label: tagName
              });
            }
          }
        }
        
        console.log('📋 Final assigneeFields:', assigneeFields);
        
        // Ensure at least one field exists
        if (assigneeFields.length === 0) {
          assigneeFields.push({ name: 'dueDate', value: '', type: 'datetime-local', label: 'Due Date' });
        }
        
        console.log('🔄 About to set state with fields:', assigneeFields);
        
        // Update state
        setXmlProperties(prev => ({
          ...prev,
          userTask: {
            formData: {
              formFields: formFields.length > 0 ? formFields : [{ id: '', label: '', type: 'string', required: false }],
              jsxCode: jsxCode
            },
            assignee: {
              fields: assigneeFields
            }
          }
        }));
      } else if (taskType === 'serviceTask' || taskType === 'callActivity') {
        // Parse serviceTask configuration
        const serviceConfig = doc.querySelector('serviceConfiguration');
        console.log('🔍 Found serviceConfiguration:', !!serviceConfig);
        
        if (serviceConfig) {
          // Only look for function configuration
          const functionElement = serviceConfig.querySelector('function');
          
          let serviceTaskConfig = {
            function: { moduleName: '', functionName: '', parameters: [{ name: '', value: '' }] }
          };
          
          if (functionElement) {
            console.log('⚙️ Found function configuration');
            const moduleName = functionElement.querySelector('moduleName')?.textContent?.trim() || '';
            const functionName = functionElement.querySelector('functionName')?.textContent?.trim() || '';
            
            // Parse parameters - look for <parameters> container with <parameter> children
            const parametersContainer = functionElement.querySelector('parameters');
            let parameters = [];
            
            if (parametersContainer) {
              parameters = Array.from(parametersContainer.querySelectorAll('parameter')).map(param => ({
                name: param.getAttribute('name') || '',
                value: param.getAttribute('value') || ''
              }));
            }
            
            serviceTaskConfig.function = {
              moduleName,
              functionName,
              parameters: parameters.length > 0 ? parameters : [{ name: '', value: '' }]
            };
            
            console.log('📝 Parsed function config:', serviceTaskConfig.function);
          }
          
          console.log('🔧 Setting serviceTask config:', serviceTaskConfig);
          
          // Update state
          setXmlProperties(prev => ({
            ...prev,
            serviceTask: serviceTaskConfig
          }));
        }
      } else if (taskType === 'scriptTask') {
        // Parse scriptTask - extract CDATA content from script element
        const scriptElement = doc.querySelector('script');
        let scriptCode = '';
        
        if (scriptElement) {
          console.log('🔍 Found script element for scriptTask');
          // Check for CDATA content
          for (let i = 0; i < scriptElement.childNodes.length; i++) {
            const node = scriptElement.childNodes[i];
            if (node.nodeType === 4) { // CDATASection
              scriptCode = node.data.trim();
              console.log('📝 Found CDATA script content:', scriptCode);
              break;
            }
          }
          // If no CDATA, try text content
          if (!scriptCode) {
            scriptCode = scriptElement.textContent?.trim() || '';
            console.log('📝 Found text script content:', scriptCode);
          }
        }
        
        // Update state
        setXmlProperties(prev => ({
          ...prev,
          scriptTask: { scriptCode: scriptCode }
        }));
      } else if (selectedNode?.type && selectedNode.type.includes('gateway')) {
        // Parse gateway sequence flows
        const sequenceFlows = Array.from(doc.querySelectorAll('sequenceFlow')).map(flow => {
          const sourceRef = flow.getAttribute('sourceRef') || '';
          const targetRef = flow.getAttribute('targetRef') || '';
          
          return {
            flowId: flow.getAttribute('id') || '',
            name: flow.getAttribute('name') || '',
            condition: flow.querySelector('conditionExpression')?.textContent?.trim() || '',
            sourceRef: sourceRef,
            targetRef: targetRef
          };
        }).filter(flow => {
          // Include flows that:
          // 1. Have sourceRef pointing to this gateway
          // 2. Have targetRef pointing to a different node (not back to gateway)
          // Note: We now include flows WITHOUT conditions so users can see and edit them
          return flow.sourceRef === selectedNode.id && 
                 flow.targetRef && 
                 flow.targetRef !== selectedNode.id;
        });
        
        // Update gateway properties
        setXmlProperties(prev => ({
          ...prev,
          gateway: {
            conditions: sequenceFlows
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
    } else if (taskType === 'manualTask') {
      agentName = 'JSX Component Generator'; // or could be JSX Component Generator depending on requirements
    } 
    
    setSelected(agentName);
  }, [elementType, selectedNode]);

  // Load modules when component mounts for serviceTask
  useEffect(() => {
    const taskType = selectedNode?.data?.taskType || elementType;
    if (taskType === 'serviceTask' || taskType === 'callActivity') {
      loadModules();
    }
  }, [elementType, selectedNode]);

  // Auto-select first module when modules are loaded
  useEffect(() => {
    if (modules.length > 0 && !xmlProperties.serviceTask.function.moduleName) {
      const firstModule = modules[0];
      setXmlProperties(prev => ({
        ...prev,
        serviceTask: {
          ...prev.serviceTask,
          function: {
            ...prev.serviceTask.function,
            moduleName: firstModule,
            functionName: '', // Reset function when module changes
            parameters: []
          }
        }
      }));
    }
  }, [modules, xmlProperties.serviceTask.function.moduleName]);

  // Load functions when module is selected
  useEffect(() => {
    if (xmlProperties.serviceTask.function.moduleName && modules.length > 0) {
      loadFunctions(xmlProperties.serviceTask.function.moduleName);
    }
  }, [xmlProperties.serviceTask.function.moduleName, modules]);

  // Auto-select first function when functions are loaded
  useEffect(() => {
    const functionNames = Object.keys(functions);
    if (functionNames.length > 0 && !xmlProperties.serviceTask.function.functionName) {
      const firstFunction = functionNames[0];
      setXmlProperties(prev => ({
        ...prev,
        serviceTask: {
          ...prev.serviceTask,
          function: {
            ...prev.serviceTask.function,
            functionName: firstFunction
          }
        }
      }));
    }
  }, [functions, xmlProperties.serviceTask.function.functionName]);

  // Load function details when function is selected
  useEffect(() => {
    if (xmlProperties.serviceTask.function.functionName && functions[xmlProperties.serviceTask.function.functionName]) {
      const funcDetails = functions[xmlProperties.serviceTask.function.functionName];
      setFunctionDetails(funcDetails);
      
      // Update parameters based on function signature ONLY if current parameters are empty or have default empty values
      if (funcDetails.parameters) {
        const currentParams = xmlProperties.serviceTask.function.parameters;
        // Check if parameters already have meaningful values (from XML parsing)
        const hasExistingValues = currentParams.length > 0 && 
          currentParams.some(param => param.name && param.value);
        
        // Only set default parameters if no existing values found
        if (!hasExistingValues) {
          const initialParams = [];
          Object.keys(funcDetails.parameters).forEach(paramName => {
            const defaultValue = funcDetails.parameters[paramName].default;
            // Only use default if it's not null, None, or 'null' string
            const finalValue = (defaultValue && defaultValue !== null && defaultValue !== 'null' && defaultValue !== 'None') ? defaultValue : '';
            initialParams.push({
              name: paramName,
              value: finalValue
            });
          });
          setXmlProperties(prev => ({
            ...prev,
            serviceTask: {
              ...prev.serviceTask,
              function: {
                ...prev.serviceTask.function,
                parameters: initialParams
              }
            }
          }));
        }
      }
    }
  }, [xmlProperties.serviceTask.function.functionName, functions]);

  const loadModules = async () => {
    setLoadingModules(true);
    try {
      const response = await apiCall('/api/dynamic/modules', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setModules(data.data);
      }
    } catch (err) {
      console.error('Error loading modules:', err);
    } finally {
      setLoadingModules(false);
    }
  };

  const loadFunctions = async (moduleName) => {
    setLoadingFunctions(true);
    try {
      const response = await apiCall(`/api/dynamic/modules/${moduleName}/functions`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.success) {
        setFunctions(data.data);
      }
    } catch (err) {
      console.error('Error loading functions:', err);
    } finally {
      setLoadingFunctions(false);
    }
  };

  useEffect(() => {
    console.log('🚀 XMLEditor useEffect triggered with xmlContent:', xmlContent);
    if (xmlContent && 
        !xmlContent.includes('No XML data available') && 
        !xmlContent.includes('originalNestedElements not found') &&
        !xmlContent.includes('No inner elements found')) {
      
      const taskType = selectedNode?.data?.taskType || elementType;
      console.log('🎯 Task type:', taskType);
      
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
    }
  }, [xmlContent, elementType, selectedNode]);

  // New useEffect to populate code editor with existing code when XML properties change or dialog opens
  useEffect(() => {
    const taskType = selectedNode?.data?.taskType || elementType;
    
    // Populate with existing code when dialog is open and we have existing code
    if (isOpen) {
      if (taskType === 'userTask' && xmlProperties.userTask.formData.jsxCode) {
        // Set existing JSX code in the code editor for userTask
        console.log('🔄 Populating code editor with existing JSX code:', xmlProperties.userTask.formData.jsxCode);
        setCgResponse(xmlProperties.userTask.formData.jsxCode);
      } else if (taskType === 'scriptTask' && xmlProperties.scriptTask.scriptCode) {
        // Set existing script code in the code editor for scriptTask
        console.log('🔄 Populating code editor with existing script code:', xmlProperties.scriptTask.scriptCode);
        setCgResponse(xmlProperties.scriptTask.scriptCode);
      }
    }
  }, [isOpen, xmlProperties.userTask.formData.jsxCode, xmlProperties.scriptTask.scriptCode, selectedNode, elementType]);

  // Clear code editor when dialog opens (but only clear prompt, not response if there's existing code)
  useEffect(() => {
    if (isOpen) {
      setCgPrompt('');
      // Only clear response if there's no existing code to show
      const taskType = selectedNode?.data?.taskType || elementType;
      const hasExistingCode = (taskType === 'userTask' && xmlProperties.userTask.formData.jsxCode) ||
                             (taskType === 'scriptTask' && xmlProperties.scriptTask.scriptCode);
      if (!hasExistingCode) {
        setCgResponse('');
      }
    }
  }, [isOpen, xmlProperties.userTask.formData.jsxCode, xmlProperties.scriptTask.scriptCode, selectedNode, elementType]);

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

  const handleSave = () => {
    console.log('🔥 XML EDITOR SAVE BUTTON CLICKED!');
    console.log('📝 Current editedXml:', editedXml);
    console.log('🎯 Selected Node:', selectedNode);
    console.log('🔗 Selected Edge:', selectedEdge);
    
    // ABSOLUTE RULE: Whatever is in the XML editor gets saved EXACTLY as is - NO MODIFICATIONS
    let finalXml = editedXml;
    
    console.log('🔥 FINAL XML TO BE SAVED EXACTLY AS IS:', finalXml);
    
    // For gateway nodes, update all sequence flows AND save to gateway node
    if (selectedNode && selectedNode.type && selectedNode.type.includes('gateway')) {
      const parser = new DOMParser();
      const tempDoc = parser.parseFromString(`<root>${finalXml}</root>`, 'text/xml');
      const sequenceFlows = tempDoc.querySelectorAll('sequenceFlow');
      
      console.log('🔍 Processing gateway sequence flows from XML Editor:', sequenceFlows.length);
      
      // Update existing edges with their conditions
      sequenceFlows.forEach(flow => {
        const flowId = flow.getAttribute('id');
        const flowName = flow.getAttribute('name') || '';
        const sourceRef = flow.getAttribute('sourceRef') || '';
        const targetRef = flow.getAttribute('targetRef') || '';
        
        console.log(`🔍 Checking flow: ${flowId}, source: ${sourceRef}, target: ${targetRef}`);
        
        // Find the related edge
        const relatedEdge = edges.find(edge => edge.id === flowId);
        
        if (relatedEdge) {
          // Validate: only update if sourceRef is this gateway and targetRef is different
          if (sourceRef !== selectedNode.id) {
            console.log(`⚠️ Skipping flow ${flowId}: sourceRef ${sourceRef} doesn't match gateway ${selectedNode.id}`);
            return;
          }
          
          if (!targetRef || targetRef === selectedNode.id) {
            console.log(`⚠️ Skipping flow ${flowId}: invalid targetRef ${targetRef}`);
            return;
          }
          
          console.log(`✅ Updating edge ${flowId} with condition`);
          const serializer = new XMLSerializer();
          let originalNestedElements = '';
          Array.from(flow.children).forEach(child => {
            originalNestedElements += serializer.serializeToString(child);
          });
          
          const updatedEdge = {
            ...relatedEdge,
            label: flowName,
            data: {
              ...relatedEdge.data,
              originalNestedElements: originalNestedElements,
              originalXML: serializer.serializeToString(flow)
            }
          };
          
          onEdgeUpdate(updatedEdge);
        } else {
          console.log(`ℹ️ Edge ${flowId} not found in edges array - may be a new condition or incoming flow`);
        }
      });
      
      // IMPORTANT: Save the complete XML from the editor to the gateway node
      // This preserves ALL sequence flows (incoming, outgoing with/without conditions)
      const updatedNode = {
        ...selectedNode,
        data: {
          ...selectedNode.data,
          label: nodeData?.name || selectedNode.data?.name,
          documentation: nodeData?.documentation || selectedNode.data?.documentation,
          versionTag: nodeData?.versionTag || selectedNode.data?.versionTag,
          backgroundColor: nodeData?.backgroundColor || selectedNode.data?.backgroundColor,
          borderColor: nodeData?.borderColor || selectedNode.data?.borderColor,
          originalNestedElements: finalXml,  // Save EXACT XML from editor - preserves all flows
          originalXML: finalXml
        },
        style: {
          ...selectedNode.style,
          backgroundColor: nodeData?.backgroundColor || selectedNode.style?.backgroundColor,
          borderColor: nodeData?.borderColor || selectedNode.style?.borderColor
        }
      };
      console.log('🚀 CALLING onNodeUpdate for gateway with complete XML (preserves all flows):', finalXml);
      onNodeUpdate(updatedNode);
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
          originalNestedElements: finalXml,  // EXACT XML from editor
          originalXML: finalXml              // EXACT XML from editor
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
          originalNestedElements: finalXml,  // EXACT XML from editor - NO PROCESSING
          originalXML: finalXml              // EXACT XML from editor - NO PROCESSING
        },
        style: {
          ...selectedNode.style,
          backgroundColor: nodeData?.backgroundColor || selectedNode.style?.backgroundColor,
          borderColor: nodeData?.borderColor || selectedNode.style?.borderColor
        }
      };
      console.log('🚀 CALLING onNodeUpdate with EXACT finalXml from editor:', finalXml);
      onNodeUpdate(updatedNode);
    }
    
    console.log('✅ XML EDITOR SAVE COMPLETED - EXACT XML from editor saved to originalNestedElements:', finalXml);
    
    // Close the editor
    onClose();
  };

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

    // Prepare the prompt with existing code if available
    let fullPrompt = cgPrompt;
    let existingCode = '';
    
    if (taskType === 'userTask' && xmlProperties.userTask.formData.jsxCode) {
      existingCode = xmlProperties.userTask.formData.jsxCode;
    } else if (taskType === 'scriptTask' && xmlProperties.scriptTask.scriptCode) {
      existingCode = xmlProperties.scriptTask.scriptCode;
    }
    
    if (existingCode.trim()) {
      fullPrompt = `${cgPrompt}\n\n# Based on current code:\n${existingCode} ouput new modified code.`;
    }

    try {
      const response = await agentRuntimeService.runAgentStream(
        {
          agent_name: agentName,
          prompt: fullPrompt,
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
    <Dialog open={isOpen} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>Edit XML - {elementType}</DialogTitle>
      <DialogContent>
        <Box sx={{ height: '80vh', display: 'flex', flexDirection: 'column' }}>
          {/* Accordion headers */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            {/* Hide XML Properties tab for scriptTask */}
            {(selectedNode?.data?.taskType !== 'scriptTask' && elementType !== 'scriptTask') && (
              <button
                onClick={() => {
                  console.log('XML PROPERTIES BUTTON CLICKED');
                  console.log('Current tab:', accordionOpen, 'Switching to:', TAB_XML_PROPERTIES);
                  toggleAccordion(TAB_XML_PROPERTIES);
                }}
                style={{
                  flex: 1,
                  background: accordionOpen === TAB_XML_PROPERTIES ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderBottom: accordionOpen === TAB_XML_PROPERTIES ? `2px solid ${theme.palette.primary.main}` : 'none',
                  padding: '10px',
                  fontWeight: accordionOpen === TAB_XML_PROPERTIES ? 'bold' : 'normal',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0'
                }}
              >XML Properties</button>
            )}
            {/* Only show Code Generator for userTask, scriptTask, and manualTask */}
            {((selectedNode?.data?.taskType === 'userTask' || selectedNode?.data?.taskType === 'scriptTask' || selectedNode?.data?.taskType === 'manualTask') || 
              (elementType === 'userTask' || elementType === 'scriptTask' || elementType === 'manualTask')) && (
              <button
                onClick={() => {
                  console.log('CODE GENERATOR BUTTON CLICKED');
                  console.log('Current tab:', accordionOpen, 'Switching to:', TAB_CODE_GENERATOR);
                  toggleAccordion(TAB_CODE_GENERATOR);
                }}
                style={{
                  flex: 1,
                  background: accordionOpen === TAB_CODE_GENERATOR ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderBottom: accordionOpen === TAB_CODE_GENERATOR ? `2px solid ${theme.palette.primary.main}` : 'none',
                  padding: '10px',
                  fontWeight: accordionOpen === TAB_CODE_GENERATOR ? 'bold' : 'normal',
                  cursor: 'pointer',
                  borderRadius: '8px 8px 0 0'
                }}
              >Code Generator</button>
            )}
            <button
              onClick={() => {
                console.log('XML EDITOR BUTTON CLICKED');
                console.log('Current tab:', accordionOpen, 'Switching to:', TAB_XML_EDITOR);
                toggleAccordion(TAB_XML_EDITOR);
              }}
              style={{
                flex: 1,
                background: accordionOpen === TAB_XML_EDITOR ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: 'none',
                borderBottom: accordionOpen === TAB_XML_EDITOR ? `2px solid ${theme.palette.primary.main}` : 'none',
                padding: '10px',
                fontWeight: accordionOpen === TAB_XML_EDITOR ? 'bold' : 'normal',
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0'
              }}
            >XML Editor</button>
          </div>

          {/* Accordion panels */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px', minHeight: 0 }}>
            {accordionOpen === TAB_XML_EDITOR && (
              <div style={{ height: 'calc(100% - 20px)', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                <Editor
                  height="100%"
                  defaultLanguage="xml"
                  value={editedXml}
                  onChange={(value) => {
                    setEditedXml(value || '');
                    // Parse XML changes back to properties for gateways
                    if (selectedNode?.type && selectedNode.type.includes('gateway') && value?.trim()) {
                      parseXmlToProperties(value);
                    }
                  }}
                  theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    formatOnPaste: true,
                    formatOnType: true
                  }}
                />
              </div>
            )}
            {/* Only show Code Generator content for userTask, scriptTask, and manualTask */}
            {accordionOpen === TAB_CODE_GENERATOR && 
             ((selectedNode?.data?.taskType === 'userTask' || selectedNode?.data?.taskType === 'scriptTask' || selectedNode?.data?.taskType === 'manualTask') || 
              (elementType === 'userTask' || elementType === 'scriptTask' || elementType === 'manualTask')) && (
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
                <div style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '4px', marginBottom: '8px', minHeight: '200px' }}>
                  <Editor
                    height="100%"
                    defaultLanguage={
                      (selectedNode?.data?.taskType === 'userTask' || elementType === 'userTask') ? 'javascript' : 'python'
                    }
                    value={cgResponse}
                    onChange={(value) => {
                      setCgResponse(value || '');
                      // Also sync with XML properties for scriptTask
                      const taskType = selectedNode?.data?.taskType || elementType;
                      if (taskType === 'scriptTask') {
                        setXmlProperties(prev => ({
                          ...prev,
                          scriptTask: { ...prev.scriptTask, scriptCode: value || '' }
                        }));
                      } else if (taskType === 'userTask') {
                        setXmlProperties(prev => ({
                          ...prev,
                          userTask: { 
                            ...prev.userTask, 
                            formData: { 
                              ...prev.userTask.formData, 
                              jsxCode: value || '' 
                            }
                          }
                        }));
                      }
                    }}
                    theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                      readOnly: false
                    }}
                  />
                </div>
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
                    
                    setAccordionOpen(TAB_XML_EDITOR);
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
            {accordionOpen === TAB_XML_PROPERTIES && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" gutterBottom sx={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 'bold', flexShrink: 0 }}>
                  XML Properties - {selectedNode?.data?.taskType || elementType}
                </Typography>
                
                {/* UserTask Properties */}
                {(selectedNode?.data?.taskType || elementType) === 'userTask' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                    {/* Sub-accordion headers */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                      <button
                        onClick={() => setUserTaskAccordion(0)}
                        style={{
                          flex: 1,
                          background: userTaskAccordion === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          border: 'none',
                          borderBottom: userTaskAccordion === 0 ? `2px solid ${theme.palette.primary.main}` : 'none',
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
                          borderBottom: userTaskAccordion === 1 ? `2px solid ${theme.palette.primary.main}` : 'none',
                          padding: '8px',
                          fontWeight: userTaskAccordion === 1 ? 'bold' : 'normal',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >Assignee</button>
                    </div>
                    
                    {/* Form Data Section */}
                    {userTaskAccordion === 0 && (
                      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 1, flexShrink: 0 }}>
                          Form Fields:
                        </Typography>
                        <div style={{ flexShrink: 0 }}>
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
                              <option value="datetime">DateTime</option>
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
                        </div>
                      </div>
                    )}
                    
                    {/* Assignee Section */}
                    {userTaskAccordion === 1 && (
                      <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 1, flexShrink: 0 }}>
                          Assignee Fields:
                        </Typography>
                        <div style={{ flex: 1, overflow: 'auto' }}>
                        {xmlProperties.userTask.assignee.fields.map((field, index) => (
                          <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <TextField
                              size="small"
                              label="Field Name"
                              value={field.name}
                              onChange={(e) => {
                                const newFields = [...xmlProperties.userTask.assignee.fields];
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
                                    assignee: { fields: newFields }
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
                                const newFields = [...xmlProperties.userTask.assignee.fields];
                                newFields[index].value = e.target.value;
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    assignee: { fields: newFields }
                                  }
                                }));
                                updateXmlFromProperties();
                              }}
                              sx={{ flex: 2 }}
                              InputLabelProps={field.type === 'datetime-local' ? { shrink: true } : {}}
                            />
                            <button
                              onClick={() => {
                                const newFields = xmlProperties.userTask.assignee.fields.filter((_, i) => i !== index);
                                setXmlProperties(prev => ({
                                  ...prev,
                                  userTask: { 
                                    ...prev.userTask, 
                                    assignee: { fields: newFields }
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
                            const newFields = [...xmlProperties.userTask.assignee.fields, { name: 'dueDate', value: '', type: 'datetime-local', label: 'Due Date' }];
                            setXmlProperties(prev => ({
                              ...prev,
                              userTask: { 
                                ...prev.userTask, 
                                assignee: { fields: newFields }
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
                      </div>
                    )}
                  </div>
                )}

                {/* ServiceTask and CallActivity Properties */}
                {((selectedNode?.data?.taskType || elementType) === 'serviceTask' || (selectedNode?.data?.taskType || elementType) === 'callActivity') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
                    {/* Module and Function Selection in one line */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Module</InputLabel>
                          <Select
                            value={xmlProperties.serviceTask.function.moduleName}
                            onChange={(e) => {
                              console.log('📦 Module dropdown changed:', e.target.value);
                              setXmlProperties(prev => ({
                                ...prev,
                                serviceTask: { 
                                  ...prev.serviceTask, 
                                  function: { 
                                    ...prev.serviceTask.function, 
                                    moduleName: e.target.value,
                                    functionName: '', // Reset function when module changes
                                    parameters: []
                                  }
                                }
                              }));
                            }}
                            label="Module"
                            disabled={loadingModules}
                          >
                            {modules.map((module) => (
                              <MenuItem key={module} value={module}>
                                {module}
                              </MenuItem>
                            ))}
                          </Select>
                          {loadingModules && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                              <CircularProgress size={16} />
                            </Box>
                          )}
                        </FormControl>
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Function</InputLabel>
                          <Select
                            value={xmlProperties.serviceTask.function.functionName}
                            onChange={(e) => {
                              console.log('⚙️ Function dropdown changed:', e.target.value);
                              setXmlProperties(prev => ({
                                ...prev,
                                serviceTask: { 
                                  ...prev.serviceTask, 
                                  function: { 
                                    ...prev.serviceTask.function, 
                                    functionName: e.target.value,
                                    parameters: [] // Clear parameters when function changes
                                  }
                                }
                              }));
                            }}
                            label="Function"
                            disabled={!xmlProperties.serviceTask.function.moduleName || loadingFunctions}
                          >
                            {Object.keys(functions).map((funcName) => (
                              <MenuItem key={funcName} value={funcName}>
                                {funcName}
                              </MenuItem>
                            ))}
                          </Select>
                          {loadingFunctions && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                              <CircularProgress size={16} />
                            </Box>
                          )}
                        </FormControl>
                      </div>
                    </div>

                    {/* Function Documentation */}
                    {functionDetails && functionDetails.docstring && (
                      <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '11px', fontStyle: 'italic', p: 1, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
                        {functionDetails.docstring}
                      </Typography>
                    )}

                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      Parameters:
                    </Typography>
                    {xmlProperties.serviceTask.function.parameters.map((param, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <TextField
                          size="small"
                          label="Name"
                          value={param.name}
                          onChange={(e) => {
                            const newParams = [...xmlProperties.serviceTask.function.parameters];
                            newParams[index].name = e.target.value;
                            setXmlProperties(prev => ({
                              ...prev,
                              serviceTask: { 
                                ...prev.serviceTask, 
                                function: { ...prev.serviceTask.function, parameters: newParams }
                              }
                            }));
                          }}
                          sx={{ flex: 1 }}
                          helperText="Name of the variable"
                          FormHelperTextProps={{
                            sx: { fontSize: '10px', color: 'var(--text-secondary)', mt: 0.5 }
                          }}
                        />
                        <TextField
                          size="small"
                          label={functionDetails && functionDetails.parameters && functionDetails.parameters[param.name] ? 
                            `Value - ${functionDetails.parameters[param.name].type.replace('<class \'', '').replace('\'>', '')}${functionDetails.parameters[param.name].required ? ' (required)' : ' (optional)'}` : 
                            'Value'}
                          value={param.value}
                          onChange={(e) => {
                            const newParams = [...xmlProperties.serviceTask.function.parameters];
                            newParams[index].value = e.target.value;
                            setXmlProperties(prev => ({
                              ...prev,
                              serviceTask: { 
                                ...prev.serviceTask, 
                                function: { ...prev.serviceTask.function, parameters: newParams }
                              }
                            }));
                          }}
                          sx={{ flex: 1 }}
                          helperText="Default value - can be overwritten if variable exists in the code"
                          FormHelperTextProps={{
                            sx: { fontSize: '10px', color: 'var(--text-secondary)', mt: 0.5 }
                          }}
                        />
                        <button
                          onClick={() => {
                            const newParams = xmlProperties.serviceTask.function.parameters.filter((_, i) => i !== index);
                            setXmlProperties(prev => ({
                              ...prev,
                              serviceTask: { 
                                ...prev.serviceTask, 
                                function: { ...prev.serviceTask.function, parameters: newParams }
                              }
                            }));
                          }}
                          style={{ background: 'red', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                          disabled={functionDetails && functionDetails.parameters} // Disable if auto-generated
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {(!functionDetails || !functionDetails.parameters) && (
                      <Button
                        onClick={() => {
                          const newParams = [...xmlProperties.serviceTask.function.parameters, { name: '', value: '' }];
                          setXmlProperties(prev => ({
                            ...prev,
                            serviceTask: { 
                              ...prev.serviceTask, 
                              function: { ...prev.serviceTask.function, parameters: newParams }
                            }
                          }));
                        }}
                        variant="outlined"
                        size="small"
                      >
                        Add Parameter
                      </Button>
                    )}
                  </div>
                )}

                {/* ScriptTask Properties */}
                {(selectedNode?.data?.taskType || elementType) === 'scriptTask' && (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px', mb: 1, flexShrink: 0 }}>
                      Script Code:
                    </Typography>
                    <div style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '4px', minHeight: '200px' }}>
                      <Editor
                        height="100%"
                        defaultLanguage="python"
                        value={xmlProperties.scriptTask.scriptCode}
                        onChange={(value) => {
                          setXmlProperties(prev => ({
                            ...prev,
                            scriptTask: { ...prev.scriptTask, scriptCode: value || '' }
                          }));
                          // Also update the code generator editor
                          setCgResponse(value || '');
                          // Update XML when script code changes
                          const updatedXml = `<script xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><![CDATA[
${value || ''}
]]></script>`;
                          setEditedXml(formatXML(updatedXml));
                        }}
                        theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false,
                          wordWrap: 'on',
                          automaticLayout: true
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Gateway Properties */}
                {(selectedNode?.type && selectedNode.type.includes('gateway')) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      Sequence Flow Conditions:
                    </Typography>
                    {xmlProperties.gateway.conditions.length === 0 ? (
                      <Typography variant="body2" sx={{ color: 'var(--text-secondary)', opacity: 0.7, fontSize: '12px', fontStyle: 'italic' }}>
                        No sequence flows detected in this gateway's XML.
                      </Typography>
                    ) : (
                      xmlProperties.gateway.conditions.map((condition, index) => (
                        <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <TextField
                            size="small"
                            label="Flow ID"
                            value={condition.flowId}
                            InputProps={{
                              readOnly: true,
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
                        </div>
                      ))
                    )}
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

                        // Generate assignee section if any values are set
                        let assigneeXml = '';
                        const assigneeFields = xmlProperties.userTask.assignee.fields.filter(field => field.value.trim());
                        
                        if (assigneeFields.length > 0) {
                          assigneeXml = `    <assignee>
${assigneeFields.map(field => {
  if (field.name === 'dueDate') {
    return `      <dueDate>${field.value}Z</dueDate>`;
  } else if (field.name === 'userEmail') {
    return `      <userEmail>${field.value}</userEmail>`;
  } else {
    return `      <${field.name}>${field.value}</${field.name}>`;
  }
}).join('\n')}
    </assignee>`;
                        }

                        // Combine formData and assignee within extensionElements
                        generatedXml = assigneeXml ? 
                          formDataXml.replace('</extensionElements>', `${assigneeXml}\n</extensionElements>`) : 
                          formDataXml;
                      } else if (taskType === 'serviceTask' || taskType === 'callActivity') {
                        // Only function configuration is supported
                        const configXml = `    <function>
      <moduleName>${xmlProperties.serviceTask.function.moduleName}</moduleName>
      <functionName>${xmlProperties.serviceTask.function.functionName}</functionName>
      <parameters>
${xmlProperties.serviceTask.function.parameters.map(param => 
  param.name ? `        <parameter name="${param.name}" value="${param.value}"/>` : ''
).filter(Boolean).join('\n')}
      </parameters>
    </function>`;
                        
                        generatedXml = `<extensionElements xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <serviceConfiguration xmlns="http://example.org/service">
${configXml}
  </serviceConfiguration>
</extensionElements>`;
                      } else if (taskType === 'scriptTask') {
                        generatedXml = `<script xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><![CDATA[
${xmlProperties.scriptTask.scriptCode}
]]></script>`;
                      } else if (selectedNode?.type && selectedNode.type.includes('gateway')) {
                        // For gateways, MERGE the updated conditions with existing XML
                        const parser = new DOMParser();
                        const currentDoc = parser.parseFromString(`<root>${editedXml}</root>`, 'text/xml');
                        const serializer = new XMLSerializer();
                        
                        // Create a map of all existing flows from the XML editor
                        const flowsMap = new Map();
                        Array.from(currentDoc.querySelectorAll('sequenceFlow')).forEach(flow => {
                          const flowId = flow.getAttribute('id');
                          flowsMap.set(flowId, flow);
                        });
                        
                        // Update only the flows that are in the properties panel
                        const validConditions = xmlProperties.gateway.conditions.filter(condition =>
                          condition.flowId?.trim()
                        );
                        
                        validConditions.forEach(condition => {
                          // Find the edge to get actual targetRef
                          const relatedEdge = edges.find(edge => edge.id === condition.flowId);
                          const targetRef = relatedEdge?.target || 'TARGET_REF';
                          
                          // Create updated flow element
                          const flowDoc = parser.parseFromString('<root></root>', 'text/xml');
                          const flowElement = flowDoc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'sequenceFlow');
                          flowElement.setAttribute('id', condition.flowId);
                          flowElement.setAttribute('sourceRef', selectedNode.id);
                          flowElement.setAttribute('targetRef', targetRef);
                          
                          if (condition.name?.trim()) {
                            flowElement.setAttribute('name', condition.name);
                          }
                          
                          // Add condition expression if provided
                          if (condition.condition?.trim()) {
                            const condExpr = flowDoc.createElementNS('http://www.omg.org/spec/BPMN/20100524/MODEL', 'conditionExpression');
                            condExpr.setAttribute('xmlns', 'http://www.omg.org/spec/BPMN/20100524/MODEL');
                            condExpr.setAttribute('xsi:type', 'tFormalExpression');
                            condExpr.setAttribute('xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance');
                            condExpr.textContent = condition.condition;
                            flowElement.appendChild(condExpr);
                          }
                          
                          // Update the flow in the map
                          flowsMap.set(condition.flowId, flowElement);
                        });
                        
                        // Serialize all flows back to XML
                        generatedXml = Array.from(flowsMap.values())
                          .map(flow => serializer.serializeToString(flow))
                          .join('\n');
                      }
                      
                      setEditedXml(formatXML(generatedXml));
                      setAccordionOpen(TAB_XML_EDITOR); // Switch to XML Editor tab
                    }}
                    variant="contained"
                    color="primary"
                  >
                    Update
                  </Button>
                </Box>
              </div>
            )}
          </div>
          
          {/* Action buttons at the bottom */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, p: 2, borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
            <Button onClick={onClose} variant="outlined">Cancel</Button>
            <Button onClick={handleSave} variant="contained">Save</Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default XMLEditor;
