import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const CallActivityNode = ({ data }) => {
  return (
    <div className="call-activity-node">
      <Handle
        type="target"
        position={Position.Left}
        id="call-activity-input"
        className="handle"
      />
      <div className="call-activity-content">
        <span className="node-label">{data.label}</span>
        <div className="call-activity-border"></div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="call-activity-output"
        className="handle"
      />
    </div>
  );
};

export default CallActivityNode;
