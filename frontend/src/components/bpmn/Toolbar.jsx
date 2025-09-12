import React from 'react';
import './Toolbar.css';

const Toolbar = ({ isDarkMode, onToggleTheme, isPropertyPanelOpen, onTogglePropertyPanel, selectionMode, onToggleSelectionMode, readOnly }) => {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="toolbar">
      {/* Theme Toggle Button */}
      <div className="toolbar-section">
        <div className="theme-toggle-container">
          <button
            className="theme-toggle-button"
            onClick={onToggleTheme}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
          >
            <div className={`theme-icon ${isDarkMode ? 'moon' : 'sun'}`}>
              {isDarkMode ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75zM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0zM18.894 6.166a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59zM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75zM17.834 18.894a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 1 0-1.061 1.06l1.59 1.591zM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18zM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59zM6 12a.75.75 0 0 1-.75.75H3a.75.75 0 0 1 0-1.5h2.25A.75.75 0 0 1 6 12zM6.697 7.757a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591z"/>
                </svg>
              )}
            </div>
          </button>
        </div>
      </div>
      
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
