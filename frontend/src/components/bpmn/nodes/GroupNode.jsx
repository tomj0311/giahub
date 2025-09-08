import React from 'react';
import './BPMNNodes.css';

const GroupNode = ({ data }) => {
  return (
    <div className="group-node">
      <div className="group-content">
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
