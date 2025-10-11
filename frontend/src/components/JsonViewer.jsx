import React, { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  ExpandMore,
  ContentCopy,
  Close,
} from '@mui/icons-material';

const JsonViewer = ({ data, title = "JSON Data", onClose }) => {
  const theme = useTheme();
  const [copiedPath, setCopiedPath] = useState(null);

  const copyToClipboard = async (text, path) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const renderValue = (value, key = '', path = '') => {
    const currentPath = path ? `${path}.${key}` : key;

    if (value === null) {
      return <span style={{ color: theme.palette.error.main, fontStyle: 'italic' }}>null</span>;
    }

    if (typeof value === 'boolean') {
      return <span style={{ color: theme.palette.info.main }}>{value.toString()}</span>;
    }

    if (typeof value === 'number') {
      return <span style={{ color: theme.palette.warning.main }}>{value}</span>;
    }

    if (typeof value === 'string') {
      return (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <span style={{ color: theme.palette.success.main }}>"{value}"</span>
          {value.length > 20 && (
            <Tooltip title="Copy value">
              <IconButton
                size="small"
                onClick={() => copyToClipboard(value, currentPath)}
                sx={{ p: 0.25 }}
              >
                <ContentCopy fontSize="inherit" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      );
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span style={{ color: theme.palette.text.disabled }}>[]</span>;
      }

      return (
        <Accordion sx={{ mt: 0.5, boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 'auto', py: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={`Array[${value.length}]`} size="small" variant="outlined" />
              <Typography variant="body2" color="text.secondary">
                {currentPath}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box sx={{ pl: 2 }}>
              {value.map((item, index) => (
                <Box key={index} sx={{ mb: 1 }}>
                  <Typography variant="body2" component="span" sx={{ fontWeight: 'bold', mr: 1 }}>
                    [{index}]:
                  </Typography>
                  {renderValue(item, index, currentPath)}
                </Box>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      );
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return <span style={{ color: theme.palette.text.disabled }}>{"{}"}</span>;
      }

      return (
        <Accordion sx={{ mt: 0.5, boxShadow: 'none' }}>
          <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 'auto', py: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip label={`Object{${keys.length}}`} size="small" variant="outlined" />
              <Typography variant="body2" color="text.secondary">
                {currentPath}
              </Typography>
              <Tooltip title="Copy entire object">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(JSON.stringify(value, null, 2), currentPath);
                  }}
                  sx={{ p: 0.25 }}
                >
                  <ContentCopy fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Box sx={{ pl: 2 }}>
              {keys.map((objKey) => (
                <Box key={objKey} sx={{ mb: 1 }}>
                  <Typography variant="body2" component="span" sx={{ fontWeight: 'bold', mr: 1 }}>
                    {objKey}:
                  </Typography>
                  {renderValue(value[objKey], objKey, currentPath)}
                </Box>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      );
    }

    return <span>{String(value)}</span>;
  };

  if (!data) {
    return null;
  }

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        maxHeight: '400px',
        overflow: 'auto',
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {title}
          <Tooltip title="Copy entire JSON">
            <IconButton
              size="small"
              onClick={() => copyToClipboard(JSON.stringify(data, null, 2), 'root')}
            >
              <ContentCopy fontSize="small" />
            </IconButton>
          </Tooltip>
        </Typography>
        {onClose && (
          <IconButton size="small" onClick={onClose}>
            <Close />
          </IconButton>
        )}
      </Box>

      {copiedPath && (
        <Box sx={{ mb: 2 }}>
          <Chip
            label={`Copied: ${copiedPath}`}
            color="success"
            size="small"
            variant="outlined"
          />
        </Box>
      )}

      <Box sx={{ 
        fontFamily: theme.typography.fontFamily || 'monospace', 
        fontSize: theme.typography.body2.fontSize,
        color: theme.palette.text.primary
      }}>
        {renderValue(data, 'root')}
      </Box>
    </Paper>
  );
};

export default JsonViewer;