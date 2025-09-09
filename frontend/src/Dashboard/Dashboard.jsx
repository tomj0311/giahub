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
	Tooltip
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
	Sun as Brightness7Icon
} from 'lucide-react'
const Home = lazy(() => import('./Home'))
const Users = lazy(() => import('./Users'))
const RoleManagement = lazy(() => import('./RoleManagement'))
const UserInvitation = lazy(() => import('./UserInvitation'))
const ModelConfig = lazy(() => import('../agents/ModelConfig'))
const ToolConfig = lazy(() => import('../agents/ToolConfig'))
const KnowledgeConfig = lazy(() => import('../agents/KnowledgeConfig'))
const Agent = lazy(() => import('../agents/Agent'))
const AgentPlayground = lazy(() => import('../playground/AgentPlayground'))
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
	const [expandedSections, setExpandedSections] = useState({})
	const location = useLocation()

	// Hardcoded menu items based on screenshot
	const menuItems = [
		{
			label: 'Home',
			to: '/dashboard/home',
			icon: 'Home',
			order: 10
		},
		{
			label: 'Agents',
			icon: 'Bot',
			expandable: true,
			order: 20,
			children: [
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
					to: '/dashboard/model-config',
					icon: 'Brain'
				},
				{
					label: 'Tools',
					to: '/dashboard/tool-config',
					icon: 'Wrench'
				},
				{
					label: 'Databases',
					to: '/dashboard/databases',
					icon: 'Database'
				},
				{
					label: 'Custom Connectors',
					to: '/dashboard/custom-connectors',
					icon: 'Plug'
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
					label: 'BPMN',
					to: '/dashboard/bpmn',
					icon: 'GitBranch'
				},
				{
					label: 'Monitor',
					to: '/dashboard/monitor',
					icon: 'Monitor'
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
				},
				{
					label: 'Tenants',
					to: '/dashboard/tenants',
					icon: 'Building'
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
		<Box sx={{ display: 'flex', minHeight: '100vh' }}>
			{/* AppBar */}
			<AppBar
				position="fixed"
				elevation={0}
				sx={{
					background: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.95)',
					backdropFilter: 'saturate(180%) blur(8px)',
					borderBottom: theme.palette.mode === 'dark' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
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
					<Typography variant="h6" sx={{
						fontWeight: 700,
						flexGrow: 1,
						color: theme.palette.mode === 'dark' ? '#ffffff !important' : '#000000 !important',
						fontSize: '1.25rem'
					}}>GiaHUB</Typography>

					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<IconButton sx={{ color: theme.palette.mode === 'dark' ? '#ffffff !important' : '#000000 !important' }}>
							<NotificationsIcon size={18} />
						</IconButton>

						<Chip
							avatar={
								<Avatar
									sx={{
										bgcolor: theme.palette.mode === 'dark' ? theme.palette.primary.main : theme.palette.secondary.main,
										color: theme.palette.getContrastText(theme.palette.mode === 'dark' ? theme.palette.primary.main : theme.palette.secondary.main),
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
								color: theme.palette.text.primary,
								bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
								borderColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.23)',
								'& .MuiChip-label': { color: 'inherit' }
							}}
							variant="outlined"
						/>
					</Box>

					<Menu
						anchorEl={anchorEl}
						open={Boolean(anchorEl)}
						onClose={handleProfileMenuClose}
						anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
						transformOrigin={{ vertical: 'top', horizontal: 'right' }}
					>
						<MenuItem onClick={handleProfileMenuClose}>
							<ListItemIcon>
								<AccountCircleIcon size={16} />
							</ListItemIcon>
							Profile
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
			<Box component="main" sx={{ flexGrow: 1, width: '100%' }}>
				{/* Offset for fixed AppBar */}
				<Toolbar />
				<Box sx={{
					width: '100%',
					maxWidth: '1200px', // Consistent max width for all components
					mx: 'auto',         // Center the content
					px: {
						xs: 2,    // 16px on mobile
						sm: 3,    // 24px on small tablets
						md: 4,    // 32px on medium screens
						lg: 6,    // 48px on large screens
					},
					py: 4
				}}>
					<Suspense fallback={<RouteLoader />}>
						<RouteTransition>
							<Outlet />
						</RouteTransition>
					</Suspense>
				</Box>
			</Box>
		</Box>
	)
}

export default function Dashboard({ user, onLogout, themeKey, setThemeKey }) {
	return (
		<Routes>
			<Route path="/" element={<DashboardLayout user={user} onLogout={onLogout} themeKey={themeKey} setThemeKey={setThemeKey} />}>
				<Route index element={<Navigate to="home" replace />} />
				<Route path="home" element={<Home user={user} />} />
				<Route path="users" element={<Users user={user} />} />
				<Route path="role-management" element={<RoleManagement user={user} />} />
				<Route path="user-invitation" element={<UserInvitation user={user} />} />
				<Route path="agent-config" element={<Agent user={user} />} />
				<Route path="model-config" element={<ModelConfig user={user} />} />
				<Route path="tool-config" element={<ToolConfig user={user} />} />
				<Route path="knowledge-config" element={<KnowledgeConfig user={user} />} />
				<Route path="agent-playground" element={<AgentPlayground user={user} />} />
				<Route path="analytics" element={<div>Analytics - Coming Soon</div>} />
				<Route path="databases" element={<div>Databases - Coming Soon</div>} />
				<Route path="custom-connectors" element={<div>Custom Connectors - Coming Soon</div>} />
				<Route path="bpmn" element={<BPMN initialTheme="auto" style={{ width: '100%', minHeight: '70vh', borderRadius: 8, overflow: 'hidden' }} />} />
				<Route path="monitor" element={<div>Monitor - Coming Soon</div>} />
				<Route path="manage" element={<BPMN initialTheme="auto" style={{ width: '100%', minHeight: '70vh', borderRadius: 8, overflow: 'hidden' }} />} />
				<Route path="tenants" element={<div>Tenants - Coming Soon</div>} />
				<Route path="help" element={<div>Help & Support - Coming Soon</div>} />
			</Route>
		</Routes>
	)
}