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
  useTheme
} from '@mui/material'
import {
  TrendingUp,
  Users as PeopleIcon,
  FileBarChart as AssessmentIcon,
  DollarSign as MoneyIcon,
  Bell as NotificationsIcon,
  MoreVertical as MoreVertIcon,
  ArrowUpRight as ArrowUpwardIcon,
  ArrowDownRight as ArrowDownwardIcon
} from 'lucide-react'

// Mock data for dashboard metrics
const dashboardMetrics = [
  {
    title: 'Total Revenue',
    value: '$45,210',
    change: '+12.5%',
    trend: 'up',
    icon: <MoneyIcon size={18} />,
    color: 'success'
  },
  {
    title: 'Active Users',
    value: '2,847',
    change: '+8.2%',
    trend: 'up',
    icon: <PeopleIcon size={18} />,
    color: 'primary'
  },
  {
    title: 'Conversion Rate',
    value: '3.42%',
    change: '-2.1%',
    trend: 'down',
    icon: <TrendingUp size={18} />,
    color: 'warning'
  },
  {
    title: 'Monthly Reports',
    value: '127',
    change: '+15.3%',
    trend: 'up',
    icon: <AssessmentIcon size={18} />,
    color: 'info'
  }
]

// Mock recent activities
const recentActivities = [
  {
    id: 1,
    user: 'John Doe',
    action: 'Created new project',
    time: '2 hours ago',
    avatar: 'JD'
  },
  {
    id: 2,
    user: 'Sarah Johnson',
    action: 'Updated client report',
    time: '4 hours ago',
    avatar: 'SJ'
  },
  {
    id: 3,
    user: 'Mike Wilson',
    action: 'Completed consultation',
    time: '6 hours ago',
    avatar: 'MW'
  },
  {
    id: 4,
    user: 'Emily Chen',
    action: 'Submitted proposal',
    time: '1 day ago',
    avatar: 'EC'
  }
]

// Mock project progress data
const projectProgress = [
  { name: 'Website Redesign', progress: 75, status: 'On Track' },
  { name: 'Mobile App Development', progress: 45, status: 'In Progress' },
  { name: 'SEO Optimization', progress: 90, status: 'Nearly Complete' },
  { name: 'Data Migration', progress: 30, status: 'Starting' }
]

function MetricCard({ metric }) {
  const theme = useTheme()

  return (
    <Card sx={{ height: '100%', position: 'relative', overflow: 'visible' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{
            p: 1,
            borderRadius: 2,
            bgcolor: `${metric.color}.main`,
            color: 'white',
            display: 'flex',
            alignItems: 'center'
          }}>
            {metric.icon}
          </Box>
          <IconButton size="small">
            <MoreVertIcon size={18} />
          </IconButton>
        </Box>

        <Typography variant="h4" fontWeight="bold" gutterBottom>
          {metric.value}
        </Typography>

        <Typography variant="body2" color="text.secondary" gutterBottom>
          {metric.title}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          {metric.trend === 'up' ? (
            <ArrowUpwardIcon size={16} style={{ color: 'var(--mui-palette-success-main)' }} />
          ) : (
            <ArrowDownwardIcon size={16} style={{ color: 'var(--mui-palette-error-main)' }} />
          )}
          <Typography
            variant="caption"
            sx={{
              ml: 0.5,
              color: metric.trend === 'up' ? 'success.main' : 'error.main',
              fontWeight: 'medium'
            }}
          >
            {metric.change}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            vs last month
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

function ActivityItem({ activity }) {
  return (
    <ListItem>
      <ListItemAvatar>
        <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.875rem' }}>
          {activity.avatar}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={
          <Typography variant="body2">
            <strong>{activity.user}</strong> {activity.action}
          </Typography>
        }
        secondary={activity.time}
      />
    </ListItem>
  )
}

function ProjectProgressItem({ project }) {
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
          {project.name}
        </Typography>
        <Chip
          label={project.status}
          size="small"
          color={getStatusColor(project.status)}
          variant="outlined"
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: 'action.hover' }} />
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 35 }}>
          {project.progress}%
        </Typography>
      </Box>
    </Box>
  )
}

export default function Home({ user }) {
  const theme = useTheme()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate data loading
    const timer = setTimeout(() => setLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

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
          Welcome back, {user?.name || 'User'}! 👋
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Here's what's happening with your projects today.
        </Typography>
      </Box>

      {/* Metrics Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {dashboardMetrics.map((metric, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <MetricCard metric={metric} />
          </Grid>
        ))}
      </Grid>

      {/* Main Content Grid */}
      <Grid container spacing={3}>
        {/* Recent Activity */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Recent Activity
                </Typography>
                <NotificationsIcon color="action" />
              </Box>
              <List sx={{ p: 0 }}>
                {recentActivities.map((activity, index) => (
                  <React.Fragment key={activity.id}>
                    <ActivityItem activity={activity} />
                    {index < recentActivities.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
            <CardActions>
              <Button size="small" color="primary">
                View All Activities
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Project Progress */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" gutterBottom>
                Project Progress
              </Typography>
              <Box sx={{ mt: 2 }}>
                {projectProgress.map((project, index) => (
                  <ProjectProgressItem key={index} project={project} />
                ))}
              </Box>
            </CardContent>
            <CardActions>
              <Button size="small" color="primary">
                View All Projects
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper variant="card" sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              Quick Actions
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', mt: 2 }}>
              <Button variant="contained" color="primary" size="medium">
                Create New Project
              </Button>
              <Button variant="outlined" color="primary" size="medium">
                Schedule Meeting
              </Button>
              <Button variant="outlined" color="primary" size="medium">
                Generate Report
              </Button>
              <Button variant="outlined" color="primary" size="medium">
                Invite Team Member
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}
