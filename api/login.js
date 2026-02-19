// api/login.js - Vercel serverless function for login

import crypto from 'crypto';

// Hash password using SHA-256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

export default async function handler(req, res) {
    // Get origin from request or use fallback
    const origin = req.headers.origin || req.headers.referer?.split('/')[2];
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
        'https://slot-booking-three-xi.vercel.app'
    ].filter(Boolean);

    // CORS headers - restrict to specific origins
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

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

    // Use GOOGLE_AUTH_SCRIPT_URL from env
    const GOOGLE_AUTH_SCRIPT_URL = process.env.GOOGLE_AUTH_SCRIPT_URL;
    if (!GOOGLE_AUTH_SCRIPT_URL) {
        return res.status(500).json({ ok: false, message: 'Server misconfigured: GOOGLE_AUTH_SCRIPT_URL missing' });
    }

    try {
        const response = await fetch(GOOGLE_AUTH_SCRIPT_URL, {
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
