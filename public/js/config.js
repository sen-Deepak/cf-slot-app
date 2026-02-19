/**
 * config.js - Fetch and cache configuration from server
 * This loads all API endpoints from the backend instead of hardcoding them
 */

let CONFIG = null;

async function loadConfig() {
    if (CONFIG) return CONFIG; // Return cached config
    
    try {
        console.log('📦 Loading configuration from /api/config...');
        const response = await fetch('/api/config');
        
        if (!response.ok) {
            throw new Error(`Failed to load config: HTTP ${response.status}`);
        }
        
        CONFIG = await response.json();
        console.log('✅ Configuration loaded successfully');
        return CONFIG;
    } catch (error) {
        console.error('❌ Failed to load configuration:', error);
        // Return null so calling code can handle missing config
        return null;
    }
}

async function getConfig(key) {
    const config = await loadConfig();
    if (!config) return null;
    return config[key];
}

export { loadConfig, getConfig, CONFIG };
