import React, { createContext, useContext, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Button,
  Box,
} from '@mui/material';
import { AlertTriangle } from 'lucide-react';

const ConfirmationContext = createContext();

export const useConfirmation = () => {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('useConfirmation must be used within a ConfirmationProvider');
  }
  return context;
};

export const ConfirmationProvider = ({ children }) => {
  const [confirmationState, setConfirmationState] = useState({
    open: false,
    title: '',
    message: '',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    onConfirm: null,
    onCancel: null,
    severity: 'warning', // 'warning' | 'error' | 'info'
  });

  const showConfirmation = ({
    title = 'Confirm Action',
    message = 'Are you sure you want to continue?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    severity = 'warning',
    onConfirm,
    onCancel,
  }) => {
    return new Promise((resolve) => {
      setConfirmationState({
        open: true,
        title,
        message,
        confirmText,
        cancelText,
        severity,
        onConfirm: () => {
          setConfirmationState(prev => ({ ...prev, open: false }));
          if (onConfirm) onConfirm();
          resolve(true);
        },
        onCancel: () => {
          setConfirmationState(prev => ({ ...prev, open: false }));
          if (onCancel) onCancel();
          resolve(false);
        },
      });
    });
  };

  // Convenience method for delete confirmations
  const showDeleteConfirmation = ({
    itemName = 'this item',
    itemType = 'item',
    onConfirm,
    onCancel,
  }) => {
    return showConfirmation({
      title: `Delete ${itemType}`,
      message: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      severity: 'error',
      onConfirm,
      onCancel,
    });
  };

  const hideConfirmation = () => {
    setConfirmationState(prev => ({ ...prev, open: false }));
  };

  const getColorBysSeverity = (severity) => {
    switch (severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'warning';
    }
  };

  return (
    <ConfirmationContext.Provider
      value={{
        showConfirmation,
        showDeleteConfirmation,
        hideConfirmation,
      }}
    >
      {children}
      
      <Dialog
        open={confirmationState.open}
        onClose={confirmationState.onCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertTriangle 
            size={20} 
            color={getColorBysSeverity(confirmationState.severity) === 'error' ? '#f44336' : '#ff9800'} 
          />
          {confirmationState.title}
        </DialogTitle>
        
        <DialogContent>
          <DialogContentText>
            {confirmationState.message}
          </DialogContentText>
        </DialogContent>
        
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={confirmationState.onCancel}
            variant="outlined"
            color="inherit"
          >
            {confirmationState.cancelText}
          </Button>
          <Button
            onClick={confirmationState.onConfirm}
            variant="contained"
            color={getColorBysSeverity(confirmationState.severity)}
            autoFocus
          >
            {confirmationState.confirmText}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmationContext.Provider>
  );
};
