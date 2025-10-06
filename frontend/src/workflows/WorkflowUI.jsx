import React, { useState, useEffect, useRef } from 'react';
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
  TextField,
  Autocomplete,
  IconButton,
} from '@mui/material';
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowLeft, Play } from 'lucide-react';
import sharedApiService from '../utils/apiService';
import TaskCompletion from './TaskCompletion';

const POLL_INTERVAL = 2000;
const MAX_POLL_DURATION = 30000;

function WorkflowUI({ user }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const theme = useTheme();
  
  const workflowName = searchParams.get('workflow');
  
  // Simple state
  const [state, setState] = useState('idle'); // idle, loading, running, task_ready, completed, failed
  const [error, setError] = useState('');
  const [workflowId, setWorkflowId] = useState(null);
  const [instanceId, setInstanceId] = useState(null);
  const [pendingTaskId, setPendingTaskId] = useState(null);
  
  // Workflow selector
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  
  const pollInterval = useRef(null);
  const hasStarted = useRef(false);
  const token = user?.token || localStorage.getItem('token');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  // Initialize
  useEffect(() => {
    if (workflowName && !hasStarted.current) {
      hasStarted.current = true;
      
      // Check if we have instance ID in URL params
      const urlInstanceId = searchParams.get('instance');
      if (urlInstanceId) {
        console.log('📍 Found instance ID in URL:', urlInstanceId);
        // Load existing instance instead of starting new one
        loadExistingInstance(urlInstanceId);
      } else {
        startWorkflow();
      }
    } else if (!workflowName) {
      loadWorkflows();
    }
  }, [workflowName]);

  const loadExistingInstance = async (instId) => {
    try {
      setState('loading');
      setError('');
      setInstanceId(instId);

      // Get workflow config to find workflow ID
      const configResult = await sharedApiService.makeRequest(
        '/api/workflows/configs',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
        { action: 'get_configs' }
      );

      const workflow = configResult.data.configurations?.find(w => w.name === workflowName);
      if (!workflow) throw new Error(`Workflow "${workflowName}" not found`);

      const wfId = workflow.id || workflow.workflow_id || workflow._id;
      setWorkflowId(wfId);

      setState('running');
      pollStatus(wfId, instId);

    } catch (err) {
      setError(err.message);
      setState('failed');
    }
  };

  const loadWorkflows = async () => {
    try {
      setState('loading');
      const result = await sharedApiService.makeRequest(
        '/api/workflows/configs',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
        { action: 'get_configs' }
      );

      if (result.success) {
        setWorkflows(result.data.configurations || []);
        setState('idle');
      } else {
        setError('Failed to load workflows');
        setState('failed');
      }
    } catch (err) {
      setError(err.message);
      setState('failed');
    }
  };

  const startWorkflow = async () => {
    try {
      setState('loading');
      setError('');

      // Get workflow config
      const configResult = await sharedApiService.makeRequest(
        '/api/workflows/configs',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
        { action: 'get_configs' }
      );

      const workflow = configResult.data.configurations?.find(w => w.name === workflowName);
      if (!workflow) throw new Error(`Workflow "${workflowName}" not found`);

      const wfId = workflow.id || workflow.workflow_id || workflow._id;
      setWorkflowId(wfId);

      // Start workflow
      const startResult = await sharedApiService.makeRequest(
        `/api/workflow/workflows/${wfId}/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            initial_data: { workflow_name: workflowName }
          }),
        },
        { workflowId: wfId, action: 'start_workflow' }
      );

      const instId = startResult.data.instance_id;
      setInstanceId(instId);
      
      // IMMEDIATELY update URL with instance ID to prevent duplicates on refresh
      setSearchParams({ workflow: workflowName, instance: instId });
      
      setState('running');

      // Start polling
      pollStatus(wfId, instId);

    } catch (err) {
      setError(err.message);
      setState('failed');
    }
  };

  const pollStatus = (wfId, instId) => {
    if (pollInterval.current) clearInterval(pollInterval.current);

    const startTime = Date.now();
    
    const check = async () => {
      try {
        console.log('🔍 Polling instance:', instId);
        
        // Invalidate cache to get fresh data
        sharedApiService.invalidateCache(`/api/workflow/workflows/${wfId}/instances/${instId}`);
        
        const result = await sharedApiService.makeRequest(
          `/api/workflow/workflows/${wfId}/instances/${instId}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
          { workflowId: wfId, instanceId: instId, timestamp: Date.now(), bypassCache: true }
        );

        if (!result.success) {
          console.error('❌ Failed to get instance data');
          return;
        }

        const instance = result.data.data;
        const tasks = instance.serialized_data?.tasks || {};
        const workflowData = instance.serialized_data?.data || {};
        
        console.log('📊 Tasks:', Object.keys(tasks).length);
        console.log('📊 Completed:', instance.serialized_data?.completed);
        
        // FIRST: Check for ANY failed task (state 128 = FAILED)
        const failedTask = Object.entries(tasks).find(([taskId, task]) => {
          console.log(`  Task ${task.task_spec}: state=${task.state}`);
          return task.state === 128;
        });
        
        if (failedTask) {
          const [taskId, task] = failedTask;
          console.log('❌ Found failed task:', task.task_spec);
          clearInterval(pollInterval.current);
          
          // Try to get error message from task data or workflow data
          const errorMsg = task.data?.error || 
                          task.data?.error_message || 
                          workflowData.error || 
                          workflowData.error_message ||
                          `Task "${task.task_spec}" failed during execution`;
          
          setState('failed');
          setError(errorMsg);
          return;
        }

        // Check for ready tasks (state 16 = READY)
        const readyTask = Object.entries(tasks).find(([taskId, task]) => task.state === 16);
        
        if (readyTask) {
          console.log('✅ Found ready task:', readyTask[1].task_spec);
          clearInterval(pollInterval.current);
          setPendingTaskId(readyTask[1].task_spec);
          setState('task_ready');
          return;
        }

        // Check if completed
        const workflowState = instance.serialized_data?.workflow?.state;
        const isCompleted = instance.serialized_data?.completed === true;
        
        console.log('📊 Workflow state:', workflowState, 'Completed:', isCompleted);
        
        if (workflowState === 64 || isCompleted) {
          console.log('✅ Workflow completed');
          clearInterval(pollInterval.current);
          setState('completed');
          return;
        }

        // Check if workflow itself is in failed state
        if (workflowState === 128 || workflowState === 256) {
          console.log('❌ Workflow failed');
          clearInterval(pollInterval.current);
          const errorMsg = workflowData.error || workflowData.error_message || 'Workflow execution failed';
          setState('failed');
          setError(errorMsg);
          return;
        }

        // Check timeout
        if (Date.now() - startTime > MAX_POLL_DURATION) {
          console.log('⏰ Polling timeout');
          clearInterval(pollInterval.current);
          setState('failed');
          setError('Workflow polling timeout - no task became ready within 30 seconds');
        }
      } catch (err) {
        console.error('❌ Poll error:', err);
        // Don't stop polling on error, just log it
      }
    };

    check();
    pollInterval.current = setInterval(check, POLL_INTERVAL);
  };

  const handleTaskSuccess = () => {
    setPendingTaskId(null);
    setState('running');
    pollStatus(workflowId, instanceId);
  };

  const getStateIcon = () => {
    switch (state) {
      case 'loading':
      case 'running':
        return <Clock size={16} />;
      case 'task_ready':
        return <AlertTriangle size={16} />;
      case 'completed':
        return <CheckCircle size={16} />;
      case 'failed':
        return <XCircle size={16} />;
      default:
        return <Clock size={16} />;
    }
  };

  const getStateLabel = () => {
    switch (state) {
      case 'loading':
        return 'Starting...';
      case 'running':
        return 'Running';
      case 'task_ready':
        return 'Ready';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Idle';
    }
  };

  const getStateColor = () => {
    switch (state) {
      case 'loading':
      case 'running':
        return 'info';
      case 'task_ready':
        return 'warning';
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  // Workflow selector screen
  if (!workflowName) {
    return (
      <Box sx={{ p: 3 }}>
        {/* Header */}
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/dashboard/monitor')}>
            <ArrowLeft />
          </IconButton>
          <Typography variant="h5" fontWeight="bold">
            Run Workflow
          </Typography>
        </Box>

        <Card sx={{ maxWidth: 600 }}>
          <CardContent sx={{ p: 4 }}>
            {state === 'loading' ? (
              <Box sx={{ display: 'flex', alignItems: 'center', py: 4 }}>
                <CircularProgress size={40} />
                <Typography sx={{ ml: 2 }}>Loading...</Typography>
              </Box>
            ) : error ? (
              <Alert severity="error">{error}</Alert>
            ) : (
              <>
                <Autocomplete
                  options={workflows}
                  getOptionLabel={(option) => option.name || 'Unnamed'}
                  value={selectedWorkflow}
                  onChange={(_, newValue) => setSelectedWorkflow(newValue)}
                  renderInput={(params) => (
                    <TextField {...params} label="Select Workflow" variant="outlined" />
                  )}
                  sx={{ mb: 3 }}
                />
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<Play size={20} />}
                  onClick={() => {
                    if (selectedWorkflow) {
                      // Reset hasStarted ref to allow workflow to start
                      hasStarted.current = false;
                      setSearchParams({ workflow: selectedWorkflow.name });
                    }
                  }}
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

  // Main workflow screen
  return (
    <Box sx={{ p: 0, height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => {
            hasStarted.current = false;
            setSearchParams({});
          }}>
            <ArrowLeft />
          </IconButton>
          <Typography variant="h5" fontWeight="bold">
            {workflowName}
          </Typography>
          <Chip icon={getStateIcon()} label={getStateLabel()} color={getStateColor()} />
        </Box>
      </Box>

      {/* Two Column Layout */}
      <Box sx={{ display: 'flex', height: 'calc(100vh - 185px)', width: '100%', overflow: 'hidden' }}>
        
        {/* Left Pane - Workflow Info */}
        <Box sx={{ 
          width: '400px', 
          minWidth: '400px',
          maxWidth: '400px',
          borderRight: '1px solid', 
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          p: 3,
          gap: 2,
        }}>
          {workflowId && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Workflow ID
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {workflowId}
              </Typography>
            </Paper>
          )}

          {instanceId && (
            <Paper sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Instance ID
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {instanceId}
              </Typography>
            </Paper>
          )}
        </Box>

        {/* Right Pane - Main Content */}
        <Box sx={{ 
          flex: 1,
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'auto',
          minWidth: 0
        }}>
          {state === 'loading' && (
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
              <Typography variant="h6">Starting workflow...</Typography>
            </Box>
          )}

          {state === 'running' && (
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
              <Typography variant="h6">Workflow running...</Typography>
            </Box>
          )}

          {state === 'task_ready' && pendingTaskId && (
            <TaskCompletion
              user={user}
              workflowId={workflowId}
              instanceId={instanceId}
              taskId={pendingTaskId}
              isDialog={false}
              onSuccess={handleTaskSuccess}
            />
          )}

          {state === 'completed' && (
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
              <Button variant="contained" onClick={() => {
                hasStarted.current = false;
                setSearchParams({});
              }}>
                Back to Workflows
              </Button>
            </Box>
          )}

          {state === 'failed' && (
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
              <Typography variant="h5" color="error" gutterBottom>
                Workflow Failed
              </Typography>
              <Alert severity="error" sx={{ maxWidth: 600, width: '100%' }}>
                <Typography variant="body1" gutterBottom fontWeight="bold">
                  Error Details:
                </Typography>
                <Typography 
                  variant="body2" 
                  component="pre" 
                  sx={{ 
                    whiteSpace: 'pre-wrap', 
                    wordBreak: 'break-word',
                    fontFamily: 'monospace',
                    mt: 1 
                  }}
                >
                  {error || 'The workflow encountered an error during execution'}
                </Typography>
              </Alert>
              <Button 
                variant="contained" 
                onClick={() => {
                  hasStarted.current = false;
                  setSearchParams({});
                }}
                sx={{ mt: 2 }}
              >
                Back to Workflows
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default WorkflowUI;
