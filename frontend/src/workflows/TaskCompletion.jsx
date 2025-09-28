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
  Chip,
  Paper,
} from '@mui/material';
import { ArrowLeft, CheckCircle, Paperclip, X } from 'lucide-react';
import sharedApiService from '../utils/apiService';

function TaskCompletion({ user, workflowId: propWorkflowId, instanceId: propInstanceId, isDialog = false, onClose, onSuccess }) {
  const { workflowId: paramWorkflowId, instanceId: paramInstanceId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  
  // Use props if provided (dialog mode), otherwise use URL params
  const workflowId = propWorkflowId || paramWorkflowId;
  const instanceId = propInstanceId || paramInstanceId;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [taskData, setTaskData] = useState(null);
  const [formData, setFormData] = useState({});
  const [attachedFiles, setAttachedFiles] = useState([]);

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

  const handleFileAttachment = (event) => {
    const newFiles = Array.from(event.target.files || []);
    setAttachedFiles(prev => [...prev, ...newFiles]);
    event.target.value = ''; // Reset input
  };

  const removeFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (attachedFiles.length === 0) return { success: true };

    try {
      // Simple upload without vector indexing - just store files in MinIO
      const formData = new FormData();
      const collectionName = `task_${instanceId}`;
      const taskId = taskData.taskSpec;
      
      // Add collection, task_id and files
      formData.append('collection', collectionName);
      formData.append('task_id', taskId);
      attachedFiles.forEach(file => formData.append('files', file));

      console.log('🚀 SIMPLE UPLOADING FILES:', attachedFiles.map(f => f.name));
      console.log('📍 COLLECTION:', collectionName);
      console.log('📍 TASK_ID:', taskId);
      console.log('📍 EXPECTED PATH: uploads/{user_id}/' + collectionName + '/' + taskId + '/{filename}');

      // Use new simple upload endpoint - NO VECTOR INDEXING
      const result = await sharedApiService.makeRequest(
        '/api/simple-upload',
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        },
        { collection: collectionName, task_id: taskId, files: attachedFiles.length, token: token?.substring(0, 10) }
      );

      if (result.success) {
        console.log('✅ SIMPLE UPLOAD SUCCESS:', result.data);
        return { success: true, data: result.data };
      } else {
        console.error('❌ SIMPLE UPLOAD FAILED:', result.error);
        return { 
          success: false, 
          error: result.error || 'Simple upload failed'
        };
      }
    } catch (error) {
      console.error('💥 SIMPLE UPLOAD ERROR:', error);
      return { 
        success: false, 
        error: error.message || 'Simple upload failed'
      };
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError('');

      // Upload files first if any
      if (attachedFiles.length > 0) {
        const uploadResult = await uploadFiles();
        if (!uploadResult.success) {
          setError(`File upload failed: ${uploadResult.error}`);
          return;
        }
      }

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
        // Call onSuccess callback if provided (dialog mode)
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
          }, 1500); // Show success message briefly before closing
        }
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
        minHeight: isDialog ? '400px' : '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: isDialog ? 'transparent' : (theme.custom?.backgroundGradient || theme.palette.background.default)
      }}>
        <CircularProgress size={40} />
        <Typography sx={{ ml: 2 }}>Loading task...</Typography>
      </Box>
    );
  }

  if (success) {
    return (
      <Box sx={{ 
        minHeight: isDialog ? '400px' : '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: isDialog ? 'transparent' : (theme.custom?.backgroundGradient || theme.palette.background.default),
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
            {!isDialog && (
              <Button 
                variant="contained" 
                onClick={() => navigate('/dashboard')}
              >
                Go to Dashboard
              </Button>
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      minHeight: isDialog ? 'auto' : '100vh',
      background: isDialog ? 'transparent' : (theme.custom?.backgroundGradient || theme.palette.background.default),
      p: 2,
      overflow: 'auto',
      maxHeight: isDialog ? '80vh' : 'none'
    }}>
      <Box sx={{ maxWidth: 600, mx: 'auto', pt: isDialog ? 1 : 4 }}>
        {/* Header */}
        {!isDialog && (
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Typography variant="h4" fontWeight="bold">
              Complete Task
            </Typography>
          </Box>
        )}
        {isDialog && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h5" fontWeight="bold">
              Complete Task
            </Typography>
            <Button onClick={onClose} color="inherit">
              ×
            </Button>
          </Box>
        )}

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

                  {/* File Attachment Section */}
                  <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Attach Files
                    </Typography>
                    
                    <input
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      id="task-file-upload"
                      onChange={handleFileAttachment}
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif"
                    />
                    <label htmlFor="task-file-upload">
                      <Button
                        component="span"
                        variant="outlined"
                        startIcon={<Paperclip size={16} />}
                        disabled={submitting}
                        sx={{ mb: 1 }}
                      >
                        Attach Files
                      </Button>
                    </label>

                    {attachedFiles.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                        {attachedFiles.map((file, index) => (
                          <Chip
                            key={index}
                            label={`${file.name} (${(file.size / 1024).toFixed(1)} KB)`}
                            onDelete={() => removeFile(index)}
                            deleteIcon={<X size={14} />}
                            color="primary"
                            variant="outlined"
                            size="small"
                          />
                        ))}
                      </Box>
                    )}
                  </Paper>

                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleSubmit}
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={16} /> : null}
                    sx={{ mt: 2, alignSelf: 'flex-end' }}
                  >
                    {submitting ? 'Submitting...' : 'Submit Task'}
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    This task requires confirmation to proceed.
                  </Typography>

                  {/* File Attachment Section */}
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Attach Files
                    </Typography>
                    
                    <input
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      id="task-file-upload-confirm"
                      onChange={handleFileAttachment}
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif"
                    />
                    <label htmlFor="task-file-upload-confirm">
                      <Button
                        component="span"
                        variant="outlined"
                        startIcon={<Paperclip size={16} />}
                        disabled={submitting}
                        sx={{ mb: 1 }}
                      >
                        Attach Files
                      </Button>
                    </label>

                    {attachedFiles.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                        {attachedFiles.map((file, index) => (
                          <Chip
                            key={index}
                            label={`${file.name} (${(file.size / 1024).toFixed(1)} KB)`}
                            onDelete={() => removeFile(index)}
                            deleteIcon={<X size={14} />}
                            color="primary"
                            variant="outlined"
                            size="small"
                          />
                        ))}
                      </Box>
                    )}
                  </Paper>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
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