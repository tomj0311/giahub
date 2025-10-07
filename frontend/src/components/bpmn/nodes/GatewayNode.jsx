import React from 'react';
import { Handle, Position } from 'reactflow';
import './BPMNNodes.css';

const GatewayNode = ({ data }) => {
  // Create style object for colors
  const nodeStyle = {
    backgroundColor: data.backgroundColor || undefined,
    borderColor: data.borderColor || undefined,
    border: data.borderColor ? `2px solid ${data.borderColor}` : undefined
  };

  return (
    <div className="gateway-node">
      {/* INPUT SIDES - LEFT and TOP (target handles only) */}
      <Handle
        type="target"
        position={Position.Left}
        id="gateway-input-left"
        className="handle"
        style={{ left: '-8px', top: '50%' }}
        isConnectable={true}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="gateway-input-top"
        className="handle"
        style={{ top: '-8px', left: '50%' }}
        isConnectable={true}
      />
      
      {/* OUTPUT SIDES - RIGHT and BOTTOM (source handles only) */}
      <Handle
        type="source"
        position={Position.Right}
        id="gateway-output-right"
        className="handle"
        style={{ right: '-8px', top: '50%' }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="gateway-output-bottom"
        className="handle"
        style={{ bottom: '-8px', left: '50%' }}
        isConnectable={true}
      />
      
      {/* Additional output handles for multiple paths from gateway */}
      <Handle
        type="source"
        position={Position.Right}
        id="gateway-output-right-alt"
        className="handle"
        style={{ right: '-8px', top: '35%' }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="gateway-output-bottom-alt"
        className="handle"
        style={{ bottom: '-8px', left: '35%' }}
        isConnectable={true}
      />
      
      <div className="gateway-diamond" style={nodeStyle}>
        <span className="node-label">{data.label}</span>
      </div>
    </div>
  );
};

export default GatewayNode;
