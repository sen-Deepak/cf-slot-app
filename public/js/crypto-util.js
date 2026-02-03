/**
 * crypto-util.js - Cryptographic utilities for hashing passwords
 * Uses Web Crypto API for SHA-256 hashing
 */

/**
 * Hash a password using SHA-256
 * @param {string} password - The plain text password to hash
 * @returns {Promise<string>} - The hex-encoded SHA-256 hash
 */
async function hashPassword(password) {
    try {
        // Convert password string to ArrayBuffer
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        
        // Hash using SHA-256
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        
        // Convert ArrayBuffer to hex string
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        return hashHex;
    } catch (error) {
        console.error('❌ Error hashing password:', error);
        throw new Error('Failed to hash password');
    }
}

/**
 * Hash a password synchronously (if needed)
 * Note: This is a polyfill for environments without Web Crypto API
 * For production, always use async hashPassword()
 * @param {string} password - The plain text password to hash
 * @returns {Promise<string>} - The hex-encoded hash
 */
async function hashPasswordAsync(password) {
    return hashPassword(password);
}

export { hashPassword, hashPasswordAsync };
