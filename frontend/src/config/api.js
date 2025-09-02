// API Configuration - ONE PATTERN FOR EVERYTHING
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000'

export { API_BASE_URL }

// ONE FUNCTION FOR ALL API CALLS
export const api = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`
  return await fetch(url, options)
}

// Backward compatibility
export const apiCall = api
