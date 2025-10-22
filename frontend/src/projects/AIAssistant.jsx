import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Paper,
  Avatar,
  Divider,
  alpha,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  Bot,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw
} from 'lucide-react';
import sharedApiService from '../utils/apiService';
import TaskCompletion from '../workflows/TaskCompletion';

const POLL_INTERVAL = 1000;

const AIAssistant = ({ user }) => {
  const theme = useTheme();
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [workflowsLoading, setWorkflowsLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Workflow execution state
  const [state, setState] = useState('idle'); // idle, running, task_ready, completed, failed
  const [workflowId, setWorkflowId] = useState(null);
  const [instanceId, setInstanceId] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const [readyTaskData, setReadyTaskData] = useState(null);
  const [messages, setMessages] = useState([]);
  
  const pollInterval = useRef(null);
  const messagesEndRef = useRef(null);
  const token = user?.token || localStorage.getItem('token');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, state, readyTaskData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  // Load workflows on mount
  useEffect(() => {
    loadAssistantWorkflows();
  }, []);

  const loadAssistantWorkflows = async () => {
    try {
      setWorkflowsLoading(true);
      setError('');
      
      console.log('[AIAssistant] 📥 Loading workflows with category "_assistants"');
      
      const result = await sharedApiService.makeRequest(
        '/api/workflows/configs/all',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
        { action: 'get_assistant_workflows', bypassCache: true }
      );

      console.log('[AIAssistant] 📦 Workflows result:', result);

      if (result.success) {
        const allWorkflows = result.data.configurations || [];
        
        // Filter workflows by category "_assistants"
        const assistantWorkflows = allWorkflows.filter(w => 
          w.category === '_assistants' || w.category === '_assistant'
        );
        
        console.log('[AIAssistant] ✅ Filtered workflows:', {
          total: allWorkflows.length,
          assistants: assistantWorkflows.length,
          workflows: assistantWorkflows
        });
        
        setWorkflows(assistantWorkflows);
        
        if (assistantWorkflows.length === 0) {
          setError('No AI Assistant workflows found. Please create workflows with category "_assistants"');
        }
      } else {
        const errMsg = result?.error || result?.data?.detail || result?.message || 'Failed to load workflows';
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error('[AIAssistant] ❌ Error loading workflows:', err);
      setError(`Failed to load assistant workflows: ${err.message}`);
    } finally {
      setWorkflowsLoading(false);
    }
  };

  const startWorkflow = async (keepMessages = false) => {
    if (!selectedWorkflow) return;
    
    try {
      setLoading(true);
      setState('running');
      setError('');
      if (!keepMessages) {
        setMessages([]);
      }
      
      const wfId = selectedWorkflow.id || selectedWorkflow.workflow_id || selectedWorkflow._id;
      
      console.log('[AIAssistant] 🚀 Starting workflow', {
        name: selectedWorkflow.name,
        id: wfId,
        endpoint: `/api/workflow/workflows/${wfId}/start`
      });
      
      // Add system message
      const systemMessage = {
        id: Date.now(),
        type: 'system',
        content: `Starting ${selectedWorkflow.name}...`,
        timestamp: new Date(),
        status: 'processing'
      };
      setMessages(prev => [...prev, systemMessage]);
      
      // Start workflow
      const result = await sharedApiService.makeRequest(
        `/api/workflow/workflows/${wfId}/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            initial_data: { 
              workflow_name: selectedWorkflow.name
            }
          }),
        },
        { workflowId: wfId, action: 'start_assistant_workflow', bypassCache: true }
      );

      console.log('[AIAssistant] ✅ Workflow start result:', result);

      if (result.success) {
        setWorkflowId(result.data.workflow_id);
        setInstanceId(result.data.instance_id);
        
        console.log('[AIAssistant] 📝 Workflow started successfully', {
          workflow_id: result.data.workflow_id,
          instance_id: result.data.instance_id
        });
        
        // Start polling for results
        startPolling(result.data.workflow_id, result.data.instance_id);
      } else {
        const errMsg = result?.error || result?.data?.detail || result?.message || 'Failed to start workflow';
        throw new Error(errMsg);
      }
    } catch (err) {
      console.error('[AIAssistant] ❌ Error starting workflow:', err);
      
      let errorMsg = 'Failed to start workflow';
      if (err?.response?.data?.detail) {
        errorMsg = typeof err.response.data.detail === 'string' 
          ? err.response.data.detail 
          : JSON.stringify(err.response.data.detail);
      } else if (err?.message) {
        errorMsg = err.message;
      }
      
      const errorMessage = {
        id: Date.now() + 1,
        type: 'error',
        content: `Error: ${errorMsg}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
      setState('failed');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (wfId, instId) => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    setIsPolling(true);
    
    const checkStatus = async () => {
      try {
        console.log('[AIAssistant] 🔄 Polling workflow instance', { 
          workflow_id: wfId, 
          instance_id: instId,
          timestamp: new Date().toISOString()
        });
        
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

        console.log('[AIAssistant] 📦 Poll result received:', {
          success: result.success,
          hasData: !!result.data,
          dataKeys: result.data ? Object.keys(result.data) : [],
        });

        if (result.success) {
          const instance = result.data.data;
          const tasks = instance.serialized_data?.tasks || {};
          const workflowData = instance.serialized_data?.data || {};
          const taskSpecs = instance.serialized_data?.spec?.task_specs || {};
          
          console.log('[AIAssistant] 📊 Workflow instance data:', {
            hasSerializedData: !!instance.serialized_data,
            taskCount: Object.keys(tasks).length,
            workflowDataKeys: Object.keys(workflowData),
            completed: instance.serialized_data?.completed,
            workflowStatus: workflowData.workflow_status,
          });
          
          // CHECK 1: Is workflow complete?
          const isCompleted = instance.serialized_data?.completed === true || 
                             workflowData.workflow_status?.completed === true;
          
          if (isCompleted) {
            console.log('[AIAssistant] ✅ Workflow completed!', {
              final_answer: workflowData.final_answer,
              answer: workflowData.answer,
              result: workflowData.result,
              project_documents: workflowData.project_documents,
              project_activities: workflowData.project_activities,
              allWorkflowDataKeys: Object.keys(workflowData)
            });
            
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('completed');
            
            // Add final response
            const response = workflowData.final_answer || 
                           workflowData.answer || 
                           workflowData.result ||
                           'Workflow completed successfully.';
            
            console.log('[AIAssistant] 📊 Creating response message with documents:', {
              hasProjectDocuments: !!workflowData.project_documents,
              projectDocumentsType: typeof workflowData.project_documents,
              projectDocumentsIsArray: Array.isArray(workflowData.project_documents),
              projectDocumentsLength: workflowData.project_documents?.length,
              projectDocumentsContent: workflowData.project_documents
            });
            
            const responseMessage = {
              id: Date.now() + 2,
              type: 'bot',
              content: response,
              timestamp: new Date(),
              status: 'completed',
              projectDocuments: workflowData.project_documents, // Store documents separately
              projectActivities: workflowData.project_activities // Also store activities if available
            };
            
            console.log('[AIAssistant] 📤 Response message created:', responseMessage);
            
            setMessages(prev => {
              const filtered = prev.filter(msg => msg.status !== 'processing');
              const newMessages = [...filtered, responseMessage];
              console.log('[AIAssistant] 📝 Updated messages array:', newMessages);
              return newMessages;
            });
            return;
          }
          
          // CHECK 2: Any failed task (state 128)?
          const failedTask = Object.entries(tasks).find(([taskId, task]) => task.state === 128);
          if (failedTask) {
            console.error('[AIAssistant] ❌ Failed task found:', {
              taskId: failedTask[0],
              task: failedTask[1]
            });
            
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('failed');
            
            const errorMessage = {
              id: Date.now() + 3,
              type: 'error',
              content: 'An error occurred while executing the workflow.',
              timestamp: new Date(),
              status: 'failed'
            };
            
            setMessages(prev => {
              const filtered = prev.filter(msg => msg.status !== 'processing');
              return [...filtered, errorMessage];
            });
            return;
          }
          
          // CHECK 3: Check for ready tasks (UserTask or ManualTask)
          const readyTask = Object.entries(tasks).find(([taskId, task]) => {
            if (task.state === 16) { // READY state
              const taskSpecName = task.task_spec;
              const taskSpec = taskSpecs[taskSpecName];
              const typename = taskSpec?.typename;
              return typename === 'UserTask' || typename === 'ManualTask';
            }
            return false;
          });
          
          if (readyTask) {
            const [taskId, task] = readyTask;
            const taskSpecName = task.task_spec;
            console.log('[AIAssistant] 🔔 READY TASK FOUND!', { taskId, taskSpecName });
            
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('task_ready');
            setReadyTaskData({ taskSpec: taskSpecName });
            return;
          }
          
          // Show intermediate task results
          const completedTasks = Object.entries(tasks).filter(([taskId, task]) => task.state === 64);
          
          completedTasks.forEach(([taskId, task]) => {
            const taskData = task.data || {};
            
            // Check if we already have a message for this task
            const existingMessage = messages.find(msg => msg.taskId === taskId);
            if (!existingMessage && taskData.result) {
              console.log('[AIAssistant] 💬 Adding task result message:', {
                taskId,
                taskName: task.task_spec,
                result: taskData.result
              });
              
              const taskMessage = {
                id: Date.now() + Math.random(),
                type: 'bot',
                content: taskData.result || taskData.output || 'Task completed',
                timestamp: new Date(),
                taskId: taskId,
                taskName: task.task_spec,
                status: 'completed'
              };
              
              setMessages(prev => [...prev, taskMessage]);
            }
          });
        } else {
          console.warn('[AIAssistant] ⚠️ Poll result not successful:', result);
        }
      } catch (error) {
        console.error('[AIAssistant] ❌ Polling error:', error);
      }
    };

    checkStatus();
    pollInterval.current = setInterval(checkStatus, POLL_INTERVAL);
  };

  const handleTaskSuccess = () => {
    setReadyTaskData(null);
    setState('running');
    setIsPolling(true);
    startPolling(workflowId, instanceId);
  };

  const handleReset = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    setState('idle');
    setWorkflowId(null);
    setInstanceId(null);
    setIsPolling(false);
    setReadyTaskData(null);
    setMessages([]);
    setError('');
    setSelectedWorkflow(null);
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMessageIcon = (type, status) => {
    if (type === 'error') return <XCircle size={16} />;
    if (status === 'processing') return <Clock size={16} />;
    if (status === 'completed') return <CheckCircle size={16} />;
    return <Bot size={16} />;
  };

  const getMessageColor = (type, status) => {
    if (type === 'error') return theme.palette.error.main;
    if (status === 'processing') return theme.palette.warning.main;
    return theme.palette.secondary.main;
  };



  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ 
        pb: 2,
        mb: 2,
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Bot size={28} />
          <Typography variant="h5" fontWeight="bold">
            AI Assistant
          </Typography>
          {isPolling && (
            <Chip
              icon={<CircularProgress size={12} />}
              label="Processing..."
              size="small"
              color="warning"
            />
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          Select an AI assistant workflow to execute automated tasks and get intelligent responses
        </Typography>
      </Box>

      {/* Main Content */}
      <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 200px)', overflow: 'hidden', width: '100%' }}>
        {/* Left Panel - Workflow Selection */}
        <Box sx={{ 
          width: 320,
          minWidth: 320,
          maxWidth: 320,
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          borderRadius: 1,
          height: '100%',
          overflow: 'hidden'
        }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" fontWeight="bold">
              Available Assistants
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {workflows.length} workflow{workflows.length !== 1 ? 's' : ''} available
            </Typography>
          </Box>

          {/* Workflow List */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {workflowsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : error && workflows.length === 0 ? (
              <Alert severity="warning" sx={{ m: 2 }}>
                {error}
              </Alert>
            ) : (
              <List sx={{ p: 1 }}>
                {workflows.map((workflow) => (
                  <ListItemButton
                    key={workflow.id || workflow.workflow_id || workflow._id}
                    selected={selectedWorkflow?.name === workflow.name}
                    onClick={() => setSelectedWorkflow(workflow)}
                    disabled={state === 'running' || isPolling}
                    sx={{ 
                      borderRadius: 1,
                      mb: 0.5,
                      '&.Mui-selected': {
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        borderLeft: `4px solid ${theme.palette.primary.main}`
                      }
                    }}
                  >
                    <ListItemText 
                      primary={workflow.name}
                      secondary={workflow.description || 'No description'}
                      primaryTypographyProps={{ fontWeight: 500 }}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>

          {/* Action Buttons */}
          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            {state === 'idle' ? (
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={loading ? <CircularProgress size={20} /> : <Play size={20} />}
                onClick={startWorkflow}
                disabled={!selectedWorkflow || loading}
              >
                Start Assistant
              </Button>
            ) : (
              <Button
                variant="outlined"
                size="large"
                fullWidth
                startIcon={<RefreshCw size={20} />}
                onClick={handleReset}
                disabled={isPolling}
              >
                Reset
              </Button>
            )}
          </Box>
        </Box>

        {/* Right Panel - Results/Messages */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden', minWidth: 0 }}>
          {state === 'idle' && !selectedWorkflow && (
            <Box sx={{ 
              flex: 1,
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 2,
              color: 'text.secondary',
              p: 3
            }}>
              <Bot size={48} />
              <Typography variant="h6">Select an AI Assistant to Get Started</Typography>
              <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 400 }}>
                Choose from the available assistant workflows on the left panel
              </Typography>
            </Box>
          )}

          {state === 'idle' && selectedWorkflow && (
            <Box sx={{ 
              flex: 1,
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 2,
              p: 3
            }}>
              <Avatar sx={{ 
                bgcolor: theme.palette.primary.main,
                width: 64,
                height: 64
              }}>
                <Bot size={32} />
              </Avatar>
              <Typography variant="h6" fontWeight="bold">
                {selectedWorkflow.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 500 }}>
                {selectedWorkflow.description || 'Click "Start Assistant" to begin the workflow'}
              </Typography>
            </Box>
          )}

          {(state === 'running' || state === 'completed' || state === 'failed' || state === 'task_ready') && (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Messages Area */}
              <Box sx={{ flex: 1, overflowY: 'auto', p: state === 'task_ready' ? 0 : 2 }}>
                <List sx={{ p: 0 }}>
                  {messages.map((msg, index) => (
                    <React.Fragment key={msg.id}>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'flex-start',
                        gap: 2,
                        mb: 2
                      }}>
                        <Avatar sx={{ 
                          bgcolor: getMessageColor(msg.type, msg.status),
                          width: 32,
                          height: 32
                        }}>
                          {getMessageIcon(msg.type, msg.status)}
                        </Avatar>
                        
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1, 
                            mb: 0.5 
                          }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {msg.type === 'error' ? 'Error' : 'Assistant'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatTimestamp(msg.timestamp)}
                            </Typography>
                            {msg.taskName && (
                              <Chip 
                                label={msg.taskName} 
                                size="small" 
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                          
                          <Paper sx={{ 
                            p: 2, 
                            bgcolor: msg.type === 'error' ? 
                              alpha(theme.palette.error.main, 0.1) : 
                              alpha(theme.palette.grey[500], 0.1),
                            border: msg.type === 'error' ? 
                              `1px solid ${theme.palette.error.main}` : 'none'
                          }}>
                            {msg.status === 'processing' ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CircularProgress size={16} />
                                <Typography variant="body2">{msg.content}</Typography>
                              </Box>
                            ) : (
                              <>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                  }}
                                >
                                  {msg.content}
                                </Typography>
                                
                                {/* Display project documents as a table if available */}
                                {(() => {
                                  console.log('[AIAssistant] 🖼️ Rendering message:', {
                                    msgId: msg.id,
                                    hasProjectDocuments: !!msg.projectDocuments,
                                    projectDocumentsType: typeof msg.projectDocuments,
                                    projectDocumentsIsArray: Array.isArray(msg.projectDocuments),
                                    projectDocumentsLength: msg.projectDocuments?.length,
                                    projectDocuments: msg.projectDocuments
                                  });
                                  
                                  if (msg.projectDocuments && Array.isArray(msg.projectDocuments) && msg.projectDocuments.length > 0) {
                                    console.log('[AIAssistant] ✅ Rendering table for documents:', msg.projectDocuments);
                                    return (
                                      <Box sx={{ mt: 2 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                                          📄 Project Documents ({msg.projectDocuments.length})
                                        </Typography>
                                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                                          <Table size="small" stickyHeader>
                                            <TableHead>
                                              <TableRow>
                                                {Object.keys(msg.projectDocuments[0] || {})
                                                  .filter(key => !key.toLowerCase().includes('id') && key !== '_id')
                                                  .map((key) => (
                                                  <TableCell key={key} sx={{ fontWeight: 'bold', bgcolor: 'background.default' }}>
                                                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                  </TableCell>
                                                ))}
                                              </TableRow>
                                            </TableHead>
                                            <TableBody>
                                              {msg.projectDocuments.map((doc, idx) => (
                                                <TableRow key={idx} hover>
                                                  {Object.entries(doc)
                                                    .filter(([key]) => !key.toLowerCase().includes('id') && key !== '_id')
                                                    .map(([key, value]) => (
                                                    <TableCell key={key}>
                                                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                    </TableCell>
                                                  ))}
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </TableContainer>
                                      </Box>
                                    );
                                  } else if (msg.status === 'completed' && msg.type === 'bot') {
                                    // Show friendly message when no data found
                                    console.log('[AIAssistant] ℹ️ No documents found, showing user message');
                                    return (
                                      <Box sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.info.main, 0.1), borderRadius: 1, border: `1px solid ${alpha(theme.palette.info.main, 0.3)}` }}>
                                        <Typography variant="body2" color="text.secondary">
                                          💡 No project data was found for your query. Try rephrasing your question or ask about specific project details like:
                                        </Typography>
                                        <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                                          <Typography component="li" variant="body2" color="text.secondary">
                                            "Show me all projects"
                                          </Typography>
                                          <Typography component="li" variant="body2" color="text.secondary">
                                            "What are the active projects?"
                                          </Typography>
                                          <Typography component="li" variant="body2" color="text.secondary">
                                            "List project activities"
                                          </Typography>
                                        </Box>
                                      </Box>
                                    );
                                  } else {
                                    console.log('[AIAssistant] ❌ No documents to render');
                                    return null;
                                  }
                                })()}
                              </>
                            )}
                          </Paper>
                        </Box>
                      </Box>
                      {index < messages.length - 1 && <Divider sx={{ my: 2 }} />}
                    </React.Fragment>
                  ))}
                  
                  {/* Show TaskCompletion if ready */}
                  {state === 'task_ready' && readyTaskData && workflowId && instanceId && (
                    <Box sx={{ width: '100%' }}>
                      <TaskCompletion
                        key={readyTaskData.taskSpec}
                        user={user}
                        workflowId={workflowId}
                        instanceId={instanceId}
                        taskId={readyTaskData.taskSpec}
                        isDialog={true}
                        onSuccess={handleTaskSuccess}
                      />
                    </Box>
                  )}
                  
                  {/* Start Over Button - Shows inline when workflow is completed or failed */}
                  {(state === 'completed' || state === 'failed') && (
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'center',
                      my: 3,
                      px: 2
                    }}>
                      <Button
                        variant="contained"
                        size="large"
                        startIcon={<RefreshCw size={20} />}
                        onClick={() => {
                          // Keep existing messages and restart the workflow
                          setState('running');
                          setError('');
                          setReadyTaskData(null);
                          startWorkflow(true); // Pass true to keep messages
                        }}
                        sx={{
                          minWidth: 200,
                          bgcolor: theme.palette.primary.main,
                          '&:hover': {
                            bgcolor: theme.palette.primary.dark,
                          }
                        }}
                      >
                        Start Over
                      </Button>
                    </Box>
                  )}
                  
                  <div ref={messagesEndRef} />
                </List>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default AIAssistant;
