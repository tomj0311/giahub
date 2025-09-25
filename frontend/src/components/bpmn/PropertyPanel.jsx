import React, { useState, useEffect } from 'react';
import './PropertyPanel.css';import XMLEditor from './XMLEditor';

const PropertyPanel = ({ selectedNode, selectedEdge, onNodeUpdate, onEdgeUpdate, isOpen, onToggle, readOnly, edges }) => {
  const [activeSection, setActiveSection] = useState('general');
  const [nodeData, setNodeData] = useState({
    name: '',
    id: '',
    versionTag: '',
    documentation: '',
    backgroundColor: '',
    borderColor: ''
  });
  const [xmlContent, setXmlContent] = useState('');
  const [isXmlEditorOpen, setIsXmlEditorOpen] = useState(false);

  // Update local state when selected element changes
  useEffect(() => {
    if (selectedNode) {
      setNodeData({
        name: selectedNode.data.label || '',
        id: selectedNode.id || '',
        versionTag: selectedNode.data.versionTag || '',
        documentation: selectedNode.data.documentation || '',
        backgroundColor: selectedNode.style?.backgroundColor || selectedNode.data.backgroundColor || '',
        borderColor: selectedNode.style?.borderColor || selectedNode.data.borderColor || ''
      });
      setXmlContent(getInnerXMLContent());
    } else if (selectedEdge) {
      setNodeData({
        name: selectedEdge.data?.label || '',
        id: selectedEdge.id || '',
        versionTag: selectedEdge.data?.versionTag || '',
        documentation: selectedEdge.data?.documentation || '',
        backgroundColor: selectedEdge.style?.backgroundColor || selectedEdge.data?.backgroundColor || '',
        borderColor: selectedEdge.style?.borderColor || selectedEdge.data?.borderColor || ''
      });
      setXmlContent(getInnerXMLContent());
    } else {
      // Reset when nothing is selected
      setNodeData({
        name: '',
        id: '',
        versionTag: '',
        documentation: '',
        backgroundColor: '',
        borderColor: ''
      });
      setXmlContent('');
    }
  }, [selectedNode, selectedEdge]);

  const handleXmlChange = (value) => {
    setXmlContent(value);
    // Changes are now stored locally until Save button is clicked
  };

  const handleXmlUpdate = (updatedXml) => {
    setXmlContent(updatedXml);
    setIsXmlEditorOpen(false);
    // Auto-save when XML is updated from dialog
    if (selectedNode) {
      const updatedNode = {
        ...selectedNode,
        data: {
          ...selectedNode.data,
          originalNestedElements: updatedXml
        }
      };
      onNodeUpdate(updatedNode);
    } else if (selectedEdge) {
      const updatedEdge = {
        ...selectedEdge,
        data: {
          ...selectedEdge.data,
          originalNestedElements: updatedXml
        }
      };
      onEdgeUpdate(updatedEdge);
    }
  };

  const handleInputChange = (field, value) => {
    console.log('🎨 PropertyPanel - Color input changed:', field, '=', value);
    const updatedData = { ...nodeData, [field]: value };
    setNodeData(updatedData);
    console.log('🎨 PropertyPanel - Updated nodeData:', updatedData);
    
    // Auto-save color changes immediately (restore original behavior)
    if ((field === 'backgroundColor' || field === 'borderColor') && (selectedNode || selectedEdge)) {
      console.log('🎨 PropertyPanel - AUTO-SAVING color change for:', field);
      
      if (selectedNode) {
        const updatedNode = {
          ...selectedNode,
          data: {
            ...selectedNode.data,
            [field]: value
          },
          style: {
            ...selectedNode.style,
            [field]: value
          }
        };
        console.log('🎨 PropertyPanel - Auto-saving node color:', field, '=', value);
        onNodeUpdate(updatedNode);
      } else if (selectedEdge) {
        const updatedEdge = {
          ...selectedEdge,
          data: {
            ...selectedEdge.data,
            [field]: value
          },
          style: {
            ...selectedEdge.style,
            [field]: value
          }
        };
        console.log('🎨 PropertyPanel - Auto-saving edge color:', field, '=', value);
        onEdgeUpdate(updatedEdge);
      }
    }
    // Other changes are stored locally until Save button is clicked
  };

  const handleSave = () => {
    console.log('🔥 SAVE BUTTON CLICKED!');
    console.log('📝 Current xmlContent:', xmlContent);
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
      const tempDoc = parser.parseFromString(`<root>${xmlContent}</root>`, 'text/xml');
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
          originalNestedElements: xmlContent,
          originalXML: xmlContent
        }
      };
      console.log('🚀 CALLING onEdgeUpdate for single edge');
      onEdgeUpdate(updatedEdge);
    } else if (selectedNode) {
      console.log('💾 SAVING NODE CHANGES...');
      console.log('🎨 PropertyPanel - Saving colors - backgroundColor:', nodeData.backgroundColor, 'borderColor:', nodeData.borderColor);
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
          originalNestedElements: xmlContent
        },
        style: {
          ...selectedNode.style,
          backgroundColor: nodeData.backgroundColor || selectedNode.style?.backgroundColor,
          borderColor: nodeData.borderColor || selectedNode.style?.borderColor
        }
      };
      console.log('🎨 PropertyPanel - Updated node with colors:', updatedNode.data.backgroundColor, updatedNode.data.borderColor);
      console.log('🚀 CALLING onNodeUpdate');
      onNodeUpdate(updatedNode);
    }
    
    console.log('✅ SAVE FUNCTION COMPLETED');
  };

  const toggleSection = (section) => {
    setActiveSection(activeSection === section ? '' : section);
  };

  const getGatewaySequenceFlows = () => {
    if (!selectedNode || !edges) {
      return 'No gateway or edges data available';
    }

    const gatewayId = selectedNode.id;
    const relatedEdges = edges.filter(edge => 
      edge.source === gatewayId || edge.target === gatewayId
    );

    if (relatedEdges.length === 0) {
      return 'No sequence flows found for this gateway';
    }

    const sequenceFlowsXML = relatedEdges.map(edge => {

      // Check for originalNestedElements (from BPMNManager import)
      if (edge.data?.originalNestedElements) {
        const id = edge.id;
        const sourceRef = edge.source;
        const targetRef = edge.target;
        const name = edge.label || '';
        
        // Construct complete sequenceFlow XML
        let xml = `<sequenceFlow id="${id}" sourceRef="${sourceRef}" targetRef="${targetRef}"`;
        if (name) {
          xml += ` name="${name}"`;
        }
        xml += '>';
        
        if (edge.data.originalNestedElements) {
          xml += '\n  ' + edge.data.originalNestedElements;
        }
        
        xml += '\n</sequenceFlow>';
        return xml;
      }
      
      // Fallback to originalXML if available
      if (edge.data?.originalXML) {
        return edge.data.originalXML;
      }
      
      // Last resort: basic XML
      return `<sequenceFlow id="${edge.id}" sourceRef="${edge.source}" targetRef="${edge.target}" />`;
    });

    return sequenceFlowsXML.join('\n\n');
  };

  const getInnerXMLContent = () => {
    // Special handling for gateways - show related sequence flows
    if (selectedNode && selectedNode.type && selectedNode.type.includes('gateway')) {
      return getGatewaySequenceFlows();
    }
    
    // Look for XML content in multiple possible locations
    const xmlContent = selectedNode?.data?.originalNestedElements || 
                      selectedEdge?.data?.originalNestedElements ||
                      selectedNode?.data?.originalXML ||
                      selectedEdge?.data?.originalXML;
    
    console.log('🔍 PropertyPanel - selectedNode:', selectedNode);
    console.log('🔍 PropertyPanel - xmlContent:', xmlContent);
    
    if (!xmlContent) {
      return 'No XML data available - originalNestedElements not found in node data';
    }
    
    // If xmlContent is empty string, show message
    if (xmlContent === "") {
      return 'No inner elements found for this node';
    }
    
    // If it's already a string of XML elements, return it directly
    if (typeof xmlContent === 'string' && xmlContent.includes('<')) {
      return xmlContent;
    }
    
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      const rootElement = xmlDoc.documentElement;
      
      // Get all child elements and convert to string
      const children = Array.from(rootElement.children);
      if (children.length === 0) {
        return 'No inner elements found';
      }
      
      // Return the XML string of all child elements
      return children.map(child => {
        // Create a new serializer to get the full XML
        const serializer = new XMLSerializer();
        return serializer.serializeToString(child);
      }).join('\n');
      
    } catch (error) {
      return 'Error parsing XML: ' + error.message + '\n\nRaw content:\n' + xmlContent;
    }
  };

  const getElementType = () => {
    if (selectedNode) {
      const type = selectedNode.type;
      const typeNames = {
        startEvent: 'Start Event',
        endEvent: 'End Event',
        task: 'Task',
        serviceTask: 'Service Task',
        userTask: 'User Task',
        scriptTask: 'Script Task',
        businessRuleTask: 'Business Rule Task',
        sendTask: 'Send Task',
        receiveTask: 'Receive Task',
        manualTask: 'Manual Task',
        subProcess: 'Sub Process',
        callActivity: 'Call Activity',
        exclusiveGateway: 'Exclusive Gateway',
        inclusiveGateway: 'Inclusive Gateway',
        parallelGateway: 'Parallel Gateway',
        eventBasedGateway: 'Event Gateway',
        complexGateway: 'Complex Gateway',
        dataObject: 'Data Object',
        dataObjectReference: 'Data Object',
        dataStore: 'Data Store',
        dataStoreReference: 'Data Store',
        group: 'Group',
        textAnnotation: 'Text Annotation',
        participant: 'Participant',
        lane: 'Lane'
      };
      return typeNames[type] || type.charAt(0).toUpperCase() + type.slice(1);
    }
    if (selectedEdge) {
      return 'Sequence Flow';
    }
    return '';
  };

  return (
    <>
    <div className={`property-panel ${isOpen ? 'open' : ''}`}>
      <div className="property-panel-header">
        <h3>Properties</h3>
        <div className="header-buttons">
          {!readOnly && (selectedNode || selectedEdge) && (
            <button className="save-btn" onClick={handleSave}>
              Save
            </button>
          )}
          <button className="panel-toggle-btn" onClick={onToggle}>
            {isOpen ? '→' : '←'}
          </button>
        </div>
      </div>

      {(selectedNode || selectedEdge) && (
        <div className="property-panel-content">
          <div className="element-type">
            <span className="element-type-label">{getElementType()}</span>
          </div>

          {/* Edit XML Button - Main Property Panel */}
          {!readOnly && (
            <div className="xml-editor-section">
              <button 
                className="edit-xml-btn"
                onClick={() => setIsXmlEditorOpen(true)}
              >
                Edit Properties
              </button>
            </div>
          )}

          {/* General Section */}
          <div className="accordion-section">
            <div 
              className={`accordion-header ${activeSection === 'general' ? 'active' : ''}`}
              onClick={() => toggleSection('general')}
            >
              <span>General</span>
              <span className="accordion-icon">
                {activeSection === 'general' ? '▼' : '▶'}
              </span>
            </div>
            {activeSection === 'general' && (
              <div className="accordion-content">
                <div className="form-group">
                  <label htmlFor="element-name">Name</label>
                  <input
                    id="element-name"
                    type="text"
                    value={nodeData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Enter element name"
                    disabled={readOnly}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="element-id">ID</label>
                  <input
                    id="element-id"
                    type="text"
                    value={nodeData.id}
                    onChange={(e) => handleInputChange('id', e.target.value)}
                    placeholder="Element ID"
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="version-tag">Version Tag</label>
                  <input
                    id="version-tag"
                    type="text"
                    value={nodeData.versionTag}
                    onChange={(e) => handleInputChange('versionTag', e.target.value)}
                    placeholder="Enter version tag"
                    disabled={readOnly}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Colors Section */}
          <div className="accordion-section">
            <div 
              className={`accordion-header ${activeSection === 'colors' ? 'active' : ''}`}
              onClick={() => toggleSection('colors')}
            >
              <span>Colors</span>
              <span className="accordion-icon">
                {activeSection === 'colors' ? '▼' : '▶'}
              </span>
            </div>
            {activeSection === 'colors' && (
              <div className="accordion-content">
                <div className="form-group">
                  <label htmlFor="background-color">Background Color</label>
                  <div className="color-input-group">
                    <input
                      id="background-color"
                      type="color"
                      value={nodeData.backgroundColor || '#ffffff'}
                      onChange={(e) => handleInputChange('backgroundColor', e.target.value)}
                      disabled={readOnly}
                      className="color-picker"
                    />
                    <input
                      type="text"
                      value={nodeData.backgroundColor || ''}
                      onChange={(e) => handleInputChange('backgroundColor', e.target.value)}
                      placeholder="#ffffff"
                      disabled={readOnly}
                      className="color-text"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="border-color">Border Color</label>
                  <div className="color-input-group">
                    <input
                      id="border-color"
                      type="color"
                      value={nodeData.borderColor || '#000000'}
                      onChange={(e) => handleInputChange('borderColor', e.target.value)}
                      disabled={readOnly}
                      className="color-picker"
                    />
                    <input
                      type="text"
                      value={nodeData.borderColor || ''}
                      onChange={(e) => handleInputChange('borderColor', e.target.value)}
                      placeholder="#000000"
                      disabled={readOnly}
                      className="color-text"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Documentation Section */}
          <div className="accordion-section">
            <div 
              className={`accordion-header ${activeSection === 'documentation' ? 'active' : ''}`}
              onClick={() => toggleSection('documentation')}
            >
              <span>Documentation</span>
              <span className="accordion-icon">
                {activeSection === 'documentation' ? '▼' : '▶'}
              </span>
            </div>
            {activeSection === 'documentation' && (
              <div className="accordion-content">
                <div className="form-group">
                  <label htmlFor="element-documentation">Element Documentation</label>
                  <textarea
                    id="element-documentation"
                    value={nodeData.documentation}
                    onChange={(e) => handleInputChange('documentation', e.target.value)}
                    placeholder="Enter element documentation"
                    rows={6}
                    disabled={readOnly}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Attributes Section */}
          <div className="accordion-section">
            <div 
              className={`accordion-header ${activeSection === 'attributes' ? 'active' : ''}`}
              onClick={() => toggleSection('attributes')}
            >
              <span>Attributes</span>
              <span className="accordion-icon">
                {activeSection === 'attributes' ? '▼' : '▶'}
              </span>
            </div>
            {activeSection === 'attributes' && (
              <div className="accordion-content">
                <div className="form-group">
                  <label htmlFor="element-xml">Inner XML Elements</label>
                  <div className="xml-preview">
                    <pre>{xmlContent}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    
    {/* XMLEditor rendered outside the property panel container */}
    <XMLEditor
      isOpen={isXmlEditorOpen}
      onClose={() => setIsXmlEditorOpen(false)}
      xmlContent={xmlContent}
      onUpdate={handleXmlUpdate}
      elementType={selectedNode ? selectedNode.type : selectedEdge ? 'sequence flow' : 'element'}
      selectedNode={selectedNode}
      selectedEdge={selectedEdge}
      onNodeUpdate={onNodeUpdate}
      onEdgeUpdate={onEdgeUpdate}
      edges={edges}
      nodeData={nodeData}
    />
    </>
  );
};

export default PropertyPanel;
