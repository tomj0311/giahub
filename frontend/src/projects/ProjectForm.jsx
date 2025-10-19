import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  Box,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  CircularProgress,
  Autocomplete,
  Card,
  CardContent,
  CardActions,
  Paper,
  Alert
} from '@mui/material'
import { ArrowLeft, Save } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'

const STATUS_OPTIONS = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ON_HOLD', 'COMPLETED']
const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent']

function ProjectForm({ user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const token = user?.token
  const { showSuccess, showError } = useSnackbar()

  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)

  // State from navigation
  const parentId = location.state?.parentId || 'root'
  const returnTo = location.state?.returnTo || '/dashboard/projects'
  const isEditMode = Boolean(id)

  // Form state
  const [loading, setLoading] = useState(false)
  const [allProjects, setAllProjects] = useState([])
  const [tenantUsers, setTenantUsers] = useState([])
  const [formErrors, setFormErrors] = useState({})
  const [form, setForm] = useState({
    id: null,
    name: '',
    description: '',
    parent_id: parentId,
    status: 'ON_TRACK',
    priority: 'Normal',
    assignee: '',
    approver: '',
    due_date: '',
    start_date: '',
    progress: 0,
    is_public: false
  })

  // Strict date validation helpers
  const isValidISODateString = useCallback((str, { minYear = 1900, maxYear = 2100 } = {}) => {
    if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false
    const [y, m, d] = str.split('-').map(Number)
    if (y < minYear || y > maxYear) return false
    // Check actual calendar validity using UTC to avoid TZ issues
    const dt = new Date(Date.UTC(y, m - 1, d))
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    )
  }, [])

  // Compare two ISO dates (YYYY-MM-DD) safely via string comparison
  const isISOAfter = useCallback((a, b) => {
    if (!a || !b) return false
    return a > b
  }, [])

  // Load all projects for parent selection
  const loadAllProjects = useCallback(async () => {
    try {
      const res = await apiCall('/api/projects/projects?page=1&page_size=1000', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        const projects = data.projects || []
        setAllProjects(projects.map(p => ({
          id: p.id,
          displayName: p.name
        })))
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }, [token])

  // Load tenant users
  const loadTenantUsers = useCallback(async () => {
    if (!token) {
      console.warn('No token available for loading users')
      return
    }

    try {
      console.log('Loading tenant users...')
      const res = await apiCall('/api/users/', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      console.log('Users API response status:', res.status)

      if (res.ok) {
        const users = await res.json()
        console.log('Received users:', users)
        
        if (Array.isArray(users)) {
          const mappedUsers = users.map(user => ({
            id: user.id,
            email: user.email,
            displayName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
          }))
          console.log('Mapped users for dropdown:', mappedUsers)
          setTenantUsers(mappedUsers)
        } else {
          console.error('Users response is not an array:', users)
          showError('Invalid users data received')
        }
      } else {
        const errorData = await res.json().catch(() => ({ detail: 'Unknown error' }))
        console.error('Failed to load users - Status:', res.status, 'Error:', errorData)
        showError(`Failed to load users: ${errorData.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to load users:', error)
      showError('Failed to load users - Network error')
    }
  }, [token, showError])

  // Load project details for editing
  const loadProjectDetails = useCallback(async () => {
    if (!id || !isEditMode) return

    try {
      setLoading(true)
      const res = await apiCall(`/api/projects/projects/${id}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to load project')
      }

      const response = await res.json()
      setForm({
        id: response.id,
        name: response.name || '',
        description: response.description || '',
        parent_id: response.parent_id || 'root',
        status: response.status || 'ON_TRACK',
        priority: response.priority || 'Normal',
        assignee: response.assignee || '',
        approver: response.approver || '',
        due_date: response.due_date || '',
        start_date: response.start_date || '',
        progress: response.progress || 0,
        is_public: response.is_public || false
      })
    } catch (error) {
      showError('Failed to load project details')
      navigate(-1)
    } finally {
      setLoading(false)
    }
  }, [id, isEditMode, token, showError, navigate, returnTo])

  // Initialize data
  useEffect(() => {
    isMountedRef.current = true
    loadAllProjects()
    loadTenantUsers()
    loadProjectDetails()

    return () => {
      isMountedRef.current = false
    }
  }, [loadAllProjects, loadTenantUsers, loadProjectDetails])

  // Handle form submission
  const handleSave = async () => {
    const errors = {}
    
    if (!form.name.trim()) {
      errors.name = 'Project name is required'
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

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})

    try {
      setLoading(true)
      const payload = { ...form }
      delete payload.id

      if (isEditMode) {
        const res = await apiCall(`/api/projects/projects/${form.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.detail || 'Failed to update project')
        }
        showSuccess('Project updated successfully')
      } else {
        const res = await apiCall('/api/projects/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.detail || 'Failed to create project')
        }
        showSuccess('Project created successfully')
      }
      
      navigate(-1)
    } catch (error) {
      console.error('Failed to save project:', error)
      showError(error.message || 'Failed to save project')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    navigate(-1)
  }

  if (loading && isEditMode) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowLeft size={20} />}
          onClick={handleCancel}
        >
          Back
        </Button>
        <Typography variant="h4">
          {isEditMode ? 'Edit Project' : 'Create New Project'}
        </Typography>
      </Box>

      {/* Form - Two Column Layout: Left = Name + Description, Right = all other fields */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 3, alignItems: 'start' }}>
            {/* Left column: Name and Description */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, alignSelf: 'start', alignContent: 'start', alignItems: 'start', gridAutoRows: 'min-content' }}>
              <TextField
                label="Project Name"
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value })
                  setFormErrors({ ...formErrors, name: undefined })
                }}
                fullWidth
                required
                error={!!formErrors.name}
                helperText={formErrors.name}
              />

              <TextField
                label="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                fullWidth
                multiline
                rows={8}
                placeholder="Enter detailed description of the project..."
              />
            </Box>

            {/* Right column: All other fields (2-column grid on md+) */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
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

              {/* Parent Project */}
              <Autocomplete
                options={[{ id: 'root', displayName: 'Root (No Parent)' }, ...allProjects]}
                getOptionLabel={(option) => option.displayName}
                value={
                  form.parent_id === 'root'
                    ? { id: 'root', displayName: 'Root (No Parent)' }
                    : allProjects.find(p => p.id === form.parent_id) || null
                }
                onChange={(event, newValue) => {
                  setForm({ ...form, parent_id: newValue ? newValue.id : 'root' })
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Parent Project" />
                )}
                fullWidth
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
    </Box>
  )
}

export default ProjectForm