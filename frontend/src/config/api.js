// API Configuration - ONE PATTERN FOR EVERYTHING
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL

export { API_BASE_URL }

// ONE FUNCTION FOR ALL API CALLS
export const api = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`
  const response = await fetch(url, options)
  
  // Check for token timeout/unauthorized access
  if (response.status === 401) {
    // Clear stored auth data
    localStorage.removeItem('token')
    localStorage.removeItem('name')
    // Redirect to login page
    window.location.href = '/login'
    throw new Error('Token expired - redirecting to login')
  }
  
  return response
}

// Backward compatibility
export const apiCall = api
