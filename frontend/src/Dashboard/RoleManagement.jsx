import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material'
import {
  Plus as AddIcon,
  Pencil as EditIcon,
  Trash2 as DeleteIcon,
  Shield as SecurityIcon
} from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { api } from '../config/api'

export default function RoleManagement({ user }) {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const { showError, showSuccess } = useSnackbar()
  const [openCreateDialog, setOpenCreateDialog] = useState(false)
  const [openEditDialog, setOpenEditDialog] = useState(false)
  const [selectedRole, setSelectedRole] = useState(null)
  const [formData, setFormData] = useState({
    roleName: '',
    description: '',
    permissions: ''
  })

  useEffect(() => {
    fetchRoles()
  }, [])

  const fetchRoles = async () => {
    try {
      setLoading(true)
  const response = await api('/api/roles', {
        headers: user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}
      })

      if (response.ok) {
        const data = await response.json()
        setRoles(data)
      } else {
        showError('Failed to fetch roles')
      }
    } catch (err) {
      showError('Failed to fetch roles')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRole = async () => {
    try {
      const permissions = formData.permissions.split(',').map(p => p.trim()).filter(p => p)

  const response = await api('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({
          roleName: formData.roleName,
          description: formData.description,
          permissions: permissions
        })
      })

      if (response.ok) {
        showSuccess('Role created successfully')
        setOpenCreateDialog(false)
        setFormData({ roleName: '', description: '', permissions: '' })
        fetchRoles()
      } else {
        const data = await response.json()
        showError(data.detail || 'Failed to create role')
      }
    } catch (err) {
      showError('Failed to create role')
    }
  }

  const handleEditRole = async () => {
    try {
      const permissions = formData.permissions.split(',').map(p => p.trim()).filter(p => p)

  const response = await api(`/api/roles/${selectedRole.roleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({
          description: formData.description,
          permissions: permissions
        })
      })

      if (response.ok) {
        showSuccess('Role updated successfully')
        setOpenEditDialog(false)
        setSelectedRole(null)
        setFormData({ roleName: '', description: '', permissions: '' })
        fetchRoles()
      } else {
        const data = await response.json()
        showError(data.detail || 'Failed to update role')
      }
    } catch (err) {
      showError('Failed to update role')
    }
  }

  const handleDeleteRole = async (role) => {
    if (!window.confirm(`Are you sure you want to delete the role "${role.roleName}"?`)) {
      return
    }

    try {
  const response = await api(`/api/roles/${role.roleId}`, {
        method: 'DELETE',
        headers: user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}
      })

      if (response.ok) {
        showSuccess('Role deleted successfully')
        fetchRoles()
      } else {
        const data = await response.json()
        showError(data.detail || 'Failed to delete role')
      }
    } catch (err) {
      showError('Failed to delete role')
    }
  }

  const openCreateForm = () => {
    setFormData({ roleName: '', description: '', permissions: '' })
    setOpenCreateDialog(true)
  }

  const openEditForm = (role) => {
    setSelectedRole(role)
    setFormData({
      roleName: role.roleName,
      description: role.description,
      permissions: role.permissions.join(', ')
    })
    setOpenEditDialog(true)
  }

  const handleCloseDialogs = () => {
    setOpenCreateDialog(false)
    setOpenEditDialog(false)
    setSelectedRole(null)
    setFormData({ roleName: '', description: '', permissions: '' })
  }

  const getRoleTypeColor = (roleName) => {
    if (roleName.includes('admin')) return 'warning'
    if (roleName.includes('@')) return 'info'
    return 'primary'
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <Typography>Loading roles...</Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Role Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Create and manage roles for users on the platform
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="medium"
          startIcon={<AddIcon size={18} />}
          onClick={openCreateForm}
        >
          Create Role
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <SecurityIcon sx={{ mr: 1 }} />
                <Typography variant="h6">All Roles</Typography>
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Role Name</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Permissions</TableCell>
                      <TableCell>Created</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role.roleId}>
                        <TableCell>
                          <Chip
                            label={role.roleName}
                            color={getRoleTypeColor(role.roleName)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{role.description || 'No description'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {role.permissions.slice(0, 3).map((permission, index) => (
                              <Chip
                                key={index}
                                label={permission}
                                size="small"
                                variant="outlined"
                              />
                            ))}
                            {role.permissions.length > 3 && (
                              <Chip
                                label={`+${role.permissions.length - 3} more`}
                                size="small"
                                variant="outlined"
                                color="secondary"
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          {new Date(role.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => openEditForm(role)}
                            disabled={role.roleName.includes('@')}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleDeleteRole(role)}
                            disabled={role.roleName.includes('@')}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Create Role Dialog */}
      <Dialog open={openCreateDialog} onClose={handleCloseDialogs} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Role</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Role Name"
            fullWidth
            variant="outlined"
            value={formData.roleName}
            onChange={(e) => setFormData({ ...formData, roleName: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Permissions (comma-separated)"
            fullWidth
            variant="outlined"
            value={formData.permissions}
            onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}
            helperText="Enter permissions separated by commas (e.g., read, write, delete)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialogs} size="medium">Cancel</Button>
          <Button onClick={handleCreateRole} variant="contained" size="medium">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={openEditDialog} onClose={handleCloseDialogs} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Role: {selectedRole?.roleName}</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Permissions (comma-separated)"
            fullWidth
            variant="outlined"
            value={formData.permissions}
            onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}
            helperText="Enter permissions separated by commas (e.g., read, write, delete)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialogs} size="medium">Cancel</Button>
          <Button onClick={handleEditRole} variant="contained" size="medium">Update</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
