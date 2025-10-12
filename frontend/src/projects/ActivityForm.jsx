import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  CircularProgress,
  Paper,
  Autocomplete,
  Breadcrumbs,
  Link
} from '@mui/material'
import { ArrowLeft, Save } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'
import ActivityNotifications from './ActivityNotifications'

const ACTIVITY_TYPES = ['MILESTONE', 'PHASE', 'TASK']
const STATUS_OPTIONS = ['New', 'In Progress', 'On Hold', 'Completed', 'Cancelled']
const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent']

function ActivityForm({ user, projectId: propProjectId }) {
  const token = user?.token
  const navigate = useNavigate()
  const location = useLocation()
  const { activityId } = useParams()
  const { showSuccess, showError } = useSnackbar()

  const isMountedRef = useRef(true)
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState([])
  const [tenantUsers, setTenantUsers] = useState([])
  const [formErrors, setFormErrors] = useState({})

  // Get default type from query params or location state
  const defaultType = new URLSearchParams(location.search).get('type') || 
                      location.state?.type || 
                      'TASK'
  
  const defaultProjectId = propProjectId || 
                          new URLSearchParams(location.search).get('projectId') ||
                          location.state?.projectId ||
                          ''

  const [form, setForm] = useState({
    id: null,
    project_id: defaultProjectId,
    subject: '',
    type: defaultType,
    description: '',
    status: 'New',
    priority: 'Normal',
    assignee: '',
    approver: '',
    due_date: '',
    start_date: '',
    progress: 0,
    estimated_time: '',
    spent_time: 0
  })

  const isEditMode = !!activityId

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
          console.error('[ActivityForm] Load projects failed:', error)
          return
        }

        const response = await res.json()
        if (isMountedRef.current) {
          setProjects(response.projects || [])
        }
      } catch (error) {
        console.error('[ActivityForm] Error loading projects:', error)
      }
    }

    const loadTenantUsers = async () => {
      try {
        const res = await apiCall('/api/users/', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        if (!res.ok) {
          const error = await res.json()
          console.error('[ActivityForm] Failed to load users:', error)
          return
        }

        const users = await res.json()
        
        if (isMountedRef.current) {
          const mappedUsers = users.map(u => ({
            id: u.id,
            email: u.email,
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            displayName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email
          }))
          setTenantUsers(mappedUsers)
        }
      } catch (error) {
        console.error('[ActivityForm] Error loading users:', error)
      }
    }

    const loadActivity = async () => {
      if (!activityId) return
      
      setLoading(true)
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

        if (isMountedRef.current) {
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
            progress: response.progress || 0,
            estimated_time: response.estimated_time || '',
            spent_time: response.spent_time || 0
          })
        }
      } catch (error) {
        showError('Failed to load activity details')
        navigate(-1)
      } finally {
        if (isMountedRef.current) {
          setLoading(false)
        }
      }
    }

    loadProjects()
    loadTenantUsers()
    loadActivity()

    return () => {
      isMountedRef.current = false
    }
  }, [token, activityId, showError, navigate])

  // Memoize project name to prevent unnecessary re-renders
  const projectName = useMemo(() => {
    return projects.find(p => p.id === form.project_id)?.name || 'Unknown'
  }, [projects, form.project_id])

  // Memoize user to prevent re-renders when parent re-renders
  const stableUser = useMemo(() => ({
    token: user?.token
  }), [user?.token])

  const validateForm = () => {
    const errors = {}
    
    if (!form.subject.trim()) {
      errors.subject = 'Activity subject is required'
    }

    if (!form.project_id) {
      errors.project_id = 'Please select a project'
    }

    if (!form.assignee?.trim()) {
      errors.assignee = 'Assignee is required'
    }
    if (!form.approver?.trim()) {
      errors.approver = 'Approver is required'
    }

    if (form.assignee && form.approver && form.assignee === form.approver) {
      errors.approver = 'Approver must be different from Assignee'
    }

    if (!form.start_date) {
      errors.start_date = 'Start date is required'
    }
    if (!form.due_date) {
      errors.due_date = 'Due date is required'
    }

    if (form.start_date && form.due_date) {
      const startDate = new Date(form.start_date)
      const dueDate = new Date(form.due_date)
      if (startDate >= dueDate) {
        errors.due_date = 'Due date must be after start date'
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) {
      return
    }

    setLoading(true)
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
      
      // Navigate back to the previous page or to the planning page
      navigate(location.state?.returnTo || '/dashboard/projects', { 
        state: { tab: 1 } // Return to Planning tab
      })
    } catch (error) {
      showError(error.message || 'Failed to save activity')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    navigate(location.state?.returnTo || '/dashboard/projects', {
      state: { tab: 1 }
    })
  }

  if (loading && isEditMode) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
    <Box sx={{ p: 3 }}>
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 3 }}>
        <Link
          component="button"
          variant="body1"
          onClick={() => navigate('/dashboard/projects')}
          sx={{ cursor: 'pointer', textDecoration: 'none' }}
        >
          Projects
        </Link>
        <Link
          component="button"
          variant="body1"
          onClick={() => navigate('/dashboard/projects', { state: { tab: 1 } })}
          sx={{ cursor: 'pointer', textDecoration: 'none' }}
        >
          Planning
        </Link>
        <Typography color="text.primary">
          {isEditMode ? 'Edit Activity' : `Create ${form.type}`}
        </Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<ArrowLeft size={20} />}
            onClick={handleCancel}
            variant="outlined"
          >
            Back
          </Button>
          <Typography variant="h4">
            {isEditMode ? 'Edit Activity' : `Create New ${form.type}`}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Save size={20} />}
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? <CircularProgress size={20} /> : (isEditMode ? 'Update' : 'Create')}
        </Button>
      </Box>

      {/* Form - Grid Layout */}
      <Card>
        <CardContent>
          {/* Type, Project, and Status in one row - 3 columns */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3, mb: 3 }}>
            {/* Type Selection */}
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

            {/* Project Selection */}
            <Autocomplete
              options={projects}
              getOptionLabel={(option) => option.name || ''}
              value={projects.find(p => p.id === form.project_id) || null}
              onChange={(event, newValue) => {
                setForm({ ...form, project_id: newValue ? newValue.id : '' })
                setFormErrors({ ...formErrors, project_id: undefined })
              }}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label="Project" 
                  required
                  error={!!formErrors.project_id}
                  helperText={formErrors.project_id || (projects.length === 0 ? "No projects found. Create a project first." : `${projects.length} projects available`)}
                />
              )}
              fullWidth
              noOptionsText={projects.length === 0 ? "No projects found. Create a project first." : "No matching projects"}
            />

            {/* Status */}
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
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {/* Subject */}
            <TextField
              label="Subject"
              value={form.subject}
              onChange={(e) => {
                setForm({ ...form, subject: e.target.value })
                setFormErrors({ ...formErrors, subject: undefined })
              }}
              fullWidth
              required
              error={!!formErrors.subject}
              helperText={formErrors.subject}
            />
          </Box>

          {/* Description - Full Width */}
          <Box sx={{ mt: 3 }}>
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
              placeholder="Enter detailed description of the activity..."
            />
          </Box>

          {/* Priority, Assignee, and Approver in one row - 3 columns */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
            {/* Priority */}
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

            {/* Assignee */}
            <Autocomplete
              options={tenantUsers}
              getOptionLabel={(option) => option.displayName}
              value={tenantUsers.find(u => u.email === form.assignee) || null}
              onChange={(event, newValue) => {
                setForm({ ...form, assignee: newValue ? newValue.email : '' })
                setFormErrors({ ...formErrors, assignee: undefined, approver: undefined })
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Assignee"
                  required
                  error={!!formErrors.assignee}
                  helperText={formErrors.assignee || 'Required'}
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box>
                    <Typography variant="body1">{option.displayName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.email}
                    </Typography>
                  </Box>
                </li>
              )}
              fullWidth
              isOptionEqualToValue={(option, value) => option.email === value.email}
            />

            {/* Approver */}
            <Autocomplete
              options={tenantUsers.filter(u => u.email !== form.assignee)}
              getOptionLabel={(option) => option.displayName}
              value={tenantUsers.find(u => u.email === form.approver) || null}
              onChange={(event, newValue) => {
                setForm({ ...form, approver: newValue ? newValue.email : '' })
                setFormErrors({ ...formErrors, approver: undefined })
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Approver"
                  required
                  error={!!formErrors.approver}
                  helperText={formErrors.approver || 'Must differ from Assignee'}
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box>
                    <Typography variant="body1">{option.displayName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.email}
                    </Typography>
                  </Box>
                </li>
              )}
              fullWidth
              isOptionEqualToValue={(option, value) => option.email === value.email}
            />
          </Box>

          {/* Dates and Progress in one row - 3 columns */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
            {/* Start Date */}
            <TextField
              label="Start Date"
              type="date"
              value={form.start_date}
              onChange={(e) => {
                setForm({ ...form, start_date: e.target.value })
                setFormErrors({ ...formErrors, start_date: undefined, due_date: undefined })
              }}
              fullWidth
              InputLabelProps={{ shrink: true }}
              required
              error={!!formErrors.start_date}
              helperText={formErrors.start_date || 'Required'}
            />

            {/* Due Date */}
            <TextField
              label="Due Date"
              type="date"
              value={form.due_date}
              onChange={(e) => {
                setForm({ ...form, due_date: e.target.value })
                setFormErrors({ ...formErrors, due_date: undefined })
              }}
              fullWidth
              InputLabelProps={{ shrink: true }}
              required
              error={!!formErrors.due_date}
              helperText={formErrors.due_date || 'Required'}
            />

            {/* Progress */}
            <TextField
              label="Progress (%)"
              type="number"
              value={form.progress}
              onChange={(e) => setForm({ ...form, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
              fullWidth
              inputProps={{ min: 0, max: 100 }}
              helperText="Completion (0-100)"
            />
          </Box>
        </CardContent>
      </Card>

      {/* Notifications Section - Only show in edit mode when activity is saved */}
      {/* Render in a separate container to isolate from form re-renders */}
    </Box>
    
    {/* Notifications - Rendered outside form container to prevent flickering */}
    {isEditMode && activityId && (
      <Box sx={{ p: 3, pt: 0, maxWidth: 1200, margin: '0 auto' }}>
        <ActivityNotifications 
          user={stableUser} 
          activityId={activityId} 
          projectName={projectName}
        />
      </Box>
    )}
    </>
  )
}

export default React.memo(ActivityForm, (prevProps, nextProps) => {
  return (
    prevProps.user?.token === nextProps.user?.token &&
    prevProps.projectId === nextProps.projectId
  )
})
