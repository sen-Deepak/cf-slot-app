import { fetchWithTimeout } from './fetch-util.js';

/**
 * auth-api.js - Authentication API (calls backend which calls Google Apps Script)
 * Password is sent plain text over HTTPS and hashed on the server
 */

const AUTH_API = {
    API_URL: "/api/login",  // Backend endpoint (no CORS issues)

    /**
     * Validate user credentials via backend
     * @param {string} email - User email
     * @param {string} password - User password (sent plain over HTTPS, hashed on server)
     * @returns {Promise<object>} - { ok: boolean, user: object, message: string }
     */
    async validateLogin(email, password) {
        try {
            const emailNormalized = email.trim().toLowerCase();
            console.log('🔐 Authenticating with backend...');
            console.log('   Email:', emailNormalized);
            console.log('   Backend URL:', this.API_URL);

            const payload = {
                email: emailNormalized,
                password: password  // Send plain password - will be hashed on server
            };
            console.log('   Sending payload to backend (password will be hashed server-side)');

            const response = await fetchWithTimeout(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            console.log(`   Response Status: ${response.status}`);
            console.log(`   Response Data:`, data);

            if (!response.ok) {
                // If response is our error object from fetchWithTimeout
                if (response.error) {
                    throw new Error(response.error);
                }
                throw new Error(data.message || `HTTP ${response.status}`);
            }
            console.log('✅ Backend Response:', data);
            console.log('   ok:', data.ok);
            console.log('   message:', data.message);
            if (data.user) {
                console.log('   user email:', data.user.email);
                console.log('   user name:', data.user.name);
                console.log('   user role:', data.user.role);
            }

            return data;
        } catch (error) {
            console.error('❌ Backend Auth Error:', error);
            return {
                ok: false,
                message: error.message || 'Failed to authenticate. Please try again.'
            };
        }
    }
};

export { AUTH_API };
