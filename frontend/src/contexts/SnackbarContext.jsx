import React, { createContext, useContext, useState } from 'react';
import { Snackbar, Alert } from '@mui/material';
import { useTheme } from '@mui/material/styles';

const SnackbarContext = createContext();

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
};

export const SnackbarProvider = ({ children }) => {
  const [snackbars, setSnackbars] = useState([]);
  const theme = useTheme();

  const showSnackbar = (message, severity = 'info', duration = 6000) => {
    const id = Date.now() + Math.random();
    setSnackbars(prev => [...prev, { id, message, severity, duration }]);
  };

  const hideSnackbar = (id) => {
    setSnackbars(prev => prev.filter(snackbar => snackbar.id !== id));
  };

  // Convenience methods
  const showSuccess = (message, duration) => showSnackbar(message, 'success', duration);
  const showError = (message, duration) => showSnackbar(message, 'error', duration);
  const showWarning = (message, duration) => showSnackbar(message, 'warning', duration);
  const showInfo = (message, duration) => showSnackbar(message, 'info', duration);

  return (
    <SnackbarContext.Provider
      value={{
        showSnackbar,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        hideSnackbar
      }}
    >
      {children}
      {snackbars.map((snackbar, index) => (
        <Snackbar
          key={snackbar.id}
          open={true}
          autoHideDuration={snackbar.duration}
          onClose={() => hideSnackbar(snackbar.id)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          sx={{
            mt: index * 7, // Stack multiple snackbars
          }}
        >
          <Alert
            onClose={() => hideSnackbar(snackbar.id)}
            severity={snackbar.severity}
            sx={{
              backgroundColor: theme.palette.background.paper,
              color: theme.palette.text.primary,
              '& .MuiAlert-icon': {
                color: theme.palette.text.primary,
              },
              '& .MuiAlert-action': {
                color: theme.palette.text.primary,
              }
            }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      ))}
    </SnackbarContext.Provider>
  );
};
