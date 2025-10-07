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
      {/* LEFT SIDE - Both source and target */}
      <Handle
        type="target"
        position={Position.Left}
        id="gateway-input"
        className="handle"
        style={{ left: '-8px', top: '45%' }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="gateway-left-source"
        className="handle"
        style={{ left: '-8px', top: '55%' }}
        isConnectable={true}
      />
      
      {/* TOP SIDE - Both source and target */}
      <Handle
        type="target"
        position={Position.Top}
        id="gateway-input-top"
        className="handle"
        style={{ top: '-8px', left: '45%' }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Top}
        id="gateway-top-source"
        className="handle"
        style={{ top: '-8px', left: '55%' }}
        isConnectable={true}
      />
      
      {/* RIGHT SIDE - Both source and target */}
      <Handle
        type="target"
        position={Position.Right}
        id="gateway-right-target"
        className="handle"
        style={{ right: '-8px', top: '45%' }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="gateway-output"
        className="handle"
        style={{ right: '-8px', top: '55%' }}
        isConnectable={true}
      />
      
      {/* BOTTOM SIDE - Both source and target */}
      <Handle
        type="target"
        position={Position.Bottom}
        id="gateway-bottom-target"
        className="handle"
        style={{ bottom: '-8px', left: '45%' }}
        isConnectable={true}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="gateway-output-bottom"
        className="handle"
        style={{ bottom: '-8px', left: '55%' }}
        isConnectable={true}
      />
      
      <div className="gateway-diamond" style={nodeStyle}>
        <span className="node-label">{data.label}</span>
      </div>
    </div>
  );
};

export default GatewayNode;
