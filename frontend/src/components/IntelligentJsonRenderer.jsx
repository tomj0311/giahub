import React, { useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Collapse,
  IconButton,
  alpha,
  useTheme,
  Chip
} from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';

/**
 * Intelligent JSON Renderer Component
 * Analyzes JSON structure and renders hierarchically with tables
 * - Arrays of objects -> Tables with expandable nested content
 * - Nested objects -> Collapsible sections with sub-tables
 * - Primitive values -> Display as is
 */

const IntelligentJsonRenderer = ({ data, depth = 0, keyName = null }) => {
  const theme = useTheme();
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Convert string to proper case (Title Case)
  const toProperCase = (str) => {
    if (!str) return str;
    // Handle snake_case and camelCase
    return str
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Toggle row expansion
  const toggleRow = (rowKey) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowKey)) {
        newSet.delete(rowKey);
      } else {
        newSet.add(rowKey);
      }
      return newSet;
    });
  };

  // Check if value is a primitive
  const isPrimitive = (value) => {
    return value === null || 
           value === undefined || 
           typeof value === 'string' || 
           typeof value === 'number' || 
           typeof value === 'boolean';
  };

  // Check if value is an array of objects
  const isArrayOfObjects = (value) => {
    return Array.isArray(value) && 
           value.length > 0 && 
           value.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));
  };

  // Check if value is an object (not array)
  const isObject = (value) => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  };

  // Get all unique keys from array of objects
  const getTableColumns = (arr) => {
    const allKeys = new Set();
    arr.forEach(obj => {
      Object.keys(obj).forEach(key => allKeys.add(key));
    });
    // Filter out columns starting with '_id', 'id', or ending with 'id'
    return Array.from(allKeys).filter(key => {
      const lowerKey = key.toLowerCase();
      return !(lowerKey === 'id' || lowerKey.startsWith('_id') || lowerKey.endsWith('id'));
    });
  };

  // Render primitive value
  const renderPrimitive = (value) => {
    if (value === null) return <em style={{ color: theme.palette.text.disabled }}>null</em>;
    if (value === undefined) return <em style={{ color: theme.palette.text.disabled }}>undefined</em>;
    if (typeof value === 'boolean') {
      return (
        <Chip 
          label={String(value)} 
          size="small" 
          color={value ? 'success' : 'default'}
          sx={{ height: 20, fontSize: '0.7rem' }}
        />
      );
    }
    if (typeof value === 'number') {
      return <Typography component="span" sx={{ color: theme.palette.info.main, fontWeight: 500 }}>{value}</Typography>;
    }
    return (
      <Typography 
        component="span" 
        sx={{ 
          wordBreak: 'break-word',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          lineHeight: 1.4
        }}
      >
        {String(value)}
      </Typography>
    );
  };

  // Check if a row has any nested children
  const hasNestedData = (row, columns) => {
    return columns.some(col => {
      const value = row[col];
      return !isPrimitive(value) && (isArrayOfObjects(value) || isObject(value) || Array.isArray(value));
    });
  };

  // Render cell content with nested data handling
  const renderCellContent = (value, rowIndex, colKey) => {
    const uniqueKey = `${rowIndex}-${colKey}`;
    
    if (isPrimitive(value)) {
      return renderPrimitive(value);
    }

    const hasNested = isArrayOfObjects(value) || isObject(value) || Array.isArray(value);
    
    if (!hasNested) {
      return <pre style={{ margin: 0, fontSize: '0.75rem' }}>{JSON.stringify(value, null, 2)}</pre>;
    }

    return (
      <Box>
        <IconButton
          size="small"
          onClick={() => toggleRow(uniqueKey)}
          sx={{ p: 0.5 }}
        >
          {expandedRows.has(uniqueKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Typography variant="caption" sx={{ ml: 0.5, fontStyle: 'italic', color: theme.palette.primary.main }}>
            {Array.isArray(value) ? `[${value.length} items]` : '{object}'}
          </Typography>
        </IconButton>
      </Box>
    );
  };

  // Render nested content below a row
  const renderNestedContent = (value, rowIndex, colKey) => {
    return (
      <Box sx={{ 
        pl: 4, 
        pt: 2, 
        pb: 2,
        borderLeft: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
        borderBottom: `1px solid ${theme.palette.divider}`,
        ml: 2,
        mb: 2
      }}>
        <Typography variant="caption" sx={{ fontWeight: 'bold', color: theme.palette.text.secondary, mb: 1, display: 'block' }}>
          {toProperCase(colKey)}
        </Typography>
        <IntelligentJsonRenderer data={value} depth={depth + 1} keyName={null} />
      </Box>
    );
  };

  // Main rendering logic based on data type
  
  // Handle null/undefined
  if (data === null || data === undefined) {
    return renderPrimitive(data);
  }

  // Handle primitives
  if (isPrimitive(data)) {
    return (
      <Box sx={{ p: 1 }}>
        {renderPrimitive(data)}
      </Box>
    );
  }

  // Handle array of objects - render as table
  if (isArrayOfObjects(data)) {
    const columns = getTableColumns(data);
    
    return (
      <Box sx={{ width: '100%' }}>
        {keyName && depth > 0 && (
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: theme.palette.primary.main }}>
            {toProperCase(keyName)}
          </Typography>
        )}
        <TableContainer 
          component={Paper} 
          sx={{ 
            mb: 2,
            maxWidth: '100%',
            maxHeight: '500px',
            overflowX: 'auto',
            overflowY: 'auto',
            border: `1px solid ${theme.palette.divider}`,
            // Make scrollbar always visible and prominent
            '&::-webkit-scrollbar': {
              height: '12px',
              width: '12px'
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: alpha(theme.palette.grey[300], 0.3)
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: alpha(theme.palette.grey[500], 0.5),
              borderRadius: '6px',
              '&:hover': {
                backgroundColor: alpha(theme.palette.grey[600], 0.7)
              }
            }
          }}
        >
          <Table size="small" sx={{ minWidth: 300 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', py: 1, width: 40, px: 1 }}></TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', py: 1, minWidth: 60 }}>Row</TableCell>
                {columns.map((col) => (
                  <TableCell 
                    key={col} 
                    sx={{ 
                      fontWeight: 'bold', 
                      fontSize: '0.75rem', 
                      py: 1,
                      minWidth: 120,
                      maxWidth: 300
                    }}
                  >
                    {toProperCase(col)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, rowIndex) => {
                // Check if this row has any nested data
                const nestedColumns = columns.filter(col => {
                  const value = row[col];
                  return !isPrimitive(value) && (isArrayOfObjects(value) || isObject(value) || Array.isArray(value));
                });
                const rowHasNested = nestedColumns.length > 0;
                const rowKey = `row-${rowIndex}`;

                return (
                  <React.Fragment key={rowIndex}>
                    <TableRow>
                      <TableCell sx={{ fontSize: '0.75rem', py: 1, width: 40, px: 1 }}>
                        {rowHasNested && (
                          <IconButton
                            size="small"
                            onClick={() => toggleRow(rowKey)}
                            sx={{ p: 0.5 }}
                          >
                            {expandedRows.has(rowKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', py: 1, fontWeight: 500, minWidth: 60 }}>
                        {rowIndex + 1}
                      </TableCell>
                      {columns.map((col) => (
                        <TableCell 
                          key={col} 
                          sx={{ 
                            fontSize: '0.75rem', 
                            py: 1, 
                            minWidth: 120,
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {renderCellContent(row[col], rowIndex, col)}
                        </TableCell>
                      ))}
                    </TableRow>
                    
                    {/* Render nested content for columns with complex data */}
                    {rowHasNested && expandedRows.has(rowKey) && (
                      <TableRow>
                        <TableCell colSpan={columns.length + 2} sx={{ py: 0, px: 0, border: 'none' }}>
                          {nestedColumns.map((col) => (
                            <Box key={`${rowIndex}-${col}`}>
                              {renderNestedContent(row[col], rowIndex, col)}
                            </Box>
                          ))}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  }

  // Handle plain array (not objects)
  if (Array.isArray(data)) {
    return (
      <Box sx={{ width: '100%' }}>
        {keyName && depth > 0 && (
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: theme.palette.primary.main }}>
            {toProperCase(keyName)}
          </Typography>
        )}
        <TableContainer 
          component={Paper} 
          sx={{ 
            mb: 2,
            maxWidth: '100%',
            maxHeight: '500px',
            overflowX: 'auto',
            overflowY: 'auto',
            border: `1px solid ${theme.palette.divider}`,
            // Make scrollbar always visible and prominent
            '&::-webkit-scrollbar': {
              height: '12px',
              width: '12px'
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: alpha(theme.palette.grey[300], 0.3)
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: alpha(theme.palette.grey[500], 0.5),
              borderRadius: '6px',
              '&:hover': {
                backgroundColor: alpha(theme.palette.grey[600], 0.7)
              }
            }
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', py: 1, width: 40, px: 1 }}></TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', py: 1, minWidth: 60 }}>Index</TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', py: 1, minWidth: 200 }}>Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((item, index) => {
                const hasNested = !isPrimitive(item);
                const rowKey = `array-${index}`;
                
                return (
                  <React.Fragment key={index}>
                    <TableRow>
                      <TableCell sx={{ fontSize: '0.75rem', py: 1, width: 40, px: 1 }}>
                        {hasNested && (
                          <IconButton
                            size="small"
                            onClick={() => toggleRow(rowKey)}
                            sx={{ p: 0.5 }}
                          >
                            {expandedRows.has(rowKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', py: 1, fontWeight: 500, minWidth: 60 }}>{index}</TableCell>
                      <TableCell 
                        sx={{ 
                          fontSize: '0.75rem', 
                          py: 1,
                          minWidth: 200,
                          maxWidth: 400,
                          overflow: 'hidden'
                        }}
                      >
                        {isPrimitive(item) ? renderPrimitive(item) : (
                          <Typography variant="caption" sx={{ fontStyle: 'italic', color: theme.palette.primary.main }}>
                            {Array.isArray(item) ? `[${item.length} items]` : '{object}'}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                    {hasNested && expandedRows.has(rowKey) && (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ py: 0, px: 0, border: 'none' }}>
                          {renderNestedContent(item, index, 'value')}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  }

  // Handle plain object - render as key-value table
  if (isObject(data)) {
    const entries = Object.entries(data);
    
    return (
      <Box sx={{ width: '100%' }}>
        {keyName && depth > 0 && (
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: theme.palette.primary.main }}>
            {toProperCase(keyName)}
          </Typography>
        )}
        <TableContainer 
          component={Paper} 
          sx={{ 
            mb: 2,
            maxWidth: '100%',
            maxHeight: '500px',
            overflowX: 'auto',
            overflowY: 'auto',
            border: `1px solid ${theme.palette.divider}`,
            // Make scrollbar always visible and prominent
            '&::-webkit-scrollbar': {
              height: '12px',
              width: '12px'
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: alpha(theme.palette.grey[300], 0.3)
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: alpha(theme.palette.grey[500], 0.5),
              borderRadius: '6px',
              '&:hover': {
                backgroundColor: alpha(theme.palette.grey[600], 0.7)
              }
            }
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', py: 1, width: 40, px: 1 }}></TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', py: 1, minWidth: 120, width: '30%' }}>Key</TableCell>
                <TableCell sx={{ fontWeight: 'bold', fontSize: '0.75rem', py: 1, minWidth: 200 }}>Value</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map(([key, value], index) => {
                const hasNested = !isPrimitive(value);
                const rowKey = `obj-${key}-${index}`;
                
                return (
                  <React.Fragment key={key}>
                    <TableRow>
                      <TableCell sx={{ fontSize: '0.75rem', py: 1, width: 40, px: 1 }}>
                        {hasNested && (
                          <IconButton
                            size="small"
                            onClick={() => toggleRow(rowKey)}
                            sx={{ p: 0.5 }}
                          >
                            {expandedRows.has(rowKey) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          fontSize: '0.75rem', 
                          py: 1, 
                          fontWeight: 500, 
                          verticalAlign: 'top',
                          minWidth: 120,
                          width: '30%',
                          wordBreak: 'break-word'
                        }}
                      >
                        {toProperCase(key)}
                      </TableCell>
                      <TableCell 
                        sx={{ 
                          fontSize: '0.75rem', 
                          py: 1,
                          minWidth: 200,
                          maxWidth: 400,
                          overflow: 'hidden'
                        }}
                      >
                        {isPrimitive(value) ? renderPrimitive(value) : (
                          <Typography variant="caption" sx={{ fontStyle: 'italic', color: theme.palette.primary.main }}>
                            {Array.isArray(value) ? `[${value.length} items]` : '{object}'}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                    {hasNested && expandedRows.has(rowKey) && (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ py: 0, px: 0, border: 'none' }}>
                          {renderNestedContent(value, index, key)}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  }

  // Fallback for unknown types
  return (
    <Paper sx={{ p: 2, fontFamily: 'monospace', fontSize: '0.75rem', overflow: 'auto' }}>
      <pre style={{ margin: 0 }}>{JSON.stringify(data, null, 2)}</pre>
    </Paper>
  );
};

export default IntelligentJsonRenderer;
