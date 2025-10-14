import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Box, Tabs, Tab, Typography, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material'
import ProjectTreeView from './ProjectTreeView'
import ProjectPlanning from './ProjectPlanning'
import ProjectDashboard from './ProjectGantt'
import ProjectStatusHome from './ProjectStatusHome'
import { FolderKanban, ListChecks, BarChart3, Home } from 'lucide-react'

function Projects({ user }) {
  const location = useLocation()
  
  // Check if we should restore tab from location state
  const initialTab = location.state?.tab ?? 3
  const [activeTab, setActiveTab] = useState(initialTab)

  // Update tab when location state changes
  useEffect(() => {
    if (location.state?.tab !== undefined) {
      setActiveTab(location.state.tab)
    }
  }, [location.state?.tab])

  const handleTabChange = (newValue) => {
    setActiveTab(newValue)
  }

  const menuItems = [
    { label: 'Home', icon: <Home size={20} />, index: 3 },
    { label: 'Portfolio', icon: <FolderKanban size={20} />, index: 0 },
    { label: 'Planning', icon: <ListChecks size={20} />, index: 1 },
  ]

  return (
    <Box sx={{ p: 0, height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" fontWeight="bold">
          Projects
        </Typography>
      </Box>

      {/* Two Column Layout */}
      <Box sx={{ display: 'flex', height: 'calc(100vh - 185px)', width: '100%', overflow: 'hidden' }}>
        
        {/* Left Pane - Navigation */}
        <Box sx={{ 
          width: '280px', 
          minWidth: '280px',
          maxWidth: '280px',
          borderRight: '1px solid', 
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
          p: 2,
        }}>
          <Typography variant="h6" gutterBottom sx={{ px: 2, pt: 1 }}>
            Navigation
          </Typography>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.label} disablePadding>
                <ListItemButton
                  selected={activeTab === item.index}
                  onClick={() => handleTabChange(item.index)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    '&.Mui-selected': {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '&:hover': {
                        bgcolor: 'primary.dark',
                      },
                      '& .MuiListItemIcon-root': {
                        color: 'primary.contrastText',
                      },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Right Pane - Main Content */}
        <Box sx={{ 
          flex: 1,
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'auto',
          minWidth: 0
        }}>
          {activeTab === 0 && <ProjectTreeView user={user} />}
          {activeTab === 1 && <ProjectPlanning user={user} />}
          {activeTab === 2 && <ProjectDashboard user={user} />}
          {activeTab === 3 && <ProjectStatusHome user={user} />}
        </Box>
      </Box>
    </Box>
  )
}

export default Projects
