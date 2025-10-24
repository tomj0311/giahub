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
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControlLabel,
  Switch
} from '@mui/material'
import { ArrowLeft, Save, ChevronDown } from 'lucide-react'
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
  // Loading states
  const [isFetching, setIsFetching] = useState(false) // initial data load for edit mode
  const [isSaving, setIsSaving] = useState(false) // form save state (avoid full-page spinner flicker)
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
    is_public: false,
    // Additional information fields
    district: '',
    location: '',
    assembly: '',
    date_of_sanction_from: '',
    date_of_sanction_to: '',
    project_short_name: '',
    file_number: '',
    executing_agency: '',
    implementing_agency: '',
    head_of_account: '',
    architect: '',
    expenditure: 0,
    inaugurated: false,
    operation_started: false,
    remarks: '',
    project_coordinator: '',
    coordinator_contact: ''
  })

  // State for distinct values
  const [distinctValues, setDistinctValues] = useState({
    district: [],
    location: [],
    assembly: [],
    executing_agency: [],
    implementing_agency: [],
    head_of_account: [],
    architect: []
  })

  // Control the Additional Information accordion to keep it expanded by default
  const [additionalExpanded, setAdditionalExpanded] = useState(false)

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
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            displayName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
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

  // Load distinct values for dropdown fields
  const loadDistinctValues = useCallback(async () => {
    if (!token) return

    const fields = ['district', 'location', 'assembly', 'executing_agency', 'implementing_agency', 'head_of_account', 'architect']
    
    try {
      console.log('Loading distinct values for fields:', fields)
      const promises = fields.map(async (field) => {
        try {
          const url = `/api/projects/distinct-values/${field}`
          console.log(`Calling API: ${url}`)
          const res = await apiCall(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
          })
          
          console.log(`API response for ${field}:`, res.status, res.ok)
          
          if (res.ok) {
            const data = await res.json()
            console.log(`Loaded ${data.values?.length || 0} values for ${field}:`, data)
            return { field, values: data.values || [] }
          } else {
            const errorData = await res.json().catch(() => ({}))
            console.error(`Failed to load values for ${field}:`, res.status, errorData)
            return { field, values: [] }
          }
        } catch (error) {
          console.error(`Failed to load distinct values for ${field}:`, error)
          return { field, values: [] }
        }
      })

      const results = await Promise.all(promises)
      const newDistinctValues = {}
      results.forEach(({ field, values }) => {
        newDistinctValues[field] = values
      })
      console.log('All distinct values loaded:', newDistinctValues)
      setDistinctValues(newDistinctValues)
    } catch (error) {
      console.error('Failed to load distinct values:', error)
    }
  }, [token])

  // Load project details for editing
  const loadProjectDetails = useCallback(async () => {
    if (!id || !isEditMode) return

    try {
      setIsFetching(true)
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
        is_public: response.is_public || false,
        // Additional information fields
        district: response.district || '',
        location: response.location || '',
        assembly: response.assembly || '',
        date_of_sanction_from: response.date_of_sanction_from || '',
        date_of_sanction_to: response.date_of_sanction_to || '',
        project_short_name: response.project_short_name || '',
        file_number: response.file_number || '',
        executing_agency: response.executing_agency || '',
        implementing_agency: response.implementing_agency || '',
        head_of_account: response.head_of_account || '',
        architect: response.architect || '',
        expenditure: response.expenditure || 0,
        inaugurated: response.inaugurated || false,
        operation_started: response.operation_started || false,
        remarks: response.remarks || '',
        project_coordinator: response.project_coordinator || '',
        coordinator_contact: response.coordinator_contact || ''
      })
    } catch (error) {
      showError('Failed to load project details')
      navigate(-1)
    } finally {
      setIsFetching(false)
    }
  }, [id, isEditMode, token, showError, navigate])

  // Initialize data
  useEffect(() => {
    isMountedRef.current = true
    loadTenantUsers()
    loadDistinctValues()
    loadProjectDetails()

    return () => {
      isMountedRef.current = false
    }
  }, [loadTenantUsers, loadDistinctValues, loadProjectDetails])

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

    if (!form.district?.trim()) {
      errors.district = 'District is required'
    }

    if (!form.assembly?.trim()) {
      errors.assembly = 'Assembly is required'
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

    // Validate additional date fields
    if (form.date_of_sanction_from && !isValidISODateString(form.date_of_sanction_from)) {
      errors.date_of_sanction_from = 'Invalid date. Use YYYY-MM-DD (1900-01-01 to 2100-12-31)'
    }

    if (form.date_of_sanction_to && !isValidISODateString(form.date_of_sanction_to)) {
      errors.date_of_sanction_to = 'Invalid date. Use YYYY-MM-DD (1900-01-01 to 2100-12-31)'
    }

    if (form.date_of_sanction_from && form.date_of_sanction_to && !errors.date_of_sanction_from && !errors.date_of_sanction_to) {
      if (!isISOAfter(form.date_of_sanction_to, form.date_of_sanction_from)) {
        errors.date_of_sanction_to = 'Date of sanction to must be after date of sanction from'
      }
    }

    // Validate coordinator contact number format (if provided)
    if (form.coordinator_contact && form.coordinator_contact.trim()) {
      const contactPattern = /^[0-9+\-\s()]+$/
      if (!contactPattern.test(form.coordinator_contact.trim())) {
        errors.coordinator_contact = 'Contact number can only contain numbers, +, -, spaces, and parentheses'
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})

    try {
      setIsSaving(true)
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
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    navigate(-1)
  }

  if (isFetching && isEditMode) {
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
                rows={7}
                placeholder="Enter detailed description of the project..."
              />

              {/* District and Assembly on same line */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                {/* District */}
                <Autocomplete
                  freeSolo
                  options={distinctValues.district || []}
                  value={form.district || ''}
                  onChange={(event, newValue) => {
                    setForm({ ...form, district: newValue || '' })
                    setFormErrors({ ...formErrors, district: undefined })
                  }}
                  onInputChange={(event, newInputValue) => {
                    if (event && event.type === 'change') {
                      setForm({ ...form, district: newInputValue || '' })
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="District"
                      placeholder="Select or type district"
                      required
                      error={!!formErrors.district}
                      helperText={formErrors.district || 'Required'}
                    />
                  )}
                  fullWidth
                />

                {/* Assembly */}
                <Autocomplete
                  freeSolo
                  options={distinctValues.assembly || []}
                  value={form.assembly || ''}
                  onChange={(event, newValue) => {
                    setForm({ ...form, assembly: newValue || '' })
                    setFormErrors({ ...formErrors, assembly: undefined })
                  }}
                  onInputChange={(event, newInputValue) => {
                    if (event && event.type === 'change') {
                      setForm({ ...form, assembly: newInputValue || '' })
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Assembly"
                      placeholder="Select or type assembly"
                      required
                      error={!!formErrors.assembly}
                      helperText={formErrors.assembly || 'Required'}
                    />
                  )}
                  fullWidth
                />
              </Box>
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

          {/* Additional Information Accordion */}
          <Box sx={{ mt: 3 }}>
            <Accordion
              expanded={additionalExpanded}
              onChange={(event, isExpanded) => setAdditionalExpanded(isExpanded)}
            >
              <AccordionSummary expandIcon={<ChevronDown size={20} />}>
                <Typography variant="h6">Additional Information</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                  {/* Location */}
                  <Autocomplete
                    freeSolo
                    options={distinctValues.location || []}
                    value={form.location || ''}
                    onChange={(event, newValue) => {
                      setForm({ ...form, location: newValue || '' })
                    }}
                    onInputChange={(event, newInputValue) => {
                      if (event && event.type === 'change') {
                        setForm({ ...form, location: newInputValue || '' })
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Location"
                        placeholder="Select or type location"
                      />
                    )}
                    fullWidth
                  />

                  {/* Project Short Name */}
                  <TextField
                    label="Project Short Name"
                    value={form.project_short_name}
                    onChange={(e) => setForm({ ...form, project_short_name: e.target.value })}
                    fullWidth
                    placeholder="Enter short name"
                  />

                  {/* Date of Sanction From */}
                  <TextField
                    label="Date of Sanction From"
                    type="date"
                    value={form.date_of_sanction_from}
                    onChange={(e) => {
                      setForm({ ...form, date_of_sanction_from: e.target.value })
                      setFormErrors({ ...formErrors, date_of_sanction_from: undefined, date_of_sanction_to: undefined })
                    }}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: '1900-01-01', max: '2100-12-31' }}
                    error={!!formErrors.date_of_sanction_from}
                    helperText={formErrors.date_of_sanction_from}
                  />

                  {/* Date of Sanction To */}
                  <TextField
                    label="Date of Sanction To"
                    type="date"
                    value={form.date_of_sanction_to}
                    onChange={(e) => {
                      setForm({ ...form, date_of_sanction_to: e.target.value })
                      setFormErrors({ ...formErrors, date_of_sanction_to: undefined })
                    }}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: '1900-01-01', max: '2100-12-31' }}
                    error={!!formErrors.date_of_sanction_to}
                    helperText={formErrors.date_of_sanction_to}
                  />

                  {/* File Number */}
                  <TextField
                    label="File Number"
                    value={form.file_number}
                    onChange={(e) => setForm({ ...form, file_number: e.target.value })}
                    fullWidth
                    placeholder="Enter file number"
                  />

                  {/* Executing Agency */}
                  <Autocomplete
                    freeSolo
                    options={distinctValues.executing_agency || []}
                    value={form.executing_agency || ''}
                    onChange={(event, newValue) => {
                      setForm({ ...form, executing_agency: newValue || '' })
                    }}
                    onInputChange={(event, newInputValue) => {
                      if (event && event.type === 'change') {
                        setForm({ ...form, executing_agency: newInputValue || '' })
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Executing Agency"
                        placeholder="Select or type agency"
                      />
                    )}
                    fullWidth
                  />

                  {/* Implementing Agency */}
                  <Autocomplete
                    freeSolo
                    options={distinctValues.implementing_agency || []}
                    value={form.implementing_agency || ''}
                    onChange={(event, newValue) => {
                      setForm({ ...form, implementing_agency: newValue || '' })
                    }}
                    onInputChange={(event, newInputValue) => {
                      if (event && event.type === 'change') {
                        setForm({ ...form, implementing_agency: newInputValue || '' })
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Implementing Agency"
                        placeholder="Select or type agency"
                      />
                    )}
                    fullWidth
                  />

                  {/* Head of Account */}
                  <Autocomplete
                    freeSolo
                    options={distinctValues.head_of_account || []}
                    value={form.head_of_account || ''}
                    onChange={(event, newValue) => {
                      setForm({ ...form, head_of_account: newValue || '' })
                    }}
                    onInputChange={(event, newInputValue) => {
                      if (event && event.type === 'change') {
                        setForm({ ...form, head_of_account: newInputValue || '' })
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Head of Account"
                        placeholder="Select or type head of account"
                      />
                    )}
                    fullWidth
                  />

                  {/* Architect */}
                  <Autocomplete
                    freeSolo
                    options={distinctValues.architect || []}
                    value={form.architect || ''}
                    onChange={(event, newValue) => {
                      setForm({ ...form, architect: newValue || '' })
                    }}
                    onInputChange={(event, newInputValue) => {
                      if (event && event.type === 'change') {
                        setForm({ ...form, architect: newInputValue || '' })
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Architect"
                        placeholder="Select or type architect"
                      />
                    )}
                    fullWidth
                  />

                  {/* Expenditure */}
                  <TextField
                    label="Expenditure"
                    type="number"
                    value={form.expenditure}
                    onChange={(e) => setForm({ ...form, expenditure: parseFloat(e.target.value) || 0 })}
                    fullWidth
                    inputProps={{ min: 0, step: 0.01 }}
                    placeholder="Enter expenditure amount"
                  />

                  {/* Inaugurated */}
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.inaugurated}
                        onChange={(e) => setForm({ ...form, inaugurated: e.target.checked })}
                      />
                    }
                    label="Inaugurated"
                  />

                  {/* Operation Started */}
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.operation_started}
                        onChange={(e) => setForm({ ...form, operation_started: e.target.checked })}
                      />
                    }
                    label="Operation Started"
                  />

                  {/* Project Coordinator */}
                  <TextField
                    label="Project Coordinator"
                    value={form.project_coordinator}
                    onChange={(e) => setForm({ ...form, project_coordinator: e.target.value })}
                    fullWidth
                    placeholder="Enter project coordinator name"
                  />

                  {/* Coordinator Contact Number */}
                  <TextField
                    label="Coordinator Contact"
                    value={form.coordinator_contact}
                    onChange={(e) => {
                      setForm({ ...form, coordinator_contact: e.target.value })
                      setFormErrors({ ...formErrors, coordinator_contact: undefined })
                    }}
                    fullWidth
                    placeholder="Enter contact number"
                    error={!!formErrors.coordinator_contact}
                    helperText={formErrors.coordinator_contact}
                    inputProps={{ pattern: '[0-9+\\-\\s()]*' }}
                  />

                  {/* Remarks - Full Width */}
                  <TextField
                    label="Remarks"
                    value={form.remarks}
                    onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                    fullWidth
                    multiline
                    rows={3}
                    placeholder="Enter any additional remarks..."
                    sx={{ gridColumn: '1 / -1' }}
                  />
                </Box>
              </AccordionDetails>
            </Accordion>
          </Box>
        </CardContent>
        <CardActions sx={{ display: 'flex', justifyContent: 'flex-end', p: 2, pt: 0 }}>
          <Button
            variant="contained"
            startIcon={isSaving ? <CircularProgress size={18} /> : <Save size={20} />}
            onClick={handleSave}
            disabled={isSaving}
            aria-busy={isSaving}
            sx={{ minWidth: 120 }}
          >
            {isEditMode ? 'Update' : 'Create'}
          </Button>
        </CardActions>
      </Card>
    </Box>
  )
}

export default ProjectForm