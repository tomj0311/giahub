import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Badge,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
  Checkbox,
  FormControlLabel,
  FormGroup
} from '@mui/material'
import { Plus, Edit, Trash2, CheckCircle, Circle, Flag, Filter, SortAsc, SortDesc, ArrowUp, ArrowDown, X, Settings } from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'
import { apiCall } from '../config/api'
import sharedApiService from '../utils/apiService'

// Showing all activity types together; tabs removed

function ProjectPlanning({ user, projectId }) {
  const token = user?.token
  const navigate = useNavigate()
  const { showSuccess, showError } = useSnackbar()
  const { showDeleteConfirmation } = useConfirmation()

  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)
  const isLoadingProjectsRef = useRef(false)
  const isLoadingMetadataRef = useRef(false)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const [activities, setActivities] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    page: 0,
    rowsPerPage: 8,
    total: 0
  })
  
  // Filter and sort state
  const [filters, setFilters] = useState([])
  const [sortField, setSortField] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')
  const [fieldMetadata, setFieldMetadata] = useState([])
  
  // Filter dialog state
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const [currentFilter, setCurrentFilter] = useState({
    field: '',
    operator: '',
    value: ''
  })
  
  // Sort menu state
  const [sortMenuAnchor, setSortMenuAnchor] = useState(null)
  
  // Column customization state
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  // Predefined initial columns (common ones shown by default)
  const [visibleColumns, setVisibleColumns] = useState({
    project_id: true,
    type: true,
    subject: true,
    status: true,
    start_date: true,
    due_date: true,
    assignee: true,
    approver: true,
    progress: true,
    // Others off by default
    priority: false
  })
  
  // Tabs removed: show all activity types
  // Preferred column order
  const PREFERRED_ORDER = ['project_id', 'type', 'subject', 'status', 'start_date', 'due_date', 'assignee', 'approver', 'progress']

  const orderedFields = React.useMemo(() => {
    const orderIndex = (name) => {
      const idx = PREFERRED_ORDER.indexOf(name)
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
    }
    return [...fieldMetadata].sort((a, b) => orderIndex(a.name) - orderIndex(b.name))
  }, [fieldMetadata])

  // Format date as dd/mm/yyyy
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  // Load field metadata from API - NO HARDCODING!
  const loadFieldMetadata = useCallback(async () => {
    if (!isMountedRef.current) return
    
    // Prevent duplicate calls
    if (isLoadingMetadataRef.current) {
      return
    }
    
    try {
      isLoadingMetadataRef.current = true
      
      const result = await sharedApiService.makeRequest(
        '/api/projects/activities/fields-metadata',
        {
          method: 'GET',
          headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
        },
        { token: tokenRef.current?.substring(0, 10) }
      )

      if (!isMountedRef.current) return

      if (result.success) {
        setFieldMetadata(result.data.fields || [])
        
        // Update visible columns to include any new fields from backend that aren't in the predefined list
        // This ensures all backend fields are available, but keeps the predefined initial visibility
        setVisibleColumns(prev => {
          const updated = { ...prev }
          result.data.fields?.forEach(field => {
            // If field is not in predefined list, set it to false (hidden by default)
            if (!(field.name in updated)) {
              updated[field.name] = false
            }
          })
          return updated
        })
      } else {
        showError(result.error || 'Failed to load field metadata')
      }
    } catch (error) {
      console.error('[ProjectPlanning] Failed to load field metadata:', error)
      if (isMountedRef.current) {
        showError(error.message || 'Failed to load field metadata')
      }
    } finally {
      if (isMountedRef.current) {
        isLoadingMetadataRef.current = false
      }
    }
  }, []); // Empty dependencies

  const loadProjects = useCallback(async () => {
    if (!isMountedRef.current) return
    
    // Prevent duplicate calls
    if (isLoadingProjectsRef.current) {
      return
    }
    
    try {
      isLoadingProjectsRef.current = true
      
      const result = await sharedApiService.makeRequest(
        '/api/projects/projects?page=1&page_size=1000',
        {
          method: 'GET',
          headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
        },
        { page: 1, page_size: 1000, token: tokenRef.current?.substring(0, 10) }
      )

      if (!isMountedRef.current) return

      if (result.success) {
        console.log('[ProjectPlanning] Projects loaded:', result.data.projects?.length || 0)
        setProjects(result.data.projects || [])
      }
    } catch (error) {
      console.error('[ProjectPlanning] Error:', error)
    } finally {
      if (isMountedRef.current) {
        isLoadingProjectsRef.current = false
      }
    }
  }, []); // Empty dependencies

  // Use exact same pattern as ModelConfig
  useEffect(() => {
    const loadData = async () => {
      if (!isMountedRef.current) return
      
      // Set mounted to true
      isMountedRef.current = true
      
      try {
        await Promise.all([
          loadFieldMetadata(),
          loadProjects()
        ])
      } catch (err) {
        console.error('❌ PROJECTPLANNING Error during initialization:', err)
      }
    }
    
    loadData()
    
    return () => {
      // Set mounted to false FIRST to prevent any state updates
      isMountedRef.current = false
      isLoadingRef.current = false
      isLoadingProjectsRef.current = false
      isLoadingMetadataRef.current = false
    }
  }, []); // EMPTY DEPENDENCIES - NO BULLSHIT

  useEffect(() => {
    const loadActivities = async (page = 1, pageSize = 8) => {
      if (isLoadingRef.current || !isMountedRef.current) return
      isLoadingRef.current = true
      setLoading(true)

      try {
        // Invalidate any cached activities responses before fetching fresh data
        sharedApiService.invalidateCache('/api/projects/activities')
        const params = new URLSearchParams({
          page: page.toString(),
          page_size: pageSize.toString()
        })

  if (projectId) params.append('project_id', projectId)
        
        if (sortField) {
          params.append('sort_by', sortField)
          params.append('sort_order', sortOrder)
        }
        
        if (filters.length > 0) {
          params.append('filters', JSON.stringify(filters))
        }

        const result = await sharedApiService.makeRequest(
          `/api/projects/activities?${params}`,
          {
            method: 'GET',
            headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
          },
          { 
            page, 
            pageSize, 
            projectId, 
            sortField, 
            sortOrder,
            filters: JSON.stringify(filters),
            bypassCache: true,
            token: tokenRef.current?.substring(0, 10) 
          }
        )

        if (!isMountedRef.current) return

        if (result.success) {
          setActivities(result.data.activities || [])
          setPagination({
            page: result.data.pagination.page - 1,
            rowsPerPage: pageSize,
            total: result.data.pagination.total
          })
        } else {
          showError(result.error || 'Failed to load activities')
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
  }, [token, projectId, filters, sortField, sortOrder, showError])
  
  const loadActivities = useCallback(async (page = 1, pageSize = 8) => {
    if (isLoadingRef.current || !isMountedRef.current) return
    
    try {
      isLoadingRef.current = true
      setLoading(true)

      // Invalidate any cached activities responses before fetching fresh data
      sharedApiService.invalidateCache('/api/projects/activities')
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString()
      })

  if (projectId) params.append('project_id', projectId)
      
      if (sortField) {
        params.append('sort_by', sortField)
        params.append('sort_order', sortOrder)
      }
      
      if (filters.length > 0) {
        params.append('filters', JSON.stringify(filters))
      }

      const result = await sharedApiService.makeRequest(
        `/api/projects/activities?${params}`,
        {
          headers: { Authorization: `Bearer ${tokenRef.current}` }
        },
        { 
          page, 
          pageSize, 
          projectId, 
          sortField, 
          sortOrder,
          filtersCount: filters.length,
          bypassCache: true,
          token: tokenRef.current?.substring(0, 10) 
        }
      )

      if (!isMountedRef.current) return

      if (result.success) {
        setActivities(result.data.activities || [])
        setPagination({
          page: result.data.pagination.page - 1,
          rowsPerPage: pageSize,
          total: result.data.pagination.total
        })
      } else {
        showError(result.error || 'Failed to load activities')
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
  }, [projectId, filters, sortField, sortOrder])

  // Filter handlers
  const handleOpenFilterDialog = () => {
    setFilterDialogOpen(true)
  }

  const handleCloseFilterDialog = () => {
    setFilterDialogOpen(false)
    setCurrentFilter({ field: '', operator: '', value: '' })
  }

  const handleAddFilter = () => {
    if (!currentFilter.field || !currentFilter.operator || !currentFilter.value) {
      showError('Please fill all filter fields')
      return
    }

    // Coerce value types based on field metadata so backend comparisons (especially equals) work
    const fieldDef = getFieldDef(currentFilter.field)
    let coercedValue = currentFilter.value

    if (fieldDef) {
      const op = currentFilter.operator

      // Normalize 'between' to an array [start, end]
      if (op === 'between') {
        const parts = Array.isArray(coercedValue)
          ? coercedValue
          : String(coercedValue).split(',')

        if (fieldDef.type === 'number') {
          coercedValue = parts.map(p => (p === '' || p === null || p === undefined) ? undefined : Number(p))
        } else if (fieldDef.type === 'boolean') {
          coercedValue = parts.map(p => (p === true || p === 'true'))
        } else {
          // date/text/select -> keep as strings
          coercedValue = parts
        }
      }
      // Normalize 'in' to an array of values
      else if (op === 'in') {
        const parts = Array.isArray(coercedValue) ? coercedValue : String(coercedValue).split(',')
        if (fieldDef.type === 'number') {
          coercedValue = parts.map(p => Number(p))
        } else if (fieldDef.type === 'boolean') {
          coercedValue = parts.map(p => (p === true || p === 'true'))
        } else {
          coercedValue = parts
        }
      }
      // For direct comparisons, coerce primitives
      else {
        if (fieldDef.type === 'number') {
          coercedValue = Number(coercedValue)
        } else if (fieldDef.type === 'boolean') {
          coercedValue = (coercedValue === true || coercedValue === 'true')
        }
        // date/text/select remain as strings
      }
    }

    setFilters(prev => [...prev, { ...currentFilter, value: coercedValue }])
    handleCloseFilterDialog()
    setPagination(prev => ({ ...prev, page: 0 }))
  }

  const handleRemoveFilter = (index) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
    setPagination(prev => ({ ...prev, page: 0 }))
  }

  const handleClearAllFilters = () => {
    setFilters([])
    setPagination(prev => ({ ...prev, page: 0 }))
  }

  // Sort handler
  const handleSort = (fieldName) => {
    if (sortField === fieldName) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(fieldName)
      setSortOrder('asc')
    }
    setPagination(prev => ({ ...prev, page: 0 }))
  }

  // Get field definition by name
  const getFieldDef = (fieldName) => {
    return fieldMetadata.find(f => f.name === fieldName)
  }

  // Get operator label
  const getOperatorLabel = (operator) => {
    const labels = {
      equals: 'Equals',
      not_equals: 'Not Equals',
      contains: 'Contains',
      starts_with: 'Starts With',
      ends_with: 'Ends With',
      greater_than: 'Greater Than',
      less_than: 'Less Than',
      between: 'Between',
      before: 'Before',
      after: 'After',
      in: 'In'
    }
    return labels[operator] || operator
  }

  // Render filter value input based on type
  const renderFilterValueInput = () => {
    const fieldDef = getFieldDef(currentFilter.field)
    if (!fieldDef) return null

    const operator = currentFilter.operator

    // Between operator needs two inputs
    if (operator === 'between') {
      const raw = currentFilter.value
      const pair = Array.isArray(raw) ? raw : String(raw || ',').split(',')
      const [start, end] = pair
      return (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Start"
            type={fieldDef.type === 'date' ? 'date' : fieldDef.type === 'number' ? 'number' : 'text'}
            value={start}
            onChange={(e) => {
              const newStart = e.target.value
              let newPair
              if (fieldDef.type === 'number') {
                newPair = [newStart === '' ? '' : Number(newStart), end === '' ? '' : Number(end)]
              } else if (fieldDef.type === 'boolean') {
                newPair = [newStart === 'true', end === 'true']
              } else {
                newPair = [newStart, end]
              }
              setCurrentFilter({ ...currentFilter, value: newPair })
            }}
            InputLabelProps={fieldDef.type === 'date' ? { shrink: true } : {}}
            fullWidth
          />
          <TextField
            label="End"
            type={fieldDef.type === 'date' ? 'date' : fieldDef.type === 'number' ? 'number' : 'text'}
            value={end}
            onChange={(e) => {
              const newEnd = e.target.value
              let newPair
              if (fieldDef.type === 'number') {
                newPair = [start === '' ? '' : Number(start), newEnd === '' ? '' : Number(newEnd)]
              } else if (fieldDef.type === 'boolean') {
                newPair = [start === 'true', newEnd === 'true']
              } else {
                newPair = [start, newEnd]
              }
              setCurrentFilter({ ...currentFilter, value: newPair })
            }}
            InputLabelProps={fieldDef.type === 'date' ? { shrink: true } : {}}
            fullWidth
          />
        </Box>
      )
    }

    // "In" operator for select fields
    if (operator === 'in' && fieldDef.type === 'select') {
      return (
        <FormControl fullWidth>
          <InputLabel>Values</InputLabel>
          <Select
            multiple
            value={Array.isArray(currentFilter.value) ? currentFilter.value : (currentFilter.value ? String(currentFilter.value).split(',') : [])}
            label="Values"
            onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value })}
          >
            {(fieldDef.options || []).map(opt => (
              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )
    }

    // Select type with options
    if (fieldDef.type === 'select' && fieldDef.options) {
      return (
        <FormControl fullWidth>
          <InputLabel>Value</InputLabel>
          <Select
            value={currentFilter.value ?? ''}
            label="Value"
            onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value })}
          >
            {fieldDef.options.map(opt => (
              <MenuItem key={opt} value={opt}>{opt}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )
    }

    // Boolean type
    if (fieldDef.type === 'boolean') {
      return (
        <FormControl fullWidth>
          <InputLabel>Value</InputLabel>
          <Select
            value={currentFilter.value === true || currentFilter.value === false ? currentFilter.value : ''}
            label="Value"
            onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value })}
          >
            <MenuItem value={true}>True</MenuItem>
            <MenuItem value={false}>False</MenuItem>
          </Select>
        </FormControl>
      )
    }

    // Date type
    if (fieldDef.type === 'date') {
      return (
        <TextField
          label="Value"
          type="date"
          value={currentFilter.value}
          onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value })}
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
      )
    }

    // Number type
    if (fieldDef.type === 'number') {
      return (
        <TextField
          label="Value"
          type="number"
          value={currentFilter.value}
          onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value })}
          fullWidth
        />
      )
    }

    // Default text input
    return (
      <TextField
        label="Value"
        value={currentFilter.value}
        onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value })}
        fullWidth
      />
    )
  }

  // Tabs removed

  const handlePageChange = (event, newPage) => {
    loadActivities(newPage + 1, pagination.rowsPerPage)
  }

  const handleRowsPerPageChange = (event) => {
    const newSize = parseInt(event.target.value, 10)
    loadActivities(1, newSize)
  }

  const handleColumnToggle = (columnName) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnName]: !prev[columnName]
    }))
  }

  const handleOpenColumnDialog = () => {
    setColumnDialogOpen(true)
  }

  const handleCloseColumnDialog = () => {
    setColumnDialogOpen(false)
  }

  const openCreate = (type = 'TASK') => {
    navigate('/dashboard/projects/activity/new', {
      state: {
        type,
        projectId: projectId || '',
        returnTo: '/dashboard/projects'
      }
    })
  }

  const openEdit = (activityId) => {
    navigate(`/dashboard/projects/activity/${activityId}`, {
      state: {
        returnTo: '/dashboard/projects'
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

  // Calculate due date styling based on days remaining
  const getDueDateStyle = useCallback((dueDate, status) => {
    // If status is Completed, use normal styling
    if (status === 'Completed') {
      return { color: 'inherit', fontWeight: 'normal' }
    }

    if (!dueDate) return { color: 'inherit', fontWeight: 'normal' }
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const due = new Date(dueDate + 'T00:00:00')
    const diffTime = due - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    // Red and bold if on or after due date
    if (diffDays <= 0) {
      return { color: '#d32f2f', fontWeight: 'bold' }
    }
    // Yellow/Orange if within 3 days
    if (diffDays <= 3) {
      return { color: '#ed6c02', fontWeight: 'normal' }
    }
    // Default color
    return { color: 'inherit', fontWeight: 'normal' }
  }, [])

  // Render cell value based on field type
  const renderCellValue = (activity, fieldName) => {
    const value = activity[fieldName]
    
    if (value === null || value === undefined) return '-'
    
    // Special handling for specific fields
    if (fieldName === 'type') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {getTypeIcon(value)}
          <Typography variant="body2">{value}</Typography>
        </Box>
      )
    }
    
    if (fieldName === 'subject') {
      return (
        <Typography variant="body2" fontWeight="medium">
          {value}
        </Typography>
      )
    }
    
    if (fieldName === 'project_id') {
      return (
        <Typography variant="body2" color="text.secondary">
          {projects.find(p => p.id === value)?.name || value || '-'}
        </Typography>
      )
    }
    
    if (fieldName === 'status') {
      return (
        <Chip
          label={value}
          color={getStatusColor(value)}
          size="small"
        />
      )
    }
    
    if (fieldName === 'start_date') {
      return formatDate(value)
    }
    
    if (fieldName === 'due_date') {
      const dateStyle = getDueDateStyle(value, activity.status)
      return (
        <Typography variant="body2" sx={{ color: dateStyle.color, fontWeight: dateStyle.fontWeight }}>
          {formatDate(value)}
        </Typography>
      )
    }
    
    if (fieldName === 'progress') {
      return `${value}%`
    }
    
    // Default: just return the value
    return value
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Project Planning</Typography>
        <Button
          variant="contained"
          startIcon={<Plus size={20} />}
          onClick={() => openCreate()}
        >
          Create Activity
        </Button>
      </Box>

      <Card>
        {/* Tabs removed: showing all activity types */}

        <CardContent>
          {/* Header Bar with Filters and Actions */}
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            {/* LEFT SIDE: Table Info */}
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                Activities List
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {pagination.total} {pagination.total === 1 ? 'item' : 'items'} total
              </Typography>
            </Box>

            {/* RIGHT SIDE: Filters and Action Buttons */}
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Active Filter Chips */}
              {filters.map((filter, index) => (
                <Chip
                  key={index}
                  label={`${getFieldDef(filter.field)?.label || filter.field}: ${getOperatorLabel(filter.operator)} ${filter.value}`}
                  onDelete={() => handleRemoveFilter(index)}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 500 }}
                />
              ))}
              {filters.length > 0 && (
                <Button 
                  size="small" 
                  onClick={handleClearAllFilters}
                  sx={{ textTransform: 'none', fontWeight: 500 }}
                >
                  Clear All
                </Button>
              )}

              {/* Sort Button */}
              <Tooltip title="Sort">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={sortOrder === 'asc' ? <SortAsc size={18} /> : <SortDesc size={18} />}
                  onClick={(e) => setSortMenuAnchor(e.currentTarget)}
                  sx={{ 
                    textTransform: 'none',
                    fontWeight: 500,
                    minWidth: '100px',
                    borderColor: sortField ? 'primary.main' : 'divider',
                    color: sortField ? 'primary.main' : 'text.secondary'
                  }}
                >
                  {sortField ? `${getFieldDef(sortField)?.label || sortField}` : 'Sort'}
                </Button>
              </Tooltip>

              {/* Filter Button */}
              <Tooltip title="Add Filter">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={
                    <Badge badgeContent={filters.length} color="primary">
                      <Filter size={18} />
                    </Badge>
                  }
                  onClick={handleOpenFilterDialog}
                  sx={{ 
                    textTransform: 'none',
                    fontWeight: 500,
                    minWidth: '100px',
                    borderColor: filters.length > 0 ? 'primary.main' : 'divider',
                    color: filters.length > 0 ? 'primary.main' : 'text.secondary'
                  }}
                >
                  {filters.length > 0 ? `${filters.length} Filter${filters.length > 1 ? 's' : ''}` : 'Filter'}
                </Button>
              </Tooltip>

              {/* Customize Columns Button */}
              <Tooltip title="Customize Columns">
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<Settings size={18} />}
                  onClick={handleOpenColumnDialog}
                  sx={{ 
                    textTransform: 'none',
                    fontWeight: 500,
                    minWidth: '100px',
                    borderColor: 'divider',
                    color: 'text.secondary'
                  }}
                >
                  Columns
                </Button>
              </Tooltip>
            </Box>
          </Box>

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
                      {orderedFields.map((field) => (
                        visibleColumns[field.name] && (
                          <TableCell key={field.name}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort(field.name)}>
                              {field.label}
                              {sortField === field.name && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                            </Box>
                          </TableCell>
                        )
                      ))}
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {activities.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={Object.values(visibleColumns).filter(v => v).length + 1} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No activities found. Create one to get started.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      activities.map((activity) => (
                        <TableRow key={activity.id} hover>
                          {orderedFields.map((field) => (
                            visibleColumns[field.name] && (
                              <TableCell key={field.name}>
                                {renderCellValue(activity, field.name)}
                              </TableCell>
                            )
                          ))}
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center' }}>
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
                            </Box>
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
                rowsPerPageOptions={[8, 25, 50, 100]}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Sort Menu */}
      <Menu
        anchorEl={sortMenuAnchor}
        open={Boolean(sortMenuAnchor)}
        onClose={() => setSortMenuAnchor(null)}
        PaperProps={{
          sx: { minWidth: 200 }
        }}
      >
        <MenuItem disabled>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            SORT BY
          </Typography>
        </MenuItem>
        <Divider />
        {fieldMetadata.filter(f => f.sortable).map((field) => (
          <MenuItem
            key={field.name}
            onClick={() => {
              if (sortField === field.name) {
                setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
              } else {
                setSortField(field.name)
                setSortOrder('asc')
              }
              setPagination(prev => ({ ...prev, page: 0 }))
              setSortMenuAnchor(null)
            }}
            selected={sortField === field.name}
          >
            <ListItemIcon>
              {sortField === field.name && (
                sortOrder === 'asc' ? <ArrowUp size={18} /> : <ArrowDown size={18} />
              )}
            </ListItemIcon>
            <ListItemText>
              {field.label}
            </ListItemText>
          </MenuItem>
        ))}
        {sortField && (
          <>
            <Divider />
            <MenuItem
              onClick={() => {
                setSortField(null)
                setSortOrder('asc')
                setPagination(prev => ({ ...prev, page: 0 }))
                setSortMenuAnchor(null)
              }}
              sx={{ color: 'error.main' }}
            >
              <ListItemIcon>
                <X size={18} />
              </ListItemIcon>
              <ListItemText>Clear Sort</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      {/* Filter Dialog */}
      <Dialog open={filterDialogOpen} onClose={handleCloseFilterDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add Filter</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {/* Field Selection - DYNAMIC from API */}
            <FormControl fullWidth>
              <InputLabel>Field</InputLabel>
              <Select
                value={currentFilter.field}
                label="Field"
                onChange={(e) => setCurrentFilter({ field: e.target.value, operator: '', value: '' })}
              >
                {fieldMetadata.filter(f => f.filterable).map(field => (
                  <MenuItem key={field.name} value={field.name}>
                    {field.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Operator Selection - DYNAMIC based on field type */}
            {currentFilter.field && (
              <FormControl fullWidth>
                <InputLabel>Operator</InputLabel>
                <Select
                  value={currentFilter.operator}
                  label="Operator"
                  onChange={(e) => setCurrentFilter({ ...currentFilter, operator: e.target.value, value: '' })}
                >
                  {(getFieldDef(currentFilter.field)?.operators || []).map(op => (
                    <MenuItem key={op} value={op}>
                      {getOperatorLabel(op)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Value Input - DYNAMIC based on field type and operator */}
            {currentFilter.field && currentFilter.operator && renderFilterValueInput()}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseFilterDialog}>Cancel</Button>
          <Button onClick={handleAddFilter} variant="contained">
            Add Filter
          </Button>
        </DialogActions>
      </Dialog>

      {/* Customize Columns Dialog */}
      <Dialog open={columnDialogOpen} onClose={handleCloseColumnDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Customize Columns</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select which columns to display in the table
          </Typography>
          <FormGroup>
            {fieldMetadata.map((field) => (
              <FormControlLabel
                key={field.name}
                control={
                  <Checkbox
                    checked={visibleColumns[field.name] || false}
                    onChange={() => handleColumnToggle(field.name)}
                  />
                }
                label={field.label}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseColumnDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default React.memo(ProjectPlanning)
