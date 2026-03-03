/**
 * tomorrow-shoots.js - Tomorrow's Shoots page logic
 */

import { AUTH } from './auth.js';
import { NAV } from './nav.js';
import { ADMIN_API } from './admin-api.js';

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
    loadPageData();
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

async function loadPageData() {
    try {
        const shoots = await ADMIN_API.getTomorrowShoots();

        if (shoots.length === 0) {
            document.getElementById('shootsList').innerHTML = '<p style="color: #999; text-align: center;">No shoots scheduled for tomorrow</p>';
            document.getElementById('bookingCount').textContent = '0';
            document.getElementById('videoCount').textContent = '0';
            document.getElementById('brandIpTableBody').innerHTML = '<tr><td colspan="3" style="text-align: center; color: #999;">No data</td></tr>';
        } else {
            // Load brand/IP section when shoots exist
            loadBrandIpSection(shoots);
            loadShootsSchedule(shoots);
        }

        // Load all sections - these can run independently
        loadOverviewStats(shoots);
        await loadAttendanceSection();

    } catch (error) {
        console.error('Error loading page data:', error);
        document.getElementById('shootsList').innerHTML = '<p style="color: #e74c3c;">Error loading shoots data</p>';
    }
}

/**
 * Load Overview Stats - Bookings count and total Videos
 */
function loadOverviewStats(shoots) {
    // Active bookings and videos
    const activeShootsCount = shoots.filter(s => s['Final Status'] !== 'Deleted').length;
    const videoCount = shoots.reduce((sum, shoot) => {
        if (shoot['Final Status'] !== 'Deleted') {
            return sum + (Number(shoot['No Of Shoot']) || 0);
        }
        return sum;
    }, 0);

    // Deleted bookings and shoots
    const deletedShoots = shoots.filter(s => s['Final Status'] === 'Deleted');
    const deleteBookingCount = deletedShoots.length;
    const deleteShootsCount = deletedShoots.reduce((sum, shoot) => {
        return sum + (Number(shoot['No Of Shoot']) || 0);
    }, 0);

    // Update UI
    document.getElementById('bookingCount').textContent = activeShootsCount;
    document.getElementById('videoCount').textContent = videoCount;
    document.getElementById('deleteBookingCount').textContent = deleteBookingCount;
    document.getElementById('deleteShootsCount').textContent = deleteShootsCount;

    // Add click handlers for deleted booking card
    const deleteBookingCard = document.getElementById('deleteBookingCard');
    if (deleteBookingCard) {
        deleteBookingCard.addEventListener('click', () => {
            openDeletedBookingsModal(deletedShoots);
        });
    }
}

/**
 * Load Attendance Section - Fetch from Google Apps Script and group by status
 */
async function loadAttendanceSection() {
    const attendanceContent = document.getElementById('attendanceContent');
    
    try {
        // Get Google Apps Script URL from config
        const { getConfig } = await import('./config.js');
        const gasUrl = await getConfig('google_attendance_script_url');
        
        if (!gasUrl) {
            console.error('❌ Google Attendance Script URL not configured');
            attendanceContent.innerHTML = '<p style="color: #e74c3c;">Attendance API not configured</p>';
            return;
        }

        // Get tomorrow's date in format "03 Mar 26"
        const tomorrow = formatDateForApi(getTomorrowDate());
        
        // Fetch attendance data for tomorrow
        const dateAfterTomorrow = new Date();
        dateAfterTomorrow.setDate(dateAfterTomorrow.getDate() + 2);
        const dateAfterStr = formatDateForApi(dateAfterTomorrow);
        
        // Build URL to Google Apps Script directly
        const apiUrl = `${gasUrl}?action=read_all&from=${encodeURIComponent(tomorrow)}&to=${encodeURIComponent(dateAfterStr)}`;
        
        console.log('📤 Fetching attendance from Google Apps Script...');
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.ok || !data.rows || data.rows.length === 0) {
            attendanceContent.innerHTML = '<p style="color: #999; text-align: center;">No attendance data available</p>';
            return;
        }
        
        // Filter attendance records for tomorrow only
        const tomorrowRecords = data.rows.filter(row => row.Date === tomorrow);
        
        if (tomorrowRecords.length === 0) {
            attendanceContent.innerHTML = '<p style="color: #999; text-align: center;">No attendance records for tomorrow</p>';
            return;
        }
        
        // Group by attendance status
        const statusMap = {};
        tomorrowRecords.forEach(record => {
            const status = record.Attendance || 'Unknown';
            if (!statusMap[status]) {
                statusMap[status] = [];
            }
            statusMap[status].push(record.Employee);
        });
        
        // Sort statuses: Present first, then others alphabetically
        const sortedStatuses = Object.keys(statusMap).sort((a, b) => {
            if (a === 'Present') return -1;
            if (b === 'Present') return 1;
            return a.localeCompare(b);
        });
        
        // Create status cards
        const totalEmployees = tomorrowRecords.length;
        let html = `<div class="attendance-status-header" style="margin-bottom: 8px;">
            <p style="font-size: 12px; color: #666; margin: 0;">Total Employees: <strong>${totalEmployees}</strong></p>
        </div>
        <div class="attendance-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px;">`;
        
        sortedStatuses.forEach(status => {
            const count = statusMap[status].length;
            const employees = statusMap[status];
            html += `
            <div class="attendance-status-card" data-status="${status}" style="cursor: pointer; padding: 10px; border: 1px solid #e0e0e0; border-radius: 6px; background: #f9f9f9; transition: all 0.3s ease;">
                <h4 style="margin: 0 0 4px 0; font-size: 13px; color: #333; font-weight: 600;">${status}</h4>
                <p style="margin: 0 0 6px 0; font-size: 20px; font-weight: bold; color: ${getStatusColor(status)};">${count}</p>
                <div class="employee-list" style="display: none; margin-top: 6px; max-height: 250px; overflow-y: auto; border-top: 1px solid #e0e0e0; padding-top: 6px;">
                    <ul style="margin: 0; padding-left: 16px; list-style-type: disc;">
                        ${employees.map(emp => `<li style="padding: 2px 0; font-size: 11px; color: #555;">${emp}</li>`).join('')}
                    </ul>
                </div>
            </div>`;
        });
        
        html += '</div>';
        attendanceContent.innerHTML = html;
        
        // Add click handlers to toggle employee list
        document.querySelectorAll('.attendance-status-card').forEach(card => {
            card.addEventListener('click', function() {
                const employeeList = this.querySelector('.employee-list');
                if (employeeList) {
                    employeeList.style.display = employeeList.style.display === 'none' ? 'block' : 'none';
                    this.style.backgroundColor = employeeList.style.display === 'none' ? '#f9f9f9' : '#f0f8ff';
                }
            });
        });
        
    } catch (error) {
        console.error('❌ Error loading attendance section:', error);
        attendanceContent.innerHTML = '<p style="color: #e74c3c;">Error loading attendance data</p>';
    }
}

/**
 * Helper: Get tomorrow's date object
 */
function getTomorrowDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
}

/**
 * Helper: Format date for API (e.g., "03 Mar 26")
 */
function formatDateForApi(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);
    return `${day} ${month} ${year}`;
}

/**
 * Helper: Get color for attendance status
 */
function getStatusColor(status) {
    const colors = {
        'Present': '#27ae60',
        'Absent': '#e74c3c',
        'First-Half-Leave': '#f39c12',
        'Second-Half-Leave': '#f39c12',
        'Partial-Late': '#3498db',
        'Partial-Early': '#3498db'
    };
    return colors[status] || '#95a5a6';
}

/**
 * Load Brand/IP Section - Group by B_IP_Name and sum No Of Shoot
 */
function loadBrandIpSection(shoots) {
    // Group by B_IP_Name and sum the No Of Shoot
    const brandIpMap = {};
    
    shoots.forEach(shoot => {
        const type = shoot['Type'] || 'Brand';
        const ipName = shoot['B_IP_Name'] || 'Unknown';
        const noOfShoot = Number(shoot['No Of Shoot']) || 0;
        
        if (!brandIpMap[ipName]) {
            brandIpMap[ipName] = {
                type: type,
                name: ipName,
                totalShoots: 0
            };
        }
        
        brandIpMap[ipName].totalShoots += noOfShoot;
    });

    // Convert to array and sort by type (Brand first), then by video count (descending)
    const brandIpData = Object.values(brandIpMap).sort((a, b) => {
        // Sort by type first (Brand before IP)
        if (a.type !== b.type) {
            if (a.type === 'Brand') return -1;
            if (b.type === 'Brand') return 1;
        }
        // Then sort by total shoots descending (more videos first)
        return b.totalShoots - a.totalShoots;
    });

    // Render table
    const tableBody = document.getElementById('brandIpTableBody');
    if (brandIpData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #999;">No brand/IP data</td></tr>';
    } else {
        tableBody.innerHTML = brandIpData.map(item => `
            <tr>
                <td><span class="type-badge type-${item.type.toLowerCase()}">${item.type}</span></td>
                <td>${item.name}</td>
                <td class="number">${item.totalShoots}</td>
            </tr>
        `).join('');
    }
}

/**
 * Load Tomorrow's Shoots Schedule - Timeline with API data
 */
function loadShootsSchedule(shoots) {
    const shootsList = document.getElementById('shootsList');
    
    if (shoots.length === 0) {
        shootsList.innerHTML = '<p style="text-align: center; color: #999;">No shoots scheduled</p>';
        return;
    }

    const HOUR_HEIGHT = 80;
    const START_HOUR = 8;
    const END_HOUR = 22;
    const GAP = 2;

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
    const t2m = (timeStr) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + (minutes || 0);
    };

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

    // Auto-scroll to first event
    setTimeout(() => {
        const firstStart = t2m(sortedShoots[0]['From Time']);
        const scrollPos = Math.max(0, m2px(firstStart) - 60);
        shootsList.scrollTop = scrollPos;
    }, 100);
}

/**
 * Open modal with shoot details
 */
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

/**
 * Open deleted bookings modal
 */
function openDeletedBookingsModal(deletedShoots) {
    // Create modal if it doesn't exist
    if (!document.getElementById('deletedBookingsModal')) {
        const modal = document.createElement('div');
        modal.id = 'deletedBookingsModal';
        modal.className = 'deleted-bookings-overlay';
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });
        document.body.appendChild(modal);
    }

    if (deletedShoots.length === 0) {
        document.getElementById('deletedBookingsModal').innerHTML = `
            <div class="deleted-bookings-modal">
                <div class="modal-handle"></div>
                <h3 class="modal-title">Deleted Bookings</h3>
                <p style="text-align: center; color: var(--text-muted); padding: 20px;">No deleted bookings found</p>
                <button class="modal-close-btn" onclick="document.getElementById('deletedBookingsModal').classList.remove('open')">Close</button>
            </div>
        `;
    } else {
        const cardsHtml = deletedShoots.map(shoot => `
            <div class="deleted-booking-card">
                <div class="card-field">
                    <span class="field-label">Booking ID</span>
                    <span class="field-value">${shoot['Booking ID'] || 'N/A'}</span>
                </div>
                <div class="card-field">
                    <span class="field-label">Shoot Name</span>
                    <span class="field-value">${shoot['Shoot Name'] || 'N/A'}</span>
                </div>
                <div class="card-field">
                    <span class="field-label">Brand / IP</span>
                    <span class="field-value">${shoot['B_IP_Name'] || 'N/A'}</span>
                </div>
                <div class="card-field">
                    <span class="field-label">Shoot Lead</span>
                    <span class="field-value">${shoot['Creator'] || 'N/A'}</span>
                </div>
                <div class="card-field">
                    <span class="field-label">Delete Reason</span>
                    <span class="field-value">${shoot['Delete Reason'] || 'N/A'}</span>
                </div>
            </div>
        `).join('');

        document.getElementById('deletedBookingsModal').innerHTML = `
            <div class="deleted-bookings-modal">
                <div class="modal-handle"></div>
                <h3 class="modal-title">Deleted Bookings (${deletedShoots.length})</h3>
                <div class="deleted-bookings-container">
                    ${cardsHtml}
                </div>
                <button class="modal-close-btn" onclick="document.getElementById('deletedBookingsModal').classList.remove('open')">Close</button>
            </div>
        `;
    }

    document.getElementById('deletedBookingsModal').classList.add('open');
}

