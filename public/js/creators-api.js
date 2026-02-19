import { fetchWithTimeout } from './fetch-util.js';
import { getConfig } from './config.js';

/**
 * creators-api.js - API to fetch creators list from Google Apps Script
 */

const CREATORS_API = {
    /**
     * Fetch list of creators from Google Apps Script
     * @returns {Promise<array>} array of creator names
     */
    async getCreators() {
        try {
            console.log('📥 Fetching creators list...');
            const apiUrl = await getConfig('google_creators_script_url');
            if (!apiUrl) {
                throw new Error('google_creators_script_url not configured');
            }
            const res = await fetchWithTimeout(apiUrl);
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

export { CREATORS_API };
