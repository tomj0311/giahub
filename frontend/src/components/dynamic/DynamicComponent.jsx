import React from 'react';
import { Alert, Box } from '@mui/material';
import { MUIComponents } from './imports.js';

// Error Boundary Component
class ComponentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🚨 ComponentErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return React.createElement(Alert, { 
        severity: 'error',
        sx: { mt: 2 }
      }, [
        React.createElement('strong', { key: 'title' }, 'Component Runtime Error: '),
        this.state.error?.message || 'Unknown error occurred',
        React.createElement('br', { key: 'br' }),
        React.createElement('small', { key: 'details' }, 'Check console for detailed error information.')
      ]);
    }

    return this.props.children;
  }
}

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
const DynamicComponent = ({ componentCode, onSubmit, submitting, children }) => {
  // removed input code debug log
  
  const [component, setComponent] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const compileAndRender = async () => {
      try {
        setLoading(true);
        setError(null);

        // Clean and preprocess the component code
        let cleanedCode = componentCode
          // Normalize line endings to Unix style
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          // Remove BOM (Byte Order Mark) if present
          .replace(/^\uFEFF/, '')
          // Remove zero-width characters that can cause parsing issues
          .replace(/[\u200B-\u200D\uFEFF]/g, '')
          // Normalize quotes (smart quotes to regular quotes)
          .replace(/[""]/g, '"')
          .replace(/['']/g, "'")
          // Fix template literal syntax issues
          .replace(/\\`/g, '`') // Fix escaped backticks
          .replace(/\\{/g, '{') // Fix escaped braces in template literals
          .replace(/\\}/g, '}') // Fix escaped braces in template literals
          .replace(/\\\$/g, '$') // Fix escaped dollar signs
          // Fix common syntax issues
          .replace(/\s+;/g, ';') // Remove extra whitespace before semicolons
          .replace(/;\s*}/g, ';}') // Ensure proper spacing around closing braces
          .replace(/}\s*;\s*$/, '}') // Fix trailing semicolons after function definitions
          // Remove any trailing whitespace
          .trim();

        // Ensure the component code ends with proper closing
        if (!cleanedCode.endsWith(';') && !cleanedCode.endsWith('}')) {
          cleanedCode += ';';
        }

        console.log('Original code length:', componentCode.length);
        console.log('Cleaned code length:', cleanedCode.length);

        // Extract component name from cleaned code
        const componentMatch = cleanedCode.match(/const\s+(\w+)\s*=/);
        const componentName = componentMatch ? componentMatch[1] : 'DynamicComponent';
        
        console.log('Component name:', componentName);

        // Load Babel
        const Babel = await loadBabel();
        console.log('Babel loaded successfully');

        // Basic validation - just check for return statement
        if (!cleanedCode.includes('return')) {
          throw new Error('Component must have a return statement');
        }

        // Compile JSX to JavaScript
        let compiledCode;
        try {
          compiledCode = Babel.transform(cleanedCode, {
            presets: [
              ['env', {
                targets: {
                  browsers: ['> 1%', 'last 2 versions']
                }
              }],
              ['react', { 
                runtime: 'classic'
              }]
            ],
            filename: 'dynamic-component.jsx'
          }).code;
        } catch (babelError) {
          // Enhanced error reporting for Babel compilation errors
          console.error('Babel compilation error:', babelError);
          
          let errorMsg = babelError.message || 'Unknown compilation error';
          let location = '';
          
          if (babelError.loc) {
            location = ` at line ${babelError.loc.line}, column ${babelError.loc.column}`;
            
            // Show the problematic line
            const lines = cleanedCode.split('\n');
            const errorLine = lines[babelError.loc.line - 1];
            if (errorLine) {
              console.error(`Error line ${babelError.loc.line}: ${errorLine}`);
              console.error(' '.repeat(babelError.loc.column - 1) + '^');
            }
          }
          
          throw new Error(`JSX compilation failed${location}: ${errorMsg}`);
        }

  // removed compiled code log

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
          // Helper function to submit form data
          submitWorkflowForm: (data) => {
            console.log('📤 Form submit called with:', data);
            const event = new CustomEvent('workflowFormSubmit', {
              detail: data,
              bubbles: true,
              composed: true
            });
            window.dispatchEvent(event);
          },
          // MUI Components
          Box: MUIComponents.Box,
          Card: MUIComponents.Card,
          CardContent: MUIComponents.CardContent,
          CardActions: MUIComponents.CardActions,
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
          CircularProgress: MUIComponents.CircularProgress,
          // Additional MUI Components
          Tab: MUIComponents.Tab,
          Tabs: MUIComponents.Tabs,
          Dialog: MUIComponents.Dialog,
          DialogTitle: MUIComponents.DialogTitle,
          DialogContent: MUIComponents.DialogContent,
          DialogActions: MUIComponents.DialogActions,
          Menu: MUIComponents.Menu,
          Tooltip: MUIComponents.Tooltip,
          Snackbar: MUIComponents.Snackbar,
          Badge: MUIComponents.Badge,
          Fab: MUIComponents.Fab,
          SpeedDial: MUIComponents.SpeedDial,
          BottomNavigation: MUIComponents.BottomNavigation,
          BottomNavigationAction: MUIComponents.BottomNavigationAction,
          Stepper: MUIComponents.Stepper,
          Step: MUIComponents.Step,
          StepLabel: MUIComponents.StepLabel,
          StepContent: MUIComponents.StepContent,
          Accordion: MUIComponents.Accordion,
          AccordionSummary: MUIComponents.AccordionSummary,
          AccordionDetails: MUIComponents.AccordionDetails,
          AppBar: MUIComponents.AppBar,
          Toolbar: MUIComponents.Toolbar,
          Drawer: MUIComponents.Drawer,
          LinearProgress: MUIComponents.LinearProgress,
          Rating: MUIComponents.Rating,
          Autocomplete: MUIComponents.Autocomplete,
          ToggleButton: MUIComponents.ToggleButton,
          ToggleButtonGroup: MUIComponents.ToggleButtonGroup,
          Breadcrumbs: MUIComponents.Breadcrumbs,
          Link: MUIComponents.Link,
          Table: MUIComponents.Table,
          TableBody: MUIComponents.TableBody,
          TableCell: MUIComponents.TableCell,
          TableContainer: MUIComponents.TableContainer,
          TableHead: MUIComponents.TableHead,
          TableRow: MUIComponents.TableRow,
          TablePagination: MUIComponents.TablePagination,
          // Chart.js Components
          LineChart: MUIComponents.LineChart,
          BarChart: MUIComponents.BarChart,
          PieChart: MUIComponents.PieChart,
          DoughnutChart: MUIComponents.DoughnutChart,
          Line: MUIComponents.Line,
          Bar: MUIComponents.Bar,
          Pie: MUIComponents.Pie,
          Doughnut: MUIComponents.Doughnut,
          // HTML Elements (lowercase to match JSX)
          div: 'div',
          span: 'span',
          p: 'p',
          h1: 'h1',
          h2: 'h2',
          h3: 'h3',
          h4: 'h4',
          h5: 'h5',
          h6: 'h6',
          img: 'img',
          input: 'input',
          button: 'button',
          form: 'form',
          label: 'label',
          textarea: 'textarea',
          select: 'select',
          option: 'option',
          ul: 'ul',
          ol: 'ol',
          li: 'li',
          a: 'a',
          br: 'br',
          hr: 'hr',
          table: 'table',
          thead: 'thead',
          tbody: 'tbody',
          tr: 'tr',
          th: 'th',
          td: 'td',
          nav: 'nav',
          header: 'header',
          footer: 'footer',
          section: 'section',
          article: 'article',
          aside: 'aside',
          main: 'main',
          // SVG Elements
          svg: 'svg',
          g: 'g',
          path: 'path',
          circle: 'circle',
          rect: 'rect',
          line: 'line',
          polygon: 'polygon',
          polyline: 'polyline',
          ellipse: 'ellipse',
          text: 'text',
          tspan: 'tspan',
          defs: 'defs',
          use: 'use',
          symbol: 'symbol',
          marker: 'marker',
          clipPath: 'clipPath',
          mask: 'mask',
          pattern: 'pattern',
          linearGradient: 'linearGradient',
          radialGradient: 'radialGradient',
          stop: 'stop',
          // SVG Animation Elements
          animate: 'animate',
          animateTransform: 'animateTransform',
          animateMotion: 'animateMotion',
          set: 'set',
          // Common utility functions
          console: {
            log: console.log,
            error: console.error,
            warn: console.warn
          }
        };

        // Check for missing components before execution
        const componentRegex = /<(\w+)[\s\/>]/g;
        const usedComponents = [...cleanedCode.matchAll(componentRegex)].map(match => match[1]);
        const missingComponents = usedComponents.filter(comp => !context[comp] && comp !== componentName);
        
        if (missingComponents.length > 0) {
          throw new Error(`Missing components: ${missingComponents.join(', ')}. Available components: ${Object.keys(context).filter(key => key[0] === key[0].toUpperCase()).join(', ')}`);
        }

        // Create function parameters and values
        const paramNames = Object.keys(context);
        const paramValues = Object.values(context);

        // Execute the compiled code
        const fn = new Function(...paramNames, compiledCode + `; return ${componentName};`);
        const ComponentConstructor = fn(...paramValues);

        // Validate that we got a function back
        if (typeof ComponentConstructor !== 'function') {
          throw new Error(`Component "${componentName}" is not a valid React component function`);
        }

        // Test render the component to catch any runtime errors
        try {
          const testElement = React.createElement(ComponentConstructor);
          if (!React.isValidElement(testElement)) {
            throw new Error(`Component "${componentName}" does not return a valid React element`);
          }
        } catch (renderError) {
          throw new Error(`Component rendering failed: ${renderError.message}`);
        }

  // removed component constructor log

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
    console.log('🎨 DynamicComponent rendering - form submit handler available');
    
    return React.createElement(ComponentErrorBoundary, null,
      React.createElement(component)
    );
  }

  return React.createElement(Alert, { 
    severity: 'warning',
    sx: { mt: 2 }
  }, 'No component to render');
};

export default DynamicComponent;