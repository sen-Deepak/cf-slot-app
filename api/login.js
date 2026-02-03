// api/login.js - Vercel serverless function for login

import crypto from 'crypto';

// Hash password using SHA-256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-key');

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method not allowed. Use POST.' });
    }

    let body = '';
    try {
        body = req.body;
        if (typeof body === 'string') {
            body = JSON.parse(body);
        }
    } catch (e) {
        return res.status(400).json({ ok: false, message: 'Invalid JSON' });
    }

    const email = body.email?.trim().toLowerCase();
    const password = body.password;
    if (!email || !password) {
        return res.status(400).json({ ok: false, message: 'Missing email or password' });
    }

    // Hash password on server side
    const passwordHash = hashPassword(password);

    // Use AUTH_API_URL from env
    const AUTH_API_URL = process.env.AUTH_API_URL;
    if (!AUTH_API_URL) {
        return res.status(500).json({ ok: false, message: 'Server misconfigured: AUTH_API_URL missing' });
    }

    try {
        const response = await fetch(AUTH_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password_hash: passwordHash })
        });
        const data = await response.json();
        // Always return { ok, user, message } or { ok: false, message }
        if (!response.ok) {
            return res.status(response.status).json({ ok: false, message: data.message || 'Auth failed' });
        }
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ ok: false, message: error.message || 'Auth request failed' });
    }
}
