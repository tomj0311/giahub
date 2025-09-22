import React, { useState, useEffect, lazy, Suspense } from 'react';

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
      default: module[iconName] || (() => <span>Icon not found: {iconName}</span>)
    }))
  );

  cachedIcons[iconName] = (props) => (
    <Suspense fallback={<span>Loading...</span>}>
      <Component {...props} />
    </Suspense>
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
      default: module[componentName] || (() => <span>Component not found: {componentName}</span>)
    }))
  );

  cachedComponents[componentName] = (props) => (
    <Suspense fallback={<span>Loading...</span>}>
      <Component {...props} />
    </Suspense>
  );

  return cachedComponents[componentName];
};

// Dynamic MUI Lab component loader
const loadMuiLabComponent = (componentName) => {
  const cacheKey = `lab_${componentName}`;
  if (cachedComponents.hasOwnProperty(cacheKey)) {
    return cachedComponents[cacheKey];
  }

  const Component = lazy(() =>
    import("@mui/lab").then((module) => ({ 
      default: module[componentName] || (() => <span>Lab Component not found: {componentName}</span>)
    })).catch(() => ({ default: () => <span>MUI Lab not installed</span> }))
  );

  cachedComponents[cacheKey] = (props) => (
    <Suspense fallback={<span>Loading...</span>}>
      <Component {...props} />
    </Suspense>
  );

  return cachedComponents[cacheKey];
};

// Export all components for dynamic use
export const MUIComponents = {
  React,
  useState,
  useEffect,
  lazy,
  Suspense,
  // Dynamic loaders
  loadMuiIcon,
  loadMuiComponent,
  loadMuiLabComponent
};