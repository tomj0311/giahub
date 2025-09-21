import React, { useState, useEffect } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Avatar,
  useTheme,
  alpha,
  Fade,
  Slide
} from '@mui/material'
import { 
  MessageSquare, 
  Clock, 
  Zap, 
  TrendingUp,
  CheckCircle,
  XCircle,
  Cpu,
  Activity,
  BarChart3,
  Users
} from 'lucide-react'
import sharedApiService from '../utils/apiService'

// Dynamic metric card configurations
const getMetricConfig = (type, theme) => {
  const configs = {
    conversations: {
      title: 'Total Conversations',
      icon: MessageSquare,
      gradient: `linear-gradient(135deg, ${theme.palette.primary.main}15, ${theme.palette.primary.main}25)`,
      color: theme.palette.primary.main,
      iconBg: alpha(theme.palette.primary.main, 0.1)
    },
    completion: {
      title: 'Completion Rate',
      icon: CheckCircle,
      gradient: `linear-gradient(135deg, ${theme.palette.success.main}15, ${theme.palette.success.main}25)`,
      color: theme.palette.success.main,
      iconBg: alpha(theme.palette.success.main, 0.1)
    },
    response_time: {
      title: 'Avg Response Time',
      icon: Clock,
      gradient: `linear-gradient(135deg, ${theme.palette.warning.main}15, ${theme.palette.warning.main}25)`,
      color: theme.palette.warning.main,
      iconBg: alpha(theme.palette.warning.main, 0.1)
    },
    tokens: {
      title: 'Avg Tokens',
      icon: Zap,
      gradient: `linear-gradient(135deg, ${theme.palette.info.main}15, ${theme.palette.info.main}25)`,
      color: theme.palette.info.main,
      iconBg: alpha(theme.palette.info.main, 0.1)
    },
    total_tokens: {
      title: 'Total Tokens Consumed',
      icon: Cpu,
      gradient: `linear-gradient(135deg, ${theme.palette.secondary.main}15, ${theme.palette.secondary.main}25)`,
      color: theme.palette.secondary.main,
      iconBg: alpha(theme.palette.secondary.main, 0.1)
    }
  }
  return configs[type] || configs.conversations
}

// Enhanced Metric Card Component
const MetricCard = ({ type, value, subtitle, delay = 0 }) => {
  const theme = useTheme()
  const config = getMetricConfig(type, theme)
  const Icon = config.icon

  return (
    <Card 
      sx={{ 
        height: '100%'
      }}
    >
        <CardContent sx={{ 
          p: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <Box display="flex" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1 }}>
            <Box flex={1} sx={{ minWidth: 0, pr: 1 }}>
              <Typography 
                color="text.secondary" 
                gutterBottom 
                variant="subtitle2"
                sx={{ 
                  fontWeight: 'medium',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  mb: 1
                }}
              >
                {config.title}
              </Typography>
            </Box>
            <Avatar
              sx={{
                backgroundColor: config.color,
                color: 'white',
                width: 40,
                height: 40
              }}
            >
              <Icon size={20} />
            </Avatar>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography 
              variant="h4" 
              component="div" 
              sx={{ 
                color: config.color,
                fontWeight: 'bold',
                mb: subtitle ? 1 : 0,
                fontSize: '1.4rem'
              }}
            >
              {value}
            </Typography>
            {subtitle && (
              <Typography 
                variant="body2" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem'
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
  )
}

// Enhanced Agent Performance Table Component
const AgentPerformanceTable = ({ agents, loading }) => {
  const theme = useTheme()
  
  const getPerformanceColor = (value, max, type = 'default') => {
    const ratio = value / max
    if (type === 'time') {
      // Lower is better for response time
      return ratio < 0.3 ? theme.palette.success.main : 
             ratio < 0.7 ? theme.palette.warning.main : 
             theme.palette.error.main
    }
    // Higher is better for conversations and tokens
    return ratio > 0.7 ? theme.palette.success.main : 
           ratio > 0.3 ? theme.palette.warning.main : 
           theme.palette.error.main
  }

  const maxConversations = Math.max(...agents.map(a => a.total_conversations), 1)
  const maxResponseTime = Math.max(...agents.map(a => parseFloat(a.avg_response_time) || 0), 1)
  const maxTokens = Math.max(...agents.map(a => a.total_tokens || a.avg_tokens), 1)

  return (
    <Fade in={true} timeout={theme.transitions.duration.enteringScreen + 200}>
      <Card sx={{ 
        background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${theme.custom?.colors?.borderColor || alpha(theme.palette.divider, 0.1)}`
      }}>
        <CardContent sx={{ p: theme.spacing(3) }}>
          <Box display="flex" alignItems="center" mb={2} sx={{ width: '100%' }}>
            <Avatar sx={{ 
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
              mr: 2,
              width: theme.spacing(5),
              height: theme.spacing(5),
              flexShrink: 0
            }}>
              <BarChart3 size={theme.spacing(2.5)} />
            </Avatar>
            <Typography 
              variant="h6" 
              sx={{ 
                fontWeight: theme.typography.fontWeightSemiBold,
                color: theme.palette.text.primary,
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'visible'
              }}
            >
              Top Performing Agents
            </Typography>
          </Box>
          {loading ? (
            <Box display="flex" justifyContent="center" p={theme.spacing(4)}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ 
              backgroundColor: 'transparent',
              '& .MuiTable-root': {
                minWidth: 'auto'
              }
            }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ 
                    '& .MuiTableCell-head': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.05),
                      fontWeight: theme.typography.fontWeightSemiBold,
                      textTransform: 'uppercase',
                      fontSize: '0.75rem',
                      letterSpacing: '0.5px',
                      borderBottom: `2px solid ${alpha(theme.palette.primary.main, 0.1)}`
                    }
                  }}>
                    <TableCell>Agent Name</TableCell>
                    <TableCell align="right">Conversations</TableCell>
                    <TableCell align="right">Avg Response Time</TableCell>
                    <TableCell align="right">Total Tokens</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agents.map((agent, index) => (
                    <TableRow 
                      key={index}
                      sx={{ 
                        '&:hover': {
                          backgroundColor: alpha(theme.palette.primary.main, 0.04),
                        },
                        '& .MuiTableCell-root': {
                          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`
                        }
                      }}
                    >
                      <TableCell sx={{ 
                        fontWeight: theme.typography.fontWeightMedium,
                        color: theme.palette.text.primary
                      }}>
                        {agent.agent_name}
                      </TableCell>
                      <TableCell align="right">
                        <Box display="flex" alignItems="center" justifyContent="flex-end">
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              color: getPerformanceColor(agent.total_conversations, maxConversations),
                              fontWeight: theme.typography.fontWeightMedium,
                              mr: 1
                            }}
                          >
                            {agent.total_conversations}
                          </Typography>
                          <Box
                            sx={{
                              width: theme.spacing(6),
                              height: theme.spacing(0.5),
                              backgroundColor: alpha(theme.palette.divider, 0.2),
                              borderRadius: theme.custom?.borderRadius?.pill || theme.shape.borderRadius,
                              overflow: 'hidden'
                            }}
                          >
                            <Box
                              sx={{
                                width: `${((agent.total_tokens || agent.avg_tokens) / maxTokens) * 100}%`,
                                height: '100%',
                                backgroundColor: getPerformanceColor(agent.total_tokens || agent.avg_tokens, maxTokens),
                                borderRadius: 'inherit'
                              }}
                            />
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            color: getPerformanceColor(parseFloat(agent.avg_response_time) || 0, maxResponseTime, 'time'),
                            fontWeight: theme.typography.fontWeightMedium
                          }}
                        >
                          {agent.avg_response_time}s
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            color: getPerformanceColor(agent.total_tokens || agent.avg_tokens, maxTokens),
                            fontWeight: theme.typography.fontWeightMedium
                          }}
                        >
                          {(agent.total_tokens || agent.avg_tokens)?.toLocaleString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Fade>
  )
}

// Enhanced Recent Conversations Table Component
const RecentConversationsTable = ({ conversations, loading }) => {
  const theme = useTheme()
  
  const getStatusConfig = (completed) => {
    if (completed) {
      return {
        color: theme.palette.success.main,
        bgcolor: alpha(theme.palette.success.main, 0.1),
        icon: CheckCircle,
        label: 'Completed'
      }
    }
    return {
      color: theme.palette.warning.main,
      bgcolor: alpha(theme.palette.warning.main, 0.1),
      icon: XCircle,
      label: 'Pending'
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <Fade in={true} timeout={theme.transitions.duration.enteringScreen + 400}>
      <Card sx={{ 
        background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${theme.custom?.colors?.borderColor || alpha(theme.palette.divider, 0.1)}`
      }}>
        <CardContent sx={{ p: theme.spacing(3) }}>
          <Box display="flex" alignItems="center" mb={2} sx={{ width: '100%' }}>
            <Avatar sx={{ 
              backgroundColor: alpha(theme.palette.secondary.main, 0.1),
              color: theme.palette.secondary.main,
              mr: 2,
              width: theme.spacing(5),
              height: theme.spacing(5),
              flexShrink: 0
            }}>
              <Activity size={theme.spacing(2.5)} />
            </Avatar>
            <Typography 
              variant="h6" 
              sx={{ 
                fontWeight: theme.typography.fontWeightSemiBold,
                color: theme.palette.text.primary,
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'visible'
              }}
            >
              Recent Conversations
            </Typography>
          </Box>
          {loading ? (
            <Box display="flex" justifyContent="center" p={theme.spacing(4)}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} elevation={0} sx={{ 
              backgroundColor: 'transparent',
              '& .MuiTable-root': {
                minWidth: 'auto'
              }
            }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ 
                    '& .MuiTableCell-head': {
                      backgroundColor: alpha(theme.palette.secondary.main, 0.05),
                      fontWeight: theme.typography.fontWeightSemiBold,
                      textTransform: 'uppercase',
                      fontSize: '0.75rem',
                      letterSpacing: '0.5px',
                      borderBottom: `2px solid ${alpha(theme.palette.secondary.main, 0.1)}`
                    }
                  }}>
                    <TableCell>Agent</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Tokens</TableCell>
                    <TableCell align="right">Response Time</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {conversations.map((conv) => {
                    const statusConfig = getStatusConfig(conv.completed)
                    const StatusIcon = statusConfig.icon
                    
                    return (
                      <TableRow 
                        key={conv.id}
                        sx={{ 
                          '&:hover': {
                            backgroundColor: alpha(theme.palette.secondary.main, 0.04),
                          },
                          '& .MuiTableCell-root': {
                            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`
                          }
                        }}
                      >
                        <TableCell sx={{ 
                          fontWeight: theme.typography.fontWeightMedium,
                          color: theme.palette.text.primary
                        }}>
                          {conv.agent_name}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            icon={<StatusIcon size={theme.spacing(2)} />}
                            label={statusConfig.label}
                            sx={{
                              color: statusConfig.color,
                              backgroundColor: statusConfig.bgcolor,
                              borderColor: statusConfig.color,
                              fontWeight: theme.typography.fontWeightMedium,
                              fontSize: '0.75rem',
                              '& .MuiChip-icon': {
                                color: 'inherit'
                              }
                            }}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: theme.typography.fontWeightMedium,
                              color: theme.palette.info.main
                            }}
                          >
                            {conv.total_tokens?.toLocaleString() || '0'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: theme.typography.fontWeightMedium,
                              color: theme.palette.warning.main
                            }}
                          >
                            {conv.response_time}s
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              color: theme.custom?.colors?.textMuted || theme.palette.text.secondary,
                              fontSize: '0.8rem'
                            }}
                          >
                            {formatDate(conv.created_at)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Fade>
  )
}

// Main Analytics Component
const Analytics = () => {
  const [overview, setOverview] = useState(null)
  const [agents, setAgents] = useState([])
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const theme = useTheme()

  // Enhanced loading component
  const LoadingComponent = () => (
    <Box 
      display="flex" 
      flexDirection="column"
      justifyContent="center" 
      alignItems="center" 
      minHeight="60vh"
      sx={{
        background: `linear-gradient(135deg, ${alpha(theme.palette.background.default, 0.8)}, ${alpha(theme.palette.background.default, 0.95)})`,
        backdropFilter: 'blur(10px)'
      }}
    >
      <CircularProgress 
        size={theme.spacing(8)} 
        thickness={4}
        sx={{ 
          color: theme.palette.primary.main,
          mb: 2
        }}
      />
      <Typography 
        variant="h6" 
        sx={{ 
          color: theme.custom?.colors?.textMuted || theme.palette.text.secondary,
          fontWeight: theme.typography.fontWeightMedium
        }}
      >
        Loading Analytics...
      </Typography>
    </Box>
  )

  // Enhanced error component
  const ErrorComponent = () => (
    <Fade in={true} timeout={theme.transitions.duration.enteringScreen}>
      <Box p={theme.spacing(3)}>
        <Alert 
          severity="error"
          sx={{
            backgroundColor: alpha(theme.palette.error.main, 0.1),
            color: theme.palette.error.main,
            border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
            borderRadius: theme.custom?.borderRadius?.standard || theme.shape.borderRadius,
            '& .MuiAlert-icon': {
              color: theme.palette.error.main
            }
          }}
        >
          {error}
        </Alert>
      </Box>
    </Fade>
  )

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      try {
        console.log('[Analytics] Starting to fetch analytics data...')
        setLoading(true)
        setError(null)

        const [overviewResult, agentsResult, conversationsResult] = await Promise.all([
          sharedApiService.makeRequest(
            '/api/analytics/overview',
            {},
            { endpoint: 'overview' }
          ),
          sharedApiService.makeRequest(
            '/api/analytics/agent-performance?limit=10',
            {},
            { endpoint: 'agent-performance', limit: 10 }
          ),
          sharedApiService.makeRequest(
            '/api/analytics/recent-conversations?limit=10',
            {},
            { endpoint: 'recent-conversations', limit: 10 }
          )
        ])

        console.log('[Analytics] Raw API results:', { overviewResult, agentsResult, conversationsResult })

        if (overviewResult.success) {
          // Extract the actual data from the nested structure
          const overviewData = overviewResult.data?.data || overviewResult.data
          console.log('[Analytics] Overview data:', overviewData)
          setOverview(overviewData)
        } else {
          throw new Error(overviewResult.error || 'Failed to load overview metrics')
        }

        if (agentsResult.success) {
          // Extract the actual data from the nested structure  
          const agentsData = agentsResult.data?.data || agentsResult.data
          console.log('[Analytics] Agents data:', agentsData)
          setAgents(Array.isArray(agentsData) ? agentsData : [])
        } else {
          throw new Error(agentsResult.error || 'Failed to load agent performance')
        }

        if (conversationsResult.success) {
          // Extract the actual data from the nested structure
          const conversationsData = conversationsResult.data?.data || conversationsResult.data
          console.log('[Analytics] Conversations data:', conversationsData)
          setConversations(Array.isArray(conversationsData) ? conversationsData : [])
        } else {
          throw new Error(conversationsResult.error || 'Failed to load recent conversations')
        }
        
        console.log('[Analytics] Successfully loaded all data')
      } catch (err) {
        console.error('Error fetching analytics data:', err)
        setError('Failed to load analytics data. Please try again.')
      } finally {
        console.log('[Analytics] Setting loading to false')
        setLoading(false)
      }
    }

    fetchAnalyticsData()
  }, [])

  if (loading && !overview) {
    return <LoadingComponent />
  }

  if (error) {
    return <ErrorComponent />
  }

  // Metric configurations with dynamic values
  const metricConfigs = [
    {
      type: 'conversations',
      value: overview?.total_conversations || 0,
      subtitle: null,
      delay: 0
    },
    {
      type: 'completion',
      value: `${overview?.completion_rate || 0}%`,
      subtitle: `${overview?.completed_conversations || 0} completed`,
      delay: 100
    },
    {
      type: 'response_time',
      value: `${overview?.avg_response_time || 0}s`,
      subtitle: 'Per conversation',
      delay: 200
    },
    {
      type: 'tokens',
      value: overview?.avg_total_tokens || 0,
      subtitle: `${overview?.avg_input_tokens || 0} input, ${overview?.avg_output_tokens || 0} output`,
      delay: 300
    },
    {
      type: 'total_tokens',
      value: overview?.total_tokens_consumed?.toLocaleString() || 0,
      subtitle: `${overview?.total_input_tokens_consumed?.toLocaleString() || 0} input, ${overview?.total_output_tokens_consumed?.toLocaleString() || 0} output`,
      delay: 400
    }
  ]

  return (
    <Box 
      sx={{ 
        p: theme.custom?.layout?.pageY || 3,
        background: theme.custom?.backgroundGradient || theme.palette.background.default,
        minHeight: '100vh'
      }}
    >
      <Fade in={true} timeout={theme.transitions.duration.enteringScreen}>
        <Box>
          <Box display="flex" alignItems="center" mb={theme.custom?.layout?.section || 4} sx={{ width: '100%' }}>
            <Avatar sx={{ 
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
              mr: 2,
              width: theme.spacing(6),
              height: theme.spacing(6),
              flexShrink: 0
            }}>
              <TrendingUp size={theme.spacing(3)} />
            </Avatar>
            <Typography 
              variant="h4" 
              sx={{
                fontWeight: theme.typography.fontWeightBold,
                color: theme.palette.text.primary,
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'visible',
                fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
              }}
            >
              Analytics Dashboard
            </Typography>
          </Box>
          
          {/* Overview Metrics */}
          <Grid 
            container 
            spacing={theme.custom?.layout?.block || 3} 
            sx={{ mb: theme.custom?.layout?.section || 4 }}
          >
            {metricConfigs.map((config, index) => (
              <Grid 
                item 
                xs={12} 
                sm={6} 
                md={4} 
                lg={2.4} 
                xl={2.4}
                key={config.type}
              >
                <MetricCard {...config} />
              </Grid>
            ))}
          </Grid>

          {/* Tables */}
          <Grid container spacing={theme.custom?.layout?.block || 3}>
            <Grid item xs={12} xl={6}>
              <AgentPerformanceTable agents={agents} loading={loading} />
            </Grid>
            <Grid item xs={12} xl={6}>
              <RecentConversationsTable conversations={conversations} loading={loading} />
            </Grid>
          </Grid>
        </Box>
      </Fade>
    </Box>
  )
}

export default Analytics