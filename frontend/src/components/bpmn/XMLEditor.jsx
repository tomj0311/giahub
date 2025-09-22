import React, { useState, useEffect } from 'react';

const XMLEditor = ({ isOpen, onClose, xmlContent, onUpdate, elementType, selectedNode, selectedEdge, onNodeUpdate, onEdgeUpdate, edges, nodeData }) => {
  const [editedXml, setEditedXml] = useState('');
  const [position, setPosition] = useState({ x: window.innerWidth * 0.25, y: window.innerHeight * 0.2 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

        <div style={{ 
          padding: '16px', 
          height: 'calc(100% - 60px)', 
          display: 'flex', 
          flexDirection: 'column' 
        }}>
          <textarea
            value={editedXml}
            onChange={(e) => setEditedXml(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              fontFamily: 'monospace',
              fontSize: '13px',
              border: '1px solid var(--border-color)',
              padding: '12px',
              resize: 'none',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              borderRadius: '4px'
            }}
            placeholder="Enter XML content here..."
          />
          
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            marginTop: '12px', 
            justifyContent: 'flex-end' 
          }}>
            <button onClick={handleCancel} style={{
              padding: '8px 16px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              borderRadius: '4px'
            }}>Cancel</button>
            <button onClick={handleSave} style={{
              padding: '8px 16px',
              background: 'var(--accent-color)',
              color: 'var(--bg-primary)',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px'
            }}>
              SAVE CHANGES
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default XMLEditor;
