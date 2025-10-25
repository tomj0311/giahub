import React, { useState, useEffect, useRef } from 'react'
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
  useTheme
} from '@mui/material'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { apiCall } from '../config/api'
import { useSnackbar } from '../contexts/SnackbarContext'

function ProjectDashboard({ user }) {
  const theme = useTheme()
  const token = user?.token
  const { showError } = useSnackbar()
  const isMountedRef = useRef(true)
  const isLoadingRef = useRef(false)

  const [projectTree, setProjectTree] = useState([])
  const [activitiesByProject, setActivitiesByProject] = useState({})
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)
  const [timelineStart, setTimelineStart] = useState(null)
  const [timelineEnd, setTimelineEnd] = useState(null)
  const [timelineMonths, setTimelineMonths] = useState([])
  const [timelineDays, setTimelineDays] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [ganttExpanded, setGanttExpanded] = useState({})
  const [zoomLevel, setZoomLevel] = useState(1)
  const [loadingActivitiesFor, setLoadingActivitiesFor] = useState({})
  const ganttRef = useRef(null)

  // Handle zoom with mouse wheel - works on scroll without Ctrl key
  useEffect(() => {
    const handleWheel = (e) => {
      // Check if we're scrolling over the gantt timeline area
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
  }, [selectedProject])

  useEffect(() => {
    isMountedRef.current = true
    loadAllData()
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadAllData = async () => {
    if (isLoadingRef.current) return
    isLoadingRef.current = true
    setLoading(true)

    console.log('[Dashboard] Loading project tree...')

    try {
      // Load project tree
      const projectsRes = await apiCall('/api/projects/projects/tree?root_id=root', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!projectsRes.ok) throw new Error('Failed to load projects')

      const projectsData = await projectsRes.json()
      const tree = projectsData.tree || []
      
      console.log('[Dashboard] Project tree loaded:', tree)

      if (!isMountedRef.current) return
      setProjectTree(tree)

      // Load all activities
      console.log('[Dashboard] Loading activities...')
      let activityList = []
      try {
        const params = new URLSearchParams({
          page: '1',
          page_size: '200'
        })
        
        const activitiesRes = await apiCall(`/api/projects/activities?${params}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` }
        })

        console.log('[Dashboard] Activities response status:', activitiesRes.ok, activitiesRes.status)
        
        if (activitiesRes.ok) {
          const activitiesData = await activitiesRes.json()
          activityList = activitiesData.activities || []
          console.log('[Dashboard] Activities loaded:', activityList.length, activityList)
        } else {
          const errorData = await activitiesRes.json()
          console.error('[Dashboard] Failed to load activities - Error:', errorData)
          console.warn('[Dashboard] Continuing without them')
        }
      } catch (activityError) {
        console.error('[Dashboard] Error loading activities:', activityError)
        console.log('[Dashboard] Continuing without activities')
      }

      if (!isMountedRef.current) return

      // Group activities by project
      const grouped = {}
      activityList.forEach(activity => {
        if (!grouped[activity.project_id]) {
          grouped[activity.project_id] = []
        }
        grouped[activity.project_id].push(activity)
      })

      setActivitiesByProject(grouped)

      // Expand all projects by default
      const expandedState = {}
      const expandTree = (nodes) => {
        nodes.forEach(node => {
          expandedState[node.id] = true
          if (node.children && node.children.length > 0) {
            expandTree(node.children)
          }
        })
      }
      expandTree(tree)
      setExpanded(expandedState)

      // Don't calculate timeline initially - wait for project selection

    } catch (error) {
      console.error('[Dashboard] Error:', error)
      if (isMountedRef.current) {
        showError('Failed to load data')
      }
    } finally {
      isLoadingRef.current = false
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  // Flatten tree to get all projects in a list
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

  // Helper function to parse dates consistently (avoid timezone issues)
  const parseDate = (dateStr) => {
    if (!dateStr) return null
    
    console.log('[parseDate] Input:', dateStr, 'Type:', typeof dateStr)
    
    // If it's a date-only string (YYYY-MM-DD), parse it as local time
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-').map(Number)
      const result = new Date(year, month - 1, day)
      console.log('[parseDate] Parsed as local:', dateStr, '->', result.toISOString(), 'Month:', result.getMonth(), 'Date:', result.getDate())
      return result
    }
    
    const result = new Date(dateStr)
    console.log('[parseDate] Parsed as Date():', dateStr, '->', result.toISOString(), 'Month:', result.getMonth(), 'Date:', result.getDate())
    return result
  }

  const calculateTimeline = (projectList, activityList) => {
    const allDates = []

    projectList.forEach(project => {
      if (project.start_date) {
        const d = parseDate(project.start_date)
        allDates.push(d)
        console.log('[Timeline] Project start_date:', project.start_date, '-> Parsed:', d)
      }
      if (project.due_date) {
        const d = parseDate(project.due_date)
        allDates.push(d)
        console.log('[Timeline] Project due_date:', project.due_date, '-> Parsed:', d)
      }
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
    
    console.log('[Timeline] All dates:', allDates.map(d => d.toISOString()))
    console.log('[Timeline] Min Date:', minDate.toISOString(), 'Month:', minDate.getMonth(), 'Year:', minDate.getFullYear())
    console.log('[Timeline] Max Date:', maxDate.toISOString(), 'Month:', maxDate.getMonth(), 'Year:', maxDate.getFullYear())
    
    // Start 10 days before earliest date for context
    const start = new Date(minDate)
    start.setDate(start.getDate() - 10)
    
    // End 10 days after latest date for context
    const end = new Date(maxDate)
    end.setDate(end.getDate() + 10)

    console.log('[Timeline] Calculated Start:', start.toISOString(), 'Month:', start.getMonth(), 'Day:', start.getDate())
    console.log('[Timeline] Calculated End:', end.toISOString(), 'Month:', end.getMonth(), 'Day:', end.getDate())
    console.log('[Timeline] Duration in days:', (end - start) / (1000 * 60 * 60 * 24))

    setTimelineStart(start)
    setTimelineEnd(end)
    generateMonths(start, end)
  }

  const generateMonths = (start, end) => {
    const months = []
    const days = []
    let current = new Date(start)

    console.log('[Generate] Timeline Start:', start, 'End:', end)

    // Generate months
    while (current <= end) {
      months.push(new Date(current))
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    }

    // Generate days
    current = new Date(start)
    while (current <= end) {
      days.push(new Date(current))
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1)
    }

    console.log('[Generate] Total days:', days.length)
    console.log('[Generate] Months:', months.map(m => `${m.toLocaleDateString('en-US', { month: 'short' })} - Days in range: ${days.filter(d => d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear()).length}`))

    setTimelineMonths(months)
    setTimelineDays(days)
  }

  const calculateBarPosition = (startDate, dueDate) => {
    if (!startDate || !dueDate || !timelineStart || !timelineEnd || !timelineDays.length) {
      return { left: '0px', width: '0px' }
    }

    const start = parseDate(startDate)
    const due = parseDate(dueDate)
    
    // Calculate position in days from timeline start
    const dayWidth = 30 * zoomLevel // pixels per day
    const msPerDay = 1000 * 60 * 60 * 24
    
    const daysFromStart = (start - timelineStart) / msPerDay
    const durationInDays = (due - start) / msPerDay
    
    const leftPx = Math.max(0, daysFromStart * dayWidth)
    const widthPx = Math.max(dayWidth, durationInDays * dayWidth)

    console.log('[Bar Position]', {
      startDate,
      dueDate,
      parsedStart: start.toISOString(),
      parsedDue: due.toISOString(),
      timelineStart: timelineStart.toISOString(),
      daysFromStart,
      durationInDays,
      dayWidth,
      left: `${leftPx}px`,
      width: `${widthPx}px`
    })

    return {
      left: `${leftPx}px`,
      width: `${widthPx}px`
    }
  }

  const toggleExpand = (projectId) => {
    setExpanded(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
    
    // Load activities when expanding a project
    if (!expanded[projectId] && !activitiesByProject[projectId]) {
      loadActivitiesForProject(projectId)
    }
  }

  const loadActivitiesForProject = async (projectId) => {
    if (loadingActivitiesFor[projectId]) return
    
    setLoadingActivitiesFor(prev => ({ ...prev, [projectId]: true }))
    
    try {
      const params = new URLSearchParams({
        page: '1',
        page_size: '200'
      })
      
      if (projectId) params.append('project_id', projectId)
      
      const res = await apiCall(`/api/projects/activities?${params}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.ok) {
        const data = await res.json()
        console.log(`[Dashboard] Loaded ${data.activities?.length || 0} activities for project ${projectId}`, data.activities)
        setActivitiesByProject(prev => ({
          ...prev,
          [projectId]: data.activities || []
        }))
      } else {
        console.error('[Dashboard] Failed to load activities:', res.status)
      }
    } catch (error) {
      console.error('[Dashboard] Error loading activities:', error)
    } finally {
      setLoadingActivitiesFor(prev => ({ ...prev, [projectId]: false }))
    }
  }

  const toggleGanttExpand = (projectId) => {
    setGanttExpanded(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }))
  }

  const handleProjectSelect = (project, event) => {
    // Don't select if clicking on expand/collapse button
    if (event.target.closest('.expand-button')) {
      return
    }
    
    setSelectedProject(project)
    
    // Load activities for selected project
    loadActivitiesForProject(project.id)
    
    // Auto-expand the selected project in the Gantt view
    const expandedState = { [project.id]: true }
    const expandTree = (nodes) => {
      nodes.forEach(node => {
        expandedState[node.id] = true
        if (node.children && node.children.length > 0) {
          expandTree(node.children)
        }
      })
    }
    if (project.children) {
      expandTree(project.children)
    }
    setGanttExpanded(expandedState)
    
    // Calculate timeline for selected project and its descendants
    const projectList = [project]
    if (project.children) {
      projectList.push(...flattenTree(project.children))
    }
    
    // Get activities for selected project and its children
    const relevantActivities = []
    projectList.forEach(proj => {
      if (activitiesByProject[proj.id]) {
        relevantActivities.push(...activitiesByProject[proj.id])
      }
    })
    
    calculateTimeline(projectList, relevantActivities)
  }

  const getStatusColor = (status) => {
    const colors = {
      IN_PROGRESS: 'success',
      AT_RISK: 'warning',
      OFF_TRACK: 'error',
      PLANNING: 'secondary',
      COMPLETED: 'info',
      // Activity statuses
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
      IN_PROGRESS: 'In Progress',
      AT_RISK: 'At Risk',
      OFF_TRACK: 'Off Track',
      PLANNING: 'Planning',
      COMPLETED: 'Completed'
    }
    return labels[status] || status
  }

  // Render a project node and its children recursively
  const renderProjectNode = (project, level = 0) => {
    const hasChildren = project.children && project.children.length > 0
    const hasActivities = activitiesByProject[project.id] && activitiesByProject[project.id].length > 0
    const isExpanded = expanded[project.id]
    const isSelected = selectedProject?.id === project.id

    console.log(`[renderProjectNode] Project: ${project.name}, hasActivities: ${hasActivities}, activities count: ${activitiesByProject[project.id]?.length || 0}, isExpanded: ${isExpanded}`)

    return (
      <React.Fragment key={project.id}>
        <TableRow
          onClick={(e) => handleProjectSelect(project, e)}
          sx={{
            cursor: 'pointer',
            '&:hover': {
              bgcolor: 'action.hover'
            },
            bgcolor: isSelected 
              ? alpha(theme.palette.primary.main, 0.15) 
              : level > 0 
                ? alpha('#000', 0.01) 
                : 'transparent'
          }}
        >
          {/* Subject with expand/collapse */}
          <TableCell sx={{ pl: 2 + level * 4, borderLeft: '3px solid', borderLeftColor: `${getStatusColor(project.status)}.main` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {(hasChildren || hasActivities) ? (
                <IconButton
                  size="small"
                  onClick={() => toggleExpand(project.id)}
                  className="expand-button"
                  sx={{ p: 0.5 }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </IconButton>
              ) : (
                <Box sx={{ width: 24 }} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {project.name}
              </Typography>
            </Box>
          </TableCell>

          {/* Status */}
          <TableCell>
            <Chip
              label={getStatusLabel(project.status)}
              color={getStatusColor(project.status)}
              size="small"
            />
          </TableCell>

          {/* Assignee */}
          <TableCell>{project.assignee || '-'}</TableCell>

          {/* Due Date */}
          <TableCell>
            {project.due_date ? new Date(project.due_date).toLocaleDateString() : '-'}
          </TableCell>

          {/* Progress */}
          <TableCell>{project.progress}%</TableCell>
        </TableRow>

        {/* Activities under this project */}
        {isExpanded && hasActivities && activitiesByProject[project.id].map(activity => (
          <TableRow
            key={`activity-${activity.id}`}
            sx={{
              '&:hover': {
                bgcolor: 'action.hover'
              },
              bgcolor: alpha('#000', 0.02)
            }}
          >
            <TableCell sx={{ pl: 2 + (level + 1) * 4 }}>
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

        {/* Render children */}
        {hasChildren && isExpanded && project.children.map(child => renderProjectNode(child, level + 1))}
      </React.Fragment>
    )
  }

  // Render timeline bars for a project node and its children (for Gantt chart)
  const renderGanttProjectNode = (project, level = 0) => {
    const hasChildren = project.children && project.children.length > 0
    const hasActivities = activitiesByProject[project.id] && activitiesByProject[project.id].length > 0
    const isExpanded = ganttExpanded[project.id]

    return (
      <React.Fragment key={project.id}>
        <TableRow
          sx={{
            '&:hover': {
              bgcolor: 'action.hover'
            },
            bgcolor: level > 0 ? alpha('#000', 0.01) : 'transparent'
          }}
        >
          {/* Subject with expand/collapse */}
          <TableCell sx={{ pl: 2 + level * 4, borderLeft: '3px solid', borderLeftColor: `${getStatusColor(project.status)}.main` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {(hasChildren || hasActivities) ? (
                <IconButton
                  size="small"
                  onClick={() => toggleGanttExpand(project.id)}
                  sx={{ p: 0.5 }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </IconButton>
              ) : (
                <Box sx={{ width: 24 }} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {project.name}
              </Typography>
            </Box>
          </TableCell>

          {/* Status */}
          <TableCell>
            <Chip
              label={getStatusLabel(project.status)}
              color={getStatusColor(project.status)}
              size="small"
            />
          </TableCell>

          {/* Assignee */}
          <TableCell>{project.assignee || '-'}</TableCell>

          {/* Due Date */}
          <TableCell>
            {project.due_date ? new Date(project.due_date).toLocaleDateString() : '-'}
          </TableCell>

          {/* Progress */}
          <TableCell>{project.progress}%</TableCell>
        </TableRow>

        {/* Activities under this project */}
        {isExpanded && hasActivities && activitiesByProject[project.id].map(activity => (
          <TableRow
            key={`activity-${activity.id}`}
            sx={{
              '&:hover': {
                bgcolor: 'action.hover'
              },
              bgcolor: alpha('#000', 0.02)
            }}
          >
            <TableCell sx={{ pl: 2 + (level + 1) * 4 }}>
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

        {/* Render children */}
        {hasChildren && isExpanded && project.children.map(child => renderGanttProjectNode(child, level + 1))}
      </React.Fragment>
    )
  }

  // Render timeline bars for a project node and its children
  const renderTimelineNode = (project, level = 0) => {
    const hasChildren = project.children && project.children.length > 0
    const hasActivities = activitiesByProject[project.id] && activitiesByProject[project.id].length > 0
    const isExpanded = ganttExpanded[project.id]

    return (
      <React.Fragment key={project.id}>
        {/* Project timeline bar */}
        <Box sx={{ 
          height: 41, 
          borderBottom: 1, borderColor: 'divider',
          position: 'relative'
        }}>
          {project.start_date && project.due_date && (
            <Box sx={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              height: 20,
              backgroundColor: level === 0 ? 'primary.main' : 'secondary.main',
              opacity: 0.8,
              borderRadius: 1,
              ...calculateBarPosition(project.start_date, project.due_date)
            }} />
          )}
        </Box>

        {/* Activity timeline bars */}
        {isExpanded && hasActivities && activitiesByProject[project.id].map(activity => (
          <Box key={`timeline-activity-${activity.id}`} sx={{ 
            height: 41, 
            borderBottom: 1, borderColor: 'divider',
            position: 'relative'
          }}>
            {activity.start_date && activity.due_date && (
              <Box sx={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                height: 16,
                backgroundColor: 'info.main',
                opacity: 0.6,
                borderRadius: 1,
                ...calculateBarPosition(activity.start_date, activity.due_date)
              }} />
            )}
          </Box>
        ))}

        {/* Render child project timelines recursively */}
        {isExpanded && hasChildren && project.children.map(child => renderTimelineNode(child, level + 1))}
      </React.Fragment>
    )
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Project Gantt Chart
      </Typography>

      <Box sx={{ display: 'flex', border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'auto' }}>
        {/* Left side - Project List Table */}
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
                  {projectTree.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No projects found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    projectTree.map(node => renderProjectNode(node, 0))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        {/* Right side - Gantt Chart Timeline */}
        <Box 
          ref={ganttRef}
          sx={{ 
            flex: 1, 
            minWidth: 600,
            overflow: 'auto',
            position: 'relative'
          }}
        >
          {!selectedProject ? (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column',
              justifyContent: 'center', 
              alignItems: 'center', 
              height: '100%',
              minHeight: 400,
              p: 4
            }}>
              <Typography variant="h5" color="text.secondary" gutterBottom>
                No Project Selected
              </Typography>
              <Typography variant="body1" color="text.secondary" align="center">
                Click on a project from the left to view its Gantt chart
              </Typography>
            </Box>
          ) : (
            <>
              {/* Timeline Header with Months and Days */}
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
                    
                    console.log(`[Month Header] ${month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}: ${daysInMonth} days`)
                    
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
                          {month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} ({daysInMonth}d)
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

              <Box sx={{ width: `${zoomLevel * 100}%` }}>
                {selectedProject && renderTimelineNode(selectedProject, 0)}
              </Box>
            </>
          )}
        </Box>
      </Box>

      {projectTree.length === 0 && (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            No projects found
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default React.memo(ProjectDashboard)
