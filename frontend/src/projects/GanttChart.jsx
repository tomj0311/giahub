import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Typography,
  Chip,
  CircularProgress,
  IconButton,
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
  Button
} from '@mui/material'
import { ChevronRight, ChevronDown, ArrowLeft, ZoomIn, ZoomOut } from 'lucide-react'
import { apiCall } from '../config/api'
import { useSnackbar } from '../contexts/SnackbarContext'

function GanttChart({ user, projectId: propProjectId }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const token = user?.token
  const { showError } = useSnackbar()
  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)

  // Get project ID from props or location state
  const projectId = propProjectId || location.state?.projectId
  const projectName = location.state?.projectName

  const [project, setProject] = useState(null)
  const [projectTree, setProjectTree] = useState([]) // Store project and all children
  const [activitiesByProject, setActivitiesByProject] = useState({})
  const [ganttExpanded, setGanttExpanded] = useState({})
  const [loading, setLoading] = useState(true)
  const [timelineStart, setTimelineStart] = useState(null)
  const [timelineEnd, setTimelineEnd] = useState(null)
  const [timelineMonths, setTimelineMonths] = useState([])
  const [timelineDays, setTimelineDays] = useState([])
  const [zoomLevel, setZoomLevel] = useState(1)
  const ganttRef = useRef(null)

  // Handle zoom with mouse wheel
  useEffect(() => {
    const handleWheel = (e) => {
      if (ganttRef.current && ganttRef.current.contains(e.target)) {
        e.preventDefault()
        e.stopPropagation()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        setZoomLevel(prev => Math.max(0.5, Math.min(3, prev + delta)))
      }
    }

    const ganttElement = ganttRef.current
    if (ganttElement) {
      ganttElement.addEventListener('wheel', handleWheel, { passive: false })
      return () => {
        ganttElement.removeEventListener('wheel', handleWheel)
      }
    }
  }, [loading, projectTree]) // Re-attach after loading completes and tree is set

  useEffect(() => {
    isMountedRef.current = true
    if (projectId) {
      loadProjectData()
    }
    return () => {
      isMountedRef.current = false
    }
  }, [projectId])

  const loadProjectData = async () => {
    if (isLoadingRef.current || !projectId) return
    isLoadingRef.current = true
    setLoading(true)

    try {
      // First, load the single project details
      const projectRes = await apiCall(`/api/projects/projects/${projectId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!projectRes.ok) {
        const error = await projectRes.json()
        throw new Error(error.detail || 'Failed to load project')
      }

      const projectData = await projectRes.json()
      
      if (!isMountedRef.current) return
      
      console.log('[GanttChart] Loaded project:', projectData)
      setProject(projectData)

      // Now load project tree (project + all children)
      const params = new URLSearchParams({
        root_id: projectId,
        page: '1',
        page_size: '1000' // Load all children
      })

      let tree = []
      
      const treeRes = await apiCall(`/api/projects/projects/tree?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!treeRes.ok) {
        console.warn('[GanttChart] Failed to load project tree, will show single project only')
        // If tree fails, just use the single project
        tree = [projectData]
      } else {
        const treeData = await treeRes.json()
        console.log('[GanttChart] Loaded tree:', treeData)
        
        tree = treeData.tree || []
        if (tree.length === 0) {
          tree = [projectData]
        }
      }
      
      if (!isMountedRef.current) return
      setProjectTree(tree)
      
      console.log('[GanttChart] Tree structure:', JSON.stringify(tree, null, 2))
      
      // Auto-expand ALL projects and their children recursively
      const expandedState = {}
      const flattenProjects = (nodes) => {
        nodes.forEach(node => {
          expandedState[node.id] = true // Always expand
          console.log(`[GanttChart] Expanding project: ${node.name} (${node.id})`)
          if (node.children && node.children.length > 0) {
            console.log(`[GanttChart] Project ${node.name} has ${node.children.length} children`)
            flattenProjects(node.children)
          }
        })
      }
      
      flattenProjects(tree)
      console.log('[GanttChart] Expanded state:', expandedState)
      setGanttExpanded(expandedState)

      // Load activities for all projects
      await loadActivitiesForAllProjects(tree)

    } catch (error) {
      console.error('[GanttChart] Error:', error)
      if (isMountedRef.current) {
        showError(error.message || 'Failed to load project data')
        setProject(null) // Ensure project is null to show error state
      }
    } finally {
      isLoadingRef.current = false
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  const loadActivitiesForProject = async (projId) => {
    try {
      const params = new URLSearchParams({
        page: '1',
        page_size: '200',
        project_id: projId
      })
      
      const res = await apiCall(`/api/projects/activities?${params}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        console.log(`[GanttChart] Loaded ${data.activities?.length || 0} activities for project ${projId}`)
        if (isMountedRef.current) {
          setActivitiesByProject(prev => ({
            ...prev,
            [projId]: data.activities || []
          }))
          
          // Recalculate timeline with activities
          if (project) {
            calculateTimeline([project], data.activities || [])
          }
        }
      }
    } catch (error) {
      console.error('[GanttChart] Error loading activities:', error)
    }
  }

  // Load activities for all projects in the tree
  const loadActivitiesForAllProjects = async (tree) => {
    const allActivities = {}
    const allProjects = []

    // Flatten tree to get all project IDs
    const collectProjects = (nodes) => {
      nodes.forEach(node => {
        allProjects.push(node)
        if (node.children && node.children.length > 0) {
          collectProjects(node.children)
        }
      })
    }
    collectProjects(tree)

    // Load activities for each project
    for (const proj of allProjects) {
      try {
        const params = new URLSearchParams({
          page: '1',
          page_size: '200',
          project_id: proj.id
        })
        
        const res = await apiCall(`/api/projects/activities?${params}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        if (res.ok) {
          const data = await res.json()
          allActivities[proj.id] = data.activities || []
          console.log(`[GanttChart] Loaded ${data.activities?.length || 0} activities for project ${proj.id}`)
        }
      } catch (error) {
        console.error(`[GanttChart] Error loading activities for project ${proj.id}:`, error)
      }
    }

    if (isMountedRef.current) {
      setActivitiesByProject(allActivities)
      
      // Collect all activities for timeline calculation
      const allActivityList = Object.values(allActivities).flat()
      calculateTimeline(allProjects, allActivityList)
    }
  }

  const parseDate = (dateStr) => {
    if (!dateStr) return null
    
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-').map(Number)
      return new Date(year, month - 1, day)
    }
    
    return new Date(dateStr)
  }

  const calculateTimeline = (projectList, activityList) => {
    const allDates = []

    projectList.forEach(proj => {
      if (proj.start_date) allDates.push(parseDate(proj.start_date))
      if (proj.due_date) allDates.push(parseDate(proj.due_date))
    })

    activityList.forEach(activity => {
      if (activity.start_date) allDates.push(parseDate(activity.start_date))
      if (activity.due_date) allDates.push(parseDate(activity.due_date))
    })

    if (allDates.length === 0) {
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth() + 2, 0)
      setTimelineStart(start)
      setTimelineEnd(end)
      generateMonths(start, end)
      return
    }

    const minDate = new Date(Math.min(...allDates))
    const maxDate = new Date(Math.max(...allDates))
    
    const start = new Date(minDate)
    start.setDate(start.getDate() - 10)
    
    const end = new Date(maxDate)
    end.setDate(end.getDate() + 10)

    setTimelineStart(start)
    setTimelineEnd(end)
    generateMonths(start, end)
  }

  const generateMonths = (start, end) => {
    const months = []
    const days = []
    let current = new Date(start)

    while (current <= end) {
      months.push(new Date(current))
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    }

    current = new Date(start)
    while (current <= end) {
      days.push(new Date(current))
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)
    }

    setTimelineMonths(months)
    setTimelineDays(days)
  }

  const calculateBarPosition = (startDate, dueDate) => {
    if (!startDate || !dueDate || !timelineStart || !timelineEnd || !timelineDays.length) {
      return { left: '0px', width: '0px' }
    }

    const start = parseDate(startDate)
    const due = parseDate(dueDate)
    
    const dayWidth = 30 * zoomLevel
    const msPerDay = 1000 * 60 * 60 * 24
    
    const daysFromStart = (start - timelineStart) / msPerDay
    const durationInDays = (due - start) / msPerDay
    
    const leftPx = Math.max(0, daysFromStart * dayWidth)
    const widthPx = Math.max(dayWidth, durationInDays * dayWidth)

    return {
      left: `${leftPx}px`,
      width: `${widthPx}px`
    }
  }

  const toggleGanttExpand = (projId) => {
    setGanttExpanded(prev => ({
      ...prev,
      [projId]: !prev[projId]
    }))
  }

  const getStatusColor = (status) => {
    const colors = {
      ON_TRACK: 'success',
      AT_RISK: 'warning',
      OFF_TRACK: 'error',
      COMPLETED: 'info',
      'New': 'info',
      'In Progress': 'primary',
      'On Hold': 'warning',
      'Completed': 'success',
      'Cancelled': 'error'
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

  const renderGanttProjectNode = (proj, level = 0) => {
    const hasActivities = activitiesByProject[proj.id] && activitiesByProject[proj.id].length > 0
    const hasChildren = proj.children && proj.children.length > 0
    const isExpanded = ganttExpanded[proj.id]

    console.log(`[Render] Project: ${proj.name}, Level: ${level}, HasChildren: ${hasChildren}, Children Count: ${proj.children?.length || 0}, IsExpanded: ${isExpanded}`)

    return (
      <React.Fragment key={proj.id}>
        <TableRow
          sx={{
            '&:hover': {
              bgcolor: 'action.hover'
            },
            bgcolor: level > 0 ? alpha('#000', 0.01 * level) : 'transparent'
          }}
        >
          <TableCell sx={{ pl: 2 + level * 4, borderLeft: '3px solid', borderLeftColor: `${getStatusColor(proj.status)}.main` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {hasActivities || hasChildren ? (
                <IconButton
                  size="small"
                  onClick={() => toggleGanttExpand(proj.id)}
                  sx={{ p: 0.5 }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </IconButton>
              ) : (
                <Box sx={{ width: 24 }} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {proj.name}
              </Typography>
            </Box>
          </TableCell>

          <TableCell>
            <Chip
              label={getStatusLabel(proj.status)}
              color={getStatusColor(proj.status)}
              size="small"
            />
          </TableCell>

          <TableCell>{proj.assignee || '-'}</TableCell>

          <TableCell>
            {proj.due_date ? new Date(proj.due_date).toLocaleDateString() : '-'}
          </TableCell>

          <TableCell>{proj.progress}%</TableCell>
        </TableRow>

        {/* Render activities if expanded and has activities */}
        {isExpanded && hasActivities && activitiesByProject[proj.id].map(activity => (
          <TableRow
            key={`activity-${activity.id}`}
            onClick={() => navigate(`/dashboard/projects/activity/${activity.id}`, {
              state: {
                returnTo: '/dashboard/projects/gantt',
                projectId: projectId,
                projectName: projectName
              }
            })}
            sx={{
              '&:hover': {
                bgcolor: 'action.hover',
                cursor: 'pointer'
              },
              bgcolor: alpha('#000', 0.02 + 0.01 * level)
            }}
          >
            <TableCell sx={{ pl: 6 + level * 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 24 }} />
                <Typography variant="body2">{activity.subject}</Typography>
              </Box>
            </TableCell>
            <TableCell>
              <Chip
                label={activity.status}
                color={getStatusColor(activity.status)}
                size="small"
                variant="outlined"
              />
            </TableCell>
            <TableCell>{activity.assignee || '-'}</TableCell>
            <TableCell>
              {activity.due_date ? new Date(activity.due_date).toLocaleDateString() : '-'}
            </TableCell>
            <TableCell>{activity.progress || 0}%</TableCell>
          </TableRow>
        ))}

        {/* Render child projects if expanded and has children */}
        {isExpanded && hasChildren && (
          <>
            {console.log(`[Render] Rendering ${proj.children.length} children for ${proj.name}`)}
            {proj.children.map(child => renderGanttProjectNode(child, level + 1))}
          </>
        )}
      </React.Fragment>
    )
  }

  const renderTimelineNode = (proj, level = 0) => {
    const hasActivities = activitiesByProject[proj.id] && activitiesByProject[proj.id].length > 0
    const hasChildren = proj.children && proj.children.length > 0
    const isExpanded = ganttExpanded[proj.id]

    console.log(`[Timeline Render] Project: ${proj.name}, Level: ${level}, HasChildren: ${hasChildren}, IsExpanded: ${isExpanded}`)

    return (
      <React.Fragment key={proj.id}>
        <Box sx={{ 
          height: 41, 
          borderBottom: 1, borderColor: 'divider',
          position: 'relative',
          bgcolor: level > 0 ? alpha('#000', 0.01 * level) : 'transparent'
        }}>
          {proj.start_date && proj.due_date && (
            <Box sx={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              height: 20,
              backgroundColor: 'primary.main',
              opacity: 0.8 - (level * 0.1),
              borderRadius: 1,
              ...calculateBarPosition(proj.start_date, proj.due_date)
            }} />
          )}
        </Box>

        {/* Render activity timelines if expanded and has activities */}
        {isExpanded && hasActivities && activitiesByProject[proj.id].map(activity => (
          <Box key={`timeline-activity-${activity.id}`} sx={{ 
            height: 41, 
            borderBottom: 1, borderColor: 'divider',
            position: 'relative',
            bgcolor: alpha('#000', 0.02 + 0.01 * level)
          }}>
            {activity.start_date && activity.due_date && (
              <Box 
                onClick={() => navigate(`/dashboard/projects/activity/${activity.id}`, {
                  state: {
                    returnTo: '/dashboard/projects/gantt',
                    projectId: projectId,
                    projectName: projectName
                  }
                })}
                sx={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: 16,
                  backgroundColor: 'info.main',
                  opacity: 0.6,
                  borderRadius: 1,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': {
                    opacity: 0.9,
                    height: 20,
                    backgroundColor: 'info.dark'
                  },
                  ...calculateBarPosition(activity.start_date, activity.due_date)
                }} 
              />
            )}
          </Box>
        ))}

        {/* Render child project timelines if expanded and has children */}
        {isExpanded && hasChildren && (
          <>
            {console.log(`[Timeline Render] Rendering ${proj.children.length} children timelines for ${proj.name}`)}
            {proj.children.map(child => renderTimelineNode(child, level + 1))}
          </>
        )}
      </React.Fragment>
    )
  }

  if (!projectId) {
    return (
      <Box>
        <Typography variant="h5" color="text.secondary">
          No project selected
        </Typography>
        <Button
          startIcon={<ArrowLeft size={20} />}
          onClick={() => navigate('/dashboard/projects')}
          sx={{ mt: 2 }}
        >
          Back to Projects
        </Button>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!project) {
    return (
      <Box>
        <Typography variant="h5" color="error">
          Failed to load project
        </Typography>
        <Button
          startIcon={<ArrowLeft size={20} />}
          onClick={() => navigate('/dashboard/projects')}
          sx={{ mt: 2 }}
        >
          Back to Projects
        </Button>
      </Box>
    )
  }

  return (
    <Box sx={{ height: 'calc(100vh - 185px)', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Button
            startIcon={<ArrowLeft size={20} />}
            onClick={() => navigate('/dashboard/projects')}
            sx={{ mb: 1 }}
            size="small"
          >
            Back to Portfolio
          </Button>
          <Typography variant="h4" gutterBottom>
            Gantt Chart: {project.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Visual timeline of project and activities
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <IconButton onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.1))} size="small">
            <ZoomOut size={20} />
          </IconButton>
          <Typography variant="caption">
            {Math.round(zoomLevel * 100)}%
          </Typography>
          <IconButton onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.1))} size="small">
            <ZoomIn size={20} />
          </IconButton>
        </Box>
      </Box>

      {/* Gantt Chart */}
      <Box sx={{ display: 'flex', border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        {/* Left side - Project/Activity List */}
        <Card sx={{ minWidth: 800, borderRadius: 0, boxShadow: 'none', borderRight: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Subject</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Due Date</TableCell>
                    <TableCell>Progress</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {projectTree.map(proj => renderGanttProjectNode(proj, 0))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        {/* Right side - Timeline */}
        <Box 
          ref={ganttRef}
          sx={{ 
            flex: 1, 
            minWidth: 600,
            overflow: 'auto',
            position: 'relative'
          }}
        >
          {/* Timeline Header */}
          <Box sx={{ 
            position: 'sticky',
            top: 0,
            zIndex: 2,
            backgroundColor: 'background.paper'
          }}>
            {/* Months Row */}
            <Box sx={{ 
              display: 'flex', 
              backgroundColor: 'background.paper', 
              borderBottom: 1, 
              borderColor: 'divider',
              minHeight: '24px',
              width: `${zoomLevel * 100}%`
            }}>
              {timelineMonths.map((month, index) => {
                const daysInMonth = timelineDays.filter(day => 
                  day.getMonth() === month.getMonth() && 
                  day.getFullYear() === month.getFullYear() &&
                  day >= timelineStart &&
                  day <= timelineEnd
                ).length
                
                return (
                  <Box 
                    key={index} 
                    sx={{ 
                      width: `${(daysInMonth * 30 * zoomLevel)}px`,
                      flexShrink: 0,
                      py: 0.5,
                      px: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center', 
                      borderRight: index < timelineMonths.length - 1 ? 1 : 'none', 
                      borderColor: 'divider'
                    }}
                  >
                    <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.7rem' }}>
                      {month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </Typography>
                  </Box>
                )
              })}
            </Box>

            {/* Days Row */}
            <Box sx={{ 
              display: 'flex', 
              backgroundColor: 'background.paper',
              borderBottom: 2, 
              borderColor: 'divider',
              minHeight: '24px',
              width: `${zoomLevel * 100}%`
            }}>
              {timelineDays.map((day, index) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isFirstOfMonth = day.getDate() === 1
                
                return (
                  <Box 
                    key={index} 
                    sx={{ 
                      flex: 1,
                      minWidth: 30 * zoomLevel,
                      maxWidth: 30 * zoomLevel,
                      py: 0.5,
                      px: 0.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      borderRight: isFirstOfMonth ? 1 : 'none',
                      borderColor: 'divider',
                      backgroundColor: isWeekend ? alpha('#000', 0.03) : 'transparent'
                    }}
                  >
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        fontSize: '0.65rem',
                        fontWeight: isFirstOfMonth ? 'bold' : 'normal',
                        color: isWeekend ? 'text.secondary' : 'text.primary'
                      }}
                    >
                      {day.getDate()}
                    </Typography>
                  </Box>
                )
              })}
            </Box>
          </Box>

          {/* Timeline Bars */}
          <Box sx={{ width: `${zoomLevel * 100}%` }}>
            {projectTree.map(proj => renderTimelineNode(proj, 0))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

export default React.memo(GanttChart)
