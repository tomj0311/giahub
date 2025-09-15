import React, { useState, useEffect } from 'react';
import './PropertyPanel.css';

const PropertyPanel = ({ selectedNode, selectedEdge, onNodeUpdate, onEdgeUpdate, isOpen, onToggle, readOnly }) => {
  const [activeSection, setActiveSection] = useState('general');
  const [nodeData, setNodeData] = useState({
    name: '',
    id: '',
    versionTag: '',
    documentation: ''
  });
  const [xmlContent, setXmlContent] = useState('');

  // Update local state when selected element changes
  useEffect(() => {
    if (selectedNode) {
      setNodeData({
        name: selectedNode.data.label || '',
        id: selectedNode.id || '',
        versionTag: selectedNode.data.versionTag || '',
        documentation: selectedNode.data.documentation || ''
      });
      setXmlContent(getInnerXMLContent());
    } else if (selectedEdge) {
      setNodeData({
        name: selectedEdge.data?.label || '',
        id: selectedEdge.id || '',
        versionTag: selectedEdge.data?.versionTag || '',
        documentation: selectedEdge.data?.documentation || ''
      });
      setXmlContent(getInnerXMLContent());
    } else {
      // Reset when nothing is selected
      setNodeData({
        name: '',
        id: '',
        versionTag: '',
        documentation: ''
      });
      setXmlContent('');
    }
  }, [selectedNode, selectedEdge]);

  const handleXmlChange = (value) => {
    setXmlContent(value);
    
    // Update the selected element with new XML content - overwrite originalNestedElements
    if (selectedNode && onNodeUpdate) {
      const updatedNode = {
        ...selectedNode,
        data: {
          ...selectedNode.data,
          originalNestedElements: value
        }
      };
      onNodeUpdate(updatedNode);
    } else if (selectedEdge && onEdgeUpdate) {
      const updatedEdge = {
        ...selectedEdge,
        data: {
          ...selectedEdge.data,
          originalNestedElements: value
        }
      };
      onEdgeUpdate(updatedEdge);
    }
  };

  const handleInputChange = (field, value) => {
    const updatedData = { ...nodeData, [field]: value };
    setNodeData(updatedData);

    // Update the selected element immediately
    if (selectedNode && onNodeUpdate) {
      const updatedNode = {
        ...selectedNode,
        data: {
          ...selectedNode.data,
          label: field === 'name' ? value : selectedNode.data.label,
          [field]: value
        }
      };
      onNodeUpdate(updatedNode);
    } else if (selectedEdge && onEdgeUpdate) {
      const updatedEdge = {
        ...selectedEdge,
        data: {
          ...selectedEdge.data,
          label: field === 'name' ? value : selectedEdge.data?.label,
          [field]: value
        }
      };
      onEdgeUpdate(updatedEdge);
    }
  };

  const toggleSection = (section) => {
    setActiveSection(activeSection === section ? '' : section);
  };

  const getInnerXMLContent = () => {
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
    <div className={`property-panel ${isOpen ? 'open' : ''}`}>
      <div className="property-panel-header">
        <h3>Properties</h3>
        <button className="panel-toggle-btn" onClick={onToggle}>
          {isOpen ? '→' : '←'}
        </button>
      </div>

      {(selectedNode || selectedEdge) && (
        <div className="property-panel-content">
          <div className="element-type">
            <span className="element-type-label">{getElementType()}</span>
          </div>

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
                  <textarea
                    id="element-xml"
                    value={xmlContent}
                    onChange={(e) => handleXmlChange(e.target.value)}
                    rows={15}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    placeholder="Enter XML content here..."
                    disabled={readOnly}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyPanel;
