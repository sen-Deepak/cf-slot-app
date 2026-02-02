/**
 * creators.js - Load creators list from API
 */

window.CF_CREATORS = [];  // Will be populated from API

// Load creators on page load
async function loadCreators() {
    try {
        window.CF_CREATORS = await CREATORS_API.getCreators();
        console.log('✅ Creators loaded into window.CF_CREATORS');
        
        // Dispatch event to notify other scripts that creators are loaded
        window.dispatchEvent(new Event('creatorsLoaded'));
    } catch (error) {
        console.error('❌ Failed to load creators:', error);
        window.CF_CREATORS = [];  // Fallback to empty array
    }
}

// Load creators immediately
loadCreators();
