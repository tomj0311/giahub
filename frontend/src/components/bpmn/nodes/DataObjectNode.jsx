import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const DataObjectNode = ({ data }) => {
  return (
    <div className="data-object-node">
      <div className="data-object-content">
        <div className="data-object-icon">📄</div>
        <span className="node-label">{data.label}</span>
      </div>
    </div>
  );
};

export default DataObjectNode;
