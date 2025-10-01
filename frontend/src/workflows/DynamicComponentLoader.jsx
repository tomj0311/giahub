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
  useTheme,
  Chip
} from '@mui/material';
import { 
  Play as PlayIcon, 
  RotateCcw as RefreshIcon, 
  Eye as PreviewIcon, 
  ChevronDown, 
  ChevronUp,
  BookOpen as DocumentationIcon,
  BookOpen,
  Sparkles as GenerateIcon
} from 'lucide-react';
import DynamicComponent from '../components/dynamic/DynamicComponent';
import { useSnackbar } from '../contexts/SnackbarContext';
import { agentRuntimeService } from '../services/agentRuntimeService';

const DynamicComponentLoader = memo(function DynamicComponentLoader({ user }) {

  const theme = useTheme();
  const { showSuccess, showError, showWarning } = useSnackbar();
  
  const [renderedComponent, setRenderedComponent] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDocumentation, setShowDocumentation] = useState(false);
  
  // Code generator states
  const [cgPrompt, setCgPrompt] = useState('');
  const [cgResponse, setCgResponse] = useState('');
  const [cgLoading, setCgLoading] = useState(false);
  const token = localStorage.getItem('token') || '';

  // Example component code for demonstration
  const examplePrompts = [
    "Create a user profile card with avatar, name, email, and a follow button",
    "Build a todo list component with add, delete, and mark complete functionality",
    "Design a weather widget showing temperature, condition, and forecast",
    "Create a product card for an e-commerce site with image, price, and add to cart button",
    "Build a simple calculator with basic arithmetic operations"
  ];

  const handleApplyComponent = async (cleanedCode) => {
    if (!cleanedCode.trim()) {
      showWarning('No component code to apply');
      return;
    }

    setIsLoading(true);
    
    try {
      setRenderedComponent(cleanedCode);
      showSuccess('Component applied successfully');
    } catch (err) {
      console.error('❌ Component validation failed:', err);
      showError(`Error validating component: ${err.message}`);
      setRenderedComponent(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearComponent = () => {
    setRenderedComponent(null);
    setCgResponse('');
    setCgPrompt('');
    showSuccess('Component cleared');
  };

  const handleLoadExamplePrompt = (prompt) => {
    setCgPrompt(prompt);
    showSuccess('Example prompt loaded');
  };

  // Code generator: call backend exactly like XMLEditor
  const handleCgSubmit = async (e) => {
    e.preventDefault();
    if (!cgPrompt.trim()) return;
    setCgLoading(true);
    setCgResponse('');

    const agentName = 'JSX Component Generator';

    try {
      const response = await agentRuntimeService.runAgentStream(
        {
          agent_name: agentName,
          prompt: cgPrompt,
          conv_id: `dynamicloader_${Date.now()}`
        },
        token
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body available');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === 'agent_chunk' && event.payload?.content) {
                setCgResponse(prev => prev + event.payload.content);
              } else if (event.type === 'error' || event.error) {
                setCgResponse('Error: ' + (event.error || event.details?.message || 'Unknown error'));
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE event:', line, parseError);
            }
          }
        }
      }
    } catch (err) {
      setCgResponse('Error: ' + (err.message || err));
    } finally {
      setCgLoading(false);
    }
  };

  // Function to extract JSX code from markdown code blocks
  const extractJSXFromMarkdown = (text) => {
    if (!text) return '';
    
    console.log('🔍 Original text:', text);
    
    // Look for ```jsx or ```javascript or ``` code blocks
    const codeBlockRegex = /```(?:jsx|javascript|js|react)?\s*\n?([\s\S]*?)```/g;
    const matches = [...text.matchAll(codeBlockRegex)];
    
    let extractedCode = '';
    
    if (matches.length > 0) {
      // Return the content of the first code block
      extractedCode = matches[0][1].trim();
      console.log('✅ Extracted from code block:', extractedCode);
    } else {
      // If no code blocks found, try to find component definition directly
      const componentMatch = text.match(/const\s+\w+\s*=[\s\S]*?return[\s\S]*?};?/);
      if (componentMatch) {
        extractedCode = componentMatch[0].trim();
        console.log('✅ Found component definition:', extractedCode);
      } else {
        // If no patterns found, return the original text
        extractedCode = text.trim();
        console.log('⚠️ No code patterns found, returning original');
      }
    }
    
    // Clean up the extracted code to fix common issues
    let cleanedCode = extractedCode
      // Remove any trailing semicolons after function definitions
      .replace(/};\s*$/, '}')
      // Ensure proper formatting for arrays and objects
      .replace(/\]\s*>/g, ']\n>')
      // Fix any malformed array/object syntax
      .replace(/,\s*\]/g, '\n  ]')
      .replace(/,\s*}/g, '\n  }');
    
    // Validate that the code has proper structure
    if (cleanedCode.includes('const') && cleanedCode.includes('return')) {
      // Ensure the component function is properly closed
      const openBraces = (cleanedCode.match(/{/g) || []).length;
      const closeBraces = (cleanedCode.match(/}/g) || []).length;
      
      if (openBraces > closeBraces) {
        // Add missing closing braces
        cleanedCode += '}'.repeat(openBraces - closeBraces);
      }
    }
    
    return cleanedCode;
  };

  const handleUseGeneratedCode = () => {
    if (cgResponse.trim()) {
      const cleanedCode = extractJSXFromMarkdown(cgResponse);
      handleApplyComponent(cleanedCode);
    }
  };

  // Function to fix common syntax issues in manually entered code
  const handleFixSyntax = (code) => {
    if (!code) return '';
    
    return code
      // Fix array closing issues
      .replace(/\]\s*>\s*}/g, ']\n  }')
      // Fix object property formatting
      .replace(/,\s*\]/g, '\n  ]')
      .replace(/,\s*}/g, '\n  }')
      // Remove trailing semicolons after component definitions
      .replace(/};\s*$/, '}')
      // Ensure proper spacing around operators
      .replace(/=>/g, ' => ')
      // Fix missing spaces after commas in arrays/objects
      .replace(/,([^\s])/g, ', $1')
      // Fix template literal issues
      .replace(/\\\$/g, '$')
      .trim();
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
            AI Component Generator
          </Typography>
          <Typography 
            variant="body1" 
            color="text.secondary"
            sx={{ maxWidth: 800 }}
          >
            Describe the React component you want to create and let AI generate it for you.
            All Material-UI components and React hooks are available in the generated components.
          </Typography>
        </Box>

        {/* Code Generator and Generated Code Section - Top Row */}
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3}>
          {/* AI Component Generator Section */}
          <Box sx={{ flex: 1 }}>
            <Card sx={{ 
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <Box sx={{ 
                p: 2, 
                display: 'flex', 
                alignItems: 'center',
                borderBottom: `1px solid ${alpha(theme.palette.divider, 0.12)}`
              }}>
                <GenerateIcon size={20} color={theme.palette.text.secondary} />
                <Typography variant="h6" fontWeight="bold" sx={{ ml: 1 }}>
                  AI Component Generator
                </Typography>
              </Box>
              
              <CardContent sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Example Prompts */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Try these example prompts:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {examplePrompts.slice(0, 3).map((prompt, index) => {
                      const truncatedText = prompt.length > 30 ? prompt.substring(0, 30) + '...' : prompt;
                      return (
                        <Chip
                          key={index}
                          label={truncatedText}
                          onClick={() => handleLoadExamplePrompt(prompt)}
                          variant="outlined"
                          size="small"
                          title={prompt}
                          sx={{ 
                            maxWidth: '180px',
                            fontSize: '0.7rem',
                            height: '24px',
                            cursor: 'pointer',
                            '& .MuiChip-label': {
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              paddingLeft: '8px',
                              paddingRight: '8px'
                            },
                            '&:hover': {
                              bgcolor: alpha(theme.palette.primary.main, 0.04),
                              borderColor: theme.palette.primary.main
                            }
                          }}
                        />
                      );
                    })}
                  </Box>
                </Box>

                <form onSubmit={handleCgSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <TextField
                    label="Describe the component you want to generate"
                    variant="outlined"
                    fullWidth
                    multiline
                    rows={2}
                    value={cgPrompt}
                    onChange={e => setCgPrompt(e.target.value)}
                    placeholder="e.g., Create a user profile card with avatar, name, email, and a follow button"
                    disabled={cgLoading}
                    sx={{ mb: 2 }}
                  />
                  
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button 
                      type="submit" 
                      variant="contained"
                      disabled={cgLoading || !cgPrompt.trim()}
                      startIcon={<GenerateIcon size={18} />}
                      sx={{ 
                        textTransform: 'none',
                        fontWeight: 'bold'
                      }}
                    >
                      {cgLoading ? 'Generating...' : 'Generate Component'}
                    </Button>
                  </Box>
                </form>
              </CardContent>
            </Card>
          </Box>

          {/* Generated Code Section */}
          <Box sx={{ flex: 1 }}>
            <Card sx={{ 
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <Box sx={{ 
                p: 2, 
                display: 'flex', 
                alignItems: 'center',
                borderBottom: `1px solid ${alpha(theme.palette.divider, 0.12)}`
              }}>
                <BookOpen size={20} color={theme.palette.text.secondary} />
                <Typography variant="h6" fontWeight="bold" sx={{ ml: 1 }}>
                  Generated Code
                </Typography>
              </Box>
              
              <CardContent sx={{ p: 2, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <TextField
                  label="Generated Code"
                  variant="outlined"
                  multiline
                  fullWidth
                  value={cgResponse}
                  onChange={(e) => setCgResponse(e.target.value)}
                  placeholder="Generated component code will appear here..."
                  rows={12}
                  sx={{
                    mb: 2,
                    flex: 1,
                    '& .MuiInputBase-input': {
                      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                      fontSize: '0.875rem',
                      lineHeight: 1.4
                    }
                  }}
                />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button 
                    onClick={() => {
                      if (cgResponse.trim()) {
                        const cleanedCode = extractJSXFromMarkdown(cgResponse);
                        handleApplyComponent(cleanedCode);
                      }
                    }}
                    variant="contained"
                    disabled={!cgResponse.trim() || isLoading}
                    startIcon={<PlayIcon size={18} />}
                    sx={{ 
                      textTransform: 'none',
                      fontWeight: 'bold'
                    }}
                  >
                    Preview Component
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Stack>

        {/* Preview Section - Appears below after clicking Preview Component */}
        {renderedComponent && (
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
              <Paper sx={{ 
                p: 2,
                minHeight: 200,
                border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
                borderRadius: 1
              }}>
                <DynamicComponent componentCode={renderedComponent} />
              </Paper>
            </CardContent>
          </Card>
        )}

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
                    How to Use:
                  </Typography>
                  <Box component="ul" sx={{ ml: 2, '& li': { mb: 0.5 } }}>
                    <li>Describe the component you want in plain English</li>
                    <li>Click "Generate Component" and wait for AI to create the code</li>
                    <li>Click "Preview Component" to see your component in action</li>
                    <li>All Material-UI components and React hooks are available</li>
                  </Box>
                </Box>
                
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Example Prompts:
                  </Typography>
                  <Paper sx={{ 
                    p: 2, 
                    fontSize: '0.875rem',
                    overflow: 'auto'
                  }}>
                    <Box component="ul" sx={{ m: 0, '& li': { mb: 1 } }}>
                      {examplePrompts.map((prompt, index) => (
                        <li key={index}>{prompt}</li>
                      ))}
                    </Box>
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