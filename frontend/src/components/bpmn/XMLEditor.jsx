import React, { useState, useEffect } from 'react';

const XMLEditor = ({ isOpen, onClose, xmlContent, onUpdate, elementType }) => {
  const [editedXml, setEditedXml] = useState('');
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setEditedXml(xmlContent || '');
  }, [xmlContent]);

  const handleUpdate = () => {
    onUpdate(editedXml);
    onClose();
  };

  const handleCancel = () => {
    setEditedXml(xmlContent || '');
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
            <button onClick={handleUpdate} style={{
              padding: '8px 16px',
              background: 'var(--accent-color)',
              color: 'var(--bg-primary)',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '4px'
            }}>Update</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default XMLEditor;
