import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const SubProcessNode = ({ data }) => {
  return (
    <div className="subprocess-node">
      <Handle
        type="target"
        position={Position.Left}
        id="subprocess-input"
        className="handle"
      />
      <div className="subprocess-content">
        <div className="subprocess-header">
          <span className="node-label">{data.label}</span>
        </div>
        <div className="subprocess-indicator">⊞</div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="subprocess-output"
        className="handle"
      />
    </div>
  );
};

export default SubProcessNode;
