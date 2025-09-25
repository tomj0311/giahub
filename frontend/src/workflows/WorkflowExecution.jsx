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
  Trash2,
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
  const [refreshKey, setRefreshKey] = useState(0); // Force re-render key
  const [deleting, setDeleting] = useState(new Set()); // Track which instances are being deleted
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [formData, setFormData] = useState({});
  const [submittingTask, setSubmittingTask] = useState(false);

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
    async (force = false) => {
      if (!workflowId || (!force && loadingIncomplete)) {
        return;
      }
      
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
          setRefreshKey((k) => k + 1);
        }
      } catch (err) {
        console.error('❌ Failed to load incomplete workflows:', err);
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

        setResult({ message: 'Workflow started successfully', data: result.data });

        // Optimistically add the new instance to the list without refetching
        const newInstance = {
          instance_id: result.data.instance_id,
          created_at: new Date().toISOString(),
          workflow_id: workflowId,
        };
        setIncompleteWorkflows((prev) => {
          if (!result.data.instance_id || prev.some((w) => w.instance_id === result.data.instance_id)) return prev;
          return [newInstance, ...prev];
        });
        setRefreshKey((k) => k + 1);

        // Invalidate cache so the next manual fetch gets fresh data
        sharedApiService.invalidateCache(`/api/workflow/workflows/${workflowId}/incomplete`);

      } catch (err) {
        const message = err?.message || 'Unknown error starting workflow';
        console.error('Workflow start error:', err);
        setError(message);
      } finally {
        setRunning(false);
      }
    },
    [headers, workflowId, token]
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
          const workflowData = result.data.data;
          setSelectedInstance(workflowData);
          
          // Find pending and error tasks (state 16 = READY, state 128 = ERROR)
          const pendingTasks = [];
          const errorTasks = [];
          if (workflowData.serialized_data && workflowData.serialized_data.tasks) {
            Object.entries(workflowData.serialized_data.tasks).forEach(([taskId, task]) => {
              if (task.state === 16) { // READY/PENDING state
                pendingTasks.push({ taskId, ...task, taskType: 'pending' });
              } else if (task.state === 128) { // ERROR state
                errorTasks.push({ taskId, ...task, taskType: 'error' });
              }
            });
          }
          
          // Combine pending and error tasks for display
          const allActionableTasks = [...pendingTasks, ...errorTasks];
          
          // Check for direct task data (Task_1, Task_2, etc.) and add to actionable if not already present
          Object.keys(workflowData).forEach(key => {
            if (key.startsWith('Task_') && workflowData[key]?.formField) {
              // Add this as a pending task if not already in the list
              const existingTask = allActionableTasks.find(t => t.task_spec === key);
              if (!existingTask) {
                allActionableTasks.push({
                  taskId: `${key}_direct`,
                  task_spec: key,
                  state: 16, // Mark as ready
                  typename: 'UserTask', // Explicitly mark as UserTask
                  taskType: 'pending'
                });
              }
            }
          });
          
          // Helper to extract field entries for a given task spec from stored instance data
          const getFieldEntries = (instanceObj, taskSpec) => {
            // First try to get form fields from task spec extensions
            const spec = instanceObj.serialized_data?.spec?.task_specs?.[taskSpec];
            if (spec?.extensions?.formData?.formFields) {
              const entries = [];
              const formFields = Array.isArray(spec.extensions.formData.formFields) 
                ? spec.extensions.formData.formFields 
                : [spec.extensions.formData.formFields];
              formFields.forEach(f => {
                if (f?.id) {
                  entries.push([
                    f.id,
                    {
                      name: f.label || f.id,
                      type: f.type || 'string',
                      required: f.required === 'true' || f.required === true,
                    },
                  ]);
                }
              });
              return entries;
            }
            
            // Fallback to legacy structure
            const obj = instanceObj?.[taskSpec];
            if (!obj) return [];
            // Support both legacy shape ({formField, formData}) and direct mapping
            if (obj.formField || obj.formData) {
              const entries = [];
              if (obj.formField) {
                // Handle both array and single object formats
                const formFields = Array.isArray(obj.formField) ? obj.formField : [obj.formField];
                formFields.forEach(f => {
                  if (f?.id) {
                    entries.push([
                      f.id,
                      {
                        name: f.label || f.id,
                        type: f.type || 'string',
                        required: f.required === 'true' || f.required === true,
                      },
                    ]);
                  }
                });
              }
              if (obj.formData && typeof obj.formData === 'object') {
                Object.entries(obj.formData).forEach(([k, v]) => {
                  if (v && typeof v === 'object') entries.push([k, v]);
                });
              }
              return entries;
            }
            return Object.entries(obj);
          };

          // Initialize form data based on actionable tasks using BPMN spec to detect UserTask
          const initialFormData = {};
          allActionableTasks.forEach((task) => {
            const spec = workflowData.serialized_data?.spec?.task_specs?.[task.task_spec];
            const hasFormField = workflowData[task.task_spec]?.formField || spec?.extensions?.formData?.formFields;
            const isUserTask = spec?.typename === 'UserTask' || spec?.manual === true || hasFormField;
            if (isUserTask) {
              const entries = getFieldEntries(workflowData, task.task_spec);
              entries.forEach(([key, field]) => {
                initialFormData[key] = field?.value || '';
              });
            } else {
              initialFormData[`confirm_${task.taskId}`] = '';
            }
          });
          
          // Store actionable tasks in selected instance for rendering
          workflowData.pendingTasks = allActionableTasks;
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
        console.log('DEBUG - selectedInstance:', selectedInstance);
        console.log('DEBUG - pendingTasks:', selectedInstance.pendingTasks);
        
        // Just take the first pending task - no filtering bullshit
        const firstPendingTask = selectedInstance.pendingTasks?.[0];
        
        if (!firstPendingTask) {
          throw new Error('No pending tasks found');
        }
        
        // Create submission data with task ID and form data
        const submissionData = {
          data: formData,
          task_id: firstPendingTask.task_spec
        };
        
        console.log('DEBUG - submissionData:', submissionData);
        
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

          // Optimistically update the list: remove if completed
          const completed = !!result.data?.completed;
          const nextTaskId = result.data?.current_task_id;
          if (completed) {
            setIncompleteWorkflows((prev) => prev.filter((w) => w.instance_id !== selectedInstance.instance_id));
            setRefreshKey((k) => k + 1);
          } else {
            // Not completed: update list item with next task id (if we want to display later)
            setIncompleteWorkflows((prev) => prev.map((w) => (
              w.instance_id === selectedInstance.instance_id ? { ...w, current_task_id: nextTaskId } : w
            )));
            setRefreshKey((k) => k + 1);
          }
          // Invalidate cache so future fetches are fresh (no immediate refetch here)
          sharedApiService.invalidateCache(`/api/workflow/workflows/${workflowId}/incomplete`);
          // Also invalidate the specific instance cache so reopening shows the next task
          sharedApiService.invalidateCache(`/api/workflow/workflows/${workflowId}/instances/${selectedInstance.instance_id}`);
          
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
    [selectedInstance, formData, workflowId, headers]
  );

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedInstance(null);
    setFormData({});
  }, []);

  const handleDeleteInstance = useCallback(
    async (instanceId, event) => {
      event.stopPropagation(); // Prevent row click
      
      if (!confirm('Are you sure you want to delete this workflow instance?')) {
        return;
      }

      setDeleting(prev => new Set(prev).add(instanceId));
      
      try {
        const result = await sharedApiService.makeRequest(
          `/api/workflow/workflows/${workflowId}/instances/${instanceId}`,
          {
            method: 'DELETE',
            headers,
          },
          { workflowId, instanceId, action: 'delete_instance' }
        );

        if (result.success) {
          // Remove from local list
          setIncompleteWorkflows(prev => prev.filter(w => w.instance_id !== instanceId));
          setRefreshKey(k => k + 1);
          
          // Invalidate cache
          sharedApiService.invalidateCache(`/api/workflow/workflows/${workflowId}/incomplete`);
        } else {
          throw new Error(result.error || 'Failed to delete instance');
        }
      } catch (err) {
        console.error('Failed to delete instance:', err);
        setError(`Failed to delete instance: ${err.message}`);
      } finally {
        setDeleting(prev => {
          const newSet = new Set(prev);
          newSet.delete(instanceId);
          return newSet;
        });
      }
    },
    [workflowId, headers]
  );

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
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }} key={refreshKey}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Instance ID</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell width="60">Actions</TableCell>
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
                        <TableCell>
                          <IconButton
                            size="small"
                            color="error"
                            disabled={deleting.has(wf.instance_id)}
                            onClick={(e) => handleDeleteInstance(wf.instance_id, e)}
                            title="Delete instance"
                          >
                            {deleting.has(wf.instance_id) ? (
                              <CircularProgress size={16} />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </IconButton>
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
                      <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
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
                <Card 
                  key={task.taskId} 
                  sx={{ 
                    mb: 2,
                    border: task.taskType === 'error' ? '2px solid' : '1px solid',
                    borderColor: task.taskType === 'error' ? theme.palette.error.main : theme.palette.divider,
                    backgroundColor: task.taskType === 'error' ? alpha(theme.palette.error.main, 0.05) : 'inherit'
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography variant="h6">
                        {
                          (() => {
                            const spec = selectedInstance.serialized_data?.spec?.task_specs?.[task.task_spec];
                            const title = spec?.bpmn_name || spec?.name || task.task_spec;
                            return title;
                          })()
                        }
                      </Typography>
                      {task.taskType === 'error' && (
                        <Chip 
                          icon={<XCircle size={16} />} 
                          label="ERROR" 
                          color="error" 
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {task.taskType === 'pending' && (
                        <Chip 
                          icon={<Clock size={16} />} 
                          label="PENDING" 
                          color="primary" 
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Task ID: {task.taskId} | State: {task.state} | Type: {task.taskType}
                    </Typography>
                    
                    {task.taskType === 'error' && (
                      <Alert severity="error" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                          This task encountered an error (state: {task.state}). 
                          {task.data && typeof task.data === 'object' && (
                            <Box sx={{ mt: 1 }}>
                              <strong>Error details:</strong>
                              <pre style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                                {JSON.stringify(task.data, null, 2)}
                              </pre>
                            </Box>
                          )}
                        </Typography>
                      </Alert>
                    )}
                    
                    <Stack spacing={2}>
                      {(() => {
                        const spec = selectedInstance.serialized_data?.spec?.task_specs?.[task.task_spec];
                        const hasFormField = selectedInstance[task.task_spec]?.formField || spec?.extensions?.formData?.formFields;
                        const isUserTask = spec?.typename === 'UserTask' || hasFormField;
                        const isManualTask = spec?.typename === 'ManualTask' || spec?.manual === true;
                        
                        if (task.taskType === 'error') {
                          return (
                            <Typography variant="body2" color="text.secondary">
                              Error task cannot be executed. Check error details above.
                            </Typography>
                          );
                        }
                        
                        if (isUserTask) {
                          // Build field entries from task spec extensions or legacy structure
                          const spec = selectedInstance.serialized_data?.spec?.task_specs?.[task.task_spec];
                          const entries = (() => {
                            // First try to get form fields from task spec extensions
                            if (spec?.extensions?.formData?.formFields) {
                              const e = [];
                              const formFields = Array.isArray(spec.extensions.formData.formFields) 
                                ? spec.extensions.formData.formFields 
                                : [spec.extensions.formData.formFields];
                              formFields.forEach(f => {
                                if (f?.id) {
                                  e.push([
                                    f.id,
                                    {
                                      name: f.label || f.id,
                                      type: f.type || 'string',
                                      required: f.required === 'true' || f.required === true,
                                    },
                                  ]);
                                }
                              });
                              return e;
                            }
                            
                            // Fallback to legacy structure
                            const obj = selectedInstance?.[task.task_spec];
                            if (!obj) return [];
                            if (obj.formField || obj.formData) {
                              const e = [];
                              if (obj.formField) {
                                // Handle both array and single object formats
                                const formFields = Array.isArray(obj.formField) ? obj.formField : [obj.formField];
                                formFields.forEach(f => {
                                  if (f?.id) {
                                    e.push([
                                      f.id,
                                      {
                                        name: f.label || f.id,
                                        type: f.type || 'string',
                                        required: f.required === 'true' || f.required === true,
                                      },
                                    ]);
                                  }
                                });
                              }
                              if (obj.formData && typeof obj.formData === 'object') {
                                Object.entries(obj.formData).forEach(([k, v]) => {
                                  if (v && typeof v === 'object') e.push([k, v]);
                                });
                              }
                              return e;
                            }
                            return Object.entries(obj);
                          })();

                          return entries.map(([fieldId, field]) => (
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
                          ));
                        }
                        
                        if (isManualTask) {
                          // ManualTask confirmation
                          return (
                            <TextField
                              fullWidth
                              label={`Type "yes" to confirm and continue`}
                              value={formData[`confirm_${task.taskId}`] || ''}
                              onChange={(e) => handleFormChange(`confirm_${task.taskId}`, e.target.value)}
                              variant="outlined"
                              placeholder="Type 'yes' to proceed"
                            />
                          );
                        }
                        
                        // Unknown task type
                        return (
                          <Typography variant="body2" color="text.secondary">
                            Task type: {spec?.typename || 'Unknown'}
                          </Typography>
                        );
                      })()}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          ) : (
            <div>
              <Typography>No actionable tasks available</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                All tasks may be completed, none are ready for execution, or check for error tasks.
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