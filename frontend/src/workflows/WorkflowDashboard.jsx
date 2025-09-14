import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Grid,
  Paper,
  Chip,
  CircularProgress,
  alpha,
  useTheme,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import {
  Play,
  Square,
  Upload,
  Activity,
  FileText,
  Settings
} from 'lucide-react'
import WorkflowConfig from './WorkflowConfig'

const WorkflowDashboard = () => {
  const theme = useTheme()
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [instanceId, setInstanceId] = useState('');
  const [runningInstances, setRunningInstances] = useState([]);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  // Helpers to persist instance IDs locally (simple, no backend list yet)
  const getSavedInstanceIds = () => {
    try {
      const raw = localStorage.getItem('workflow_instances');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };
  const saveInstanceIds = (ids) => {
    localStorage.setItem('workflow_instances', JSON.stringify(ids));
  };

  // Start a new workflow
  const startWorkflow = async (workflowName, initialData = {}) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/workflow/workflows/${encodeURIComponent(workflowName)}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ initial_data: initialData })
      });
      
      if (response.ok) {
        const data = await response.json();
        const id = data.instance_id;
        alert(`Workflow started with ID: ${id}`);
        // persist instance id and refresh list
        const ids = getSavedInstanceIds();
        if (!ids.includes(id)) {
          ids.push(id);
          saveInstanceIds(ids);
        }
        await refreshRunningInstances();
      } else {
        alert('Failed to start workflow');
      }
    } catch (error) {
      alert('Error starting workflow: ' + error.message);
    }
    setIsLoading(false);
  };

  // Get workflow status
  const getWorkflowStatus = async (instanceId) => {
    try {
      const response = await fetch(`/api/workflow/workflows/${instanceId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSelectedWorkflow(data);
        setTasks(data.ready_tasks || []);
      }
    } catch (error) {
      console.error('Error getting workflow status:', error);
    }
  };

  // Complete a task
  const completeTask = async (instanceId, taskId, taskData = {}) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/workflow/workflows/${instanceId}/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ data: taskData })
      });
      
      if (response.ok) {
        alert('Task completed successfully');
        getWorkflowStatus(instanceId);
      } else {
        alert('Failed to complete task');
      }
    } catch (error) {
      alert('Error completing task: ' + error.message);
    }
    setIsLoading(false);
  };

  // Run workflow
  const runWorkflow = async (instanceId, maxSteps = null) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/workflow/workflows/${instanceId}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ max_steps: maxSteps })
      });
      
      if (response.ok) {
        const data = await response.json();
        alert('Workflow executed');
        getWorkflowStatus(instanceId);
      } else {
        alert('Failed to run workflow');
      }
    } catch (error) {
      alert('Error running workflow: ' + error.message);
    }
    setIsLoading(false);
  };

  // Stop workflow
  const stopWorkflow = async (instanceId) => {
    if (!confirm('Are you sure you want to stop this workflow?')) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/workflow/workflows/${instanceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        alert('Workflow stopped');
        setSelectedWorkflow(null);
        setTasks([]);
        // remove from local list
        const ids = getSavedInstanceIds().filter(id => id !== instanceId);
        saveInstanceIds(ids);
        await refreshRunningInstances();
      } else {
        alert('Failed to stop workflow');
      }
    } catch (error) {
      alert('Error stopping workflow: ' + error.message);
    }
    setIsLoading(false);
  };

  // Upload BPMN file
  const uploadBpmn = async (file, workflowName) => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('workflow_name', workflowName);

      const response = await fetch('/api/workflow/bpmn/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`BPMN uploaded successfully for workflow: ${data.workflow_name}`);
      } else {
        alert('Failed to upload BPMN');
      }
    } catch (error) {
      alert('Error uploading BPMN: ' + error.message);
    }
    setIsLoading(false);
  };

  // Load available workflow configurations (tiles)
  const loadWorkflows = async () => {
    try {
      const params = new URLSearchParams({ page: '1', page_size: '12', sort_by: 'name', sort_order: 'asc' });
      const resp = await fetch(`/api/workflows/configs?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        setWorkflows(data.configurations || []);
      }
    } catch (e) {
      console.error('Failed to load workflows', e);
    }
  };

  // Refresh running instances by checking saved IDs, keep only non-completed
  const refreshRunningInstances = async () => {
    const ids = getSavedInstanceIds();
    if (ids.length === 0) { setRunningInstances([]); return; }
    try {
      const results = await Promise.allSettled(ids.map(async (id) => {
        const resp = await fetch(`/api/workflow/workflows/${id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!resp.ok) throw new Error('not found');
        const data = await resp.json();
        return data;
      }));
      const active = results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(wf => wf.status && wf.status !== 'completed');
      setRunningInstances(active);
      saveInstanceIds(active.map(wf => wf.instance_id));
    } catch (e) {
      console.error('Failed to refresh instances', e);
    }
  };

  useEffect(() => {
    loadWorkflows();
    refreshRunningInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && newWorkflowName) {
      uploadBpmn(file, newWorkflowName);
    } else {
      alert('Please enter workflow name and select a file');
    }
  };

  return (
    <Box sx={{ 
      p: 3,
      background: theme.custom?.backgroundGradient || theme.palette.background.default,
      minHeight: '100vh'
    }}>
      {/* Header Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
          Workflow Dashboard 🔄
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Monitor and manage your BPMN workflows and process instances.
        </Typography>
        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading...
            </Typography>
          </Box>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* Available Workflows Section */}
        <Grid item xs={12} md={6}>
          <Card sx={{ 
            height: '100%',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Available Workflows
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button size="small" variant="outlined" onClick={() => setConfigDialogOpen(true)}>Create Workflow</Button>
                  <Play size={20} color={theme.palette.primary.main} />
                </Box>
              </Box>
              <Grid container spacing={2}>
                {workflows.length === 0 ? (
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">No workflows found. Upload BPMN to create one.</Typography>
                  </Grid>
                ) : (
                  workflows.map((wf) => (
                    <Grid item xs={12} key={wf.id}>
                      <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                              <Typography variant="subtitle1" fontWeight="bold">{wf.name}</Typography>
                              {wf.category && (
                                <Chip size="small" label={wf.category} sx={{ mt: 0.5 }} />
                              )}
                              {wf.description && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{wf.description}</Typography>
                              )}
                            </Box>
                            <Button 
                              variant="contained" 
                              startIcon={<Play size={16} />} 
                              onClick={() => startWorkflow(wf.name)}
                              disabled={isLoading}
                              sx={{ borderRadius: 2 }}
                            >
                              Start
                            </Button>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Upload BPMN Section */}
        <Grid item xs={12} md={6}>
          <Card sx={{ 
            height: '100%',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Upload BPMN
                </Typography>
                <Upload size={20} color={theme.palette.secondary.main} />
              </Box>
              <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                <TextField
                  fullWidth
                  label="Workflow Name for BPMN"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  variant="outlined"
                  size="small"
                />
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<Upload size={16} />}
                  sx={{ borderRadius: 2 }}
                >
                  Choose BPMN File
                  <input
                    type="file"
                    accept=".bpmn,.xml"
                    onChange={handleFileUpload}
                    hidden
                  />
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Running Instances Section */}
        <Grid item xs={12} md={6}>
          <Card sx={{ 
            height: '100%',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Running Instances
                </Typography>
                <Activity size={20} color={theme.palette.info.main} />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth
                  label="Lookup Instance ID"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  variant="outlined"
                  size="small"
                />
                <Button 
                  variant="outlined"
                  onClick={() => instanceId && getWorkflowStatus(instanceId)}
                  disabled={!instanceId || isLoading}
                  startIcon={<Activity size={16} />}
                  sx={{ borderRadius: 2 }}
                >
                  View
                </Button>
                <Button 
                  variant="contained"
                  onClick={refreshRunningInstances}
                  disabled={isLoading}
                  sx={{ borderRadius: 2 }}
                >
                  Refresh
                </Button>
              </Box>

              {runningInstances.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No running instances found.</Typography>
              ) : (
                <Grid container spacing={2}>
                  {runningInstances.map((wf) => (
                    <Grid item xs={12} key={wf.instance_id}>
                      <Card variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent>
                          <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={6}>
                              <Typography variant="subtitle2" color="text.secondary">Instance</Typography>
                              <Typography variant="body2" fontWeight="medium">{wf.instance_id}</Typography>
                            </Grid>
                            <Grid item xs={12} sm={3}>
                              <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                              <Chip 
                                label={wf.status}
                                color={wf.status === 'completed' ? 'success' : wf.status === 'error' ? 'error' : 'primary'}
                                size="small"
                                variant="outlined"
                              />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                              <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                                <Button size="small" variant="contained" onClick={() => runWorkflow(wf.instance_id)} startIcon={<Play size={14} />}>
                                  Run
                                </Button>
                                <Button size="small" color="error" variant="contained" onClick={() => stopWorkflow(wf.instance_id)} startIcon={<Square size={14} />}>
                                  Stop
                                </Button>
                              </Box>
                            </Grid>
                          </Grid>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Workflow Status Display */}
        {selectedWorkflow && (
          <Grid item xs={12}>
            <Card sx={{ 
              background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
              backdropFilter: 'blur(10px)',
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
            }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                  <Typography variant="h6" fontWeight="bold">
                    Workflow Status
                  </Typography>
                  <Settings size={20} color={theme.palette.primary.main} />
                </Box>
                
                <Paper sx={{ 
                  p: 2, 
                  mb: 3,
                  background: alpha(theme.palette.background.paper, 0.6),
                  border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
                }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2" color="text.secondary">
                        Instance ID
                      </Typography>
                      <Typography variant="body1" fontWeight="medium">
                        {selectedWorkflow.instance_id}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2" color="text.secondary">
                        Status
                      </Typography>
                      <Chip 
                        label={selectedWorkflow.status}
                        color={selectedWorkflow.status === 'completed' ? 'success' : 'primary'}
                        variant="outlined"
                        size="small"
                      />
                    </Grid>
                  </Grid>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button 
                      variant="contained"
                      color="success"
                      onClick={() => runWorkflow(selectedWorkflow.instance_id)}
                      startIcon={<Play size={16} />}
                      sx={{ borderRadius: 2 }}
                    >
                      Run Workflow
                    </Button>
                    <Button 
                      variant="contained"
                      color="error"
                      onClick={() => stopWorkflow(selectedWorkflow.instance_id)}
                      startIcon={<Square size={16} />}
                      sx={{ borderRadius: 2 }}
                    >
                      Stop Workflow
                    </Button>
                  </Box>
                </Paper>

                {/* Tasks Section */}
                {tasks.length > 0 && (
                  <Box>
                    <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                      Ready Tasks
                    </Typography>
                    <Grid container spacing={2}>
                      {tasks.map((task, index) => (
                        <Grid item xs={12} sm={6} md={4} key={index}>
                          <Card sx={{ 
                            background: alpha(theme.palette.background.paper, 0.4),
                            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
                          }}>
                            <CardContent>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" fontWeight="medium">
                                  {task.name}
                                </Typography>
                                <FileText size={16} color={theme.palette.text.secondary} />
                              </Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                ID: {task.task_id || task.id}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                Type: {task.type}
                              </Typography>
                              <Button 
                                size="small"
                                variant="contained"
                                fullWidth
                                onClick={() => completeTask(selectedWorkflow.instance_id, task.task_id || task.id)}
                                sx={{ borderRadius: 1.5 }}
                              >
                                Complete Task
                              </Button>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Create/Edit Workflow Configuration Dialog */}
      <Dialog
        open={configDialogOpen}
        onClose={() => { setConfigDialogOpen(false); loadWorkflows(); }}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Workflow Configuration</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {/* Pass token from localStorage as user prop */}
          <WorkflowConfig user={{ token: localStorage.getItem('token') }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfigDialogOpen(false); loadWorkflows(); }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WorkflowDashboard;