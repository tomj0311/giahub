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

  return null;
};

export default ParticipationPanel;
