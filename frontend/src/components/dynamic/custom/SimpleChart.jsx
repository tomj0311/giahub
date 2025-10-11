// Example chart component for custom components
import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

const SimpleChart = ({ data = [], title = "Chart" }) => {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      <Box sx={{ height: 200, display: 'flex', alignItems: 'end', gap: 1 }}>
        {data.map((value, index) => (
          <Box
            key={index}
            sx={{
              width: 30,
              height: `${value}%`,
              bgcolor: 'primary.main',
              borderRadius: 1
            }}
          />
        ))}
      </Box>
    </Paper>
  );
};

export default SimpleChart;