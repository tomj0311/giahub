const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const agentRuntimeService = {
  async run(body, token) {
    const res = await fetch(`${API_BASE_URL}/api/agent-runtime/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async uploadKnowledge(prefix, files, token) {
    const fd = new FormData()
    fd.append('prefix', prefix)
    for (const f of files) fd.append('files', f)
    const res = await fetch(`${API_BASE_URL}/api/knowledge/upload?prefix=${encodeURIComponent(prefix)}`, {
      method: 'POST',
      headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: fd
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async saveConversation(body, token) {
    const res = await fetch(`${API_BASE_URL}/api/agent-runtime/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async listConversations(token) {
    const res = await fetch(`${API_BASE_URL}/api/agent-runtime/conversations`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j.conversations || []
  },
  async getConversation(id, token) {
    const res = await fetch(`${API_BASE_URL}/api/agent-runtime/conversations/${encodeURIComponent(id)}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async deleteConversation(id, token) {
    const res = await fetch(`${API_BASE_URL}/api/agent-runtime/conversations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.detail || `HTTP ${res.status}`)
    }
    return { ok: true }
  }
}
