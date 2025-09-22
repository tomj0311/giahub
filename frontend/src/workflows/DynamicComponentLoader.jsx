import React, { useState, memo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Stack,
  Card,
  CardContent,
  Divider,
  Collapse,
  IconButton,
  alpha,
  useTheme
} from '@mui/material';
import { 
  Play as PlayIcon, 
  RotateCcw as RefreshIcon, 
  Code as CodeIcon, 
  Eye as PreviewIcon, 
  ChevronDown, 
  ChevronUp,
  BookOpen as DocumentationIcon 
} from 'lucide-react';
import DynamicComponent from '../components/dynamic/DynamicComponent';
import { useSnackbar } from '../contexts/SnackbarContext';

const DynamicComponentLoader = memo(function DynamicComponentLoader({ user }) {
  console.log('🧩 DynamicComponentLoader RENDER', { 
    userToken: user?.token?.substring(0, 10) + '...', 
    timestamp: Date.now() 
  });

  const theme = useTheme();
  const { showSuccess, showError, showWarning } = useSnackbar();
  
  const [componentCode, setComponentCode] = useState('');
  const [renderedComponent, setRenderedComponent] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);

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

  const handleApplyComponent = async () => {
    if (!componentCode.trim()) {
      showWarning('Please enter component code');
      return;
    }

    setIsLoading(true);
    
    try {
      // Basic validation - check if code contains a component definition
      if (!componentCode.includes('const') || !componentCode.includes('return')) {
        throw new Error('Component code must contain a component definition with return statement');
      }
      
      setRenderedComponent(componentCode);
      showSuccess('Component applied successfully');
    } catch (err) {
      showError(`Error validating component: ${err.message}`);
      setRenderedComponent(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearComponent = () => {
    setComponentCode('');
    setRenderedComponent(null);
    showSuccess('Component cleared');
  };

  const handleLoadExample = () => {
    setComponentCode(exampleCode);
    showSuccess('Example component loaded');
  };

  return (
    <Box sx={{ 
      p: 3,
      background: theme.custom?.backgroundGradient || theme.palette.background.default 
    }}>
      <Stack spacing={3}>
        {/* Header */}
        <Box>
          <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
              fontWeight: 'bold',
              color: theme.palette.text.primary,
              mb: 1
            }}
          >
            Dynamic Component Loader
          </Typography>
          <Typography 
            variant="body1" 
            color="text.secondary"
            sx={{ maxWidth: 800 }}
          >
            Paste your React component code below and click "Apply Component" to render it dynamically.
            All Material-UI components and React hooks are available in the scope.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
          {/* Code Input Section */}
          <Box sx={{ flex: 1 }}>
            <Card sx={{ 
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${alpha(theme.palette.divider, 0.12)}`
            }}>
              <Box sx={{ 
                p: 2, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                borderBottom: `1px solid ${alpha(theme.palette.divider, 0.12)}`
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CodeIcon size={20} color={theme.palette.text.secondary} />
                  <Typography variant="h6" fontWeight="bold">
                    Component Code
                  </Typography>
                </Box>
                <Button
                  size="small"
                  onClick={handleLoadExample}
                  variant="outlined"
                  sx={{ 
                    textTransform: 'none',
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                    '&:hover': {
                      borderColor: theme.palette.primary.main,
                      bgcolor: alpha(theme.palette.primary.main, 0.04)
                    }
                  }}
                >
                  Load Example
                </Button>
              </Box>
              
              <CardContent sx={{ p: 2 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={20}
                  variant="outlined"
                  value={componentCode}
                  onChange={(e) => setComponentCode(e.target.value)}
                  placeholder="Paste your React component code here..."
                  sx={{ 
                    '& .MuiInputBase-input': {
                      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                      fontSize: '0.875rem',
                      lineHeight: 1.4
                    },
                    '& .MuiOutlinedInput-root': {
                      bgcolor: alpha(theme.palette.action.hover, 0.3),
                      '&:hover': {
                        bgcolor: alpha(theme.palette.action.hover, 0.4)
                      },
                      '&.Mui-focused': {
                        bgcolor: alpha(theme.palette.action.hover, 0.2)
                      }
                    }
                  }}
                />
                
                <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    startIcon={<PlayIcon size={18} />}
                    onClick={handleApplyComponent}
                    disabled={isLoading || !componentCode.trim()}
                    sx={{ 
                      minWidth: 150,
                      textTransform: 'none',
                      fontWeight: 'bold'
                    }}
                  >
                    {isLoading ? 'Applying...' : 'Apply Component'}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon size={18} />}
                    onClick={handleClearComponent}
                    disabled={!componentCode && !renderedComponent}
                    sx={{ textTransform: 'none' }}
                  >
                    Clear
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Box>

          {/* Preview Section */}
          <Box sx={{ flex: 1 }}>
            <Card sx={{ 
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${alpha(theme.palette.divider, 0.12)}`
            }}>
              <Box sx={{ 
                p: 2, 
                display: 'flex', 
                alignItems: 'center',
                borderBottom: `1px solid ${alpha(theme.palette.divider, 0.12)}`
              }}>
                <PreviewIcon size={20} color={theme.palette.text.secondary} />
                <Typography variant="h6" fontWeight="bold" sx={{ ml: 1 }}>
                  Component Preview
                </Typography>
              </Box>
              
              <CardContent sx={{ p: 2 }}>
                {renderedComponent ? (
                  <Paper sx={{ 
                    p: 2,
                    minHeight: 200,
                    bgcolor: alpha(theme.palette.background.default, 0.6),
                    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                    borderRadius: 1
                  }}>
                    <DynamicComponent componentCode={renderedComponent} />
                  </Paper>
                ) : (
                  <Paper sx={{ 
                    p: 4,
                    minHeight: 200,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: alpha(theme.palette.action.hover, 0.3),
                    border: `2px dashed ${alpha(theme.palette.divider, 0.3)}`,
                    borderRadius: 1
                  }}>
                    <Typography 
                      variant="body2" 
                      color="text.secondary" 
                      align="center"
                      sx={{ lineHeight: 1.6 }}
                    >
                      Enter component code and click "Apply Component"<br />
                      to see the preview here
                    </Typography>
                  </Paper>
                )}
              </CardContent>
            </Card>
          </Box>
        </Stack>

        {/* Documentation Section */}
        <Card sx={{ 
          bgcolor: theme.palette.background.paper,
          border: `1px solid ${alpha(theme.palette.divider, 0.12)}`
        }}>
          <Box 
            sx={{ 
              p: 2, 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              '&:hover': {
                bgcolor: alpha(theme.palette.action.hover, 0.04)
              }
            }}
            onClick={() => setShowDocumentation(!showDocumentation)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DocumentationIcon size={20} color={theme.palette.text.secondary} />
              <Typography variant="h6" fontWeight="bold">
                Usage Guidelines
              </Typography>
            </Box>
            <IconButton size="small">
              {showDocumentation ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </IconButton>
          </Box>
          
          <Collapse in={showDocumentation}>
            <Divider />
            <CardContent sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Component Requirements:
                  </Typography>
                  <Box component="ul" sx={{ ml: 2, '& li': { mb: 0.5 } }}>
                    <li>Define your component using <code>const ComponentName = () =&gt; {`{}`}</code> syntax</li>
                    <li>Include a <code>return</code> statement with JSX</li>
                    <li>All Material-UI components are available (Box, Button, Typography, etc.)</li>
                    <li>React hooks are available (useState, useEffect, etc.)</li>
                  </Box>
                </Box>
                
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Example Structure:
                  </Typography>
                  <Paper sx={{ 
                    p: 2, 
                    bgcolor: alpha(theme.palette.action.hover, 0.3),
                    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                    fontSize: '0.875rem',
                    overflow: 'auto'
                  }}>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
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
                  </Paper>
                </Box>
              </Stack>
            </CardContent>
          </Collapse>
        </Card>
      </Stack>
    </Box>
  );
});

export default DynamicComponentLoader;