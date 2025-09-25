import React, { useState, useEffect } from 'react';
import BPMNEditor from './BPMNEditor';
import './BPMN.css';

/**
 * Self-contained BPMN Editor Component
 * 
 * This component includes all BPMN functionality and can be easily
 * copied to other projects as a reusable component.
 * 
 * Props:
 * - initialTheme: 'light' | 'dark' | 'auto' (default: 'auto')
 * - onThemeChange: callback function when theme changes
 * - className: additional CSS classes
 * - style: inline styles
 * - showToolbox: boolean (default: true) - Controls toolbox visibility
 * - showPropertyPanel: boolean (default: true) - Controls property panel visibility
 * - readOnly: boolean (default: false) - When true, acts as BPMNViewer
 * - initialBPMN: string - Initial BPMN XML to load
 * - taskStatusData: object - Task status data for coloring nodes based on workflow state
 */
function BPMN({ 
  initialTheme = 'auto', 
  onThemeChange, 
  className = '', 
  style = {},
  showToolbox = true,
  showPropertyPanel = true,
  readOnly = false,
  initialBPMN = null,
  taskStatusData = null,
  ...props 
}) {
  // Initialize theme synchronously to prevent flash
  const getInitialTheme = () => {
    if (initialTheme === 'auto') {
      const savedTheme = localStorage.getItem('bpmn-theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return initialTheme === 'dark';
  };

  const [isDarkMode, setIsDarkMode] = useState(getInitialTheme);
  const [isLoading, setIsLoading] = useState(false);

  // Load theme preference and set up the component
  useEffect(() => {
    let shouldBeDark = isDarkMode;
    
    if (initialTheme === 'auto') {
      const savedTheme = localStorage.getItem('bpmn-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      shouldBeDark = savedTheme ? savedTheme === 'dark' : prefersDark;
    } else {
      shouldBeDark = initialTheme === 'dark';
    }
    
    setIsDarkMode(shouldBeDark);
    
    // Apply theme immediately without loading delay
    setIsLoading(false);
  }, [initialTheme]);

  // Save theme preference to localStorage and notify parent
  useEffect(() => {
    if (initialTheme === 'auto') {
      localStorage.setItem('bpmn-theme', isDarkMode ? 'dark' : 'light');
    }
    
    // Notify parent component of theme change
    if (onThemeChange) {
      onThemeChange(isDarkMode ? 'dark' : 'light');
    }
  }, [isDarkMode, initialTheme, onThemeChange]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Show loading state briefly to prevent flash
  if (isLoading) {
    return (
      <div className={`bpmn-loading-container ${isDarkMode ? 'bpmn-dark-theme' : 'bpmn-light-theme'} ${className}`} style={style}>
        <div className="bpmn-loading-spinner"></div>
      </div>
    );
  }

  return (
    <div 
      className={`bpmn-container ${isDarkMode ? 'bpmn-dark-theme' : 'bpmn-light-theme'} ${className}`}
      style={style}
      data-theme={isDarkMode ? 'dark' : 'light'}
      {...props}
    >
      <BPMNEditor 
        isDarkMode={isDarkMode} 
        onToggleTheme={toggleTheme}
        showToolbox={showToolbox}
        showPropertyPanel={showPropertyPanel}
        readOnly={readOnly}
        initialBPMN={initialBPMN}
        taskStatusData={taskStatusData}
      />
    </div>
  );
}

export default BPMN;
