// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL

export { API_BASE_URL }

/**
 * BACKWARD COMPATIBLE API FUNCTION
 * Returns the raw Response object to support both old and new patterns:
 * - Old pattern: response.ok, response.json(), response.status
 * - New pattern: can also parse and use directly
 */
export const api = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`
  
  // Add default headers
  const defaultHeaders = {
    'Content-Type': 'application/json',
  }
  
  // Add auth token if available
  const token = localStorage.getItem('token')
  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`
  }
  
  // Merge headers
  const finalOptions = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {})
    }
  }
  
  const response = await fetch(url, finalOptions)
  
  // Check for token timeout/unauthorized access
  if (response.status === 401) {
    // Clear stored auth data
    localStorage.removeItem('token')
    localStorage.removeItem('name')
    // Redirect to login page
    window.location.href = '/login'
  }
  
  // RETURN RAW RESPONSE for backward compatibility
  // This allows code to use response.ok, response.json(), response.status
  return response
}

// Backward compatibility alias
export const apiCall = api
