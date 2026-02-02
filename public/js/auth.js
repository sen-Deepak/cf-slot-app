/**
 * auth.js - Authentication management
 */

const AUTH = {
    /**
     * Login with email and password using API
     * @param {string} email
     * @param {string} password
     * @returns {Promise<object|null>} user object if valid, null otherwise
     */
    async login(email, password) {
        try {
            console.log('🔐 AUTH.login() called');
            console.log('   Email:', email);
            
            // Call API to validate credentials
            const result = await AUTH_API.validateLogin(email, password);
            
            console.log('📊 AUTH.login() got result:', result);

            if (result.ok && result.user) {
                // Store session in localStorage (excluding password)
                const sessionUser = {
                    email: result.user.email,
                    name: result.user.name,
                    role: result.user.role
                };
                localStorage.setItem('cf_user', JSON.stringify(sessionUser));
                console.log('✅ User logged in successfully:', sessionUser.email);
                return sessionUser;
            } else {
                console.warn('❌ Login failed - API returned ok:false');
                console.warn('   Message:', result.message);
                return null;
            }
        } catch (error) {
            console.error('❌ Login error:', error);
            return null;
        }
    },

    /**
     * Get current logged-in user
     * @returns {object|null} user object if logged in, null otherwise
     */
    getCurrentUser() {
        const stored = localStorage.getItem('cf_user');
        return stored ? JSON.parse(stored) : null;
    },

    /**
     * Check if user is authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        return this.getCurrentUser() !== null;
    },

    /**
     * Logout and clear session
     */
    logout() {
        localStorage.removeItem('cf_user');
    },

    /**
     * Require authentication - redirect to login if not authenticated
     * Should be called on protected pages
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/public/login.html';
            return false;
        }
        return true;
    }
};

// Auto-check auth on protected pages
if (window.location.pathname.includes('booking.html') || window.location.pathname.includes('slot-check.html')) {
    AUTH.requireAuth();
}
