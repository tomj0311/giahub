import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  List,
  ListItemButton,
  Chip,
  Avatar,
  alpha,
  useTheme
} from '@mui/material';
import {
  Bot,
  RefreshCw
} from 'lucide-react';
import sharedApiService from '../utils/apiService';
import TaskCompletion from '../workflows/TaskCompletion';
import IntelligentJsonRenderer from '../components/IntelligentJsonRenderer';

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
  const processedTasksRef = useRef(new Set()); // Track processed tasks
  const hasCompletedRef = useRef(false); // Track if completion message was added
  // Track last seen values for keys starting with _output*
  const lastOutputRef = useRef(new Map()); // Map<key, stableString>
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

  // Stable stringify to compare deep object equality deterministically
  const stableStringify = (value) => {
    const sortDeep = (v) => {
      if (v === null || typeof v !== 'object') return v;
      if (Array.isArray(v)) return v.map(sortDeep);
      const sorted = {};
      Object.keys(v).sort().forEach((k) => {
        sorted[k] = sortDeep(v[k]);
      });
      return sorted;
    };
    try {
      return JSON.stringify(sortDeep(value));
    } catch (_) {
      // Fallback to normal stringify if something odd occurs
      try { return JSON.stringify(value); } catch { return String(value); }
    }
  };

  // Given an object of { _output*: any }, return only changed/new entries vs lastOutputRef
  const getChangedOutputEntries = (outputObj) => {
    const changed = {};
    if (!outputObj) return changed;
    Object.entries(outputObj).forEach(([key, val]) => {
      if (!key.startsWith('_output')) return; // guard
      const serialized = stableStringify(val);
      const prev = lastOutputRef.current.get(key);
      if (prev !== serialized) {
        changed[key] = val;
        // Update snapshot immediately so subsequent polls compare correctly
        lastOutputRef.current.set(key, serialized);
      }
    });
    return changed;
  };

  const startWorkflow = async (keepMessages = false, workflow = null) => {
    const workflowToStart = workflow || selectedWorkflow;
    if (!workflowToStart) return;
    
    try {
      setLoading(true);
      setState('running');
      setError('');
      
      // Clear any existing polling interval
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
        pollInterval.current = null;
      }
      
      if (!keepMessages) {
        setMessages([]);
        processedTasksRef.current.clear(); // Clear processed tasks when starting fresh
        hasCompletedRef.current = false; // Reset completion flag
        lastOutputRef.current.clear(); // Clear last seen outputs
      } else {
        // Even when keeping messages, reset completion flag for new execution
        hasCompletedRef.current = false;
        // For a new execution, also reset output snapshots to avoid cross-run suppression
        lastOutputRef.current.clear();
      }
      setIsPolling(false);
      
      const wfId = workflowToStart.id || workflowToStart.workflow_id || workflowToStart._id;
      
      console.log('[AIAssistant] 🚀 Starting workflow', {
        name: workflowToStart.name,
        id: wfId,
        endpoint: `/api/workflow/workflows/${wfId}/start`
      });
      
      // Start workflow (removed system message display)
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
              workflow_name: workflowToStart.name
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

        if (result.success) {
          // Handle double-nested response structure from apiService
          const instance = result.data.data || result.data;
          console.log(instance);
          
          const tasks = instance.serialized_data?.tasks || {};
          const workflowData = instance.serialized_data?.data || {};
          const taskSpecs = instance.serialized_data?.spec?.task_specs || {};
                   
          // CHECK 1: Is workflow complete or failed?
          const workflowStatus = workflowData.workflow_status?.status;
          const isCompleted = instance.serialized_data?.completed === true || 
                             workflowData.workflow_status?.completed === true ||
                             workflowStatus === 'completed' ||
                             workflowStatus === 'success';
          
          const isFailed = workflowStatus === 'error' || 
                          workflowStatus === 'failed' ||
                          workflowStatus === 'cancelled';
          
          console.log('[AIAssistant] 🔍 Workflow status check:', {
            workflowStatus,
            isCompleted,
            isFailed,
            serialized_completed: instance.serialized_data?.completed,
            status_completed: workflowData.workflow_status?.completed
          });
          
          if (isFailed) {
            if (hasCompletedRef.current) {
              console.log('[AIAssistant] ⏭️ Failure already processed, skipping');
              clearInterval(pollInterval.current);
              setIsPolling(false);
              return;
            }
            
            hasCompletedRef.current = true;
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('failed');
            
            const errorMessage = {
              id: Date.now() + 2,
              type: 'error',
              content: workflowData.error || 'Workflow failed',
              timestamp: new Date(),
              status: 'failed'
            };
            
            setMessages(prev => {
              const filtered = prev.filter(msg => msg.status !== 'processing');
              return [...filtered, errorMessage];
            });
            return;
          }
          
          if (isCompleted) {
            if (hasCompletedRef.current) {
              // Already processed completion, stop polling and return
              console.log('[AIAssistant] ⏭️ Completion already processed, skipping');
              clearInterval(pollInterval.current);
              setIsPolling(false);
              return;
            }
            
            // Mark as completed FIRST to prevent any race conditions
            hasCompletedRef.current = true;
            
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('completed');
                      
            // Extract only _output* variables from workflowData
            const outputData = {};
            Object.keys(workflowData).forEach(key => {
              if (key.startsWith('_output')) {
                outputData[key] = workflowData[key];
              }
            });
            const changedOutput = getChangedOutputEntries(outputData);
                       
            const response = workflowData.final_answer || 
                           workflowData.answer || 
                           workflowData.result ||
                           null;
            
            const responseMessage = {
              id: Date.now() + 2,
              type: 'bot',
              content: response,
              timestamp: new Date(),
              status: 'completed',
              // Only include changed/new outputs; omit if none changed
              outputData: Object.keys(changedOutput).length > 0 ? changedOutput : null
            };
            
            console.log('========== RESPONSE MESSAGE ==========');
            console.log('responseMessage:', responseMessage);
            console.log('======================================');
            
            setMessages(prev => {
              const filtered = prev.filter(msg => msg.status !== 'processing');
              return [...filtered, responseMessage];
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
          
          // CHECK 3: Show intermediate task results FIRST before checking for ready tasks
          const completedTasks = Object.entries(tasks).filter(([taskId, task]) => task.state === 64);
          
          completedTasks.forEach(([taskId, task]) => {
            const taskData = task.data || {};
            
            // Check if we already processed this task
            if (processedTasksRef.current.has(taskId)) {
              return;
            }
            
            // Extract _output* variables from task data
            const outputData = {};
            Object.keys(taskData).forEach(key => {
              if (key.startsWith('_output')) {
                outputData[key] = taskData[key];
              }
            });
            const changedOutput = getChangedOutputEntries(outputData);
            
            // Show message if there's a result or output data
            const hasResult = taskData.result || taskData.output || Object.keys(changedOutput).length > 0;
            
            if (hasResult) {
              console.log('[AIAssistant] 💬 Adding task result message:', {
                taskId,
                taskName: task.task_spec,
                result: taskData.result,
                output: taskData.output,
                outputData: changedOutput
              });
              
              processedTasksRef.current.add(taskId); // Mark as processed
              
              // Determine content to display - only show if there's actual content
              let content = taskData.result || taskData.output || null;
              
              // Only create message if there's meaningful content OR outputData
              const hasOutputData = Object.keys(changedOutput).length > 0;
              if (content || hasOutputData) {
                const taskMessage = {
                  id: Date.now() + Math.random(),
                  type: 'bot',
                  content: content,
                  timestamp: new Date(),
                  taskId: taskId,
                  taskName: task.task_spec,
                  status: 'completed',
                  outputData: hasOutputData ? changedOutput : null
                };
                
                setMessages(prev => [...prev, taskMessage]);
              }
            }
          });
          
          // CHECK 4: Check for ready tasks - ONLY by state 16 (READY) - DO THIS LAST
          const readyTask = Object.entries(tasks).find(([taskId, task]) => {
            // ONLY check state - ignore already completed tasks
            if (task.state !== 16) return false;
            
            const taskSpecName = task.task_spec;
            const taskSpec = taskSpecs[taskSpecName];
            const typename = taskSpec?.typename;
            const isUserTask = typename === 'UserTask' || typename === 'ManualTask';
            
            // Skip if already processed
            if (processedTasksRef.current.has(taskId)) {
              console.log('[AIAssistant] ⏭️ Skipping already processed task:', taskId);
              return false;
            }
            
            return isUserTask;
          });
          
          if (readyTask) {
            const [taskId, task] = readyTask;
            const taskSpecName = task.task_spec;
            console.log('[AIAssistant] 🔔 READY TASK FOUND!', { taskId, taskSpecName, state: task.state });
            
            // Mark as processed to avoid showing again
            processedTasksRef.current.add(taskId);
            
            clearInterval(pollInterval.current);
            setIsPolling(false);
            setState('task_ready');
            setReadyTaskData({ taskSpec: taskSpecName, taskId: taskId });
            return;
          }
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

  const handleTaskSuccess = (submittedData) => {
    // Add user input message to chat - show submitted data in heading
    if (submittedData) {
      // Create a readable summary of submitted data
      const contentSummary = Object.entries(submittedData)
        .map(([key, value]) => {
          if (value instanceof File) {
            return `${key}: ${value.name}`;
          } else if (typeof value === 'object') {
            return `${key}: [data]`;
          } else {
            return `${key}: ${String(value)}`;
          }
        })
        .join(', ');
      
      const userMessage = {
        id: Date.now(),
        type: 'user',
        content: contentSummary,
        timestamp: new Date(),
        status: 'completed',
        submittedData: submittedData
      };
      setMessages(prev => [...prev, userMessage]);
    }
    
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
    processedTasksRef.current.clear(); // Clear processed tasks
    hasCompletedRef.current = false; // Reset completion flag
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
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
          Select an AI Assistant to execute automated tasks and get intelligent responses
        </Typography>
      </Box>

      {/* Main Content */}
      <Box sx={{ display: 'flex', gap: 3, height: 'calc(100vh - 200px)', overflow: 'hidden', width: '100%' }}>
        {/* Left Panel - Workflow Selection */}
        <Box sx={{ 
          width: 280,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden'
        }}>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 2 }}>
            Available Assistants ({workflows.length})
          </Typography>

          {/* Workflow List */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {workflowsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : error && workflows.length === 0 ? (
              <Alert severity="warning" sx={{ m: 0 }}>
                {error}
              </Alert>
            ) : (
              <List sx={{ p: 0 }}>
                {workflows.map((workflow) => (
                  <ListItemButton
                    key={workflow.id || workflow.workflow_id || workflow._id}
                    selected={selectedWorkflow?.name === workflow.name}
                    onClick={() => {
                      if (state === 'idle') {
                        setSelectedWorkflow(workflow);
                        startWorkflow(false, workflow);
                      }
                    }}
                    disabled={(state === 'running' || isPolling || loading) && selectedWorkflow?.name === workflow.name}
                    sx={{ 
                      mb: 1,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: selectedWorkflow?.name === workflow.name ? 'primary.main' : 'divider',
                      '&.Mui-selected': {
                        bgcolor: alpha(theme.palette.primary.main, 0.08),
                      },
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      py: 1.5
                    }}
                  >
                    <Typography variant="body1" fontWeight={500}>
                      {workflow.name}
                    </Typography>
                    {workflow.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                        {workflow.description}
                      </Typography>
                    )}
                    {selectedWorkflow?.name === workflow.name && state !== 'idle' && (
                      <Button
                        variant="text"
                        size="small"
                        startIcon={<RefreshCw size={16} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReset();
                        }}
                        disabled={isPolling}
                        sx={{ mt: 1, alignSelf: 'flex-end' }}
                      >
                        Reset
                      </Button>
                    )}
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        </Box>

        {/* Right Panel - Results/Messages */}
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%', 
          overflow: 'hidden', 
          minWidth: 0,
          bgcolor: alpha(theme.palette.grey[500], 0.03),
          borderRadius: 1,
          p: 2
        }}>
          {state === 'idle' && !selectedWorkflow && (
            <Box sx={{ 
              flex: 1,
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              gap: 2,
              color: 'text.secondary'
            }}>
              <Bot size={48} />
              <Typography variant="h6">Select an Assistant</Typography>
              <Typography variant="body2">
                Choose from the available assistants
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
              gap: 2
            }}>
              <Bot size={48} color={theme.palette.primary.main} />
              <Typography variant="h6" fontWeight="bold">
                {selectedWorkflow.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 500 }}>
                {selectedWorkflow.description || 'Starting assistant...'}
              </Typography>
            </Box>
          )}

          {(state === 'running' || state === 'completed' || state === 'failed' || state === 'task_ready') && (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Assistant Header */}
              <Box sx={{ 
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                mb: 2,
                pb: 2,
                borderBottom: '1px solid',
                borderColor: 'divider'
              }}>
                <Avatar sx={{ 
                  bgcolor: theme.palette.secondary.main,
                  width: 40,
                  height: 40
                }}>
                  <Bot size={24} />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {selectedWorkflow?.name || 'AI Assistant'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {isPolling ? 'Processing...' : 'Ready'}
                  </Typography>
                </Box>
              </Box>
              
              {/* Messages Area */}
              <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {messages.filter(msg => {
                  // Filter out messages with no content and no outputData
                  return msg.content || (msg.outputData && Object.keys(msg.outputData).length > 0);
                }).map((msg, index) => (
                  <Box 
                    key={msg.id}
                    sx={{ 
                      width: '100%',
                      display: 'flex', 
                      gap: 1.5,
                      mb: 2,
                      flexDirection: msg.type === 'user' ? 'row-reverse' : 'row',
                      justifyContent: msg.type === 'user' ? 'flex-start' : 'flex-start'
                    }}
                  >
                    <Avatar sx={{ 
                      bgcolor: msg.type === 'user' ? theme.palette.primary.main : 
                                msg.type === 'error' ? theme.palette.error.main :
                                theme.palette.secondary.main,
                      width: 32,
                      height: 32,
                      flexShrink: 0
                    }}>
                      {msg.type === 'user' ? 'U' : <Bot size={18} />}
                    </Avatar>
                    
                    <Box sx={{ 
                      maxWidth: msg.type === 'user' ? '50%' : '100%',
                      minWidth: 0
                    }}>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1.5, 
                        mb: 1,
                        flexDirection: msg.type === 'user' ? 'row-reverse' : 'row',
                        justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start'
                      }}>
                        <Typography variant="caption" fontWeight={600}>
                          {msg.type === 'error' ? 'Error' : msg.type === 'user' ? 'You' : 'Assistant'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTimestamp(msg.timestamp)}
                        </Typography>
                        {msg.taskName && (
                          <Chip 
                            label={msg.taskName} 
                            size="small" 
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                        )}
                      </Box>
                      
                      <Box sx={{ 
                        p: 1.5,
                        borderRadius: 1,
                        bgcolor: msg.type === 'user' ? 
                          alpha(theme.palette.primary.main, 0.1) :
                          msg.type === 'error' ? 
                          alpha(theme.palette.error.main, 0.1) : 
                          'background.paper',
                        border: '1px solid',
                        borderColor: msg.type === 'error' ? 'error.main' : 'divider'
                      }}>
                        {msg.status === 'processing' ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={14} />
                            <Typography variant="body2">{msg.content}</Typography>
                          </Box>
                        ) : (
                          <>
                            {msg.content && (
                              <Typography 
                                variant="body2" 
                                sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                              >
                                {msg.content}
                              </Typography>
                            )}
                            
                            {msg.outputData && (
                              <Box sx={{ mt: msg.content ? 1.5 : 0 }}>
                                {Object.entries(msg.outputData).map(([key, value]) => (
                                  <Box key={key} sx={{ maxHeight: 500, overflow: 'auto' }}>
                                    <IntelligentJsonRenderer data={value} keyName={null} />
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </>
                        )}
                      </Box>
                    </Box>
                  </Box>
                ))}
                
                {/* Show TaskCompletion if ready */}
                {state === 'task_ready' && readyTaskData && workflowId && instanceId && (
                  <Box sx={{ mt: 2 }}>
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
                
                {/* Start Over Button */}
                {(state === 'completed' || state === 'failed') && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                    <Button
                      variant="contained"
                      startIcon={<RefreshCw size={18} />}
                      onClick={() => {
                        setState('running');
                        setError('');
                        setReadyTaskData(null);
                        startWorkflow(true);
                      }}
                    >
                      Start Over
                    </Button>
                  </Box>
                )}
                
                <div ref={messagesEndRef} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default AIAssistant;
