import React from 'react';
import { MUIComponents } from './imports.js';

// Simple dynamic component loader
const DynamicComponent = ({ componentCode, children }) => {
  try {
    // Extract component name from code (assumes export default ComponentName format)
    const componentMatch = componentCode.match(/const\s+(\w+)\s*=/);
    const componentName = componentMatch ? componentMatch[1] : 'DynamicComponent';
    
    // Create function with all MUI components and hooks available in scope
    const functionCode = `
      const { ${Object.keys(MUIComponents).join(', ')} } = components;
      
      ${componentCode}
      
      return ${componentName};
    `;
    
    const componentFunction = new Function('React', 'components', 'children', functionCode);
    
    // Execute and get the component constructor
    const ComponentConstructor = componentFunction(React, MUIComponents, children);
    
    // Return the component instance
    return React.createElement(ComponentConstructor);
    
  } catch (error) {
    console.error('Error loading dynamic component:', error);
    return React.createElement('div', { style: { color: 'red', padding: '10px' } }, 
      `Error loading component: ${error.message}`
    );
  }
};

export default DynamicComponent;