/**
 * admin-api.js - Admin Shoots Data API Service
 * Handles fetching and filtering shoot data from Google Apps Script API
 */

import { getConfig } from './config.js';
import { fetchWithTimeout } from './fetch-util.js';

const ADMIN_API = {
    apiUrl: null,

    /**
     * Initialize API endpoint from config
     */
    async init() {
        if (!this.apiUrl) {
            this.apiUrl = await getConfig('google_admin_data_script_url');
        }
        return this.apiUrl;
    },

    /**
     * Get today's shoots
     * @returns {Promise<array>} array of shoot objects
     */
    async getTodaysShoots() {
        await this.init();
        const today = this._getTodayDateString();
        return this.getShootsByDate(today);
    },

    /**
     * Get tomorrow's shoots
     * @returns {Promise<array>} array of shoot objects
     */
    async getTomorrowShoots() {
        await this.init();
        const tomorrow = this._getTomorrowDateString();
        return this.getShootsByDate(tomorrow);
    },

    /**
     * Get shoots by specific date (ISO format: 2026-02-27)
     * @param {string} dateISO - ISO format date string
     * @returns {Promise<array>} array of shoot objects
     */
    async getShootsByDate(dateISO) {
        try {
            // Use server proxy to avoid CORS issues
            const url = `/api/admin-shoots?action=list&date=${encodeURIComponent(dateISO)}`;
            console.log('📡 Fetching shoots for date:', dateISO);

            const response = await fetchWithTimeout(url, {
                method: 'GET',
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.ok) {
                console.warn('⚠️ API returned error:', data.error);
                return [];
            }

            console.log(`✅ Fetched ${data.count} shoots for ${dateISO}`);
            return data.rows || [];

        } catch (error) {
            console.error('❌ Error fetching shoots:', error);
            return [];
        }
    },

    /**
     * Get shoots for date range
     * @param {string} fromDateISO - ISO format start date
     * @param {string} toDateISO - ISO format end date
     * @returns {Promise<array>} array of shoot objects
     */
    async getShootsByDateRange(fromDateISO, toDateISO) {
        if (!this.apiUrl) await this.init();

        try {
            const url = `${this.apiUrl}?action=list&from_date=${fromDateISO}&to_date=${toDateISO}`;
            console.log('📡 Fetching shoots from', fromDateISO, 'to', toDateISO);

            const response = await fetchWithTimeout(url, {
                method: 'GET',
                timeout: 10000
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.ok) {
                console.warn('⚠️ API returned error:', data.error);
                return [];
            }

            console.log(`✅ Fetched ${data.count} shoots for date range`);
            return data.rows || [];

        } catch (error) {
            console.error('❌ Error fetching shoots:', error);
            return [];
        }
    },

    /**
     * Get live shoots (today's shoots that are currently happening)
     * @returns {Promise<array>} array of currently live shoot objects
     */
    async getLiveShoots() {
        const shoots = await this.getTodaysShoots();
        return shoots.filter(shoot => this._isShootLive(shoot));
    },

    /**
     * Check if a shoot is currently live
     * @param {object} shoot - shoot object with _from_minutes and _to_minutes
     * @returns {boolean}
     */
    _isShootLive(shoot) {
        const now = new Date();
        const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const currentMinutes = istTime.getHours() * 60 + istTime.getMinutes();

        const fromMin = shoot._from_minutes;
        const toMin = shoot._to_minutes;

        if (typeof fromMin !== 'number' || typeof toMin !== 'number') {
            return false;
        }

        return currentMinutes >= fromMin && currentMinutes <= toMin;
    },

    /**
     * Get today's date as ISO string (2026-02-27)
     * @returns {string} ISO date string
     */
    _getTodayDateString() {
        const d = new Date();
        return this._dateToISO(d);
    },

    /**
     * Get tomorrow's date as ISO string
     * @returns {string} ISO date string
     */
    _getTomorrowDateString() {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return this._dateToISO(d);
    },

    /**
     * Convert Date object to ISO string
     * @param {Date} d
     * @returns {string} YYYY-MM-DD format
     */
    _dateToISO(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Format shoot data for display
     * @param {object} shoot
     * @returns {object} formatted shoot
     */
    formatShootForDisplay(shoot) {
        return {
            bookingId: shoot['Booking ID'],
            date: shoot['_date_iso_ist'] || shoot['Date'],
            creator: shoot['Creator'],
            shootName: shoot['Shoot Name'],
            type: shoot['Type'],
            typeValue: shoot['B_IP_Name'],
            noOfShoot: shoot['No Of Shoot'],
            cast: shoot['Cast'],
            dop: shoot['DOP'],
            location: shoot['Location'],
            fromTime: shoot['_from_time_24'] || shoot['From Time'],
            toTime: shoot['_to_time_24'] || shoot['To Time'],
            fromDatetime: shoot['_from_datetime_ist'],
            toDatetime: shoot['_to_datetime_ist'],
            status: shoot['Final Status'],
            isLive: this._isShootLive(shoot),
            raw: shoot
        };
    },

    /**
     * Group shoots by time slot
     * @param {array} shoots
     * @returns {object} shoots grouped by time slot
     */
    groupShootsByTime(shoots) {
        const grouped = {};
        
        shoots.forEach(shoot => {
            const timeSlot = `${shoot['_from_time_24']} - ${shoot['_to_time_24']}`;
            if (!grouped[timeSlot]) {
                grouped[timeSlot] = [];
            }
            grouped[timeSlot].push(shoot);
        });

        return grouped;
    }
};

export { ADMIN_API };
