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
  Button,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material'
import { ChevronRight, ChevronDown, ArrowLeft, ZoomIn, ZoomOut, Calendar, CalendarDays } from 'lucide-react'
import { apiCall } from '../config/api'
import sharedApiService from '../utils/apiService'
import { useSnackbar } from '../contexts/SnackbarContext'

function GanttChart({ user, projectId: propProjectId }) {
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const token = user?.token
  const tokenRef = useRef(token)
  tokenRef.current = token
  
  const { showError } = useSnackbar()
  const isMountedRef = useRef(true)
  const isLoadingProjectRef = useRef(false)
  const isLoadingTreeRef = useRef(false)
  const isLoadingActivitiesRef = useRef(false)

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
  const [timelineWeeks, setTimelineWeeks] = useState([])
  const [timelineYears, setTimelineYears] = useState([])
  const [zoomLevel, setZoomLevel] = useState(1)
  const [viewMode, setViewMode] = useState('monthly') // 'daily', 'weekly', 'monthly', 'yearly'
  const ganttRef = useRef(null)

  // Format date as dd/mm/yyyy
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

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
    if (isLoadingProjectRef.current || !projectId) return
    
    try {
      isLoadingProjectRef.current = true
      setLoading(true)

      // First, load the single project details using sharedApiService
      const projectResult = await sharedApiService.makeRequest(
        `/api/projects/projects/${projectId}`,
        {
          headers: { Authorization: `Bearer ${tokenRef.current}` }
        },
        { 
          projectId,
          token: tokenRef.current?.substring(0, 10)
        }
      )

      if (!isMountedRef.current) return
      
      if (!projectResult.success) {
        throw new Error(projectResult.error || 'Failed to load project')
      }

      const projectData = projectResult.data
      console.log('[GanttChart] Loaded project:', projectData)
      setProject(projectData)

      // Now load project tree (project + all children)
      const params = new URLSearchParams({
        root_id: projectId,
        page: '1',
        page_size: '1000' // Load all children
      })

      let tree = []
      
      const treeResult = await sharedApiService.makeRequest(
        `/api/projects/projects/tree?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${tokenRef.current}` }
        },
        { 
          root_id: projectId,
          page: 1,
          page_size: 1000,
          token: tokenRef.current?.substring(0, 10)
        }
      )

      if (!treeResult.success) {
        console.warn('[GanttChart] Failed to load project tree, will show single project only')
        tree = [projectData]
      } else {
        console.log('[GanttChart] Loaded tree:', treeResult.data)
        tree = treeResult.data.tree || []
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
      isLoadingProjectRef.current = false
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  const loadActivitiesForProject = async (projId) => {
    if (isLoadingActivitiesRef.current) return
    
    try {
      isLoadingActivitiesRef.current = true
      
      const params = new URLSearchParams({
        page: '1',
        page_size: '200',
        project_id: projId
      })
      
      const result = await sharedApiService.makeRequest(
        `/api/projects/activities?${params}`,
        {
          headers: { Authorization: `Bearer ${tokenRef.current}` }
        },
        { 
          project_id: projId,
          page: 1,
          token: tokenRef.current?.substring(0, 10)
        }
      )

      if (result.success) {
        const data = result.data
        console.log(`[GanttChart] Loaded ${data.activities?.length || 0} activities for project ${projId}`)
        if (data.activities && data.activities.length > 0) {
          console.log('[GanttChart] Sample activity:', data.activities[0])
          console.log('[GanttChart] Activity fields:', Object.keys(data.activities[0]))
        }
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
    } finally {
      isLoadingActivitiesRef.current = false
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

    // Load activities for each project using sharedApiService
    for (const proj of allProjects) {
      try {
        const params = new URLSearchParams({
          page: '1',
          page_size: '200',
          project_id: proj.id
        })
        
        const result = await sharedApiService.makeRequest(
          `/api/projects/activities?${params}`,
          {
            headers: { Authorization: `Bearer ${tokenRef.current}` }
          },
          { 
            project_id: proj.id,
            page: 1,
            token: tokenRef.current?.substring(0, 10)
          }
        )

        if (result.success) {
          const data = result.data
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
    const weeks = []
    const years = []
    let current = new Date(start)

    // Generate years
    const startYear = start.getFullYear()
    const endYear = end.getFullYear()
    for (let year = startYear; year <= endYear; year++) {
      years.push(new Date(year, 0, 1))
    }

    // Generate months
    current = new Date(start)
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

    // Generate weeks (starting on Monday)
    current = new Date(start)
    current.setHours(0, 0, 0, 0)
    
    // Adjust to start of week (Monday)
    const dayOfWeek = current.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    current.setDate(current.getDate() + diff)
    
    // Ensure we include weeks that cover the entire timeline
    const endDate = new Date(end)
    endDate.setDate(endDate.getDate() + 7) // Add buffer to ensure we cover the end
    
    while (current <= endDate) {
      const weekEnd = new Date(current)
      weekEnd.setDate(weekEnd.getDate() + 6)
      
      // Only include weeks that overlap with our timeline
      if (weekEnd >= start) {
        weeks.push(new Date(current))
      }
      
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7)
    }

    setTimelineMonths(months)
    setTimelineDays(days)
    setTimelineWeeks(weeks)
    setTimelineYears(years)
  }

  const calculateBarPosition = (startDate, dueDate) => {
    if (!startDate || !dueDate || !timelineStart || !timelineEnd) {
      return { left: '0px', width: '0px' }
    }

    const start = parseDate(startDate)
    const due = parseDate(dueDate)
    
    let leftPx = 0
    let widthPx = 0

    if (viewMode === 'daily') {
      // Calculate position based on days array
      const unitWidth = 30 * zoomLevel
      const msPerDay = 1000 * 60 * 60 * 24
      
      const daysFromStart = (start - timelineStart) / msPerDay
      const duration = (due - start) / msPerDay
      
      leftPx = Math.max(0, daysFromStart * unitWidth)
      widthPx = Math.max(unitWidth * 0.3, duration * unitWidth)
      
    } else if (viewMode === 'weekly') {
      // Calculate position based on weeks array
      const unitWidth = 80 * zoomLevel
      
      // Find which week the start and due dates fall into
      let startWeekIndex = 0
      let dueWeekIndex = 0
      
      for (let i = 0; i < timelineWeeks.length; i++) {
        const weekStart = timelineWeeks[i]
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 6)
        weekEnd.setHours(23, 59, 59, 999)
        
        if (start >= weekStart && start <= weekEnd) {
          startWeekIndex = i
          // Calculate fractional position within the week
          const msPerDay = 1000 * 60 * 60 * 24
          const normalizedStart = new Date(start)
          normalizedStart.setHours(0, 0, 0, 0)
          const normalizedWeekStart = new Date(weekStart)
          normalizedWeekStart.setHours(0, 0, 0, 0)
          const dayInWeek = Math.floor((normalizedStart - normalizedWeekStart) / msPerDay)
          leftPx = (i * unitWidth) + ((dayInWeek / 7) * unitWidth)
        }
        
        if (due >= weekStart && due <= weekEnd) {
          dueWeekIndex = i
        }
      }
      
      // If start is before first week, position at beginning
      if (timelineWeeks.length > 0 && start < timelineWeeks[0]) {
        leftPx = 0
      }
      
      // Calculate width
      const msPerDay = 1000 * 60 * 60 * 24
      const normalizedStart = new Date(start)
      normalizedStart.setHours(0, 0, 0, 0)
      const normalizedDue = new Date(due)
      normalizedDue.setHours(23, 59, 59, 999)
      const totalDays = Math.max(1, Math.ceil((normalizedDue - normalizedStart) / msPerDay) + 1)
      widthPx = Math.max(unitWidth * 0.6, (totalDays / 7) * unitWidth)
      
    } else if (viewMode === 'yearly') {
      // Calculate position based on years array
      const unitWidth = 300 * zoomLevel
      
      // Find which year the start and due dates fall into
      let startYearIndex = 0
      let dueYearIndex = 0
      
      for (let i = 0; i < timelineYears.length; i++) {
        const year = timelineYears[i].getFullYear()
        const yearStart = new Date(year, 0, 1)
        const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)
        
        if (start >= yearStart && start <= yearEnd) {
          startYearIndex = i
          // Calculate fractional position within the year
          const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365
          const dayOfYear = Math.floor((start - yearStart) / (1000 * 60 * 60 * 24))
          leftPx = (i * unitWidth) + (dayOfYear / daysInYear * unitWidth)
        }
        
        if (due >= yearStart && due <= yearEnd) {
          dueYearIndex = i
        }
      }
      
      // If start is before first year, position at beginning
      if (timelineYears.length > 0 && start < timelineYears[0]) {
        leftPx = 0
      }
      
      // Calculate width based on actual time span
      const msPerDay = 1000 * 60 * 60 * 24
      const totalDays = (due - start) / msPerDay
      const avgDaysPerYear = 365.25
      widthPx = Math.max(unitWidth * 0.2, (totalDays / avgDaysPerYear) * unitWidth)
      
    } else { // monthly
      // Calculate position based on months array
      const unitWidth = 120 * zoomLevel
      
      // Find which month the start and due dates fall into
      let startMonthIndex = 0
      let dueMonthIndex = 0
      
      for (let i = 0; i < timelineMonths.length; i++) {
        const month = timelineMonths[i]
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
        monthEnd.setHours(23, 59, 59, 999)
        
        if (start >= month && start <= monthEnd) {
          startMonthIndex = i
          // Calculate fractional position within the month
          const daysInMonth = monthEnd.getDate()
          const dayInMonth = start.getDate() - 1 // 0-indexed
          leftPx = (i * unitWidth) + (dayInMonth / daysInMonth * unitWidth)
        }
        
        if (due >= month && due <= monthEnd) {
          dueMonthIndex = i
        }
      }
      
      // If start is before first month, position at beginning
      if (timelineMonths.length > 0 && start < timelineMonths[0]) {
        leftPx = 0
      }
      
      // Calculate width based on actual time span
      const msPerDay = 1000 * 60 * 60 * 24
      const totalDays = (due - start) / msPerDay
      const avgDaysPerMonth = 30.44 // More accurate average
      widthPx = Math.max(unitWidth * 0.3, (totalDays / avgDaysPerMonth) * unitWidth)
    }

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

  // Calculate due date styling based on days remaining
  const getDueDateStyle = (dueDate, status) => {
    // If status is Completed, use normal styling
    if (status === 'Completed' || status === 'COMPLETED') {
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

          <TableCell>{proj.approver || '-'}</TableCell>

          <TableCell>
            {formatDate(proj.start_date)}
          </TableCell>

          <TableCell sx={getDueDateStyle(proj.due_date, proj.status)}>
            {formatDate(proj.due_date)}
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
            <TableCell>{activity.approver || '-'}</TableCell>
            <TableCell>
              {formatDate(activity.start_date)}
            </TableCell>
            <TableCell sx={getDueDateStyle(activity.due_date, activity.status)}>
              {formatDate(activity.due_date)}
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
          onClick={() => navigate(-1)}
          sx={{ mt: 2 }}
        >
          Back
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
          onClick={() => navigate(-1)}
          sx={{ mt: 2 }}
        >
          Back
        </Button>
      </Box>
    )
  }

  return (
    <>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' }, 
        gap: { xs: 2, sm: 0 },
        mb: 3 
      }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Button
            startIcon={<ArrowLeft size={20} />}
            onClick={() => navigate(-1)}
            sx={{ mb: 1 }}
            size="small"
          >
            Back
          </Button>
          <Typography 
            variant="h4" 
            gutterBottom
            sx={{
              fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' },
              wordBreak: 'break-word',
              overflowWrap: 'break-word'
            }}
          >
            Gantt Chart: {project.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Visual timeline of project and activities
          </Typography>
        </Box>
      </Box>

      {/* Project/Activity List */}
      <Card sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 3 }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Subject</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Assignee</TableCell>
                  <TableCell>Approver</TableCell>
                  <TableCell>Start Date</TableCell>
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

      {/* Timeline Section - Completely Separate */}
      <Card sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <CardContent sx={{ p: 2 }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: { xs: 'flex-start', md: 'center' }, 
            alignItems: { xs: 'flex-start', md: 'center' }, 
            gap: { xs: 2, md: 0 },
            mb: 2, 
            position: 'relative' 
          }}>
            <Typography 
              variant="h6" 
              sx={{ 
                position: { xs: 'static', md: 'absolute' }, 
                left: { md: 0 },
                fontSize: { xs: '1rem', md: '1.25rem' }
              }}
            >
              Timeline View
            </Typography>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(e, newMode) => {
                if (newMode !== null) {
                  setViewMode(newMode)
                }
              }}
              size="small"
              aria-label="timeline view mode"
              sx={{
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
                '& .MuiToggleButton-root': {
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  px: { xs: 1, sm: 2 }
                }
              }}
            >
              <ToggleButton value="daily" aria-label="daily view">
                <CalendarDays size={16} style={{ marginRight: '4px' }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Daily</Box>
              </ToggleButton>
              <ToggleButton value="weekly" aria-label="weekly view">
                <Calendar size={16} style={{ marginRight: '4px' }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Weekly</Box>
              </ToggleButton>
              <ToggleButton value="monthly" aria-label="monthly view">
                <Calendar size={16} style={{ marginRight: '4px' }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Monthly</Box>
              </ToggleButton>
              <ToggleButton value="yearly" aria-label="yearly view">
                <Calendar size={16} style={{ marginRight: '4px' }} />
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Yearly</Box>
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ 
              display: 'flex', 
              gap: 1, 
              alignItems: 'center', 
              position: { xs: 'static', md: 'absolute' }, 
              right: { md: 0 }
            }}>
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
          <Box 
            ref={ganttRef}
            sx={{ 
              width: '100%',
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
            {viewMode === 'daily' && (
              <>
                {/* Months Row */}
                <Box sx={{ 
                  display: 'flex', 
                  backgroundColor: 'background.paper', 
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
                          textAlign: 'center'
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
                  minHeight: '24px',
                  width: `${zoomLevel * 100}%`,
                  mb: 1
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
                          backgroundColor: isWeekend ? alpha('#000', 0.03) : 'transparent',
                          borderLeft: isFirstOfMonth ? 1 : 'none',
                          borderColor: 'divider'
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
              </>
            )}

            {viewMode === 'weekly' && (
              <>
                {/* Months Row */}
                <Box sx={{ 
                  display: 'flex', 
                  backgroundColor: 'background.paper', 
                  minHeight: '24px',
                  width: `${zoomLevel * 100}%`
                }}>
                  {timelineMonths.map((month, index) => {
                    const weeksInMonth = timelineWeeks.filter(week => {
                      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
                      return week.getMonth() === month.getMonth() || 
                             (week <= monthEnd && week >= month)
                    }).length
                    
                    if (weeksInMonth === 0) return null
                    
                    return (
                      <Box 
                        key={index} 
                        sx={{ 
                          width: `${(weeksInMonth * 80 * zoomLevel)}px`,
                          flexShrink: 0,
                          py: 0.5,
                          px: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center'
                        }}
                      >
                        <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.7rem' }}>
                          {month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>

                {/* Weeks Row */}
                <Box sx={{ 
                  display: 'flex', 
                  backgroundColor: 'background.paper',
                  minHeight: '24px',
                  width: `${zoomLevel * 100}%`,
                  mb: 1
                }}>
                  {timelineWeeks.map((week, index) => {
                    const weekEnd = new Date(week)
                    weekEnd.setDate(weekEnd.getDate() + 6)
                    const isFirstOfMonth = week.getDate() <= 7
                    
                    return (
                      <Box 
                        key={index} 
                        sx={{ 
                          minWidth: 80 * zoomLevel,
                          maxWidth: 80 * zoomLevel,
                          py: 0.5,
                          px: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          borderLeft: isFirstOfMonth ? 1 : 'none',
                          borderColor: 'divider'
                        }}
                      >
                        <Typography 
                          variant="caption" 
                          sx={{ fontSize: '0.65rem' }}
                        >
                          {week.getDate()}/{week.getMonth() + 1}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              </>
            )}

            {viewMode === 'monthly' && (
              <>
                {/* Years Row */}
                <Box sx={{ 
                  display: 'flex', 
                  backgroundColor: 'background.paper', 
                  minHeight: '24px',
                  width: `${zoomLevel * 100}%`
                }}>
                  {Array.from(new Set(timelineMonths.map(m => m.getFullYear()))).map((year, index) => {
                    const monthsInYear = timelineMonths.filter(m => m.getFullYear() === year).length
                    
                    return (
                      <Box 
                        key={index} 
                        sx={{ 
                          width: `${(monthsInYear * 120 * zoomLevel)}px`,
                          flexShrink: 0,
                          py: 0.5,
                          px: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center'
                        }}
                      >
                        <Typography variant="caption" fontWeight="bold" sx={{ fontSize: '0.75rem' }}>
                          {year}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>

                {/* Months Row */}
                <Box sx={{ 
                  display: 'flex', 
                  backgroundColor: 'background.paper',
                  minHeight: '24px',
                  width: `${zoomLevel * 100}%`,
                  mb: 1
                }}>
                  {timelineMonths.map((month, index) => {
                    return (
                      <Box 
                        key={index} 
                        sx={{ 
                          minWidth: 120 * zoomLevel,
                          maxWidth: 120 * zoomLevel,
                          py: 0.5,
                          px: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          borderLeft: 1,
                          borderColor: 'divider'
                        }}
                      >
                        <Typography 
                          variant="caption" 
                          sx={{ fontSize: '0.7rem' }}
                        >
                          {month.toLocaleDateString('en-US', { month: 'short' })}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              </>
            )}

            {viewMode === 'yearly' && (
              <>
                {/* Years Row */}
                <Box sx={{ 
                  display: 'flex', 
                  backgroundColor: 'background.paper',
                  minHeight: '32px',
                  width: `${zoomLevel * 100}%`,
                  mb: 1
                }}>
                  {timelineYears.map((year, index) => {
                    return (
                      <Box 
                        key={index} 
                        sx={{ 
                          minWidth: 300 * zoomLevel,
                          maxWidth: 300 * zoomLevel,
                          py: 1,
                          px: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          borderLeft: 1,
                          borderColor: 'divider'
                        }}
                      >
                        <Typography 
                          variant="caption" 
                          fontWeight="bold"
                          sx={{ fontSize: '0.75rem' }}
                        >
                          {year.getFullYear()}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              </>
            )}
          </Box>

          {/* Timeline Bars */}
          <Box sx={{ width: `${zoomLevel * 100}%`, position: 'relative' }}>
            {/* Month vertical lines overlay */}
            <Box sx={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              width: '100%', 
              height: '100%',
              pointerEvents: 'none',
              display: 'flex'
            }}>
              {viewMode === 'daily' && timelineDays.map((day, index) => {
                const isFirstOfMonth = day.getDate() === 1
                if (!isFirstOfMonth) return null
                
                return (
                  <Box 
                    key={index}
                    sx={{
                      position: 'absolute',
                      left: `${index * 30 * zoomLevel}px`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      backgroundColor: 'divider',
                      opacity: 0.5
                    }}
                  />
                )
              })}
              {viewMode === 'weekly' && timelineWeeks.map((week, index) => {
                const isFirstOfMonth = week.getDate() <= 7
                if (!isFirstOfMonth) return null
                
                return (
                  <Box 
                    key={index}
                    sx={{
                      position: 'absolute',
                      left: `${index * 80 * zoomLevel}px`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      backgroundColor: 'divider',
                      opacity: 0.5
                    }}
                  />
                )
              })}
              {viewMode === 'monthly' && timelineMonths.map((month, index) => {
                return (
                  <Box 
                    key={index}
                    sx={{
                      position: 'absolute',
                      left: `${index * 120 * zoomLevel}px`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      backgroundColor: 'divider',
                      opacity: 0.5
                    }}
                  />
                )
              })}
              {viewMode === 'yearly' && timelineYears.map((year, index) => {
                return (
                  <Box 
                    key={index}
                    sx={{
                      position: 'absolute',
                      left: `${index * 300 * zoomLevel}px`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      backgroundColor: 'divider',
                      opacity: 0.5
                    }}
                  />
                )
              })}
            </Box>
            
            {projectTree.map(proj => renderTimelineNode(proj, 0))}
          </Box>
        </Box>
        </CardContent>
      </Card>
    </>
  )
}

export default React.memo(GanttChart)
