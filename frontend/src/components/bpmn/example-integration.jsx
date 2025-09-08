// Example integration of the BPMN component in other projects
// Copy this example to your new project and adjust imports as needed

import React, { useState } from 'react';
import BPMN from './src/bpmn/BPMN';  // Adjust path based on your project structure

function ExampleApp() {
  const [currentTheme, setCurrentTheme] = useState('auto');

  const handleThemeChange = (theme) => {
    console.log('BPMN theme changed to:', theme);
    setCurrentTheme(theme);
  };

  const handleExportData = (bpmnXml) => {
    console.log('Exported BPMN:', bpmnXml);
    // Handle the exported data as needed
  };

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      {/* Full viewport BPMN editor */}
      <BPMN 
        initialTheme="auto"
        onThemeChange={handleThemeChange}
      />
      
      {/* Or use it in a specific container */}
      {/* 
      <div style={{ height: '600px', width: '800px', border: '1px solid #ccc' }}>
        <BPMN 
          initialTheme="light"
          className="bpmn-responsive"
          onThemeChange={handleThemeChange}
        />
      </div>
      */}
    </div>
  );
}

export default ExampleApp;
