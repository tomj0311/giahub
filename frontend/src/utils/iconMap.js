import {
	LayoutDashboard,
	Store,
	PlayCircle,
	GraduationCap,
	Bot,
	Settings,
	Wrench,
	BookOpen,
	BarChart3,
	Home as HomeIcon,
	Users as PeopleIcon,
	Shield as SecurityIcon,
	UserPlus as PersonAddIcon
} from 'lucide-react'

// Icon mapping for menu items stored in database
export const iconMap = {
	HomeIcon,
	BarChart3,
	Store,
	PlayCircle,
	Settings,
	Bot,
	Wrench,
	BookOpen,
	PeopleIcon,
	SecurityIcon,
	PersonAddIcon,
	LayoutDashboard,
	GraduationCap
}

// Helper function to get icon component by name
export const getIconComponent = (iconName) => {
	return iconMap[iconName] || Settings // fallback to Settings icon
}
