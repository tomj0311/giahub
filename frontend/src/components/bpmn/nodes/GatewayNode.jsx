import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const GatewayNode = ({ data }) => {
  return (
    <div className="gateway-node">
      {/* Original handles for backward compatibility */}
      <Handle
        type="target"
        position={Position.Left}
        id="gateway-input"
        className="handle"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="gateway-input-top"
        className="handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="gateway-output"
        className="handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="gateway-output-bottom"
        className="handle"
      />
      
      {/* Additional handles for more connection flexibility */}
      <Handle
        type="source"
        position={Position.Left}
        id="gateway-left-source"
        className="handle"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="gateway-right-target"
        className="handle"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="gateway-top-source"
        className="handle"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="gateway-bottom-target"
        className="handle"
      />
      
      <div className="gateway-diamond">
        <span className="node-label">{data.label}</span>
      </div>
    </div>
  );
};

export default GatewayNode;
