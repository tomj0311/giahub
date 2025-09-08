import React from 'react';
import './BPMNNodes.css';

const DataStoreNode = ({ data }) => {
  return (
    <div className="data-store-node">
      <div className="data-store-content">
        <div className="data-store-cylinder">
          <div className="data-store-top"></div>
          <div className="data-store-body"></div>
          <div className="data-store-bottom"></div>
        </div>
        <span className="node-label">{data.label}</span>
      </div>
    </div>
  );
};

export default DataStoreNode;
