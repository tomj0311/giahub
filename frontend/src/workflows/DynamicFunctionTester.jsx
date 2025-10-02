import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Divider,
  useTheme,
  alpha
} from '@mui/material';
import {
  ExpandMore,
  PlayArrow,
  Code,
  Functions,
  Settings,
  CheckCircle,
  Error as ErrorIcon
} from '@mui/icons-material';
import { apiCall } from '../config/api';

const DynamicFunctionTester = () => {
  const theme = useTheme();
  const [modules, setModules] = useState([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [functions, setFunctions] = useState({});
  const [selectedFunction, setSelectedFunction] = useState('');
  const [functionDetails, setFunctionDetails] = useState(null);
  const [parameters, setParameters] = useState({});
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Load modules on component mount
  useEffect(() => {
    loadModules();
  }, []);

  // Load functions when module is selected
  useEffect(() => {
    if (selectedModule) {
      loadFunctions(selectedModule);
    } else {
      setFunctions({});
      setSelectedFunction('');
      setFunctionDetails(null);
      setParameters({});
    }
  }, [selectedModule]);

  // Load function details when function is selected
  useEffect(() => {
    if (selectedFunction && functions[selectedFunction]) {
      const funcDetails = functions[selectedFunction];
      console.log('🔍 Function details:', funcDetails);
      console.log('🔍 Function parameters:', funcDetails.parameters);
      
      setFunctionDetails(funcDetails);
      
      // Initialize parameters based on function signature
      const initialParams = {};
      if (funcDetails.parameters) {
        const params = funcDetails.parameters;
        console.log('🔍 Available parameters:', params);
        Object.keys(params).forEach(paramName => {
          initialParams[paramName] = params[paramName].default || '';
          console.log(`📝 Adding parameter: ${paramName} with default: ${params[paramName].default}`);
        });
      }
      console.log('🔍 Initial parameters:', initialParams);
      setParameters(initialParams);
    } else {
      setFunctionDetails(null);
      setParameters({});
    }
  }, [selectedFunction, functions]);

  const testDirectAPI = async () => {
    console.log('🧪 Testing direct API call...');
    try {
      const response = await fetch('http://localhost:4000/api/dynamic/modules');
      const data = await response.json();
      console.log('📥 Direct API response:', data);
      alert('Direct API response: ' + JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('🚨 Direct API error:', err);
      alert('Direct API error: ' + err.message);
    }
  };

  const loadModules = async () => {
    console.log('🔍 Loading modules...');
    setLoading(true);
    setError(null);
    try {
      const response = await apiCall('/api/dynamic/modules');
      console.log('📥 Modules response:', response);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📊 Parsed data:', data);
      
      if (data.success) {
        setModules(data.data);
        console.log('✅ Modules loaded:', data.data);
      } else {
        console.error('❌ Failed to load modules:', data);
        setError('Failed to load modules');
      }
    } catch (err) {
      console.error('🚨 Error loading modules:', err);
      setError(`Error loading modules: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadFunctions = async (moduleName) => {
    console.log('🔍 Loading functions for module:', moduleName);
    setLoading(true);
    setError(null);
    try {
      const response = await apiCall(`/api/dynamic/modules/${moduleName}/functions`);
      console.log('📥 Functions response:', response);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📊 Functions data:', data);
      
      if (data.success) {
        setFunctions(data.data);
        console.log('✅ Functions loaded:', data.data);
      } else {
        console.error('❌ Failed to load functions:', data);
        setError('Failed to load functions');
      }
    } catch (err) {
      console.error('🚨 Error loading functions:', err);
      setError(`Error loading functions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleParameterChange = (paramName, value) => {
    setParameters(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

  const executeFunction = async () => {
    if (!selectedModule || !selectedFunction) {
      setError('Please select both module and function');
      return;
    }

    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      // Convert parameters to appropriate types
      const processedParams = {};
      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== '') {
          // Try to parse as number if it looks like one
          if (!isNaN(value) && !isNaN(parseFloat(value))) {
            processedParams[key] = parseFloat(value);
          } else if (value.toLowerCase() === 'true') {
            processedParams[key] = true;
          } else if (value.toLowerCase() === 'false') {
            processedParams[key] = false;
          } else {
            processedParams[key] = value;
          }
        }
      });

      const response = await apiCall('/api/dynamic/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          module_name: selectedModule,
          function_name: selectedFunction,
          parameters: processedParams
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📊 Execution result:', data);

      if (data.success) {
        setResult(data.data);
      } else {
        setError('Function execution failed');
      }
    } catch (err) {
      setError(`Execution error: ${err.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const renderParameterInput = (paramName, paramInfo) => {
    const value = parameters[paramName] || '';
    console.log(`🎨 Rendering input for parameter: ${paramName}`, paramInfo);
    
    return (
      <TextField
        key={paramName}
        fullWidth
        label={`${paramName} (${paramInfo.type.replace('<class \'', '').replace('\'>', '')})${paramInfo.required ? '' : ' - optional'}`}
        value={value}
        onChange={(e) => handleParameterChange(paramName, e.target.value)}
        helperText={`${paramInfo.required ? 'Required' : 'Optional'}${paramInfo.default && paramInfo.default !== 'null' ? ` - default: ${paramInfo.default}` : ''}`}
        variant="outlined"
        size="small"
        sx={{ mb: 2 }}
        placeholder={`Enter ${paramName}${paramInfo.default && paramInfo.default !== 'null' ? ` (default: ${paramInfo.default})` : ''}`}
        required={paramInfo.required}
      />
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Functions sx={{ mr: 2, color: theme.palette.primary.main }} />
          <Typography variant="h4" component="h1" fontWeight="bold">
            🧪 Dynamic Function Tester
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          Test dynamic module functions with real-time execution and parameter validation
        </Typography>
        
        {/* Debug Test Button */}
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={testDirectAPI}
            sx={{ mr: 2 }}
          >
            🧪 Test Direct API
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={loadModules}
          >
            🔄 Reload Modules
          </Button>
        </Box>
      </Paper>

      <Grid container spacing={3}>
        {/* Module Selection */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Code sx={{ mr: 1 }} />
                1. Select Module
              </Typography>
              
              <FormControl fullWidth variant="outlined">
                <InputLabel>Module</InputLabel>
                <Select
                  value={selectedModule}
                  onChange={(e) => setSelectedModule(e.target.value)}
                  label="Module"
                  disabled={loading}
                >
                  {modules.map((module) => (
                    <MenuItem key={module} value={module}>
                      {module}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}

              {modules.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Found {modules.length} modules
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Function Selection */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <Functions sx={{ mr: 1 }} />
                2. Select Function
              </Typography>
              
              <FormControl fullWidth variant="outlined">
                <InputLabel>Function</InputLabel>
                <Select
                  value={selectedFunction}
                  onChange={(e) => setSelectedFunction(e.target.value)}
                  label="Function"
                  disabled={!selectedModule || loading}
                >
                  {Object.keys(functions).map((funcName) => (
                    <MenuItem key={funcName} value={funcName}>
                      {funcName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {Object.keys(functions).length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Found {Object.keys(functions).length} functions
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Function Details and Parameters */}
        {functionDetails && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <Settings sx={{ mr: 1 }} />
                  3. Configure Parameters
                </Typography>

                {/* Function Documentation */}
                {functionDetails.docstring && (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      <strong>Description:</strong> {functionDetails.docstring}
                    </Typography>
                  </Alert>
                )}

                {/* Parameters Input */}
                <Grid container spacing={2}>
                  {(() => {
                    const params = functionDetails.parameters || {};
                    const paramKeys = Object.keys(params);
                    console.log('🎯 Rendering parameters:', paramKeys);
                    console.log('🎯 Parameters object:', params);
                    
                    if (paramKeys.length === 0) {
                      return (
                        <Grid item xs={12}>
                          <Alert severity="info">
                            This function has no parameters
                          </Alert>
                        </Grid>
                      );
                    }
                    
                    return paramKeys.map(paramName => (
                      <Grid item xs={12} sm={6} key={paramName}>
                        {renderParameterInput(paramName, params[paramName])}
                      </Grid>
                    ));
                  })()}
                </Grid>

                {/* Execute Button */}
                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={executeFunction}
                    disabled={executing}
                    startIcon={executing ? <CircularProgress size={20} /> : <PlayArrow />}
                    sx={{
                      px: 4,
                      py: 1.5,
                      background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                      '&:hover': {
                        background: `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`,
                      }
                    }}
                  >
                    {executing ? 'Executing...' : 'Execute Function'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Results Section */}
        {(result !== null || error) && (
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  {error ? <ErrorIcon sx={{ mr: 1, color: 'error.main' }} /> : <CheckCircle sx={{ mr: 1, color: 'success.main' }} />}
                  4. Execution Results
                </Typography>

                {error && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                  </Alert>
                )}

                {result !== null && (
                  <Box>
                    <Chip 
                      label="Success" 
                      color="success" 
                      sx={{ mb: 2 }}
                      icon={<CheckCircle />}
                    />
                    <Paper
                      sx={{
                        p: 2,
                        bgcolor: alpha(theme.palette.success.main, 0.1),
                        border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`
                      }}
                    >
                      <Typography variant="subtitle2" gutterBottom>
                        Result:
                      </Typography>
                      <Typography 
                        variant="body1" 
                        component="pre" 
                        sx={{ 
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}
                      >
                        {typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}
                      </Typography>
                    </Paper>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Error Display */}
      {error && !result && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default DynamicFunctionTester;