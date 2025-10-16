import { apiCall } from '../config/api';

/**
 * Shared API service to prevent duplicate API calls across component instances
 * Provides request deduplication, caching, and singleton pattern for all config components
 */
class SharedApiService {
    constructor() {
        this.activeRequests = new Map();
        this.cache = new Map();
        this.cacheTimestamps = new Map();
        this.CACHE_DURATION = 30000; // 30 seconds cache
    }

    /**
     * Create a unique key for each request
     * @param {string} endpoint - API endpoint
     * @param {object} params - Request parameters
     * @returns {string} Unique request key
     */
    getRequestKey(endpoint, params = {}) {
        return `${endpoint}:${JSON.stringify(params)}`;
    }

    /**
     * Check if cache is still valid
     * @param {string} key - Cache key
     * @returns {boolean} True if cache is valid
     */
    isCacheValid(key) {
        const timestamp = this.cacheTimestamps.get(key);
        return timestamp && (Date.now() - timestamp) < this.CACHE_DURATION;
    }

    /**
     * Deduplicated API call with caching
     * @param {string} endpoint - API endpoint
     * @param {object} options - Fetch options
     * @param {object} params - Request parameters for caching
     * @returns {Promise} API response
     */
    async makeRequest(endpoint, options = {}, params = {}) {
        // Extract bypassCache flag and remove it from params for key generation
        const { bypassCache, ...cacheParams } = params;
        const requestKey = this.getRequestKey(endpoint, cacheParams);
        
        // If bypassCache is true, skip all caching logic
        if (bypassCache) {
            console.log('🚫 Bypassing cache for:', endpoint);
            return this._executeRequest(endpoint, options);
        }
        
        // Return cached result if valid
        if (this.isCacheValid(requestKey)) {
            console.log('📋 Using cached result for:', requestKey);
            return this.cache.get(requestKey);
        }

        // Return existing promise if request is already in flight
        if (this.activeRequests.has(requestKey)) {
            console.log('⏳ Request already in flight, waiting for:', requestKey);
            return this.activeRequests.get(requestKey);
        }

        console.log('🚀 Making new API request:', requestKey);
        
        // Create new request promise
        const requestPromise = this._executeRequest(endpoint, options)
            .then(result => {
                // Cache the result
                this.cache.set(requestKey, result);
                this.cacheTimestamps.set(requestKey, Date.now());
                console.log('💾 Cached result for:', requestKey);
                return result;
            })
            .finally(() => {
                // Remove from active requests
                this.activeRequests.delete(requestKey);
            });

        // Store active request
        this.activeRequests.set(requestKey, requestPromise);
        
        return requestPromise;
    }

    /**
     * Execute the actual API request
     * @param {string} endpoint - API endpoint
     * @param {object} options - Fetch options
     * @returns {Promise} API response with success wrapper
     */
    async _executeRequest(endpoint, options) {
        try {
            const response = await apiCall(endpoint, options);
            
            // apiCall now returns raw Response object (backward compatible)
            if (response.ok) {
                const data = await response.json();
                return { success: true, data };
            } else {
                return { success: false, error: `Request failed with status ${response.status}` };
            }
        } catch (error) {
            console.error('❌ API request error:', error);
            return { success: false, error: error.message || 'Request failed' };
        }
    }

    /**
     * Clear cache for specific patterns (e.g., after create/update/delete)
     * @param {string} pattern - Pattern to match cache keys
     */
    invalidateCache(pattern = '') {
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            if (pattern === '' || key.includes(pattern)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => {
            this.cache.delete(key);
            this.cacheTimestamps.delete(key);
        });
        console.log('🗑️ Invalidated cache for pattern:', pattern, 'Keys:', keysToDelete);
    }

    /**
     * Clear all cache
     */
    clearAllCache() {
        this.cache.clear();
        this.cacheTimestamps.clear();
        this.activeRequests.clear();
        console.log('🧹 Cleared all cache');
    }
}

// Create singleton instance
const sharedApiService = new SharedApiService();

export default sharedApiService;