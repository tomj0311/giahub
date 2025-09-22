import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import { ExpandMore, PlayArrow, Code, Preview } from '@mui/icons-material';
import DynamicComponent from '../components/dynamic/DynamicComponent';

const DynamicComponentLoader = () => {
  const [componentCode, setComponentCode] = useState('');
  const [renderedComponent, setRenderedComponent] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Example component code for demonstration
  const exampleCode = `const ExampleComponent = () => {
  const [count, setCount] = React.useState(0);
  
  return (
    <Card sx={{ maxWidth: 400, margin: 'auto' }}>
      <CardContent>
        <Typography variant="h5" component="div" gutterBottom>
          Dynamic Counter Component
        </Typography>
        <Typography variant="h2" color="primary" align="center" sx={{ my: 2 }}>
          {count}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
          <Button 
            variant="contained" 
            onClick={() => setCount(count - 1)}
            color="secondary"
          >
            Decrease
          </Button>
          <Button 
            variant="contained" 
            onClick={() => setCount(count + 1)}
            color="primary"
          >
            Increase
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};`;

  const handleApplyComponent = () => {
    if (!componentCode.trim()) {
      setError('Please enter component code');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      // Basic validation - check if code contains a component definition
      if (!componentCode.includes('const') || !componentCode.includes('return')) {
        throw new Error('Component code must contain a component definition with return statement');
      }
      
      setRenderedComponent(componentCode);
      setError('');
    } catch (err) {
      setError(`Error validating component: ${err.message}`);
      setRenderedComponent(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearComponent = () => {
    setComponentCode('');
    setRenderedComponent(null);
    setError('');
  };

  const handleLoadExample = () => {
    setComponentCode(exampleCode);
    setError('');
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Dynamic Component Loader
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Paste your React component code below and click "Apply Component" to render it dynamically.
        All Material-UI components are available in the scope.
      </Typography>

      <Grid container spacing={3}>
        {/* Code Input Section */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardHeader 
              title="Component Code" 
              avatar={<Code />}
              action={
                <Button
                  size="small"
                  onClick={handleLoadExample}
                  variant="outlined"
                >
                  Load Example
                </Button>
              }
            />
            <CardContent>
              <TextField
                fullWidth
                multiline
                rows={20}
                variant="outlined"
                value={componentCode}
                onChange={(e) => setComponentCode(e.target.value)}
                placeholder="Paste your React component code here..."
                sx={{ 
                  fontFamily: 'monospace',
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                  }
                }}
              />
              
              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  startIcon={<PlayArrow />}
                  onClick={handleApplyComponent}
                  disabled={isLoading || !componentCode.trim()}
                  sx={{ minWidth: 150 }}
                >
                  {isLoading ? 'Applying...' : 'Apply Component'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleClearComponent}
                  disabled={!componentCode && !renderedComponent}
                >
                  Clear
                </Button>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {error}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Preview Section */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardHeader 
              title="Component Preview" 
              avatar={<Preview />}
            />
            <CardContent>
              {renderedComponent ? (
                <Box sx={{ 
                  border: 1, 
                  borderColor: 'divider', 
                  borderRadius: 1, 
                  p: 2,
                  minHeight: 200,
                  backgroundColor: 'background.default'
                }}>
                  <DynamicComponent componentCode={renderedComponent} />
                </Box>
              ) : (
                <Box sx={{ 
                  border: 2, 
                  borderColor: 'divider', 
                  borderStyle: 'dashed',
                  borderRadius: 1, 
                  p: 4,
                  minHeight: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'action.hover'
                }}>
                  <Typography variant="body2" color="text.secondary" align="center">
                    Enter component code and click "Apply Component"<br />
                    to see the preview here
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Documentation Section */}
      <Box sx={{ mt: 4 }}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Typography variant="h6">Usage Guidelines</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography component="div">
              <strong>Component Requirements:</strong>
              <ul>
                <li>Define your component using <code>const ComponentName = () =&gt; {`{}`}</code> syntax</li>
                <li>Include a <code>return</code> statement with JSX</li>
                <li>All Material-UI components are available (Box, Button, Typography, etc.)</li>
                <li>React hooks are available (useState, useEffect, etc.)</li>
              </ul>
              
              <strong>Example Structure:</strong>
              <pre style={{ 
                backgroundColor: '#f5f5f5', 
                padding: '12px', 
                borderRadius: '4px',
                fontSize: '0.875rem',
                overflow: 'auto'
              }}>
{`const MyComponent = () => {
  const [state, setState] = React.useState(initialValue);
  
  return (
    <Box>
      <Typography>Hello World</Typography>
      <Button onClick={() => setState(newValue)}>
        Click me
      </Button>
    </Box>
  );
};`}
              </pre>
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
};

export default DynamicComponentLoader;