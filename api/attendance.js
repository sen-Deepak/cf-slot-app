/**
 * api/attendance.js - Attendance API Proxy
 * 
 * This function proxies attendance read/write requests to Google Apps Script
 * Solves CORS issues by forwarding requests from the same origin
 * 
 * Environment variables (optional):
 * - ATTENDANCE_API_URL: Google Apps Script API endpoint
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST and GET requests
    if (!['GET', 'POST'].includes(req.method)) {
        return res.status(405).json({
            ok: false,
            message: 'Method not allowed. Use GET or POST.'
        });
    }

    try {
        // Google Apps Script API endpoint
        const gasApiUrl = process.env.GOOGLE_ATTENDANCE_SCRIPT_URL;
        
        if (!gasApiUrl) {
            return res.status(500).json({
                ok: false,
                message: 'Server misconfigured: GOOGLE_ATTENDANCE_SCRIPT_URL missing'
            });
        }

        if (req.method === 'GET') {
            // Handle read and read_all requests
            const action = (req.query.action || 'read').toLowerCase();
            
            // Extract parameters from req.query (works in Express/Node)
            let employee = req.query.employee;
            let from = req.query.from;
            let to = req.query.to;

            // Debug logging
            console.log('📍 Attendance API GET request:');
            console.log('  action:', action);
            console.log('  employee:', employee);
            console.log('  from:', from);
            console.log('  to:', to);
            console.log('  req.query:', req.query);

            // Validate parameters
            if (action === 'read' && !employee) {
                console.log('❌ Missing employee for read action');
                return res.status(400).json({
                    ok: false,
                    message: 'Missing employee parameter for read action'
                });
            }

            if (action === 'read_all') {
                if (!from || !to) {
                    console.log(`❌ Missing from/to for read_all: from="${from}", to="${to}"`);
                    return res.status(400).json({
                        ok: false,
                        message: `Missing from and to parameters for read_all action. Received: from="${from}", to="${to}"`
                    });
                }
            }

            // Build the URL to forward to Google Apps Script
            let readUrl = gasApiUrl;
            if (action === 'read') {
                readUrl = `${gasApiUrl}?action=read&employee=${encodeURIComponent(employee)}`;
            } else if (action === 'read_all') {
                readUrl = `${gasApiUrl}?action=read_all&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
            }

            console.log('📤 Forwarding to GAS:', readUrl);
            const gasRes = await fetch(readUrl);
            
            if (!gasRes.ok) {
                const errorText = await gasRes.text();
                console.error(`❌ GAS Error (${gasRes.status}): ${errorText}`);
                return res.status(gasRes.status).json({
                    ok: false,
                    message: `Google Apps Script error: ${gasRes.status}`,
                    error: errorText
                });
            }

            const data = await gasRes.json();
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            // Handle write/update requests
            const { action, date, employee, attendance, key } = req.body;

            if (!action || (action !== 'write' && action !== 'update') || !date || !employee || !attendance) {
                return res.status(400).json({
                    ok: false,
                    message: 'Missing required fields: action (write/update), date, employee, attendance'
                });
            }

            const gasRes = await fetch(gasApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: action,
                    date,
                    employee,
                    attendance,
                    key: key || `${date}${employee}`
                }),
            });

            if (!gasRes.ok) {
                const errorText = await gasRes.text();
                console.error(`❌ GAS Error (${gasRes.status}): ${errorText}`);
                return res.status(gasRes.status).json({
                    ok: false,
                    message: `Google Apps Script error: ${gasRes.status}`,
                    error: errorText
                });
            }

            const data = await gasRes.json();
            return res.status(200).json(data);
        }

    } catch (error) {
        console.error('Attendance API error:', error.message);
        return res.status(500).json({
            ok: false,
            message: 'Internal server error',
            error: error.message
        });
    }
}
