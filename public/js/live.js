/**
 * live.js - Live page logic
 * Displays currently live shoots (today's shoots within the current time)
 */

import { AUTH } from './auth.js';
import { NAV } from './nav.js';
import { ADMIN_API } from './admin-api.js';

let liveRefreshInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check auth first
    if (!AUTH.isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

    // Check if user has access to this page (admin only)
    if (!NAV.isCurrentPageAccessible()) {
        window.location.href = '/booking.html';
        return;
    }

    initializePage();
    loadLiveData();

    // Refresh live data every 30 seconds
    liveRefreshInterval = setInterval(loadLiveData, 30000);
});

function initializePage() {
    // Setup logout button
    document.getElementById('logoutBtn').addEventListener('click', () => {
        AUTH.logout();
        window.location.href = '/login.html';
    });

    // Display username in header
    const user = AUTH.getCurrentUser();
    if (user && user.name) {
        const firstName = user.name.split(' ')[0];
        const userNameDisplay = document.getElementById('userNameDisplay');
        if (userNameDisplay) {
            userNameDisplay.textContent = 'Hi ' + firstName;
        }
    }
}

async function loadLiveData() {
    const liveContent = document.getElementById('liveContent');

    try {
        const allShootsToday = await ADMIN_API.getTodaysShoots();
        const liveShoots = allShootsToday.filter(shoot => ADMIN_API._isShootLive(shoot));

        if (liveShoots.length === 0) {
            liveContent.innerHTML = `
                <div class="no-live-shoots">
                    <p style="color: #999; text-align: center; padding: 2rem;">
                        No shoots currently live
                    </p>
                    <div class="upcoming-shoots">
                        <h3>Today's Schedule:</h3>
                        <div class="shoots-list">
                            ${allShootsToday.map(shoot => createUpcomingShootItem(shoot)).join('')}
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        let html = `
            <div class="live-shoots-container">
                <div class="live-count-badge">
                    <span class="live-indicator">● LIVE</span>
                    <span class="live-count">${liveShoots.length} ${liveShoots.length === 1 ? 'shoot' : 'shoots'} active</span>
                </div>
                <div class="live-shoots-grid">
                    ${liveShoots.map(shoot => createLiveShootCard(shoot)).join('')}
                </div>
            </div>
        `;

        liveContent.innerHTML = html;
    } catch (error) {
        console.error('Error loading live shoots:', error);
        liveContent.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading live data</p>';
    }
}

function createLiveShootCard(shoot) {
    const formatted = ADMIN_API.formatShootForDisplay(shoot);
    const currentTime = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });

    return `
        <div class="live-shoot-card pulse-animation">
            <div class="live-badge-large">● LIVE NOW</div>
            <div class="shoot-header">
                <h4 class="shoot-name">${shoot['Shoot Name']}</h4>
                <span class="shoot-type">${shoot['Type']}</span>
            </div>
            <div class="shoot-details">
                <p><strong>Creator:</strong> ${shoot['Creator']}</p>
                <p><strong>DOP:</strong> ${shoot['DOP']}</p>
                <p><strong>Location:</strong> ${shoot['Location']}</p>
                <p><strong>Cast:</strong> ${shoot['Cast']}</p>
                <p><strong>Time Slot:</strong> ${formatted.fromTime} - ${formatted.toTime}</p>
                <p><strong>Current Time:</strong> <span class="current-time-display">${currentTime}</span></p>
            </div>
            <div class="shoot-id">
                <small>Booking ID: ${shoot['Booking ID']}</small>
            </div>
        </div>
    `;
}

function createUpcomingShootItem(shoot) {
    const formatted = ADMIN_API.formatShootForDisplay(shoot);
    
    return `
        <div class="upcoming-shoot-item">
            <span class="time">${formatted.fromTime}</span>
            <span class="name">${shoot['Shoot Name']}</span>
            <span class="dop">${shoot['DOP']}</span>
        </div>
    `;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (liveRefreshInterval) {
        clearInterval(liveRefreshInterval);
    }
});

