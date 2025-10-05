import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Paper,
  useTheme,
  alpha,
  Chip,
  Button,
  Grid,
  TextField,
  Autocomplete,
} from '@mui/material';
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowLeft, Play } from 'lucide-react';
import sharedApiService from '../utils/apiService';
import TaskCompletion from './TaskCompletion';

const POLL_INTERVAL = 2000; // Poll every 2 seconds
const MAX_POLL_DURATION = 30000; // 30 seconds max polling

function WorkflowUI({ user }) {
  console.log('🚀🚀🚀 WORKFLOW UI COMPONENT IS RENDERING 🚀🚀🚀');
  console.log('User prop:', user);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  
  const workflowName = searchParams.get('workflow');
  console.log('Workflow name from URL:', workflowName);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workflowId, setWorkflowId] = useState(null);
  const [instanceId, setInstanceId] = useState(null);
  const [instanceData, setInstanceData] = useState(null);
  const [pendingTaskId, setPendingTaskId] = useState(null);
  const [workflowState, setWorkflowState] = useState('starting'); // starting, running, ready, completed, failed, timeout
  const [pollingCount, setPollingCount] = useState(0);
  
  // Workflow selector states
  const [availableWorkflows, setAvailableWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  
  const pollingIntervalRef = useRef(null);
  const startTimeRef = useRef(null);

  const token = useMemo(() => user?.token || localStorage.getItem('token'), [user?.token]);
  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Start workflow when component mounts
  useEffect(() => {
    if (workflowName) {
      startWorkflow();
    } else {
      // Load available workflows for selection
      loadAvailableWorkflows();
    }
  }, [workflowName]);

  const loadAvailableWorkflows = async () => {
    try {
      setLoadingWorkflows(true);
      setLoading(false); // Not loading the main workflow, just the list
      
      console.log('📋 Loading available workflows...');
      
      const result = await sharedApiService.makeRequest(
        '/api/workflows/configs',
        {
          method: 'GET',
          headers,
        },
        { action: 'get_configs' }
      );

      console.log('📋 API Response:', result);

      if (result.success) {
        const configs = result.data.configurations || [];
        console.log('📋 Available workflows:', configs);
        setAvailableWorkflows(configs);
        if (configs.length === 0) {
          setError('No workflows available. Please create a workflow first.');
        }
      } else {
        setError('Failed to load available workflows');
      }
    } catch (err) {
      console.error('❌ Failed to load workflows:', err);
      setError('Failed to load available workflows: ' + err.message);
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const handleWorkflowSelect = () => {
    if (selectedWorkflow) {
      // Update URL with selected workflow name
      setSearchParams({ workflow: selectedWorkflow.name });
    }
  };

  const startWorkflow = async () => {
    try {
      setLoading(true);
      setError('');
      setWorkflowState('starting');
      startTimeRef.current = Date.now();

      console.log('🚀 Starting workflow:', workflowName);

      // First, get the workflow configuration to find the workflow ID
      const configResult = await sharedApiService.makeRequest(
        '/api/workflows/configs',
        {
          method: 'GET',
          headers,
        },
        { action: 'get_configs' }
      );

      if (!configResult.success) {
        throw new Error('Failed to fetch workflow configurations');
      }

      // Find the workflow by name
      const configs = configResult.data.configurations || [];
      const workflow = configs.find(w => w.name === workflowName);

      if (!workflow) {
        throw new Error(`Workflow "${workflowName}" not found`);
      }

      const foundWorkflowId = workflow.id || workflow.workflow_id || workflow._id;
      if (!foundWorkflowId) {
        throw new Error(`Workflow "${workflowName}" has no valid ID`);
      }
      
      setWorkflowId(foundWorkflowId);

      console.log('✅ Found workflow ID:', foundWorkflowId);

      // Start the workflow
      const startResult = await sharedApiService.makeRequest(
        `/api/workflow/workflows/${foundWorkflowId}/start`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            initial_data: {
              workflow_name: workflowName,
              started_from: 'workflow_ui',
            }
          }),
        },
        { workflowId: foundWorkflowId, action: 'start_workflow' }
      );

      if (!startResult.success) {
        throw new Error('Failed to start workflow');
      }

      const newInstanceId = startResult.data.instance_id;
      setInstanceId(newInstanceId);
      setWorkflowState('running');

      console.log('✅ Workflow started with instance ID:', newInstanceId);

      // Start polling for the instance status
      startPolling(foundWorkflowId, newInstanceId);

    } catch (err) {
      console.error('❌ Failed to start workflow:', err);
      setError(err.message || 'Failed to start workflow');
      setWorkflowState('failed');
      setLoading(false);
    }
  };

  const startPolling = (wfId, instId) => {
    console.log('📡 Starting to poll for instance:', instId);
    
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Initial check
    checkInstanceStatus(wfId, instId);

    // Set up polling interval
    pollingIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      
      if (elapsed > MAX_POLL_DURATION) {
        console.log('⏰ Polling timeout reached');
        clearInterval(pollingIntervalRef.current);
        setWorkflowState('timeout');
        setLoading(false);
        return;
      }

      checkInstanceStatus(wfId, instId);
      setPollingCount(prev => prev + 1);
    }, POLL_INTERVAL);
  };

  const checkInstanceStatus = async (wfId, instId) => {
    try {
      console.log('🔍 Checking instance status:', instId);

      const result = await sharedApiService.makeRequest(
        `/api/workflow/workflows/${wfId}/instances/${instId}`,
        {
          method: 'GET',
          headers,
        },
        { workflowId: wfId, instanceId: instId, action: 'get_instance', timestamp: Date.now() }
      );

      if (!result.success) {
        console.warn('Failed to get instance data');
        return;
      }

      const instance = result.data.data;
      setInstanceData(instance);

      // Check for pending tasks (state 16 = READY)
      const tasks = instance.serialized_data?.tasks || {};
      const pendingTasks = Object.entries(tasks)
        .filter(([taskId, task]) => task.state === 16)
        .map(([taskId, task]) => ({
          taskId,
          taskSpec: task.task_spec,
          task: task
        }));

      if (pendingTasks.length > 0) {
        console.log('✅ Found pending task:', pendingTasks[0].taskSpec);
        setPendingTaskId(pendingTasks[0].taskSpec);
        setWorkflowState('ready');
        setLoading(false);
        
        // Stop polling - we found a task
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        return;
      }

      // Check if workflow is complete
      const workflowStatus = instance.serialized_data?.workflow?.state;
      if (workflowStatus === 64) { // COMPLETED state
        console.log('✅ Workflow completed');
        setWorkflowState('completed');
        setLoading(false);
        
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        return;
      }

      // Check for error state (128 or other error states)
      if (workflowStatus === 128 || workflowStatus === 256) {
        console.log('❌ Workflow failed');
        setWorkflowState('failed');
        setLoading(false);
        
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        return;
      }

      console.log('⏳ Workflow still running, status:', workflowStatus);

    } catch (err) {
      console.error('❌ Error checking instance status:', err);
    }
  };

  const handleTaskSuccess = () => {
    console.log('✅ Task submitted successfully, resuming polling...');
    setWorkflowState('running');
    setPendingTaskId(null);
    
    // Resume polling to check for completion or next task
    if (workflowId && instanceId) {
      startPolling(workflowId, instanceId);
    }
  };

  const renderLeftPanel = () => {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          p: 3,
          height: '100%',
        }}
      >
        <Box>
          <Button
            startIcon={<ArrowLeft size={16} />}
            onClick={() => navigate('/dashboard/monitor')}
            sx={{ mb: 2 }}
          >
            Back to Workflows
          </Button>
          
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            {workflowName || 'Workflow'}
          </Typography>
          
          <Chip
            icon={getStateIcon()}
            label={getStateLabel()}
            color={getStateColor()}
            sx={{ mt: 1 }}
          />
        </Box>

        {workflowId && (
          <Paper sx={{ p: 2, bgcolor: alpha(theme.palette.background.paper, 0.5) }}>
            <Typography variant="caption" color="text.secondary">
              Workflow ID
            </Typography>
            <Typography variant="body2" fontWeight="mono">
              {workflowId}
            </Typography>
          </Paper>
        )}

        {instanceId && (
          <Paper sx={{ p: 2, bgcolor: alpha(theme.palette.background.paper, 0.5) }}>
            <Typography variant="caption" color="text.secondary">
              Instance ID
            </Typography>
            <Typography variant="body2" fontWeight="mono">
              {instanceId}
            </Typography>
          </Paper>
        )}

        {pollingCount > 0 && workflowState === 'running' && (
          <Paper sx={{ p: 2, bgcolor: alpha(theme.palette.info.main, 0.1) }}>
            <Typography variant="caption" color="text.secondary">
              Status Checks
            </Typography>
            <Typography variant="body2">
              {pollingCount} checks
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Checking every {POLL_INTERVAL / 1000}s (max {MAX_POLL_DURATION / 1000}s)
            </Typography>
          </Paper>
        )}
      </Box>
    );
  };

  const renderRightPanel = () => {
    if (loading && workflowState === 'starting') {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
          }}
        >
          <CircularProgress size={60} />
          <Typography variant="h6" color="text.secondary">
            Starting workflow...
          </Typography>
        </Box>
      );
    }

    if (workflowState === 'running') {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
          }}
        >
          <CircularProgress size={60} />
          <Typography variant="h6" color="text.secondary">
            Workflow is running...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Waiting for tasks or completion
          </Typography>
        </Box>
      );
    }

    if (error || workflowState === 'failed') {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
            p: 3,
          }}
        >
          <XCircle size={64} color={theme.palette.error.main} />
          <Typography variant="h5" color="error">
            Workflow Failed
          </Typography>
          <Alert severity="error" sx={{ maxWidth: 500 }}>
            {error || 'The workflow encountered an error during execution'}
          </Alert>
          <Button
            variant="contained"
            onClick={() => navigate('/dashboard/monitor')}
            sx={{ mt: 2 }}
          >
            Back to Workflows
          </Button>
        </Box>
      );
    }

    if (workflowState === 'timeout') {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
            p: 3,
          }}
        >
          <AlertTriangle size={64} color={theme.palette.warning.main} />
          <Typography variant="h5" color="warning.main">
            Polling Timeout
          </Typography>
          <Alert severity="warning" sx={{ maxWidth: 500 }}>
            The workflow did not complete or show a ready task within {MAX_POLL_DURATION / 1000} seconds.
            The workflow may still be running in the background.
          </Alert>
          <Button
            variant="contained"
            onClick={() => navigate('/dashboard/monitor')}
            sx={{ mt: 2 }}
          >
            Back to Workflows
          </Button>
        </Box>
      );
    }

    if (workflowState === 'completed') {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 2,
            p: 3,
          }}
        >
          <CheckCircle size={64} color={theme.palette.success.main} />
          <Typography variant="h5" color="success.main">
            Workflow Completed!
          </Typography>
          <Alert severity="success" sx={{ maxWidth: 500 }}>
            The workflow has completed successfully without any user tasks.
          </Alert>
          <Button
            variant="contained"
            onClick={() => navigate('/dashboard/monitor')}
            sx={{ mt: 2 }}
          >
            Back to Workflows
          </Button>
        </Box>
      );
    }

    if (workflowState === 'ready' && workflowId && instanceId && pendingTaskId) {
      return (
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <TaskCompletion
            user={user}
            workflowId={workflowId}
            instanceId={instanceId}
            taskId={pendingTaskId}
            isDialog={false}
            onSuccess={handleTaskSuccess}
          />
        </Box>
      );
    }

    return null;
  };

  const getStateIcon = () => {
    switch (workflowState) {
      case 'starting':
      case 'running':
        return <Clock size={16} />;
      case 'ready':
        return <AlertTriangle size={16} />;
      case 'completed':
        return <CheckCircle size={16} />;
      case 'failed':
      case 'timeout':
        return <XCircle size={16} />;
      default:
        return <Clock size={16} />;
    }
  };

  const getStateLabel = () => {
    switch (workflowState) {
      case 'starting':
        return 'Starting...';
      case 'running':
        return 'Running';
      case 'ready':
        return 'Task Ready';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'timeout':
        return 'Timeout';
      default:
        return 'Unknown';
    }
  };

  const getStateColor = () => {
    switch (workflowState) {
      case 'starting':
      case 'running':
        return 'info';
      case 'ready':
        return 'warning';
      case 'completed':
        return 'success';
      case 'failed':
      case 'timeout':
        return 'error';
      default:
        return 'default';
    }
  };

  // Show workflow selector if no workflow is selected
  if (!workflowName) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.custom?.backgroundGradient || theme.palette.background.default,
          p: 3,
        }}
      >
        <Card sx={{ maxWidth: 600, width: '100%' }}>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ mb: 3 }}>
              <Button
                startIcon={<ArrowLeft size={16} />}
                onClick={() => navigate('/dashboard/monitor')}
                sx={{ mb: 2 }}
              >
                Back to Workflows
              </Button>
              
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Run Workflow
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Select a workflow to execute
              </Typography>
            </Box>

            {loadingWorkflows ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={40} />
                <Typography sx={{ ml: 2 }}>Loading workflows...</Typography>
              </Box>
            ) : error ? (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            ) : (
              <>
                <Autocomplete
                  options={availableWorkflows}
                  getOptionLabel={(option) => option.name || 'Unnamed Workflow'}
                  value={selectedWorkflow}
                  onChange={(event, newValue) => setSelectedWorkflow(newValue)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Workflow"
                      placeholder="Choose a workflow to run"
                      variant="outlined"
                    />
                  )}
                  renderOption={(props, option) => (
                    <li {...props}>
                      <Box>
                        <Typography variant="body1">
                          {option.name || 'Unnamed Workflow'}
                        </Typography>
                        {option.description && (
                          <Typography variant="caption" color="text.secondary">
                            {option.description}
                          </Typography>
                        )}
                      </Box>
                    </li>
                  )}
                  sx={{ mb: 3 }}
                />

                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<Play size={20} />}
                  onClick={handleWorkflowSelect}
                  disabled={!selectedWorkflow}
                >
                  Start Workflow
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100vh',
        width: '100%',
        display: 'flex',
        background: theme.custom?.backgroundGradient || theme.palette.background.default,
      }}
    >
      {/* Left Panel - Info/Status */}
      <Box
        sx={{
          width: '30%',
          minWidth: 300,
          borderRight: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha(theme.palette.background.paper, 0.3),
          backdropFilter: 'blur(10px)',
          overflow: 'auto',
        }}
      >
        {renderLeftPanel()}
      </Box>

      {/* Right Panel - Task Completion or Status */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
        }}
      >
        {renderRightPanel()}
      </Box>
    </Box>
  );
}

export default WorkflowUI;
