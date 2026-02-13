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
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
        const gasApiUrl = process.env.ATTENDANCE_API_URL || 
            "https://script.google.com/macros/s/AKfycbyk5av7geQPS1YzxMo1sc2ccNPP-S55kHGJIXy_ijxisSXEgcfZqBlFXv-aAVCF7NzsuQ/exec";

        if (req.method === 'GET') {
            // Handle read requests
            const employee = req.query.employee || req.url.split('employee=')[1]?.split('&')[0];
            
            if (!employee) {
                return res.status(400).json({
                    ok: false,
                    message: 'Missing employee parameter'
                });
            }

            const readUrl = `${gasApiUrl}?action=read&employee=${encodeURIComponent(employee)}`;

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
            // Handle write requests
            const { action, date, employee, attendance, key } = req.body;

            if (!action || action !== 'write' || !date || !employee || !attendance) {
                return res.status(400).json({
                    ok: false,
                    message: 'Missing required fields: action, date, employee, attendance'
                });
            }

            const gasRes = await fetch(gasApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'write',
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
