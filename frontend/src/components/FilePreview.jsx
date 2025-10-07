import React, { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';

const FilePreview = ({ file }) => {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    // Simple delay to show loading
    setTimeout(() => {
      try {
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          setContent(url);
        } else if (file.type.startsWith('text/')) {
          const reader = new FileReader();
          reader.onload = (e) => setContent(e.target.result);
          reader.onerror = () => setError('Failed to read file');
          reader.readAsText(file);
        } else {
          setContent('preview-not-available');
        }
        setLoading(false);
      } catch (err) {
        setError('Error loading file');
        setLoading(false);
      }
    }, 500);

    return () => {
      if (content && content.startsWith('blob:')) {
        URL.revokeObjectURL(content);
      }
    };
  }, [file]);

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading file...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* File Info */}
      <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>{file.name}</Typography>
        <Typography variant="body2">Type: {file.type}</Typography>
        <Typography variant="body2">Size: {formatFileSize(file.size)}</Typography>
      </Box>

      {/* Content */}
      {file.type.startsWith('image/') && content ? (
        <Box sx={{ textAlign: 'center' }}>
          <img 
            src={content} 
            alt="Preview" 
            style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }}
          />
        </Box>
      ) : file.type.startsWith('text/') && content ? (
        <Box sx={{ p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: '400px', overflow: 'auto' }}>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' }}>
            {content.length > 5000 ? content.substring(0, 5000) + '...' : content}
          </pre>
        </Box>
      ) : (
        <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="h6">📄 File Ready</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {file.type.includes('wordprocessingml') ? 'Word Document' : 
             file.type.includes('pdf') ? 'PDF Document' : 
             'File will be processed by AI'}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default FilePreview;