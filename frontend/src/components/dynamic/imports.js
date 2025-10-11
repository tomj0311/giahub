import React, { useState, useEffect, lazy, Suspense } from 'react';
import * as MUICore from '@mui/material';
import * as MUIIcons from '@mui/icons-material';

// Dynamic component loaders
const cachedIcons = {};
const cachedComponents = {};

// Dynamic icon loader
const loadMuiIcon = (iconName) => {
  if (cachedIcons.hasOwnProperty(iconName)) {
    return cachedIcons[iconName];
  }

  const Component = lazy(() =>
    import("@mui/icons-material").then((module) => ({ 
      default: module[iconName] || (() => React.createElement('span', null, `Icon not found: ${iconName}`))
    }))
  );

  cachedIcons[iconName] = (props) => (
    React.createElement(Suspense, { fallback: React.createElement('span', null, 'Loading...') },
      React.createElement(Component, props)
    )
  );

  return cachedIcons[iconName];
};

// Dynamic MUI component loader
const loadMuiComponent = (componentName) => {
  if (cachedComponents.hasOwnProperty(componentName)) {
    return cachedComponents[componentName];
  }

  const Component = lazy(() =>
    import("@mui/material").then((module) => ({ 
      default: module[componentName] || (() => React.createElement('span', null, `Component not found: ${componentName}`))
    }))
  );

  cachedComponents[componentName] = (props) => (
    React.createElement(Suspense, { fallback: React.createElement('span', null, 'Loading...') },
      React.createElement(Component, props)
    )
  );

  return cachedComponents[componentName];
};

// Export all components for dynamic use
export const MUIComponents = {
  React,
  useState,
  useEffect,
  lazy,
  Suspense,
  // All MUI Core components
  ...MUICore,
  // All MUI Icons
  ...MUIIcons,
  // Dynamic loaders
  loadMuiIcon,
  loadMuiComponent
};