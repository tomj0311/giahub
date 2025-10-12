import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  Typography,
  Tabs,
  Tab,
  CircularProgress
} from '@mui/material'
import { Plus, Edit, Trash2, CheckCircle, Circle, Flag } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'
import { apiCall } from '../config/api'

const ACTIVITY_TYPES = ['MILESTONE', 'PHASE', 'TASK']

function ProjectPlanning({ user, projectId }) {
  const token = user?.token
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useSnackbar()
  const { showDeleteConfirmation } = useConfirmation()

  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)

  const [activities, setActivities] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    page: 0,
    rowsPerPage: 50,
    total: 0
  })
  
  // Restore tab from location state, or default to tab 0 (Milestones)
  const initialTab = location.state?.planningTab ?? 0
  const [currentTab, setCurrentTab] = useState(initialTab)

  const activityTypeFilter = ACTIVITY_TYPES[currentTab] || null

  useEffect(() => {
    isMountedRef.current = true
    
    const loadProjects = async () => {
      try {
        const res = await apiCall('/api/projects/projects?page=1&page_size=1000', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!res.ok) {
          const error = await res.json()
          console.error('[ProjectPlanning] Load failed:', error)
          return
        }

        const response = await res.json()
        console.log('[ProjectPlanning] Projects loaded:', response.projects?.length || 0, response.projects)
        if (isMountedRef.current) {
          setProjects(response.projects || [])
        }
      } catch (error) {
        console.error('[ProjectPlanning] Error:', error)
      }
    }

    loadProjects()

    return () => {
      isMountedRef.current = false
    }
  }, [token])

  useEffect(() => {
    const loadActivities = async (page = 1, pageSize = 50) => {
      if (isLoadingRef.current || !isMountedRef.current) return
      isLoadingRef.current = true
      setLoading(true)

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          page_size: pageSize.toString()
        })

        if (projectId) params.append('project_id', projectId)
        if (activityTypeFilter) params.append('activity_type', activityTypeFilter)

        const res = await apiCall(`/api/projects/activities?${params}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.detail || 'Failed to load activities')
        }

        const response = await res.json()

        if (isMountedRef.current) {
          setActivities(response.activities || [])
          setPagination({
            page: response.pagination.page - 1,
            rowsPerPage: pageSize,
            total: response.pagination.total
          })
        }
      } catch (error) {
        if (isMountedRef.current) {
          showError('Failed to load activities')
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false)
          isLoadingRef.current = false
        }
      }
    }

    loadActivities(1, pagination.rowsPerPage)
  }, [currentTab, token, projectId, activityTypeFilter, showError])
  
  const loadActivities = useCallback(async (page = 1, pageSize = 50) => {
    if (isLoadingRef.current || !isMountedRef.current) return
    isLoadingRef.current = true
    setLoading(true)

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      })

      if (projectId) params.append('project_id', projectId)
      if (activityTypeFilter) params.append('activity_type', activityTypeFilter)

      const res = await apiCall(`/api/projects/activities?${params}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to load activities')
      }

      const response = await res.json()

      if (isMountedRef.current) {
        setActivities(response.activities || [])
        setPagination({
          page: response.pagination.page - 1,
          rowsPerPage: pageSize,
          total: response.pagination.total
        })
      }
    } catch (error) {
      if (isMountedRef.current) {
        showError('Failed to load activities')
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        isLoadingRef.current = false
      }
    }
  }, [token, projectId, activityTypeFilter, showError])

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue)
  }

  const handlePageChange = (event, newPage) => {
    loadActivities(newPage + 1, pagination.rowsPerPage)
  }

  const handleRowsPerPageChange = (event) => {
    const newSize = parseInt(event.target.value, 10)
    loadActivities(1, newSize)
  }

  const openCreate = (type = 'TASK') => {
    navigate('/dashboard/projects/activity/new', {
      state: {
        type,
        projectId: projectId || '',
        returnTo: '/dashboard/projects',
        planningTab: currentTab  // Preserve current tab
      }
    })
  }

  const openEdit = (activityId) => {
    navigate(`/dashboard/projects/activity/${activityId}`, {
      state: {
        returnTo: '/dashboard/projects',
        planningTab: currentTab  // Preserve current tab
      }
    })
  }

  const deleteActivity = async (activityId, activitySubject) => {
    const confirmed = await showDeleteConfirmation(
      `Are you sure you want to delete the activity "${activitySubject}"?`,
      'This action cannot be undone.'
    )

    if (!confirmed) return

    try {
      const res = await apiCall(`/api/projects/activities/${activityId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to delete activity')
      }
      showSuccess('Activity deleted successfully')
      loadActivities(pagination.page + 1, pagination.rowsPerPage)
    } catch (error) {
      showError(error.message || 'Failed to delete activity')
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      'New': 'info',
      'In Progress': 'primary',
      'On Hold': 'warning',
      'Completed': 'success',
      'Cancelled': 'error'
    }
    return colors[status] || 'default'
  }

  const getTypeIcon = (type) => {
    const icons = {
      MILESTONE: <Flag size={18} />,
      PHASE: <Circle size={18} />,
      TASK: <CheckCircle size={18} />
    }
    return icons[type] || <CheckCircle size={18} />
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Project Planning</Typography>
        <Button
          variant="contained"
          startIcon={<Plus size={20} />}
          onClick={() => openCreate(ACTIVITY_TYPES[currentTab])}
        >
          Create {ACTIVITY_TYPES[currentTab]}
        </Button>
      </Box>

      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={currentTab} onChange={handleTabChange}>
            <Tab label="Milestones" />
            <Tab label="Phases" />
            <Tab label="Tasks" />
          </Tabs>
        </Box>

        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Subject</TableCell>
                      <TableCell>Project</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Priority</TableCell>
                      <TableCell>Assignee</TableCell>
                      <TableCell>Approver</TableCell>
                      <TableCell>Start Date</TableCell>
                      <TableCell>Due Date</TableCell>
                      <TableCell>Progress</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No {ACTIVITY_TYPES[currentTab].toLowerCase()}s found. Create one to get started.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      activities.map((activity) => (
                        <TableRow key={activity.id} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {getTypeIcon(activity.type)}
                              <Typography variant="body2">{activity.type}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {activity.subject}
                            </Typography>
                            {activity.description && (
                              <Typography variant="caption" color="text.secondary">
                                {activity.description.substring(0, 50)}
                                {activity.description.length > 50 ? '...' : ''}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {projects.find(p => p.id === activity.project_id)?.name || activity.project_id || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={activity.status}
                              color={getStatusColor(activity.status)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>{activity.priority}</TableCell>
                          <TableCell>{activity.assignee || '-'}</TableCell>
                          <TableCell>{activity.approver || '-'}</TableCell>
                          <TableCell>
                            {activity.start_date ? new Date(activity.start_date).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell>
                            {activity.due_date ? new Date(activity.due_date).toLocaleDateString() : '-'}
                          </TableCell>
                          <TableCell>{activity.progress}%</TableCell>
                          <TableCell align="right">
                            <IconButton onClick={() => openEdit(activity.id)} size="small">
                              <Edit size={18} />
                            </IconButton>
                            <IconButton
                              onClick={() => deleteActivity(activity.id, activity.subject)}
                              size="small"
                              color="error"
                            >
                              <Trash2 size={18} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div"
                count={pagination.total}
                page={pagination.page}
                onPageChange={handlePageChange}
                rowsPerPage={pagination.rowsPerPage}
                onRowsPerPageChange={handleRowsPerPageChange}
                rowsPerPageOptions={[25, 50, 100]}
              />
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}

export default React.memo(ProjectPlanning)
