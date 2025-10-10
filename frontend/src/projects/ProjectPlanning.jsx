import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
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
  CircularProgress,
  Paper,
  Autocomplete
} from '@mui/material'
import { Plus, Edit, Trash2, Calendar, CheckCircle, Circle, Flag } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'
import { apiCall } from '../config/api'

const ACTIVITY_TYPES = ['MILESTONE', 'PHASE', 'TASK']
const STATUS_OPTIONS = ['New', 'In Progress', 'On Hold', 'Completed', 'Cancelled']
const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent']

function ProjectPlanning({ user, projectId }) {
  const token = user?.token
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
  const [currentTab, setCurrentTab] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [form, setForm] = useState({
    id: null,
    project_id: projectId || '',
    subject: '',
    type: 'TASK',
    description: '',
    status: 'New',
    priority: 'Normal',
    assignee: '',
    approver: '',
    due_date: '',
    start_date: '',
    end_date: '',
    progress: 0,
    estimated_time: '',
    spent_time: 0
  })

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
    setForm({
      id: null,
      project_id: projectId || '',
      subject: '',
      type: type,
      description: '',
      status: 'New',
      priority: 'Normal',
      assignee: '',
      approver: '',
      due_date: '',
      start_date: '',
      end_date: '',
      progress: 0,
      estimated_time: '',
      spent_time: 0
    })
    setIsEditMode(false)
    setDialogOpen(true)
  }

  const openEdit = async (activityId) => {
    try {
      const res = await apiCall(`/api/projects/activities/${activityId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to load activity')
      }

      const response = await res.json()

      setForm({
        id: response.id,
        project_id: response.project_id || '',
        subject: response.subject || '',
        type: response.type || 'TASK',
        description: response.description || '',
        status: response.status || 'New',
        priority: response.priority || 'Normal',
        assignee: response.assignee || '',
        approver: response.approver || '',
        due_date: response.due_date || '',
        start_date: response.start_date || '',
        end_date: response.end_date || '',
        progress: response.progress || 0,
        estimated_time: response.estimated_time || '',
        spent_time: response.spent_time || 0
      })
      setIsEditMode(true)
      setDialogOpen(true)
    } catch (error) {
      showError('Failed to load activity details')
    }
  }

  const saveActivity = async () => {
    if (!form.subject.trim()) {
      showError('Activity subject is required')
      return
    }

    if (!form.project_id) {
      showError('Please select a project - each activity must belong to a project')
      return
    }

    try {
      const payload = { ...form }
      delete payload.id

      if (isEditMode) {
        const res = await apiCall(`/api/projects/activities/${form.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.detail || 'Failed to update activity')
        }
        showSuccess('Activity updated successfully')
      } else {
        const res = await apiCall('/api/projects/activities', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.detail || 'Failed to create activity')
        }
        showSuccess('Activity created successfully')
      }

      setDialogOpen(false)
      loadActivities(pagination.page + 1, pagination.rowsPerPage)
    } catch (error) {
      showError(error.message || 'Failed to save activity')
    }
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
                      <TableCell>Due Date</TableCell>
                      <TableCell>Progress</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center">
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

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{isEditMode ? 'Edit Activity' : `Create New ${form.type}`}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={form.type}
                label="Type"
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                disabled={isEditMode}
              >
                {ACTIVITY_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Autocomplete
              options={projects}
              getOptionLabel={(option) => option.name || ''}
              value={projects.find(p => p.id === form.project_id) || null}
              onChange={(event, newValue) => {
                setForm({ ...form, project_id: newValue ? newValue.id : '' })
              }}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label="Project" 
                  required
                  helperText={projects.length === 0 ? "No projects found. Create a project first." : `${projects.length} projects available`}
                />
              )}
              fullWidth
              noOptionsText={projects.length === 0 ? "No projects found. Create a project first." : "No matching projects"}
            />
            <TextField
              label="Subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={form.status}
                  label="Status"
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <MenuItem key={status} value={status}>
                      {status}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={form.priority}
                  label="Priority"
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <MenuItem key={priority} value={priority}>
                      {priority}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Assignee"
                value={form.assignee}
                onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                fullWidth
              />
              <TextField
                label="Approver"
                value={form.approver}
                onChange={(e) => setForm({ ...form, approver: e.target.value })}
                fullWidth
              />
              <TextField
                label="Start Date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Due Date"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Progress (%)"
                type="number"
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                fullWidth
                inputProps={{ min: 0, max: 100 }}
              />
              <TextField
                label="Estimated Time (hours)"
                type="number"
                value={form.estimated_time}
                onChange={(e) => setForm({ ...form, estimated_time: e.target.value })}
                fullWidth
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={saveActivity} variant="contained">
            {isEditMode ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default React.memo(ProjectPlanning)
