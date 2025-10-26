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
  ToggleButton,
  Tooltip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Checkbox,
  FormControlLabel,
  FormGroup
} from '@mui/material'
import { ChevronRight, ChevronDown, ArrowLeft, ZoomIn, ZoomOut, Calendar, CalendarDays, Settings, Edit } from 'lucide-react'
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
  const isLoadingMetadataRef = useRef(false)

  // Get project ID or district info from props or location state
  const projectId = propProjectId || location.state?.projectId
  const projectName = location.state?.projectName
  const districtName = location.state?.districtName // From ProjectStatusHome
  const fromDistrictView = location.state?.fromDistrictView // Flag to indicate source

  const [project, setProject] = useState(null)
  const [allProjects, setAllProjects] = useState([]) // Store all projects (flat list)
  const [activitiesByProject, setActivitiesByProject] = useState({})
  const [groupExpanded, setGroupExpanded] = useState({}) // Track group expansion
  const [projectExpanded, setProjectExpanded] = useState({}) // Track project expansion for activities
  const [loading, setLoading] = useState(true)
  const [fieldMetadata, setFieldMetadata] = useState([]) // DYNAMIC - from API
  const [timelineStart, setTimelineStart] = useState(null)
  const [timelineEnd, setTimelineEnd] = useState(null)
  const [timelineMonths, setTimelineMonths] = useState([])
  const [timelineDays, setTimelineDays] = useState([])
  const [timelineWeeks, setTimelineWeeks] = useState([])
  const [timelineYears, setTimelineYears] = useState([])
  const [zoomLevel, setZoomLevel] = useState(0.5)
  const [viewMode, setViewMode] = useState('monthly') // 'daily', 'weekly', 'monthly', 'yearly'
  const MIN_ZOOM = 0.1
  const MAX_ZOOM = 3
  const ganttRef = useRef(null)

  // localStorage keys for state persistence
  const STORAGE_KEYS = {
    VISIBLE_COLUMNS: 'ganttChart_visibleColumns'
  }

  // Helper functions for localStorage state persistence
  const saveStateToStorage = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error)
    }
  }

  const loadStateFromStorage = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? JSON.parse(saved) : defaultValue
    } catch (error) {
      console.warn('Failed to load state from localStorage:', error)
      return defaultValue
    }
  }

  // Column customization state
  const [columnDialogOpen, setColumnDialogOpen] = useState(false)
  
  // Predefined initial columns (common ones shown by default)
  const DEFAULT_VISIBLE_COLUMNS = {
    district: false,
    assembly: false,
    name: true,
    priority: true,
    status: true,
    assignee: true,
    approver: true,
    start_date: true,
    due_date: true,
    progress: true
  }
  
  const [visibleColumns, setVisibleColumns] = useState(() => 
    loadStateFromStorage(STORAGE_KEYS.VISIBLE_COLUMNS, DEFAULT_VISIBLE_COLUMNS)
  )

  // Preferred column order (district and assembly available but hidden by default)
  const PREFERRED_ORDER = ['name', 'priority', 'status', 'assignee', 'approver', 'start_date', 'due_date', 'progress', 'district', 'assembly']

  const orderedFields = React.useMemo(() => {
    const orderIndex = (name) => {
      const idx = PREFERRED_ORDER.indexOf(name)
      return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
    }
    // Include all fields, district and assembly will be available for selection
    return [...fieldMetadata]
      .sort((a, b) => orderIndex(a.name) - orderIndex(b.name))
  }, [fieldMetadata])

  // Consistent date formatter: returns dd/mm/yyyy or '-'
  const formatDate = React.useCallback((dateStr) => {
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

  // Create tooltip content for projects and activities
  const createTooltipContent = (item, type = 'project') => {
    const isProject = type === 'project'
    const title = isProject ? item.name : item.subject
    
    // Ensure item and item.status exist before calling getStatusColor
    if (!item || (!item.status && item.status !== 0)) {
      console.warn(`[GanttChart] Item or status is missing in createTooltipContent:`, item)
      return null
    }
    
    const statusColor = getStatusColor(item.status)
    const dueDateStyle = getDueDateStyle(item.due_date, item.status)
    
    // Ensure statusColor is valid
    const safeStatusColor = theme.palette[statusColor] ? statusColor : 'primary'
    
    // Calculate duration
    const startDate = item.start_date ? new Date(item.start_date) : null
    const dueDate = item.due_date ? new Date(item.due_date) : null
    const duration = startDate && dueDate ? Math.ceil((dueDate - startDate) / (1000 * 60 * 60 * 24)) : null
    
    // Calculate days remaining
    const today = new Date()
    const daysRemaining = dueDate ? Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)) : null
    
    return (
      <Box sx={{ 
        p: 1.2, 
        maxWidth: 300,
        minWidth: 230,
        bgcolor: theme.palette.mode === 'light' ? '#ffffff' : 'background.paper',
        border: `2px solid ${theme.palette[safeStatusColor].main}`,
        borderRadius: 2,
        boxShadow: 3,
        color: theme.palette.mode === 'light' ? '#000000' : 'text.primary'
      }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 1.2 }}>
          <Box 
            sx={{ 
              width: 6, 
              height: 6, 
              bgcolor: `${safeStatusColor}.main`, 
              borderRadius: '50%' 
            }} 
          />
          <Typography variant="body2" sx={{ 
            fontWeight: 'bold', 
            flex: 1,
            fontSize: '0.85rem',
            color: theme.palette.mode === 'light' ? '#000000' : 'text.primary'
          }}>
            {title}
          </Typography>
          <Chip 
            label={getStatusLabel(item.status)} 
            color={safeStatusColor} 
            size="small" 
            sx={(chipTheme) => ({ 
              fontSize: '0.7rem',
              fontWeight: 600,
              color: chipTheme.palette.getContrastText(
                chipTheme.palette[safeStatusColor]?.main || chipTheme.palette.grey[500]
              ),
              '& .MuiChip-label': {
                color: chipTheme.palette.getContrastText(
                  chipTheme.palette[safeStatusColor]?.main || chipTheme.palette.grey[500]
                )
              }
            })}
          />
        </Box>
        
        {/* Content Grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.2, mb: 0.8 }}>
          {/* Left Column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
            <Box>
              <Typography variant="caption" sx={{ 
                fontWeight: 500, 
                fontSize: '0.7rem',
                color: theme.palette.mode === 'light' ? '#666666' : 'text.secondary', 
                display: 'block' 
              }}>
                Start Date
              </Typography>
              <Typography variant="caption" sx={{ 
                fontWeight: 500,
                fontSize: '0.75rem',
                color: theme.palette.mode === 'light' ? '#000000' : 'text.primary'
              }}>
                {formatDate(item.start_date)}
              </Typography>
            </Box>
            
            <Box>
              <Typography variant="caption" sx={{ 
                fontWeight: 500, 
                fontSize: '0.7rem',
                color: theme.palette.mode === 'light' ? '#666666' : 'text.secondary', 
                display: 'block' 
              }}>
                Progress
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" sx={{ 
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  color: theme.palette.mode === 'light' ? '#000000' : 'text.primary'
                }}>
                  {item.progress || 0}%
                </Typography>
                <Box sx={{ 
                  flex: 1, 
                  height: 4, 
                  bgcolor: theme.palette.mode === 'light' ? '#e0e0e0' : 'grey.200', 
                  borderRadius: 2,
                  overflow: 'hidden'
                }}>
                  <Box sx={{ 
                    height: '100%', 
                    bgcolor: theme.palette[safeStatusColor].main, 
                    width: `${item.progress || 0}%`,
                    transition: 'width 0.3s ease'
                  }} />
                </Box>
              </Box>
            </Box>
          </Box>
          
          {/* Right Column */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
            <Box>
              <Typography variant="caption" sx={{ 
                fontWeight: 500, 
                fontSize: '0.7rem',
                color: theme.palette.mode === 'light' ? '#666666' : 'text.secondary', 
                display: 'block' 
              }}>
                Due Date
              </Typography>
              <Typography variant="caption" sx={{ 
                fontWeight: 500, 
                fontSize: '0.75rem',
                ...dueDateStyle,
                color: dueDateStyle.color || (theme.palette.mode === 'light' ? '#000000' : 'text.primary')
              }}>
                {formatDate(item.due_date)}
                {daysRemaining !== null && (
                  <Typography component="span" variant="caption" sx={{ 
                    ml: 0.5, 
                    opacity: 0.8,
                    fontSize: '0.65rem',
                    color: theme.palette.mode === 'light' ? '#666666' : 'text.secondary'
                  }}>
                    ({daysRemaining > 0 ? `${daysRemaining} days left` : 
                      daysRemaining === 0 ? 'Due today' : 
                      `${Math.abs(daysRemaining)} days overdue`})
                  </Typography>
                )}
              </Typography>
            </Box>
            
            {duration && (
              <Box>
                <Typography variant="caption" sx={{ 
                  fontWeight: 500, 
                  fontSize: '0.7rem',
                  color: theme.palette.mode === 'light' ? '#666666' : 'text.secondary', 
                  display: 'block' 
                }}>
                  Duration
                </Typography>
                <Typography variant="caption" sx={{ 
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  color: theme.palette.mode === 'light' ? '#000000' : 'text.primary'
                }}>
                  {duration} days
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
        
        {/* People Section */}
        {(item.assignee || item.approver) && (
          <Box sx={{ 
            borderTop: 1, 
            borderColor: 'divider', 
            pt: 1, 
            mt: 1,
            display: 'flex', 
            flexDirection: 'column', 
            gap: 0.5 
          }}>
            {item.assignee && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ 
                  fontWeight: 500, 
                  fontSize: '0.7rem',
                  color: theme.palette.mode === 'light' ? '#666666' : 'text.secondary'
                }}>
                  👤 Assignee:
                </Typography>
                <Typography variant="caption" sx={{ 
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  color: theme.palette.mode === 'light' ? '#000000' : 'text.primary'
                }}>
                  {item.assignee_name || item.assignee}
                </Typography>
              </Box>
            )}
            
            {item.approver && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ 
                  fontWeight: 500, 
                  fontSize: '0.7rem',
                  color: theme.palette.mode === 'light' ? '#666666' : 'text.secondary'
                }}>
                  ✅ Approver:
                </Typography>
                <Typography variant="caption" sx={{ 
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  color: theme.palette.mode === 'light' ? '#000000' : 'text.primary'
                }}>
                  {item.approver_name || item.approver}
                </Typography>
              </Box>
            )}
          </Box>
        )}
        
        {/* Footer hint */}
        <Box sx={{ 
          borderTop: 1, 
          borderColor: 'divider', 
          pt: 0.5, 
          mt: 1,
          textAlign: 'center' 
        }}>
          <Typography variant="caption" sx={{ 
            fontSize: '0.65rem',
            color: theme.palette.mode === 'light' ? '#666666' : 'text.secondary', 
            fontStyle: 'italic' 
          }}>
            {isProject ? 'Click to view project details' : 'Click to view activity details'}
          </Typography>
        </Box>
      </Box>
    )
  }

  // Handle zoom with mouse wheel
  useEffect(() => {
    const handleWheel = (e) => {
      if (ganttRef.current && ganttRef.current.contains(e.target)) {
        e.preventDefault()
        e.stopPropagation()
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        setZoomLevel(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(prev + delta).toFixed(2))))
      }
    }

    const ganttElement = ganttRef.current
    if (ganttElement) {
      ganttElement.addEventListener('wheel', handleWheel, { passive: false })
      return () => {
        ganttElement.removeEventListener('wheel', handleWheel)
      }
    }
  }, [loading, allProjects]) // Re-attach after loading completes and projects are set

  // Load metadata on mount
  useEffect(() => {
    isMountedRef.current = true
    // Clear old localStorage settings to force reset
    localStorage.removeItem(STORAGE_KEYS.VISIBLE_COLUMNS)
    loadFieldMetadata()

    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Load project data when projectId changes
  useEffect(() => {
    if (projectId) {
      loadProjectData()
    }
  }, [projectId])

  const loadProjectData = async () => {
    if (isLoadingProjectRef.current || !projectId) return
    
    try {
      isLoadingProjectRef.current = true
      setLoading(true)

      let projectsToShow = []

      if (fromDistrictView) {
        // Coming from ProjectStatusHome - load all projects for the district
        console.log('[GanttChart] Loading all projects for district:', districtName)
        
        const params = new URLSearchParams({
          page: '1',
          page_size: '1000'
        })

        const result = await sharedApiService.makeRequest(
          `/api/projects/projects?${params.toString()}`,
          {
            headers: { Authorization: `Bearer ${tokenRef.current}` }
          },
          { 
            page: 1,
            page_size: 1000,
            token: tokenRef.current?.substring(0, 10)
          }
        )

        if (!result.success) {
          throw new Error(result.error || 'Failed to load projects')
        }

        const allProjectsData = result.data.projects || []
        
        // Filter projects by district - match the clicked district
        const districtProjects = allProjectsData.filter(p => {
          const projectDistrict = p.district || 'No District'
          return projectDistrict === districtName
        })

        console.log('[GanttChart] Found', districtProjects.length, 'projects for district', districtName)
        projectsToShow = districtProjects
        
        // Set the first project as the main project for display purposes
        if (projectsToShow.length > 0) {
          setProject({
            name: `${districtName} - All Projects`,
            district: districtName
          })
        }
      } else {
        // Coming from ProjectTreeView - load specific project only
        console.log('[GanttChart] Loading specific project:', projectId)
        
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
        projectsToShow = [projectData]
      }
      
      if (!isMountedRef.current) return
      setAllProjects(projectsToShow)
      
      console.log('[GanttChart] Projects to show:', projectsToShow.length)
      
      // Auto-expand groups but keep projects collapsed
      const groupExpandState = {}
      const projectExpandState = {}
      
      projectsToShow.forEach(proj => {
        const district = proj.district || 'No District'
        const assembly = proj.assembly || 'No Assembly'
        const groupKey = `${district} - ${assembly}`
        groupExpandState[groupKey] = true
        projectExpandState[proj.id] = false // Keep activities collapsed by default
      })
      
      setGroupExpanded(groupExpandState)
      setProjectExpanded(projectExpandState)

      // Load activities for all projects
      await loadActivitiesForAllProjects(projectsToShow)

    } catch (error) {
      console.error('[GanttChart] Error:', error)
      if (isMountedRef.current) {
        showError(error.message || 'Failed to load project data')
        setProject(null)
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

  // Load activities for all projects in the list
  const loadActivitiesForAllProjects = async (projectsList) => {
    const allActivities = {}

    // Load activities for each project using sharedApiService
    for (const proj of projectsList) {
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
      calculateTimeline(projectsList, allActivityList)
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
    
    // Use the actual min date as start - no buffer
    const start = new Date(minDate)
    
    const end = new Date(maxDate)
    // Add small buffer at the end
    end.setDate(end.getDate() + 7)

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
    
    // Adjust to the Monday of the week containing the start date
    const dayOfWeek = current.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    current.setDate(current.getDate() + diff)
    
    // Ensure we include weeks that cover the entire timeline
    const endDate = new Date(end)
    endDate.setDate(endDate.getDate() + 14) // Add 2 weeks buffer to ensure we cover the end
    
    while (current <= endDate) {
      weeks.push(new Date(current))
      
      // Increment by 7 days properly
      current.setDate(current.getDate() + 7)
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
      
      // Find the exact day index in the timeline
      let startIndex = -1
      for (let i = 0; i < timelineDays.length; i++) {
        const day = timelineDays[i]
        const dayStart = new Date(day)
        dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(day)
        dayEnd.setHours(23, 59, 59, 999)
        
        if (start >= dayStart && start <= dayEnd) {
          startIndex = i
          break
        }
      }
      
      if (startIndex === -1) {
        // If start is before timeline, position at beginning
        if (start < timelineDays[0]) {
          startIndex = 0
        } else {
          // If start is after timeline, position at end
          startIndex = timelineDays.length - 1
        }
      }
      
      const msPerDay = 1000 * 60 * 60 * 24
      const duration = Math.max(1, (due - start) / msPerDay)
      
      leftPx = startIndex * unitWidth + 10 // Add 10px offset to align properly
      widthPx = Math.max(unitWidth * 0.3, duration * unitWidth)
      
    } else if (viewMode === 'weekly') {
      // Calculate position based on time from timeline start
      const unitWidth = 80 * zoomLevel
      const msPerDay = 1000 * 60 * 60 * 24
      
      // Get the first week start (this is our reference point)
      if (timelineWeeks.length === 0) {
        leftPx = 10
        widthPx = unitWidth
      } else {
        const firstWeekStart = new Date(timelineWeeks[0])
        firstWeekStart.setHours(0, 0, 0, 0)
        
        const normalizedStart = new Date(start)
        normalizedStart.setHours(0, 0, 0, 0)
        const normalizedDue = new Date(due)
        normalizedDue.setHours(23, 59, 59, 999)
        
        // Find which week index the start date falls into
        let weekIndex = 0
        for (let i = 0; i < timelineWeeks.length; i++) {
          const weekStart = new Date(timelineWeeks[i])
          weekStart.setHours(0, 0, 0, 0)
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 6)
          weekEnd.setHours(23, 59, 59, 999)
          
          if (normalizedStart >= weekStart && normalizedStart <= weekEnd) {
            weekIndex = i
            // Calculate position within this week
            const dayInWeek = (normalizedStart - weekStart) / msPerDay
            leftPx = (weekIndex * unitWidth) + ((dayInWeek / 7) * unitWidth) + 10
            break
          } else if (normalizedStart < weekStart && i === 0) {
            // Start is before first week
            const daysBeforeFirst = (weekStart - normalizedStart) / msPerDay
            leftPx = 10 - ((daysBeforeFirst / 7) * unitWidth)
            break
          } else if (i === timelineWeeks.length - 1 && normalizedStart > weekEnd) {
            // Start is after last week
            const daysAfterLast = (normalizedStart - weekEnd) / msPerDay
            leftPx = ((i + 1) * unitWidth) + ((daysAfterLast / 7) * unitWidth) + 10
            break
          }
        }
        
        // Calculate width based on duration
        const totalDays = Math.ceil((normalizedDue - normalizedStart) / msPerDay) + 1
        widthPx = Math.max(unitWidth * 0.6, (totalDays / 7) * unitWidth)
      }
      
    } else if (viewMode === 'yearly') {
      // Calculate position based on years array
      const unitWidth = 300 * zoomLevel
      
      // Find which year the start and due dates fall into
      let startYearIndex = -1
      
      for (let i = 0; i < timelineYears.length; i++) {
        const year = timelineYears[i].getFullYear()
        const yearStart = new Date(year, 0, 1)
        const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999)
        
        if (start >= yearStart && start <= yearEnd) {
          startYearIndex = i
          // Calculate fractional position within the year
          const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365
          const dayOfYear = Math.floor((start - yearStart) / (1000 * 60 * 60 * 24))
          leftPx = (i * unitWidth) + (dayOfYear / daysInYear * unitWidth) + 10 // Add 10px offset
          break
        }
      }
      
      // If start is before first year or not found, position at beginning
      if (startYearIndex === -1) {
        if (timelineYears.length > 0 && start < timelineYears[0]) {
          leftPx = 10 // Add 10px offset
        } else {
          leftPx = (timelineYears.length - 1) * unitWidth + 10 // Add 10px offset
        }
      }
      
      // Calculate width based on actual time span
      const msPerDay = 1000 * 60 * 60 * 24
      const totalDays = Math.max(1, (due - start) / msPerDay)
      const avgDaysPerYear = 365.25
      widthPx = Math.max(unitWidth * 0.2, (totalDays / avgDaysPerYear) * unitWidth)
      
    } else { // monthly
      // Calculate position based on months array
      const unitWidth = 120 * zoomLevel
      
      // Find which month the start and due dates fall into
      let startMonthIndex = -1
      
      for (let i = 0; i < timelineMonths.length; i++) {
        const month = timelineMonths[i]
        const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
        monthEnd.setHours(23, 59, 59, 999)
        
        if (start >= month && start <= monthEnd) {
          startMonthIndex = i
          // Calculate fractional position within the month
          const daysInMonth = monthEnd.getDate()
          const dayInMonth = start.getDate() - 1 // 0-indexed
          leftPx = (i * unitWidth) + (dayInMonth / daysInMonth * unitWidth) + 10 // Add 10px offset
          break
        }
      }
      
      // If start is before first month or not found, position at beginning
      if (startMonthIndex === -1) {
        if (timelineMonths.length > 0 && start < timelineMonths[0]) {
          leftPx = 10 // Add 10px offset
        } else {
          leftPx = (timelineMonths.length - 1) * unitWidth + 10 // Add 10px offset
        }
      }
      
      // Calculate width based on actual time span
      const msPerDay = 1000 * 60 * 60 * 24
      const totalDays = Math.max(1, (due - start) / msPerDay)
      const avgDaysPerMonth = 30.44 // More accurate average
      widthPx = Math.max(unitWidth * 0.3, (totalDays / avgDaysPerMonth) * unitWidth)
    }

    // Ensure a minimal visible width for bars at very low zoom levels
    widthPx = Math.max(2, widthPx)

    return {
      left: `${leftPx}px`,
      width: `${widthPx}px`
    }
  }

  const toggleGroupExpand = (groupKey) => {
    setGroupExpanded(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }))
  }

  const toggleProjectExpand = (projId) => {
    setProjectExpanded(prev => ({
      ...prev,
      [projId]: !prev[projId]
    }))
  }

  // Column customization handlers
  const handleColumnToggle = (columnKey) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnKey]: !prev[columnKey]
    }))
  }

  const handleOpenColumnDialog = () => {
    setColumnDialogOpen(true)
  }

  const handleCloseColumnDialog = () => {
    setColumnDialogOpen(false)
  }

  const handleResetColumns = () => {
    setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
  }

  // Save visible columns to localStorage when they change
  useEffect(() => {
    saveStateToStorage(STORAGE_KEYS.VISIBLE_COLUMNS, visibleColumns)
  }, [visibleColumns])

  // Load field metadata from API - NO HARDCODING!
  const loadFieldMetadata = React.useCallback(async () => {
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
        console.warn('Failed to load field metadata, using fallback')
        // Provide fallback metadata so component doesn't break
        setFieldMetadata([
          { name: 'name', label: 'Project Name' },
          { name: 'priority', label: 'Priority' },
          { name: 'status', label: 'Status' },
          { name: 'assignee', label: 'Assignee' },
          { name: 'approver', label: 'Approver' },
          { name: 'start_date', label: 'Start Date' },
          { name: 'due_date', label: 'Due Date' },
          { name: 'progress', label: 'Progress' },
          { name: 'district', label: 'District' },
          { name: 'assembly', label: 'Assembly' }
        ])
      }
    } catch (error) {
      console.error('Failed to load field metadata:', error)
      if (isMountedRef.current) {
        // Provide fallback metadata so component doesn't break
        setFieldMetadata([
          { name: 'name', label: 'Project Name' },
          { name: 'priority', label: 'Priority' },
          { name: 'status', label: 'Status' },
          { name: 'assignee', label: 'Assignee' },
          { name: 'approver', label: 'Approver' },
          { name: 'start_date', label: 'Start Date' },
          { name: 'due_date', label: 'Due Date' },
          { name: 'progress', label: 'Progress' },
          { name: 'district', label: 'District' },
          { name: 'assembly', label: 'Assembly' }
        ])
      }
    } finally {
      isLoadingMetadataRef.current = false
    }
  }, [])

  // Helper function to render cell content based on column type
  const renderCellContent = (node, columnName, isActivity = false) => {
    const value = node[columnName]
    
    if (columnName === 'district' || columnName === 'assembly') {
      if (isActivity) {
        // Activities should not show district/assembly values - always blank
        return (
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
            -
          </Typography>
        )
      }
      return (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {value || '-'}
        </Typography>
      )
    }
    
    if (columnName === 'name') {
      if (isActivity) {
        return (
          <Box sx={{ pl: 8 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 24 }} />
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                {node.subject || node.name}
              </Typography>
            </Box>
          </Box>
        )
      }
      const statusColor = getStatusColor(node.status || 'New')
      const safeStatusColor = theme.palette[statusColor] ? statusColor : 'primary'
      return (
        <Box sx={{ pl: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {!isActivity && activitiesByProject[node.id] && activitiesByProject[node.id].length > 0 ? (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation() // Prevent triggering row click
                  toggleProjectExpand(node.id)
                }}
                sx={{ p: 0.5 }}
              >
                {projectExpanded[node.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </IconButton>
            ) : (
              <Box sx={{ width: 24 }} />
            )}
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {value}
            </Typography>
          </Box>
        </Box>
      )
    }
    
    if (columnName === 'status') {
      const statusColorForChip = getStatusColor(node.status || 'New')
      return (
        <Chip
          label={getStatusLabel(value)}
          color={statusColorForChip}
          size="small"
          variant={isActivity ? "outlined" : "filled"}
          sx={(theme) => ({
            fontWeight: 600,
            color: isActivity ? undefined : theme.palette.getContrastText(
              theme.palette[statusColorForChip]?.main || theme.palette.grey[500]
            ),
            '& .MuiChip-label': {
              color: isActivity ? undefined : theme.palette.getContrastText(
                theme.palette[statusColorForChip]?.main || theme.palette.grey[500]
              )
            }
          })}
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
      return `${value || 0}%`
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

  const getStatusColor = (status) => {
    // Add debug logging and handle null/undefined status
    console.log(`[GanttChart] Getting status color for status: "${status}" (type: ${typeof status})`)
    
    // Handle null, undefined, or empty status
    if (!status || status === null || status === undefined || status === '') {
      console.warn(`[GanttChart] Status is null/undefined/empty: "${status}", using 'primary'`)
      return 'primary'
    }
    
    const colors = {
      // Project statuses
      IN_PROGRESS: 'primary',
      AT_RISK: 'warning',
      OFF_TRACK: 'error',
      PLANNING: 'secondary',
      COMPLETED: 'success',
      // Activity statuses
      'NEW': 'info',
      'IN_PROGRESS': 'primary',
      'ON_HOLD': 'warning',
      'COMPLETED': 'success',
      'CANCELLED': 'error'
    }
    const color = colors[status] || 'primary'
    
    // Ensure the color exists in the theme palette
    if (!theme.palette[color]) {
      console.warn(`[GanttChart] Color '${color}' not found in theme palette for status '${status}', using 'primary'`)
      return 'primary'
    }
    
    console.log(`[GanttChart] Status '${status}' mapped to color '${color}'`)
    return color
  }

  const getStatusLabel = (status) => {
    const labels = {
      // Project statuses
      IN_PROGRESS: 'In Progress',
      AT_RISK: 'At Risk',
      OFF_TRACK: 'Off Track',
      PLANNING: 'Planning',
      COMPLETED: 'Completed',
      // Activity statuses
      'NEW': 'New',
      'IN_PROGRESS': 'In Progress',
      'ON_HOLD': 'On Hold',
      'COMPLETED': 'Completed',
      'CANCELLED': 'Cancelled'
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

  // Group projects by District - Assembly
  const groupedProjects = React.useMemo(() => {
    const groups = {}
    allProjects.forEach(project => {
      const district = project.district || 'No District'
      const assembly = project.assembly || 'No Assembly'
      const groupKey = `${district} - ${assembly}`
      
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(project)
    })
    return groups
  }, [allProjects])

  const renderProjectRow = (proj) => {
    const hasActivities = activitiesByProject[proj.id] && activitiesByProject[proj.id].length > 0
    const isExpanded = projectExpanded[proj.id]
    
    // Safety check for project data
    if (!proj) {
      console.warn(`[GanttChart] Project is null/undefined in renderProjectRow`)
      return null
    }

    return (
      <React.Fragment key={proj.id}>
        <TableRow
          sx={{
            cursor: hasActivities ? 'pointer' : 'default',
            '&:hover': {
              bgcolor: hasActivities ? 'action.hover' : 'action.selected'
            }
          }}
        >
          {orderedFields.map((field) => (
            visibleColumns[field.name] && (
              <TableCell 
                key={field.name}
                onClick={() => {
                  if (hasActivities) {
                    toggleProjectExpand(proj.id)
                  }
                }}
              >
                {renderCellContent(proj, field.name, false)}
              </TableCell>
            )
          ))}
          <TableCell sx={{ textAlign: 'center' }}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/dashboard/projects/project/${proj.id}`)
              }}
              sx={{ color: 'primary.main' }}
            >
              <Edit size={18} />
            </IconButton>
          </TableCell>
        </TableRow>

        {/* Render activities if expanded and has activities */}
        {isExpanded && hasActivities && activitiesByProject[proj.id].map(activity => {
          // Safety check for activity data
          if (!activity) {
            console.warn(`[GanttChart] Activity is null/undefined in table render`)
            return null
          }
          
          const activityStatusColor = getStatusColor(activity.status || 'New')
          const safeActivityStatusColor = theme.palette[activityStatusColor] ? activityStatusColor : 'primary'
          
          return (
            <TableRow
              key={`activity-${activity.id}`}
              sx={{
                '&:hover': {
                  bgcolor: 'action.hover'
                },
                bgcolor: alpha('#000', 0.02)
              }}
            >
              {orderedFields.map((field) => (
                visibleColumns[field.name] && (
                  <TableCell 
                    key={field.name}
                    onClick={() => navigate(`/dashboard/projects/activity/${activity.id}`, {
                      state: {
                        returnTo: '/dashboard/projects/gantt',
                        projectId: projectId,
                        projectName: projectName
                      }
                    })}
                    sx={{ cursor: 'pointer' }}
                  >
                    {renderCellContent(activity, field.name, true)}
                  </TableCell>
                )
              ))}
              <TableCell sx={{ textAlign: 'center' }}>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/dashboard/projects/activity/${activity.id}`)
                  }}
                  sx={{ color: 'primary.main' }}
                >
                  <Edit size={18} />
                </IconButton>
              </TableCell>
            </TableRow>
          )
        })}
      </React.Fragment>
    )
  }

  const renderTimelineForProject = (proj) => {
    const hasActivities = activitiesByProject[proj.id] && activitiesByProject[proj.id].length > 0
    const isExpanded = projectExpanded[proj.id]
    
    // Safety check for project data
    if (!proj) {
      console.warn(`[GanttChart] Project is null/undefined in renderTimelineForProject`)
      return null
    }
    
    const statusColor = getStatusColor(proj.status || 'New')
    const safeStatusColor = theme.palette[statusColor] ? statusColor : 'primary'

    return (
      <React.Fragment key={proj.id}>
        <Box sx={{ 
          height: 41, 
          position: 'relative'
        }}>
          {proj.start_date && proj.due_date && (
            <Tooltip 
              title={createTooltipContent(proj, 'project')}
              arrow
              placement="top"
              enterDelay={200}
              leaveDelay={300}
              enterNextDelay={100}
              componentsProps={{
                tooltip: {
                  sx: {
                    bgcolor: 'transparent',
                    '& .MuiTooltip-arrow': {
                      color: theme.palette[safeStatusColor].main,
                    },
                  },
                },
              }}
            >
              <Box sx={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                height: 20,
                backgroundColor: theme.palette[safeStatusColor].main,
                opacity: 0.85,
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                border: `1px solid ${alpha(theme.palette[safeStatusColor].main, 0.3)}`,
                boxShadow: `0 2px 4px ${alpha(theme.palette[safeStatusColor].main, 0.2)}`,
                '&:hover': {
                  opacity: 1,
                  height: 24,
                  backgroundColor: theme.palette[safeStatusColor].dark,
                  transform: 'translateY(-50%) scale(1.05)',
                  boxShadow: `0 4px 12px ${alpha(theme.palette[safeStatusColor].main, 0.4)}`,
                  zIndex: 10,
                },
                '&:active': {
                  transform: 'translateY(-50%) scale(0.98)',
                },
                ...calculateBarPosition(proj.start_date, proj.due_date)
              }} />
            </Tooltip>
          )}
        </Box>

        {/* Render activity timelines if expanded and has activities */}
        {isExpanded && hasActivities && activitiesByProject[proj.id].map(activity => {
          // Safety check for activity data
          if (!activity) {
            console.warn(`[GanttChart] Activity is null/undefined in timeline render`)
            return null
          }
          
          const activityStatusColor = getStatusColor(activity.status || 'New')
          const safeActivityStatusColor = theme.palette[activityStatusColor] ? activityStatusColor : 'primary'
          
          return (
            <Box key={`timeline-activity-${activity.id}`} sx={{ 
              height: 41, 
              position: 'relative',
              bgcolor: alpha('#000', 0.02)
            }}>
              {activity.start_date && activity.due_date && (
                <>
                  <Tooltip 
                    title={createTooltipContent(activity, 'activity')}
                    arrow
                    placement="top"
                    enterDelay={200}
                    leaveDelay={300}
                    enterNextDelay={100}
                    componentsProps={{
                      tooltip: {
                        sx: {
                          bgcolor: 'transparent',
                          '& .MuiTooltip-arrow': {
                            color: theme.palette[safeActivityStatusColor].main,
                          },
                        },
                      },
                    }}
                  >
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
                        backgroundColor: 'transparent', // Hollow - no fill
                        opacity: 1,
                        borderRadius: 2,
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        border: `2px solid ${theme.palette[safeActivityStatusColor].main}`, // Solid border with color
                        boxShadow: 'none',
                        '&:hover': {
                          height: 20,
                          backgroundColor: alpha(theme.palette[safeActivityStatusColor].main, 0.1), // Slight fill on hover
                          transform: 'translateY(-50%) scale(1.05)',
                          border: `2px solid ${theme.palette[safeActivityStatusColor].dark}`,
                          boxShadow: `0 2px 6px ${alpha(theme.palette[safeActivityStatusColor].main, 0.3)}`,
                          zIndex: 10,
                        },
                        '&:active': {
                          transform: 'translateY(-50%) scale(0.98)',
                        },
                        ...calculateBarPosition(activity.start_date, activity.due_date)
                      }} 
                    />
                  </Tooltip>
                  
                  {/* Status label on top of the timeline bar */}
                  <Typography
                    variant="caption"
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      fontSize: '0.65rem',
                      color: theme.palette[safeActivityStatusColor].main,
                      fontWeight: 600,
                      opacity: 1,
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      lineHeight: '16px',
                      textAlign: 'center',
                      ...(() => {
                        const barPos = calculateBarPosition(activity.start_date, activity.due_date)
                        return {
                          left: barPos.left,
                          width: barPos.width,
                          transform: 'translateY(-50%)',
                        }
                      })()
                    }}
                  >
                    {getStatusLabel(activity.status)}
                  </Typography>
                </>
              )}
            </Box>
          )
        })}
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
            Gantt Chart: {fromDistrictView ? `${districtName} District` : project.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {fromDistrictView 
              ? `Visual timeline of all projects and activities in ${districtName} district`
              : 'Visual timeline of project and activities'
            }
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="Customize Columns">
            <Button
              variant="outlined"
              size="small"
              startIcon={<Settings size={18} />}
              onClick={handleOpenColumnDialog}
              sx={{ 
                textTransform: 'none',
                fontWeight: 500,
                minWidth: '200px',
                borderColor: 'divider',
                color: 'text.secondary'
              }}
            >
              Columns
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {/* Project/Activity List */}
      <Card sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 3 }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {orderedFields.map((field) => (
                    visibleColumns[field.name] && (
                      <TableCell 
                        key={field.name}
                        sx={field.name === 'name' ? { width: '550px' } : {}}
                      >
                        {field.label}
                      </TableCell>
                    )
                  ))}
                  <TableCell sx={{ width: '80px', textAlign: 'center' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(groupedProjects).map(([groupKey, projects]) => {
                  const isGroupExpanded = groupExpanded[groupKey]
                  
                  return (
                    <React.Fragment key={groupKey}>
                      {/* Group Header Row */}
                      <TableRow
                        sx={{
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                          '&:hover': {
                            bgcolor: alpha(theme.palette.primary.main, 0.12)
                          }
                        }}
                      >
                        <TableCell colSpan={Object.values(visibleColumns).filter(Boolean).length + 1} sx={{ py: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <IconButton
                              size="small"
                              onClick={() => toggleGroupExpand(groupKey)}
                              sx={{ p: 0.5 }}
                            >
                              {isGroupExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </IconButton>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {groupKey} ({projects.length} {projects.length === 1 ? 'project' : 'projects'})
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                      
                      {/* Render projects in this group if expanded */}
                      {isGroupExpanded && projects.map(proj => renderProjectRow(proj))}
                    </React.Fragment>
                  )
                })}
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
              <IconButton onClick={() => setZoomLevel(prev => Math.max(MIN_ZOOM, +(prev - 0.1).toFixed(2)))} size="small">
                <ZoomOut size={20} />
              </IconButton>
              <Typography variant="caption">
                {Math.round(zoomLevel * 100)}%
              </Typography>
              <IconButton onClick={() => setZoomLevel(prev => Math.min(MAX_ZOOM, +(prev + 0.1).toFixed(2)))} size="small">
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
                    // Count weeks where the week START date is in this month
                    const weeksInMonth = timelineWeeks.filter(week => {
                      return week.getFullYear() === month.getFullYear() && 
                             week.getMonth() === month.getMonth()
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
              {viewMode === 'weekly' && timelineWeeks.map((week, index) => (
                <Box 
                  key={index}
                  sx={{
                    position: 'absolute',
                    left: `${index * 80 * zoomLevel}px`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    backgroundColor: week.getDate() <= 7 ? 'divider' : 'transparent',
                    opacity: week.getDate() <= 7 ? 0.8 : 0.3,
                    borderLeft: week.getDate() <= 7 ? 'none' : '1px dashed',
                    borderColor: 'divider'
                  }}
                />
              ))}
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
            
            {Object.entries(groupedProjects).map(([groupKey, projects]) => {
              const isGroupExpanded = groupExpanded[groupKey]
              
              return (
                <React.Fragment key={`timeline-${groupKey}`}>
                  {/* Render project timelines in this group if expanded */}
                  {isGroupExpanded && projects.map(proj => renderTimelineForProject(proj))}
                </React.Fragment>
              )
            })}
          </Box>
        </Box>
        </CardContent>
      </Card>

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
                label={field.label || field.name}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleResetColumns} color="secondary">Reset to Default</Button>
          <Button onClick={handleCloseColumnDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default React.memo(GanttChart)
