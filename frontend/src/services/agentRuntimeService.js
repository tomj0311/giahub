const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const agentRuntimeService = {
  async runStream(body, token, onEvent) {
    const res = await fetch(`${API_BASE_URL}/api/agent-runtime/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    })
    
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.detail || `HTTP ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data.trim()) {
              try {
                const event = JSON.parse(data)
                onEvent(event)
              } catch (e) {
                console.warn('Failed to parse SSE data:', data)
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  },
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
