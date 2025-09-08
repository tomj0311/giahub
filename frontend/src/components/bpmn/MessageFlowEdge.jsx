import { getSmoothStepPath, getMarkerEnd } from 'reactflow';

export default function MessageFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}) {
  const offset = data?.offset || 0;
  const isMessageFlow = data?.isMessageFlow || false;
  
  let path;
  
  if (isMessageFlow && offset !== 0) {
    // Create curved path with offset for overlapping message flows
    const centerX = (sourceX + targetX) / 2;
    const centerY = (sourceY + targetY) / 2;
    
    // Calculate perpendicular offset
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 0) {
      // Normalize and create perpendicular vector
      const normalX = -dy / length;
      const normalY = dx / length;
      
      // Apply offset
      const offsetX = normalX * offset;
      const offsetY = normalY * offset;
      
      // Create curved path with control points
      const controlX = centerX + offsetX;
      const controlY = centerY + offsetY;
      
      path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;
    } else {
      // Fallback to straight line
      path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
    }
  } else {
    // Use standard smooth step path for normal flows
    [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  return (
    <>
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={path}
        markerEnd={markerEnd}
      />
    </>
  );
}
