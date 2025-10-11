import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const EndEventNode = ({ data }) => {
  // Create style object for colors
  const nodeStyle = {
    backgroundColor: data.backgroundColor || undefined,
    borderColor: data.borderColor || undefined,
    border: data.borderColor ? `2px solid ${data.borderColor}` : undefined
  };

  return (
    <div className="end-event-node">
      <Handle
        type="target"
        position={Position.Left}
        id="end-input"
        className="handle"
      />
      <div className="end-event-circle" style={nodeStyle}>
        <span className="node-label">{data.label}</span>
      </div>
    </div>
  );
};

export default EndEventNode;
