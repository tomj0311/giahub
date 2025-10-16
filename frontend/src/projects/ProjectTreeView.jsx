import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Chip,
  Typography,
  CircularProgress,
  Autocomplete,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  alpha,
  useTheme,
  Badge,
  Stack,
  TablePagination,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider
} from '@mui/material'
import {
  Plus,
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  Filter,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  SortAsc,
  SortDesc
} from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'
import { apiCall } from '../config/api'
import sharedApiService from '../utils/apiService'

const STATUS_OPTIONS = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ON_HOLD', 'COMPLETED']
const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent']

function ProjectTreeView({ user }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const token = user?.token
  const tokenRef = useRef(token)
  tokenRef.current = token
  
  const { showSuccess, showError } = useSnackbar()
  const { showDeleteConfirmation } = useConfirmation()

  const isMountedRef = useRef(true)
  const isLoadingTreeRef = useRef(false)
  const isLoadingMetadataRef = useRef(false)
  const isLoadingUsersRef = useRef(false)

  // Data state
  const [projectTree, setProjectTree] = useState([])
  const [allProjects, setAllProjects] = useState([])
  const [tenantUsers, setTenantUsers] = useState([])
  const [fieldMetadata, setFieldMetadata] = useState([]) // DYNAMIC - from API
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  
  // Pagination state
  const [page, setPage] = useState(0) // MUI uses 0-based
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [totalCount, setTotalCount] = useState(0)
  
  // Filter and sort state
  const [filters, setFilters] = useState([])
  const [sortField, setSortField] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')
  
  // Filter dialog state
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const [currentFilter, setCurrentFilter] = useState({
    field: '',
    operator: '',
    value: ''
  })
  
  // Sort menu state
  const [sortMenuAnchor, setSortMenuAnchor] = useState(null)
  
  // Project dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [form, setForm] = useState({
    id: null,
    name: '',
    description: '',
    parent_id: 'root',
    status: 'ON_TRACK',
    priority: 'Normal',
    assignee: '',
    approver: '',
    due_date: '',
    start_date: '',
    progress: 0,
    is_public: false
  })

  // Load field metadata from API - NO HARDCODING!
  const loadFieldMetadata = useCallback(async () => {
    if (!isMountedRef.current || isLoadingMetadataRef.current) return
    
    try {
      isLoadingMetadataRef.current = true
      
      const result = await sharedApiService.makeRequest(
        '/api/projects/projects/fields-metadata',
        {
          headers: { Authorization: `Bearer ${tokenRef.current}` }
        },
        { token: tokenRef.current?.substring(0, 10) }
      )

      if (!isMountedRef.current) return

      if (result.success) {
        setFieldMetadata(result.data.fields || [])
      } else {
        showError(result.error || 'Failed to load field metadata')
      }
    } catch (error) {
      console.error('Failed to load field metadata:', error)
      if (isMountedRef.current) {
        showError(error.message || 'Failed to load field metadata')
      }
    } finally {
      isLoadingMetadataRef.current = false
    }
  }, [])

  const loadProjectTree = useCallback(async () => {
    if (isLoadingTreeRef.current || !isMountedRef.current) return
    
    try {
      isLoadingTreeRef.current = true
      setLoading(true)

      const params = new URLSearchParams({
        root_id: 'root',
        page: (page + 1).toString(), // Backend uses 1-based
        page_size: rowsPerPage.toString()
      })
      
      if (sortField) {
        params.append('sort_field', sortField)
        params.append('sort_order', sortOrder)
      }
      
      if (filters.length > 0) {
        params.append('filters', JSON.stringify(filters))
      }

      const result = await sharedApiService.makeRequest(
        `/api/projects/projects/tree?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${tokenRef.current}` }
        },
        { 
          root_id: 'root',
          page: page + 1,
          page_size: rowsPerPage,
          filters: filters.length,
          sort: sortField,
          token: tokenRef.current?.substring(0, 10)
        }
      )

      if (!isMountedRef.current) return

      if (result.success) {
        setProjectTree(result.data.tree || [])
        setTotalCount(result.data.pagination?.total || 0)
        
        const flatList = flattenTree(result.data.tree || [])
        setAllProjects(flatList)
      } else {
        showError(result.error || 'Failed to load projects')
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
      if (isMountedRef.current) {
        showError(error.message || 'Failed to load projects')
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        isLoadingTreeRef.current = false
      }
    }
  }, [page, rowsPerPage, filters, sortField, sortOrder])

  const loadTenantUsers = useCallback(async () => {
    if (!isMountedRef.current || isLoadingUsersRef.current) return
    
    try {
      isLoadingUsersRef.current = true
      
      const result = await sharedApiService.makeRequest(
        '/api/users/',
        {
          headers: { Authorization: `Bearer ${tokenRef.current}` }
        },
        { token: tokenRef.current?.substring(0, 10) }
      )

      if (!isMountedRef.current) return

      if (result.success) {
        const mappedUsers = result.data.map(u => ({
          id: u.id,
          email: u.email,
          firstName: u.firstName || '',
          lastName: u.lastName || '',
          displayName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email
        }))
        setTenantUsers(mappedUsers)
      } else {
        showError(result.error || 'Failed to load users')
      }
    } catch (error) {
      console.error('Failed to load tenant users:', error)
      if (isMountedRef.current) {
        showError(error.message || 'Failed to load users')
      }
    } finally {
      isLoadingUsersRef.current = false
    }
  }, [])

  const flattenTree = (tree, level = 0) => {
    let result = []
    tree.forEach(node => {
      result.push({
        id: node.id,
        name: node.name,
        level: level,
        displayName: '  '.repeat(level) + (level > 0 ? '└─ ' : '') + node.name
      })
      if (node.children && node.children.length > 0) {
        result = result.concat(flattenTree(node.children, level + 1))
      }
    })
    return result
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    loadFieldMetadata() // Load metadata first
    loadTenantUsers()

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    loadProjectTree()
  }, [loadProjectTree])

  // Pagination handlers
  const handleChangePage = (event, newPage) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

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
    setPage(0)
  }

  const handleRemoveFilter = (index) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
    setPage(0)
  }

  const handleClearAllFilters = () => {
    setFilters([])
    setPage(0)
  }

  // Sort handler
  const handleSort = (fieldName) => {
    if (sortField === fieldName) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(fieldName)
      setSortOrder('asc')
    }
    setPage(0)
  }

  const toggleExpand = (projectId) => {
    setExpanded(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  const openCreate = (parentId = 'root') => {
    setForm({
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
    setIsEditMode(false)
    setFormErrors({})
    setDialogOpen(true)
  }

  const openEdit = async (projectId) => {
    try {
      const res = await apiCall(`/api/projects/projects/${projectId}`, {
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
      setIsEditMode(true)
      setFormErrors({})
      setDialogOpen(true)
    } catch (error) {
      showError('Failed to load project details')
    }
  }

  const saveProject = async () => {
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

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})

    try {
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
        setDialogOpen(false)
        loadProjectTree()
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
        setDialogOpen(false)
        loadProjectTree()
      }
    } catch (error) {
      console.error('Failed to save project:', error)
      showError(error.message || 'Failed to save project')
    }
  }

  const deleteProject = async (projectId, projectName) => {
    const confirmed = await showDeleteConfirmation(
      `Are you sure you want to delete the project "${projectName}"?`,
      'This action cannot be undone. Child projects must be deleted first.'
    )

    if (!confirmed) return

    try {
      const res = await apiCall(`/api/projects/projects/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to delete project')
      }
      showSuccess('Project deleted successfully')
      loadProjectTree()
    } catch (error) {
      console.error('Failed to delete project:', error)
      showError(error.message || 'Failed to delete project')
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      ON_TRACK: 'success',
      AT_RISK: 'warning',
      OFF_TRACK: 'error',
      COMPLETED: 'info'
    }
    return colors[status] || 'default'
  }

  const getStatusLabel = (status) => {
    const labels = {
      ON_TRACK: 'On Track',
      AT_RISK: 'At Risk',
      OFF_TRACK: 'Off Track',
      COMPLETED: 'Completed'
    }
    return labels[status] || status
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

  // Render filter value based on type
  const renderFilterValueInput = () => {
    const fieldDef = getFieldDef(currentFilter.field)
    if (!fieldDef) return null

    const operator = currentFilter.operator

    // Between operator needs two inputs
    if (operator === 'between') {
      return (
        <Stack direction="row" spacing={1}>
          <TextField
            label="From"
            type={fieldDef.type === 'date' ? 'date' : fieldDef.type === 'number' ? 'number' : 'text'}
            value={Array.isArray(currentFilter.value) ? currentFilter.value[0] || '' : ''}
            onChange={(e) => {
              const val = Array.isArray(currentFilter.value) ? [...currentFilter.value] : ['', '']
              val[0] = e.target.value
              setCurrentFilter({ ...currentFilter, value: val })
            }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="To"
            type={fieldDef.type === 'date' ? 'date' : fieldDef.type === 'number' ? 'number' : 'text'}
            value={Array.isArray(currentFilter.value) ? currentFilter.value[1] || '' : ''}
            onChange={(e) => {
              const val = Array.isArray(currentFilter.value) ? [...currentFilter.value] : ['', '']
              val[1] = e.target.value
              setCurrentFilter({ ...currentFilter, value: val })
            }}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Stack>
      )
    }

    // "In" operator for select fields
    if (operator === 'in' && fieldDef.type === 'select') {
      return (
        <Autocomplete
          multiple
          options={fieldDef.options || []}
          value={Array.isArray(currentFilter.value) ? currentFilter.value : []}
          onChange={(event, newValue) => {
            setCurrentFilter({ ...currentFilter, value: newValue })
          }}
          renderInput={(params) => <TextField {...params} label="Select values" />}
        />
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

  const renderTreeNode = (node, level = 0) => {
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expanded[node.id]

    return (
      <React.Fragment key={node.id}>
        <TableRow
          sx={{
            '&:hover': {
              bgcolor: 'action.hover'
            },
            bgcolor: level > 0 ? alpha('#000', 0.01) : 'transparent'
          }}
        >
          <TableCell sx={{ pl: 2 + level * 4, borderLeft: '3px solid', borderLeftColor: `${getStatusColor(node.status)}.main` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {hasChildren ? (
                <IconButton
                  size="small"
                  onClick={() => toggleExpand(node.id)}
                  sx={{ p: 0.5 }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </IconButton>
              ) : (
                <Box sx={{ width: 24 }} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {node.name}
              </Typography>
            </Box>
          </TableCell>

          <TableCell>{node.priority}</TableCell>

          <TableCell>
            <Chip
              label={getStatusLabel(node.status)}
              color={getStatusColor(node.status)}
              size="small"
            />
          </TableCell>

          <TableCell>{node.assignee || '-'}</TableCell>

          <TableCell>{node.approver || '-'}</TableCell>

          <TableCell>
            {node.start_date ? new Date(node.start_date).toLocaleDateString() : '-'}
          </TableCell>

          <TableCell>
            {node.due_date ? new Date(node.due_date).toLocaleDateString() : '-'}
          </TableCell>

          <TableCell>{node.progress}%</TableCell>

          <TableCell align="right">
            <Tooltip title="View Gantt Chart">
              <IconButton 
                size="small" 
                color="primary"
                onClick={() => navigate('/dashboard/projects/gantt', { 
                  state: { projectId: node.id, projectName: node.name } 
                })}
              >
                <BarChart3 size={18} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => openCreate(node.id)}>
              <Plus size={18} />
            </IconButton>
            <IconButton size="small" onClick={() => openEdit(node.id)}>
              <Edit size={18} />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => deleteProject(node.id, node.name)}
            >
              <Trash2 size={18} />
            </IconButton>
          </TableCell>
        </TableRow>

        {hasChildren && isExpanded && node.children.map(child => renderTreeNode(child, level + 1))}
      </React.Fragment>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Project Portfolio
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage and organize your project hierarchy
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus size={20} />}
          onClick={() => openCreate('root')}
        >
          Create Project
        </Button>
      </Box>

      {/* Card Container */}
      <Card>
        <CardContent>
          {/* Header Bar with Title, Filters, and Actions */}
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            {/* LEFT SIDE: Table Heading */}
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                Projects List
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {totalCount} {totalCount === 1 ? 'project' : 'projects'} total
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
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('name')}>
                          Subject
                          {sortField === 'name' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('priority')}>
                          Priority
                          {sortField === 'priority' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('status')}>
                          Status
                          {sortField === 'status' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('assignee')}>
                          Assignee
                          {sortField === 'assignee' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('approver')}>
                          Approver
                          {sortField === 'approver' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('start_date')}>
                          Start Date
                          {sortField === 'start_date' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('due_date')}>
                          Due Date
                          {sortField === 'due_date' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('progress')}>
                          Progress
                          {sortField === 'progress' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                        </Box>
                      </TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projectTree.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} align="center">
                          <Typography variant="body2" color="text.secondary">
                            No projects found. Create one to get started.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      projectTree.map(node => renderTreeNode(node, 0))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <TablePagination
                component="div"
                count={totalCount}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[10, 20, 50, 100]}
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
              setPage(0)
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
                setPage(0)
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

      {/* Create/Edit Project Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{isEditMode ? 'Edit Project' : 'Create New Project'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
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
              rows={3}
            />
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
              renderInput={(params) => <TextField {...params} label="Parent Project" />}
              fullWidth
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
                    helperText={formErrors.approver || 'Required - Must be different from Assignee'}
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
              <TextField
                label="Progress (%)"
                type="number"
                value={form.progress}
                onChange={(e) => setForm({ ...form, progress: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) })}
                fullWidth
                inputProps={{ min: 0, max: 100 }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={saveProject} variant="contained">
            {isEditMode ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default React.memo(ProjectTreeView)
