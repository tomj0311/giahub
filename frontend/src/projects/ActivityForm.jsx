import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  CircularProgress,
  Paper,
  Autocomplete,
  
} from '@mui/material'
import { ArrowLeft, Save } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'
import ActivityNotifications from './ActivityNotifications'

// Use global user cache to prevent duplicate API calls
// This is shared with ActivityNotifications component
let globalUserCache = null
let globalUserCacheLoading = false

const ACTIVITY_TYPES = ['MILESTONE', 'PHASE', 'TASK']
const STATUS_OPTIONS = ['New', 'Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled']
const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent']

function ActivityForm({ user, projectId: propProjectId }) {
  const token = user?.token
  const navigate = useNavigate()
  const location = useLocation()
  const { activityId } = useParams()
  const { showSuccess, showError } = useSnackbar()

  const isMountedRef = useRef(true)
  const showErrorRef = useRef(showError)
  const navigateRef = useRef(navigate)
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
  
  // Check if navigating from Gantt chart
  const isFromGantt = location.state?.returnTo === '/dashboard/projects/gantt'
  
  // Check if navigating from email notification
  const isFromEmail = new URLSearchParams(location.search).get('source') === 'email'

  // Strict date validation helpers
  const isValidISODateString = useCallback((str, { minYear = 1900, maxYear = 2100 } = {}) => {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false
    const [y, m, d] = str.split('-').map(Number)
    if (y < minYear || y > maxYear) return false
    const dt = new Date(Date.UTC(y, m - 1, d))
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    )
  }, [])

  // Compare two ISO date strings (YYYY-MM-DD)
  const isISOAfter = useCallback((a, b) => {
    if (!a || !b) return false
    return a > b
  }, [])

  // Calculate due date status for visual indicators
  const getDueDateStatus = useCallback(() => {
    if (!form.due_date) return { color: 'inherit', isBold: false }
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const dueDate = new Date(form.due_date + 'T00:00:00')
    const diffTime = dueDate - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    // Red and bold if on or after due date
    if (diffDays <= 0) {
      return { color: '#d32f2f', isBold: true } // red
    }
    // Yellow if within 3 days
    if (diffDays <= 3) {
      return { color: '#ed6c02', isBold: false } // orange/yellow
    }
    // Default color
    return { color: 'inherit', isBold: false }
  }, [form.due_date])

  const dueDateStatus = useMemo(() => getDueDateStatus(), [getDueDateStatus])

  // Update refs when these change
  useEffect(() => {
    showErrorRef.current = showError
    navigateRef.current = navigate
  }, [showError, navigate])

  useEffect(() => {
    console.log('[ACTIVITYFORM] useEffect triggered - token:', !!token, 'activityId:', activityId)
    isMountedRef.current = true
    
    const loadProjects = async () => {
      console.log('[ACTIVITYFORM] Loading projects...')
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
      console.log('[ACTIVITYFORM] Loading tenant users...')
      
      // Check global cache first
      if (globalUserCache) {
        console.log('[ACTIVITYFORM] Using globally cached users')
        setTenantUsers(globalUserCache)
        return
      }
      
      // Check if already loading globally
      if (globalUserCacheLoading) {
        console.log('[ACTIVITYFORM] Users already loading globally, waiting...')
        const checkInterval = setInterval(() => {
          if (!globalUserCacheLoading && globalUserCache) {
            clearInterval(checkInterval)
            console.log('[ACTIVITYFORM] Global load complete, using cached users')
            setTenantUsers(globalUserCache)
          }
        }, 50)
        setTimeout(() => clearInterval(checkInterval), 5000)
        return
      }
      
      globalUserCacheLoading = true
      
      try {
        console.log('[ACTIVITYFORM] Making API call to /api/users/')
        const res = await apiCall('/api/users/', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        console.log('[ACTIVITYFORM] /api/users/ response status:', res.status)
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
          
          // Cache globally so other components can use it
          globalUserCache = mappedUsers
          setTenantUsers(mappedUsers)
        }
      } catch (error) {
        console.error('[ActivityForm] Error loading users:', error)
      } finally {
        globalUserCacheLoading = false
      }
    }

    const loadActivity = async () => {
      if (!activityId) return
      
      console.log('[ACTIVITYFORM] Loading activity:', activityId)
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
        showErrorRef.current('Failed to load activity details')
        navigateRef.current(-1)
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
  }, [token, activityId]) // Removed showError and navigate from dependencies

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
    } else if (!isValidISODateString(form.start_date)) {
      errors.start_date = 'Invalid date. Use YYYY-MM-DD (1900-01-01 to 2100-12-31)'
    }

    if (!form.due_date) {
      errors.due_date = 'Due date is required'
    } else if (!isValidISODateString(form.due_date)) {
      errors.due_date = 'Invalid date. Use YYYY-MM-DD (1900-01-01 to 2100-12-31)'
    }

    if (!errors.start_date && !errors.due_date && form.start_date && form.due_date) {
      if (!isISOAfter(form.due_date, form.start_date)) {
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
      
      // Navigate back to the previous page using browser history
      navigate(-1)
    } catch (error) {
      showError(error.message || 'Failed to save activity')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    // Navigate back to the previous page using browser history
    navigate(-1)
  }

  if (loading && isEditMode) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  // If coming from Gantt chart or email notification, show only notifications (no edit form)
  if ((isFromGantt || isFromEmail) && isEditMode && activityId) {
    return (
      <Box sx={{ p: 3 }}>
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
              Activity Details
            </Typography>
          </Box>
        </Box>

        {/* Show activity summary info (view-only) */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            {/* Two-column layout: Left = Subject + Description, Right = other meta fields */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 3 }}>
              {/* Left column: Subject and Description */}
              <Box>
                <Typography variant="caption" color="text.secondary">Subject</Typography>
                <Typography 
                  variant="body1" 
                  fontWeight="500"
                  sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {form.subject || 'Loading...'}
                </Typography>

                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">Description</Typography>
                  {/* Scrollable viewport for long description text */}
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      maxHeight: { xs: 100, md: 220 },
                      overflowY: 'auto'
                    }}
                  >
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {form.description || 'N/A'}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Right column: Other details */}
              <Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Project</Typography>
                    <Typography variant="body1" fontWeight="500">{projectName}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Type</Typography>
                    <Typography variant="body1">{form.type}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Status</Typography>
                    <Typography variant="body1">{form.status}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Priority</Typography>
                    <Typography variant="body1">{form.priority}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Progress</Typography>
                    <Typography variant="body1">{form.progress}%</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Assignee</Typography>
                    <Typography variant="body1">
                      {tenantUsers.find(u => u.email === form.assignee)?.displayName || form.assignee || 'N/A'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Approver</Typography>
                    <Typography variant="body1">
                      {tenantUsers.find(u => u.email === form.approver)?.displayName || form.approver || 'N/A'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Start Date</Typography>
                    <Typography variant="body1">{form.start_date || 'N/A'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ color: dueDateStatus.color }}>
                      Due Date
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        color: dueDateStatus.color,
                        fontWeight: dueDateStatus.isBold ? 'bold' : 'normal'
                      }}
                    >
                      {form.due_date || 'N/A'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Notifications Section */}
        <ActivityNotifications 
          user={stableUser} 
          activityId={activityId} 
          projectId={form.project_id}
        />
      </Box>
    )
  }

  return (
    <>
    <Box>
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
      </Box>

      {/* Form - Two Column Layout: Left = Subject + Description, Right = all other fields */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 3, alignItems: 'start' }}>
            {/* Left column: Subject and Description */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, alignSelf: 'start', alignContent: 'start', alignItems: 'start', gridAutoRows: 'min-content' }}>
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

              <TextField
                label="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                fullWidth
                multiline
                rows={8}
                placeholder="Enter detailed description of the activity..."
              />
            </Box>

            {/* Right column: All other fields (2-column grid on md+) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              {/* Type */}
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

              {/* Project (span both columns for readability) */}
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
                    helperText={formErrors.project_id || (projects.length === 0 ? "No projects found. Create a project first." : undefined)}
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
                inputProps={{ min: '1900-01-01', max: '2100-12-31' }}
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
                inputProps={{ min: '1900-01-01', max: '2100-12-31' }}
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
          </Box>
        </CardContent>
        <CardActions sx={{ display: 'flex', justifyContent: 'flex-end', p: 2, pt: 0 }}>
          <Button
            variant="contained"
            startIcon={<Save size={20} />}
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : (isEditMode ? 'Update' : 'Create')}
          </Button>
        </CardActions>
      </Card>

      {/* Notifications Section - Only show in edit mode when activity is saved */}
      {/* Render in a separate container to isolate from form re-renders */}
    </Box>
    
    {/* Notifications - Rendered outside form container to prevent flickering */}
    {isEditMode && activityId && (
      <Box sx={{ maxWidth: 1200, margin: '0 auto' }}>
        <ActivityNotifications 
          user={stableUser} 
          activityId={activityId} 
          projectId={form.project_id}
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
