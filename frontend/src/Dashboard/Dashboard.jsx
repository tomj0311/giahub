import React, { useState, useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Link as RouterLink, useLocation, Outlet } from 'react-router-dom'
import {
	AppBar,
	Toolbar,
	IconButton,
	Typography,
	Drawer,
	List,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Divider,
	Box,
	Container,
	useMediaQuery,
	Avatar,
	Menu,
	MenuItem,
	Chip,
	Tooltip,
	Card,
	CardContent,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	Button
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { getThemeKeyForMode } from '../theme'
import {
	Menu as MenuIconOld,
	PanelLeftOpen,
	PanelLeftClose,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	ChevronUp,
	Settings
} from 'lucide-react'
import {
	LogOut as LogoutIcon,
	Bell as NotificationsIcon,
	User as AccountCircleIcon,
	Moon as Brightness4Icon,
	Sun as Brightness7Icon,
	KeyRound as KeyIcon
} from 'lucide-react'
import PasswordResetDialog from '../components/PasswordResetDialog'
import sharedApiService from '../utils/apiService'
import { api } from '../config/api'
const Home = lazy(() => import('./Home'))
const AgentHome = lazy(() => import('../agents/AgentHome'))
const Users = lazy(() => import('./Users'))
const RoleManagement = lazy(() => import('./RoleManagement'))
const UserInvitation = lazy(() => import('./UserInvitation'))
const ModelConfig = lazy(() => import('../agents/ModelConfig'))
const ToolConfig = lazy(() => import('../agents/ToolConfig'))
const KnowledgeConfig = lazy(() => import('../agents/KnowledgeConfig'))
const Agent = lazy(() => import('../agents/Agent'))
const AgentPlayground = lazy(() => import('../playground/AgentPlayground'))
const ProjectStatusHome = lazy(() => import('../projects/ProjectStatusHome'))
const ProjectTreeView = lazy(() => import('../projects/ProjectTreeView'))
const ProjectPlanning = lazy(() => import('../projects/ProjectPlanning'))
const ActivityForm = lazy(() => import('../projects/ActivityForm'))
const ProjectForm = lazy(() => import('../projects/ProjectForm'))
const GanttChart = lazy(() => import('../projects/GanttChart'))
const ProjectChat = lazy(() => import('../projects/ProjectChat'))
const AIAssistant = lazy(() => import('../projects/AIAssistant'))
const WorkflowConfig = lazy(() => import('../workflows/WorkflowConfig'))
const WorkflowExecution = lazy(() => import('../workflows/WorkflowExecution'))
const WorkflowUI = lazy(() => import('../workflows/WorkflowUI'))
const TaskCompletion = lazy(() => import('../workflows/TaskCompletion'))
const DynamicComponentLoader = lazy(() => import('../workflows/DynamicComponentLoader'))
const DynamicFunctionTester = lazy(() => import('../workflows/DynamicFunctionTester'))
const SchedulerJobs = lazy(() => import('../workflows/SchedulerJobs'))
const Analytics = lazy(() => import('./Analytics'))
const BPMN = lazy(() => import('../components/bpmn/BPMN'))
import RouteTransition from '../components/RouteTransition'
import RouteLoader from '../components/RouteLoader'
import { getIconComponent } from '../utils/iconMap'

const DRAWER_WIDTH = 240
// Slimmer collapsed width to match compact icon rail
const MINI_WIDTH = 56

function DashboardLayout({ user, onLogout, themeKey, setThemeKey }) {
	const theme = useTheme()
	const isMobile = useMediaQuery(theme.breakpoints.down('md'))
	const [drawerOpen, setDrawerOpen] = useState(true) // desktop mini variant
	const [mobileOpen, setMobileOpen] = useState(false)
	const [anchorEl, setAnchorEl] = useState(null)
	
	// Debug: Log the user data
	useEffect(() => {
		console.log('👤 USER DATA IN DASHBOARD:', user)
		console.log('📧 User email:', user?.email)
		console.log('🏷️ User name:', user?.name)
		console.log('🎭 User role:', user?.role)
	}, [user])
	const [expandedSections, setExpandedSections] = useState({})
	const [showPasswordReset, setShowPasswordReset] = useState(false)
	const [showProfile, setShowProfile] = useState(false)
	const [apiUserData, setApiUserData] = useState(null)
	const [loadingUserData, setLoadingUserData] = useState(false)
	const location = useLocation()

	// Decode JWT token to get user data
	const decodeJWT = (token) => {
		try {
			const base64Url = token.split('.')[1]
			const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
			const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
				return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
			}).join(''))
			return JSON.parse(jsonPayload)
		} catch (error) {
			console.error('❌ JWT decode error:', error)
			return null
		}
	}

	// Extract user data from JWT token instead of API call
	const fetchUserData = async () => {
		setLoadingUserData(true)
		try {
			console.log('� Extracting user data from JWT token...')
			
			if (user?.token) {
				const decodedToken = decodeJWT(user.token)
				console.log('✅ Decoded JWT token:', decodedToken)
				
				if (decodedToken) {
					// Map JWT fields to user data structure
					const userData = {
						id: decodedToken.id,
						name: user.name || decodedToken.name,
						email: decodedToken.email,
						role: decodedToken.role,
						tenantId: decodedToken.tenantId,
						expiry: decodedToken.exp,
						expiryDate: new Date(decodedToken.exp * 1000).toLocaleString()
					}
					console.log('� Formatted user data:', userData)
					setApiUserData(userData)
				} else {
					setApiUserData({ error: 'Failed to decode JWT token' })
				}
			} else {
				setApiUserData({ error: 'No JWT token available' })
			}
			
		} catch (error) {
			console.error('❌ Error processing user data:', error)
			setApiUserData({ error: `Processing Error: ${error.message}` })
		} finally {
			setLoadingUserData(false)
		}
	}

	// removed DashboardLayout render debug log

	// Hardcoded menu items based on screenshot
	const menuItems = [
		// Home moved under Agents as Agent Home
		{
			label: 'Projects',
			icon: 'FolderKanban',
			expandable: true,
			order: 15,
			children: [
				{
					label: 'Home',
					to: '/dashboard/projects',
					icon: 'Home'
				},
				{
					label: 'Portfolio',
					to: '/dashboard/projects/portfolio',
					icon: 'FolderKanban'
				},
				{
					label: 'Planning',
					to: '/dashboard/projects/planning',
					icon: 'ListChecks'
				},
				{
					label: 'AI Assistant',
					to: '/dashboard/projects/ai-assistant',
					icon: 'Bot'
				}
			]
		},
		{
			label: 'Agents',
			icon: 'Bot',
			expandable: true,
			order: 20,
			children: [
				{
					label: 'Home',
					to: '/dashboard/agents/home',
					icon: 'Home'
				},
				{
					label: 'Playground',
					to: '/dashboard/agent-playground',
					icon: 'Play'
				},
				{
					label: 'Analytics',
					to: '/dashboard/analytics',
					icon: 'BarChart'
				}
			]
		},
		{
			label: 'Configuration',
			icon: 'Settings',
			expandable: true,
			order: 30,
			children: [
				{
					label: 'Models',
					to: '/dashboard/models',
					icon: 'Brain'
				},
				{
					label: 'Tools',
					to: '/dashboard/tools',
					icon: 'Wrench'
				},
				{
					label: 'Knowledge',
					to: '/dashboard/knowledge',
					icon: 'BookOpen'
				}
			]
		},
		{
			label: 'Workflows',
			icon: 'Workflow',
			expandable: true,
			order: 40,
			children: [
				{
					label: 'Home',
					to: '/dashboard/workflows',
					icon: 'Home'
				},
				{
					label: 'Run Workflow',
					to: '/dashboard/workflow-ui',
					icon: 'Play'
				},
				{
					label: 'Scheduler Jobs',
					to: '/dashboard/scheduler-jobs',
					icon: 'Timer'
				},
				{
					label: 'Utilities',
					icon: 'Package',
					expandable: true,
					children: [
						{
							label: 'Function Tester',
							to: '/dashboard/function-tester',
							icon: 'TestTube'
						},
						{
							label: 'Generate UI Components',
							to: '/dashboard/dynamic',
							icon: 'Code'
						},
					]
				},
				{
					label: 'Create Processes',
					to: '/dashboard/bpmn',
					icon: 'GitBranch'
				}
			]
		},
		{
			label: 'Settings',
			icon: 'Settings',
			expandable: true,
			order: 100,
			children: [
				{
					label: 'Users',
					to: '/dashboard/users',
					icon: 'Users'
				},
				{
					label: 'Role Management',
					to: '/dashboard/role-management',
					icon: 'Shield'
				},
				{
					label: 'User Invitation',
					to: '/dashboard/user-invitation',
					icon: 'UserPlus'
				}
			]
		},
		{
			label: 'Help & Support',
			to: '/dashboard/help',
			icon: 'HelpCircle',
			order: 110
		}
	]

	const handleProfileMenuOpen = (event) => {
		setAnchorEl(event.currentTarget)
	}

	const handleProfileMenuClose = () => {
		setAnchorEl(null)
	}

	const handleLogout = () => {
		handleProfileMenuClose()
		onLogout()
	}

	const handleThemeToggle = () => {
		handleProfileMenuClose()
		const nextMode = theme.palette.mode === 'dark' ? 'light' : 'dark'
		setThemeKey(getThemeKeyForMode(nextMode))
	}

	const handlePasswordReset = () => {
		handleProfileMenuClose()
		setShowPasswordReset(true)
	}

	const handleProfile = () => {
		handleProfileMenuClose()
		setShowProfile(true)
		// Fetch fresh user data from API
		fetchUserData()
	}

	const toggleSection = (sectionLabel) => {
		setExpandedSections(prev => ({
			...prev,
			[sectionLabel]: !prev[sectionLabel]
		}))
	}

	const leftWidth = isMobile ? 0 : (drawerOpen ? DRAWER_WIDTH : MINI_WIDTH)

	// Separate top-level and settings menu items
	const topMenuItems = menuItems.filter(item => item.order < 100)
	const settingsMenuItems = menuItems.filter(item => item.order >= 100)

	// Helper to render nav items (shared for top and bottom sections)
	const renderNavItems = (items) => items.map((item) => {
		if (item.expandable && !item.to) {
			// Expandable section without direct navigation
			const isSectionSelected = item.children?.some((child) =>
				location.pathname === child.to || location.pathname.startsWith(child.to)
			)
			// Use expandedSections state to control expansion
			const isExpanded = expandedSections[item.label] || false
			const ExpandIcon = isExpanded ? ChevronUp : ChevronDown
			const Icon = getIconComponent(item.icon)

			return (
				<React.Fragment key={item.label}>
					<ListItemButton
						onClick={() => toggleSection(item.label)}
						selected={Boolean(isSectionSelected)}
						sx={{
							minHeight: 36,
							px: 0.5,
							py: 0.25,
							my: 0.25,
							mx: 0.5,
							borderRadius: 1.5,
							width: 'auto',
							minWidth: 'fit-content',
							justifyContent: drawerOpen || isMobile ? 'flex-start' : 'center',
							'& .MuiListItemText-primary': { transition: 'color 160ms ease' },
							'&:hover': {
								backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
								'& .MuiListItemText-primary': { color: theme.palette.text.primary }
							},
							'&.Mui-selected .MuiListItemText-primary': { color: theme.palette.text.primary },
							'&.Mui-selected': {
								backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
							}
						}}
					>
						<ListItemIcon sx={{
							minWidth: 0,
							width: 20,
							color: 'text.secondary',
							display: 'flex',
							justifyContent: 'flex-start',
							ml: drawerOpen || isMobile ? 1 : 0.5
						}}>
							<Icon size={18} strokeWidth={1.8} />
						</ListItemIcon>
						<ListItemText
							primary={item.label}
							primaryTypographyProps={{
								fontSize: 12.5,
								fontWeight: 500,
								letterSpacing: 0.2,
								color: isSectionSelected ? 'text.primary' : 'text.secondary'
							}}
							sx={{
								opacity: drawerOpen || isMobile ? 1 : 0,
								transition: 'opacity 200ms ease',
								whiteSpace: 'nowrap'
							}}
						/>
						{(drawerOpen || isMobile) && (
							<ExpandIcon size={16} color={theme.palette.text.secondary} />
						)}
					</ListItemButton>

					{/* Submenu items */}
					{isExpanded && (drawerOpen || isMobile) && item.children?.map((child) => {
						// Check if child has nested children (submenu within submenu)
						if (child.expandable && child.children) {
							const isChildExpanded = expandedSections[child.label] || false
							const ChildExpandIcon = isChildExpanded ? ChevronUp : ChevronDown
							const ChildIcon = getIconComponent(child.icon)
							const isChildSectionSelected = child.children?.some((nestedChild) =>
								location.pathname === nestedChild.to || location.pathname.startsWith(nestedChild.to)
							)

							return (
								<React.Fragment key={child.label}>
									<ListItemButton
										onClick={() => toggleSection(child.label)}
										selected={Boolean(isChildSectionSelected)}
										sx={{
											minHeight: 32,
											px: 0.5,
											py: 0.25,
											my: 0.1,
											mx: 0.5,
											ml: 2.5,
											borderRadius: 1.5,
											'& .MuiListItemText-primary': { transition: 'color 160ms ease' },
											'&:hover': {
												backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
												'& .MuiListItemText-primary': { color: theme.palette.text.primary }
											},
											'&.Mui-selected .MuiListItemText-primary': { color: theme.palette.text.primary },
											'&.Mui-selected': {
												backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
											}
										}}
									>
										<ListItemIcon sx={{ minWidth: 24, color: 'text.secondary' }}>
											<ChildIcon size={16} strokeWidth={1.8} />
										</ListItemIcon>
										<ListItemText
											primary={child.label}
											primaryTypographyProps={{
												fontSize: 11.5,
												fontWeight: 500,
												letterSpacing: 0.2,
												color: isChildSectionSelected ? 'text.primary' : 'text.secondary'
											}}
										/>
										<ChildExpandIcon size={14} color={theme.palette.text.secondary} />
									</ListItemButton>

									{/* Nested submenu items */}
									{isChildExpanded && child.children?.map((nestedChild) => {
										const nestedSelected = location.pathname === nestedChild.to
										const NestedIcon = getIconComponent(nestedChild.icon)
										return (
											<ListItemButton
												key={nestedChild.to}
												component={RouterLink}
												to={nestedChild.to}
												selected={nestedSelected}
												sx={{
													minHeight: 28,
													px: 0.5,
													py: 0.25,
													my: 0.1,
													mx: 0.5,
													ml: 4.5,
													borderRadius: 1.5,
													'& .MuiListItemText-primary': { transition: 'color 160ms ease' },
													'&:hover': {
														backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
														'& .MuiListItemText-primary': { color: theme.palette.text.primary }
													},
													'&.Mui-selected .MuiListItemText-primary': { color: theme.palette.text.primary },
													'&.Mui-selected': {
														backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)'
													}
												}}
												onClick={() => { if (isMobile) setMobileOpen(false) }}
											>
												<ListItemIcon sx={{ minWidth: 20, color: 'text.secondary' }}>
													<NestedIcon size={14} strokeWidth={1.8} />
												</ListItemIcon>
												<ListItemText
													primary={nestedChild.label}
													primaryTypographyProps={{
														fontSize: 11,
														fontWeight: 500,
														letterSpacing: 0.2,
														color: nestedSelected ? 'text.primary' : 'text.secondary'
													}}
												/>
											</ListItemButton>
										)
									})}
								</React.Fragment>
							)
						} else {
							// Regular child item without nested children
							const selected = location.pathname === child.to
							const ChildIcon = getIconComponent(child.icon)
							return (
								<ListItemButton
									key={child.to}
									component={RouterLink}
									to={child.to}
									selected={selected}
									sx={{
										minHeight: 32,
										px: 0.5,
										py: 0.25,
										my: 0.1,
										mx: 0.5,
										ml: 2.5,
										borderRadius: 1.5,
										'& .MuiListItemText-primary': { transition: 'color 160ms ease' },
										'&:hover': {
											backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
											'& .MuiListItemText-primary': { color: theme.palette.text.primary }
										},
										'&.Mui-selected .MuiListItemText-primary': { color: theme.palette.text.primary },
										'&.Mui-selected': {
											backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
										}
									}}
									onClick={() => { if (isMobile) setMobileOpen(false) }}
								>
									<ListItemIcon sx={{ minWidth: 24, color: 'text.secondary' }}>
										<ChildIcon size={16} strokeWidth={1.8} />
									</ListItemIcon>
									<ListItemText
										primary={child.label}
										primaryTypographyProps={{
											fontSize: 11.5,
											fontWeight: 500,
											letterSpacing: 0.2,
											color: selected ? 'text.primary' : 'text.secondary'
										}}
									/>
								</ListItemButton>
							)
						}
					})}
				</React.Fragment>
			)
		} else {
			// Non-expandable item or expandable item with direct navigation
			const selected = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))
			const Icon = getIconComponent(item.icon)

			// For expandable items with 'to' property, we want both navigation and expansion
			const isExpandableWithLink = item.expandable && item.to
			const isExpanded = expandedSections[item.label] || false
			const ExpandIcon = isExpanded ? ChevronUp : ChevronDown

			return (
				<React.Fragment key={item.to || item.label}>
					<ListItemButton
						key={item.to || item.label}
						component={RouterLink}
						to={item.to}
						selected={selected}
						sx={{
							minHeight: 36,
							px: 0.5,
							py: 0.25,
							my: 0.25,
							mx: 0.5,
							borderRadius: 1.5,
							width: 'auto',
							minWidth: 'fit-content',
							justifyContent: drawerOpen || isMobile ? 'flex-start' : 'center',
							'& .MuiListItemText-primary': { transition: 'color 160ms ease' },
							'&:hover': {
								backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
								'& .MuiListItemText-primary': { color: theme.palette.text.primary }
							},
							'&.Mui-selected .MuiListItemText-primary': { color: theme.palette.text.primary },
							'&.Mui-selected': {
								backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
							}
						}}
						onClick={() => {
							if (isMobile) setMobileOpen(false)
							// If it's expandable with a link, also toggle expansion
							if (isExpandableWithLink) {
								toggleSection(item.label)
							}
						}}
					>
						<ListItemIcon sx={{
							minWidth: 0,
							width: 20,
							color: 'text.secondary',
							display: 'flex',
							justifyContent: 'flex-start',
							ml: drawerOpen || isMobile ? 1 : 0.5
						}}>
							<Icon size={18} strokeWidth={1.8} />
						</ListItemIcon>
						<ListItemText
							primary={item.label}
							primaryTypographyProps={{
								fontSize: 12.5,
								fontWeight: 500,
								letterSpacing: 0.2,
								color: selected ? 'text.primary' : 'text.secondary'
							}}
							sx={{
								opacity: drawerOpen || isMobile ? 1 : 0,
								transition: 'opacity 200ms ease',
								whiteSpace: 'nowrap'
							}}
						/>
						{isExpandableWithLink && (drawerOpen || isMobile) && (
							<ExpandIcon size={16} color={theme.palette.text.secondary} />
						)}
					</ListItemButton>

					{/* Submenu items for expandable items with links */}
					{isExpandableWithLink && isExpanded && (drawerOpen || isMobile) && item.children?.map((child) => {
						const childSelected = location.pathname === child.to
						const ChildIcon = getIconComponent(child.icon)
						return (
							<ListItemButton
								key={child.to}
								component={RouterLink}
								to={child.to}
								selected={childSelected}
								sx={{
									minHeight: 32,
									px: 0.5,
									py: 0.25,
									my: 0.1,
									mx: 0.5,
									ml: 2.5,
									borderRadius: 1.5,
									'& .MuiListItemText-primary': { transition: 'color 160ms ease' },
									'&:hover': {
										backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
										'& .MuiListItemText-primary': { color: theme.palette.text.primary }
									},
									'&.Mui-selected .MuiListItemText-primary': { color: theme.palette.text.primary },
									'&.Mui-selected': {
										backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
									}
								}}
								onClick={() => { if (isMobile) setMobileOpen(false) }}
							>
								<ListItemIcon sx={{ minWidth: 24, color: 'text.secondary' }}>
									<ChildIcon size={16} strokeWidth={1.8} />
								</ListItemIcon>
								<ListItemText
									primary={child.label}
									primaryTypographyProps={{
										fontSize: 11.5,
										fontWeight: 500,
										letterSpacing: 0.2,
										color: childSelected ? 'text.primary' : 'text.secondary'
									}}
								/>
							</ListItemButton>
						)
					})}
				</React.Fragment>
			)
		}
	})

	const DrawerContent = (
		<Box sx={{
			display: 'flex',
			flexDirection: 'column',
			height: '100%',
			px: 1, // Add horizontal padding
			pt: 1  // Add top padding for better spacing
		}}>
			{/* Dense list for tighter vertical rhythm */}
			<List dense sx={{ py: 0.5 }}>
				{renderNavItems(topMenuItems)}
			</List>
			<Box sx={{ flexGrow: 1 }} />
			{/* Settings group anchored at the bottom */}
			<List dense sx={{ py: 0.5 }}>
				{renderNavItems(settingsMenuItems)}
			</List>
			<Divider />
			<Box sx={{ p: 1, display: 'flex', justifyContent: drawerOpen || isMobile ? 'space-between' : 'center', alignItems: 'center' }}>
				{drawerOpen || isMobile ? (
					<Typography variant="caption" color="text.secondary">
						Nav
					</Typography>
				) : null}
				<IconButton size="small" onClick={() => (isMobile ? setMobileOpen(false) : setDrawerOpen(v => !v))}>
					{theme.direction === 'rtl'
						? (drawerOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />)
						: (drawerOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />)}
				</IconButton>
			</Box>
		</Box>
	)

	return (
		<Box sx={{
			display: 'flex',
			minHeight: '100vh',
			width: '100%',
			maxWidth: '100%',
			overflow: 'hidden' // Prevent any overflow at root level
		}}>
			{/* AppBar */}
			<AppBar
				position="fixed"
				elevation={0}
				sx={{
					background: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.95)',
					backdropFilter: 'saturate(180%) blur(8px)',
					borderBottom: '1px solid',
					borderColor: 'divider',
					color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000'
				}}
			>
				<Toolbar sx={{ gap: 1 }}>
					{isMobile ? (
						<IconButton
							edge="start"
							onClick={() => setMobileOpen(true)}
							sx={{ color: theme.palette.mode === 'dark' ? '#ffffff !important' : '#000000 !important' }}
						>
							<MenuIconOld size={20} />
						</IconButton>
					) : (
						<IconButton
							edge="start"
							onClick={() => setDrawerOpen(v => !v)}
							sx={{ color: theme.palette.mode === 'dark' ? '#ffffff !important' : '#000000 !important' }}
						>
							{drawerOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
						</IconButton>
					)}
					<Typography
						variant="h6"
						component={RouterLink}
						to="/dashboard/home"
						sx={{
							fontWeight: 700,
							flexGrow: 1,
							color: theme.palette.mode === 'dark' ? '#ffffff !important' : '#000000 !important',
							fontSize: '1.25rem',
							textDecoration: 'none',
							cursor: 'pointer',
							'&:hover': {
								opacity: 0.8
							}
						}}
					>
						GIA
					</Typography>

					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<IconButton sx={{ color: theme.palette.mode === 'dark' ? '#ffffff !important' : '#000000 !important' }}>
							<NotificationsIcon size={18} />
						</IconButton>

						<Chip
							avatar={
								<Avatar
									sx={{
										bgcolor: (() => {
											const bgColor = theme.palette.mode === 'dark' ? theme.palette.primary.main : theme.palette.secondary.main;
											return bgColor;
										})(),
										color: (() => {
											const bgColor = theme.palette.mode === 'dark' ? theme.palette.primary.main : theme.palette.secondary.main;
											return theme.palette.getContrastText(bgColor);
										})(),
										width: 24,
										height: 24,
										fontSize: 12
									}}
								>
									{user?.name?.[0] || 'U'}
								</Avatar>
							}
							label={user?.name || 'User'}
							onClick={handleProfileMenuOpen}
							sx={{
								color: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
								bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
								borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
								'& .MuiChip-label': { 
									color: theme.palette.mode === 'dark' ? '#ffffff !important' : '#000000 !important',
									fontWeight: 500
								},
								cursor: 'pointer',
								'&:hover': {
									bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
								}
							}}
							variant="outlined"
							clickable
						/>

						<Menu
							anchorEl={anchorEl}
							open={Boolean(anchorEl)}
							onClose={handleProfileMenuClose}
							anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
							transformOrigin={{ vertical: 'top', horizontal: 'right' }}
							sx={{ zIndex: 1300 }}
							slotProps={{
								paper: {
									sx: {
										minWidth: 200,
										mt: 1,
										'& .MuiMenuItem-root': {
											fontSize: '0.875rem'
										}
									}
								}
							}}
						>
							<MenuItem onClick={handleProfile}>
								<ListItemIcon>
									<AccountCircleIcon size={16} />
								</ListItemIcon>
								Profile
							</MenuItem>
							<MenuItem onClick={handlePasswordReset}>
								<ListItemIcon>
									<KeyIcon size={16} />
								</ListItemIcon>
								Change Password
							</MenuItem>
							<MenuItem onClick={handleThemeToggle}>
								<ListItemIcon>
									{themeKey === 'aurora' ? <Brightness7Icon size={16} /> : <Brightness4Icon size={16} />}
								</ListItemIcon>
								Switch to {themeKey === 'aurora' ? 'Ocean' : 'Aurora'} Theme
							</MenuItem>
							<Divider />
							<MenuItem onClick={handleLogout}>
								<ListItemIcon>
									<LogoutIcon size={16} />
								</ListItemIcon>
								Sign Out
							</MenuItem>
						</Menu>
					</Box>

			<PasswordResetDialog
				open={showPasswordReset}
				onClose={() => setShowPasswordReset(false)}
				onLogout={handleLogout}
			/>

			{/* Profile Dialog */}
			<Dialog
				open={showProfile}
				onClose={() => setShowProfile(false)}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					User Profile
					<IconButton onClick={() => setShowProfile(false)} size="small">
						<ChevronLeft size={20} />
					</IconButton>
				</DialogTitle>
				<DialogContent>
					{loadingUserData ? (
						<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
							<Typography>Loading user data...</Typography>
						</Box>
					) : (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 2 }}>
							<Avatar
								sx={{
									bgcolor: theme.palette.primary.main,
									width: 60,
									height: 60,
									fontSize: 24
								}}
							>
								{apiUserData?.name?.[0] || user?.name?.[0] || 'U'}
							</Avatar>
							<Box>
								<Typography variant="h6">
									{apiUserData?.name || user?.name || 'User'}
								</Typography>
								<Typography variant="body2" color="text.secondary">
									Role: {apiUserData?.role || 'User'}
								</Typography>
							</Box>
						</Box>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setShowProfile(false)}>Close</Button>
				</DialogActions>
			</Dialog>
				</Toolbar>
			</AppBar>

			{/* Left Drawer */}
			{isMobile ? (
				<Drawer
					variant="temporary"
					open={mobileOpen}
					onClose={() => setMobileOpen(false)}
					ModalProps={{ keepMounted: true }}
					sx={{
						'& .MuiDrawer-paper': {
							width: DRAWER_WIDTH,
							background: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
							backdropFilter: 'saturate(180%) blur(8px)',
							borderRight: theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)'
						}
					}}
				>
					{DrawerContent}
				</Drawer>
			) : (
				<Drawer
					variant="permanent"
					open
					sx={{
						width: leftWidth,
						flexShrink: 0,
						'& .MuiDrawer-paper': {
							position: 'fixed',
							width: leftWidth,
							transition: 'width 200ms ease',
							overflowX: 'hidden',
							top: 65, // Slightly offset from AppBar to avoid border intersection
							height: 'calc(100% - 65px)',
							background: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
							backdropFilter: 'saturate(180%) blur(8px)',
							borderTop: 'none', // Remove top border
							borderRight: theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)'
						}
					}}
				>
					{DrawerContent}
				</Drawer>
			)}

			{/* Main content */}
			<Box component="main" sx={{
				flexGrow: 1,
				minWidth: 0, // Allow shrinking below content width
				overflow: 'hidden', // Prevent any overflow
				display: 'flex',
				flexDirection: 'column'
			}}>
				{/* Offset for fixed AppBar */}
				<Toolbar />
				<Box sx={{
					flex: 1,
					width: '100%',
					minWidth: 0, // Allow shrinking
					overflow: 'auto', // Allow scrolling within content area only
					// Conditional styling for BPMN, workflow-execution, workflow-ui, projects, portfolio, planning, gantt, ai-assistant, and project form routes
					...(location.pathname === '/dashboard/bpmn' || location.pathname === '/dashboard/workflow-execution' || location.pathname === '/dashboard/workflow-ui' || location.pathname === '/dashboard/projects' || location.pathname === '/dashboard/projects/portfolio' || location.pathname === '/dashboard/projects/planning' || location.pathname === '/dashboard/projects/gantt' || location.pathname === '/dashboard/projects/ai-assistant' || location.pathname.startsWith('/dashboard/projects/project/') ? {
						// Full width with minimal padding
						maxWidth: 'none',
						mx: 0,
						p: 3
					} : {
						// Standard layout for other routes
						maxWidth: '1200px', // Consistent max width for all components
						mx: 'auto',         // Center the content
						px: {
							xs: 0.5,    // 0px on mobile - no horizontal padding
							sm: 0.5,  // 4px on small tablets - minimal padding
							md: 1,    // 8px on medium screens
							lg: 2,    // 16px on large screens
						},
						py: 4
					})
				}}>
					<Suspense fallback={<RouteLoader />}>
						<RouteTransition>
							<Box sx={{
								width: '100%',
								minWidth: 0, // Allow shrinking
								overflow: 'visible' // Allow content to flow naturally
							}}>
								<Outlet />
							</Box>
						</RouteTransition>
					</Suspense>
				</Box>
			</Box>
		</Box>
	)
}

export default function Dashboard({ user, onLogout, themeKey, setThemeKey }) {
	// removed Dashboard render debug log

	// BPMN Editor wrapper component to handle navigation state
	const BPMNEditorWrapper = () => {
		const location = useLocation()
		const initialBPMN = location.state?.initialBPMN || null
		// Default to edit mode (true) unless explicitly set to false
		// This ensures /dashboard/bpmn opens in edit mode by default
		const editMode = location.state?.editMode !== false

		// Clear location state after getting the BPMN to ensure fresh load every time
		useEffect(() => {
			if (location.state?.initialBPMN) {
				// Clear the state to prevent reloading the same BPMN on refresh
				window.history.replaceState({}, document.title, location.pathname)
			}
		}, [location.state?.initialBPMN, location.pathname])

		// Convert themeKey to BPMN theme format
		const getBPMNTheme = () => {
			if (themeKey === 'aurora') return 'dark'
			if (themeKey === 'ocean') return 'light'
			return 'auto' // fallback
		}

		return (
			<Box>
				<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
					<Box>
						<Typography variant="body1" color="text.secondary">
							Design and visualize business processes with BPMN 2.0 editor.
						</Typography>
					</Box>
				</Box>

				<Card sx={{ overflow: 'hidden', boxShadow: 'none', border: '1px solid', borderColor: 'divider' }}>
					<CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
						<BPMN
							initialTheme={getBPMNTheme()}
							style={{ width: '100%', minHeight: '70vh', display: 'block' }}
							initialBPMN={initialBPMN}
							showToolbox={editMode}
							showPropertyPanel={editMode}
							readOnly={!editMode}
							key={themeKey} // Force re-render when theme changes
						/>
					</CardContent>
				</Card>
			</Box>
		)
	}
	return (
		<Routes>
			{/* TaskCompletion route without dashboard layout */}
			<Route path="task/:workflowId/:instanceId" element={<TaskCompletion user={user} />} />

			{/* All other routes with dashboard layout */}
			<Route path="/" element={<DashboardLayout user={user} onLogout={onLogout} themeKey={themeKey} setThemeKey={setThemeKey} />}>
				<Route index element={<Navigate to="home" replace />} />
				<Route path="home" element={<Home user={user} />} />
				<Route path="agents/home" element={<AgentHome user={user} />} />
				<Route path="users" element={<Users user={user} />} />
				<Route path="role-management" element={<RoleManagement user={user} />} />
				<Route path="user-invitation" element={<UserInvitation user={user} />} />
				<Route path="projects" element={<ProjectStatusHome user={user} />} />
				<Route path="projects/portfolio" element={<ProjectTreeView user={user} />} />
				<Route path="projects/planning" element={<ProjectPlanning user={user} />} />
				<Route path="projects/ai-assistant" element={<AIAssistant user={user} />} />
				<Route path="projects/activity/new" element={<ActivityForm user={user} />} />
				<Route path="projects/activity/:activityId" element={<ActivityForm user={user} />} />
				<Route path="projects/project/new" element={<ProjectForm user={user} />} />
				<Route path="projects/project/:id" element={<ProjectForm user={user} />} />
				<Route path="projects/gantt" element={<GanttChart user={user} />} />
				<Route path="agents" element={<Agent user={user} />} />
				<Route path="models" element={<ModelConfig user={user} />} />
				<Route path="tools" element={<ToolConfig user={user} />} />
				<Route path="knowledge" element={<KnowledgeConfig user={user} />} />
				<Route path="agent-playground" element={<AgentPlayground user={user} />} />
				<Route path="analytics" element={<Analytics />} />
				<Route path="workflows" element={<WorkflowConfig user={user} />} />
				<Route path="workflow-ui" element={<WorkflowUI user={user} />} />
				<Route path="function-tester" element={<DynamicFunctionTester user={user} />} />
				<Route path="scheduler-jobs" element={<SchedulerJobs user={user} />} />
				<Route path="dynamic" element={<DynamicComponentLoader user={user} />} />
				<Route path="bpmn" element={<BPMNEditorWrapper />} />
				<Route path="workflow-execution" element={<WorkflowExecution user={user} />} />
				<Route path="manage" element={<BPMN initialTheme={themeKey === 'aurora' ? 'dark' : themeKey === 'ocean' ? 'light' : 'auto'} key={themeKey} style={{ width: '100%', minHeight: '70vh', borderRadius: 8, overflow: 'hidden' }} />} />
				<Route path="tenants" element={<div>Tenants - Coming Soon</div>} />
				<Route path="help" element={<div>Help & Support - Coming Soon</div>} />
			</Route>
		</Routes>
	)
}