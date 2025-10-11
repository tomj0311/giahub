import React from 'react';
import { Handle, Position, NodeResizer } from 'reactflow';
import './BPMNNodes.css';

const ParticipantNode = ({ data, style, selected }) => {
  // Use dynamic width and height from style if available, with reasonable defaults
  const width = style?.width || data?.participantBounds?.width || 400;
  const height = style?.height || data?.participantBounds?.height || 200;
  const lanes = data.lanes || [];
  
  return (
    <div 
      className="participant-node" 
      style={{ 
        width: `${width}px`, 
        height: `${height}px`,
        minWidth: `${Math.min(width, 300)}px`,
        minHeight: `${Math.min(height, 150)}px`
      }}
    >
      <NodeResizer
        color="#4a9eff"
        isVisible={selected}
        minWidth={300}
        minHeight={150}
      />
      <div className="participant-header">
        <span className="participant-label">{data.label}</span>
      </div>
      <div className="participant-body" style={{ 
        width: `${width - 40}px`, 
        height: `${height - 20}px` 
      }}>
        {/* Render lane divisions */}
        {lanes.length > 0 && lanes.map((lane, index) => {
          const laneTop = lane.position.y - (data.participantBounds?.y || 0);
          const laneHeight = lane.position.height;
          
          return (
            <div 
              key={lane.id}
              className="lane-division"
              style={{
                top: `${laneTop}px`,
                height: `${laneHeight}px`,
                borderBottom: index < lanes.length - 1 ? 'none' : 'none'
              }}
            >
              <span className="lane-division-label">
                {lane.name}
              </span>
            </div>
          );
        })}
        {/* Horizontal lane separator lines */}
        {lanes.length > 0 && lanes.map((lane, index) => {
          if (index >= lanes.length - 1) return null;
          
          const separatorTop = lane.position.y - (data.participantBounds?.y || 0) + lane.position.height;
          
          return (
            <div 
              key={`separator-${lane.id}`}
              className="lane-separator"
              style={{
                top: `${separatorTop}px`,
                width: `${width - 60}px`
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default ParticipantNode;
