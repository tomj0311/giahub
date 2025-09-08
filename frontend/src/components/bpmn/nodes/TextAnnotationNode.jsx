import React from 'react';
import './BPMNNodes.css';

const TextAnnotationNode = ({ data }) => {
  return (
    <div className="text-annotation-node">
      <div className="text-annotation-content">
        <div className="text-annotation-bracket">[</div>
        <div className="text-annotation-text">
          <span className="node-label">{data.label}</span>
        </div>
      </div>
    </div>
  );
};

export default TextAnnotationNode;
