import { apiCall } from '../config/api'

export const agentService = {
  async listAgents(token) {
    const res = await apiCall(`/api/agents`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j.agents || []
  },
  async saveAgent(agent, token) {
    const res = await apiCall(`/api/agents`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }, body: JSON.stringify(agent) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async deleteAgent(name, token) {
    const res = await apiCall(`/api/agents/${encodeURIComponent(name)}`, { method: 'DELETE', headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async getAgent(name, token) {
    const res = await apiCall(`/api/agents/${encodeURIComponent(name)}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  }
}
