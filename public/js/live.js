/**
 * live.js - Live page logic
 * Displays currently live shoots (today's shoots within the current time)
 */

import { AUTH } from './auth.js';
import { NAV } from './nav.js';
import { ADMIN_API } from './admin-api.js';

let liveRefreshInterval = null;
let allShoots = [];

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
    initSearch();
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
    const shootsList = document.getElementById('shootsList');

    try {
        const shoots = await ADMIN_API.getTodaysShoots();

        if (shoots.length === 0) {
            shootsList.innerHTML = '<p style="text-align: center; color: #999;">No shoots scheduled for today</p>';
            return;
        }

        allShoots = shoots;
        loadShootsSchedule(shoots);
    } catch (error) {
        console.error('Error loading schedule:', error);
        shootsList.innerHTML = '<p style="color: #e74c3c; text-align: center;">Error loading schedule data</p>';
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

function loadShootsSchedule(shoots) {
    const shootsList = document.getElementById('shootsList');
    
    if (shoots.length === 0) {
        shootsList.innerHTML = '<p style="text-align: center; color: #999;">No shoots scheduled</p>';
        return;
    }

    const HOUR_HEIGHT = 80;
    const END_HOUR = 22;
    const GAP = 2;

    // Calculate dynamic START_HOUR based on earliest shoot time
    // If earliest shoot is before 10am, start from that time; otherwise start from 10am
    const t2m = (timeStr) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + (minutes || 0);
    };

    const getEarliestStartHour = () => {
        let earliestMinutes = 10 * 60; // Default to 10am (600 minutes)
        
        shoots.forEach(shoot => {
            const fromTime = shoot['From Time'];
            if (fromTime) {
                const minutes = t2m(fromTime);
                const hours = Math.floor(minutes / 60);
                if (hours < 10) {
                    earliestMinutes = Math.min(earliestMinutes, minutes);
                }
            }
        });

        return Math.floor(earliestMinutes / 60);
    };

    const START_HOUR = getEarliestStartHour();

    // Color palette - 10 colors
    const COLOR_PALETTE = [
        '#080708', '#381f6e', '#36b37e', '#ff2fc8', '#e8c84a',
        '#755bd4', '#5f7118', '#b04ed6', '#4f8ef7', '#17db3b'
    ];

    // Generate consistent color for brand based on name hash
    const getColor = (brandName) => {
        if (!brandName) return COLOR_PALETTE[0];
        
        // Simple hash function to generate consistent number from string
        let hash = 0;
        for (let i = 0; i < brandName.length; i++) {
            const char = brandName.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        // Use absolute value and mod by palette length
        const colorIndex = Math.abs(hash) % COLOR_PALETTE.length;
        return COLOR_PALETTE[colorIndex];
    };

    // Utility functions
    const m2px = (minutes) => ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    
    const getDuration = (startTime, endTime) => {
        const startMin = t2m(startTime);
        const endMin = t2m(endTime);
        const d = endMin - startMin;
        const h = Math.floor(d / 60);
        const m = d % 60;
        return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
    };

    // Calculate total height
    const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT + 20;

    // Build HTML structure
    let html = `
        <div class="timeline-wrapper" style="height: ${totalHeight}px;">
            <div class="timeline-labels" id="timelineLabels"></div>
            <div class="timeline-grid" id="timelineGrid"></div>
            <div class="timeline-events" id="timelineEvents"></div>
        </div>
    `;
    shootsList.innerHTML = html;

    // Build time labels and grid
    const labelsContainer = document.getElementById('timelineLabels');
    const gridContainer = document.getElementById('timelineGrid');

    for (let h = START_HOUR; h <= END_HOUR; h++) {
        for (let half = 0; half < 2; half++) {
            const min = h * 60 + half * 30;
            if (min > END_HOUR * 60) break;
            
            const y = m2px(min);

            // Grid line
            const gridLine = document.createElement('div');
            gridLine.className = `gridline ${half === 0 ? 'gridline-hour' : 'gridline-half'}`;
            gridLine.style.top = y + 'px';
            gridContainer.appendChild(gridLine);

            // Time label
            const label = document.createElement('div');
            label.className = `time-label ${half === 0 ? 'time-label-hour' : 'time-label-half'}`;
            label.style.top = y + 'px';
            
            if (half === 0) {
                const displayH = h === 0 || h === 24 ? 12 : (h > 12 ? h - 12 : h);
                const ap = h < 12 ? 'AM' : 'PM';
                label.textContent = h === 12 ? '12 PM' : (h === 0 ? '12 AM' : `${displayH} ${ap}`);
            } else {
                const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
                label.textContent = `${displayH}:30`;
            }
            
            labelsContainer.appendChild(label);
        }
    }

    // Sort shoots by start time
    const sortedShoots = [...shoots].sort((a, b) => {
        const aStart = a['_from_minutes'] || t2m(a['From Time']);
        const bStart = b['_from_minutes'] || t2m(b['From Time']);
        return aStart - bStart;
    });

    // Detect overlaps and assign columns
    const cols = [];
    sortedShoots.forEach(shoot => {
        const s = t2m(shoot['From Time']);
        const e = t2m(shoot['To Time']);
        let placed = false;

        for (let ci = 0; ci < cols.length; ci++) {
            const last = cols[ci][cols[ci].length - 1];
            const lastEnd = t2m(last['To Time']);
            if (lastEnd <= s) {
                cols[ci].push(shoot);
                shoot._col = ci;
                placed = true;
                break;
            }
        }

        if (!placed) {
            shoot._col = cols.length;
            cols.push([shoot]);
        }
    });

    // Calculate total columns for each shoot
    sortedShoots.forEach(shoot => {
        const s = t2m(shoot['From Time']);
        const e = t2m(shoot['To Time']);
        let maxCol = shoot._col;

        sortedShoots.forEach(other => {
            const os = t2m(other['From Time']);
            const oe = t2m(other['To Time']);
            if (os < e && oe > s) {
                maxCol = Math.max(maxCol, other._col);
            }
        });

        shoot._totalCols = maxCol + 1;
    });

    // Render event blocks
    const eventsContainer = document.getElementById('timelineEvents');
    sortedShoots.forEach(shoot => {
        const startMin = t2m(shoot['From Time']);
        const endMin = t2m(shoot['To Time']);
        const top = m2px(startMin);
        const height = Math.max(m2px(endMin) - m2px(startMin) - GAP, 20);
        const color = getColor(shoot['B_IP_Name'] || shoot['Brand']);

        const leftPercent = shoot._col * (100 / shoot._totalCols) + 0.3;
        const widthPercent = (100 / shoot._totalCols) - 0.6;

        const tiny = height < 28;
        const small = height < 48;

        let content = `<div class="event-stripe" style="background:${color}"></div>`;
        content += `<div class="event-inner">`;
        content += `<div class="event-brand" style="color:${color}">${shoot['B_IP_Name'] || 'Unknown'}</div>`;

        if (!tiny) {
            if (!small) {
                const creatorName = shoot['Creator'] ? shoot['Creator'].split(' ')[0] : 'N/A';
                content += `<div class="event-creator">👤 ${creatorName}</div>`;
            }
            content += `<div class="event-tags">`;
            content += `<span class="event-tag event-type">${shoot['Type'] || 'IP'}</span>`;
            content += `<span class="event-tag event-location">${shoot['Location'] === 'Outdoor' ? '🌿 Out' : '🏠 In'}</span>`;
            content += `<span class="event-tag event-cast">👥 ${shoot['No Of Shoot'] || 1}</span>`;
            content += `</div>`;
        }

        content += `</div>`;

        const block = document.createElement('div');
        block.className = 'event-block';

        // Add 'deleted' class if Final Status is "Deleted"
        if (shoot['Final Status'] === 'Deleted') {
            block.classList.add('deleted');
        }

        // Build searchable names: creator, dop, cast members, brand/IP name, shoot name
        const searchNames = [];
        if (shoot['Creator']) searchNames.push(...shoot['Creator'].split(',').map(s => s.trim()).filter(Boolean));
        if (shoot['DOP']) searchNames.push(...shoot['DOP'].split(',').map(s => s.trim()).filter(Boolean));
        if (shoot['Cast']) searchNames.push(...shoot['Cast'].split(',').map(s => s.trim()).filter(Boolean));
        if (shoot['B_IP_Name']) searchNames.push(shoot['B_IP_Name'].trim());
        if (shoot['Shoot Name']) searchNames.push(shoot['Shoot Name'].trim());
        block.dataset.searchNames = JSON.stringify(searchNames);
        
        block.style.cssText = `
            top: ${top}px;
            height: ${height}px;
            left: ${leftPercent}%;
            width: calc(${widthPercent}% - 4px);
            background: ${color}14;
            border-color: ${color}33;
        `;
        block.innerHTML = content;
        block.addEventListener('click', () => openShootModal(shoot, color));

        eventsContainer.appendChild(block);
    });

    // Add current time indicator line
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;
    
    // Only show current time line if it's within the visible range
    if (currentTimeInMinutes >= START_HOUR * 60 && currentTimeInMinutes <= END_HOUR * 60) {
        const currentTimeY = m2px(currentTimeInMinutes);
        
        const currentTimeLine = document.createElement('div');
        currentTimeLine.className = 'current-time-line';
        currentTimeLine.style.top = currentTimeY + 'px';
        
        // Add time label
        const timeLabel = document.createElement('div');
        timeLabel.className = 'current-time-label';
        const displayHours = currentHours > 12 ? currentHours - 12 : (currentHours === 0 ? 12 : currentHours);
        const ap = currentHours >= 12 ? 'PM' : 'AM';
        timeLabel.textContent = `NOW ${displayHours}:${String(currentMinutes).padStart(2, '0')} ${ap}`;
        
        currentTimeLine.appendChild(timeLabel);
        eventsContainer.appendChild(currentTimeLine);
    }
}

function initSearch() {
    const input = document.getElementById('scheduleSearch');
    const dropdown = document.getElementById('searchDropdown');
    const clearBtn = document.getElementById('searchClearBtn');
    if (!input) return;

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.style.display = q ? '' : 'none';
        if (!q) {
            hideDropdown();
            clearSearch();
            return;
        }
        showSuggestions(q);
    });

    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('li[data-name]');
        const active = dropdown.querySelector('li.active');
        const idx = active ? [...items].indexOf(active) : -1;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = items[idx + 1] || items[0];
            if (next) { active && active.classList.remove('active'); next.classList.add('active'); next.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = items[idx - 1] || items[items.length - 1];
            if (prev) { active && active.classList.remove('active'); prev.classList.add('active'); prev.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'Enter') {
            if (active) { selectName(active.dataset.name); }
        } else if (e.key === 'Escape') {
            hideDropdown();
            clearSearch();
            input.value = '';
            clearBtn.style.display = 'none';
        }
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        hideDropdown();
        clearSearch();
        input.focus();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar-wrapper')) hideDropdown();
    });
}

function collectAllNames() {
    const seen = new Set();
    const entries = []; // { name, role }

    const add = (name, role) => {
        if (!name) return;
        const n = name.trim();
        if (!n || seen.has(n.toLowerCase())) return;
        seen.add(n.toLowerCase());
        entries.push({ name: n, role });
    };

    allShoots.forEach(shoot => {
        if (shoot['B_IP_Name']) add(shoot['B_IP_Name'], 'Brand');
        if (shoot['Shoot Name']) add(shoot['Shoot Name'], 'Shoot');
        if (shoot['Creator']) shoot['Creator'].split(',').forEach(s => add(s.trim(), 'Creator'));
        if (shoot['DOP']) shoot['DOP'].split(',').forEach(s => add(s.trim(), 'DOP'));
        if (shoot['Cast']) shoot['Cast'].split(',').forEach(s => add(s.trim(), 'Cast'));
    });

    return entries;
}

function showSuggestions(query) {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    const q = query.toLowerCase();
    const all = collectAllNames();
    const matches = all.filter(e => e.name.toLowerCase().includes(q));

    if (matches.length === 0) {
        dropdown.innerHTML = `<li class="search-no-results">No matches</li>`;
        dropdown.style.display = '';
        return;
    }

    dropdown.innerHTML = matches.map(e =>
        `<li data-name="${escapeHtml(e.name)}">
            <span class="dd-name">${highlightMatch(e.name, query)}</span>
            <span class="dd-role">${e.role}</span>
        </li>`
    ).join('');

    dropdown.querySelectorAll('li[data-name]').forEach(li => {
        li.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            selectName(li.dataset.name);
        });
    });

    dropdown.style.display = '';
}

function hideDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.style.display = 'none';
}

function selectName(name) {
    const input = document.getElementById('scheduleSearch');
    if (input) input.value = name;
    hideDropdown();
    applySearch(name);
}

function applySearch(name) {
    const blocks = document.querySelectorAll('.event-block');
    if (!name) { clearSearch(); return; }

    const nameLower = name.toLowerCase();

    blocks.forEach(block => {
        const names = JSON.parse(block.dataset.searchNames || '[]');
        const matched = names.some(n => n.toLowerCase() === nameLower);
        block.classList.toggle('search-highlight', matched);
        block.classList.toggle('search-dim', !matched);

        if (matched) {
            // Use the block's stripe color as glow color
            const stripe = block.querySelector('.event-stripe');
            if (stripe) {
                const color = stripe.style.background || '#ffe066';
                block.style.setProperty('--search-glow', color);
            }
        }
    });
}

function clearSearch() {
    document.querySelectorAll('.event-block').forEach(block => {
        block.classList.remove('search-highlight', 'search-dim');
        block.style.removeProperty('--search-glow');
    });
}

function highlightMatch(name, query) {
    if (!query) return escapeHtml(name);
    const idx = name.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(name);
    return escapeHtml(name.slice(0, idx)) +
        `<strong>${escapeHtml(name.slice(idx, idx + query.length))}</strong>` +
        escapeHtml(name.slice(idx + query.length));
}

function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openShootModal(shoot, color) {
    // Create modal if it doesn't exist
    if (!document.getElementById('shootModal')) {
        const modal = document.createElement('div');
        modal.id = 'shootModal';
        modal.className = 'shoot-modal-overlay';
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });
        document.body.appendChild(modal);
    }

    const durationText = getDuration(shoot['From Time'], shoot['To Time']);
    const castList = (shoot['Cast'] || '').split(',').map(c => c.trim()).filter(c => c);
    
    const modalHtml = `
        <div class="shoot-modal-content" style="border-top: 3px solid ${color}">
            <div class="modal-handle"></div>
            <div class="modal-brand" style="color: ${color}">${shoot['B_IP_Name'] || 'Unknown'}</div>
            <div class="modal-subtitle">${shoot['Shoot Name'] || 'Untitled'} · ${shoot['No Of Shoot'] || 1} ep</div>
            
            <div class="modal-time-pill">
                <span class="time-start" style="color: ${color}">${shoot['From Time']}</span>
                <span class="time-arrow">→</span>
                <span class="time-end">${shoot['To Time']}</span>
                <span class="time-duration">${durationText}</span>
            </div>

            <div class="modal-grid">
                <div class="modal-card">
                    <div class="modal-label">Creator</div>
                    <div class="modal-value">${shoot['Creator'] || 'N/A'}</div>
                </div>
                <div class="modal-card">
                    <div class="modal-label">DOP</div>
                    <div class="modal-value">${shoot['DOP'] || 'N/A'}</div>
                </div>
                <div class="modal-card">
                    <div class="modal-label">Type</div>
                    <div class="modal-value">${shoot['Type'] || 'IP'}</div>
                </div>
                <div class="modal-card">
                    <div class="modal-label">Location</div>
                    <div class="modal-value">${shoot['Location'] || 'N/A'}</div>
                </div>
            </div>

            <div class="modal-label">Cast · ${castList.length} people</div>
            <div class="modal-chips">
                ${castList.map(name => `<span class="modal-chip">${name}</span>`).join('')}
            </div>

            <button class="modal-close-btn" onclick="document.getElementById('shootModal').classList.remove('open')">Close</button>
        </div>
    `;

    document.getElementById('shootModal').innerHTML = modalHtml;
    document.getElementById('shootModal').classList.add('open');
}

/**
 * Duration calculation helper
 */
function getDuration(startTime, endTime) {
    if (!startTime || !endTime) return '—';
    const t2m = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + (minutes || 0);
    };
    const d = t2m(endTime) - t2m(startTime);
    const h = Math.floor(d / 60);
    const m = d % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (liveRefreshInterval) {
        clearInterval(liveRefreshInterval);
    }
});

