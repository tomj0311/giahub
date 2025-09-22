import React from 'react';
import { Alert, Box } from '@mui/material';
import { MUIComponents } from './imports.js';

// Load Babel standalone for JSX compilation
const loadBabel = () => {
  return new Promise((resolve, reject) => {
    if (window.Babel) {
      resolve(window.Babel);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@babel/standalone/babel.min.js';
    script.onload = () => resolve(window.Babel);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// Dynamic component loader using Babel for JSX compilation
const DynamicComponent = ({ componentCode, children }) => {
  console.log('🔧 DynamicComponent - Input code:', componentCode);
  
  const [component, setComponent] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const compileAndRender = async () => {
      try {
        setLoading(true);
        setError(null);

        // Extract component name from code
        const componentMatch = componentCode.match(/const\s+(\w+)\s*=/);
        const componentName = componentMatch ? componentMatch[1] : 'DynamicComponent';
        
        console.log('🔧 DynamicComponent - Component name:', componentName);

        // Load Babel
        const Babel = await loadBabel();
        console.log('🔧 DynamicComponent - Babel loaded');

        // Compile JSX to JavaScript
        const compiledCode = Babel.transform(componentCode, {
          presets: ['react']
        }).code;

        console.log('🔧 DynamicComponent - Compiled code:', compiledCode);

        // Create execution context with all MUI components and React features
        const context = {
          React,
          // React hooks
          useState: React.useState,
          useEffect: React.useEffect,
          useMemo: React.useMemo,
          useCallback: React.useCallback,
          useRef: React.useRef,
          useContext: React.useContext,
          useReducer: React.useReducer,
          // MUI Components
          Box: MUIComponents.Box,
          Card: MUIComponents.Card,
          CardContent: MUIComponents.CardContent,
          Typography: MUIComponents.Typography,
          Button: MUIComponents.Button,
          TextField: MUIComponents.TextField,
          Paper: MUIComponents.Paper,
          Stack: MUIComponents.Stack,
          Grid: MUIComponents.Grid,
          Container: MUIComponents.Container,
          Divider: MUIComponents.Divider,
          Alert: MUIComponents.Alert,
          IconButton: MUIComponents.IconButton,
          Chip: MUIComponents.Chip,
          Avatar: MUIComponents.Avatar,
          List: MUIComponents.List,
          ListItem: MUIComponents.ListItem,
          ListItemText: MUIComponents.ListItemText,
          FormControl: MUIComponents.FormControl,
          InputLabel: MUIComponents.InputLabel,
          Select: MUIComponents.Select,
          MenuItem: MUIComponents.MenuItem,
          Checkbox: MUIComponents.Checkbox,
          Radio: MUIComponents.Radio,
          RadioGroup: MUIComponents.RadioGroup,
          FormControlLabel: MUIComponents.FormControlLabel,
          Switch: MUIComponents.Switch,
          Slider: MUIComponents.Slider,
          console: {
            log: console.log,
            error: console.error,
            warn: console.warn
          }
        };

        // Create function parameters and values
        const paramNames = Object.keys(context);
        const paramValues = Object.values(context);

        // Execute the compiled code
        const fn = new Function(...paramNames, compiledCode + `; return ${componentName};`);
        const ComponentConstructor = fn(...paramValues);

        console.log('🔧 DynamicComponent - ComponentConstructor:', ComponentConstructor);

        setComponent(() => ComponentConstructor);
        setLoading(false);

      } catch (err) {
        console.error('🔧 DynamicComponent - Error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    if (componentCode) {
      compileAndRender();
    }
  }, [componentCode]);

  if (loading) {
    return React.createElement(Alert, { 
      severity: 'info',
      sx: { mt: 2 }
    }, 'Compiling JSX...');
  }

  if (error) {
    return React.createElement(Alert, { 
      severity: 'error',
      sx: { mt: 2 }
    }, [
      React.createElement('strong', { key: 'title' }, 'Error loading component: '),
      error,
      React.createElement('br', { key: 'br' }),
      React.createElement('small', { key: 'details' }, 'Check console for detailed logs.')
    ]);
  }

  if (component) {
    return React.createElement(component);
  }

  return React.createElement(Alert, { 
    severity: 'warning',
    sx: { mt: 2 }
  }, 'No component to render');
};

export default DynamicComponent;