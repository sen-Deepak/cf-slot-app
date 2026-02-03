import { fetchWithTimeout } from './fetch-util.js';
import { hashPassword } from './crypto-util.js';

/**
 * auth-api.js - Authentication API (calls backend which calls Google Apps Script)
 */

const AUTH_API = {
    API_URL: "/api/login",  // Backend endpoint (no CORS issues)

    /**
     * Validate user credentials via backend
     * @param {string} email - User email
     * @param {string} password - User password (will be hashed with SHA-256)
     * @returns {Promise<object>} - { ok: boolean, user: object, message: string }
     */
    async validateLogin(email, password) {
        try {
            const emailNormalized = email.trim().toLowerCase();
            console.log('🔐 Authenticating with backend...');
            console.log('   Email:', emailNormalized);
            console.log('   Backend URL:', this.API_URL);

            // Hash the password using SHA-256 before sending
            console.log('   Hashing password with SHA-256...');
            const passwordHash = await hashPassword(password);
            console.log('   ✅ Password hashed');
            console.log('   Hash length:', passwordHash.length);
            console.log('   Hash preview:', passwordHash.substring(0, 32) + '...');

            const payload = {
                email: emailNormalized,
                password_hash: passwordHash  // Send hash instead of plain password
            };
            const payloadJson = JSON.stringify(payload);
            console.log('   Payload size:', payloadJson.length, 'bytes');
            console.log('   Sending payload:', payloadJson);

            const response = await fetchWithTimeout(this.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: payloadJson
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
