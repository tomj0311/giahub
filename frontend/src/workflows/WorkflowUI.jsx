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
  const [readyTaskData, setReadyTaskData] = useState(null); // Store complete ready task data
  
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
    // ALWAYS load workflows on mount
    loadWorkflows();
    
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
        const workflowData = instance.serialized_data?.data || {};
        const tasks = instance.serialized_data?.tasks || {};
        
        // CHECK 1: Is workflow complete? (Only check the completed flag!)
        const isCompleted = instance.serialized_data?.completed === true || 
                           workflowData.workflow_status?.completed === true;
        
        if (isCompleted) {
          console.log('✅ Workflow completed successfully!');
          clearInterval(pollInterval.current);
          setState('completed');
          return;
        }
        
        // CHECK 2: Any failed task (state 128)?
        const failedTask = Object.entries(tasks).find(([taskId, task]) => task.state === 128);
        if (failedTask) {
          const [taskId, task] = failedTask;
          console.log('❌ Found failed task:', task.task_spec);
          clearInterval(pollInterval.current);
          
          const errorMsg = task.data?.error || 
                          task.data?.error_message || 
                          workflowData.error || 
                          workflowData.error_message ||
                          `Task "${task.task_spec}" failed during execution`;
          
          setState('failed');
          setError(errorMsg);
          return;
        }
        
        // CHECK 3: Check for ready tasks (only UserTask or ManualTask)
        const readyTask = Object.entries(tasks).find(([taskId, task]) => {
          const taskSpec = task.task_spec?.toLowerCase() || '';
          return task.state === 16 && (taskSpec.includes('usertask') || taskSpec.includes('manualtask'));
        });
        
        if (readyTask) {
          const [taskId, task] = readyTask;
          console.log('✅ Found ready task:', task.task_spec);
          clearInterval(pollInterval.current);
          
          // Store task data and show TaskCompletion
          setReadyTaskData({ taskSpec: task.task_spec });
          setPendingTaskId(task.task_spec);
          setState('task_ready');
          return;
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
    setReadyTaskData(null);
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

  // Main workflow screen
  return (
    <Box sx={{ p: 0, height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/dashboard/monitor')}>
            <ArrowLeft />
          </IconButton>
          <Typography variant="h5" fontWeight="bold">
            {workflowName || 'Run Workflow'}
          </Typography>
          {workflowName && <Chip icon={getStateIcon()} label={getStateLabel()} color={getStateColor()} />}
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
          overflow: 'auto',
          p: 3,
          gap: 2,
        }}>
          {/* Workflow Selector - ALWAYS VISIBLE */}
          <Typography variant="h6" gutterBottom>
            Select a Workflow
          </Typography>
          {state === 'loading' && workflows.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', py: 4 }}>
              <CircularProgress size={40} />
              <Typography sx={{ ml: 2 }}>Loading...</Typography>
            </Box>
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
                sx={{ mb: 2 }}
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

          {/* Workflow Info - Show when workflow is running */}
          {workflowName && (
            <>
              <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
                Running Workflow
              </Typography>
              
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
            </>
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
          {!workflowName && (
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
              <Typography variant="h6" color="text.secondary">
                Select a workflow from the left panel to get started
              </Typography>
            </Box>
          )}

          {workflowName && state === 'loading' && (
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

          {workflowName && state === 'running' && (
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

          {workflowName && state === 'task_ready' && readyTaskData && (
            <TaskCompletion
              key={readyTaskData.taskSpec} // Force re-render with new task
               user={user}
              workflowId={workflowId}
              instanceId={instanceId}
              taskId={readyTaskData.taskSpec}
              isDialog={false}
              onSuccess={handleTaskSuccess}
            />
          )}

          {workflowName && state === 'completed' && (
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
                // Reset all state
                hasStarted.current = false;
                setWorkflowId(null);
                setInstanceId(null);
                setPendingTaskId(null);
                setReadyTaskData(null);
                setState('idle');
                setError('');
                if (pollInterval.current) clearInterval(pollInterval.current);
                
                // Clear URL and reload workflows
                setSearchParams({});
                loadWorkflows();
              }}>
                Back to Workflows
              </Button>
            </Box>
          )}

          {workflowName && state === 'failed' && (
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
                Failed
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
                  // Reset all state
                  hasStarted.current = false;
                  setWorkflowId(null);
                  setInstanceId(null);
                  setPendingTaskId(null);
                  setReadyTaskData(null);
                  setState('idle');
                  setError('');
                  if (pollInterval.current) clearInterval(pollInterval.current);
                  
                  // Clear URL and reload workflows
                  setSearchParams({});
                  loadWorkflows();
                }}
                sx={{ mt: 2 }}
              >
                Back
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default WorkflowUI;
