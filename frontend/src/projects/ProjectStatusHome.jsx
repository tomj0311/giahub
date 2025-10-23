import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  Chip,
  Badge,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select
} from '@mui/material'
import {
  FolderKanban,
  Activity,
  PauseCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  SortAsc,
  SortDesc,
  Filter,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  X,
  MessageCircle,
  Send,
  Bot,
  User,
  Clock,
  XCircle
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiCall } from '../config/api'
import sharedApiService from '../utils/apiService'
import { useSnackbar } from '../contexts/SnackbarContext'
import ProjectChat from './ProjectChat'

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
  const tokenRef = useRef(user?.token)
  tokenRef.current = user?.token

  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    total: 0,
    onTrack: 0,
    atRisk: 0,
    offTrack: 0,
    onHold: 0,
    completed: 0
  })
  const [districtData, setDistrictData] = useState([])
  const [projectTree, setProjectTree] = useState([])
  
  // Filter and sort state
  const [filters, setFilters] = useState([])
  const [sortField, setSortField] = useState(null)
  const [sortOrder, setSortOrder] = useState('asc')
  const [filteredAndSortedData, setFilteredAndSortedData] = useState([])
  
  // Filter dialog state
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)
  const [currentFilter, setCurrentFilter] = useState({
    field: '',
    operator: '',
    value: ''
  })
  
  // Sort menu state
  const [sortMenuAnchor, setSortMenuAnchor] = useState(null)

  // Apply filters and sorting to district data
  const applyFiltersAndSort = useCallback((data) => {
    let result = [...data]

    // Apply filters
    if (filters.length > 0) {
      result = result.filter(district => {
        return filters.every(filter => {
          const value = district[filter.field]
          const filterValue = filter.value.toLowerCase()
          
          switch (filter.operator) {
            case 'equals':
              return value?.toString().toLowerCase() === filterValue
            case 'not_equals':
              return value?.toString().toLowerCase() !== filterValue
            case 'contains':
              return value?.toString().toLowerCase().includes(filterValue)
            case 'starts_with':
              return value?.toString().toLowerCase().startsWith(filterValue)
            case 'ends_with':
              return value?.toString().toLowerCase().endsWith(filterValue)
            case 'greater_than':
              return Number(value) > Number(filter.value)
            case 'less_than':
              return Number(value) < Number(filter.value)
            default:
              return true
          }
        })
      })
    }

    // Apply sorting
    if (sortField) {
      result.sort((a, b) => {
        const aVal = a[sortField]
        const bVal = b[sortField]
        
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal
        }
        
        const aStr = aVal.toString().toLowerCase()
        const bStr = bVal.toString().toLowerCase()
        
        if (sortOrder === 'asc') {
          return aStr.localeCompare(bStr)
        } else {
          return bStr.localeCompare(aStr)
        }
      })
    }

    return result
  }, [filters, sortField, sortOrder])

  // Update filtered and sorted data when filters or data change
  useEffect(() => {
    const result = applyFiltersAndSort(districtData)
    setFilteredAndSortedData(result)
  }, [districtData, applyFiltersAndSort])

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
  }

  const handleRemoveFilter = (index) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }

  const handleClearAllFilters = () => {
    setFilters([])
  }

  // Sort handler
  const handleSort = (fieldName) => {
    if (sortField === fieldName) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(fieldName)
      setSortOrder('asc')
    }
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
      less_than: 'Less Than'
    }
    return labels[operator] || operator
  }

  const loadProjectData = useCallback(async () => {
    if (!isMountedRef.current) return
    
    // Prevent duplicate calls
    if (isLoadingRef.current) {
      return
    }

    try {
      isLoadingRef.current = true
      setLoading(true)

      // Use NEW API endpoint that returns flat list grouped by district
      const result = await sharedApiService.makeRequest(
        '/api/projects/projects/status-summary',
        {
          method: 'GET',
          headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
        },
        { token: tokenRef.current?.substring(0, 10) }
      )

      if (!isMountedRef.current) return

      if (result.success) {
        const data = result.data
        
        // Set summary data directly from API
        setSummary({
          total: data.summary?.total || 0,
          onTrack: data.summary?.onTrack || 0,
          atRisk: data.summary?.atRisk || 0,
          offTrack: data.summary?.offTrack || 0,
          onHold: data.summary?.onHold || 0,
          completed: data.summary?.completed || 0
        })

        // Set district data directly from API (already grouped and calculated)
        const districts = (data.districts || []).map(district => ({
          id: district.id,
          name: district.name,
          total: district.total,
          onTrack: district.onTrack,
          atRisk: district.atRisk,
          offTrack: district.offTrack,
          onHoldOnly: district.onHold,
          completed: district.completed,
          onTrackPercent: district.onTrackPercent,
          atRiskPercent: district.atRiskPercent,
          offTrackPercent: district.offTrackPercent,
          onHoldPercent: district.onHoldPercent,
          completedPercent: district.completedPercent
        }))

        setDistrictData(districts)
        setProjectTree(data.allProjects || [])
      } else {
        showError(result.error || 'Failed to load project data')
      }
    } catch (error) {
      console.error('Failed to load project data:', error)
      if (isMountedRef.current) {
        showError('Failed to load project data')
      }
    } finally {
      if (isMountedRef.current) {
        isLoadingRef.current = false
        setLoading(false)
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
        await loadProjectData()
      } catch (err) {
        console.error('❌ PROJECTSTATUSHOME Error during initialization:', err)
      }
    }
    
    loadData()
    
    return () => {
      // Set mounted to false FIRST to prevent any state updates
      isMountedRef.current = false
      isLoadingRef.current = false
    }
  }, []); // EMPTY DEPENDENCIES - NO BULLSHIT

  const handleViewReport = (district) => {
    // Navigate to Gantt chart page with the selected district
    navigate('/dashboard/projects/gantt', {
      state: {
        projectId: district.id, // Keep for compatibility but not used when fromDistrictView is true
        projectName: district.name,
        districtName: district.name, // The actual district name for filtering
        fromDistrictView: true // Flag to indicate coming from district view
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
    <Box>
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
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="Total Projects"
            value={summary.total}
            subtitle="+2.36%"
            icon={FolderKanban}
            gradient="linear-gradient(135deg, #4FC3F7 0%, #29B6F6 100%)"
            delay={0}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="On Track"
            value={summary.onTrack}
            subtitle="+1.25%"
            icon={Activity}
            gradient="linear-gradient(135deg, #66BB6A 0%, #4CAF50 100%)"
            delay={100}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="At Risk"
            value={summary.atRisk}
            subtitle="-2.06%"
            icon={TrendingUp}
            gradient="linear-gradient(135deg, #FF9800 0%, #F57C00 100%)"
            delay={200}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="Off Track"
            value={summary.offTrack}
            subtitle="+1.8%"
            icon={TrendingDown}
            gradient="linear-gradient(135deg, #F44336 0%, #D32F2F 100%)"
            delay={300}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="On Hold"
            value={summary.onHold}
            subtitle="+2.46%"
            icon={PauseCircle}
            gradient="linear-gradient(135deg, #AB47BC 0%, #9C27B0 100%)"
            delay={400}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <SummaryCard
            title="Completed"
            value={summary.completed}
            subtitle="+3.36%"
            icon={CheckCircle}
            gradient="linear-gradient(135deg, #5C6BC0 0%, #3F51B5 100%)"
            delay={500}
          />
        </Grid>
      </Grid>

      {/* District-wise Data Table */}
      <Card sx={{ boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
        <CardContent sx={{ p: 0 }}>
          {/* Header Bar with Title, Count, Filters and Actions */}
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            {/* LEFT SIDE: Title and Count */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                District wise Data
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredAndSortedData.length} of {districtData.length} {districtData.length === 1 ? 'district' : 'districts'}
              </Typography>
            </Box>

            {/* RIGHT SIDE: Filters and Action Buttons */}
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Active Filter Chips */}
              {filters.map((filter, index) => (
                <Chip
                  key={index}
                  label={`${filter.field}: ${getOperatorLabel(filter.operator)} ${filter.value}`}
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
                  {sortField ? sortField : 'Sort'}
                </Button>
              </Tooltip>

            </Box>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.05) }}>
                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }} onClick={() => handleSort('name')}>
                      District
                      {sortField === 'name' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', justifyContent: 'center' }} onClick={() => handleSort('total')}>
                      <Typography variant="body2" color="text.secondary">
                        Total
                      </Typography>
                      {sortField === 'total' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', justifyContent: 'center' }} onClick={() => handleSort('onTrack')}>
                      <Typography variant="body2" color="text.secondary">
                        On Track
                      </Typography>
                      {sortField === 'onTrack' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', justifyContent: 'center' }} onClick={() => handleSort('atRisk')}>
                      <Typography variant="body2" color="text.secondary">
                        At Risk
                      </Typography>
                      {sortField === 'atRisk' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', justifyContent: 'center' }} onClick={() => handleSort('offTrack')}>
                      <Typography variant="body2" color="text.secondary">
                        Off Track
                      </Typography>
                      {sortField === 'offTrack' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', justifyContent: 'center' }} onClick={() => handleSort('onHoldOnly')}>
                      <Typography variant="body2" color="text.secondary">
                        On Hold
                      </Typography>
                      {sortField === 'onHoldOnly' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', justifyContent: 'center' }} onClick={() => handleSort('completed')}>
                      <Typography variant="body2" color="text.secondary">
                        Completed
                      </Typography>
                      {sortField === 'completed' && (sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', width: '12%' }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAndSortedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        {districtData.length === 0 
                          ? 'No district data available. Create first-level projects to see data.'
                          : 'No districts match the current filters.'
                        }
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedData.map((district, index) => (
                    <TableRow
                      key={district.id}
                      sx={{
                        '&:hover': {
                          bgcolor: 'action.hover'
                        },
                        borderBottom:
                          index === filteredAndSortedData.length - 1
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
                            {district.onTrack}
                          </Typography>
                          {district.total > 0 && (
                            <Chip
                              label={`${district.onTrackPercent}%`}
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
                            {district.atRisk}
                          </Typography>
                          {district.total > 0 && (
                            <Chip
                              label={`${district.atRiskPercent}%`}
                              size="small"
                              sx={{
                                mt: 0.5,
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: alpha('#FF9800', 0.1),
                                color: '#FF9800',
                                fontWeight: 'bold'
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            {district.offTrack}
                          </Typography>
                          {district.total > 0 && (
                            <Chip
                              label={`${district.offTrackPercent}%`}
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
                      <TableCell align="center">
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                            {district.onHoldOnly}
                          </Typography>
                          {district.total > 0 && (
                            <Chip
                              label={`${district.onHoldPercent}%`}
                              size="small"
                              sx={{
                                mt: 0.5,
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: alpha('#AB47BC', 0.1),
                                color: '#AB47BC',
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
                              label={`${district.completedPercent}%`}
                              size="small"
                              sx={{
                                mt: 0.5,
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: alpha(theme.palette.primary.main, 0.1),
                                color: theme.palette.primary.main,
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
        {[
          { key: 'name', label: 'District Name' },
          { key: 'total', label: 'Total Projects' },
          { key: 'onTrack', label: 'On Track' },
          { key: 'atRisk', label: 'At Risk' },
          { key: 'offTrack', label: 'Off Track' },
          { key: 'onHoldOnly', label: 'On Hold' },
          { key: 'completed', label: 'Completed' }
        ].map((field) => (
          <MenuItem
            key={field.key}
            onClick={() => {
              if (sortField === field.key) {
                setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
              } else {
                setSortField(field.key)
                setSortOrder('asc')
              }
              setSortMenuAnchor(null)
            }}
            selected={sortField === field.key}
          >
            <ListItemIcon>
              {sortField === field.key && (
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
            {/* Field Selection */}
            <FormControl fullWidth>
              <InputLabel>Field</InputLabel>
              <Select
                value={currentFilter.field}
                label="Field"
                onChange={(e) => setCurrentFilter({ field: e.target.value, operator: '', value: '' })}
              >
                <MenuItem value="name">District Name</MenuItem>
                <MenuItem value="total">Total Projects</MenuItem>
                <MenuItem value="onTrack">On Track</MenuItem>
                <MenuItem value="atRisk">At Risk</MenuItem>
                <MenuItem value="offTrack">Off Track</MenuItem>
                <MenuItem value="onHoldOnly">On Hold</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
              </Select>
            </FormControl>

            {/* Operator Selection */}
            {currentFilter.field && (
              <FormControl fullWidth>
                <InputLabel>Operator</InputLabel>
                <Select
                  value={currentFilter.operator}
                  label="Operator"
                  onChange={(e) => setCurrentFilter({ ...currentFilter, operator: e.target.value, value: '' })}
                >
                  {currentFilter.field === 'name' ? (
                    <>
                      <MenuItem value="equals">Equals</MenuItem>
                      <MenuItem value="not_equals">Not Equals</MenuItem>
                      <MenuItem value="contains">Contains</MenuItem>
                      <MenuItem value="starts_with">Starts With</MenuItem>
                      <MenuItem value="ends_with">Ends With</MenuItem>
                    </>
                  ) : (
                    <>
                      <MenuItem value="equals">Equals</MenuItem>
                      <MenuItem value="not_equals">Not Equals</MenuItem>
                      <MenuItem value="greater_than">Greater Than</MenuItem>
                      <MenuItem value="less_than">Less Than</MenuItem>
                    </>
                  )}
                </Select>
              </FormControl>
            )}

            {/* Value Input */}
            {currentFilter.field && currentFilter.operator && (
              <TextField
                label="Value"
                type={currentFilter.field === 'name' ? 'text' : 'number'}
                value={currentFilter.value}
                onChange={(e) => setCurrentFilter({ ...currentFilter, value: e.target.value })}
                fullWidth
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseFilterDialog}>Cancel</Button>
          <Button onClick={handleAddFilter} variant="contained">
            Add Filter
          </Button>
        </DialogActions>
      </Dialog>

      {/* Project Chat Component */}
      <ProjectChat user={user} />
    </Box>
  )
}
