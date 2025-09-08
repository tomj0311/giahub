import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const StartEventNode = ({ data }) => {
  return (
    <div className="start-event-node">
      <div className="start-event-circle">
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
