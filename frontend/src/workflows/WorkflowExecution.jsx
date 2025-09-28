import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BPMN from '../components/bpmn/BPMN';
import JsonViewer from '../components/JsonViewer';
import TaskCompletion from './TaskCompletion';
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
  Edit,
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
  const [refreshKey, setRefreshKey] = useState(0); // Force re-render key
  const [deleting, setDeleting] = useState(new Set()); // Track which instances are being deleted
  const [selectedInstanceForBpmn, setSelectedInstanceForBpmn] = useState(null); // Track selected instance for BPMN clicks
  const [pollingInterval, setPollingInterval] = useState(null);
  
  // New states for all workflows with pagination
  const [allWorkflows, setAllWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 8; // Default pagination size
  const [lastKnownInstanceId, setLastKnownInstanceId] = useState(null); // Track the most recent instance ID

  // JSON viewer states
  const [selectedInstanceData, setSelectedInstanceData] = useState(null);
  const [showJsonViewer, setShowJsonViewer] = useState(false);

  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [formData, setFormData] = useState({});
  const [submittingTask, setSubmittingTask] = useState(false);

  // Workflow data states
  const [workflowConfig, setWorkflowConfig] = useState(null);
  const [bpmnData, setBpmnData] = useState(null);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [taskStatusData, setTaskStatusData] = useState(null);
  const [activeTasks, setActiveTasks] = useState([]);

  const token = useMemo(() => user?.token || localStorage.getItem('token'), [user?.token]);
  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );





  // Load workflow configuration and BPMN data
  const loadStatus = useCallback(
    async (id) => {
      if (!id) return;
      
      setLoadingWorkflow(true);
      setError(''); // Clear any previous errors
      
      try {
        // Load workflow configuration from MongoDB
        const configResult = await sharedApiService.makeRequest(
          `/api/workflows/configs/${id}`,
          {
            method: 'GET',
            headers,
          },
          { workflowId: id, action: 'get_config' }
        );

        if (configResult.success || configResult.data || configResult.id) {
          const config = configResult.data || configResult;
          setWorkflowConfig(config);
          
          // Load BPMN data from MINIO
          
          try {
            const bpmnResult = await sharedApiService.makeRequest(
              `/api/workflows/configs/${id}/bpmn`,
              {
                method: 'GET',
                headers: {
                  ...headers,
                  'Accept': 'application/xml, text/xml, */*',
                },
              },
              { workflowId: id, action: 'get_bpmn' }
            );

            if (bpmnResult.success || (typeof bpmnResult === 'string' && bpmnResult.includes('<'))) {
              // Handle different response formats
              let bpmnContent = bpmnResult.data || bpmnResult;
              
              // If it's still an object, try to extract the actual content
              if (typeof bpmnContent === 'object' && bpmnContent.data) {
                bpmnContent = bpmnContent.data;
              }
              
              if (typeof bpmnContent === 'string' && bpmnContent.includes('<')) {
                setBpmnData(bpmnContent);
              } else {
                setError('BPMN data format is invalid');
              }
            } else {
              setError('Failed to load BPMN diagram');
            }
          } catch (bpmnErr) {
            setError('Failed to fetch BPMN diagram from storage');
          }
        } else {
          setError('Failed to load workflow configuration');
        }
      } catch (err) {
        setError('Failed to load workflow configuration');
      } finally {
        setLoadingWorkflow(false);
      }
      
      setMode('config');
    },
    [headers]
  );

  useEffect(() => {
    setMode('config');
    if (workflowId) {
      loadStatus(workflowId);
      loadAllWorkflows(1);
    }
    
    // Cleanup polling interval when workflowId changes
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    };
  }, [workflowId, loadStatus]);
  
  // Cleanup polling interval on component unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Update BPMN task colors when activeTasks changes
  useEffect(() => {
    if (activeTasks.length > 0) {
      const taskColors = {};
      const today = new Date();
      
        activeTasks.forEach(({ taskSpec, status, dueDate }) => {
        // Check if task is overdue
        let isOverdue = false;
        if (dueDate) {
          const taskDueDate = new Date(dueDate);
          isOverdue = today > taskDueDate;
        }        if (status === 16) {
          // Status 16 = READY - check if overdue, use 'error' for overdue tasks
          taskColors[taskSpec] = isOverdue ? 'error' : 'ready';
        } else if (status === 64) {
          taskColors[taskSpec] = 'complete'; // Status 64 = COMPLETE
        } else if (status === 128) {
          taskColors[taskSpec] = 'error'; // Status 128 = ERROR
        }

      });
      setTaskStatusData(taskColors);
    }
  }, [activeTasks]);

  // Load all workflows with pagination
  const loadAllWorkflows = useCallback(
    async (page = 1) => {
      if (!workflowId) return;
      
      setLoadingWorkflows(true);
      try {
        // Invalidate cache to ensure fresh data
        const cacheKey = `/api/workflow/workflows/${workflowId}/instances?page=${page || 1}&size=${pageSize || 8}`;
        sharedApiService.invalidateCache(cacheKey);
        
        const result = await sharedApiService.makeRequest(
          cacheKey,
          {
            method: 'GET',
            headers,
          },
          { workflowId, action: 'list_all_workflows', page: page || 1, pageSize: pageSize || 8, bypassCache: true }
        );

        // Set the data exactly as received
        const workflows = result.data?.data || [];
        setAllWorkflows(workflows);
        setTotalPages(result.data?.total_pages || 1);
        setRefreshKey((k) => k + 1);
        
        // Initialize the last known instance ID if we don't have one yet
        if (!lastKnownInstanceId && workflows.length > 0) {
          const newestInstanceId = workflows[0]?.instance_id;
          if (newestInstanceId) {
            setLastKnownInstanceId(newestInstanceId);
          }
        }
      } catch (err) {
        // Error handled silently
      } finally {
        setLoadingWorkflows(false);
      }
    },
    [workflowId, headers, pageSize, lastKnownInstanceId]
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
          { configId, action: 'start', token: token?.substring(0, 10), timestamp: Date.now(), bypassCache: true }
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to start workflow');
        }

        setResult({ message: 'Workflow started successfully', data: result.data });

        // Set the newly created instance as the last known instance
        setLastKnownInstanceId(result.data.instance_id);
        
        // Wait 2 seconds then fetch fresh instances
        setTimeout(() => {
          loadAllWorkflows(currentPage);
        }, 2000);

      } catch (err) {
        const message = err?.message || 'Unknown error starting workflow';
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
    async (instanceId, openDialog = true) => {
      try {
        // Invalidate cache for this specific instance to ensure fresh data
        sharedApiService.invalidateCache(`/api/workflow/workflows/${workflowId}/instances/${instanceId}`);
        
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
          
          // Store the full instance data for JSON viewer
          setSelectedInstanceData(workflowData);
          setShowJsonViewer(true);
          
          // Extract tasks with status 16, 64, and 128 from serialized_data.tasks
          if (workflowData.serialized_data && workflowData.serialized_data.tasks) {
            const tasks = workflowData.serialized_data.tasks;
            const activeTasksData = Object.entries(tasks).filter(([taskId, task]) => {
              const status = task.state;
              return status === 16 || status === 64 || status === 128;
            }).map(([taskId, task]) => {
              // Get the task spec from serialized_data.spec.task_specs
              const taskSpec = workflowData.serialized_data?.spec?.task_specs?.[task.task_spec];
              let dueDate = null;
              
              // Extract dueDate from potentialOwners extensions
              if (taskSpec?.extensions?.potentialOwners && Array.isArray(taskSpec.extensions.potentialOwners)) {
                const owner = taskSpec.extensions.potentialOwners[0];
                if (owner?.extensions?.dueDate) {
                  dueDate = owner.extensions.dueDate;
                }
              }
              
              return {
                taskId,
                taskSpec: task.task_spec, // Use task_spec for color mapping
                status: task.state,
                task: task,
                dueDate: dueDate,
                created_at: workflowData.created_at,
                updated_at: workflowData.updated_at,
                taskSpecDetails: taskSpec // Include full task spec details
              };
            });
            
            setActiveTasks(activeTasksData);

            // If openDialog is true, prepare and open the dialog
            if (openDialog) {
              // Find pending tasks (status 16 = READY, status 128 = ERROR that might need intervention)
              const pendingTasks = activeTasksData.filter(taskData => 
                taskData.status === 16 || taskData.status === 128
              ).map(taskData => ({
                taskId: taskData.taskId,
                task_spec: taskData.taskSpec,
                state: taskData.status,
                taskType: taskData.status === 128 ? 'error' : 'pending',
                data: taskData.task
              }));

              // Set up the selected instance data for the dialog
              const instanceForDialog = {
                instance_id: instanceId,
                serialized_data: workflowData.serialized_data,
                pendingTasks: pendingTasks,
                ...workflowData // Include any other data from the instance
              };

              // Add task-specific data from serialized_data.spec.task_specs if available
              if (workflowData.serialized_data?.spec?.task_specs) {
                Object.keys(workflowData.serialized_data.spec.task_specs).forEach(taskSpec => {
                  const spec = workflowData.serialized_data.spec.task_specs[taskSpec];
                  instanceForDialog[taskSpec] = spec;
                });
              }

              setSelectedInstance(instanceForDialog);
              setDialogOpen(true);
            }
          }
        }
      } catch (err) {
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
        // Just take the first pending task
        const firstPendingTask = selectedInstance.pendingTasks?.[0];
        
        if (!firstPendingTask) {
          throw new Error('No pending tasks found');
        }
        
        // Create submission data with task ID and form data
        const submissionData = {
          data: formData,
          task_id: firstPendingTask.task_spec
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

          // Optimistically update the list: remove if completed
          const completed = !!result.data?.completed;
          const nextTaskId = result.data?.current_task_id;
          if (completed) {
            setAllWorkflows((prev) => prev.map((w) => 
              w.instance_id === selectedInstance.instance_id ? { ...w, status: 'complete' } : w
            ));
            setRefreshKey((k) => k + 1);
          } else {
            // Not completed: update list item with next task id (if we want to display later)
            setAllWorkflows((prev) => prev.map((w) => (
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
        setError('Failed to submit task data');
      } finally {
        setSubmittingTask(false);
      }
    },
    [selectedInstance, formData, workflowId, headers, selectedInstanceForBpmn, handleInstanceClick, loadAllWorkflows, currentPage]
  );

  const handleCloseDialog = useCallback(() => {
    const instanceIdToRefresh = selectedInstance?.instance_id;
    const shouldRefresh = instanceIdToRefresh === selectedInstanceForBpmn;
    
    setDialogOpen(false);
    setSelectedInstance(null);
    setFormData({});
    
    // Wait 2 seconds then refresh the instance status to update BPMN colors
    if (shouldRefresh) {
      setTimeout(async () => {
        // Refresh the selected instance to update BPMN task colors
        await handleInstanceClick(instanceIdToRefresh, false);
        // Also refresh the workflows list to update status
        loadAllWorkflows(currentPage);
      }, 2000);
    }
    
    // Don't clear taskStatusData here - preserve BPMN coloring for the selected instance
    // Task status data should persist so users can see the colored diagram after closing the dialog
    // Keep the selectedInstanceForBpmn so user can still click on BPMN nodes
    // setSelectedInstanceForBpmn(null); // Uncomment if you want to clear selection on dialog close
  }, [selectedInstance, selectedInstanceForBpmn, handleInstanceClick, loadAllWorkflows, currentPage]);

  // Handle page change
  const handlePageChange = useCallback((event, page) => {
    setCurrentPage(page);
    loadAllWorkflows(page);
  }, [loadAllWorkflows]);

  // Handle BPMN node clicks - only works after selecting an instance from the list
  const handleBpmnNodeClick = useCallback(async (event, node) => {
    
    // Only allow BPMN node clicks if an instance has been selected from the list first
    if (!selectedInstanceForBpmn) {
      setError('Please select a workflow instance from the list first, then click on the diagram nodes.');
      setTimeout(() => setError(''), 4000); // Clear error after 4 seconds
      return;
    }
    
    // Get the node ID from the BPMN node
    const nodeId = node.id;
    
    // Open the dialog for the pre-selected instance (force dialog open)
    await handleInstanceClick(selectedInstanceForBpmn, true);
  }, [selectedInstanceForBpmn, handleInstanceClick]);

  // Handle Edit BPMN button click - navigate to BPMN editor with XML data
  const handleEditBPMN = useCallback(() => {
    if (!bpmnData || !workflowConfig) return;
    
    // Get the minio full path from the existing workflowConfig (already loaded)
    const minioFullPath = workflowConfig.bpmn_path || 
                         workflowConfig.file_path || 
                         workflowConfig.minio_path ||
                         workflowConfig.path ||
                         workflowConfig.s3_path ||
                         workflowConfig.bpmn_file_path ||
                         workflowConfig.filePath;
    

    
    // Navigate to dashboard/bpmn with the XML data and full minio path
    navigate('/dashboard/bpmn', {
      state: {
        initialBPMN: bpmnData,
        editMode: true,
        workflowId: workflowId,
        minioFullPath: minioFullPath, // Full path like "uploads/bpmn/81e395d3-1b47-4d22-b538-1ca011358887/process(36).bpmn"
        saveEndpoint: `/api/workflows/configs/${workflowId}/bpmn`,
        saveMode: 'workflow'
      }
    });
  }, [bpmnData, navigate, workflowId, workflowConfig]);

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
          setAllWorkflows(prev => prev.filter(w => w.instance_id !== instanceId));
          setRefreshKey(k => k + 1);
          
          // Invalidate cache
          sharedApiService.invalidateCache(`/api/workflow/workflows/${workflowId}/instances`);
        } else {
          throw new Error(result.error || 'Failed to delete instance');
        }
      } catch (err) {
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
        background: theme.custom?.backgroundGradient || theme.palette.background.default,
        minHeight: '100vh',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/dashboard/monitor')}>
            <ArrowLeft />
          </IconButton>
          <Typography variant="h5" fontWeight="bold">
            Workflow Execution
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ID: <strong>{workflowId || 'NOT PROVIDED'}</strong>
          </Typography>
        </Box>
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
          <Tooltip title="Edit BPMN diagram">
            <span>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<Edit />}
                disabled={!bpmnData}
                onClick={handleEditBPMN}
              >
                Edit BPMN
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {/* Two Column Layout */}
      <Box sx={{ display: 'flex', height: 'calc(100vh - 120px)', width: '100%', maxWidth: '100%', margin: '0', overflow: 'hidden' }}>
        
        {/* Left Pane - Instances */}
        <Box sx={{ 
          width: '450px', 
          minWidth: '450px',
          maxWidth: '450px',
          borderRight: '1px solid', 
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Left Header */}
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <Typography variant="h6">
                {workflowConfig?.name || 'Active Instances'}
              </Typography>
              <IconButton 
                size="small" 
                onClick={() => loadAllWorkflows(currentPage)}
                disabled={loadingWorkflows}
                title="Refresh list"
              >
                <RefreshCw size={16} />
              </IconButton>
            </Box>
            {workflowConfig?.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {workflowConfig.description}
              </Typography>
            )}
            {selectedInstanceForBpmn && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                <Chip 
                  label={`Selected: ${selectedInstanceForBpmn.substring(0, 8)}...`}
                  color="primary"
                  size="small"
                  variant="outlined"
                />
                {(() => {
                  const selectedWorkflow = allWorkflows.find(wf => wf.instance_id === selectedInstanceForBpmn);
                  if (selectedWorkflow && selectedWorkflow.status !== 'complete') {
                    return (
                      <Chip 
                        label="Incomplete"
                        size="small"
                        variant="outlined"
                        sx={{ 
                          borderColor: '#ff9800',
                          color: '#ff9800',
                          '& .MuiChip-icon': {
                            color: '#ff9800'
                          }
                        }}
                        icon={<Clock size={12} />}
                      />
                    );
                  }
                  return null;
                })()}
                {showJsonViewer && (
                  <Chip 
                    label="JSON View Active"
                    size="small"
                    variant="outlined"
                    color="secondary"
                    icon={<Eye size={12} />}
                  />
                )}
              </Box>
            )}
          </Box>

          {/* Instances List */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {error && (
              <Alert severity="error" sx={{ m: 2 }}>
                {error}
              </Alert>
            )}
            
            {loadingWorkflows ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size={20} />
              </Box>
            ) : allWorkflows.length > 0 ? (
              <TableContainer key={refreshKey}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Instance ID</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell width="60">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allWorkflows.map((wf) => (
                      <TableRow 
                        key={wf.instance_id} 
                        hover 
                        sx={{ 
                          cursor: 'pointer',
                          backgroundColor: selectedInstanceForBpmn === wf.instance_id ? 
                            alpha(theme.palette.primary.main, 0.1) : 'inherit',
                          '&:hover': {
                            backgroundColor: selectedInstanceForBpmn === wf.instance_id ? 
                              alpha(theme.palette.primary.main, 0.15) : 
                              alpha(theme.palette.action.hover, 0.04)
                          }
                        }}
                        onClick={() => {
                          setSelectedInstanceForBpmn(wf.instance_id);
                          handleInstanceClick(wf.instance_id, false);
                          
                          if (pollingInterval) {
                            clearInterval(pollingInterval);
                            setPollingInterval(null);
                          }
                          
                          if (wf.status !== 'complete') {
                            const interval = setInterval(async () => {
                              const shouldContinue = await pollSpecificInstance(wf.instance_id);
                              if (!shouldContinue) {
                                clearInterval(interval);
                                setPollingInterval(null);
                              }
                            }, 3000);
                            setPollingInterval(interval);
                          }
                        }}
                      >
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {wf.instance_id.substring(0, 12)}...
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.75rem' }}>
                          {(() => {
                            const hasErrorTasks = selectedInstanceForBpmn === wf.instance_id && 
                              activeTasks.some(task => task.status === 128);
                            
                            if (hasErrorTasks) {
                              return (
                                <Chip 
                                  label="FAIL" 
                                  color="error" 
                                  size="small"
                                  icon={<XCircle size={12} />}
                                />
                              );
                            }
                            
                            return (
                              <Chip 
                                label={wf.status} 
                                color={wf.status === 'complete' ? 'success' : 'warning'} 
                                size="small"
                                icon={wf.status === 'complete' ? <CheckCircle size={12} /> : <Clock size={12} />}
                              />
                            );
                          })()}
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
                              <CircularProgress size={14} />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No workflows found</Typography>
              </Box>
            )}
            
            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <Pagination 
                  count={totalPages} 
                  page={currentPage} 
                  onChange={handlePageChange}
                  color="primary"
                  size="small"
                />
              </Box>
            )}

            {/* JSON Viewer */}
            {showJsonViewer && selectedInstanceData && (
              <Box sx={{ p: 2 }}>
                <JsonViewer
                  data={selectedInstanceData}
                  title={`Instance Data: ${selectedInstanceData.instance_id || 'Unknown'}`}
                  onClose={() => {
                    setShowJsonViewer(false);
                    setSelectedInstanceData(null);
                  }}
                />
              </Box>
            )}
          </Box>
        </Box>

        {/* Right Pane - BPMN Preview */}
        <Box sx={{ 
          flex: 1,
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden',
          minWidth: 0
        }}>
          {/* BPMN Content */}
          <Box sx={{ 
            width: '100%',
            height: 'calc(100vh - 120px)', 
            position: 'relative', 
            overflow: 'hidden' 
          }}>
            {loadingWorkflow ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress size={40} />
                <Typography variant="body2" sx={{ ml: 2 }}>
                  Loading workflow...
                </Typography>
              </Box>
            ) : bpmnData ? (
              <BPMN 
                readOnly={true}
                showToolbox={false}
                showPropertyPanel={false}
                initialTheme={theme.palette.mode}
                initialBPMN={bpmnData}
                taskStatusData={taskStatusData}
                onNodeClick={handleBpmnNodeClick}
                style={{ 
                  height: '100%', 
                  width: '100%',
                  '--toolbar-display': 'none'
                }}
                className="bpmn-readonly-viewer"
                onError={(error) => {
                  // BPMN Component Error handled silently
                }}
              />
            ) : workflowId && !loadingWorkflow ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Alert severity="warning">
                  No workflow diagram available for this workflow ID.
                </Alert>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Typography color="text.secondary">
                  Select a workflow to view the diagram
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* User Task Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogContent sx={{ p: 0, height: '80vh', overflow: 'hidden' }}>
          {selectedInstance && (
            <TaskCompletion 
              user={user}
              workflowId={workflowId}
              instanceId={selectedInstance.instance_id}
              isDialog={true}
              onClose={handleCloseDialog}
              onSuccess={() => {
                handleCloseDialog();
                // Refresh the workflows list after successful task completion
                setTimeout(() => {
                  loadAllWorkflows(currentPage);
                }, 1000);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default WorkflowExecution;