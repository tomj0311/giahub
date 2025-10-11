import React from 'react';
import { getBezierPath } from 'reactflow';

const SmartMessageFlowEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data = {},
  markerEnd,
}) => {
  // Apply Y offset if specified
  const offsetY = data.offsetY || 0;
  const adjustedTargetY = targetY + offsetY;
  const adjustedSourceY = sourceY + offsetY;
  
  // Create bezier path with offset
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY: adjustedSourceY,
    sourcePosition,
    targetX,
    targetY: adjustedTargetY,
    targetPosition,
  });

  return (
    <>
      <path
        id={id}
        style={{
          ...style
        }}
        className="react-flow__edge-path message-flow"
        d={edgePath}
        markerEnd={markerEnd}
      />
    </>
  );
};

export default SmartMessageFlowEdge;
