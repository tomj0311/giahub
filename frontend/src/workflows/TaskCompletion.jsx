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
import DynamicComponent from '../components/dynamic/DynamicComponent';

function TaskCompletion({ user, workflowId: propWorkflowId, instanceId: propInstanceId, taskId: propTaskId, isDialog = false, onClose, onSuccess }) {
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

  // Helper function to extract JSX code from markdown blocks
  const extractJSXFromMarkdown = (script) => {
    if (!script) return null;
    
    // Match ```jsx ... ``` blocks
    const jsxMatch = script.match(/```jsx\s*([\s\S]*?)\s*```/);
    if (jsxMatch && jsxMatch[1]) {
      return jsxMatch[1].trim();
    }
    
    return null;
  };

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

  // Listen for form submission events from dynamic component
  useEffect(() => {
    const handleDynamicFormSubmit = (event) => {
      console.log('📨 Received workflowFormSubmit event from dynamic component:', event.detail);
      if (event.detail && taskData) {
        handleSubmit(event.detail);
      }
    };

    window.addEventListener('workflowFormSubmit', handleDynamicFormSubmit);
    
    return () => {
      window.removeEventListener('workflowFormSubmit', handleDynamicFormSubmit);
    };
  }, [taskData, workflowId, instanceId]);

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
            
            // Extract script data if available
            let scriptCode = null;
            if (taskSpec?.extensions?.extensionElements?.formData?.scriptData?.script) {
              const rawScript = taskSpec.extensions.extensionElements.formData.scriptData.script;
              scriptCode = extractJSXFromMarkdown(rawScript);
              console.log('Extracted JSX script:', scriptCode ? 'Found' : 'Not found');
            }
            
            // Extract form fields from the correct structure
            let formFields = [];
            if (taskSpec?.extensions?.extensionElements?.formData?.formField) {
              const formField = taskSpec.extensions.extensionElements.formData.formField;
              // Handle both single form field and array of form fields
              formFields = Array.isArray(formField) ? formField : [formField];
              console.log('Found form fields in extensionElements:', formFields);
            } else if (taskSpec?.extensions?.formData?.formFields) {
              // Fallback to the old structure if it exists
              formFields = taskSpec.extensions.formData.formFields;
              console.log('Found form fields in legacy structure:', formFields);
            } else {
              console.log('No form fields found in task spec:', taskSpec);
            }

            setTaskData({
              taskId: firstTask.taskId,
              taskSpec: firstTask.taskSpec,
              taskName: taskSpec?.bpmn_name || taskSpec?.name || firstTask.taskSpec,
              formFields: formFields,
              scriptCode: scriptCode, // Add the extracted script
              instanceData
            });
          } else {
            // If a specific task ID was provided, show data for that task
            if (propTaskId) {
              const taskSpecs = instanceData.serialized_data?.spec?.task_specs || {};
              const specificTaskSpec = taskSpecs[propTaskId];
              
              if (specificTaskSpec) {
                const workflowData = instanceData.serialized_data?.data || instanceData.data || {};
                
                // Extract script data if available
                let scriptCode = null;
                if (specificTaskSpec?.extensions?.extensionElements?.formData?.scriptData?.script) {
                  const rawScript = specificTaskSpec.extensions.extensionElements.formData.scriptData.script;
                  scriptCode = extractJSXFromMarkdown(rawScript);
                  console.log('Extracted JSX script (specific task):', scriptCode ? 'Found' : 'Not found');
                }
                
                // Extract form fields from the correct structure
                let formFields = [];
                if (specificTaskSpec.extensions?.extensionElements?.formData?.formField) {
                  const formField = specificTaskSpec.extensions.extensionElements.formData.formField;
                  // Handle both single form field and array of form fields
                  formFields = Array.isArray(formField) ? formField : [formField];
                  console.log('Found form fields in extensionElements (specific task):', formFields);
                } else if (specificTaskSpec.extensions?.formData?.formFields) {
                  // Fallback to the old structure if it exists
                  formFields = specificTaskSpec.extensions.formData.formFields;
                  console.log('Found form fields in legacy structure (specific task):', formFields);
                } else {
                  console.log('No form fields found in specific task spec:', specificTaskSpec);
                }
                
                // Create form fields with values from workflow data
                const fieldsWithData = formFields.map(field => ({
                  ...field,
                  value: workflowData[field.id] || 'Not provided'
                }));
                
                setTaskData({
                  taskId: propTaskId,
                  taskSpec: propTaskId,
                  taskName: specificTaskSpec.bpmn_name || specificTaskSpec.name || propTaskId,
                  formFields: fieldsWithData,
                  scriptCode: scriptCode, // Add the extracted script
                  instanceData,
                  isCompleted: true
                });
              } else {
                setError(`Task '${propTaskId}' not found in workflow.`);
              }
            } else {
              setError('No pending tasks found for this workflow instance.');
            }
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

  const handleSubmit = async (submittedData = null) => {
    console.log('🚀 handleSubmit called!');
    console.log('📦 submittedData:', submittedData);
    console.log('📝 formData:', formData);
    console.log('🔧 taskData:', taskData);
    
    try {
      setSubmitting(true);
      setError('');

      // Use submitted data from dynamic component if provided, otherwise use formData
      const dataToSubmit = submittedData !== null ? submittedData : formData;
      
      console.log('✅ Data to submit:', dataToSubmit);
      console.log('🎯 Task spec:', taskData.taskSpec);
      console.log('🌐 Workflow ID:', workflowId);
      console.log('🔑 Instance ID:', instanceId);

      const submissionData = {
        data: dataToSubmit,
        task_id: taskData.taskSpec
      };

      console.log('📨 Submission payload:', JSON.stringify(submissionData, null, 2));
      console.log('🔗 API URL:', `/api/workflow/workflows/${workflowId}/instances/${instanceId}/submit-task`);
      console.log('🔐 Headers:', headers);

      console.log('⏳ Making API request...');
      const result = await sharedApiService.makeRequest(
        `/api/workflow/workflows/${workflowId}/instances/${instanceId}/submit-task`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(submissionData),
        },
        { workflowId, instanceId, action: 'submit_task' }
      );

      console.log('📬 API Response:', result);

      if (result.success) {
        console.log('✨ Task submitted successfully!');
        setSuccess(true);
        // Call onSuccess callback if provided (dialog mode)
        if (onSuccess) {
          setTimeout(() => {
            onSuccess();
          }, 1500); // Show success message briefly before closing
        }
      } else {
        console.error('❌ API returned success=false:', result);
        setError('Failed to submit task.');
      }
    } catch (err) {
      console.error('💥 Exception in handleSubmit:', err);
      console.error('💥 Error stack:', err.stack);
      setError('Failed to submit task.');
    } finally {
      console.log('🏁 Setting submitting to false');
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

              {/* Render dynamic component if script is available */}
              {taskData.scriptCode && !taskData.isCompleted ? (
                <DynamicComponent 
                  componentCode={taskData.scriptCode}
                />
              ) : taskData.formFields.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {taskData.isCompleted ? (
                    // Show completed task data in read-only mode
                    taskData.formFields.map((field) => (
                      <TextField
                        key={field.id}
                        fullWidth
                        label={field.label || field.id}
                        value={field.value || 'Not provided'}
                        InputProps={{ readOnly: true }}
                        variant="outlined"
                      />
                    ))
                  ) : (
                    // Show editable form fields for pending tasks
                    taskData.formFields.map((field) => (
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
                    ))
                  )}

                  {!taskData.isCompleted && (
                    <Button
                      variant="contained"
                      size="large"
                      onClick={() => handleSubmit()}
                      disabled={submitting}
                      startIcon={submitting ? <CircularProgress size={16} /> : null}
                      sx={{ mt: 2, alignSelf: 'flex-end' }}
                    >
                      {submitting ? 'Submitting...' : 'Submit Task'}
                    </Button>
                  )}
                </Box>
              ) : (
                <Box>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    This task requires confirmation to proceed.
                  </Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      variant="contained"
                      size="large"
                      onClick={() => handleSubmit()}
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