import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Avatar,
  IconButton,
  Button
} from '@mui/material'
import {
  Pencil as EditIcon,
  Trash2 as DeleteIcon,
  Plus as AddIcon,
  Shield as SecurityIcon
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSnackbar } from '../contexts/SnackbarContext'

export default function Users({ user }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const { showError, showSuccess } = useSnackbar()
  const navigate = useNavigate()

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/rbac/users', {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      } else if (response.status === 403) {
        showError('Access denied. You can only view users who have roles that you own.')
      } else {
        showError('Failed to fetch users')
      }
    } catch (err) {
      showError('Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    return status ? 'success' : 'default'
  }

  const getRoleColor = (roleName) => {
    if (roleName === 'system_admin') return 'error'
    if (roleName.includes('admin')) return 'warning'
    if (roleName.includes('@')) return 'info'
    return 'primary'
  }

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase()
  }

  const handleManageRoles = () => {
    navigate('/dashboard/role-management')
  }

  const handleInviteUser = () => {
    navigate('/dashboard/user-invitation')
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
            Users Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage users and their role assignments. You can see yourself and users who have roles that you own.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<SecurityIcon size={18} />}
            onClick={handleManageRoles}
          >
            Manage Roles
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon size={18} />}
            onClick={handleInviteUser}
          >
            Invite User
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  All Users ({users.length})
                </Typography>
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
                    {users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                          <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                              No users found
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                              You can only see yourself and users who have roles that you own.
                              Create a role and invite users to get started!
                            </Typography>
                            <Button
                              variant="contained"
                              startIcon={<AddIcon />}
                              onClick={handleInviteUser}
                              sx={{ mr: 1 }}
                            >
                              Invite User
                            </Button>
                            <Button
                              variant="outlined"
                              startIcon={<SecurityIcon />}
                              onClick={handleManageRoles}
                            >
                              Manage Roles
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                    users.map((userData) => (
                      <TableRow key={userData.id}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Avatar sx={{ width: 32, height: 32 }}>
                              {getInitials(userData.name)}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" fontWeight="medium">
                                {userData.name}
                              </Typography>
                              {userData.isInvited && (
                                <Typography variant="caption" color="text.secondary">
                                  Invited user
                                </Typography>
                              )}
                            </Box>
                          </Box>
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
                                  color={getRoleColor(role.roleName)}
                                  size="small"
                                  variant="outlined"
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
                            {userData.roles.filter(role => !role.roleName.includes('@')).length === 0 && (
                              <Chip
                                label="Basic User"
                                size="small"
                                color="default"
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={userData.active ? 'Active' : 'Inactive'}
                            color={getStatusColor(userData.active)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {new Date(userData.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" color="primary">
                            <EditIcon size={16} />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            color="error"
                            disabled={userData.id === user.id}
                          >
                            <DeleteIcon size={16} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
