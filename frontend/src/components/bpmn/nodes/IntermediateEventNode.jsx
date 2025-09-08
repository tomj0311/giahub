import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const IntermediateEventNode = ({ data }) => {
  return (
    <div className="intermediate-event-node">
      <Handle
        type="target"
        position={Position.Left}
        id="intermediate-input"
        className="handle"
      />
      <div className="intermediate-event-circle">
        <div className="event-icon">{data.icon || '⚡'}</div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="intermediate-output"
        className="handle"
      />
      <div className="node-label-below">{data.label}</div>
    </div>
  );
};

export default IntermediateEventNode;
