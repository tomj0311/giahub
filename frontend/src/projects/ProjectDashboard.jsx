import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  LinearProgress,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  CircularProgress
} from '@mui/material'
import {
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  Users,
  FolderOpen
} from 'lucide-react'
import { apiCall } from '../config/api'
import { useSnackbar } from '../contexts/SnackbarContext'

function ProjectDashboard({ user, projectId }) {
  const token = user?.token
  const { showError } = useSnackbar()

  const [project, setProject] = useState(null)
  const [activities, setActivities] = useState([])
  const [stats, setStats] = useState({
    totalActivities: 0,
    completedActivities: 0,
    overdueTasks: 0,
    upcomingMilestones: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboardData()
  }, [projectId])

  const loadDashboardData = async () => {
    setLoading(true)
    try {
      // Load project details
      if (projectId) {
        const projectRes = await apiCall(`/api/projects/projects/${projectId}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (!projectRes.ok) {
          const error = await projectRes.json()
          throw new Error(error.detail || 'Failed to load project')
        }
        
        const projectData = await projectRes.json()
        setProject(projectData)

        // Load activities for this project
        const activitiesRes = await apiCall(`/api/projects/activities?project_id=${projectId}&page_size=100`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (!activitiesRes.ok) {
          const error = await activitiesRes.json()
          throw new Error(error.detail || 'Failed to load activities')
        }
        
        const activitiesData = await activitiesRes.json()

        const activityList = activitiesData.activities || []
        setActivities(activityList)

        // Calculate stats
        const completed = activityList.filter(a => a.status === 'Completed').length
        const overdue = activityList.filter(a => {
          if (a.due_date && a.status !== 'Completed') {
            return new Date(a.due_date) < new Date()
          }
          return false
        }).length
        const upcomingMilestones = activityList.filter(a => {
          if (a.type === 'MILESTONE' && a.status !== 'Completed') {
            const dueDate = new Date(a.due_date)
            const today = new Date()
            const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
            return diffDays >= 0 && diffDays <= 30
          }
          return false
        }).length

        setStats({
          totalActivities: activityList.length,
          completedActivities: completed,
          overdueTasks: overdue,
          upcomingMilestones: upcomingMilestones
        })
      }
    } catch (error) {
      showError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!project) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Select a project to view dashboard
        </Typography>
      </Box>
    )
  }

  const completionRate = stats.totalActivities > 0
    ? Math.round((stats.completedActivities / stats.totalActivities) * 100)
    : 0

  const upcomingActivities = activities
    .filter(a => a.status !== 'Completed' && a.due_date)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5)

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Project Dashboard
      </Typography>

      {/* Project Overview */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">{project.name}</Typography>
            <Chip
              label={project.status}
              color={project.status === 'COMPLETED' ? 'success' : 'primary'}
            />
          </Box>
          {project.description && (
            <Typography variant="body2" color="text.secondary" paragraph>
              {project.description}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
            {project.assignee && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Assignee
                </Typography>
                <Typography variant="body2">{project.assignee}</Typography>
              </Box>
            )}
            {project.due_date && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Due Date
                </Typography>
                <Typography variant="body2">
                  {new Date(project.due_date).toLocaleDateString()}
                </Typography>
              </Box>
            )}
            <Box>
              <Typography variant="caption" color="text.secondary">
                Priority
              </Typography>
              <Typography variant="body2">{project.priority}</Typography>
            </Box>
          </Box>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              Overall Progress: {project.progress}%
            </Typography>
            <LinearProgress variant="determinate" value={project.progress} />
          </Box>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <FolderOpen size={24} color="#1976d2" />
              <Typography variant="h6">{stats.totalActivities}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Total Activities
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <CheckCircle size={24} color="#2e7d32" />
              <Typography variant="h6">{stats.completedActivities}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Completed ({completionRate}%)
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AlertCircle size={24} color="#d32f2f" />
              <Typography variant="h6">{stats.overdueTasks}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Overdue Tasks
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <TrendingUp size={24} color="#ed6c02" />
              <Typography variant="h6">{stats.upcomingMilestones}</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Upcoming Milestones
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Upcoming Activities */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Upcoming Activities
          </Typography>
          {upcomingActivities.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No upcoming activities
            </Typography>
          ) : (
            <List>
              {upcomingActivities.map((activity, index) => (
                <React.Fragment key={activity.id}>
                  {index > 0 && <Divider />}
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight="medium">
                            {activity.subject}
                          </Typography>
                          <Chip label={activity.type} size="small" variant="outlined" />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            Due: {new Date(activity.due_date).toLocaleDateString()}
                          </Typography>
                          <Chip label={activity.status} size="small" />
                          {activity.assignee && (
                            <Typography variant="caption" color="text.secondary">
                              Assignee: {activity.assignee}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}

export default React.memo(ProjectDashboard)
