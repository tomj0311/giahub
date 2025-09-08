import { apiCall } from '../config/api'

export const agentRuntimeService = {

  async runAgentStream(body, token, abortSignal = null) {
    const res = await apiCall(`/api/agent-runtime/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: abortSignal
    })

    return res // Return the Response object for manual stream handling
  },

  async runStream(body, token, onEvent, abortSignal = null) {
    const res = await apiCall(`/api/agent-runtime/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: abortSignal
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
    const res = await apiCall(`/api/agent-runtime/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async uploadKnowledge(collection, files, token) {
    const fd = new FormData()
    fd.append('collection', collection)
    for (const f of files) fd.append('files', f)
    const res = await apiCall(`/api/knowledge/upload?collection=${encodeURIComponent(collection)}`, {
      method: 'POST',
      headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: fd
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async saveConversation(body, token) {
    const res = await apiCall(`/api/agent-runtime/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async listConversations(token, pagination = null) {
    let url = `/api/agent-runtime/conversations`

    // Add pagination parameters if provided
    if (pagination && (pagination.page || pagination.page_size)) {
      const params = new URLSearchParams()
      if (pagination.page) params.append('page', pagination.page.toString())
      if (pagination.page_size) params.append('page_size', pagination.page_size.toString())
      url += `?${params.toString()}`
    }

    console.log('🌐 Making request to:', url)
    console.log('🔑 Using token:', token ? 'Present' : 'Missing')

    try {
      const res = await apiCall(url, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
      console.log('📡 Response status:', res.status, res.statusText)
      console.log('📄 Response headers:', Object.fromEntries(res.headers.entries()))

      let j
      try {
        const responseText = await res.text()
        console.log('📝 Raw response text (first 500 chars):', responseText.substring(0, 500))
        j = JSON.parse(responseText)
        console.log('✅ JSON parsed successfully')
      } catch (parseError) {
        console.error('💥 JSON parse failed:', parseError)
        console.error('💥 Response was not valid JSON')
        j = {}
      }

      if (!res.ok) {
        console.error('❌ Response not OK:', res.status, j.detail || `HTTP ${res.status}`)
        throw new Error(j.detail || `HTTP ${res.status}`)
      }

      console.log('📊 Parsed response structure:', typeof j, Array.isArray(j) ? 'Array' : 'Object')
      console.log('📊 Response keys:', Object.keys(j))

      // Return both conversations and pagination info if available
      if (j.conversations && j.pagination) {
        console.log('✅ Returning paginated response with', j.conversations.length, 'conversations')
        return j // Paginated response
      }

      console.log('⚠️ Falling back to legacy response format')
      return j.conversations || j || [] // Legacy response or fallback
    } catch (error) {
      console.error('💥 listConversations service error:', error)
      throw error
    }
  },
  async getConversation(id, token) {
    const res = await apiCall(`/api/agent-runtime/conversations/${encodeURIComponent(id)}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`)
    return j
  },
  async deleteConversation(id, token) {
    const res = await apiCall(`/api/agent-runtime/conversations/${encodeURIComponent(id)}`, { method: 'DELETE', headers: token ? { 'Authorization': `Bearer ${token}` } : {} })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.detail || `HTTP ${res.status}`)
    }
    return { ok: true }
  }
}
