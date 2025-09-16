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
  CardActions
} from '@mui/material';
import {
  ArrowLeft,
  Play,
  RefreshCw,
  Settings2,
  CheckCircle2,
  List,
  Eye,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { apiCall } from '../config/api';

console.log('🚨🚨🚨 WORKFLOW EXECUTION MODULE LOADED 🚨🚨🚨');

function WorkflowExecution({ user }) {
  console.log('🚨🚨🚨 WORKFLOW EXECUTION COMPONENT RENDERING 🚨🚨🚨');
  console.log('🚨 USER PROP:', user);
  console.log('🚨 LOCATION:', window.location.href);
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const workflowId = searchParams.get('workflow');
  const theme = useTheme();
  
  // Existing states
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('unknown'); // 'instance' | 'config' | 'unknown'
  const [instanceId, setInstanceId] = useState('');
  const [status, setStatus] = useState(null); // workflow status payload
  const [maxSteps, setMaxSteps] = useState(100);
  const [taskDataJson, setTaskDataJson] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [configNotFound, setConfigNotFound] = useState(false);
  const [workflows, setWorkflows] = useState([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [startByName, setStartByName] = useState('');
  
  // New states for workflow instances management
  const [showInstancesList, setShowInstancesList] = useState(false);
  const [instances, setInstances] = useState([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [pageSize] = useState(10);
  
  console.log('🚨 WORKFLOW ID FROM URL:', workflowId);

  const token = useMemo(() => user?.token || localStorage.getItem('token'), [user?.token]);
  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  const loadStatus = useCallback(async (id) => {
    if (!id) return;
    setLoadingStatus(true);
    setError('');
    try {
  const res = await apiCall(`/api/workflow/workflows/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setInstanceId(id);
        setMode('instance');
        setConfigNotFound(false);
      } else if (res.status === 404) {
        // Not an instance id — likely a config id
        setMode('config');
        setStatus(null);
        setConfigNotFound(false);
      } else {
        const txt = await res.text();
        throw new Error(txt || `Status request failed (${res.status})`);
      }
    } catch (e) {
      console.error('Failed to load status:', e);
      setError(e?.message || 'Failed to load status');
    } finally {
      setLoadingStatus(false);
    }
  }, [headers]);

  useEffect(() => {
    setMode('unknown');
    setInstanceId('');
    setStatus(null);
    setConfigNotFound(false);
    if (workflowId) {
      loadStatus(workflowId);
    }
  }, [workflowId, loadStatus]);

  const loadAvailableWorkflows = useCallback(async () => {
    if (!token) return;
    setLoadingWorkflows(true);
    try {
      const res = await apiCall(`/api/workflow/redis/all`, { headers });
      if (res.ok) {
        const json = await res.json();
        setWorkflows(Array.isArray(json?.workflows) ? json.workflows : []);
      } else {
        setWorkflows([]);
      }
    } catch {
      setWorkflows([]);
    } finally {
      setLoadingWorkflows(false);
    }
  }, [headers, token]);

  useEffect(() => {
    // Preload available workflows for selection when needed
    loadAvailableWorkflows();
  }, [loadAvailableWorkflows]);

  // New callback functions for workflow instances management
  const loadWorkflowInstances = useCallback(async (page = 1, status = '', size = pageSize) => {
    if (!token) return;
    setLoadingInstances(true);
    try {
      const skip = (page - 1) * size;
      const queryParams = new URLSearchParams({
        limit: size.toString(),
        skip: skip.toString()
      });
      if (status) queryParams.append('status', status);
      
      const res = await apiCall(`/api/workflow/instances?${queryParams}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setInstances(data.instances || []);
        setTotalPages(data.total_pages || 1);
        setCurrentPage(data.current_page || 1);
      } else {
        throw new Error('Failed to load workflow instances');
      }
    } catch (e) {
      console.error('Failed to load workflow instances:', e);
      setError(e?.message || 'Failed to load workflow instances');
    } finally {
      setLoadingInstances(false);
    }
  }, [headers, token, pageSize]);

  const startWorkflowByConfigId = useCallback(async (configId) => {
    if (!configId) return;
    setRunning(true);
    setResult(null);
    setError('');

    try {
      // Start workflow by config ID
      const startRes = await apiCall(`/api/workflow/workflows/config/${configId}/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ initial_data: {} })
      });

      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok) {
        throw new Error(startData.detail || 'Failed to start workflow');
      }

      const newInstanceId = startData.instance_id;
      
      // Update URL to point to the new instance
      setSearchParams({ workflow: newInstanceId });
      
      // Load status for the new instance
      await loadStatus(newInstanceId);
      
      setResult({
        instanceId: newInstanceId,
        message: 'Workflow started successfully',
        config_id: configId
      });
      
      // Refresh instances list if showing
      if (showInstancesList) {
        await loadWorkflowInstances(currentPage, statusFilter);
      }
      
    } catch (err) {
      const message = err?.message || 'Unknown error starting workflow';
      console.error('Workflow start error:', err);
      setError(message);
    } finally {
      setRunning(false);
    }
  }, [headers, loadStatus, setSearchParams, showInstancesList, currentPage, statusFilter, loadWorkflowInstances]);

  const handlePageChange = useCallback((event, page) => {
    setCurrentPage(page);
    loadWorkflowInstances(page, statusFilter);
  }, [loadWorkflowInstances, statusFilter]);

  const handleStatusFilterChange = useCallback((event) => {
    const newStatus = event.target.value;
    setStatusFilter(newStatus);
    setCurrentPage(1);
    loadWorkflowInstances(1, newStatus);
  }, [loadWorkflowInstances]);

  const viewWorkflowInstance = useCallback((instanceId) => {
    setSearchParams({ workflow: instanceId });
  }, [setSearchParams]);

  const formatDateTime = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  }, []);

  const getStatusIcon = useCallback((status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle color="success" size={16} />;
      case 'running':
        return <Clock color="primary" size={16} />;
      case 'error':
        return <XCircle color="error" size={16} />;
      default:
        return <Clock color="disabled" size={16} />;
    }
  }, []);

  // Load instances when showing the list
  useEffect(() => {
    if (showInstancesList) {
      loadWorkflowInstances(currentPage, statusFilter);
    }
  }, [showInstancesList, loadWorkflowInstances, currentPage, statusFilter]);

  const executeWorkflow = useCallback(async () => {
    if (!workflowId) return;
    setRunning(true);
    setResult(null);
    setError('');

    try {
      let idToRun = instanceId || workflowId;

      // If current mode is config, use the new startWorkflowByConfigId method
      if (mode === 'config') {
        await startWorkflowByConfigId(workflowId);
        return;
      }

      const runRes = await apiCall(`/api/workflow/workflows/${idToRun}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ max_steps: Number(maxSteps) || 100 })
      });

      const data = await runRes.json().catch(() => ({}));
      if (!runRes.ok) {
        throw new Error(data?.detail || `Run failed (status ${runRes.status})`);
      }
      setResult({ instanceId: idToRun, ...data });
      // Refresh status after running
      await loadStatus(idToRun);
    } catch (err) {
      const message = err?.message || 'Unknown error executing workflow';
      console.error('Workflow execution error:', err);
      setError(message);
    } finally {
      setRunning(false);
    }
  }, [workflowId, headers, maxSteps, mode, instanceId, loadStatus, startWorkflowByConfigId]);

  const refreshStatus = useCallback(async () => {
    const id = instanceId || workflowId;
    if (!id) return;
    await loadStatus(id);
  }, [instanceId, workflowId, loadStatus]);

  const completeTask = useCallback(async (taskId) => {
    const id = instanceId || workflowId;
    if (!id || !taskId) return;
    setRunning(true);
    setError('');
    try {
      let dataBody = undefined;
      if (taskDataJson && taskDataJson.trim().length > 0) {
        try {
          dataBody = JSON.parse(taskDataJson);
        } catch (e) {
          throw new Error('Invalid task data JSON');
        }
      }
      const res = await apiCall(`/api/workflow/workflows/${id}/tasks/${taskId}/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: dataBody })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.detail || `Complete task failed (${res.status})`);
      }
      await loadStatus(id);
    } catch (e) {
      console.error('Complete task error:', e);
      setError(e?.message || 'Task completion failed');
    } finally {
      setRunning(false);
    }
  }, [instanceId, workflowId, headers, taskDataJson, loadStatus]);

  const startAndRunByName = useCallback(async () => {
    if (!startByName) return;
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const res = await apiCall(`/api/workflow/workflows/${encodeURIComponent(startByName)}/start`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ initial_data: {} })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const t = j?.detail || (await res.text().catch(() => ''));
        throw new Error(t || `Start failed (${res.status})`);
      }
      const j = await res.json();
      const newId = j.instance_id;
      setInstanceId(newId);
      setMode('instance');
      await loadStatus(newId);
      // Run immediately
      const runRes = await apiCall(`/api/workflow/workflows/${newId}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ max_steps: Number(maxSteps) || 100 })
      });
      const data = await runRes.json().catch(() => ({}));
      if (!runRes.ok) {
        throw new Error(data?.detail || `Run failed (status ${runRes.status})`);
      }
      setResult({ instanceId: newId, ...data });
      await loadStatus(newId);
      setConfigNotFound(false);
    } catch (e) {
      console.error('Start by name error:', e);
      setError(e?.message || 'Start by name failed');
    } finally {
      setRunning(false);
    }
  }, [startByName, headers, maxSteps, loadStatus]);
  
  return (
    <Box sx={{ 
      p: 3,
      background: theme.custom?.backgroundGradient || theme.palette.background.default,
      minHeight: '100vh'
    }}>
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
            <Tooltip title="Toggle instances list">
              <Button
                variant={showInstancesList ? "contained" : "outlined"}
                color="info"
                startIcon={<List />}
                onClick={() => setShowInstancesList(!showInstancesList)}
              >
                {showInstancesList ? 'Hide' : 'Show'} Instances
              </Button>
            </Tooltip>
            {mode !== 'unknown' && (
              <Chip
                label={mode === 'config' ? 'Config ID' : 'Instance ID'}
                color={mode === 'config' ? 'default' : 'primary'}
                size="small"
              />
            )}
            <Tooltip title={mode === 'config' ? 'Start then run' : 'Run steps'}>
              <span>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={running ? <CircularProgress color="inherit" size={16} /> : <Play />}
                  disabled={!workflowId || running || (status?.status === 'completed' && mode === 'instance')}
                  onClick={executeWorkflow}
                >
                  {mode === 'config' ? (running ? 'Starting…' : 'Start & Run') : (running ? 'Running…' : 'Run')}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Refresh status">
              <span>
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<RefreshCw />}
                  disabled={loadingStatus || running || !workflowId}
                  onClick={refreshStatus}
                >
                  Refresh
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ 
        p: 4, 
        textAlign: 'center',
        background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        borderRadius: 3
      }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h5" gutterBottom>
            {mode === 'config' ? 'Ready to start a new instance' : mode === 'instance' ? 'Controlling existing instance' : 'Detecting ID type…'}
          </Typography>
          <Typography variant="body1">
            ID from URL: <strong>{workflowId || 'NOT PROVIDED'}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            User token: {token ? '✅ PRESENT' : '❌ MISSING'}
          </Typography>

          {mode === 'instance' && status && (
            <Alert severity={status.status === 'completed' ? 'success' : status.status === 'error' ? 'error' : 'info'} sx={{ width: '100%', maxWidth: 900 }}>
              Status: <strong>{status.status}</strong>
            </Alert>
          )}

          {mode !== 'config' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <TextField
                label="Max Steps"
                size="small"
                type="number"
                value={maxSteps}
                onChange={(e) => setMaxSteps(e.target.value)}
                InputProps={{ inputProps: { min: 1, max: 1000 } }}
              />
              {instanceId && (
                <Chip icon={<Settings2 />} label={`Instance: ${instanceId}`} variant="outlined" />
              )}
            </Stack>
          )}

          {mode === 'config' && configNotFound && (
            <Box sx={{ width: '100%', maxWidth: 900 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Workflow configuration not found in Redis for this ID. You can start by workflow name or pick one from your tenant list below.
              </Alert>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                <TextField
                  label="Start by workflow name"
                  placeholder="e.g. order_approval"
                  size="small"
                  fullWidth
                  value={startByName}
                  onChange={(e) => setStartByName(e.target.value)}
                />
                <Button variant="contained" onClick={startAndRunByName} disabled={!startByName || running}>
                  Start & Run
                </Button>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle1" gutterBottom>
                Available Workflows in Tenant
              </Typography>
              {loadingWorkflows ? (
                <CircularProgress size={20} />
              ) : workflows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No workflows found.</Typography>
              ) : (
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {workflows.map(w => (
                    <Chip
                      key={w.redis_key}
                      label={`${w.name} (${w.category || 'general'})`}
                      onClick={() => setStartByName(w.name)}
                      sx={{ mb: 1 }}
                      variant={startByName === w.name ? 'filled' : 'outlined'}
                      color={w.type === 'workflow_config' ? 'primary' : 'default'}
                    />
                  ))}
                </Stack>
              )}
            </Box>
          )}
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

        {result && (
          <Box sx={{ mt: 3, textAlign: 'left', mx: 'auto', maxWidth: 720 }}>
            <Typography variant="h6">Execution Result</Typography>
            <Typography variant="body2">Instance ID: {result.instanceId}</Typography>
            <Typography variant="body2">Steps Executed: {result.steps_executed}</Typography>
            <Typography variant="body2">Completed: {String(result.is_completed)}</Typography>
            <Typography variant="body2">Ready Tasks: {Array.isArray(result.ready_tasks) ? result.ready_tasks.join(', ') : '-'}</Typography>
          </Box>
        )}

        {mode === 'instance' && status && (
          <>
            <Divider sx={{ my: 3 }} />
            <Box sx={{ textAlign: 'left', mx: 'auto', maxWidth: 900 }}>
              <Typography variant="h6" gutterBottom>Ready Tasks</Typography>
              {Array.isArray(status.ready_tasks) && status.ready_tasks.length > 0 ? (
                <Stack spacing={1}>
                  {status.ready_tasks.map((t) => (
                    <Box key={t.task_id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, border: `1px solid ${alpha(theme.palette.divider, 0.2)}`, borderRadius: 1 }}>
                      <Box>
                        <Typography variant="subtitle2">{t.name}</Typography>
                        <Typography variant="caption" color="text.secondary">ID: {t.task_id} • Type: {t.type} • State: {t.state}</Typography>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Tooltip title="Complete task with optional data">
                          <span>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              startIcon={<CheckCircle2 />}
                              disabled={running}
                              onClick={() => completeTask(t.task_id)}
                            >
                              Complete
                            </Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    </Box>
                  ))}
                  <TextField
                    label="Task Data (JSON)"
                    placeholder='{"key":"value"}'
                    fullWidth
                    multiline
                    minRows={2}
                    value={taskDataJson}
                    onChange={(e) => setTaskDataJson(e.target.value)}
                  />
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">No ready tasks.</Typography>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Workflow Instances List */}
      {showInstancesList && (
        <Box sx={{ mt: 3 }}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Workflow Instances</Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Status Filter</InputLabel>
                    <Select
                      value={statusFilter}
                      label="Status Filter"
                      onChange={handleStatusFilterChange}
                    >
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="running">Running</MenuItem>
                      <MenuItem value="completed">Completed</MenuItem>
                      <MenuItem value="error">Error</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshCw />}
                    onClick={() => loadWorkflowInstances(currentPage, statusFilter)}
                    disabled={loadingInstances}
                  >
                    Refresh
                  </Button>
                </Stack>
              </Box>

              {loadingInstances ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : instances.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No workflow instances found.
                </Typography>
              ) : (
                <>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Instance ID</TableCell>
                          <TableCell>Workflow Name</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell>Created</TableCell>
                          <TableCell>Updated</TableCell>
                          <TableCell>Ready Tasks</TableCell>
                          <TableCell>In Memory</TableCell>
                          <TableCell>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {instances.map((instance) => (
                          <TableRow key={instance.instance_id}>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8em' }}>
                                {instance.instance_id.substring(0, 8)}...
                              </Typography>
                            </TableCell>
                            <TableCell>{instance.workflow_name}</TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={1} alignItems="center">
                                {getStatusIcon(instance.status)}
                                <Chip 
                                  label={instance.status} 
                                  size="small"
                                  color={instance.status === 'completed' ? 'success' : instance.status === 'error' ? 'error' : 'primary'}
                                />
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {formatDateTime(instance.created_at)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {formatDateTime(instance.updated_at)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={instance.ready_tasks_count || 0} 
                                size="small" 
                                color={instance.ready_tasks_count > 0 ? 'warning' : 'default'}
                              />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={instance.in_memory ? 'Yes' : 'No'} 
                                size="small"
                                color={instance.in_memory ? 'success' : 'default'}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<Eye />}
                                onClick={() => viewWorkflowInstance(instance.instance_id)}
                                disabled={workflowId === instance.instance_id}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  
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
                </>
              )}
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}

export default WorkflowExecution;
