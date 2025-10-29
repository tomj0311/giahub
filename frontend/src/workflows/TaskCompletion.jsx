import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  const [fieldErrors, setFieldErrors] = useState({});
  
  // Store the latest handleSubmit in a ref
  const handleSubmitRef = useRef(null);

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
      // Retrieve the actual data from the temporary storage
      const submittedData = window.__workflowFormData;
      // Clean up
      delete window.__workflowFormData;
      
      console.log('📦 Retrieved form data:', submittedData);
      console.log('📦 Data type:', submittedData?.constructor?.name);
      console.log('📦 Is FormData?', submittedData instanceof FormData);
      
      // If data is a plain object, check for File objects
      if (submittedData && typeof submittedData === 'object' && !(submittedData instanceof FormData)) {
        console.log('📦 Plain object keys:', Object.keys(submittedData));
        Object.entries(submittedData).forEach(([key, value]) => {
          console.log(`📦 ${key}:`, value?.constructor?.name, value instanceof File ? `File: ${value.name}` : value);
        });
      }
      
      // Use ref to get latest handleSubmit function
      if (submittedData && handleSubmitRef.current) {
        handleSubmitRef.current(submittedData);
      }
    };

    window.addEventListener('workflowFormSubmit', handleDynamicFormSubmit);
    
    return () => {
      window.removeEventListener('workflowFormSubmit', handleDynamicFormSubmit);
    };
  }, []); // No dependencies - event listener stays stable

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
        { workflowId, instanceId, action: 'get_instance_for_task', bypassCache: true }
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

        // Find all task instances matching this task_spec and prefer any READY (16) state
        const sameSpecTasks = Object.entries(allTasks).filter(([taskInstanceId, task]) => task.task_spec === propTaskId);

        if (sameSpecTasks.length === 0) {
          console.error('❌ No task instances found for task_spec:', propTaskId);
          setError(`Task instance for '${propTaskId}' not found.`);
          setLoading(false);
          return;
        }

        // Prefer a READY task if any exists; otherwise pick the first match
        const readyTaskEntry = sameSpecTasks.find(([id, task]) => task.state === 16);
        const [selectedTaskInstanceId, selectedTaskInstance] = readyTaskEntry || sameSpecTasks[0];

        console.log(
          readyTaskEntry
            ? `✅ Selected READY task instance: ${selectedTaskInstanceId} State: ${selectedTaskInstance.state} (16=READY, 64=COMPLETED)`
            : `ℹ️ No READY instance found. Selected task instance: ${selectedTaskInstanceId} State: ${selectedTaskInstance.state}`
        );

        const taskState = selectedTaskInstance.state;
        const taskInstanceData = selectedTaskInstance.data || {};
        
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
    
    // Clear error for this field when user starts typing
    if (fieldErrors[fieldId]) {
      setFieldErrors(prev => ({
        ...prev,
        [fieldId]: null
      }));
    }
  };

  // Simple validation function
  const validateRequired = () => {
    const errors = {};
    if (taskData?.formFields) {
      taskData.formFields.forEach(field => {
        const isRequired = field.required === 'true' || field.required === true;
        if (isRequired) {
          const value = formData[field.id];
          // Handle file type validation
          if (field.type === 'files') {
            if (!value || !(value instanceof File)) {
              errors[field.id] = `${field.label || field.id} is required`;
            }
          } else if (!value || (typeof value === 'string' && value.trim() === '')) {
            errors[field.id] = `${field.label || field.id} is required`;
          }
        }
      });
    }
    return errors;
  };

  const handleSubmit = async (submittedData = null) => {
    console.log('🚀 handleSubmit called!');
    console.log('📦 submittedData:', submittedData);
    console.log('📝 formData:', formData);
    console.log('🔧 taskData:', taskData);
    
    // Prevent double submission
    if (submitting) {
      console.log('⚠️ Already submitting, ignoring...');
      return;
    }
    
    // Validate required fields if using form fields (not dynamic component)
    if (submittedData === null && taskData?.formFields?.length > 0) {
      const errors = validateRequired();
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setError('Please fill in all required fields.');
        return;
      }
    }
    
    try {
      setSubmitting(true);
      setError('');

      // Use submitted data from dynamic component if provided, otherwise use formData
      const dataToSubmit = submittedData !== null ? submittedData : formData;
      
      console.log('✅ Data to submit:', dataToSubmit);
      console.log('🎯 Task spec:', taskData.taskSpec);
      console.log('🌐 Workflow ID:', workflowId);
      console.log('🔑 Instance ID:', instanceId);

      // Check if dataToSubmit is a FormData object (for file uploads)
      let isFormDataSubmission = dataToSubmit instanceof FormData;
      
      // Also check if it's a plain object containing File objects
      let hasFiles = false;
      if (!isFormDataSubmission && dataToSubmit && typeof dataToSubmit === 'object') {
        hasFiles = Object.values(dataToSubmit).some(value => value instanceof File);
        console.log('🔍 Checking plain object for files, found:', hasFiles);
      }
      
      console.log('📎 Is FormData submission:', isFormDataSubmission);
      console.log('📎 Has File objects:', hasFiles);

      let requestOptions;
      
      if (isFormDataSubmission || hasFiles) {
        // Handle multipart/form-data submission (with files)
        const formDataToSend = new FormData();
        
        // Add task_id as form field
        formDataToSend.append('task_id', taskData.taskSpec);
        
        // Extract files and regular data
        const regularData = {};
        const filesToUpload = [];
        
        if (isFormDataSubmission) {
          // Extract from FormData
          for (const [key, value] of dataToSubmit.entries()) {
            if (value instanceof File) {
              filesToUpload.push({ key, file: value });
              console.log(`📎 Found file in FormData: ${key} = ${value.name}`);
            } else {
              regularData[key] = value;
              console.log(`📝 Found data in FormData: ${key} = ${value}`);
            }
          }
        } else {
          // Extract from plain object
          Object.entries(dataToSubmit).forEach(([key, value]) => {
            if (value instanceof File) {
              filesToUpload.push({ key, file: value });
              console.log(`📎 Found file in object: ${key} = ${value.name}`);
            } else {
              regularData[key] = value;
              console.log(`📝 Found data in object: ${key} = ${value}`);
            }
          });
        }
        
        // Add regular data as JSON string
        formDataToSend.append('data', JSON.stringify(regularData));
        
        // Add files with sequential naming expected by backend
        filesToUpload.forEach((item, index) => {
          formDataToSend.append('files', item.file);
          console.log(`📎 Appending file ${index}: ${item.file.name}`);
        });
        
        console.log('📨 Sending multipart form data with', filesToUpload.length, 'files');
        
        // For multipart/form-data, don't set Content-Type header (browser will set it with boundary)
        const multipartHeaders = { ...headers };
        delete multipartHeaders['Content-Type'];
        
        requestOptions = {
          method: 'POST',
          headers: multipartHeaders,
          body: formDataToSend,
        };
      } else {
        // Handle regular form submission (no files)
        const formDataToSend = new FormData();
        
        // Add task_id as form field
        formDataToSend.append('task_id', taskData.taskSpec);
        
        // Add data as JSON string
        formDataToSend.append('data', JSON.stringify(dataToSubmit));
        
        console.log('📨 Sending form data without files');
        console.log('📝 Data:', JSON.stringify(dataToSubmit, null, 2));
        
        // For form-data, don't set Content-Type header (browser will set it)
        const formHeaders = { ...headers };
        delete formHeaders['Content-Type'];
        
        requestOptions = {
          method: 'POST',
          headers: formHeaders,
          body: formDataToSend,
        };
      }

      console.log('🔗 API URL:', `/api/workflow/workflows/${workflowId}/instances/${instanceId}/submit-task`);
      console.log('⏳ Making API request...');
      
      const result = await sharedApiService.makeRequest(
        `/api/workflow/workflows/${workflowId}/instances/${instanceId}/submit-task`,
        requestOptions,
        // Always bypass cache/deduplication for submissions so a fresh POST is sent every time
        { workflowId, instanceId, action: 'submit_task', bypassCache: true, nonce: Date.now() }
      );

      console.log('📬 API Response:', result);

      if (result.success) {
        console.log('✨ Task submitted successfully!');
        
        // ALWAYS call onSuccess to notify parent (WorkflowUI) to hide TaskCompletion and poll
        // Pass the submitted data back to the parent so it can be displayed in the chat
        if (onSuccess) {
          console.log('📢 Calling onSuccess callback to notify WorkflowUI');
          onSuccess(dataToSubmit);
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
  
  // Update ref whenever handleSubmit changes
  handleSubmitRef.current = handleSubmit;

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
                  {/* Task heading */}
                  <Typography variant="h5" component="h2" sx={{ mb: 2, fontWeight: 'bold' }}>
                    {taskData.taskName}
                  </Typography>
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
                      ) : field.type === 'datetime' || field.type === 'DateTime' ? (
                        <TextField
                          fullWidth
                          label={field.label || field.id}
                          value={formData[field.id] || ''}
                          onChange={(e) => handleFormChange(field.id, e.target.value)}
                          required={field.required === 'true' || field.required === true}
                          type="datetime-local"
                          variant="outlined"
                          InputLabelProps={{ shrink: true }}
                          error={!!fieldErrors[field.id]}
                          helperText={fieldErrors[field.id]}
                        />
                      ) : field.type === 'files' ? (
                        <Box>
                          <Typography variant="body2" sx={{ mb: 1, fontWeight: 'medium' }}>
                            {field.label || field.id}
                            {(field.required === 'true' || field.required === true) && (
                              <span style={{ color: 'red' }}> *</span>
                            )}
                          </Typography>
                          <Button
                            variant="outlined"
                            component="label"
                            fullWidth
                            sx={{ 
                              justifyContent: 'flex-start',
                              textTransform: 'none',
                              py: 1.5,
                              borderStyle: fieldErrors[field.id] ? 'solid' : 'dashed',
                              borderColor: fieldErrors[field.id] ? 'error.main' : 'divider',
                              '&:hover': {
                                borderStyle: 'solid'
                              }
                            }}
                          >
                            {formData[field.id] ? (
                              <span>
                                📎 {formData[field.id].name} ({(formData[field.id].size / 1024).toFixed(2)} KB)
                              </span>
                            ) : (
                              <span>Click to upload file</span>
                            )}
                            <input
                              type="file"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleFormChange(field.id, file);
                                }
                              }}
                            />
                          </Button>
                          {fieldErrors[field.id] && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                              {fieldErrors[field.id]}
                            </Typography>
                          )}
                        </Box>
                      ) : (
                        <TextField
                          fullWidth
                          label={field.label || field.id}
                          value={formData[field.id] || ''}
                          onChange={(e) => handleFormChange(field.id, e.target.value)}
                          required={field.required === 'true' || field.required === true}
                          type={field.type === 'number' ? 'number' : 'text'}
                          variant="outlined"
                          error={!!fieldErrors[field.id]}
                          helperText={fieldErrors[field.id]}
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
                  {/* Task heading */}
                  <Typography variant="h5" component="h2" sx={{ mb: 2, fontWeight: 'bold' }}>
                    {taskData.taskName}
                  </Typography>
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