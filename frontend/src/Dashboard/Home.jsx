import React, { useState, useEffect } from 'react'
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
  LinearProgress
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
  Play
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiCall } from '../config/api'

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
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Avatar 
            sx={{ 
              bgcolor: `${getStatusColor(agent.category)}.main`,
              width: 40, 
              height: 40,
              fontSize: '0.875rem'
            }}
          >
            {getAvatarText(agent.name)}
          </Avatar>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(agent); }}>
            <Edit size={16} />
          </IconButton>
        </Box>

        <Typography variant="h6" fontWeight="bold" gutterBottom noWrap>
          {agent.name || 'Unnamed Agent'}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
          {agent.description || 'No description available'}
        </Typography>

        {agent.category && (
          <Chip
            label={agent.category}
            size="small"
            color={getStatusColor(agent.category)}
            variant="outlined"
            sx={{ mb: 1 }}
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

      <CardActions sx={{ pt: 0, justifyContent: 'center' }}>
        <Button 
          size="small" 
          color="primary" 
          startIcon={<MessageSquare size={16} />}
          onClick={() => onChat(agent)}
          fullWidth
          variant="contained"
        >
          Chat
        </Button>
      </CardActions>
    </Card>
  )
}

function ConversationItem({ conversation }) {
  return (
    <ListItem>
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
  const [agents, setAgents] = useState([])
  const [displayedAgents, setDisplayedAgents] = useState([])
  const [recentConversations, setRecentConversations] = useState([])
  const [taskProgress, setTaskProgress] = useState([])
  const [showAll, setShowAll] = useState(false)

  const INITIAL_DISPLAY_COUNT = 8

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        
        // Fetch agents - EXACT ModelConfig pattern
        const agentsResponse = await apiCall('/api/agents', {
          headers: {
            ...(user?.token ? { 'Authorization': `Bearer ${user?.token}` } : {})
          }
        })

        console.log('🔍 AGENTS API RESPONSE:', agentsResponse.status, agentsResponse.ok)
        
        if (agentsResponse.ok) {
          const agentsData = await agentsResponse.json()
          console.log('📄 AGENTS DATA:', agentsData)
          const agentsList = agentsData.agents || []
          console.log('📋 AGENTS LIST:', agentsList)
          setAgents(agentsList)
          setDisplayedAgents(agentsList.slice(0, INITIAL_DISPLAY_COUNT))
        } else {
          console.log('❌ AGENTS API FAILED:', agentsResponse.status)
          const errorData = await agentsResponse.json().catch(() => ({}))
          console.log('💥 ERROR DATA:', errorData)
        }

        // Fetch recent conversations - Use agent runtime endpoint
        try {
          const conversationsResponse = await apiCall('/api/agent-runtime/conversations', {
            headers: {
              ...(user?.token ? { 'Authorization': `Bearer ${user?.token}` } : {})
            }
          })
          
          if (conversationsResponse.ok) {
            const conversationsData = await conversationsResponse.json()
            // Get the most recent 5 conversations and format them for display
            const allConversations = conversationsData.conversations || []
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
        setAgents([])
        setDisplayedAgents([])
        setRecentConversations([])
        setTaskProgress([])
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [user?.token])

  const handleShowMore = () => {
    setShowAll(true)
    setDisplayedAgents(agents)
  }

  const handleEditAgent = (agent) => {
    navigate('/dashboard/agent-config')
  }

  const handleChatWithAgent = (agent) => {
    navigate(`/dashboard/agent-playground?agent=${agent.name}`)
  }

  const handleCreateAgent = () => {
    navigate('/dashboard/agent-config')
  }

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 2 }}>
        <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
          Loading dashboard...
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      {/* Welcome Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Welcome back, {user?.name || 'User'}! 🤖
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
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Bot size={48} color={theme.palette.text.secondary} style={{ marginBottom: 16 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No agents created yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Create your first AI agent to get started
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Plus size={16} />}
              onClick={handleCreateAgent}
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
            
            {!showAll && agents.length > INITIAL_DISPLAY_COUNT && (
              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleShowMore}
                >
                  Show More ({agents.length - INITIAL_DISPLAY_COUNT} more agents)
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
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Recent Conversations
                </Typography>
                <MessageSquare color="action" />
              </Box>
              <List sx={{ p: 0 }}>
                {recentConversations.length > 0 ? (
                  recentConversations.map((conversation, index) => (
                    <React.Fragment key={conversation.id}>
                      <ConversationItem conversation={conversation} />
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
              <Button size="small" color="primary">
                View All Conversations
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Task Progress */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Task Progress
                </Typography>
                <Activity color="action" />
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
