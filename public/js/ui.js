/**
 * ui.js - UI utility functions
 */

const UI = {
    /**
     * Show a toast/status message
     * @param {string} message
     * @param {string} type - 'success', 'error', 'info', 'warning'
     * @param {number} duration - milliseconds to show (0 = persistent)
     */
    showToast(message, type = 'info', duration = 3000) {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        // Style the toast
        toast.style.cssText = `
            position: fixed;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            max-width: 400px;
            padding: 1rem 1.5rem;
            background-color: ${this._getToastColor(type)};
            color: white;
            border-radius: 0.5rem;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            z-index: 9999;
            animation: slideInDown 0.3s ease-out;
            word-wrap: break-word;
        `;
        
        document.body.appendChild(toast);
        
        if (duration > 0) {
            setTimeout(() => {
                toast.style.animation = 'slideOutUp 0.3s ease-out';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    },

    /**
     * Get toast color based on type
     * @private
     */
    _getToastColor(type) {
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            info: '#6366f1',
            warning: '#f59e0b'
        };
        return colors[type] || colors.info;
    },

    /**
     * Set loading state on an element
     * @param {HTMLElement} element
     * @param {boolean} isLoading
     */
    setLoading(element, isLoading) {
        if (isLoading) {
            element.classList.remove('hidden');
            element.classList.add('show');
        } else {
            element.classList.add('hidden');
            element.classList.remove('show');
        }
    },

    /**
     * Show/hide error message
     * @param {HTMLElement} element
     * @param {string} message - empty string to hide
     */
    showError(element, message) {
        if (message) {
            element.textContent = message;
            element.classList.add('show');
        } else {
            element.textContent = '';
            element.classList.remove('show');
        }
    },

    /**
     * Format time from HH:MM to h:mm am/pm
     * @param {string} time - format "HH:MM" (24-hour)
     * @returns {string} format "h:mm am/pm"
     */
    formatTimeToAmPm(time) {
        if (!time) return '';
        
        const [hours, minutes] = time.split(':').map(Number);
        const period = hours >= 12 ? 'pm' : 'am';
        const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        
        return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
    },

    /**
     * Generate date key for given offset from today
     * Timezone: Asia/Kolkata
     * @param {number} offset - 0=today, 1=tomorrow, 2=day after tomorrow
     * @returns {string} format "YYYY-MM-DD"
     */
    dateKeyForOffset(offset) {
        const date = new Date();
        
        // Convert to Asia/Kolkata timezone
        const options = { 
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        };
        const formatter = new Intl.DateTimeFormat('en-CA', options);
        
        // Add offset
        const localDate = new Date(date);
        localDate.setDate(localDate.getDate() + offset);
        
        return formatter.format(localDate);
    },

    /**
     * Get human-readable date label
     * @param {number} offset - 0=today, 1=tomorrow, 2=day after tomorrow
     * @returns {string}
     */
    getDateLabel(offset) {
        const labels = ['Today', 'Tomorrow', 'Day After Tomorrow'];
        return labels[offset] || '';
    },

    /**
     * Format date key to readable format
     * @param {string} dateKey - format "YYYY-MM-DD"
     * @returns {string}
     */
    formatDateKey(dateKey) {
        if (!dateKey) return '';
        const date = new Date(dateKey);
        return date.toLocaleDateString('en-US', { 
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Format date key as "dd Mmm yy" (e.g. 30 Jan 26)
     * @param {string} dateKey - format "YYYY-MM-DD"
     * @returns {string}
     */
    formatDateKeyShort(dateKey) {
        if (!dateKey) return '';
        const date = new Date(dateKey);
        const day = date.getDate();
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const year = String(date.getFullYear()).slice(-2);
        return `${day} ${month} ${year}`;
    },

    /**
     * Calculate duration in minutes between two times
     * @param {string} fromTime - format "HH:MM"
     * @param {string} toTime - format "HH:MM"
     * @returns {number} duration in minutes
     */
    getTimeDuration(fromTime, toTime) {
        if (!fromTime || !toTime) return 0;
        
        const [fh, fm] = fromTime.split(':').map(Number);
        const [th, tm] = toTime.split(':').map(Number);
        
        const fromMinutes = fh * 60 + fm;
        const toMinutes = th * 60 + tm;
        
        return toMinutes - fromMinutes;
    },

    /**
     * Validate time selection
     * @param {string} fromTime
     * @param {string} toTime
     * @returns {object} { valid: boolean, error: string }
     */
    validateTimeSelection(fromTime, toTime) {
        if (!fromTime || !toTime) {
            return { valid: false, error: 'Select both from and to time' };
        }

        const duration = this.getTimeDuration(fromTime, toTime);

        if (duration < 30) {
            return { valid: false, error: 'Duration must be at least 30 minutes' };
        }

        if (duration > 30 * 60) { // 30 hours in minutes
            return { valid: false, error: 'Duration cannot exceed 30 hours' };
        }

        return { valid: true, error: '' };
    }
};

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInDown {
        from {
            transform: translateX(-50%) translateY(-20px);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }

    @keyframes slideOutUp {
        from {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        to {
            transform: translateX(-50%) translateY(-20px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

export { UI };
