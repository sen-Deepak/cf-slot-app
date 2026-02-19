/**
 * api/config.js - Vercel Serverless Function
 * 
 * Returns application configuration (API endpoints)
 * This allows frontend to dynamically load API URLs without hardcoding them
 */

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({
            ok: false,
            message: 'Method not allowed. Use GET.'
        });
    }

    try {
        // Return configuration from environment variables
        const config = {
            ok: true,
            google_creators_script_url: process.env.GOOGLE_CREATORS_SCRIPT_URL,
            google_myday_script_url: process.env.GOOGLE_MYDAY_SCRIPT_URL,
            google_brandip_script_url: process.env.GOOGLE_BRANDIP_SCRIPT_URL,
            google_attendance_script_url: process.env.GOOGLE_ATTENDANCE_SCRIPT_URL
        };

        // Check if any required variables are missing
        const missingVars = Object.entries(config)
            .filter(([key, value]) => key !== 'ok' && !value)
            .map(([key]) => key);

        if (missingVars.length > 0) {
            console.warn('⚠️ Missing environment variables:', missingVars);
            return res.status(500).json({
                ok: false,
                message: `Server misconfigured: Missing ${missingVars.join(', ')}`,
                missing: missingVars
            });
        }

        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(config);
    } catch (error) {
        console.error('❌ Config endpoint error:', error);
        return res.status(500).json({
            ok: false,
            message: error.message || 'Internal server error'
        });
    }
}
