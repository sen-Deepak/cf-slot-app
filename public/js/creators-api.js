import { fetchWithTimeout } from './fetch-util.js';

/**
 * creators-api.js - API to fetch creators list from Google Apps Script
 */

const CREATORS_API = {
    API_URL: "https://script.google.com/macros/s/AKfycbzqhWzI3KpXNgTn-CkXJobDvFVUBuTo67xek9dtjFjjt1KV3el9Mtn5XR9dCdrZopDRHg/exec",

    /**
     * Fetch list of creators from Google Apps Script
     * @returns {Promise<array>} array of creator names
     */
    async getCreators() {
        try {
            console.log('📥 Fetching creators list...');
            const res = await fetchWithTimeout(this.API_URL);
            if (!res.ok) {
                if (res.error) {
                    throw new Error(res.error);
                }
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            if (!data.ok) {
                throw new Error(data.error || 'Failed to fetch creators list');
            }
            const creators = data.names || [];
            console.log('✅ Creators list loaded:', creators.length, 'creators');
            return creators;
        } catch (error) {
            console.error('❌ Error fetching creators list:', error);
            throw error;
        }
    }
};
