import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  Paper,
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
  useTheme
} from '@mui/material'
import {
  Plus,
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  Circle
} from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { useConfirmation } from '../contexts/ConfirmationContext'
import { apiCall } from '../config/api'

const STATUS_OPTIONS = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'COMPLETED']
const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Urgent']

function ProjectTreeView({ user }) {
  const theme = useTheme()
  const token = user?.token
  const { showSuccess, showError } = useSnackbar()
  const { showDeleteConfirmation } = useConfirmation()

  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)

  const [projectTree, setProjectTree] = useState([])
  const [allProjects, setAllProjects] = useState([]) // Flat list for parent selection
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({}) // Track expanded nodes
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
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

  const loadProjectTree = useCallback(async () => {
    if (isLoadingRef.current || !isMountedRef.current) return
    isLoadingRef.current = true
    setLoading(true)

    try {
      const res = await apiCall('/api/projects/projects/tree?root_id=root', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to load projects')
      }

      const response = await res.json()

      if (isMountedRef.current) {
        setProjectTree(response.tree || [])
        // Also create a flat list for parent selection
        const flatList = flattenTree(response.tree || [])
        setAllProjects(flatList)
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
      if (isMountedRef.current) {
        showError(error.message || 'Failed to load projects')
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        isLoadingRef.current = false
      }
    }
  }, [token, showError])

  // Flatten tree for parent selection dropdown
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

  useEffect(() => {
    isMountedRef.current = true
    loadProjectTree()

    return () => {
      isMountedRef.current = false
    }
  }, [])

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
      setDialogOpen(true)
    } catch (error) {
      showError('Failed to load project details')
    }
  }

  const saveProject = async () => {
    if (!form.name.trim()) {
      showError('Project name is required')
      return
    }

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

      setDialogOpen(false)
      loadProjectTree()
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

  const getPriorityColor = (priority) => {
    const colors = {
      Urgent: 'error',
      High: 'warning',
      Normal: 'info',
      Low: 'default'
    }
    return colors[priority] || 'default'
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
          {/* Subject with expand/collapse */}
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

          {/* Type */}
          <TableCell>
            <Typography variant="body2" color="text.secondary">
              {hasChildren ? 'Phase' : 'Task'}
            </Typography>
          </TableCell>

          {/* Priority */}
          <TableCell>{node.priority}</TableCell>

          {/* Status */}
          <TableCell>
            <Chip
              label={getStatusLabel(node.status)}
              color={getStatusColor(node.status)}
              size="small"
            />
          </TableCell>

          {/* Assignee */}
          <TableCell>{node.assignee || '-'}</TableCell>

          {/* Due Date */}
          <TableCell>
            {node.due_date ? new Date(node.due_date).toLocaleDateString() : '-'}
          </TableCell>

          {/* Progress */}
          <TableCell>{node.progress}%</TableCell>

          {/* Actions */}
          <TableCell align="right">
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

        {/* Render children */}
        {hasChildren && isExpanded && node.children.map(child => renderTreeNode(child, level + 1))}
      </React.Fragment>
    )
  }

  const getStatusColorHex = (status) => {
    const colors = {
      ON_TRACK: theme.palette.success.main,
      AT_RISK: theme.palette.warning.main,
      OFF_TRACK: theme.palette.error.main,
      COMPLETED: theme.palette.info.main
    }
    return colors[status] || theme.palette.text.secondary
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
                      <TableCell>Subject</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Priority</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Assignee</TableCell>
                      <TableCell>Due Date</TableCell>
                      <TableCell>Progress</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projectTree.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center">
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
            </>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{isEditMode ? 'Edit Project' : 'Create New Project'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Project Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
