import React from 'react';
import { NodeResizer } from 'reactflow';
import './BPMNNodes.css';

const GroupNode = ({ data, style, selected }) => {
  // Use dynamic width and height from style if available, with reasonable defaults
  const width = style?.width || data?.groupBounds?.width || 300;
  const height = style?.height || data?.groupBounds?.height || 200;
  
  return (
    <div 
      className="group-node"
      style={{ 
        width: `${width}px`, 
        height: `${height}px`,
        minWidth: `${Math.min(width, 200)}px`,
        minHeight: `${Math.min(height, 150)}px`
      }}
    >
      <NodeResizer
        color="#9333ea"
        isVisible={selected}
        minWidth={200}
        minHeight={150}
      />
      <div className="group-content" style={{ 
        width: '100%', 
        height: '100%' 
      }}>
        <div className="group-header">
          <span className="node-label">{data.label}</span>
        </div>
        <div className="group-body">
          {/* Group content area for containing other elements */}
        </div>
      </div>
    </div>
  );
};

export default GroupNode;
