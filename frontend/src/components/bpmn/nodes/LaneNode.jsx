import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const LaneNode = ({ data, style }) => {
  const width = style?.width || 350;
  const height = style?.height || 120;
  
  return (
    <div 
      className="lane-node"
      style={{ 
        width: `${width}px`, 
        height: `${height}px`,
        minWidth: `${width}px`,
        minHeight: `${height}px`
      }}
    >
      <div className="lane-header">
        <span className="lane-label">{data.label}</span>
      </div>
      <div className="lane-body" style={{ 
        width: `${width - 40}px`, 
        height: `${height - 20}px` 
      }}>
        {/* Content area for lane elements - managed by React Flow */}
      </div>
    </div>
  );
};

export default LaneNode;
