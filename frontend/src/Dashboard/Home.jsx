import React, { useState, useEffect, useRef } from 'react'
import {
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Button,
  IconButton,
  Avatar,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  Paper,
  useTheme,
  LinearProgress,
  alpha,
  Fade,
  Slide,
  Grow,
  CircularProgress
} from '@mui/material'
import {
  Bot,
  MessageSquare,
  Activity,
  Plus,
  Edit,
  MoreVertical as MoreVertIcon,
  Clock,
  Settings,
  Play,
  ArrowLeft,
  ArrowRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiCall } from '../config/api'
import { agentRuntimeService } from '../services/agentRuntimeService'
import sharedApiService from '../utils/apiService'

function AgentCard({ agent, onEdit, onChat }) {
  const theme = useTheme()

  const getStatusColor = (category) => {
    switch (category?.toLowerCase()) {
      case 'data analysis': return 'primary'
      case 'coding': return 'secondary'
      case 'content': return 'success'
      case 'research': return 'info'
      default: return 'default'
    }
  }

  const getAvatarText = (name) => {
    return name ? name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2) : 'AG'
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
              bgcolor: `${getStatusColor(agent.category)}.main`,
              width: 48,
              height: 48,
              fontSize: '1rem',
              boxShadow: theme.shadows[2]
            }}
          >
            {getAvatarText(agent.name)}
          </Avatar>
          <IconButton 
            size="small" 
            onClick={(e) => { e.stopPropagation(); onEdit(agent); }}
            sx={{ 
              bgcolor: alpha(theme.palette.action.selected, 0.05),
              '&:hover': { bgcolor: alpha(theme.palette.action.selected, 0.1) }
            }}
          >
            <Edit size={16} />
          </IconButton>
        </Box>

        <Typography variant="h6" fontWeight="bold" gutterBottom noWrap sx={{ mb: 1 }}>
          {agent.name || 'Unnamed Agent'}
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: 2,
            minHeight: 40,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical'
          }}
        >
          {agent.description || 'No description available'}
        </Typography>

        {agent.category && (
          <Chip
            label={agent.category}
            size="small"
            color={getStatusColor(agent.category)}
            variant="outlined"
            sx={{ mb: 2 }}
          />
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
          <Bot size={14} color={theme.palette.text.secondary} />
          <Typography variant="caption" color="text.secondary">
            {agent.model?.strategy || agent.model?.name || agent.model?.id || 'No model configured'}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Settings size={14} color={theme.palette.text.secondary} />
          <Typography variant="caption" color="text.secondary">
            {Object.keys(agent.tools || {}).length} tools configured
          </Typography>
        </Box>
      </CardContent>

      <CardActions sx={{ pt: 0, p: 3, justifyContent: 'center' }}>
        <Button
          size="medium"
          color="primary"
          startIcon={<MessageSquare size={16} />}
          onClick={() => onChat(agent)}
          fullWidth
          variant="contained"
          sx={{ borderRadius: 2 }}
        >
          Chat
        </Button>
      </CardActions>
    </Card>
  )
}

function ConversationItem({ conversation, onClick }) {
  return (
    <ListItem
      button
      onClick={() => onClick(conversation)}
      sx={{
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: 'action.hover'
        }
      }}
    >
      <ListItemAvatar>
        <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.875rem' }}>
          {conversation.avatar}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={
          <Typography variant="body2">
            <strong>{conversation.agentName}</strong>
          </Typography>
        }
        secondary={
          <Box>
            <Typography variant="caption" color="text.secondary">
              {conversation.lastMessage}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {conversation.time}
            </Typography>
          </Box>
        }
      />
    </ListItem>
  )
}

function TaskProgressItem({ task }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'On Track': return 'success'
      case 'Nearly Complete': return 'info'
      case 'In Progress': return 'warning'
      default: return 'default'
    }
  }

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="body2" fontWeight="medium">
          {task.name}
        </Typography>
        <Chip
          label={task.status}
          size="small"
          color={getStatusColor(task.status)}
          variant="outlined"
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <LinearProgress
          variant="determinate"
          value={task.progress}
          sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 35 }}>
          {task.progress}%
        </Typography>
      </Box>
    </Box>
  )
}

export default function Home({ user }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [paginationLoading, setPaginationLoading] = useState(false)
  const [agents, setAgents] = useState([])
  const [displayedAgents, setDisplayedAgents] = useState([])
  const [recentConversations, setRecentConversations] = useState([])
  const [taskProgress, setTaskProgress] = useState([])
  const [showAll, setShowAll] = useState(false)

  // Add ref to track if component is mounted
  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: 8,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false
  })

  const INITIAL_DISPLAY_COUNT = 8

  // Handler for when a conversation is clicked - navigate to AgentPlayground with conversation ID
  const handleConversationClick = (conversation) => {
    navigate(`/dashboard/agent-playground?conversation=${conversation.id}`)
  }

  // Handler for viewing all conversations - navigate to agent playground and show history
  const handleViewAllConversations = () => {
    navigate(`/dashboard/agent-playground?showHistory=true`)
  }

  // Separate function to fetch agents data
  const fetchAgentsData = async (page = 1, pageSize = 8) => {
    if (!isMountedRef.current) return;
    
    // Prevent duplicate calls
    if (isLoadingRef.current) {
      return;
    }
    
    try {
      isLoadingRef.current = true;
      setLoading(true)

      // Fetch agents with pagination - use singleton service
      const agentsUrl = `/api/agents?page=${page}&page_size=${pageSize}`
      const agentsResult = await sharedApiService.makeRequest(
        agentsUrl,
        {
          headers: {
            ...(user?.token ? { 'Authorization': `Bearer ${user?.token}` } : {})
          }
        },
        {
          page: page,
          pageSize: pageSize,
          token: user?.token?.substring(0, 10)
        }
      );

  // removed api response debug log

      if (!isMountedRef.current) {
        // component unmounted during load
        return;
      }

      if (agentsResult.success) {
        const agentsData = agentsResult.data
        const agentsList = agentsData.agents || []
        const paginationData = agentsData.pagination || {}

        setAgents(agentsList)
        setDisplayedAgents(agentsList)
        setPagination(paginationData)
      }
    } catch (error) {
      console.error('Failed to fetch agents data:', error)
      setAgents([])
      setDisplayedAgents([])
    } finally {
      if (isMountedRef.current) {
        isLoadingRef.current = false;
        setLoading(false)
      }
    }
  }

  // Initial data fetch on component mount
  useEffect(() => {
  // removed mount log
    
    // Set mounted to true
    isMountedRef.current = true;
    
    const fetchInitialData = async () => {
      if (!isMountedRef.current) return;
      
      try {
        // Fetch agents data
        await fetchAgentsData(pagination.page, pagination.page_size)

        // Fetch recent conversations - Use agent runtime endpoint with pagination
        try {
          const conversationsResult = await sharedApiService.makeRequest(
            '/api/agent-runtime/conversations?page=1&page_size=5',
            {
              headers: {
                ...(user?.token ? { 'Authorization': `Bearer ${user?.token}` } : {})
              }
            },
            {
              token: user?.token?.substring(0, 10),
              endpoint: 'conversations'
            }
          );

          if (!isMountedRef.current) return;

          if (conversationsResult.success) {
            const conversationsData = conversationsResult.data
            // Handle both paginated and legacy response formats
            let allConversations = []
            if (conversationsData.conversations) {
              // Paginated response
              allConversations = conversationsData.conversations
            } else if (Array.isArray(conversationsData)) {
              // Legacy format
              allConversations = conversationsData
            }

            const recentConvs = allConversations
              .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
              .slice(0, 5)
              .map(conv => ({
                id: conv.conversation_id,
                agentName: conv.agent_name,
                avatar: conv.agent_name ? conv.agent_name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2) : 'AG',
                lastMessage: conv.title || 'No title',
                time: new Date(conv.updated_at || Date.now()).toLocaleString()
              }))
            setRecentConversations(recentConvs)
          }
        } catch (error) {
          console.error('Failed to fetch conversations:', error)
          setRecentConversations([])
        }

        // Task progress - No backend endpoint available yet, using empty array
        try {
          // TODO: Implement task progress endpoint in backend
          setTaskProgress([])
        } catch (error) {
          console.error('Failed to fetch tasks:', error)
          setTaskProgress([])
        }

      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
        setRecentConversations([])
        setTaskProgress([])
      }
    }

    fetchInitialData()
    
    return () => {
  // removed unmount log
      // Set mounted to false FIRST to prevent any state updates
      isMountedRef.current = false;
      isLoadingRef.current = false;
    };
  }, []) // EMPTY DEPENDENCIES - Initial mount only

  const handleShowMore = async () => {
    if (pagination.has_next) {
      const nextPage = pagination.page + 1
      await fetchAgentsData(nextPage, pagination.page_size)
    }
  }

  const handleShowLess = async () => {
    if (pagination.has_prev) {
      const prevPage = pagination.page - 1
      await fetchAgentsData(prevPage, pagination.page_size)
    }
  }

  const handleEditAgent = (agent) => {
    navigate('/dashboard/agents')
  }

  const handleChatWithAgent = (agent) => {
    navigate(`/dashboard/agent-playground?agent=${agent.name}`)
  }

  const handleCreateAgent = () => {
    navigate('/dashboard/agents')
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
          Loading dashboard...
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
          Welcome back, {user?.name || 'User'}!
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage your AI agents and track recent conversations.
        </Typography>
      </Box>

      {/* Create Agent Button */}
      <Box sx={{ mb: 4 }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          startIcon={<Plus size={20} />}
          onClick={handleCreateAgent}
          sx={{ borderRadius: 2, px: 3 }}
        >
          Create New Agent
        </Button>
      </Box>

      {/* Agent Cards Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
          Your AI Agents
        </Typography>

        {displayedAgents.length === 0 ? (
          <Paper sx={{ 
            p: 4, 
            textAlign: 'center',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            borderRadius: 3
          }}>
            <Bot size={48} color={theme.palette.text.secondary} style={{ marginBottom: 16 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No agents created yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Create your first AI agent to get started
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Plus size={16} />}
              onClick={handleCreateAgent}
              sx={{ borderRadius: 2 }}
            >
              Create Your First Agent
            </Button>
          </Paper>
        ) : (
          <>
            <Grid container spacing={3}>
              {displayedAgents.map((agent) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={agent.id}>
                  <AgentCard
                    agent={agent}
                    onEdit={handleEditAgent}
                    onChat={handleChatWithAgent}
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
                  Page {pagination.page} of {pagination.total_pages} ({pagination.total} total agents)
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

      {/* Main Content Grid */}
      <Grid container spacing={3}>
        {/* Recent Conversations */}
        <Grid item xs={12} md={6}>
          <Card sx={{ 
            height: '100%',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Recent Conversations
                </Typography>
                <Avatar sx={{ 
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  color: theme.palette.primary.main,
                  width: 32,
                  height: 32
                }}>
                  <MessageSquare size={16} />
                </Avatar>
              </Box>
              <List sx={{ p: 0 }}>
                {recentConversations.length > 0 ? (
                  recentConversations.map((conversation, index) => (
                    <React.Fragment key={conversation.id}>
                      <ConversationItem
                        conversation={conversation}
                        onClick={handleConversationClick}
                      />
                      {index < recentConversations.length - 1 && <Divider />}
                    </React.Fragment>
                  ))
                ) : (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <MessageSquare size={48} color={theme.palette.text.secondary} style={{ marginBottom: 16 }} />
                    <Typography variant="body2" color="text.secondary">
                      No recent conversations
                    </Typography>
                  </Box>
                )}
              </List>
            </CardContent>
            <CardActions sx={{ justifyContent: 'center' }}>
              <Button size="small" color="primary" onClick={handleViewAllConversations}>
                View All Conversations
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Task Progress */}
        <Grid item xs={12} md={6}>
          <Card sx={{ 
            height: '100%',
            background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${alpha(theme.palette.divider, 0.1)}`
          }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Task Progress
                </Typography>
                <Avatar sx={{ 
                  backgroundColor: alpha(theme.palette.secondary.main, 0.1),
                  color: theme.palette.secondary.main,
                  width: 32,
                  height: 32
                }}>
                  <Activity size={16} />
                </Avatar>
              </Box>
              <Box sx={{ mt: 2 }}>
                {taskProgress.length > 0 ? (
                  taskProgress.map((task, index) => (
                    <TaskProgressItem key={index} task={task} />
                  ))
                ) : (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Activity size={48} color={theme.palette.text.secondary} style={{ marginBottom: 16 }} />
                    <Typography variant="body2" color="text.secondary">
                      No active tasks
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
            <CardActions sx={{ justifyContent: 'center' }}>
              <Button size="small" color="primary">
                View All Tasks
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
