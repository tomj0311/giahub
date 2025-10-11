/**
 * Analytics service for fetching analytics data from the backend
 */
import { apiCall } from '../config/api'

class AnalyticsService {
  /**
   * Get overview analytics metrics
   */
  static async getOverviewMetrics(tenantId = null) {
    const params = new URLSearchParams()
    if (tenantId) params.append('tenant_id', tenantId)
    
    const response = await apiCall(`/api/analytics/overview?${params.toString()}`)
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.detail || `HTTP ${response.status}`)
    return json.data
  }

  /**
   * Get daily statistics for the last N days
   */
  static async getDailyStats(days = 7, tenantId = null) {
    const params = new URLSearchParams()
    params.append('days', days.toString())
    if (tenantId) params.append('tenant_id', tenantId)
    
    const response = await apiCall(`/api/analytics/daily-stats?${params.toString()}`)
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.detail || `HTTP ${response.status}`)
    return json.data
  }

  /**
   * Get agent performance metrics
   */
  static async getAgentPerformance(limit = 10, tenantId = null) {
    const params = new URLSearchParams()
    params.append('limit', limit.toString())
    if (tenantId) params.append('tenant_id', tenantId)
    
    const response = await apiCall(`/api/analytics/agent-performance?${params.toString()}`)
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.detail || `HTTP ${response.status}`)
    return json.data
  }

  /**
   * Get recent conversations
   */
  static async getRecentConversations(limit = 10, tenantId = null) {
    const params = new URLSearchParams()
    params.append('limit', limit.toString())
    if (tenantId) params.append('tenant_id', tenantId)
    
    const response = await apiCall(`/api/analytics/recent-conversations?${params.toString()}`)
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json.detail || `HTTP ${response.status}`)
    return json.data
  }
}

export default AnalyticsService