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
      console.log('📨 Received FormSubmit event from dynamic component:', event.detail);
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

      // propTaskId MUST be provided
      if (!propTaskId) {
        setError('No task ID provided');
        setLoading(false);
        return;
      }

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
        const taskSpecs = instanceData.serialized_data?.spec?.task_specs || {};
        const allTasks = instanceData.serialized_data?.tasks || {};
        
        // Get the task spec for the provided taskId
        const specificTaskSpec = taskSpecs[propTaskId];
        if (!specificTaskSpec) {
          console.error('❌ Task spec not found:', propTaskId);
          setError(`Task spec '${propTaskId}' not found in workflow.`);
          setLoading(false);
          return;
        }

        // Find the actual task instance by matching task_spec property
        let taskInstance = null;
        for (const [taskInstanceId, task] of Object.entries(allTasks)) {
          if (task.task_spec === propTaskId) {
            taskInstance = task;
            console.log('✅ Found task instance:', taskInstanceId, 'State:', task.state, '(16=READY, 64=COMPLETED)');
            break;
          }
        }

        if (!taskInstance) {
          console.error('❌ Task instance not found for:', propTaskId);
          setError(`Task instance for '${propTaskId}' not found.`);
          setLoading(false);
          return;
        }

        const taskState = taskInstance.state;
        const taskInstanceData = taskInstance.data || {};
        
        console.log('=== TASK STATE HANDLING ===');
        console.log('Task ID:', propTaskId);
        console.log('Task name:', specificTaskSpec.bpmn_name || specificTaskSpec.name);
        console.log('Task state:', taskState, '(16=READY, 64=COMPLETED, 128=ERROR/FAILED)');

        // State 16 = READY - Show form for user input
        if (taskState === 16) {
          console.log('=== TASK IS READY (16) - SHOWING FORM ===');
          
          // Extract script data if available
          let scriptCode = null;
          if (specificTaskSpec?.extensions?.extensionElements?.formData?.scriptData?.script) {
            const rawScript = specificTaskSpec.extensions.extensionElements.formData.scriptData.script;
            scriptCode = extractJSXFromMarkdown(rawScript);
            console.log('Extracted JSX script:', scriptCode ? 'Found' : 'Not found');
          }
          
          // Extract form fields from the correct structure
          let formFields = [];
          if (specificTaskSpec?.extensions?.extensionElements?.formData?.formField) {
            const formField = specificTaskSpec.extensions.extensionElements.formData.formField;
            formFields = Array.isArray(formField) ? formField : [formField];
            console.log('Found form fields:', formFields);
          } else if (specificTaskSpec?.extensions?.formData?.formFields) {
            formFields = specificTaskSpec.extensions.formData.formFields;
            console.log('Found form fields (legacy):', formFields);
          }

          setTaskData({
            taskId: propTaskId,
            taskSpec: propTaskId,
            taskName: specificTaskSpec.bpmn_name || specificTaskSpec.name || propTaskId,
            formFields: formFields,
            scriptCode: scriptCode,
            instanceData,
            isCompleted: false
          });
        } 
        // Any other state (64=COMPLETED, 128=ERROR, etc.) - Show task data
        else {
          console.log('=== TASK IS NOT READY - SHOWING DATA ===');
          console.log('Task data:', taskInstanceData);
          
          setTaskData({
            taskId: propTaskId,
            taskSpec: propTaskId,
            taskName: specificTaskSpec.bpmn_name || specificTaskSpec.name || propTaskId,
            completedTaskData: taskInstanceData,
            instanceData,
            isCompleted: true,
            taskState: taskState
          });
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
        
        // ALWAYS call onSuccess to notify parent (WorkflowUI) to hide TaskCompletion and poll
        if (onSuccess) {
          console.log('📢 Calling onSuccess callback to notify WorkflowUI');
          onSuccess();
        } else if (!isDialog) {
          // If not in dialog mode and no callback, navigate back
          navigate(-1);
        }
      } else {
        console.error('❌ API returned success=false:', result);
        const errorMessage = result.error || result.message || 'Failed to submit task.';
        setError(errorMessage);
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

  return (
    <Box sx={{ 
      minHeight: isDialog ? 'auto' : '100vh',
      background: isDialog ? 'transparent' : (theme.custom?.backgroundGradient || theme.palette.background.default),
      p: 2,
      overflow: 'auto',
      maxHeight: isDialog ? '80vh' : 'none',
      width: '100%'
    }}>
      <Box sx={{ maxWidth: isDialog ? 600 : '100%', mx: isDialog ? 'auto' : 0, pt: isDialog ? 1 : 0, width: '100%' }}>
        {/* Header */}
        {isDialog && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 2 }}>
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
              {/* Render dynamic component if script is available AND task is not completed */}
              {taskData.scriptCode && !taskData.isCompleted ? (
                <DynamicComponent 
                  componentCode={taskData.scriptCode}
                />
              ) : taskData.formFields && taskData.formFields.length > 0 && !taskData.isCompleted ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Show editable form fields for READY/PENDING tasks only */}
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
                    onClick={() => handleSubmit()}
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={16} /> : null}
                    sx={{ mt: 2, alignSelf: 'flex-end' }}
                  >
                    {submitting ? 'Submitting...' : 'Submit Task'}
                  </Button>
                </Box>
              ) : !taskData.isCompleted ? (
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
              ) : taskData.isCompleted && taskData.completedTaskData ? (
                // Show completed task data
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>
                    Task Data:
                  </Typography>
                  {Object.entries(taskData.completedTaskData).map(([key, value]) => (
                    <Box key={key} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                        {key}
                      </Typography>
                      <Typography variant="body1" sx={{ mt: 0.5 }}>
                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : null}
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}

export default TaskCompletion;