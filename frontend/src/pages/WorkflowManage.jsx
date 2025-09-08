import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import BPMN from '../components/bpmn/BPMN';

/**
 * Workflow Management Page
 * 
 * This page provides a full-screen BPMN editor for managing workflows.
 */
function WorkflowManage() {
  return (
    <Box sx={{ 
      height: '100vh', 
      width: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: 1, 
        borderColor: 'divider',
        flexShrink: 0
      }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Workflow Management
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Design and manage your business process workflows using the BPMN editor
        </Typography>
      </Box>

      {/* BPMN Editor Container */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'hidden',
        position: 'relative'
      }}>
        <BPMN 
          initialTheme="auto"
          style={{ 
            height: '100%', 
            width: '100%' 
          }}
        />
      </Box>
    </Box>
  );
}

export default WorkflowManage;
