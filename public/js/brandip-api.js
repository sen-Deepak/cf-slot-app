import { fetchWithTimeout } from './fetch-util.js';

/**
 * brandip-api.js - API to fetch Brand and IP lists
 */

const BRANDIP_API = {
    API_URL: "https://script.google.com/macros/s/AKfycbyRe1sOxsZwaV-VGsRV9cOSyvuDK8VADcoT_6BONl1fa4zezH6-eEqnbP1TOrPrhWOK/exec",

    /**
     * Fetch list of Brands or IPs from Google Apps Script
     * @param {string} type - "Brand" or "IP"
     * @returns {Promise<array>} array of brand or IP names
     */
    async getNames(type) {
        try {
            const url = `${this.API_URL}?brandips=${encodeURIComponent(type)}`;
            console.log(`📥 Fetching ${type} list...`);
            const res = await fetchWithTimeout(url);
            if (!res.ok) {
                if (res.error) {
                    throw new Error(res.error);
                }
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            if (!data.ok) {
                throw new Error(data.error || `Failed to fetch ${type} list`);
            }
            console.log(`✅ ${type} list loaded:`, data.names?.length || 0, 'items');
            return data.names || [];
        } catch (error) {
            console.error(`❌ Error fetching ${type} list:`, error);
            throw error;
        }
    }
};
