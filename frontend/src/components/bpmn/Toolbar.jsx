import React from 'react';
import './Toolbar.css';

const Toolbar = ({ isDarkMode, isPropertyPanelOpen, onTogglePropertyPanel, selectionMode, onToggleSelectionMode, readOnly }) => {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="toolbar">
      {/* Selection Tools */}
      <div className="toolbar-section">
        <div className="toolbar-items">
          <button
            className={`toolbar-tool lasso-tool ${selectionMode ? 'active' : ''}`}
            onClick={onToggleSelectionMode}
            title={selectionMode ? "Exit Selection Mode" : "Lasso Selection Mode"}
            aria-label="Toggle lasso selection mode"
          >
            <div className="lasso-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 17l5-5 5 5M7 7l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <rect x="4" y="4" width="16" height="16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3,3" fill="none" opacity="0.6"/>
              </svg>
            </div>
          </button>
        </div>
      </div>
      
      <div className="toolbar-section">
        <div className="toolbar-items">
          <div
            className="toolbar-item start-event"
            onDragStart={(event) => onDragStart(event, 'startEvent')}
            draggable
            title="Start Event"
          >
            <div className="start-event-icon"></div>
          </div>
          <div
            className="toolbar-item end-event"
            onDragStart={(event) => onDragStart(event, 'endEvent')}
            draggable
            title="End Event"
          >
            <div className="end-event-icon"></div>
          </div>
          <div
            className="toolbar-item intermediate-event"
            onDragStart={(event) => onDragStart(event, 'intermediateEvent')}
            draggable
            title="Intermediate Event"
          >
            <div className="intermediate-event-icon"></div>
          </div>
        </div>
      </div>
      
      <div className="toolbar-section">
        <div className="toolbar-items">
          <div
            className="toolbar-item task"
            onDragStart={(event) => onDragStart(event, 'task')}
            draggable
            title="Task"
          >
            <div className="task-icon"></div>
          </div>
          <div
            className="toolbar-item service-task"
            onDragStart={(event) => onDragStart(event, 'serviceTask')}
            draggable
            title="Service Task"
          >
            <div className="service-task-icon"></div>
          </div>
          <div
            className="toolbar-item user-task"
            onDragStart={(event) => onDragStart(event, 'userTask')}
            draggable
            title="User Task"
          >
            <div className="user-task-icon"></div>
          </div>
          <div
            className="toolbar-item script-task"
            onDragStart={(event) => onDragStart(event, 'scriptTask')}
            draggable
            title="Script Task"
          >
            <div className="script-task-icon"></div>
          </div>
          <div
            className="toolbar-item business-rule-task"
            onDragStart={(event) => onDragStart(event, 'businessRuleTask')}
            draggable
            title="Business Rule Task"
          >
            <div className="business-rule-task-icon"></div>
          </div>
          <div
            className="toolbar-item send-task"
            onDragStart={(event) => onDragStart(event, 'sendTask')}
            draggable
            title="Send Task"
          >
            <div className="send-task-icon"></div>
          </div>
          <div
            className="toolbar-item receive-task"
            onDragStart={(event) => onDragStart(event, 'receiveTask')}
            draggable
            title="Receive Task"
          >
            <div className="receive-task-icon"></div>
          </div>
          <div
            className="toolbar-item manual-task"
            onDragStart={(event) => onDragStart(event, 'manualTask')}
            draggable
            title="Manual Task"
          >
            <div className="manual-task-icon"></div>
          </div>
        </div>
      </div>
      
      <div className="toolbar-section">
        <div className="toolbar-items">
          <div
            className="toolbar-item gateway"
            onDragStart={(event) => onDragStart(event, 'exclusiveGateway')}
            draggable
            title="Exclusive Gateway"
          >
            <div className="gateway-icon"></div>
          </div>
          <div
            className="toolbar-item parallel-gateway"
            onDragStart={(event) => onDragStart(event, 'parallelGateway')}
            draggable
            title="Parallel Gateway"
          >
            <div className="parallel-gateway-icon"></div>
          </div>
          <div
            className="toolbar-item inclusive-gateway"
            onDragStart={(event) => onDragStart(event, 'inclusiveGateway')}
            draggable
            title="Inclusive Gateway"
          >
            <div className="inclusive-gateway-icon"></div>
          </div>
        </div>
      </div>
      
      <div className="toolbar-section">
        <div className="toolbar-items">
          <div
            className="toolbar-item subprocess"
            onDragStart={(event) => onDragStart(event, 'subProcess')}
            draggable
            title="Sub Process"
          >
            <div className="subprocess-icon"></div>
          </div>
          <div
            className="toolbar-item call-activity"
            onDragStart={(event) => onDragStart(event, 'callActivity')}
            draggable
            title="Call Activity"
          >
            <div className="call-activity-icon"></div>
          </div>
        </div>
      </div>
      
      <div className="toolbar-section">
        <div className="toolbar-items">
          <div
            className="toolbar-item data-object"
            onDragStart={(event) => onDragStart(event, 'dataObject')}
            draggable
          >
            <div className="data-object-icon"></div>
          </div>
          <div
            className="toolbar-item data-store"
            onDragStart={(event) => onDragStart(event, 'dataStore')}
            draggable
          >
            <div className="data-store-icon"></div>
          </div>
        </div>
      </div>
      
      <div className="toolbar-section">
        <div className="toolbar-items">
          <div
            className="toolbar-item group"
            onDragStart={(event) => onDragStart(event, 'group')}
            draggable
            title="Group"
          >
            <div className="group-icon"></div>
          </div>
          <div
            className="toolbar-item text-annotation"
            onDragStart={(event) => onDragStart(event, 'textAnnotation')}
            draggable
            title="Text Annotation"
          >
            <div className="text-annotation-icon"></div>
          </div>
        </div>
      </div>
      
      <div className="toolbar-section">
        <div className="toolbar-items">
          <div
            className="toolbar-item participant"
            onDragStart={(event) => onDragStart(event, 'participant')}
            draggable
            title="Participant"
          >
            <div className="participant-icon"></div>
          </div>
          <div
            className="toolbar-item lane"
            onDragStart={(event) => onDragStart(event, 'lane')}
            draggable
            title="Lane"
          >
            <div className="lane-icon"></div>
          </div>
        </div>
      </div>

      {/* Property Panel Toggle */}
      <div className="toolbar-section">
        <div className="property-panel-toggle-container">
          <button
            className={`property-panel-toggle-button ${isPropertyPanelOpen ? 'active' : ''}`}
            onClick={onTogglePropertyPanel}
            title={isPropertyPanelOpen ? "Hide Properties Panel" : "Show Properties Panel"}
            aria-label="Toggle properties panel"
          >
            <div className="properties-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V5H3z"/>
              </svg>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Toolbar;
