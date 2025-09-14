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
  Divider
} from '@mui/material'
import {
  Play,
  Square,
  Upload,
  Activity,
  FileText,
  Settings
} from 'lucide-react'

const WorkflowDashboard = () => {
  const theme = useTheme()
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [instanceId, setInstanceId] = useState('');

  // Start a new workflow
  const startWorkflow = async (workflowName, initialData = {}) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/workflows/${workflowName}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ initial_data: initialData })
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`Workflow started with ID: ${data.instance_id}`);
        loadWorkflows();
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
      const response = await fetch(`/api/workflows/${instanceId}`, {
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
      const response = await fetch(`/api/workflows/${instanceId}/tasks/${taskId}/complete`, {
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
      const response = await fetch(`/api/workflows/${instanceId}/run`, {
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
      const response = await fetch(`/api/workflows/${instanceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        alert('Workflow stopped');
        setSelectedWorkflow(null);
        setTasks([]);
        loadWorkflows();
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

      const response = await fetch('/api/bpmn/upload', {
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

  // Load workflows (placeholder - you'd need an endpoint to list workflows)
  const loadWorkflows = async () => {
    // This would need a proper endpoint to list workflows
    // For now, just a placeholder
  };

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
        {/* Start Workflow Section */}
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
                  Start New Workflow
                </Typography>
                <Play size={20} color={theme.palette.primary.main} />
              </Box>
              <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                <TextField
                  fullWidth
                  label="Workflow Name"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  variant="outlined"
                  size="small"
                />
                <Button 
                  variant="contained"
                  onClick={() => startWorkflow(newWorkflowName)}
                  disabled={!newWorkflowName || isLoading}
                  startIcon={<Play size={16} />}
                  sx={{ borderRadius: 2 }}
                >
                  Start Workflow
                </Button>
              </Box>
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

        {/* Workflow Status Lookup Section */}
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
                  Check Workflow Status
                </Typography>
                <Activity size={20} color={theme.palette.info.main} />
              </Box>
              <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
                <TextField
                  fullWidth
                  label="Workflow Instance ID"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  variant="outlined"
                  size="small"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && instanceId) {
                      getWorkflowStatus(instanceId);
                    }
                  }}
                />
                <Button 
                  variant="contained"
                  onClick={() => instanceId && getWorkflowStatus(instanceId)}
                  disabled={!instanceId || isLoading}
                  startIcon={<Activity size={16} />}
                  sx={{ borderRadius: 2 }}
                >
                  Get Status
                </Button>
              </Box>
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
    </Box>
  );
};

export default WorkflowDashboard;