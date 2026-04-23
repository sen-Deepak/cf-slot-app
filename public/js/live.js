/**
 * live.js - Live page with Today / Tomorrow / Day After tabs
 */

import { AUTH } from './auth.js';
import { NAV } from './nav.js';
import { ADMIN_API } from './admin-api.js';

let liveRefreshInterval = null;
const tabData = { today: [], tomorrow: [], dayafter: [] };
let activeTab = 'today';

document.addEventListener('DOMContentLoaded', () => {
    if (!AUTH.isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }
    if (!NAV.isCurrentPageAccessible()) {
        window.location.href = '/booking.html';
        return;
    }

    initializePage();
    initDayTabs();
    initSearch();
    loadAllTabs();

    // Refresh today's data every 30 seconds
    liveRefreshInterval = setInterval(() => {
        if (activeTab === 'today') loadTabData('today');
    }, 30000);
});

function initializePage() {
    document.getElementById('logoutBtn').addEventListener('click', () => {
        AUTH.logout();
        window.location.href = '/login.html';
    });

    const user = AUTH.getCurrentUser();
    if (user && user.name) {
        const firstName = user.name.split(' ')[0];
        const el = document.getElementById('userNameDisplay');
        if (el) el.textContent = 'Hi ' + firstName;
    }
}

function initDayTabs() {
    document.querySelectorAll('.day-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (tab === activeTab) return;
            switchTab(tab);
        });
    });
}

function switchTab(tab) {
    document.querySelectorAll('.day-tab-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === tab)
    );
    document.querySelectorAll('.day-tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`panel-${tab}`).style.display = '';
    activeTab = tab;

    // Clear search on tab switch
    const input = document.getElementById('scheduleSearch');
    const clearBtn = document.getElementById('searchClearBtn');
    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    hideDropdown();
    clearSearch();
}

async function loadAllTabs() {
    await Promise.all([
        loadTabData('today'),
        loadTabData('tomorrow'),
        loadTabData('dayafter'),
    ]);
}

async function loadTabData(tab) {
    const containerIds = {
        today: 'shootsListToday',
        tomorrow: 'shootsListTomorrow',
        dayafter: 'shootsListDayafter',
    };
    const emptyMessages = {
        today: 'No shoots scheduled for today',
        tomorrow: 'No shoots scheduled for tomorrow',
        dayafter: 'No shoots scheduled for the day after tomorrow',
    };
    const container = document.getElementById(containerIds[tab]);

    try {
        let shoots;
        if (tab === 'today') {
            shoots = await ADMIN_API.getTodaysShoots();
        } else if (tab === 'tomorrow') {
            shoots = await ADMIN_API.getTomorrowShoots();
        } else {
            const d = new Date();
            d.setDate(d.getDate() + 2);
            shoots = await ADMIN_API.getShootsByDate(ADMIN_API._dateToISO(d));
        }

        tabData[tab] = shoots;

        if (shoots.length === 0) {
            container.innerHTML = `<p style="text-align:center;color:#999;padding:2rem 0;">${emptyMessages[tab]}</p>`;
            return;
        }

        loadShootsSchedule(shoots, container, tab === 'today');
    } catch (error) {
        console.error(`Error loading ${tab} shoots:`, error);
        container.innerHTML = '<p style="color:#e74c3c;text-align:center;padding:2rem 0;">Error loading schedule data</p>';
    }
}

function loadShootsSchedule(shoots, container, showCurrentTimeLine) {
    if (shoots.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;">No shoots scheduled</p>';
        return;
    }

    const HOUR_HEIGHT = 80;
    const END_HOUR = 22;
    const GAP = 2;

    const t2m = (timeStr) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + (minutes || 0);
    };

    // Dynamic start hour: min of 10am or earliest shoot
    let earliestMinutes = 10 * 60;
    shoots.forEach(shoot => {
        if (shoot['From Time']) {
            const min = t2m(shoot['From Time']);
            if (Math.floor(min / 60) < 10) earliestMinutes = Math.min(earliestMinutes, min);
        }
    });
    const START_HOUR = Math.floor(earliestMinutes / 60);

    const COLOR_PALETTE = [
        '#080708', '#381f6e', '#36b37e', '#ff2fc8', '#e8c84a',
        '#755bd4', '#5f7118', '#b04ed6', '#4f8ef7', '#17db3b',
    ];
    const getColor = (brandName) => {
        if (!brandName) return COLOR_PALETTE[0];
        let hash = 0;
        for (let i = 0; i < brandName.length; i++) {
            hash = ((hash << 5) - hash) + brandName.charCodeAt(i);
            hash = hash & hash;
        }
        return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
    };

    const m2px = (minutes) => ((minutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const getDur = (s, e) => {
        const d = t2m(e) - t2m(s);
        const h = Math.floor(d / 60), m = d % 60;
        return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
    };

    const totalHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT + 20;

    container.innerHTML = `
        <div class="timeline-wrapper" style="height:${totalHeight}px;">
            <div class="timeline-labels"></div>
            <div class="timeline-grid"></div>
            <div class="timeline-events"></div>
        </div>
    `;

    const labelsEl = container.querySelector('.timeline-labels');
    const gridEl = container.querySelector('.timeline-grid');
    const eventsEl = container.querySelector('.timeline-events');

    // Time labels and grid lines
    for (let h = START_HOUR; h <= END_HOUR; h++) {
        for (let half = 0; half < 2; half++) {
            const min = h * 60 + half * 30;
            if (min > END_HOUR * 60) break;
            const y = m2px(min);

            const gridLine = document.createElement('div');
            gridLine.className = `gridline ${half === 0 ? 'gridline-hour' : 'gridline-half'}`;
            gridLine.style.top = y + 'px';
            gridEl.appendChild(gridLine);

            const label = document.createElement('div');
            label.className = `time-label ${half === 0 ? 'time-label-hour' : 'time-label-half'}`;
            label.style.top = y + 'px';
            if (half === 0) {
                const dh = h === 0 || h === 24 ? 12 : (h > 12 ? h - 12 : h);
                const ap = h < 12 ? 'AM' : 'PM';
                label.textContent = h === 12 ? '12 PM' : (h === 0 ? '12 AM' : `${dh} ${ap}`);
            } else {
                const dh = h > 12 ? h - 12 : (h === 0 ? 12 : h);
                label.textContent = `${dh}:30`;
            }
            labelsEl.appendChild(label);
        }
    }

    // Sort and layout columns
    const sorted = [...shoots].sort((a, b) =>
        (a['_from_minutes'] || t2m(a['From Time'])) - (b['_from_minutes'] || t2m(b['From Time']))
    );

    const cols = [];
    sorted.forEach(shoot => {
        const s = t2m(shoot['From Time']);
        let placed = false;
        for (let ci = 0; ci < cols.length; ci++) {
            if (t2m(cols[ci][cols[ci].length - 1]['To Time']) <= s) {
                cols[ci].push(shoot);
                shoot._col = ci;
                placed = true;
                break;
            }
        }
        if (!placed) { shoot._col = cols.length; cols.push([shoot]); }
    });

    sorted.forEach(shoot => {
        const s = t2m(shoot['From Time']);
        const e = t2m(shoot['To Time']);
        let maxCol = shoot._col;
        sorted.forEach(other => {
            const os = t2m(other['From Time']), oe = t2m(other['To Time']);
            if (os < e && oe > s) maxCol = Math.max(maxCol, other._col);
        });
        shoot._totalCols = maxCol + 1;
    });

    // Render event blocks
    sorted.forEach(shoot => {
        const startMin = t2m(shoot['From Time']);
        const endMin = t2m(shoot['To Time']);
        const top = m2px(startMin);
        const height = Math.max(m2px(endMin) - m2px(startMin) - GAP, 20);
        const color = getColor(shoot['B_IP_Name'] || shoot['Brand']);
        const leftPct = shoot._col * (100 / shoot._totalCols) + 0.3;
        const widthPct = (100 / shoot._totalCols) - 0.6;
        const tiny = height < 28;
        const small = height < 48;

        let content = `<div class="event-stripe" style="background:${color}"></div><div class="event-inner">`;
        content += `<div class="event-brand" style="color:${color}">${shoot['B_IP_Name'] || 'Unknown'}</div>`;
        if (!tiny) {
            if (!small) {
                const creator = shoot['Creator'] ? shoot['Creator'].split(' ')[0] : 'N/A';
                content += `<div class="event-creator">👤 ${creator}</div>`;
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
        if (shoot['Final Status'] === 'Deleted') block.classList.add('deleted');

        const searchNames = [];
        if (shoot['Creator']) searchNames.push(...shoot['Creator'].split(',').map(s => s.trim()).filter(Boolean));
        if (shoot['DOP']) searchNames.push(...shoot['DOP'].split(',').map(s => s.trim()).filter(Boolean));
        if (shoot['Cast']) searchNames.push(...shoot['Cast'].split(',').map(s => s.trim()).filter(Boolean));
        if (shoot['B_IP_Name']) searchNames.push(shoot['B_IP_Name'].trim());
        if (shoot['Shoot Name']) searchNames.push(shoot['Shoot Name'].trim());
        block.dataset.searchNames = JSON.stringify(searchNames);

        block.style.cssText = `top:${top}px;height:${height}px;left:${leftPct}%;width:calc(${widthPct}% - 4px);background:${color}14;border-color:${color}33;`;
        block.innerHTML = content;
        block.addEventListener('click', () => openShootModal(shoot, color));
        eventsEl.appendChild(block);
    });

    // Current time line (today only)
    if (showCurrentTimeLine) {
        const now = new Date();
        const ch = now.getHours(), cm = now.getMinutes();
        const ctm = ch * 60 + cm;
        if (ctm >= START_HOUR * 60 && ctm <= END_HOUR * 60) {
            const line = document.createElement('div');
            line.className = 'current-time-line';
            line.style.top = m2px(ctm) + 'px';
            const lbl = document.createElement('div');
            lbl.className = 'current-time-label';
            const dh = ch > 12 ? ch - 12 : (ch === 0 ? 12 : ch);
            lbl.textContent = `NOW ${dh}:${String(cm).padStart(2, '0')} ${ch >= 12 ? 'PM' : 'AM'}`;
            line.appendChild(lbl);
            eventsEl.appendChild(line);
        }
    }
}

// ── Search ────────────────────────────────────────────────────────────────────

function initSearch() {
    const input = document.getElementById('scheduleSearch');
    const dropdown = document.getElementById('searchDropdown');
    const clearBtn = document.getElementById('searchClearBtn');
    if (!input) return;

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.style.display = q ? '' : 'none';
        if (!q) { hideDropdown(); clearSearch(); return; }
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
            if (active) selectName(active.dataset.name);
        } else if (e.key === 'Escape') {
            hideDropdown(); clearSearch(); input.value = ''; clearBtn.style.display = 'none';
        }
    });

    clearBtn.addEventListener('click', () => {
        input.value = ''; clearBtn.style.display = 'none'; hideDropdown(); clearSearch(); input.focus();
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar-wrapper')) hideDropdown();
    });
}

function collectAllNames() {
    const seen = new Set();
    const entries = [];
    const add = (name, role) => {
        if (!name) return;
        const n = name.trim();
        if (!n || seen.has(n.toLowerCase())) return;
        seen.add(n.toLowerCase());
        entries.push({ name: n, role });
    };
    (tabData[activeTab] || []).forEach(shoot => {
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
    const matches = collectAllNames().filter(e => e.name.toLowerCase().includes(q));
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
        li.addEventListener('touchstart', (ev) => { ev.preventDefault(); selectName(li.dataset.name); }, { passive: false });
        li.addEventListener('mousedown', (ev) => { ev.preventDefault(); selectName(li.dataset.name); });
    });
    dropdown.style.display = '';
}

function hideDropdown() {
    const el = document.getElementById('searchDropdown');
    if (el) el.style.display = 'none';
}

function selectName(name) {
    const input = document.getElementById('scheduleSearch');
    if (input) input.value = name;
    hideDropdown();
    applySearch(name);
}

function applySearch(name) {
    const panel = document.getElementById(`panel-${activeTab}`);
    if (!panel || !name) { clearSearch(); return; }
    const nameLower = name.toLowerCase();
    panel.querySelectorAll('.event-block').forEach(block => {
        const names = JSON.parse(block.dataset.searchNames || '[]');
        const matched = names.some(n => n.toLowerCase() === nameLower);
        block.classList.toggle('search-highlight', matched);
        block.classList.toggle('search-dim', !matched);
        if (matched) {
            const stripe = block.querySelector('.event-stripe');
            if (stripe) block.style.setProperty('--search-glow', stripe.style.background || '#ffe066');
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
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function openShootModal(shoot, color) {
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

    document.getElementById('shootModal').innerHTML = `
        <div class="shoot-modal-content" style="border-top:3px solid ${color}">
            <div class="modal-handle"></div>
            <div class="modal-brand" style="color:${color}">${shoot['B_IP_Name'] || 'Unknown'}</div>
            <div class="modal-subtitle">${shoot['Shoot Name'] || 'Untitled'} · ${shoot['No Of Shoot'] || 1} ep</div>
            <div class="modal-time-pill">
                <span class="time-start" style="color:${color}">${shoot['From Time']}</span>
                <span class="time-arrow">→</span>
                <span class="time-end">${shoot['To Time']}</span>
                <span class="time-duration">${durationText}</span>
            </div>
            <div class="modal-grid">
                <div class="modal-card"><div class="modal-label">Creator</div><div class="modal-value">${shoot['Creator'] || 'N/A'}</div></div>
                <div class="modal-card"><div class="modal-label">DOP</div><div class="modal-value">${shoot['DOP'] || 'N/A'}</div></div>
                <div class="modal-card"><div class="modal-label">Type</div><div class="modal-value">${shoot['Type'] || 'IP'}</div></div>
                <div class="modal-card"><div class="modal-label">Location</div><div class="modal-value">${shoot['Location'] || 'N/A'}</div></div>
            </div>
            <div class="modal-label">Cast · ${castList.length} people</div>
            <div class="modal-chips">${castList.map(n => `<span class="modal-chip">${n}</span>`).join('')}</div>
            <button class="modal-close-btn" onclick="document.getElementById('shootModal').classList.remove('open')">Close</button>
        </div>
    `;
    document.getElementById('shootModal').classList.add('open');
}

function getDuration(startTime, endTime) {
    if (!startTime || !endTime) return '—';
    const t2m = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    const d = t2m(endTime) - t2m(startTime);
    const h = Math.floor(d / 60), m = d % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

window.addEventListener('beforeunload', () => {
    if (liveRefreshInterval) clearInterval(liveRefreshInterval);
});
