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
  Paper,
  useTheme,
  alpha,
  CircularProgress
} from '@mui/material'
import {
  Bot,
  MessageSquare,
  Plus,
  Edit,
  Settings,
  ArrowLeft,
  ArrowRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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

export default function AgentHome({ user }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [agents, setAgents] = useState([])
  const [displayedAgents, setDisplayedAgents] = useState([])

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

  // Separate function to fetch agents data
  const fetchAgentsData = async (page = 1, pageSize = 8) => {
    if (!isMountedRef.current) return;
    if (isLoadingRef.current) return;
    try {
      isLoadingRef.current = true;
      setLoading(true)

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

      if (!isMountedRef.current) return;

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
    isMountedRef.current = true;
    const fetchInitialData = async () => {
      if (!isMountedRef.current) return;
      try {
        await fetchAgentsData(pagination.page, pagination.page_size)
      } catch (error) {
        console.error('Failed to fetch Agent Home data:', error)
      }
    }

    fetchInitialData()
    return () => {
      isMountedRef.current = false;
      isLoadingRef.current = false;
    };
  }, [])

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
          Loading agents...
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
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
          Agents
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
    </Box>
  )
}
