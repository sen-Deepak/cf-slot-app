/**
 * api/n8n.js - Vercel Serverless Function
 * 
 * This function forwards POST requests to the n8n webhook endpoint.
 * The n8n webhook URL and optional API key are stored in environment variables.
 * 
 * Environment variables required:
 * - N8N_WEBHOOK_URL: The complete URL of the n8n webhook
 * - APP_KEY (optional): API key to send in x-app-key header
 */

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

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({
            ok: false,
            message: 'Method not allowed. Use POST.'
        });
    }

    // Extract idempotency key
    const request_id = req.body?.request_id || '';
    const startTime = Date.now();

    try {
        // Get webhook URL from environment
        const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
        if (!n8nWebhookUrl) {
            console.error('No N8N_WEBHOOK_URL environment variable set');
            return res.status(500).json({
                ok: false,
                message: 'Server configuration error: No webhook URL set'
            });
        }
        // Prepare headers for n8n
        const headers = {
            'Content-Type': 'application/json',
            'x-request-id': request_id
        };
        // Add optional APP_KEY header if configured
        const appKey = process.env.APP_KEY;
        if (appKey) {
            headers['x-app-key'] = appKey;
        }
        try {
            const response = await fetch(n8nWebhookUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(req.body),
                timeout: 30000 // 30 second timeout
            });
            const duration = Date.now() - startTime;
            // Get response body
            let responseData;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    responseData = await response.json();
                } catch (parseError) {
                    console.error('Failed to parse n8n response:', parseError);
                    responseData = { message: 'Invalid response format from webhook' };
                }
            } else {
                const text = await response.text();
                responseData = { message: text };
            }
            // Verify request_id if present in response
            if (responseData.request_id && responseData.request_id !== request_id) {
                console.error(`Idempotency key mismatch: sent ${request_id}, got ${responseData.request_id}`);
                return res.status(500).json({
                    ok: false,
                    message: 'Idempotency key mismatch',
                    request_id
                });
            }
            // Minimal logging
            console.log(`[booking] request_id=${request_id} status=${response.status} duration=${duration}ms`);
            // Return n8n response to client
            return res.status(response.status).json(responseData);
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`[booking] request_id=${request_id} ERROR duration=${duration}ms:`, error.message);
            return res.status(500).json({
                ok: false,
                message: error.message || 'Failed to reach webhook',
                request_id
            });
        }
    } catch (error) {
        console.error('Error in n8n handler:', error.message);
        // Return error response
        return res.status(500).json({
            ok: false,
            message: error.message || 'Internal server error',
            request_id
        });
    }
}
