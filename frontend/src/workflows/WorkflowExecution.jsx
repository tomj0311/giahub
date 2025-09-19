import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  useTheme,
  alpha,
  TextField,
  Stack,
  Chip,
  Divider,
  CircularProgress,
  Tooltip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  ArrowLeft,
  Play,
  RefreshCw,
  CheckCircle2,
  List,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import sharedApiService from '../utils/apiService';


function WorkflowExecution({ user }) {

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const workflowId = searchParams.get('workflow');
  const theme = useTheme();

  // States
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('config'); // Always config since we only have start endpoint
  const [incompleteWorkflows, setIncompleteWorkflows] = useState([]);
  const [loadingIncomplete, setLoadingIncomplete] = useState(false);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [formData, setFormData] = useState({});
  const [submittingTask, setSubmittingTask] = useState(false);

  console.log('🚨 WORKFLOW ID FROM URL:', workflowId);

  const token = useMemo(() => user?.token || localStorage.getItem('token'), [user?.token]);
  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  // Simplified - no status loading since endpoint doesn't exist
  const loadStatus = useCallback(
    async (id) => {
      if (!id) return;
      // Just set mode to config since we only have start endpoint
      setMode('config');
    },
    []
  );

  useEffect(() => {
    setMode('config');
    if (workflowId) {
      loadStatus(workflowId);
      loadIncompleteWorkflows();
    }
  }, [workflowId, loadStatus]);

  const loadIncompleteWorkflows = useCallback(
    async () => {
      if (!workflowId || loadingIncomplete) return;
      
      setLoadingIncomplete(true);
      try {
        const result = await sharedApiService.makeRequest(
          `/api/workflow/workflows/${workflowId}/incomplete`,
          {
            method: 'GET',
            headers,
          },
          { workflowId, action: 'list_incomplete' }
        );

        if (result.success) {
          const workflowsData = result.data;
          const workflows = workflowsData.data || [];
          setIncompleteWorkflows(workflows);
        }
      } catch (err) {
        console.error('Failed to load incomplete workflows:', err);
      } finally {
        setLoadingIncomplete(false);
      }
    },
    [workflowId, headers, loadingIncomplete]
  );

  // Simplified - no instances list since endpoint doesn't exist
  const loadWorkflowInstances = useCallback(
    async (page = 1, status = '', size = 10) => {
      // No-op since this endpoint doesn't exist
    },
    []
  );

  const startWorkflowByConfigId = useCallback(
    async (configId) => {
      if (!configId) return;
      setRunning(true);
      setResult(null);
      setError('');

      try {
        // Use the correct endpoint that exists in the backend
        const result = await sharedApiService.makeRequest(
          `/api/workflow/workflows/${configId}/start`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ initial_data: {} }),
          },
          { configId, action: 'start', token: token?.substring(0, 10) }
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to start workflow');
        }

        setResult({
          message: 'Workflow started successfully',
          data: result.data,
        });

      } catch (err) {
        const message = err?.message || 'Unknown error starting workflow';
        console.error('Workflow start error:', err);
        setError(message);
      } finally {
        setRunning(false);
      }
    },
    [headers]
  );

  const executeWorkflow = useCallback(
    async () => {
      if (!workflowId) return;
      // Always use the start endpoint since that's all we have
      await startWorkflowByConfigId(workflowId);
    },
    [workflowId, startWorkflowByConfigId]
  );

  const handleInstanceClick = useCallback(
    async (instanceId) => {
      try {
        const result = await sharedApiService.makeRequest(
          `/api/workflow/workflows/${workflowId}/instances/${instanceId}`,
          {
            method: 'GET',
            headers,
          },
          { workflowId, instanceId, action: 'get_instance' }
        );

        if (result.success) {
          console.log('🔍 Instance data received:', result.data);
          
          const workflowData = result.data.data;
          console.log('🔍 Workflow data:', workflowData);
          console.log('🔍 User task in workflow data:', workflowData.user_task);
          
          setSelectedInstance(workflowData);
          
          // Find pending tasks (state 16 = READY)
          const pendingTasks = [];
          if (workflowData.serialized_data && workflowData.serialized_data.tasks) {
            Object.entries(workflowData.serialized_data.tasks).forEach(([taskId, task]) => {
              if (task.state === 16) { // READY/PENDING state
                pendingTasks.push({ taskId, ...task });
              }
            });
          }
          
          // Initialize form data based on pending tasks
          const initialFormData = {};
          pendingTasks.forEach(task => {
            if (task.task_spec && task.task_spec.includes('UserTask')) {
              // For UserTask, find matching form fields in the workflow data
              const taskFormData = workflowData[task.task_spec];
              if (taskFormData) {
                Object.entries(taskFormData).forEach(([key, field]) => {
                  initialFormData[key] = field.value || '';
                });
              }
            } else {
              // For ManualTask, add confirmation field
              initialFormData[`confirm_${task.taskId}`] = '';
            }
          });
          
          // Store pending tasks in selected instance for rendering
          workflowData.pendingTasks = pendingTasks;
          setFormData(initialFormData);
          setDialogOpen(true);
        }
      } catch (err) {
        console.error('Failed to get instance details:', err);
        setError('Failed to load instance details');
      }
    },
    [workflowId, headers]
  );

  const handleFormChange = useCallback((fieldId, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  }, []);

  const handleSubmitTask = useCallback(
    async () => {
      if (!selectedInstance) return;
      
      setSubmittingTask(true);
      try {
        // Find the pending UserTask to get its task_spec
        const pendingUserTasks = selectedInstance.pendingTasks?.filter(task => 
          task.task_spec?.includes('UserTask')
        ) || [];
        
        // Create submission data with task ID and form data
        const submissionData = {
          data: formData,
          ...(pendingUserTasks.length > 0 && {
            task_id: pendingUserTasks[0].task_spec // e.g., "UserTask_3"
          })
        };
        
        const result = await sharedApiService.makeRequest(
          `/api/workflow/workflows/${workflowId}/instances/${selectedInstance.instance_id}/submit-task`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(submissionData),
          },
          { workflowId, instanceId: selectedInstance.instance_id, action: 'submit_task' }
        );

        if (result.success) {
          setDialogOpen(false);
          setSelectedInstance(null);
          setFormData({});
          
          // Refresh incomplete workflows list
          await loadIncompleteWorkflows();
          
          // Show success message
          setResult({
            message: result.data.message || 'Task submitted successfully',
            data: result.data,
          });
        }
      } catch (err) {
        console.error('Failed to submit task:', err);
        setError('Failed to submit task data');
      } finally {
        setSubmittingTask(false);
      }
    },
    [selectedInstance, formData, workflowId, headers, loadIncompleteWorkflows]
  );

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedInstance(null);
    setFormData({});
  }, []);

  return (
    <Box
      sx={{
        p: 3,
        background: theme.custom?.backgroundGradient || theme.palette.background.default,
        minHeight: '100vh',
      }}
    >
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/dashboard/monitor')}>
            <ArrowLeft />
          </IconButton>
          <Typography variant="h4" fontWeight="bold">
            Workflow Execution
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Tooltip title="Start workflow">
              <span>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={running ? <CircularProgress color="inherit" size={16} /> : <Play />}
                  disabled={!workflowId || running}
                  onClick={executeWorkflow}
                >
                  {running ? 'Starting…' : 'Start Workflow'}
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      <Box
        sx={{
          p: 4,
          textAlign: 'center',
          background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(
            theme.palette.background.paper,
            0.95
          )})`,
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          borderRadius: 3,
        }}
      >
        <Stack spacing={2} alignItems="center">
          <Typography variant="h5" gutterBottom>
            Ready to start workflow
          </Typography>
          <Typography variant="body1">
            Workflow ID: <strong>{workflowId || 'NOT PROVIDED'}</strong>
          </Typography>
        </Stack>

        <Button
          variant="contained"
          size="large"
          startIcon={<ArrowLeft />}
          onClick={() => navigate('/dashboard/monitor')}
          sx={{ mt: 3 }}
        >
          Back to Monitor Dashboard
        </Button>

        {error && (
          <Box sx={{ mt: 3 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {workflowId && (
          <Box sx={{ mt: 3, textAlign: 'left', mx: 'auto', maxWidth: 720 }}>
            <Typography variant="h6">Incomplete Workflows</Typography>
            {loadingIncomplete ? (
              <CircularProgress size={20} />
            ) : incompleteWorkflows.length > 0 ? (
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Instance ID</TableCell>
                      <TableCell>Created</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {incompleteWorkflows.map((wf) => (
                      <TableRow 
                        key={wf.instance_id} 
                        hover 
                        sx={{ cursor: 'pointer' }}
                        onClick={() => handleInstanceClick(wf.instance_id)}
                      >
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {wf.instance_id}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {new Date(wf.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No incomplete workflows</Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

      </Box>

      {/* User Task Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          Complete User Task
          {selectedInstance && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Instance: {selectedInstance.instance_id}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedInstance && selectedInstance.pendingTasks && selectedInstance.pendingTasks.length > 0 ? (
            <Box sx={{ mt: 2 }}>
              {selectedInstance.pendingTasks.map((task, taskIndex) => (
                <Card key={task.taskId} sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {task.task_spec?.includes('UserTask') ? 
                        (selectedInstance.user_task?.[0]?.task_name || task.task_spec) :
                        task.task_spec
                      }
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Task ID: {task.taskId}
                    </Typography>
                    
                    <Stack spacing={2}>
                      {task.task_spec?.includes('UserTask') ? (
                        // Render UserTask form fields from the task-specific data
                        selectedInstance[task.task_spec] && 
                        Object.entries(selectedInstance[task.task_spec]).map(([fieldId, field]) => (
                          <Box key={fieldId} sx={{ mb: 2 }}>
                            {field.type === 'boolean' ? (
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={formData[fieldId] || false}
                                    onChange={(e) => handleFormChange(fieldId, e.target.checked)}
                                  />
                                }
                                label={field.name || fieldId}
                              />
                            ) : (
                              <TextField
                                fullWidth
                                label={field.name || fieldId}
                                value={formData[fieldId] || ''}
                                onChange={(e) => handleFormChange(fieldId, e.target.value)}
                                required={field.required}
                                type={field.type === 'number' ? 'number' : 'text'}
                                variant="outlined"
                              />
                            )}
                          </Box>
                        ))
                      ) : (
                        // Render ManualTask confirmation
                        <TextField
                          fullWidth
                          label={`Type "yes" to confirm and continue`}
                          value={formData[`confirm_${task.taskId}`] || ''}
                          onChange={(e) => handleFormChange(`confirm_${task.taskId}`, e.target.value)}
                          variant="outlined"
                          placeholder="Type 'yes' to proceed"
                        />
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <div>
              <Typography>No pending tasks available</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                All tasks may be completed or none are ready for execution.
              </Typography>
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmitTask}
            variant="contained"
            disabled={submittingTask}
            startIcon={submittingTask ? <CircularProgress size={16} /> : null}
          >
            {submittingTask ? 'Submitting...' : 'Submit & Continue'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default WorkflowExecution;