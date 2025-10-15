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
    type: true,
    subject: true,
    project_id: true,
    status: true,
    priority: true,
    assignee: true,
    approver: true,
    start_date: true,
    due_date: true,
    progress: true
  })
  
  // Restore tab from location state, or default to tab 0 (Milestones)
  const initialTab = location.state?.planningTab ?? 0
  const [currentTab, setCurrentTab] = useState(initialTab)

  const activityTypeFilter = ACTIVITY_TYPES[currentTab] || null

  // Load field metadata from API - NO HARDCODING!
  const loadFieldMetadata = useCallback(async () => {
    try {
      const res = await apiCall('/api/projects/activities/fields-metadata', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to load field metadata')
      }

      const response = await res.json()
      
      if (isMountedRef.current) {
        setFieldMetadata(response.fields || [])
        
        // Update visible columns to include any new fields from backend that aren't in the predefined list
        // This ensures all backend fields are available, but keeps the predefined initial visibility
        setVisibleColumns(prev => {
          const updated = { ...prev }
          response.fields?.forEach(field => {
            // If field is not in predefined list, set it to false (hidden by default)
            if (!(field.name in updated)) {
              updated[field.name] = false
            }
          })
          return updated
        })
      }
    } catch (error) {
      console.error('[ProjectPlanning] Failed to load field metadata:', error)
      if (isMountedRef.current) {
        showError(error.message || 'Failed to load field metadata')
      }
    }
  }, [token, showError])

  useEffect(() => {
    isMountedRef.current = true
    
    loadFieldMetadata() // Load metadata from API
    
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
        
        if (sortField) {
          params.append('sort_by', sortField)
          params.append('sort_order', sortOrder)
        }
        
        if (filters.length > 0) {
          params.append('filters', JSON.stringify(filters))
        }

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
  }, [currentTab, token, projectId, activityTypeFilter, filters, sortField, sortOrder, showError])
  
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
      
      if (sortField) {
        params.append('sort_by', sortField)
        params.append('sort_order', sortOrder)
      }
      
      if (filters.length > 0) {
        params.append('filters', JSON.stringify(filters))
      }

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
  }, [token, projectId, activityTypeFilter, filters, sortField, sortOrder, showError])

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

    setFilters(prev => [...prev, { ...currentFilter }])
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
      const [start, end] = (currentFilter.value || ',').split(',')
      return (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Start"
            type={fieldDef.type === 'date' ? 'date' : 'number'}
            value={start}
            onChange={(e) => {
              const newValue = `${e.target.value},${end}`
              setCurrentFilter({ ...currentFilter, value: newValue })
            }}
            InputLabelProps={fieldDef.type === 'date' ? { shrink: true } : {}}
            fullWidth
          />
          <TextField
            label="End"
            type={fieldDef.type === 'date' ? 'date' : 'number'}
            value={end}
            onChange={(e) => {
              const newValue = `${start},${e.target.value}`
              setCurrentFilter({ ...currentFilter, value: newValue })
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
            value={currentFilter.value ? currentFilter.value.split(',') : []}
            label="Values"
            onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value.join(',') })}
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
            value={currentFilter.value}
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
            value={currentFilter.value}
            label="Value"
            onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value })}
          >
            <MenuItem value="true">True</MenuItem>
            <MenuItem value="false">False</MenuItem>
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
        <>
          <Typography variant="body2" fontWeight="medium">
            {value}
          </Typography>
          {activity.description && (
            <Typography variant="caption" color="text.secondary">
              {activity.description.substring(0, 50)}
              {activity.description.length > 50 ? '...' : ''}
            </Typography>
          )}
        </>
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
    
    if (fieldName === 'start_date' || fieldName === 'due_date') {
      return value ? new Date(value).toLocaleDateString() : '-'
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
          {/* Header Bar with Filters and Actions */}
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            {/* LEFT SIDE: Table Info */}
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                {ACTIVITY_TYPES[currentTab]} List
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
                      {fieldMetadata.map((field) => (
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
                            No {ACTIVITY_TYPES[currentTab].toLowerCase()}s found. Create one to get started.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      activities.map((activity) => (
                        <TableRow key={activity.id} hover>
                          {fieldMetadata.map((field) => (
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
                rowsPerPageOptions={[25, 50, 100]}
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
