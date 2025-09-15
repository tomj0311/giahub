import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  useTheme,
  alpha
} from '@mui/material';
import {
  ArrowLeft
} from 'lucide-react';

console.log('🚨🚨🚨 WORKFLOW EXECUTION MODULE LOADED 🚨🚨🚨');

function WorkflowExecution({ user }) {
  console.log('🚨🚨🚨 WORKFLOW EXECUTION COMPONENT RENDERING 🚨🚨🚨');
  console.log('🚨 USER PROP:', user);
  console.log('🚨 LOCATION:', window.location.href);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workflowId = searchParams.get('workflow');
  const theme = useTheme();
  
  console.log('🚨 WORKFLOW ID FROM URL:', workflowId);
  
  return (
    <Box sx={{ 
      p: 3,
      background: theme.custom?.backgroundGradient || theme.palette.background.default,
      minHeight: '100vh'
    }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={() => navigate('/dashboard/monitor')}>
            <ArrowLeft />
          </IconButton>
          <Typography variant="h4" fontWeight="bold">
            🚨 WORKFLOW EXECUTION WORKS! 🚨
          </Typography>
        </Box>
      </Box>

      <Box sx={{ 
        p: 4, 
        textAlign: 'center',
        background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        borderRadius: 3
      }}>
        <Typography variant="h3" color="primary" gutterBottom>
          ✅ COMPONENT IS LOADING!
        </Typography>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          WorkflowExecution component is working fine
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Workflow ID from URL: <strong>{workflowId || 'NOT PROVIDED'}</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          User token: {user?.token ? '✅ PRESENT' : '❌ MISSING'}
        </Typography>
        
        <Button
          variant="contained"
          size="large"
          startIcon={<ArrowLeft />}
          onClick={() => navigate('/dashboard/monitor')}
          sx={{ mt: 3 }}
        >
          Back to Monitor Dashboard
        </Button>
      </Box>
    </Box>
  );
}

export default WorkflowExecution;
