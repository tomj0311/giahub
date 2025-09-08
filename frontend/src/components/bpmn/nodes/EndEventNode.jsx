import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const EndEventNode = ({ data }) => {
  return (
    <div className="end-event-node">
      <Handle
        type="target"
        position={Position.Left}
        id="end-input"
        className="handle"
      />
      <div className="end-event-circle">
        <span className="node-label">{data.label}</span>
      </div>
    </div>
  );
};

export default EndEventNode;
