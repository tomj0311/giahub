const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const agentService = {
  async listAgents(token) {
    const res = await fetch(`${API_BASE_URL}/api/agents`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j.agents || []
  },
  async saveAgent(agent, token) {
    const res = await fetch(`${API_BASE_URL}/api/agents`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }, body: JSON.stringify(agent) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async deleteAgent(name, token) {
    const res = await fetch(`${API_BASE_URL}/api/agents/${encodeURIComponent(name)}`, { method: 'DELETE', headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  }
}
