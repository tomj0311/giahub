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
    // Set mounted to true
    isMountedRef.current = true;
    
    const fetchWorkflowData = async () => {
      if (!isMountedRef.current) return;
      
      // Prevent duplicate calls
      if (isLoadingRef.current) {
        return;
      }
      
      try {
        isLoadingRef.current = true;
        setLoading(true)

        // Fetch workflows with pagination - use singleton service
        const workflowsUrl = `/api/workflows/configs?page=${pagination.page}&page_size=${pagination.page_size}`
  // removed verbose debugging logs
        
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

        if (!isMountedRef.current) {
          return;
        }

        if (workflowsResult.success) {
          const workflowsData = workflowsResult.data
          const workflowsList = workflowsData.configurations || []
          const paginationData = workflowsData.pagination || {}

          setWorkflows(workflowsList)
          setDisplayedWorkflows(workflowsList)
          setPagination(paginationData)
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
    
    return () => {
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
    // Navigate to workflow execution page with workflow ID
    navigate(`/dashboard/workflow-execution?workflow=${workflow.id}`);
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
          Workflow Dashboard
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
    </Box>
  )
};