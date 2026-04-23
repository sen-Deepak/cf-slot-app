/**
 * nav.js - Navigation and page visibility management
 * Handles role-based page visibility
 */

const NAV = {
    /**
     * Page configuration based on user role
     * Admin pages: Today's Shoots, Tomorrow Shoots, Live, Employees
     * Creator/DOP pages: Slot Booking, Pre/Post, Live, Slot Check, My Day, Attendance
     * Other pages: Slot Booking, Pre/Post, Live, Slot Check, My Day, Attendance
     */
    pages: {
        admin: [
            { name: 'Today Shoots', url: '/todays-shoots.html' },
            { name: 'Tomorrow Shoots', url: '/tomorrow-shoots.html' },
            { name: 'Live', url: '/live.html' },
            { name: 'Employees', url: '/employees.html' },
            { name: 'Slot Booking', url: '/booking.html' }
        ],
        Admin: [
            { name: 'Today Shoots', url: '/todays-shoots.html' },
            { name: 'Tomorrow Shoots', url: '/tomorrow-shoots.html' },
            { name: 'Live', url: '/live.html' },
            { name: 'Employees', url: '/employees.html' },
            { name: 'Slot Booking', url: '/booking.html' }
        ],
        creator: [
            { name: 'Slot Booking', url: '/booking.html' },
            { name: 'Pre/Post', url: '/prepost.html' },
            { name: 'Live', url: '/live.html' },
            { name: 'Slot Check', url: '/slot-check.html' },
            { name: 'My Day', url: '/my-day.html' },
            { name: 'Attendance', url: '/attendance.html' }
        ],
        Creator: [
            { name: 'Slot Booking', url: '/booking.html' },
            { name: 'Pre/Post', url: '/prepost.html' },
            { name: 'Live', url: '/live.html' },
            { name: 'Slot Check', url: '/slot-check.html' },
            { name: 'My Day', url: '/my-day.html' },
            { name: 'Attendance', url: '/attendance.html' }
        ],
        dop: [
            { name: 'Slot Booking', url: '/booking.html' },
            { name: 'Pre/Post', url: '/prepost.html' },
            { name: 'Live', url: '/live.html' },
            { name: 'Slot Check', url: '/slot-check.html' },
            { name: 'My Day', url: '/my-day.html' },
            { name: 'Attendance', url: '/attendance.html' }
        ],
        DOP: [
            { name: 'Slot Booking', url: '/booking.html' },
            { name: 'Pre/Post', url: '/prepost.html' },
            { name: 'Live', url: '/live.html' },
            { name: 'Slot Check', url: '/slot-check.html' },
            { name: 'My Day', url: '/my-day.html' },
            { name: 'Attendance', url: '/attendance.html' }
        ],
        nonAdmin: [
            { name: 'Slot Booking', url: '/booking.html' },
            { name: 'Pre/Post', url: '/prepost.html' },
            { name: 'Live', url: '/live.html' },
            { name: 'Slot Check', url: '/slot-check.html' },
            { name: 'My Day', url: '/my-day.html' },
            { name: 'Attendance', url: '/attendance.html' }
        ]
    },

    /**
     * Get pages visible for current user
     * @returns {array} array of page objects {name, url}
     */
    getVisiblePages() {
        const user = this.getCurrentUser();
        if (!user) return [];
        
        const role = user.role;
        console.log('🔍 NAV.getVisiblePages() - User role:', role, 'Type:', typeof role);
        console.log('🔍 Available role configs:', Object.keys(this.pages));
        
        // Try exact match first
        if (this.pages[role]) {
            console.log('✅ Found pages for role:', role);
            return this.pages[role];
        }
        
        // Try lowercase match
        const lowerRole = role?.toLowerCase();
        if (this.pages[lowerRole]) {
            console.log('✅ Found pages for role (lowercase):', lowerRole);
            return this.pages[lowerRole];
        }
        
        console.log('⚠️ No pages found for role, using nonAdmin as fallback');
        return this.pages.nonAdmin;
    },

    /**
     * Get current user from localStorage
     * @returns {object|null}
     */
    getCurrentUser() {
        const stored = localStorage.getItem('cf_user');
        return stored ? JSON.parse(stored) : null;
    },

    /**
     * Render navigation tabs based on user role
     * Should be called after page loads
     */
    renderNavigation() {
        const tabsContainer = document.querySelector('.tabs');
        if (!tabsContainer) return;

        const visiblePages = this.getVisiblePages();
        const currentUrl = window.location.pathname;

        // Clear existing tabs except those we want to keep static
        tabsContainer.innerHTML = '';

        // Create tabs for visible pages
        visiblePages.forEach(page => {
            const tab = document.createElement('a');
            tab.href = page.url;
            tab.className = 'tab';
            tab.textContent = page.name;

            // Mark current tab as active
            if (currentUrl.includes(page.url.replace('/', ''))) {
                tab.classList.add('tab-active');
            }

            tabsContainer.appendChild(tab);
        });
    },

    /**
     * Check if current page is accessible for user's role
     * @returns {boolean}
     */
    isCurrentPageAccessible() {
        const user = this.getCurrentUser();
        if (!user) return false;

        const currentUrl = window.location.pathname;
        const visiblePages = this.getVisiblePages();

        return visiblePages.some(page => currentUrl.includes(page.url.replace('/', '')));
    }
};

// Auto-render navigation when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    NAV.renderNavigation();
});

export { NAV };
