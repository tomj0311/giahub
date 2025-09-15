import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const StartEventNode = ({ data }) => {
  // Create style object for colors
  const nodeStyle = {
    backgroundColor: data.backgroundColor || undefined,
    borderColor: data.borderColor || undefined,
    border: data.borderColor ? `2px solid ${data.borderColor}` : undefined
  };

  return (
    <div className="start-event-node">
      <div className="start-event-circle" style={nodeStyle}>
        <span className="node-label">{data.label}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="start-output"
        className="handle"
      />
    </div>
  );
};

export default StartEventNode;
