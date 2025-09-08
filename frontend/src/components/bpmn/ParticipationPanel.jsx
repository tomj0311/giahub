import React, { useState } from 'react';
import './ParticipationPanel.css';

const ParticipationPanel = ({ onAddParticipant, onAddLane, participants = [], lanes = [], onPanelToggle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [newLaneName, setNewLaneName] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState('');

  const handleToggle = () => {
    const newOpenState = !isOpen;
    setIsOpen(newOpenState);
    if (onPanelToggle) {
      onPanelToggle(newOpenState);
    }
  };

  const handleAddParticipant = () => {
    if (newParticipantName.trim()) {
      onAddParticipant(newParticipantName.trim());
      setNewParticipantName('');
    }
  };

  const handleAddLane = () => {
    if (newLaneName.trim() && selectedParticipant) {
      onAddLane(newLaneName.trim(), selectedParticipant);
      setNewLaneName('');
    }
  };

  const handleKeyPress = (e, action) => {
    if (e.key === 'Enter') {
      action();
    }
  };

  return (
    <div className={`participation-panel ${isOpen ? 'open' : 'closed'}`}>
      <div className="panel-toggle" onClick={handleToggle}>
        <span className="toggle-icon">{isOpen ? '◀' : '▶'}</span>
        <span className="panel-title">Participants & Lanes</span>
      </div>
      
      {isOpen && (
        <div className="panel-content">
          {/* Add Participant Section */}
          <div className="section">
            <h4>Add Participant</h4>
            <div className="input-group">
              <input
                type="text"
                placeholder="Participant name..."
                value={newParticipantName}
                onChange={(e) => setNewParticipantName(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleAddParticipant)}
                className="participant-input"
              />
              <button 
                onClick={handleAddParticipant}
                className="add-btn"
                disabled={!newParticipantName.trim()}
              >
                Add
              </button>
            </div>
          </div>

          {/* Add Lane Section */}
          <div className="section">
            <h4>Add Lane</h4>
            <div className="input-group">
              <select
                value={selectedParticipant}
                onChange={(e) => setSelectedParticipant(e.target.value)}
                className="participant-select"
              >
                <option value="">Select participant...</option>
                {participants.map(participant => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="input-group">
              <input
                type="text"
                placeholder="Lane name..."
                value={newLaneName}
                onChange={(e) => setNewLaneName(e.target.value)}
                onKeyPress={(e) => handleKeyPress(e, handleAddLane)}
                className="lane-input"
                disabled={!selectedParticipant}
              />
              <button 
                onClick={handleAddLane}
                className="add-btn"
                disabled={!newLaneName.trim() || !selectedParticipant}
              >
                Add
              </button>
            </div>
          </div>

          {/* Existing Participants */}
          {participants.length > 0 && (
            <div className="section">
              <h4>Participants</h4>
              <div className="participants-list">
                {participants.map(participant => (
                  <div key={participant.id} className="participant-item">
                    <div className="participant-name">{participant.name}</div>
                    {participant.lanes && participant.lanes.length > 0 && (
                      <div className="lanes-list">
                        {participant.lanes.map(lane => (
                          <div key={lane.id} className="lane-item">
                            └ {lane.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="section">
            <h4>Quick Templates</h4>
            <div className="template-buttons">
              <button 
                onClick={() => onAddParticipant('Customer')}
                className="template-btn"
              >
                + Customer
              </button>
              <button 
                onClick={() => onAddParticipant('System')}
                className="template-btn"
              >
                + System
              </button>
              <button 
                onClick={() => onAddParticipant('Manager')}
                className="template-btn"
              >
                + Manager
              </button>
              <button 
                onClick={() => onAddParticipant('Employee')}
                className="template-btn"
              >
                + Employee
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipationPanel;
