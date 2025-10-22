import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Typography,
  IconButton,
  Paper,
  CircularProgress,
  Chip,
  Avatar,
  List,
  ListItem,
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
  MessageCircle,
  Send,
  Bot,
  User,
  Clock,
  XCircle,
  CheckCircle,
  X
} from 'lucide-react';
import sharedApiService from '../utils/apiService';
import TaskCompletion from '../workflows/TaskCompletion';

const POLL_INTERVAL = 1000;

const ProjectChat = ({ user }) => {
  const theme = useTheme();
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [workflowId, setWorkflowId] = useState(null);
  const [instanceId, setInstanceId] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  
  // Add task ready state - like WorkflowUI
  const [state, setState] = useState('idle'); // idle, running, task_ready, completed, failed
  const [readyTaskData, setReadyTaskData] = useState(null);
  
  const pollInterval = useRef(null);
  const messagesEndRef = useRef(null);
  const processedTasksRef = useRef(new Set()); // Track processed tasks
  const hasCompletedRef = useRef(false); // Track if completion message was added
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

  const startChat = async (question) => {
    try {
      setLoading(true);
      setState('running');
      
      // Reset refs for new chat
      processedTasksRef.current.clear();
      hasCompletedRef.current = false;
      
      // Add user message to chat
      const userMessage = {
        id: Date.now(),
        type: 'user',
        content: question,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      // Call workflow by name "_project_chat"
      console.log('[ProjectChat] 🚀 Starting workflow by name "_project_chat"', {
        endpoint: '/api/workflow/workflows/by-name/_project_chat/start',
        payload: { 
          initial_data: { 
            prompt: question
          }
        }
      });
      
      const result = await sharedApiService.makeRequest(
        '/api/workflow/workflows/by-name/_project_chat/start',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            initial_data: { 
              prompt: question
            }
          }),
        },
        { action: 'start_project_chat', bypassCache: true }
      );

      console.log('[ProjectChat] ✅ Workflow start result:', result);

      if (result.success) {
        setWorkflowId(result.data.workflow_id);
        setInstanceId(result.data.instance_id);
        
        console.log('[ProjectChat] 📝 Workflow started successfully', {
          workflow_id: result.data.workflow_id,
          instance_id: result.data.instance_id
        });
        
        // Add system message
        const systemMessage = {
          id: Date.now() + 1,
          type: 'system',
          content: 'Processing your question...',
          timestamp: new Date(),
          status: 'processing'
        };
        setMessages(prev => [...prev, systemMessage]);
        
        // Start polling for results
        startPolling(result.data.workflow_id, result.data.instance_id);
      } else {
        const errMsg = result?.error || result?.data?.detail || result?.message || 'Failed to start chat workflow';
        throw new Error(errMsg);
      }
    } catch (error) {
      console.error('[ProjectChat] ❌ Error starting chat:', {
        message: error?.message,
        response: error?.response,
        stack: error?.stack,
        name: error?.name,
        fullError: error
      });
      
      // Extract detailed error message
      let errorMsg = 'Failed to start chat';
      
      // Check if it's a workflow not found error
      if (error?.message?.includes('not found') || error?.response?.data?.detail?.includes('not found')) {
        errorMsg = '⚠️ Workflow "_project_chat" not found. Please create the workflow configuration first.';
        console.error('[ProjectChat] 🔍 Workflow not found error. The "_project_chat" workflow needs to be created in the workflow configurations.');
      } else if (error?.response?.data?.detail) {
        errorMsg = typeof error.response.data.detail === 'string' 
          ? error.response.data.detail 
          : JSON.stringify(error.response.data.detail);
      } else if (error?.message) {
        errorMsg = error.message;
      }
      
      const errorMessage = {
        id: Date.now() + 2,
        type: 'error',
        content: `Error: ${errorMsg}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (wfId, instId) => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    setIsPolling(true);
    
    const checkStatus = async () => {
      try {
        console.log('[ProjectChat] 🔄 Polling workflow instance', { 
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

        console.log('[ProjectChat] 📦 Poll result received:', {
          success: result.success,
          hasData: !!result.data,
          dataKeys: result.data ? Object.keys(result.data) : [],
          fullData: result.data
        });

        if (result.success) {
          const instance = result.data.data;
          const tasks = instance.serialized_data?.tasks || {};
          const workflowData = instance.serialized_data?.data || {};
          const taskSpecs = instance.serialized_data?.spec?.task_specs || {};
          
          console.log('[ProjectChat] 📊 Workflow instance data:', {
            hasSerializedData: !!instance.serialized_data,
            taskCount: Object.keys(tasks).length,
            taskStates: Object.entries(tasks).map(([id, task]) => ({
              id,
              state: task.state,
              task_spec: task.task_spec
            })),
            workflowDataKeys: Object.keys(workflowData),
            completed: instance.serialized_data?.completed,
            workflowStatus: workflowData.workflow_status,
            fullWorkflowData: workflowData
          });
          
          // CHECK 1: Is workflow complete?
          const isCompleted = instance.serialized_data?.completed === true || 
                             workflowData.workflow_status?.completed === true;
          
          if (isCompleted && !hasCompletedRef.current) {
            console.log('[ProjectChat] ✅ Workflow completed!', {
              final_answer: workflowData.final_answer,
              answer: workflowData.answer,
              _output_docs: workflowData._output_docs,
              project_activities: workflowData.project_activities,
              allWorkflowDataKeys: Object.keys(workflowData)
            });
            
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('completed');
            hasCompletedRef.current = true; // Mark as completed to prevent duplicate messages
            
            // Add final response
            const response = workflowData.final_answer || workflowData.answer || 'Analysis completed.';
            
            console.log('[ProjectChat] 📊 Creating response message with documents:', {
              hasOutputDocs: !!workflowData._output_docs,
              outputDocsType: typeof workflowData._output_docs,
              outputDocsIsArray: Array.isArray(workflowData._output_docs),
              outputDocsLength: workflowData._output_docs?.length,
              outputDocsContent: workflowData._output_docs
            });
            
            const responseMessage = {
              id: Date.now() + 3,
              type: 'bot',
              content: response,
              timestamp: new Date(),
              status: 'completed',
              outputDocs: workflowData._output_docs, // Store documents separately using _output_docs
              projectActivities: workflowData.project_activities // Also store activities if available
            };
            
            console.log('[ProjectChat] 📤 Response message created:', responseMessage);
            
            setMessages(prev => {
              const filtered = prev.filter(msg => msg.status !== 'processing');
              const newMessages = [...filtered, responseMessage];
              console.log('[ProjectChat] 📝 Updated messages array:', newMessages);
              return newMessages;
            });
            return;
          } else if (isCompleted) {
            // Already processed completion, just return
            return;
          }
          
          // CHECK 2: Any failed task (state 128)?
          const failedTask = Object.entries(tasks).find(([taskId, task]) => task.state === 128);
          if (failedTask) {
            console.error('[ProjectChat] ❌ Failed task found:', {
              taskId: failedTask[0],
              task: failedTask[1]
            });
            
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('failed');
            
            const errorMessage = {
              id: Date.now() + 4,
              type: 'error',
              content: 'Sorry, I encountered an error while processing your question.',
              timestamp: new Date(),
              status: 'failed'
            };
            
            setMessages(prev => {
              const filtered = prev.filter(msg => msg.status !== 'processing');
              return [...filtered, errorMessage];
            });
            return;
          }
          
          // CHECK 3: Check for ready tasks (UserTask or ManualTask) - like WorkflowUI
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
            console.log('[ProjectChat] 🔔 READY TASK FOUND!', { taskId, taskSpecName });
            
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('task_ready');
            setReadyTaskData({ taskSpec: taskSpecName });
            return;
          }
          
          // Otherwise, show intermediate task results
          const completedTasks = Object.entries(tasks).filter(([taskId, task]) => task.state === 64);
          
          if (completedTasks.length > 0) {
            console.log('[ProjectChat] ✨ Completed tasks found:', completedTasks.length, completedTasks);
          }
          
          completedTasks.forEach(([taskId, task]) => {
            const taskData = task.data || {};
            
            // Check if we already processed this task using the ref
            if (!processedTasksRef.current.has(taskId) && taskData.result) {
              console.log('[ProjectChat] 💬 Adding task result message:', {
                taskId,
                taskName: task.task_spec,
                result: taskData.result
              });
              
              processedTasksRef.current.add(taskId); // Mark as processed
              
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
          console.warn('[ProjectChat] ⚠️ Poll result not successful:', result);
        }
      } catch (error) {
        console.error('[ProjectChat] ❌ Polling error:', {
          message: error?.message,
          stack: error?.stack,
          name: error?.name,
          fullError: error
        });
      }
    };

    checkStatus();
    pollInterval.current = setInterval(checkStatus, POLL_INTERVAL);
  };

  const handleSendMessage = () => {
    if (!message.trim() || loading) return;
    
    const question = message.trim();
    setMessage('');
    startChat(question);
  };
  
  // Handle task completion success - resume polling
  const handleTaskSuccess = () => {
    setReadyTaskData(null);
    setState('running');
    setIsPolling(true);
    startPolling(workflowId, instanceId);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMessageIcon = (type, status) => {
    if (type === 'user') return <User size={16} />;
    if (type === 'error') return <XCircle size={16} />;
    if (status === 'processing') return <Clock size={16} />;
    if (status === 'completed') return <CheckCircle size={16} />;
    return <Bot size={16} />;
  };

  const getMessageColor = (type, status) => {
    if (type === 'user') return theme.palette.primary.main;
    if (type === 'error') return theme.palette.error.main;
    if (status === 'processing') return theme.palette.warning.main;
    return theme.palette.secondary.main;
  };

  return (
    <>
      {/* Floating Chat Button */}
      <Fab
        color="primary"
        aria-label="chat"
        sx={{
          position: 'fixed',
          top: 24,
          right: 24,
          zIndex: 1000,
        }}
        onClick={() => setChatOpen(true)}
      >
        <MessageCircle size={24} />
      </Fab>

      {/* Chat Dialog */}
      <Dialog
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        maxWidth="md"
        fullWidth
        sx={{
          '& .MuiDialog-paper': {
            height: '80vh',
            maxHeight: '800px',
          },
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Bot size={24} />
            <Typography variant="h6">Project Assistant</Typography>
            {isPolling && (
              <Chip
                icon={<CircularProgress size={12} />}
                label="Processing..."
                size="small"
                color="warning"
              />
            )}
          </Box>
          <IconButton onClick={() => setChatOpen(false)}>
            <X size={20} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Messages Area */}
          <Box sx={{ 
            flex: 1, 
            overflowY: 'auto', 
            p: 2,
            minHeight: 400
          }}>
            {messages.length === 0 && state !== 'task_ready' ? (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                height: '100%',
                gap: 2,
                color: 'text.secondary'
              }}>
                <Bot size={48} />
                <Typography variant="h6">Ask me anything about your projects!</Typography>
                <Typography variant="body2" sx={{ textAlign: 'center', maxWidth: 400 }}>
                  I can help you analyze project data, get insights, and answer questions about project status and progress.
                </Typography>
              </Box>
            ) : (
              <List sx={{ p: 0 }}>
                {messages.map((msg, index) => (
                  <React.Fragment key={msg.id}>
                    <ListItem sx={{ 
                      display: 'flex', 
                      alignItems: 'flex-start',
                      gap: 2,
                      px: 0,
                      py: 1
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
                            {msg.type === 'user' ? 'You' : 
                             msg.type === 'error' ? 'Error' : 'Assistant'}
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
                          bgcolor: msg.type === 'user' ? 
                            alpha(theme.palette.primary.main, 0.1) : 
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
                              
                              {/* Display output documents as a table if available */}
                              {(() => {
                                console.log('[ProjectChat] 🖼️ Rendering message:', {
                                  msgId: msg.id,
                                  hasOutputDocs: !!msg.outputDocs,
                                  outputDocsType: typeof msg.outputDocs,
                                  outputDocsIsArray: Array.isArray(msg.outputDocs),
                                  outputDocsLength: msg.outputDocs?.length,
                                  outputDocs: msg.outputDocs
                                });
                                
                                if (msg.outputDocs && Array.isArray(msg.outputDocs) && msg.outputDocs.length > 0) {
                                  console.log('[ProjectChat] ✅ Rendering table for documents:', msg.outputDocs);
                                  return (
                                    <Box sx={{ mt: 2 }}>
                                      <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                                        📄 Output Documents ({msg.outputDocs.length})
                                      </Typography>
                                      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                                        <Table size="small" stickyHeader>
                                          <TableHead>
                                            <TableRow>
                                              {Object.keys(msg.outputDocs[0] || {})
                                                .filter(key => !key.toLowerCase().includes('id') && key !== '_id')
                                                .map((key) => (
                                                <TableCell key={key} sx={{ fontWeight: 'bold', bgcolor: 'background.default' }}>
                                                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                </TableCell>
                                              ))}
                                            </TableRow>
                                          </TableHead>
                                          <TableBody>
                                            {msg.outputDocs.map((doc, idx) => (
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
                                  // Show configuration message when _output_docs variable is not found
                                  console.log('[ProjectChat] ℹ️ No _output_docs found, showing configuration message');
                                  return (
                                    <Box sx={{ mt: 2, p: 2, bgcolor: alpha(theme.palette.warning.main, 0.1), borderRadius: 1, border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}` }}>
                                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: 'warning.dark' }}>
                                        ⚙️ Workflow Configuration Required
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                        The workflow needs to be configured to output data using the <code>_output_docs</code> variable.
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        Please ensure your workflow includes a task that sets <code>_output_docs</code> with the query results to display them here as a table.
                                      </Typography>
                                    </Box>
                                  );
                                } else {
                                  console.log('[ProjectChat] ❌ No documents to render');
                                  return null;
                                }
                              })()}
                            </>
                          )}
                        </Paper>
                      </Box>
                    </ListItem>
                    {index < messages.length - 1 && <Divider sx={{ my: 1 }} />}
                  </React.Fragment>
                ))}
                
                {/* Show TaskCompletion inline in messages area */}
                {state === 'task_ready' && readyTaskData && workflowId && instanceId && (
                  <ListItem sx={{ px: 0, py: 1 }}>
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
                  </ListItem>
                )}
                
                <div ref={messagesEndRef} />
              </List>
            )}
          </Box>

          {/* Input Area */}
          <Box sx={{ 
            p: 2, 
            borderTop: '1px solid',
            borderColor: 'divider'
          }}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder="Ask a question about your projects..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading || state === 'task_ready'}
              variant="outlined"
              size="small"
              InputProps={{
                endAdornment: (
                  <IconButton
                    color="primary"
                    onClick={handleSendMessage}
                    disabled={!message.trim() || loading || state === 'task_ready'}
                    edge="end"
                    sx={{ 
                      bgcolor: 'primary.main',
                      color: 'white',
                      width: 36,
                      height: 36,
                      mr: 0.5,
                      '&:hover': {
                        bgcolor: 'primary.dark',
                      },
                      '&:disabled': {
                        bgcolor: 'grey.300',
                        color: 'grey.500',
                      }
                    }}
                  >
                    {loading ? <CircularProgress size={16} color="inherit" /> : <Send size={16} />}
                  </IconButton>
                ),
              }}
            />
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProjectChat;