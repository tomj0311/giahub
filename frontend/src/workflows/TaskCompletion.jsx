import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  TextField,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  FormControlLabel,
  Checkbox,
  useTheme,
} from '@mui/material';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import sharedApiService from '../utils/apiService';

function TaskCompletion({ user }) {
  const { workflowId, instanceId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [taskData, setTaskData] = useState(null);
  const [formData, setFormData] = useState({});

  const token = useMemo(() => user?.token || localStorage.getItem('token'), [user?.token]);
  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token]
  );

  useEffect(() => {
    loadTaskData();
  }, [workflowId, instanceId]);

  const loadTaskData = async () => {
    try {
      setLoading(true);
      setError('');

      const result = await sharedApiService.makeRequest(
        `/api/workflow/workflows/${workflowId}/instances/${instanceId}`,
        {
          method: 'GET',
          headers,
        },
        { workflowId, instanceId, action: 'get_instance_for_task' }
      );

      if (result.success) {
        const instanceData = result.data.data;
        
        // Find pending tasks
        if (instanceData.serialized_data?.tasks) {
          const tasks = instanceData.serialized_data.tasks;
          const pendingTasks = Object.entries(tasks)
            .filter(([taskId, task]) => task.state === 16) // READY state
            .map(([taskId, task]) => ({
              taskId,
              taskSpec: task.task_spec,
              task: task
            }));

          if (pendingTasks.length > 0) {
            const firstTask = pendingTasks[0];
            const taskSpec = instanceData.serialized_data?.spec?.task_specs?.[firstTask.taskSpec];
            
            setTaskData({
              taskId: firstTask.taskId,
              taskSpec: firstTask.taskSpec,
              taskName: taskSpec?.bpmn_name || taskSpec?.name || firstTask.taskSpec,
              formFields: taskSpec?.extensions?.formData?.formFields || [],
              instanceData
            });
          } else {
            setError('No pending tasks found for this workflow instance.');
          }
        } else {
          setError('Invalid workflow instance data.');
        }
      } else {
        setError('Failed to load task data.');
      }
    } catch (err) {
      console.error('Failed to load task:', err);
      setError('Failed to load task data.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (fieldId, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError('');

      const submissionData = {
        data: formData,
        task_id: taskData.taskSpec
      };

      const result = await sharedApiService.makeRequest(
        `/api/workflow/workflows/${workflowId}/instances/${instanceId}/submit-task`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(submissionData),
        },
        { workflowId, instanceId, action: 'submit_task' }
      );

      if (result.success) {
        setSuccess(true);
      } else {
        setError('Failed to submit task.');
      }
    } catch (err) {
      console.error('Failed to submit task:', err);
      setError('Failed to submit task.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: theme.custom?.backgroundGradient || theme.palette.background.default
      }}>
        <CircularProgress size={40} />
        <Typography sx={{ ml: 2 }}>Loading task...</Typography>
      </Box>
    );
  }

  if (success) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: theme.custom?.backgroundGradient || theme.palette.background.default,
        p: 2
      }}>
        <Card sx={{ maxWidth: 500, width: '100%' }}>
          <CardContent sx={{ textAlign: 'center', p: 4 }}>
            <CheckCircle size={64} color={theme.palette.success.main} style={{ marginBottom: 16 }} />
            <Typography variant="h5" gutterBottom>
              Task Completed Successfully!
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Your task has been submitted and the workflow will continue processing.
            </Typography>
            <Button 
              variant="contained" 
              onClick={() => navigate('/dashboard')}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      minHeight: '100vh',
      background: theme.custom?.backgroundGradient || theme.palette.background.default,
      p: 2
    }}>
      <Box sx={{ maxWidth: 600, mx: 'auto', pt: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowLeft />}
            onClick={() => navigate('/dashboard')}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Typography variant="h4" fontWeight="bold">
            Complete Task
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {taskData && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {taskData.taskName}
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                Instance: {instanceId} | Task: {taskData.taskSpec}
              </Typography>

              {taskData.formFields.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {taskData.formFields.map((field) => (
                    <Box key={field.id}>
                      {field.type === 'boolean' ? (
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={formData[field.id] || false}
                              onChange={(e) => handleFormChange(field.id, e.target.checked)}
                            />
                          }
                          label={field.label || field.id}
                        />
                      ) : (
                        <TextField
                          fullWidth
                          label={field.label || field.id}
                          value={formData[field.id] || ''}
                          onChange={(e) => handleFormChange(field.id, e.target.value)}
                          required={field.required === 'true' || field.required === true}
                          type={field.type === 'number' ? 'number' : 'text'}
                          variant="outlined"
                        />
                      )}
                    </Box>
                  ))}

                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleSubmit}
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={16} /> : null}
                    sx={{ mt: 2 }}
                  >
                    {submitting ? 'Submitting...' : 'Submit Task'}
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    This task requires confirmation to proceed.
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleSubmit}
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={16} /> : null}
                  >
                    {submitting ? 'Submitting...' : 'Confirm & Continue'}
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}

export default TaskCompletion;