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
          
          // Initialize form data from user_task form_fields
          const initialFormData = {};
          const userTaskData = workflowData.user_task;
          if (userTaskData) {
            let userTask;
            if (Array.isArray(userTaskData)) {
              userTask = userTaskData[0]; // Take first user task
            } else {
              userTask = userTaskData; // Use the object directly
            }
            
            if (userTask && userTask.form_fields) {
              Object.entries(userTask.form_fields).forEach(([key, field]) => {
                initialFormData[key] = field.value || '';
              });
            }
          }
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
        const result = await sharedApiService.makeRequest(
          `/api/workflow/workflows/${workflowId}/instances/${selectedInstance.instance_id}/submit-task`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ data: formData }),
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
          {console.log('🎭 Dialog render - selectedInstance:', selectedInstance)}
          {console.log('🎭 Dialog render - user_task check:', selectedInstance?.user_task)}
          {console.log('🎭 Dialog render - user_task length:', selectedInstance?.user_task?.length)}
          
          {selectedInstance && selectedInstance.user_task && (
            Array.isArray(selectedInstance.user_task) 
              ? selectedInstance.user_task.length > 0 
              : Object.keys(selectedInstance.user_task).length > 0
          ) ? (
            <Box sx={{ mt: 2 }}>
              {(Array.isArray(selectedInstance.user_task) 
                ? selectedInstance.user_task 
                : [selectedInstance.user_task]
              ).map((userTask, taskIndex) => (
                <Card key={taskIndex} sx={{ mb: 2 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {userTask.task_name}
                    </Typography>
                    <Stack spacing={2}>
                      {Object.entries(userTask.form_fields || {}).map(([fieldId, field]) => (
                        <Box key={fieldId}>
                          {field.type === 'boolean' ? (
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={formData[fieldId] || false}
                                  onChange={(e) => handleFormChange(fieldId, e.target.checked)}
                                />
                              }
                              label={field.label}
                            />
                          ) : (
                            <TextField
                              fullWidth
                              label={field.label}
                              value={formData[fieldId] || ''}
                              onChange={(e) => handleFormChange(fieldId, e.target.value)}
                              required={field.required}
                              type={field.type === 'number' ? 'number' : 'text'}
                              variant="outlined"
                            />
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <div>
              <Typography>No user tasks available</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Debug info: selectedInstance exists: {selectedInstance ? 'YES' : 'NO'}
                {selectedInstance && (
                  <>
                    <br />user_task exists: {selectedInstance.user_task ? 'YES' : 'NO'}
                    <br />user_task type: {typeof selectedInstance.user_task}
                    <br />user_task length: {selectedInstance.user_task?.length || 'N/A'}
                    <br />Keys in selectedInstance: {Object.keys(selectedInstance).join(', ')}
                  </>
                )}
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