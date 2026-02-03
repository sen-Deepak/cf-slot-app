// public/js/fetch-util.js
// Minimal fetch wrapper with timeout and consistent error shape

export async function fetchWithTimeout(url, options = {}, timeout = 60000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;
    try {
        const response = await fetch(url, options);
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        // Consistent error shape for UI
        return {
            ok: false,
            status: 0,
            error: error.name === 'AbortError' ? 'Request timed out' : error.message || 'Network error',
            timeout: error.name === 'AbortError'
        };
    }
}
