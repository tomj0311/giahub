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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Checkbox,
  ListItemText
} from '@mui/material'
import {
  UserPlus as PersonAddIcon,
  Pencil as EditIcon,
  Trash2 as DeleteIcon,
  Mail as EmailIcon,
  Shield as SecurityIcon
} from 'lucide-react'
import { useSnackbar } from '../contexts/SnackbarContext'
import { apiCall } from '../config/api'

const ITEM_HEIGHT = 48
const ITEM_PADDING_TOP = 8
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
}

export default function UserInvitation({ user }) {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const { showError, showSuccess } = useSnackbar()
  const [openInviteDialog, setOpenInviteDialog] = useState(false)
  const [openAssignDialog, setOpenAssignDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    selectedRoles: []
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      await Promise.all([fetchUsers(), fetchRoles()])
    } catch (err) {
      showError('Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await apiCall('/api/rbac/users', {
        headers: user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}
      })

      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      } else {
        showError('Failed to fetch users')
      }
    } catch (err) {
      showError('Failed to fetch users')
    }
  }

  const fetchRoles = async () => {
    try {
      const response = await apiCall('/api/roles', {
        headers: user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}
      })

      if (response.ok) {
        const data = await response.json()
        // Filter out default user roles for selection
        setRoles(data.filter(role => !role.roleName.includes('@')))
      } else {
        showError('Failed to fetch roles')
      }
    } catch (err) {
      showError('Failed to fetch roles')
    }
  }

  const handleInviteUser = async () => {
    try {
      const response = await apiCall('/api/rbac/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          roleIds: formData.selectedRoles
        })
      })

      if (response.ok) {
        const data = await response.json()
        showSuccess(`User invited successfully! Temporary password: ${data.tempPassword}`, 8000)
        setOpenInviteDialog(false)
        setFormData({ firstName: '', lastName: '', email: '', selectedRoles: [] })
        fetchUsers()
      } else {
        const data = await response.json()
        showError(data.detail || 'Failed to invite user')
      }
    } catch (err) {
      showError('Failed to invite user')
    }
  }

  const handleAssignRoles = async () => {
    try {
      const response = await apiCall(`/api/rbac/users/${selectedUser.id}/roles/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({
          roleIds: formData.selectedRoles
        })
      })

      if (response.ok) {
        showSuccess('Roles assigned successfully')
        setOpenAssignDialog(false)
        setSelectedUser(null)
        setFormData({ firstName: '', lastName: '', email: '', selectedRoles: [] })
        fetchUsers()
      } else {
        const data = await response.json()
        showError(data.detail || 'Failed to assign roles')
      }
    } catch (err) {
      showError('Failed to assign roles')
    }
  }

  const handleRemoveRole = async (userId, roleId, roleName) => {
    if (!window.confirm(`Remove role "${roleName}" from this user?`)) {
      return
    }

    try {
      const response = await apiCall(`/api/rbac/users/${userId}/roles/${roleId}`, {
        method: 'DELETE',
        headers: user?.token ? { 'Authorization': `Bearer ${user.token}` } : {}
      })

      if (response.ok) {
        showSuccess('Role removed successfully')
        fetchUsers()
      } else {
        const data = await response.json()
        showError(data.detail || 'Failed to remove role')
      }
    } catch (err) {
      showError('Failed to remove role')
    }
  }

  const openInviteForm = () => {
    setFormData({ firstName: '', lastName: '', email: '', selectedRoles: [] })
    setOpenInviteDialog(true)
  }

  const openAssignForm = (user) => {
    setSelectedUser(user)
    const currentRoleIds = user.roles.map(role => role.roleId)
    setFormData({ ...formData, selectedRoles: currentRoleIds })
    setOpenAssignDialog(true)
  }

  const handleCloseDialogs = () => {
    setOpenInviteDialog(false)
    setOpenAssignDialog(false)
    setSelectedUser(null)
    setFormData({ firstName: '', lastName: '', email: '', selectedRoles: [] })
  }

  const getUserTypeColor = (userRoles) => {
    if (userRoles.some(role => role.roleName.includes('admin'))) return 'warning'
    return 'primary'
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <Typography>Loading users...</Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            User Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Invite users to the platform and manage their roles
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="medium"
          startIcon={<PersonAddIcon />}
          onClick={openInviteForm}
        >
          Invite User
        </Button>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <EmailIcon sx={{ mr: 1 }} />
                <Typography variant="h6">All Users</Typography>
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>User</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Roles</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Joined</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((userData) => (
                      <TableRow key={userData.id}>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {userData.name ||
                              (userData.firstName || userData.lastName ?
                                `${userData.firstName || ''} ${userData.lastName || ''}`.trim() :
                                userData.email?.split('@')[0] || 'Unknown User')}
                          </Typography>
                        </TableCell>
                        <TableCell>{userData.email}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {userData.roles
                              .filter(role => !role.roleName.includes('@'))
                              .slice(0, 2)
                              .map((role) => (
                                <Chip
                                  key={role.roleId}
                                  label={role.roleName}
                                  size="small"
                                  color={getUserTypeColor([role])}
                                  onDelete={() => handleRemoveRole(userData.id, role.roleId, role.roleName)}
                                />
                              ))}
                            {userData.roles.filter(role => !role.roleName.includes('@')).length > 2 && (
                              <Chip
                                label={`+${userData.roles.filter(role => !role.roleName.includes('@')).length - 2} more`}
                                size="small"
                                variant="outlined"
                                color="secondary"
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={userData.active ? 'Active' : 'Inactive'}
                            color={userData.active ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(userData.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => openAssignForm(userData)}
                          >
                            <SecurityIcon fontSize="small" />
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

      {/* Invite User Dialog */}
      <Dialog open={openInviteDialog} onClose={handleCloseDialogs} maxWidth="sm" fullWidth>
        <DialogTitle>Invite New User</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="First Name"
            fullWidth
            variant="outlined"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Last Name"
            fullWidth
            variant="outlined"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Email"
            type="email"
            fullWidth
            variant="outlined"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Assign Roles</InputLabel>
            <Select
              multiple
              value={formData.selectedRoles}
              onChange={(e) => setFormData({ ...formData, selectedRoles: e.target.value })}
              input={<OutlinedInput label="Assign Roles" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const role = roles.find(r => r.roleId === value)
                    return (
                      <Chip key={value} label={role?.roleName} size="small" />
                    )
                  })}
                </Box>
              )}
              MenuProps={MenuProps}
            >
              {roles.map((role) => (
                <MenuItem key={role.roleId} value={role.roleId}>
                  <Checkbox checked={formData.selectedRoles.indexOf(role.roleId) > -1} />
                  <ListItemText primary={role.roleName} secondary={role.description} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialogs} size="medium">Cancel</Button>
          <Button onClick={handleInviteUser} variant="contained" size="medium">Invite</Button>
        </DialogActions>
      </Dialog>

      {/* Assign Roles Dialog */}
      <Dialog open={openAssignDialog} onClose={handleCloseDialogs} maxWidth="sm" fullWidth>
        <DialogTitle>
          Manage Roles for {selectedUser?.name ||
            (selectedUser?.firstName || selectedUser?.lastName ?
              `${selectedUser?.firstName || ''} ${selectedUser?.lastName || ''}`.trim() :
              selectedUser?.email?.split('@')[0] || 'User')}
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Assign Roles</InputLabel>
            <Select
              multiple
              value={formData.selectedRoles}
              onChange={(e) => setFormData({ ...formData, selectedRoles: e.target.value })}
              input={<OutlinedInput label="Assign Roles" />}
              renderValue={(selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((value) => {
                    const role = roles.find(r => r.roleId === value)
                    return (
                      <Chip key={value} label={role?.roleName} size="small" />
                    )
                  })}
                </Box>
              )}
              MenuProps={MenuProps}
            >
              {roles.map((role) => (
                <MenuItem key={role.roleId} value={role.roleId}>
                  <Checkbox checked={formData.selectedRoles.indexOf(role.roleId) > -1} />
                  <ListItemText primary={role.roleName} secondary={role.description} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialogs} size="medium">Cancel</Button>
          <Button onClick={handleAssignRoles} variant="contained" size="medium">Update Roles</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
