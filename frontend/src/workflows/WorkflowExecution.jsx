import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BPMN from '../components/bpmn/BPMN';
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
  const [selectedInstanceForBpmn, setSelectedInstanceForBpmn] = useState(null); // Track selected instance for BPMN clicks
  
  // New states for all workflows with pagination
  const [allWorkflows, setAllWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 8;
  
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
        console.log('🔄 Loading workflow config for ID:', id);
        
        // Load workflow configuration from MongoDB
        const configResult = await sharedApiService.makeRequest(
          `/api/workflows/configs/${id}`,
          {
            method: 'GET',
            headers,
          },
          { workflowId: id, action: 'get_config' }
        );

        console.log('📋 Config result:', configResult);

        if (configResult.success || configResult.data || configResult.id) {
          const config = configResult.data || configResult;
          setWorkflowConfig(config);
          console.log('✅ Workflow config loaded:', config);
          
          // Load BPMN data from MINIO
          console.log('🔄 Loading BPMN data...');
          
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
                console.log('✅ BPMN data loaded successfully');
              } else {
                console.warn('⚠️ BPMN data format unexpected:', typeof bpmnContent, bpmnContent);
                setError('BPMN data format is invalid');
              }
            } else {
              console.warn('⚠️ BPMN fetch failed:', bpmnResult);
              setError('Failed to load BPMN diagram');
            }
          } catch (bpmnErr) {
            console.error('❌ BPMN fetch error:', bpmnErr);
            setError('Failed to fetch BPMN diagram from storage');
          }
        } else {
          console.warn('⚠️ Config fetch failed:', configResult);
          setError('Failed to load workflow configuration');
        }
      } catch (err) {
        console.error('❌ Failed to load workflow data:', err);
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
      loadIncompleteWorkflows();
      loadAllWorkflows(1);
    }
  }, [workflowId, loadStatus]);

  // Update BPMN task colors when activeTasks changes
  useEffect(() => {
    if (activeTasks.length > 0) {
      const taskColors = {};
      activeTasks.forEach(({ taskSpec, status }) => {
        if (status === 16) {
          taskColors[taskSpec] = 'ready'; // Status 16 = READY
        } else if (status === 64) {
          taskColors[taskSpec] = 'complete'; // Status 64 = COMPLETE
        } else if (status === 128) {
          taskColors[taskSpec] = 'error'; // Status 128 = ERROR
        }
      });
      setTaskStatusData(taskColors);
      console.log('🎨 BPMN Task Colors Updated by task_spec:', taskColors);
    }
  }, [activeTasks]);

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

        // Log exact raw data as received from backend - NO FILTERING
        console.log('EXACT RAW BACKEND DATA (Incomplete):', result);
        
        // Set the data exactly as received
        setIncompleteWorkflows(result.data?.data || []);
        setRefreshKey((k) => k + 1);
      } catch (err) {
        console.error('❌ Failed to load incomplete workflows:', err);
      } finally {
        setLoadingIncomplete(false);
      }
    },
    [workflowId, headers, loadingIncomplete]
  );

  // Load all workflows with pagination
  const loadAllWorkflows = useCallback(
    async (page = 1) => {
      if (!workflowId) return;
      
      setLoadingWorkflows(true);
      try {
        const result = await sharedApiService.makeRequest(
          `/api/workflow/workflows/${workflowId}/instances?page=${page}&size=${pageSize}`,
          {
            method: 'GET',
            headers,
          },
          { workflowId, action: 'list_all_workflows', page }
        );

        // Log exact raw data as received from backend - NO FILTERING
        console.log('EXACT RAW BACKEND DATA (All Workflows):', result);
        
        // Set the data exactly as received
        setAllWorkflows(result.data?.data || []);
        setTotalPages(result.data?.total_pages || 1);
        setRefreshKey((k) => k + 1);
      } catch (err) {
        console.error('❌ Failed to load all workflows:', err);
      } finally {
        setLoadingWorkflows(false);
      }
    },
    [workflowId, headers, pageSize]
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
          status: 'incomplete',
        };
        setIncompleteWorkflows((prev) => {
          if (!result.data.instance_id || prev.some((w) => w.instance_id === result.data.instance_id)) return prev;
          return [newInstance, ...prev];
        });
        setAllWorkflows((prev) => {
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
    async (instanceId, openDialog = true) => {
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
          
          // FUCKING LOG THE RAW INSTANCE DATA
          console.log('🚨 RAW INSTANCE DATA FROM API:', workflowData);
          
          // Extract tasks with status 16, 64, and 128 from serialized_data.tasks
          if (workflowData.serialized_data && workflowData.serialized_data.tasks) {
            const tasks = workflowData.serialized_data.tasks;
            const activeTasksData = Object.entries(tasks).filter(([taskId, task]) => {
              const status = task.state;
              return status === 16 || status === 64 || status === 128;
            }).map(([taskId, task]) => ({
              taskId,
              taskSpec: task.task_spec, // Use task_spec for color mapping
              status: task.state,
              task: task
            }));
            
            setActiveTasks(activeTasksData);
            console.log('🎯 activeTasks (status 16, 64, 128):', activeTasksData);

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

              console.log('🎯 Opening dialog for instance:', instanceForDialog);
              setSelectedInstance(instanceForDialog);
              setDialogOpen(true);
            }
          }
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
            setAllWorkflows((prev) => prev.map((w) => 
              w.instance_id === selectedInstance.instance_id ? { ...w, status: 'complete' } : w
            ));
            setRefreshKey((k) => k + 1);
          } else {
            // Not completed: update list item with next task id (if we want to display later)
            setIncompleteWorkflows((prev) => prev.map((w) => (
              w.instance_id === selectedInstance.instance_id ? { ...w, current_task_id: nextTaskId } : w
            )));
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
    // Don't clear taskStatusData here - preserve BPMN coloring for the selected instance
    // Task status data should persist so users can see the colored diagram after closing the dialog
    // Keep the selectedInstanceForBpmn so user can still click on BPMN nodes
    // setSelectedInstanceForBpmn(null); // Uncomment if you want to clear selection on dialog close
  }, []);

  // Handle page change
  const handlePageChange = useCallback((event, page) => {
    setCurrentPage(page);
    loadAllWorkflows(page);
  }, [loadAllWorkflows]);

  // Handle BPMN node clicks - only works after selecting an instance from the list
  const handleBpmnNodeClick = useCallback(async (event, node) => {
    
    // Only allow BPMN node clicks if an instance has been selected from the list first
    if (!selectedInstanceForBpmn) {
      console.log('❌ No instance selected. User must select from the list first.');
      setError('Please select a workflow instance from the list first, then click on the diagram nodes.');
      setTimeout(() => setError(''), 4000); // Clear error after 4 seconds
      return;
    }
    
    // Get the node ID from the BPMN node
    const nodeId = node.id;
    console.log('🔍 BPMN node clicked:', nodeId, node, 'for selected instance:', selectedInstanceForBpmn);
    
    // Open the dialog for the pre-selected instance (force dialog open)
    await handleInstanceClick(selectedInstanceForBpmn, true);
  }, [selectedInstanceForBpmn, handleInstanceClick]);

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
          // Remove from both local lists
          setIncompleteWorkflows(prev => prev.filter(w => w.instance_id !== instanceId));
          setAllWorkflows(prev => prev.filter(w => w.instance_id !== instanceId));
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
            {workflowConfig?.name || 'Ready to start workflow'}
          </Typography>
          <Typography variant="body1">
            Workflow ID: <strong>{workflowId || 'NOT PROVIDED'}</strong>
          </Typography>
          {workflowConfig?.description && (
            <Typography variant="body2" color="text.secondary">
              {workflowConfig.description}
            </Typography>
          )}
        </Stack>

        {/* BPMN Workflow Display */}
        {loadingWorkflow ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <CircularProgress size={40} />
            <Typography variant="body2" sx={{ ml: 2, alignSelf: 'center' }}>
              Loading workflow...
            </Typography>
          </Box>
        ) : bpmnData ? (
          <Box sx={{ mt: 3, border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              bgcolor: 'action.hover', 
              px: 2, 
              py: 1, 
              borderBottom: '1px solid', 
              borderColor: 'divider'
            }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Workflow Diagram
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Read-only view
              </Typography>
            </Box>
            <Box sx={{ position: 'relative', height: '500px', width: '100%' }}>
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
                  console.error('🔥 BPMN Component Error:', error)
                }}
                onLoad={() => {
                  console.log('✅ BPMN workflow loaded successfully')
                }}
              />
            </Box>
          </Box>
        ) : workflowId && !loadingWorkflow ? (
          <Alert severity="warning" sx={{ mt: 3 }}>
            No workflow diagram available for this workflow ID.
          </Alert>
        ) : null}

        {error && (
          <Box sx={{ mt: 3 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {workflowId && (
          <Box sx={{ mt: 3, textAlign: 'left', mx: 'auto', maxWidth: 720 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">All Workflows</Typography>
              {selectedInstanceForBpmn && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip 
                    label={`Selected: ${selectedInstanceForBpmn.substring(0, 8)}...`}
                    color="primary"
                    size="small"
                    variant="outlined"
                  />
                  <Button 
                    size="small" 
                    onClick={() => {
                      setSelectedInstanceForBpmn(null);
                      setTaskStatusData(null); // Clear BPMN coloring when clearing selection
                    }}
                    sx={{ minWidth: 'auto', px: 1 }}
                  >
                    Clear
                  </Button>
                </Box>
              )}
            </Box>

            {loadingWorkflows ? (
              <CircularProgress size={20} />
            ) : allWorkflows.length > 0 ? (
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }} key={refreshKey}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Instance ID (Click to select)</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Created</TableCell>
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
                          console.log('🖱️ Instance clicked in table:', wf.instance_id);
                          setSelectedInstanceForBpmn(wf.instance_id);
                          // Load instance data for BPMN coloring but don't open dialog
                          handleInstanceClick(wf.instance_id, false);
                        }}
                      >
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {wf.instance_id}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {(() => {
                            // Check if this instance has error tasks (status 128)
                            const hasErrorTasks = selectedInstanceForBpmn === wf.instance_id && 
                              activeTasks.some(task => task.status === 128);
                            
                            if (hasErrorTasks) {
                              return (
                                <Chip 
                                  label="FAIL" 
                                  color="error" 
                                  size="small"
                                  icon={<XCircle size={14} />}
                                />
                              );
                            }
                            
                            return (
                              <Chip 
                                label={wf.status} 
                                color={wf.status === 'complete' ? 'success' : 'warning'} 
                                size="small"
                                icon={wf.status === 'complete' ? <CheckCircle size={14} /> : <Clock size={14} />}
                              />
                            );
                          })()}
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
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No workflows found</Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            
            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Pagination 
                  count={totalPages} 
                  page={currentPage} 
                  onChange={handlePageChange}
                  color="primary" 
                />
              </Box>
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