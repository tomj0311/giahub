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
  Alert
} from '@mui/material'
import { 
  MessageSquare, 
  Clock, 
  Zap, 
  TrendingUp,
  CheckCircle,
  XCircle
} from 'lucide-react'
import AnalyticsService from '../services/analyticsService'

// Metric Card Component
const MetricCard = ({ title, value, subtitle, icon: Icon, color = "primary" }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Box>
          <Typography color="textSecondary" gutterBottom variant="subtitle2">
            {title}
          </Typography>
          <Typography variant="h4" component="div" color={color}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="textSecondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Icon size={40} color="currentColor" style={{ opacity: 0.7 }} />
      </Box>
    </CardContent>
  </Card>
)

// Agent Performance Table Component
const AgentPerformanceTable = ({ agents, loading }) => (
  <Card>
    <CardContent>
      <Typography variant="h6" gutterBottom>
        Top Performing Agents
      </Typography>
      {loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Agent Name</TableCell>
                <TableCell align="right">Conversations</TableCell>
                <TableCell align="right">Avg Response Time</TableCell>
                <TableCell align="right">Avg Tokens</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {agents.map((agent, index) => (
                <TableRow key={index}>
                  <TableCell>{agent.agent_name}</TableCell>
                  <TableCell align="right">{agent.total_conversations}</TableCell>
                  <TableCell align="right">{agent.avg_response_time}s</TableCell>
                  <TableCell align="right">{agent.avg_tokens}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </CardContent>
  </Card>
)

// Recent Conversations Table Component
const RecentConversationsTable = ({ conversations, loading }) => (
  <Card>
    <CardContent>
      <Typography variant="h6" gutterBottom>
        Recent Conversations
      </Typography>
      {loading ? (
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Agent</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Tokens</TableCell>
                <TableCell align="right">Response Time</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {conversations.map((conv) => (
                <TableRow key={conv.id}>
                  <TableCell>{conv.agent_name}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      icon={conv.completed ? <CheckCircle size={16} /> : <XCircle size={16} />}
                      label={conv.completed ? 'Completed' : 'Pending'}
                      color={conv.completed ? 'success' : 'warning'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">{conv.total_tokens}</TableCell>
                  <TableCell align="right">{conv.response_time}s</TableCell>
                  <TableCell>
                    {conv.created_at ? new Date(conv.created_at).toLocaleDateString() : 'N/A'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </CardContent>
  </Card>
)

// Main Analytics Component
const Analytics = () => {
  const [overview, setOverview] = useState(null)
  const [agents, setAgents] = useState([])
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      try {
        setLoading(true)
        setError(null)

        const [overviewData, agentsData, conversationsData] = await Promise.all([
          AnalyticsService.getOverviewMetrics(),
          AnalyticsService.getAgentPerformance(10),
          AnalyticsService.getRecentConversations(10)
        ])

        setOverview(overviewData)
        setAgents(agentsData)
        setConversations(conversationsData)
      } catch (err) {
        console.error('Error fetching analytics data:', err)
        setError('Failed to load analytics data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchAnalyticsData()
  }, [])

  if (loading && !overview) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
      </Box>
    )
  }

  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error">{error}</Alert>
      </Box>
    )
  }

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Analytics Dashboard
      </Typography>
      
      {/* Overview Metrics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Total Conversations"
            value={overview?.total_conversations || 0}
            icon={MessageSquare}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Completion Rate"
            value={`${overview?.completion_rate || 0}%`}
            subtitle={`${overview?.completed_conversations || 0} completed`}
            icon={CheckCircle}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg Response Time"
            value={`${overview?.avg_response_time || 0}s`}
            subtitle="Per conversation"
            icon={Clock}
            color="warning"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Avg Tokens"
            value={overview?.avg_total_tokens || 0}
            subtitle={`${overview?.avg_input_tokens || 0} input, ${overview?.avg_output_tokens || 0} output`}
            icon={Zap}
            color="info"
          />
        </Grid>
      </Grid>

      {/* Tables */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={6}>
          <AgentPerformanceTable agents={agents} loading={loading} />
        </Grid>
        <Grid item xs={12} lg={6}>
          <RecentConversationsTable conversations={conversations} loading={loading} />
        </Grid>
      </Grid>
    </Box>
  )
}

export default Analytics