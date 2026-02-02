import { fetchWithTimeout } from './fetch-util.js';

/**
 * api.js - API communication with backend
 */

const API = {
    /**
     * POST to /api/n8n endpoint
     * @param {object} payload - request body
     * @returns {Promise<object>} response data
     * @throws {Error} on network or response error
     */
    async postToN8n(payload) {
        try {
            const response = await fetchWithTimeout('/api/n8n', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            // If response is our error object from fetchWithTimeout
            if (!response.ok) {
                if (response.error) {
                    throw new Error(response.error);
                }
                throw new Error(`HTTP ${response.status}`);
            }

            let data = {};
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch {
                    data = { message: 'Invalid response format' };
                }
            } else {
                const text = await response.text();
                data = { message: text };
            }

            // Check HTTP status
            if (!response.ok) {
                throw new Error(data.message || `HTTP ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }
};

export default API;
