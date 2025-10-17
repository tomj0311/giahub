import React, { useState, useEffect, lazy, Suspense } from 'react';
import * as MUICore from '@mui/material';
import * as MUIIcons from '@mui/icons-material';

// Import Chart.js components
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

// Import react-chartjs-2 components
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

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
  // Chart.js components
  ChartJS,
  Line,
  Bar,
  Pie,
  Doughnut,
  LineChart: Line,
  BarChart: Bar,
  PieChart: Pie,
  DoughnutChart: Doughnut,
  // Dynamic loaders
  loadMuiIcon,
  loadMuiComponent
};

// Debug: Log that chart components are available
console.log('📊 Chart components loaded:', {
  Line: typeof Line,
  Bar: typeof Bar, 
  Pie: typeof Pie,
  Doughnut: typeof Doughnut,
  PieChart: typeof MUIComponents.PieChart
});