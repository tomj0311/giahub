import { api } from '../config/api'

export const menuService = {
  async getMenuItems() {
    try {
      const response = await api('/api/menu-items', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data.success ? data.data : []
    } catch (error) {
      console.error('Error fetching menu items:', error)
      return []
    }
  },

  async createMenuItem(menuItem) {
    try {
      const response = await api('/api/menu-items', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(menuItem),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error creating menu item:', error)
      throw error
    }
  },

  async updateMenuItem(itemId, menuItem) {
    try {
      const response = await api(`/api/menu-items/${itemId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(menuItem),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error updating menu item:', error)
      throw error
    }
  },

  async deleteMenuItem(itemId) {
    try {
      const response = await api(`/api/menu-items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error deleting menu item:', error)
      throw error
    }
  },

  async reorderMenuItems(itemOrders) {
    try {
      const response = await api('/api/menu-items/reorder', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(itemOrders),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error reordering menu items:', error)
      throw error
    }
  },

  async seedMenuItems() {
    try {
      const response = await api('/api/menu-items/seed', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      console.error('Error seeding menu items:', error)
      throw error
    }
  },
}
