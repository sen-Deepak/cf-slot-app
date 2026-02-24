#!/usr/bin/env node

/**
 * Simple development server for CreativeFuel Booking App
 * Serves static files from ./public and ./api directories
 * Handles POST requests to /api/n8n
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Hash password using SHA-256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Load .env.local file
function loadEnv() {
    const envPath = path.join(__dirname, '.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length > 0) {
                    let value = valueParts.join('=').trim();
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) || 
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    process.env[key.trim()] = value;
                    // Log all GOOGLE_ and N8N_ variables for debugging
                    if (key.includes('GOOGLE_') || key.includes('WEBHOOK') || key.includes('N8N_')) {
                        console.log(`✅ ${key.trim()} loaded: ${value.substring(0, 50)}...`);
                    }
                }
            }
        });
        console.log('✅ .env.local loaded\n');
    } else {
        console.log('⚠️  .env.local not found\n');
    }
}

loadEnv();

// ...existing code...

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

// Create server
const server = http.createServer(async (req, res) => {
    // Parse URL using WHATWG API
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = parsedUrl.pathname;

    console.log(`\n📥 Request: ${req.method} ${pathname}`);

    // CORS headers - restrict to localhost for development
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Disable caching for dynamic content
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Handle /api/google-script GET request (fetch bookings)
    if (pathname === '/api/google-script' && req.method === 'GET') {
        console.log('✅ Matched /api/google-script endpoint');
        const queryParams = new URL(`http://localhost${req.url}`).searchParams;
        const employee = queryParams.get('employee');
        const key = queryParams.get('key');

        console.log(`\n📚 Google Apps Script API Request`);
        console.log(`   Employee: ${employee}`);
        console.log(`   Key: ${key}`);

        if (!employee) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: false,
                message: 'Missing employee parameter'
            }));
            return;
        }

        try {
            const GOOGLE_SCRIPT_URL = process.env.GOOGLE_MYDAY_SCRIPT_URL;
            if (!GOOGLE_SCRIPT_URL) {
                throw new Error('GOOGLE_MYDAY_SCRIPT_URL environment variable not configured');
            }
            
            const googleUrl = `${GOOGLE_SCRIPT_URL}?employee=${encodeURIComponent(employee)}&key=bookingkey`;
            
            console.log(`   Calling: ${googleUrl.substring(0, 80)}...`);

            const fetch_response = await fetch(googleUrl, {
                method: 'GET',
                mode: 'cors'
            });

            const responseText = await fetch_response.text();
            console.log(`   Status: ${fetch_response.status}`);
            console.log(`   Response length: ${responseText.length} bytes\n`);

            // Try to parse as JSON
            let responseData;
            try {
                responseData = JSON.parse(responseText);
            } catch (e) {
                // If not JSON, try to parse error
                console.warn('   Response is not JSON, returning as array');
                responseData = [];
            }

            res.writeHead(fetch_response.status, { 
                'Access-Control-Allow-Origin': '*'
            });
// ...existing code...
            res.end(JSON.stringify(responseData));

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}\n`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: false,
                message: `Failed to fetch from Google Apps Script: ${error.message}`
            }));
        }
        return;
    }

    // Handle /api/login POST request (authenticate user)
    if (pathname === '/api/login') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: false,
                message: 'Method not allowed. Use POST.'
            }));
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                let payload;
                try {
                    payload = JSON.parse(body);
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        message: 'Invalid JSON'
                    }));
                    return;
                }

                const email = payload.email?.trim().toLowerCase();
                const password = payload.password;

                console.log(`\n🔐 Login Request Received`);
                console.log(`   Payload:`, JSON.stringify({ email, password: '***' }));
                console.log(`   Email: ${email}`);
                console.log(`   Password Exists: ${!!password}`);

                if (!email || !password) {
                    console.log(`   ❌ Validation Failed`);
                    if (!email) console.log(`      - Missing or empty email`);
                    if (!password) console.log(`      - Missing or empty password`);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        message: 'Missing email or password'
                    }));
                    return;
                }

                // Hash password using SHA-256 on server side
                console.log(`   🔐 Hashing password on server...`);
                const passwordHash = hashPassword(password);
                console.log(`   ✅ Password hashed`);
                console.log(`   Hash: ${passwordHash.substring(0, 16)}...`);

                // Call Google Apps Script to validate credentials
                const GAS_AUTH_URL = process.env.GOOGLE_AUTH_SCRIPT_URL;
                if (!GAS_AUTH_URL) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        message: 'Server misconfigured: GOOGLE_AUTH_SCRIPT_URL missing'
                    }));
                    return;
                }

                try {
                    const gasResponse = await fetch(GAS_AUTH_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            email: email,
                            password_hash: passwordHash
                        })
                    });

                    console.log(`   GAS Response status: ${gasResponse.status}`);

                    if (!gasResponse.ok) {
                        throw new Error(`GAS returned ${gasResponse.status}`);
                    }

                    const gasData = await gasResponse.json();
                    console.log(`   GAS Response:`, gasData);

                    // Return the GAS response directly
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(gasData));
                } catch (gasError) {
                    console.log(`   ❌ GAS Error: ${gasError.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        message: `Authentication service error: ${gasError.message}`
                    }));
                }
            } catch (error) {
                console.error('API Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ok: false,
                    message: error.message || 'Internal server error'
                }));
            }
        });
        return;
    }

    // Handle API requests
    if (pathname === '/api/n8n') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: false,
                message: 'Method not allowed. Use POST.'
            }));
            return;
        }

        // Read request body
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                // Get webhook URL from environment (after loadEnv has run)
                const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
                
                // Check if webhook URL is configured
                if (!n8nWebhookUrl) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        message: 'No webhook URL configured'
                    }));
                    return;
                }

                // Parse request body
                let payload;
                try {
                    payload = JSON.parse(body);
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        message: 'Invalid JSON'
                    }));
                    return;
                }

                // Forward to n8n
                const headers = {
                    'Content-Type': 'application/json'
                };
                const appKey = process.env.APP_KEY;
                if (appKey) {
                    headers['x-app-key'] = appKey;
                }

                try {
                    console.log(`\n🔄 Forwarding to n8n...`);
                    console.log(`   URL: ${n8nWebhookUrl}`);
                    console.log(`   Action: ${payload.action}`);
                    const fetch_response = await fetch(n8nWebhookUrl, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify(payload)
                    });
                    const responseData = await fetch_response.json().catch(() => ({ message: 'Invalid response' }));
                    console.log(`   Status: ${fetch_response.status}`);
                    console.log(`   Response: ${JSON.stringify(responseData).substring(0, 100)}\n`);
                    res.writeHead(fetch_response.status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(responseData));
                } catch (fetchError) {
                    console.log(`   ❌ Error: ${fetchError.message}\n`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        message: `Failed to reach webhook: ${fetchError.message}`
                    }));
                }
            } catch (error) {
                console.error('API Error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ok: false,
                    message: error.message || 'Internal server error'
                }));
            }
        });
        return;
    }

    // Handle /api/attendance GET and POST requests
    if (pathname === '/api/attendance') {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle OPTIONS
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'GET') {
            // Handle read requests
            const queryParams = new URL(`http://localhost${req.url}`).searchParams;
            const employee = queryParams.get('employee');
            const action = queryParams.get('action');

            if (!employee) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ok: false,
                    message: 'Missing employee parameter'
                }));
                return;
            }

            try {
                const GAS_URL = process.env.GOOGLE_ATTENDANCE_SCRIPT_URL;
                if (!GAS_URL) {
                    throw new Error('GOOGLE_ATTENDANCE_SCRIPT_URL environment variable not configured');
                }
                const gasUrl = `${GAS_URL}?action=read&employee=${encodeURIComponent(employee)}`;
                
                console.log(`   Calling Google Apps Script...`);

                const fetch_response = await fetch(gasUrl, {
                    method: 'GET',
                    mode: 'cors'
                });

                const responseText = await fetch_response.text();
                console.log(`   Status: ${fetch_response.status}`);

                let responseData;
                try {
                    responseData = JSON.parse(responseText);
                } catch (e) {
                    console.warn('   Response is not JSON');
                    responseData = {};
                }

                res.writeHead(fetch_response.status, { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify(responseData));

            } catch (error) {
                console.error(`   ❌ Error: ${error.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    ok: false,
                    message: `Failed to reach Google Apps Script: ${error.message}`
                }));
            }
            return;
        }

        if (req.method === 'POST') {
            // Handle write requests
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', async () => {
                try {
                    // Parse request body
                    let payload;
                    try {
                        payload = JSON.parse(body);
                    } catch (e) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            ok: false,
                            message: 'Invalid JSON'
                        }));
                        return;
                    }

                    const { action, date, employee, attendance, key } = payload;

                    if (!action || (action !== 'write' && action !== 'update') || !date || !employee || !attendance) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            ok: false,
                            message: 'Missing required fields: action (write/update), date, employee, attendance'
                        }));
                        return;
                    }

                    // Forward to Google Apps Script
                    const GAS_URL = process.env.GOOGLE_ATTENDANCE_SCRIPT_URL;
                    if (!GAS_URL) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            ok: false,
                            message: 'Server misconfigured: GOOGLE_ATTENDANCE_SCRIPT_URL missing'
                        }));
                        return;
                    }
                    
                    console.log(`   Calling Google Apps Script...`);

                    const fetch_response = await fetch(GAS_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            action: action,
                            date,
                            employee,
                            attendance,
                            key: key || `${date}${employee}`
                        })
                    });

                    const responseText = await fetch_response.text();
                    console.log(`   Status: ${fetch_response.status}`);

                    let responseData;
                    try {
                        responseData = JSON.parse(responseText);
                    } catch (e) {
                        console.warn('   Response is not JSON');
                        responseData = { ok: fetch_response.ok, message: responseText };
                    }

                    res.writeHead(fetch_response.status, { 
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify(responseData));

                } catch (error) {
                    console.error(`   ❌ Error: ${error.message}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ok: false,
                        message: `Failed to reach Google Apps Script: ${error.message}`
                    }));
                }
            });
            return;
        }

        // Method not allowed
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            ok: false,
            message: 'Method not allowed. Use GET or POST.'
        }));
        return;
    }

    // Handle /api/config GET request (serve configuration)
    if (pathname === '/api/config' && req.method === 'GET') {
        console.log('✅ Matched /api/config endpoint');
        const config = {
            ok: true,
            google_creators_script_url: process.env.GOOGLE_CREATORS_SCRIPT_URL,
            google_myday_script_url: process.env.GOOGLE_MYDAY_SCRIPT_URL,
            google_brandip_script_url: process.env.GOOGLE_BRANDIP_SCRIPT_URL,
            google_attendance_script_url: process.env.GOOGLE_ATTENDANCE_SCRIPT_URL
        };
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        });
        res.end(JSON.stringify(config));
        return;
    }

    // Handle root redirect
    if (pathname === '/') {
        pathname = '/login.html';
    }

    // Serve static files from public directory
    let filePath = path.join(__dirname, 'public', pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(path.join(__dirname, 'public'))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // Check if file exists
    fs.stat(filePath, (err, stats) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        // Serve file
        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

// Start server
server.listen(PORT, HOST, () => {
    console.log(`\n🚀 CreativeFuel Booking App Server\n`);
    console.log(`📍 Local:   http://localhost:${PORT}/`);
    console.log(`🌐 Network: http://172.17.1.247:${PORT}/`);
    console.log(`\n⚙️  Configuration:`);
    console.log(`   Google Auth Script:     ${process.env.GOOGLE_AUTH_SCRIPT_URL ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Google Creators Script: ${process.env.GOOGLE_CREATORS_SCRIPT_URL ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Google MyDay Script:    ${process.env.GOOGLE_MYDAY_SCRIPT_URL ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Google BrandIP Script:  ${process.env.GOOGLE_BRANDIP_SCRIPT_URL ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   Google Attendance Script: ${process.env.GOOGLE_ATTENDANCE_SCRIPT_URL ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   N8N Webhook: ${process.env.N8N_WEBHOOK_URL ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`   App Key:     ${process.env.APP_KEY ? '✅ Set' : '⚠️  Not set (optional)'}`);
    console.log(`\n⏹️  Press Ctrl+C to stop\n`);
});


// Handle errors
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
    } else {
        console.error('Server error:', err);
    }
    process.exit(1);
});
