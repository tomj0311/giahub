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
  Divider,
  Checkbox,
  FormControlLabel,
  FormGroup
} from '@mui/material'
import {
  Plus,
  Edit,
  ChevronRight,
  ChevronDown,
  Filter,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SortAsc,
  SortDesc,
  Settings
} from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'
import { apiCall } from '../config/api'
import sharedApiService from '../utils/apiService'

const STATUS_OPTIONS = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'ON_HOLD', 'COMPLETED']
const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent']

// localStorage keys for state persistence
const STORAGE_KEYS = {
  PAGE: 'projectTreeView_page',
  ROWS_PER_PAGE: 'projectTreeView_rowsPerPage',
  FILTERS: 'projectTreeView_filters',
  SORT_FIELD: 'projectTreeView_sortField',
  SORT_ORDER: 'projectTreeView_sortOrder',
  VISIBLE_COLUMNS: 'projectTreeView_visibleColumns'
}

function ProjectTreeView({ user }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const token = user?.token
  const tokenRef = useRef(token)
  tokenRef.current = token

  // Consistent date formatter: returns dd/mm/yyyy or '-'
  const formatDate = useCallback((dateStr) => {
    if (!dateStr) return '-'
    try {
      const d = new Date(dateStr)
      if (Number.isNaN(d.getTime())) return '-'
      // Use en-GB locale and UTC timezone to avoid TZ drift and ensure dd/mm/yyyy
      return d.toLocaleDateString('en-GB', { timeZone: 'UTC' })
    } catch {
      return '-'
    }
  }, [])
  
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

  // Helper functions for localStorage state persistence
  const saveStateToStorage = useCallback((key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error)
    }
  }, [])

  const loadStateFromStorage = useCallback((key, defaultValue) => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? JSON.parse(saved) : defaultValue
    } catch (error) {
      console.warn('Failed to load state from localStorage:', error)
      return defaultValue
    }
  }, [])

  const clearStoredState = useCallback(() => {
    try {
      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key))
    } catch (error) {
      console.warn('Failed to clear stored state:', error)
    }
  }, [])
  
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
  
  // Pagination state - load from localStorage with fallbacks
  const [page, setPage] = useState(() => loadStateFromStorage(STORAGE_KEYS.PAGE, 0))
  const [rowsPerPage, setRowsPerPage] = useState(() => loadStateFromStorage(STORAGE_KEYS.ROWS_PER_PAGE, 8))
  const [totalCount, setTotalCount] = useState(0)
  
  // Filter and sort state - load from localStorage with fallbacks
  const [filters, setFilters] = useState(() => loadStateFromStorage(STORAGE_KEYS.FILTERS, []))
  const [sortField, setSortField] = useState(() => loadStateFromStorage(STORAGE_KEYS.SORT_FIELD, null))
  const [sortOrder, setSortOrder] = useState(() => loadStateFromStorage(STORAGE_KEYS.SORT_ORDER, 'asc'))
  
  // Filter dialog state
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const [currentFilter, setCurrentFilter] = useState({
    field: '',
    operator: '',
    value: ''
  })
  
  // Sort menu state
  const [sortMenuAnchor, setSortMenuAnchor] = useState(null)
  
  // Column customization state - load from localStorage with fallbacks
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  // Predefined initial columns (common ones shown by default)
  const [visibleColumns, setVisibleColumns] = useState(() => 
    loadStateFromStorage(STORAGE_KEYS.VISIBLE_COLUMNS, {
      name: true,
      priority: true,
      status: true,
      assignee: true,
      approver: true,
      start_date: true,
      due_date: true,
      progress: true
    })
  )
  
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

  // Preferred column order
  const PREFERRED_ORDER = ['name', 'priority', 'status', 'assignee', 'approver', 'start_date', 'due_date', 'progress']

  const orderedFields = React.useMemo(() => {
    const orderIndex = (name) => {
      const idx = PREFERRED_ORDER.indexOf(name)
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
    }
    return [...fieldMetadata].sort((a, b) => orderIndex(a.name) - orderIndex(b.name))
  }, [fieldMetadata])

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

      // Invalidate cached tree results to avoid stale data and bypass cache for fresh fetch
      sharedApiService.invalidateCache('/api/projects/projects/tree')
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
          bypassCache: true,
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

  // Save state to localStorage when pagination changes
  useEffect(() => {
    saveStateToStorage(STORAGE_KEYS.PAGE, page)
  }, [page, saveStateToStorage])

  useEffect(() => {
    saveStateToStorage(STORAGE_KEYS.ROWS_PER_PAGE, rowsPerPage)
  }, [rowsPerPage, saveStateToStorage])

  // Save state to localStorage when filters change
  useEffect(() => {
    saveStateToStorage(STORAGE_KEYS.FILTERS, filters)
  }, [filters, saveStateToStorage])

  // Save state to localStorage when sort changes
  useEffect(() => {
    saveStateToStorage(STORAGE_KEYS.SORT_FIELD, sortField)
  }, [sortField, saveStateToStorage])

  useEffect(() => {
    saveStateToStorage(STORAGE_KEYS.SORT_ORDER, sortOrder)
  }, [sortOrder, saveStateToStorage])

  // Save state to localStorage when visible columns change
  useEffect(() => {
    saveStateToStorage(STORAGE_KEYS.VISIBLE_COLUMNS, visibleColumns)
  }, [visibleColumns, saveStateToStorage])

  // Pagination handlers
  const handleChangePage = (event, newPage) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10)
    setRowsPerPage(newRowsPerPage)
    setPage(0) // Reset to first page when changing rows per page
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
    // Robust empty check: allow boolean false and number 0, but disallow empty string/null/undefined and empty arrays
    const isEmptyValue = (val) => (
      val === '' || val === null || val === undefined || (Array.isArray(val) && val.length === 0)
    )

    if (!currentFilter.field || !currentFilter.operator || isEmptyValue(currentFilter.value)) {
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

    const newFilters = [...filters, { ...currentFilter, value: coercedValue }]
    setFilters(newFilters)
    handleCloseFilterDialog()
    setPage(0) // Reset to first page when adding filter
  }

  const handleRemoveFilter = (index) => {
    const newFilters = filters.filter((_, i) => i !== index)
    setFilters(newFilters)
    setPage(0) // Reset to first page when removing filter
  }

  const handleClearAllFilters = () => {
    setFilters([])
    setPage(0) // Reset to first page when clearing filters
  }

  // Sort handler
  const handleSort = (fieldName) => {
    if (sortField === fieldName) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(fieldName)
      setSortOrder('asc')
    }
    setPage(0) // Reset to first page when sorting
  }

  const toggleExpand = (projectId) => {
    setExpanded(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
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

  const openCreate = (parentId = 'root') => {
    navigate('/dashboard/projects/project/new', {
      state: {
        parentId: parentId || 'root',
        returnTo: '/dashboard/projects'
      }
    })
  }

  const openEdit = (projectId) => {
    navigate(`/dashboard/projects/project/${projectId}`, {
      state: {
        returnTo: '/dashboard/projects'
      }
    })
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

  // Calculate due date styling based on days remaining
  const getDueDateStyle = useCallback((dueDate, status) => {
    // If status is Completed, use normal styling
    if (status === 'COMPLETED') {
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

  // Get column label mapping
  const getColumnLabel = (columnName) => {
    const labels = {
      name: 'District/Assembly',
      priority: 'Priority',
      status: 'Status',
      assignee: 'Assignee',
      approver: 'Approver',
      start_date: 'Start Date',
      due_date: 'Due Date',
      progress: 'Progress'
    }
    return labels[columnName] || columnName
  }

  // Render cell value based on column type
  const renderCellValue = (node, columnName) => {
    const value = node[columnName]
    
    if (columnName === 'name') {
      return (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {value}
        </Typography>
      )
    }
    
    if (columnName === 'status') {
      return (
        <Chip
          label={getStatusLabel(value)}
          color={getStatusColor(value)}
          size="small"
        />
      )
    }
    
    if (columnName === 'start_date') {
      return formatDate(value)
    }
    
    if (columnName === 'due_date') {
      return (
        <Typography variant="body2" sx={getDueDateStyle(value, node.status)}>
          {formatDate(value)}
        </Typography>
      )
    }
    
    if (columnName === 'progress') {
      return `${value}%`
    }
    
    if (columnName === 'assignee') {
      // Use assignee_name from API if available, otherwise fall back to email
      return node.assignee_name || value || '-'
    }
    
    if (columnName === 'approver') {
      // Use approver_name from API if available, otherwise fall back to email
      return node.approver_name || value || '-'
    }
    
    return value || '-'
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
            bgcolor: level > 0 ? alpha('#000', 0.01) : 'transparent',
            cursor: 'pointer'
          }}
          onClick={() => navigate('/dashboard/projects/gantt', { 
            state: { projectId: node.id, projectName: node.name } 
          })}
        >
          {orderedFields.map((field) => {
            if (!visibleColumns[field.name]) return null

            // Special handling for 'name' column with tree structure
            if (field.name === 'name') {
              return (
                <TableCell key={field.name} sx={{ pl: 2 + level * 4, borderLeft: '3px solid', borderLeftColor: `${getStatusColor(node.status)}.main` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {hasChildren ? (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(node.id)
                        }}
                        sx={{ 
                          p: 1.5,
                          '&:hover': {
                            bgcolor: 'action.hover'
                          }
                        }}
                      >
                        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      </IconButton>
                    ) : (
                      <Box sx={{ width: 40 }} />
                    )}
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {node.name}
                    </Typography>
                  </Box>
                </TableCell>
              )
            }

            // Special handling for 'status' column with Chip
            if (field.name === 'status') {
              return (
                <TableCell key={field.name}>
                  <Chip
                    label={getStatusLabel(node.status)}
                    color={getStatusColor(node.status)}
                    size="small"
                  />
                </TableCell>
              )
            }

            // Special handling for 'due_date' with styling
            if (field.name === 'due_date') {
              return (
                <TableCell key={field.name} sx={getDueDateStyle(node.due_date, node.status)}>
                  {formatDate(node.due_date)}
                </TableCell>
              )
            }

            // Special handling for 'start_date'
            if (field.name === 'start_date') {
              return (
                <TableCell key={field.name}>
                  {formatDate(node.start_date)}
                </TableCell>
              )
            }

            // Special handling for 'assignee'
            if (field.name === 'assignee') {
              return (
                <TableCell key={field.name}>
                  {node.assignee_name || node.assignee || '-'}
                </TableCell>
              )
            }

            // Special handling for 'approver'
            if (field.name === 'approver') {
              return (
                <TableCell key={field.name}>
                  {node.approver_name || node.approver || '-'}
                </TableCell>
              )
            }

            // Special handling for 'progress'
            if (field.name === 'progress') {
              return (
                <TableCell key={field.name}>
                  {node.progress}%
                </TableCell>
              )
            }

            // Default rendering for other columns
            return (
              <TableCell key={field.name}>
                {renderCellValue(node, field.name)}
              </TableCell>
            )
          })}

          <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: { xs: 120, sm: 160 } }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
              <IconButton size="small" onClick={(e) => {
                e.stopPropagation()
                openCreate(node.id)
              }}>
                <Plus size={18} />
              </IconButton>
              <IconButton size="small" onClick={(e) => {
                e.stopPropagation()
                openEdit(node.id)
              }}>
                <Edit size={18} />
              </IconButton>
              {/* Delete button removed per requirements */}
            </Box>
          </TableCell>
        </TableRow>

        {hasChildren && isExpanded && node.children.map(child => renderTreeNode(child, level + 1))}
      </React.Fragment>
    )
  }

  return (
    <Box>
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
                    <Badge 
                      badgeContent={filters.length} 
                      color="primary"
                      sx={{
                        '& .MuiBadge-badge': {
                          right: -6,
                          top: -6,
                          border: '1px solid',
                          borderColor: 'background.paper',
                          fontSize: '0.625rem',
                          height: '16px',
                          minWidth: '16px'
                        }
                      }}
                    >
                      <Filter size={18} />
                    </Badge>
                  }
                  onClick={handleOpenFilterDialog}
                  sx={{ 
                    textTransform: 'none',
                    fontWeight: 500,
                    minWidth: '100px',
                    borderColor: filters.length > 0 ? 'primary.main' : 'divider',
                    color: filters.length > 0 ? 'primary.main' : 'text.secondary',
                    overflow: 'visible', // Allow badge to overflow button bounds
                    '& .MuiButton-startIcon': {
                      marginRight: '8px',
                      overflow: 'visible' // Allow badge overflow
                    }
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
                              {getColumnLabel(field.name)}
                              {sortField === field.name && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                            </Box>
                          </TableCell>
                        )
                      ))}
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', minWidth: { xs: 120, sm: 160 } }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projectTree.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={Object.values(visibleColumns).filter(Boolean).length + 1} align="center">
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
                rowsPerPageOptions={[8, 16, 24, 40, 80, 160]}
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
              setPage(0) // Reset to first page when sorting
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
                setPage(0) // Reset to first page when clearing sort
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



      {/* Column Customization Dialog */}
      <Dialog open={columnDialogOpen} onClose={handleCloseColumnDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Customize Columns</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select which columns to display in the table
          </Typography>
          <FormGroup>
            {orderedFields.map((field) => (
              <FormControlLabel
                key={field.name}
                control={
                  <Checkbox
                    checked={visibleColumns[field.name] || false}
                    onChange={() => handleColumnToggle(field.name)}
                  />
                }
                label={getColumnLabel(field.name)}
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

export default React.memo(ProjectTreeView)
