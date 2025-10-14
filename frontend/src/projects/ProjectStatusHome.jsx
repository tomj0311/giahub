import React, { useState, useEffect, useRef } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  CircularProgress,
  Avatar,
  useTheme,
  alpha,
  Fade,
  IconButton,
  Chip
} from '@mui/material'
import {
  FolderKanban,
  Activity,
  PauseCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Search,
  SortAsc,
  MoreVertical
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiCall } from '../config/api'
import { useSnackbar } from '../contexts/SnackbarContext'

// Summary Card Component
const SummaryCard = ({ title, value, subtitle, icon: Icon, gradient, delay = 0 }) => {
  const theme = useTheme()

  return (
    <Fade in timeout={800} style={{ transitionDelay: `${delay}ms` }}>
      <Card
        sx={{
          height: '100%',
          background: gradient,
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            right: 0,
            width: '150px',
            height: '150px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            transform: 'translate(50%, -50%)'
          }
        }}
      >
        <CardContent sx={{ p: 3, position: 'relative', zIndex: 1 }}>
          <Box display="flex" alignItems="flex-start" justifyContent="space-between">
            <Box flex={1}>
              <Avatar
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  width: 48,
                  height: 48,
                  mb: 2
                }}
              >
                <Icon size={24} />
              </Avatar>
              <Typography
                variant="h3"
                component="div"
                sx={{
                  fontWeight: 'bold',
                  mb: 1,
                  fontSize: '2.5rem'
                }}
              >
                {value}
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  opacity: 0.9,
                  fontWeight: 500
                }}
              >
                {title}
              </Typography>
              {subtitle && (
                <Box display="flex" alignItems="center" sx={{ mt: 1 }}>
                  {subtitle.includes('+') ? (
                    <TrendingUp size={16} style={{ marginRight: 4 }} />
                  ) : (
                    <TrendingDown size={16} style={{ marginRight: 4 }} />
                  )}
                  <Typography variant="caption" sx={{ opacity: 0.8 }}>
                    {subtitle}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Fade>
  )
}

// Main Project Status Home Component
export default function ProjectStatusHome({ user }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const { showError } = useSnackbar()
  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    total: 0,
    inProgress: 0,
    onHold: 0,
    completed: 0
  })
  const [districtData, setDistrictData] = useState([])
  const [projectTree, setProjectTree] = useState([])

  useEffect(() => {
    isMountedRef.current = true
    loadProjectData()

    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadProjectData = async () => {
    if (isLoadingRef.current || !isMountedRef.current) return
    isLoadingRef.current = true
    setLoading(true)

    try {
      // Load project tree to get first-level projects (districts)
      const res = await apiCall('/api/projects/projects/tree?root_id=root', {
        method: 'GET',
        headers: { Authorization: `Bearer ${user?.token}` }
      })

      if (!res.ok) {
        throw new Error('Failed to load projects')
      }

      const response = await res.json()
      const tree = response.tree || []

      if (!isMountedRef.current) return

      setProjectTree(tree)

      // Calculate summary from tree data
      const allProjects = flattenTree(tree)
      const summaryData = {
        total: allProjects.length,
        inProgress: allProjects.filter(p => p.status === 'ON_TRACK' || p.status === 'AT_RISK').length,
        onHold: allProjects.filter(p => p.status === 'OFF_TRACK').length,
        completed: allProjects.filter(p => p.status === 'COMPLETED').length
      }

      setSummary(summaryData)

      // Process first-level projects as districts
      const districts = tree.map(district => {
        const allChildren = flattenTree([district])
        const total = allChildren.length
        const inProgress = allChildren.filter(p => p.status === 'ON_TRACK' || p.status === 'AT_RISK').length
        const onHold = allChildren.filter(p => p.status === 'OFF_TRACK').length
        const completed = allChildren.filter(p => p.status === 'COMPLETED').length

        return {
          id: district.id,
          name: district.name,
          total,
          inProgress,
          onHold,
          completed,
          // Calculate percentages for trend display
          inProgressPercent: total > 0 ? ((inProgress / total) * 100).toFixed(1) : '0',
          onHoldPercent: total > 0 ? ((onHold / total) * 100).toFixed(1) : '0',
          completedPercent: total > 0 ? ((completed / total) * 100).toFixed(1) : '0'
        }
      })

      setDistrictData(districts)
    } catch (error) {
      console.error('Failed to load project data:', error)
      if (isMountedRef.current) {
        showError('Failed to load project data')
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
        isLoadingRef.current = false
      }
    }
  }

  // Helper to flatten tree structure
  const flattenTree = (tree) => {
    let result = []
    tree.forEach(node => {
      result.push(node)
      if (node.children && node.children.length > 0) {
        result = result.concat(flattenTree(node.children))
      }
    })
    return result
  }

  const handleViewReport = (district) => {
    // Navigate to projects page with the district selected
    navigate('/dashboard/projects', {
      state: {
        tab: 0, // Portfolio tab
        selectedProjectId: district.id
      }
    })
  }

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          p: 3
        }}
      >
        <CircularProgress size={48} sx={{ mb: 2 }} />
        <Typography variant="body1" color="text.secondary">
          Loading project status...
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 1 }}>
              KTDC State Project Status
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Kerala • October, 2025
            </Typography>
          </Box>
          <Box display="flex" gap={1}>
            <IconButton>
              <Search size={20} />
            </IconButton>
            <IconButton>
              <SortAsc size={20} />
            </IconButton>
            <IconButton>
              <MoreVertical size={20} />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Total Projects"
            value={summary.total}
            subtitle="+2.36%"
            icon={FolderKanban}
            gradient="linear-gradient(135deg, #4FC3F7 0%, #29B6F6 100%)"
            delay={0}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Projects in Progress"
            value={summary.inProgress}
            subtitle="-2.06%"
            icon={Activity}
            gradient="linear-gradient(135deg, #66BB6A 0%, #4CAF50 100%)"
            delay={100}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Projects On Hold"
            value={summary.onHold}
            subtitle="+2.46%"
            icon={PauseCircle}
            gradient="linear-gradient(135deg, #AB47BC 0%, #9C27B0 100%)"
            delay={200}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Projects Completed"
            value={summary.completed}
            subtitle="+3.36%"
            icon={CheckCircle}
            gradient="linear-gradient(135deg, #5C6BC0 0%, #3F51B5 100%)"
            delay={300}
          />
        </Grid>
      </Grid>

      {/* District-wise Data Table */}
      <Card sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              p: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              District wise Data
            </Typography>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                  <TableCell sx={{ fontWeight: 'bold', width: '25%' }}>
                    District
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Total
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      In Progress
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      On Hold
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Completed
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', width: '15%' }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {districtData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No district data available. Create first-level projects to see data.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  districtData.map((district, index) => (
                    <TableRow
                      key={district.id}
                      sx={{
                        '&:hover': {
                          bgcolor: 'action.hover'
                        },
                        borderBottom:
                          index === districtData.length - 1
                            ? 'none'
                            : '1px solid',
                        borderColor: 'divider'
                      }}
                    >
                      <TableCell>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {district.name}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            {district.total}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            {district.inProgress}
                          </Typography>
                          {district.total > 0 && (
                            <Chip
                              label={`+${district.inProgressPercent}%`}
                              size="small"
                              sx={{
                                mt: 0.5,
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: alpha(theme.palette.success.main, 0.1),
                                color: theme.palette.success.main,
                                fontWeight: 'bold'
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            {district.onHold}
                          </Typography>
                          {district.total > 0 && (
                            <Chip
                              label={`+${district.onHoldPercent}%`}
                              size="small"
                              sx={{
                                mt: 0.5,
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: alpha(theme.palette.warning.main, 0.1),
                                color: theme.palette.warning.main,
                                fontWeight: 'bold'
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            {district.completed}
                          </Typography>
                          {district.total > 0 && (
                            <Chip
                              label={`-${district.completedPercent}%`}
                              size="small"
                              sx={{
                                mt: 0.5,
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: alpha(theme.palette.error.main, 0.1),
                                color: theme.palette.error.main,
                                fontWeight: 'bold'
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleViewReport(district)}
                          sx={{
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 500,
                            px: 2
                          }}
                        >
                          View Report
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  )
}
