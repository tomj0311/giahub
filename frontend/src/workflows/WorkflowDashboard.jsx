import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  CircularProgress,
  Paper,
  Chip,
  Avatar,
  IconButton,
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
  Plus,
  Settings,
  ArrowLeft,
  ArrowRight,
  Edit,
  FileText,
  Bot
} from 'lucide-react';
import sharedApiService from '../utils/apiService';

function WorkflowCard({ workflow, onEdit, onRun }) {
  const theme = useTheme()

  const getStatusColor = (category) => {
    switch (category?.toLowerCase()) {
      case 'business process': return 'primary'
      case 'automation': return 'secondary'
      case 'integration': return 'success'
      case 'analytics': return 'info'
      default: return 'default'
    }
  }

  const getAvatarText = (name) => {
    return name ? name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2) : 'WF'
  }

  return (
    <Card sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column', 
      position: 'relative',
      transition: theme.transitions.create(['transform', 'box-shadow'], {
        duration: theme.transitions.duration.short,
      }),
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: theme.shadows[8],
      },
      border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
      backdropFilter: 'blur(10px)'
    }}>
      <CardContent sx={{ flexGrow: 1, p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Avatar
            sx={{
              bgcolor: `${getStatusColor(workflow.category)}.main`,
              width: 48,
              height: 48,
              fontSize: '1rem',
              boxShadow: theme.shadows[2]
            }}
          >
            {getAvatarText(workflow.name)}
          </Avatar>
          <IconButton 
            size="small" 
            onClick={(e) => { e.stopPropagation(); onEdit(workflow); }}
            sx={{ 
              bgcolor: alpha(theme.palette.action.selected, 0.05),
              '&:hover': { bgcolor: alpha(theme.palette.action.selected, 0.1) }
            }}
          >
            <Edit size={16} />
          </IconButton>
        </Box>

        <Typography variant="h6" fontWeight="bold" gutterBottom noWrap sx={{ mb: 1 }}>
          {workflow.name || 'Unnamed Workflow'}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40, lineHeight: 1.4 }}>
          {workflow.description || 'No description available'}
        </Typography>

        {workflow.category && (
          <Chip
            label={workflow.category}
            size="small"
            color={getStatusColor(workflow.category)}
            variant="outlined"
            sx={{ mb: 2 }}
          />
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <FileText size={14} color={theme.palette.text.secondary} />
          <Typography variant="caption" color="text.secondary">
            {workflow.bpmn_filename || 'No BPMN file'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Settings size={14} color={theme.palette.text.secondary} />
          <Typography variant="caption" color="text.secondary">
            {workflow.is_active ? 'Active' : 'Inactive'} • Type: {workflow.type || 'workflowConfig'}
          </Typography>
        </Box>
      </CardContent>

      <CardActions sx={{ pt: 0, p: 3, justifyContent: 'center' }}>
        <Button
          size="medium"
          color="primary"
          startIcon={<Bot size={16} />}
          onClick={() => onRun(workflow)}
          fullWidth
          variant="contained"
          sx={{ borderRadius: 2 }}
        >
          Run
        </Button>
      </CardActions>
    </Card>
  )
}

export default function WorkflowDashboard({ user }) {
  const theme = useTheme()
  const navigate = useNavigate()
  
  // Add render logging to track what's causing re-renders
  console.log('🔄 WorkflowDashboard RENDER', { 
      userToken: user?.token?.substring(0, 10) + '...', 
      timestamp: Date.now() 
  });
  
  // Use the user token from props (same pattern as other dashboard components)
  const token = user?.token;

  // Add ref to track if component is mounted
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  
  // Create a ref to store the current token to avoid useCallback dependency issues
  const tokenRef = useRef(token);
  tokenRef.current = token;
  
  const [loading, setLoading] = useState(true)
  const [workflows, setWorkflows] = useState([])
  const [displayedWorkflows, setDisplayedWorkflows] = useState([])

  // NEW: All workflows from Redis for current tenant - SEPARATE LOGIC
  const [allRedisWorkflows, setAllRedisWorkflows] = useState([])
  const [redisWorkflowsLoading, setRedisWorkflowsLoading] = useState(false)

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 8,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false
  })

  useEffect(() => {
    console.log('MOUNT: WorkflowDashboard', 'Token:', token?.substring(0, 10) + '...', 'User:', user);
    console.log('🔍 USER TENANT_ID:', user?.tenant_id);
    console.log('🔍 USER TENANTID:', user?.tenantId);
    console.log('🔍 USER ALL KEYS:', Object.keys(user || {}));
    
    // Set mounted to true
    isMountedRef.current = true;
    
    const fetchWorkflowData = async () => {
      if (!isMountedRef.current) return;
      
      // Prevent duplicate calls
      if (isLoadingRef.current) {
        console.log('🚫 Already loading workflow data, skipping duplicate call');
        return;
      }
      
      try {
        isLoadingRef.current = true;
        setLoading(true)

        // Fetch workflows with pagination - use singleton service
        const workflowsUrl = `/api/workflows/configs?page=${pagination.page}&page_size=${pagination.page_size}`
        console.log('🔍 FETCHING WORKFLOWS URL:', workflowsUrl);
        console.log('🔍 WITH TOKEN:', tokenRef.current ? 'YES' : 'NO');
        
        const workflowsResult = await sharedApiService.makeRequest(
          workflowsUrl,
          {
            headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
          },
          {
            page: pagination.page,
            pageSize: pagination.page_size,
            token: tokenRef.current?.substring(0, 10)
          }
        );

        console.log('🔍 WORKFLOWS API RESPONSE:', workflowsResult.success ? 'SUCCESS' : 'FAILED')
        console.log('🔍 FULL RESPONSE:', workflowsResult);

        if (!isMountedRef.current) {
          console.log('🚫 Component unmounted, aborting workflow data load');
          return;
        }

        if (workflowsResult.success) {
          const workflowsData = workflowsResult.data
          console.log('📄 WORKFLOWS DATA:', workflowsData)
          const workflowsList = workflowsData.configurations || []
          const paginationData = workflowsData.pagination || {}

          console.log('📋 WORKFLOWS LIST:', workflowsList)
          console.log('📊 PAGINATION:', paginationData)

          setWorkflows(workflowsList)
          setDisplayedWorkflows(workflowsList)
          setPagination(paginationData)
        } else {
          console.log('❌ WORKFLOWS API FAILED:', workflowsResult.error)
          console.log('❌ ERROR DETAILS:', workflowsResult)
        }

      } catch (error) {
        console.error('Failed to fetch workflow data:', error)
        setWorkflows([])
        setDisplayedWorkflows([])
      } finally {
        if (isMountedRef.current) {
          setLoading(false)
          isLoadingRef.current = false
        }
      }
    }

    fetchWorkflowData()
    
    // NEW: Fetch ALL workflows from Redis for current tenant - SEPARATE FUNCTION
    const fetchAllRedisWorkflows = async () => {
      if (!isMountedRef.current) return;
      
      try {
        setRedisWorkflowsLoading(true)
        
        // Fetch ALL workflows from Redis for current tenant (backend gets tenant from JWT)
        const redisUrl = `/api/workflow/redis/all`  // Fixed: singular "workflow" not "workflows"
        console.log('🔍 FETCHING ALL REDIS WORKFLOWS URL:', redisUrl);
        
        const redisResult = await sharedApiService.makeRequest(
          redisUrl,
          {
            headers: tokenRef.current ? { 'Authorization': `Bearer ${tokenRef.current}` } : {}
          },
          {
            token: tokenRef.current?.substring(0, 10)
          }
        );

        console.log('🔍 REDIS WORKFLOWS API RESPONSE:', redisResult.success ? 'SUCCESS' : 'FAILED')
        console.log('🔍 REDIS FULL RESPONSE:', redisResult);

        if (!isMountedRef.current) {
          console.log('🚫 Component unmounted, aborting Redis workflow data load');
          return;
        }

        if (redisResult.success) {
          const redisWorkflowsData = redisResult.data
          console.log('📄 REDIS WORKFLOWS DATA:', redisWorkflowsData)
          const redisWorkflowsList = redisWorkflowsData.workflows || []

          console.log('📋 REDIS WORKFLOWS LIST:', redisWorkflowsList)
          setAllRedisWorkflows(redisWorkflowsList)
        } else {
          console.log('❌ REDIS WORKFLOWS API FAILED:', redisResult.error)
          console.log('❌ REDIS ERROR DETAILS:', redisResult)
        }

      } catch (error) {
        console.error('Failed to fetch Redis workflow data:', error)
        setAllRedisWorkflows([])
      } finally {
        if (isMountedRef.current) {
          setRedisWorkflowsLoading(false)
        }
      }
    }

    fetchAllRedisWorkflows()
    
    return () => {
      console.log('UNMOUNT: WorkflowDashboard');
      // Set mounted to false FIRST to prevent any state updates
      isMountedRef.current = false;
      isLoadingRef.current = false;
    };
  }, []); // EMPTY DEPENDENCIES - NO BULLSHIT

  const handleShowMore = () => {
    if (pagination.has_next) {
      setPagination(prev => ({ ...prev, page: prev.page + 1 }))
    }
  }

  const handleShowLess = () => {
    if (pagination.has_prev) {
      setPagination(prev => ({ ...prev, page: prev.page - 1 }))
    }
  }

  const handleEditWorkflow = (workflow) => {
    // Navigate to workflow configuration page
    navigate('/dashboard/workflows')
  }

  const handleRunWorkflow = (workflow) => {
    console.log('🚨🚨🚨 HANDLE RUN WORKFLOW CALLED 🚨🚨🚨');
    console.log('🚨 WORKFLOW OBJECT:', workflow);
    console.log('🚨 WORKFLOW ID:', workflow.id);
    console.log('🚨 ABOUT TO NAVIGATE TO:', `/dashboard/workflow-execution?workflow=${workflow.id}`);
    
    // Navigate to workflow execution page with workflow ID
    navigate(`/dashboard/workflow-execution?workflow=${workflow.id}`);
    
    console.log('🚨 NAVIGATE CALL COMPLETED');
  }

  const handleCreateWorkflow = () => {
    navigate('/dashboard/workflows')
  }

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '60vh',
        p: 3
      }}>
        <CircularProgress size={48} sx={{ mb: 2 }} />
        <Typography variant="body1" color="text.secondary">
          Loading workflows...
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ 
      p: 3,
      background: theme.custom?.backgroundGradient || theme.palette.background.default,
      minHeight: '100vh'
    }}>
      {/* Welcome Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
          Workflow Dashboard 🔄
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your BPMN workflows and process configurations.
        </Typography>
      </Box>

      {/* Create Workflow Button */}
      <Box sx={{ mb: 4 }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={<Plus size={20} />}
          onClick={handleCreateWorkflow}
          sx={{ borderRadius: 2, px: 3 }}
        >
          Create New Workflow
        </Button>
      </Box>

      {/* Workflow Cards Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
          Your Workflows
        </Typography>

        {displayedWorkflows.length === 0 ? (
          <Paper sx={{ 
            p: 4, 
            textAlign: 'center',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            borderRadius: 3
          }}>
            <FileText size={48} color={theme.palette.text.secondary} style={{ marginBottom: 16 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No workflows created yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your first workflow to get started
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Plus size={16} />}
              onClick={handleCreateWorkflow}
              sx={{ borderRadius: 2 }}
            >
              Create Your First Workflow
            </Button>
          </Paper>
        ) : (
          <>
            <Grid container spacing={3}>
              {displayedWorkflows.map((workflow) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={workflow.id}>
                  <WorkflowCard
                    workflow={workflow}
                    onEdit={handleEditWorkflow}
                    onRun={handleRunWorkflow}
                  />
                </Grid>
              ))}
            </Grid>

            {/* Pagination Controls */}
            {pagination.total_pages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 3 }}>
                <Button
                  variant="outlined"
                  disabled={!pagination.has_prev}
                  onClick={handleShowLess}
                  startIcon={<ArrowLeft size={16} />}
                >
                  Previous
                </Button>

                <Typography variant="body2" color="text.secondary">
                  Page {pagination.page} of {pagination.total_pages} ({pagination.total} total workflows)
                </Typography>

                <Button
                  variant="outlined"
                  disabled={!pagination.has_next}
                  onClick={handleShowMore}
                  endIcon={<ArrowRight size={16} />}
                >
                  Next
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* NEW: All Redis Workflows Section - SEPARATE SECTION */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
          All Workflows in Redis (Tenant: {user?.tenant_id || user?.tenantId || 'default-tenant'})
        </Typography>

        {redisWorkflowsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading Redis workflows...
            </Typography>
          </Box>
        ) : allRedisWorkflows.length === 0 ? (
          <Paper sx={{ 
            p: 4, 
            textAlign: 'center',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            borderRadius: 3
          }}>
            <Settings size={48} color={theme.palette.text.secondary} style={{ marginBottom: 16 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No workflows found in Redis
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No workflows stored in Redis for tenant: {user?.tenant_id || user?.tenantId || 'default-tenant'}
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>BPMN File</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allRedisWorkflows.map((workflow, index) => (
                  <TableRow 
                    key={workflow.id || `redis-workflow-${index}`}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => handleRunWorkflow(workflow)}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar
                          sx={{
                            bgcolor: 'primary.main',
                            width: 32,
                            height: 32,
                            fontSize: '0.75rem'
                          }}
                        >
                          {workflow.name ? workflow.name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2) : 'WF'}
                        </Avatar>
                        <Typography variant="body2" fontWeight="medium">
                          {workflow.name || 'Unnamed Workflow'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {workflow.category ? (
                        <Chip
                          label={workflow.category}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {workflow.bpmn_filename || 'No BPMN file'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={workflow.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={workflow.is_active ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<Bot size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunWorkflow(workflow);
                        }}
                      >
                        Run
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  )
};