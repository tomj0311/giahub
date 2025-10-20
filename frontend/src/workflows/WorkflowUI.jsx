import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Grid,
  List,
  ListItemButton,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CheckCircle, XCircle, Clock, AlertTriangle, ArrowLeft, Play, Edit } from 'lucide-react';
import sharedApiService from '../utils/apiService';
import TaskCompletion from './TaskCompletion';

const POLL_INTERVAL = 1000;
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
  const [taskHistory, setTaskHistory] = useState([]); // Store task execution history
  const [currentTasks, setCurrentTasks] = useState({}); // Store current task states
  
  // Workflow selector
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [groupedWorkflows, setGroupedWorkflows] = useState({});
  const [expandedCategory, setExpandedCategory] = useState(null); // Track which category is expanded
  
  // BPMN data for editing
  const [bpmnData, setBpmnData] = useState(null);
  const [loadingBpmn, setLoadingBpmn] = useState(false);
  
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

      // Find workflow from already loaded workflows list
      let workflow = workflows.find(w => w.name === workflowName);
      
      // If not found in loaded list, fetch all workflows
      if (!workflow) {
        const configResult = await sharedApiService.makeRequest(
          '/api/workflows/configs/all',
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
          { action: 'get_configs_all', bypassCache: true }
        );

        workflow = configResult.data.configurations?.find(w => w.name === workflowName);
        if (!workflow) throw new Error(`Workflow "${workflowName}" not found`);
      }

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
        '/api/workflows/configs/all',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
        { action: 'get_configs_all', bypassCache: true }
      );

      if (result.success) {
        const workflowList = result.data.configurations || [];
        setWorkflows(workflowList);
        
        // Group workflows by category
        const groupedByCat = workflowList.reduce((acc, w) => {
          const cat = w.category || '_root';
          acc[cat] = acc[cat] || [];
          acc[cat].push(w);
          return acc;
        }, {});
        
        // Sort workflows within each category by name
        Object.keys(groupedByCat).forEach(k => {
          groupedByCat[k].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        });
        
        setGroupedWorkflows(groupedByCat);
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

  // Load BPMN data for selected workflow
  const loadBpmnData = async (workflowConfig) => {
    if (!workflowConfig) return;
    
    const wfId = workflowConfig.id || workflowConfig.workflow_id || workflowConfig._id;
    if (!wfId) return;
    
    setLoadingBpmn(true);
    try {
      // First, fetch the FULL workflow config to get bpmn_path and other metadata
      const configResult = await sharedApiService.makeRequest(
        `/api/workflows/configs/${wfId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
        { workflowId: wfId, action: 'get_config' }
      );

      // Update selectedWorkflow with the full config data (including bpmn_path)
      if (configResult.success || configResult.data || configResult.id) {
        const fullConfig = configResult.data || configResult;
        setSelectedWorkflow(fullConfig); // Update with full config including bpmn_path
      }

      // Then fetch the BPMN XML content
      const bpmnResult = await sharedApiService.makeRequest(
        `/api/workflows/configs/${wfId}/bpmn`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/xml, text/xml, */*',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
        { workflowId: wfId, action: 'get_bpmn' }
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
          setBpmnData(null);
        }
      } else {
        setBpmnData(null);
      }
    } catch (err) {
      console.error('Failed to load BPMN:', err);
      setBpmnData(null);
    } finally {
      setLoadingBpmn(false);
    }
  };

  const startWorkflow = async () => {
    try {
      setState('loading');
      setError('');

      // Find workflow from already loaded workflows list
      let workflow = workflows.find(w => w.name === workflowName);
      
      // If not found in loaded list, fetch all workflows
      if (!workflow) {
        const configResult = await sharedApiService.makeRequest(
          '/api/workflows/configs/all',
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
          { action: 'get_configs_all', bypassCache: true }
        );

        workflow = configResult.data.configurations?.find(w => w.name === workflowName);
        if (!workflow) throw new Error(`Workflow "${workflowName}" not found`);
      }

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
        { workflowId: wfId, action: 'start_workflow', bypassCache: true }
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
        const taskSpecs = instance.serialized_data?.spec?.task_specs || {};
        
        // Update current tasks state for real-time display
        setCurrentTasks(tasks);
        
        // Build task history for completed/running tasks, excluding start/end related tasks
        const history = Object.entries(tasks)
          .filter(([taskId, task]) => {
            // Get the task spec to check typename
            const taskSpecName = task.task_spec;
            const taskSpec = taskSpecs[taskSpecName];
            const typename = taskSpec?.typename;
            
            // Filter out system/framework tasks - only show business tasks
            const excludedTypenames = [
              'BpmnStartTask',
              'StartEvent', 
              'EndEvent',
              '_EndJoin',
              'SimpleBpmnTask',
              'Task'
            ];
            
            // Also exclude tasks with names that indicate start/end
            const excludedNames = ['Start', 'End', 'Process_1.EndJoin'];
            
            return !excludedTypenames.includes(typename) && 
                   !excludedNames.includes(taskSpecName);
          })
          .map(([taskId, task]) => {
            const stateMap = {
              1: 'Future',
              2: 'Likely',
              4: 'Maybe',
              8: 'Waiting',
              16: 'Ready',
              32: 'Completed',
              64: 'Completed', // Treat cancelled as completed
              128: 'Failed'
            };
            
            // Get the task spec to show better names
            const taskSpecName = task.task_spec;
            const taskSpec = taskSpecs[taskSpecName];
            const displayName = taskSpec?.bpmn_name || taskSpec?.description || taskSpecName || 'Unknown Task';
            
            return {
              id: taskId,
              name: displayName,
              state: stateMap[task.state] || `State ${task.state}`,
              stateCode: task.state === 64 ? 32 : task.state, // Convert 64 to 32 (Completed)
              data: task.data || {},
              timestamp: new Date().toISOString()
            };
          })
          .sort((a, b) => {
            // Sort by state priority: Running > Ready > Completed > Others
            const priority = { 'Ready': 1, 'Completed': 2, 'Failed': 3, 'Waiting': 4 };
            return (priority[a.state] || 99) - (priority[b.state] || 99);
          });
        
        console.log('📊 Task History:', history.length, 'tasks');
        setTaskHistory(history);
        
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
          
          const errorMsg = task.data?.error?.error || `Task "${task.task_spec}" failed`;
          
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

  const handleResetWorkflow = () => {
    // Reset all state
    hasStarted.current = false;
    setWorkflowId(null);
    setInstanceId(null);
    setPendingTaskId(null);
    setReadyTaskData(null);
    setTaskHistory([]);
    setCurrentTasks({});
    setState('idle');
    setError('');
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    // Clear URL and reload workflows
    setSearchParams({});
    loadWorkflows();
  };

  // Handle Edit BPMN button click - navigate to BPMN editor with XML data
  const handleEditBPMN = () => {
    if (!bpmnData || !selectedWorkflow) return;
    
    // Extract workflow ID from selectedWorkflow - same as WorkflowExecution.jsx
    const wfId = selectedWorkflow.id || selectedWorkflow.workflow_id || selectedWorkflow._id;
    
    // Get the minio full path from the existing selectedWorkflow (already loaded)
    const minioFullPath = selectedWorkflow.bpmn_path || 
                         selectedWorkflow.file_path || 
                         selectedWorkflow.minio_path ||
                         selectedWorkflow.path ||
                         selectedWorkflow.s3_path ||
                         selectedWorkflow.bpmn_file_path ||
                         selectedWorkflow.filePath;
    
    console.log('🔧 WorkflowUI Edit BPMN Navigation:', {
      wfId,
      minioFullPath,
      selectedWorkflow_id: selectedWorkflow.id,
      selectedWorkflow_workflow_id: selectedWorkflow.workflow_id,
      selectedWorkflow__id: selectedWorkflow._id,
      selectedWorkflow_name: selectedWorkflow.name,
      saveEndpoint: `/api/workflows/configs/${wfId}/bpmn`,
      fullSelectedWorkflow: selectedWorkflow
    });
    
    // Navigate to dashboard/bpmn with the XML data and full minio path
    navigate('/dashboard/bpmn', {
      state: {
        initialBPMN: bpmnData,
        editMode: true,
        workflowId: wfId,
        minioFullPath: minioFullPath, // Full path like "uploads/bpmn/81e395d3-1b47-4d22-b538-1ca011358887/process(36).bpmn"
        saveEndpoint: `/api/workflows/configs/${wfId}/bpmn`,
        saveMode: 'workflow'
      }
    });
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

  const getTaskStateIcon = (stateCode) => {
    switch (stateCode) {
      case 32: // Completed
        return <CheckCircle size={16} color={theme.palette.success.main} />;
      case 16: // Ready
        return <Clock size={16} color={theme.palette.warning.main} />;
      case 128: // Failed
        return <XCircle size={16} color={theme.palette.error.main} />;
      case 8: // Waiting
        return <Clock size={16} color={theme.palette.info.main} />;
      default:
        return <Clock size={16} color={theme.palette.grey[500]} />;
    }
  };

  const getTaskStateColor = (stateCode) => {
    switch (stateCode) {
      case 32: // Completed
        return 'success';
      case 16: // Ready
        return 'warning';
      case 128: // Failed
        return 'error';
      case 8: // Waiting
        return 'info';
      default:
        return 'default';
    }
  };

  // Handle accordion expansion - only one can be open at a time
  const handleAccordionChange = (category) => (event, isExpanded) => {
    setExpandedCategory(isExpanded ? category : null);
  };

  // Render workflows grouped by category in accordions
  const renderGroupedWorkflowList = () => {
    const cats = Object.keys(groupedWorkflows).sort((a, b) => a.localeCompare(b));
    
    if (!cats.length && !state === 'loading') {
      return (
        <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>
          No workflows found.
        </Typography>
      );
    }
    
    if (state === 'loading' && workflows.length === 0) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={20} />
        </Box>
      );
    }
    
    return cats.map((cat) => {
      const items = groupedWorkflows[cat] || [];
      const title = cat === '_root' ? 'Uncategorized' : cat;
      
      return (
        <Accordion 
          key={cat} 
          disableGutters 
          elevation={0} 
          square
          expanded={expandedCategory === cat}
          onChange={handleAccordionChange(cat)}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pl: 1 }}>
            <Typography variant="subtitle2" sx={{ pl: 1 }}>
              {title} ({items.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <List dense sx={{ py: 0 }}>
              {items.map((workflow) => (
                <ListItemButton
                  key={workflow.name}
                  selected={selectedWorkflow?.name === workflow.name}
                  onClick={() => {
                    setSelectedWorkflow(workflow);
                    loadBpmnData(workflow); // Load BPMN data when workflow is selected
                  }}
                  sx={{ pl: 2 }}
                >
                  <ListItemText 
                    primary={workflow.name} 
                    primaryTypographyProps={{ sx: { pl: 1 } }} 
                  />
                </ListItemButton>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      );
    });
  };

  // Main workflow screen
  return (
    <Box sx={{ p: 0, height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h5" fontWeight="bold">
            {workflowName || 'Run Workflow'}
          </Typography>
          {workflowName && <Chip icon={getStateIcon()} label={getStateLabel()} color={getStateColor()} />}
        </Box>
      </Box>

      {/* Two Column Layout - Responsive Grid */}
      <Grid container sx={{ height: { xs: 'auto', md: 'calc(100vh - 185px)' }, minHeight: { xs: 'calc(100vh - 185px)', md: 'auto' }, overflow: 'hidden' }}>
        
        {/* Left Pane - Workflow Info */}
        <Grid 
          item 
          xs={12} 
          md={4} 
          lg={3}
          sx={{ 
            // Use inset box-shadow for a subtle hairline separator (match WorkflowExecution)
            borderRight: { xs: 'none', md: 'none' },
            boxShadow: { xs: 'none', md: `inset -1px 0 0 ${alpha(theme.palette.divider, 0.12)}` },
            borderBottom: { xs: '1px solid', md: 'none' },
            borderBottomColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            height: { xs: 'auto', md: '100%' },
            maxHeight: { xs: '50vh', md: '100%' },
            overflow: 'auto',
            p: 3,
            gap: 2,
          }}
        >
          {/* Workflow Selector - ALWAYS VISIBLE */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Select a Workflow
            </Typography>
            {selectedWorkflow && (
              <Box sx={{ mt: 1, mb: 2 }}>
                <Chip 
                  label={selectedWorkflow.name} 
                  color="primary" 
                  sx={{ maxWidth: '100%' }}
                />
              </Box>
            )}
          </Box>
          
          {/* Edit Workflow Button - Before List */}
          <Tooltip title={!selectedWorkflow ? "Select a workflow first" : !bpmnData ? "Loading workflow diagram..." : "Edit workflow diagram"}>
            <span>
              <Button
                variant="outlined"
                color="secondary"
                size="large"
                fullWidth
                startIcon={loadingBpmn ? <CircularProgress size={16} /> : <Edit size={20} />}
                onClick={handleEditBPMN}
                disabled={!selectedWorkflow || !bpmnData || loadingBpmn}
                sx={{ mb: 2 }}
              >
                Edit Workflow
              </Button>
            </span>
          </Tooltip>
          
          {/* Workflow List by Category */}
          <Box sx={{ 
            flexGrow: 1, 
            overflow: 'auto',
            mb: 2,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1
          }}>
            {renderGroupedWorkflowList()}
          </Box>
          
          {/* Start Workflow Button - After List */}
          <Tooltip title="Start a new workflow instance">
            <span>
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
            </span>
          </Tooltip>

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
        </Grid>

        {/* Right Pane - Main Content */}
        <Grid 
          item 
          xs={12} 
          md={8} 
          lg={9}
          sx={{ 
            height: { xs: '50vh', md: '100%' },
            minHeight: { xs: '400px', md: 'auto' },
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'auto'
          }}
        >
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

          {workflowName && (state === 'running' || state === 'completed' || state === 'failed') && (
            <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
              {/* Header Section */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                {state === 'running' && <CircularProgress size={32} />}
                {state === 'completed' && <CheckCircle size={32} color={theme.palette.success.main} />}
                {state === 'failed' && <XCircle size={32} color={theme.palette.error.main} />}
                
                <Typography variant="h6">
                  {state === 'running' && 'Workflow Executing...'}
                  {state === 'completed' && 'Workflow Completed Successfully!'}
                  {state === 'failed' && 'Workflow Failed'}
                </Typography>
              </Box>

              {/* Error Alert for Failed State */}
              {state === 'failed' && error && (
                <Alert severity="error" sx={{ mb: 3 }}>
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
                    {error || 'An error occurred during execution'}
                  </Typography>
                </Alert>
              )}

              {/* Success Message for Completed State */}
              {state === 'completed' && (
                <Alert severity="success" sx={{ mb: 3 }}>
                  <Typography variant="body1">
                    All workflow tasks have been completed successfully.
                  </Typography>
                </Alert>
              )}

              {/* Task History Display */}
              {taskHistory.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      Task Progress ({taskHistory.filter(t => t.stateCode === 32).length} / {taskHistory.length} completed)
                    </Typography>
                    {(state === 'completed' || state === 'failed') && (
                      <Button 
                        variant="contained" 
                        onClick={handleResetWorkflow}
                        size="medium"
                      >
                        Back
                      </Button>
                    )}
                  </Box>
                  
                  {taskHistory.map((task, idx) => (
                    <Card 
                      key={`${task.id}-${idx}`}
                      variant="outlined"
                      sx={{ 
                        borderLeft: `4px solid ${
                          task.stateCode === 32 ? theme.palette.success.main :
                          task.stateCode === 16 ? theme.palette.warning.main :
                          task.stateCode === 128 ? theme.palette.error.main :
                          theme.palette.info.main
                        }`,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          boxShadow: 2,
                        }
                      }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {getTaskStateIcon(task.stateCode)}
                            <Typography variant="body1" fontWeight="medium">
                              {task.name}
                            </Typography>
                          </Box>
                          <Chip 
                            label={task.state} 
                            size="small" 
                            color={getTaskStateColor(task.stateCode)}
                          />
                        </Box>
                        
                        {task.data && Object.keys(task.data).length > 0 && (
                          <Paper 
                            sx={{ 
                              p: 2, 
                              mt: 2, 
                              bgcolor: alpha(theme.palette.background.default, 0.5),
                              maxHeight: '200px',
                              overflow: 'auto'
                            }}
                          >
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                              Task Data:
                            </Typography>
                            <Typography 
                              variant="body2" 
                              component="pre"
                              sx={{ 
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                m: 0
                              }}
                            >
                              {JSON.stringify(task.data, null, 2)}
                            </Typography>
                          </Paper>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}

              {taskHistory.length === 0 && state === 'running' && (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  justifyContent: 'center',
                  py: 8,
                  gap: 2
                }}>
                  <CircularProgress size={40} />
                  <Typography variant="body1" color="text.secondary">
                    Initializing workflow tasks...
                  </Typography>
                </Box>
              )}

              {/* Show Back button if no tasks but workflow is completed/failed */}
              {taskHistory.length === 0 && (state === 'completed' || state === 'failed') && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                  <Button 
                    variant="contained" 
                    onClick={handleResetWorkflow}
                    size="large"
                  >
                    Back
                  </Button>
                </Box>
              )}
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
        </Grid>
      </Grid>
    </Box>
  );
}

export default WorkflowUI;
