/**
 * employees.js - Employees page logic
 * Displays employee bookings grouped by Employee -> Time
 * with date filtering (Yesterday, Today, Tomorrow)
 */

import { fetchWithTimeout } from './fetch-util.js';
import { AUTH } from './auth.js';
import { UI } from './ui.js';

let employeesState = {
  allData: [],
  filteredData: [],
  currentDateFilter: 'today' // yesterday, today, or tomorrow
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!AUTH.isAuthenticated()) return;
  
  initializePage();
  await loadEmployeesData();
});

function initializePage() {
  // Setup logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      AUTH.logout();
      window.location.href = '/login.html';
    });
  }

  // Display username in header
  const user = AUTH.getCurrentUser();
  if (user && user.name) {
    const firstName = user.name.split(' ')[0];
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userNameDisplay) {
      userNameDisplay.textContent = 'hii ' + firstName;
    }
  }

  // Setup date filter buttons
  const dateFilterBtns = document.querySelectorAll('.date-filter-btn');
  dateFilterBtns.forEach(btn => {
    btn.addEventListener('click', handleDateFilterClick);
  });

  // Set today as default active button
  const todayBtn = document.getElementById('todayBtn');
  if (todayBtn) {
    todayBtn.classList.add('active');
  }

  // Setup popup close listeners
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEmployeePopup();
    }
  });
}

function handleDateFilterClick(event) {
  const selectedDate = event.target.getAttribute('data-date');
  
  // Update button states
  const dateFilterBtns = document.querySelectorAll('.date-filter-btn');
  dateFilterBtns.forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  // Update filter and display
  employeesState.currentDateFilter = selectedDate;
  filterAndDisplayData();
}

async function loadEmployeesData() {
  const container = document.getElementById('employeesContainer');
  const loadingSpinner = document.getElementById('employeesLoading');
  const errorDiv = document.getElementById('employeesError');

  try {
    UI.showError(errorDiv, '');
    UI.setLoading(loadingSpinner, true);

    // Fetch from server proxy endpoint (secure, no CORS issues)
    console.log('🔍 Fetching employees data from server proxy...');

    const response = await fetchWithTimeout('/api/employees', { method: 'GET' });

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();
    console.log('✓ API Response received:', data);

    // Normalize response - API returns { ok, data: [...] } format
    let rows = [];
    if (Array.isArray(data)) {
      // Old format: direct array
      rows = data;
    } else {
      if (!data || data.ok !== true) {
        throw new Error(data?.error || 'API returned ok=false');
      }
      // Try multiple possible response formats
      rows = Array.isArray(data.data) ? data.data : (Array.isArray(data.rows) ? data.rows : []);
    }

    if (rows.length === 0) {
      console.warn('⚠️ No employees data found');
      if (container) {
        container.innerHTML = '<p class="placeholder-text">No employee data available</p>';
      }
      UI.showToast('No employee data available', 'info', 2000);
      return;
    }

    console.log('📊 Number of records:', rows.length);
    employeesState.allData = rows;
    
    // Filter and display based on current date filter (today by default)
    filterAndDisplayData();
    UI.showToast(`Loaded ${rows.length} record(s)`, 'success', 2000);

  } catch (error) {
    console.error('❌ Error loading employees data:', error);
    UI.showError(errorDiv, 'Failed to load employee data: ' + error.message);
    if (container) {
      container.innerHTML = '<p class="placeholder-text">Error loading employee data. Please check console.</p>';
    }
  } finally {
    UI.setLoading(loadingSpinner, false);
  }
}

function filterAndDisplayData() {
  const container = document.getElementById('employeesContainer');
  if (!container) return;

  // Get the target date based on filter
  const targetDate = getDateForFilter(employeesState.currentDateFilter);
  
  // Filter data for the selected date
  const filtered = employeesState.allData.filter(row => {
    const rowDate = row['Date'] ?? row['Booking Date'] ?? '';
    return isSameDate(rowDate, targetDate);
  });

  employeesState.filteredData = filtered;

  if (filtered.length === 0) {
    container.innerHTML = `<p class="placeholder-text">No bookings for ${employeesState.currentDateFilter}</p>`;
    return;
  }

  // Aggregate employee data (simple cards view)
  const employeeData = aggregateEmployeeData(filtered);
  displayEmployeeCards(employeeData, container);
}

/**
 * Get target date string in "DD MMM YY" format
 */
function getDateForFilter(filterType) {
  const today = new Date();
  let targetDate;

  if (filterType === 'yesterday') {
    targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() - 1);
  } else if (filterType === 'tomorrow') {
    targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + 1);
  } else {
    targetDate = today; // today
  }

  return formatDateForComparison(targetDate);
}

/**
 * Format date to "DD MMM YY" for comparison
 */
function formatDateForComparison(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

/**
 * Check if two date strings represent the same date
 */
function isSameDate(dateStr1, dateStr2) {
  try {
    const str1 = String(dateStr1 ?? '').trim().toUpperCase();
    const str2 = String(dateStr2 ?? '').trim().toUpperCase();
    return str1 === str2;
  } catch (e) {
    return false;
  }
}

/**
 * Get shortened display text for attendance status
 */
function getShortAttendanceText(status) {
  const statusMap = {
    'Present': 'Present',
    'Absent': 'Absent',
    'First Half-Day Leave': '1st Half',
    'Second Half-Day Leave': '2nd Half',
    'Partial Day – Late Arrival': 'Partial Late',
    'Partial Day – Leave Early': 'Partial Early'
  };
  
  return statusMap[String(status).trim()] || status;
}

/**
 * Get expected working hours based on attendance status
 */
function getExpectedHours(attendance) {
  const status = String(attendance).trim();
  
  const expectedMap = {
    'Present': 8,
    'Absent': 0,
    'First Half-Day Leave': 4.5,
    'Second Half-Day Leave': 4.5,
    'Partial Day – Late Arrival': 7,
    'Partial Day – Leave Early': 7
  };
  
  return expectedMap[status] || 0;
}

/**
 * Calculate percentage of hours worked vs expected
 */
function calculatePercentage(totalMinutes, expectedHours) {
  if (expectedHours === 0) return 0;
  const actualHours = totalMinutes / 60;
  return Math.round((actualHours / expectedHours) * 100);
}

/**
 * Aggregate employee data - calculate total time and attendance per employee
 */
function aggregateEmployeeData(rows) {
  const employees = {};

  rows.forEach(row => {
    const employeeName = row['Employee'] ?? row['Name'] ?? '-';
    const attendance = row['Attendace'] ?? row['Attendance'] ?? '-'; // Note: API has typo "Attendace"
    const timeStr = row['Time'] ?? ''; // Already formatted as "HH:MM" or duration
    const finalStatus = row['Final Status'] ?? row['Status'] ?? '';

    if (!employees[employeeName]) {
      employees[employeeName] = {
        name: employeeName,
        attendance: attendance,
        totalMinutes: 0,
        count: 0,
        rows: []
      };
    }

    // Add time if available AND entry is not deleted
    if (timeStr && timeStr !== '-' && timeStr !== '' && finalStatus !== 'Deleted') {
      const minutes = parseTimeDuration(timeStr);
      employees[employeeName].totalMinutes += minutes;
    }

    employees[employeeName].count++;
    employees[employeeName].rows.push(row);
  });

  // Calculate percentage for each employee based on attendance status
  Object.values(employees).forEach(emp => {
    const expectedHours = getExpectedHours(emp.attendance);
    emp.percentage = calculatePercentage(emp.totalMinutes, expectedHours);
    emp.expectedHours = expectedHours;
  });

  // Convert to array and sort by total time (descending - highest first)
  const result = Object.values(employees).sort((a, b) => b.totalMinutes - a.totalMinutes);

  return result;
}

/**
 * Parse time duration like "00:30" or "2:00" to minutes
 */
function parseTimeDuration(timeStr) {
  if (!timeStr || timeStr === '-') return 0;
  
  const parts = String(timeStr).trim().split(':');
  if (parts.length !== 2) return 0;

  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  return hours * 60 + minutes;
}

/**
 * Format minutes to "Xh Ym" or just "Xm"
 */
function formatDuration(totalMinutes) {
  if (totalMinutes === 0) return '-';
  
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${mins}m`;
  }
}

/**
 * Parse times like "4:00 pm" into minutes since midnight
 */
function parseTimeToMinutes(t) {
  if (!t) return 999999;
  const s = String(t).trim().toLowerCase();

  // Try 12-hour format first: "4 pm" or "4:00 pm"
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m) {
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2] || '0', 10);
    const ap = m[3];

    if (ap === 'pm' && hh !== 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;

    return hh * 60 + mm;
  }

  return 999999;
}

/**
 * Get color based on percentage (red at 0%, green at 100%)
 */
function getPercentageColor(percentage) {
  // Clamp percentage between 0 and 100
  const p = Math.max(0, Math.min(100, percentage));
  
  // Convert percentage to hue: 0% = 0° (red), 100% = 120° (green)
  const hue = (p * 1.2); // 0 to 120 degrees
  
  // Return HSL color
  return `hsl(${hue}, 85%, 45%)`;
}

/**
 * Display employee cards in horizontal layout
 */
function displayEmployeeCards(employeeData, container) {
  try {
    let html = '<div class="employees-cards-list">';

    employeeData.forEach((emp, index) => {
      const seqNumber = index + 1;
      const totalTime = formatDuration(emp.totalMinutes);
      const attendanceStatus = emp.attendance || '-';
      const displayStatus = getShortAttendanceText(attendanceStatus);
      const percentage = emp.percentage || 0;
      const percentageColor = getPercentageColor(percentage);
      const attendanceClass = attendanceStatus === 'Present' ? 'attendance-present' : 'attendance-absent';

      html += `
        <div class="employee-card-item">
          <div class="card-seq-number">${seqNumber}</div>
          <div class="card-employee-name">${escapeHtml(emp.name)}</div>
          <div class="card-percentage" style="background-color: ${percentageColor}; color: white;">${percentage}%</div>
          <div class="card-total-time">${escapeHtml(totalTime)}</div>
          <div class="card-attendance ${attendanceClass}">${escapeHtml(displayStatus)}</div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
    console.log('✓ Employee cards displayed successfully');

    // Add click listeners to employee cards
    const employeeCards = container.querySelectorAll('.employee-card-item');
    employeeCards.forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const nameElement = card.querySelector('.card-employee-name');
        const employeeName = nameElement ? nameElement.textContent : '-';
        openEmployeePopup(employeeName);
      });
    });

  } catch (error) {
    console.error('Error displaying employee cards:', error);
    container.innerHTML = '<p style="color: #d32f2f;">Error displaying employee data</p>';
  }
}

/**
 * Generate link icons for doc links
 */
function generateLinkIcons(docLink) {
  try {
    if (!docLink || docLink === '-' || docLink === '') return '';
    
    const linkStr = String(docLink).trim();
    if (!linkStr) return '';
    
    // Split by comma
    const links = linkStr.split(',').map(l => l.trim()).filter(l => l && l !== '-');
    
    if (links.length === 0) return '';
    
    console.log('📎 Generating icons for links:', links);
    
    return links.map(url => {
      const iconInfo = getLinkIconInfo(url);
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="doc-link-icon doc-link-icon--${iconInfo.type}" title="${iconInfo.type}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">${iconInfo.svg}</svg></a>`;
    }).join('');
  } catch (e) {
    console.error('Error generating link icons:', e);
    return '';
  }
}

/**
 * Detect link type and return icon SVG
 */
function getLinkIconInfo(url) {
  const urlLower = String(url).toLowerCase();
  
  if (urlLower.includes('docs.google.com/spreadsheets')) {
    return {
      type: 'sheets',
      svg: '<path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm15 2h-4v3h4zm0 4h-4v3h4zm0 4h-4v3h3a1 1 0 0 0 1-1zm-5 3v-3H6v3zm-5 0v-3H1v2a1 1 0 0 0 1 1zm-4-4h4V8H1zm0-4h4V4H1zm5-3v3h4V4zm4 4H6v3h4z"/>'
    };
  }
  
  if (urlLower.includes('docs.google.com/document')) {
    return {
      type: 'docs',
      svg: '<path fill-rule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2v-1a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5z"/>'
    };
  }

  if (urlLower.includes('docs.google.com/presentation')) {
    return {
      type: 'slides',
      svg: '<path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>'
    };
  }

  return {
    type: 'link',
    svg: '<path fill-rule="evenodd" d="M8.636 3.5a.5.5 0 0 0-.5-.5H1.5A1.5 1.5 0 0 0 0 4.5v10A1.5 1.5 0 0 0 1.5 16h10a1.5 1.5 0 0 0 1.5-1.5V7.364a.5.5 0 0 0-1 0v7.136A.5.5 0 0 1 11.5 15h-10a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5h6.636a.5.5 0 0 0 .5-.5z"/>'
  };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Open employee details popup
 */
function openEmployeePopup(employeeName) {
  const modal = document.getElementById('employeePopupModal');
  if (!modal) return;

  // Update header
  const popupEmployeeName = document.getElementById('popupEmployeeName');
  if (popupEmployeeName) {
    popupEmployeeName.textContent = employeeName;
  }

  // Get employee data
  const employee = employeesState.filteredData.filter(row => 
    (row['Employee'] ?? row['Name'] ?? '-') === employeeName
  );

  // Store employee data in state
  employeesState.currentPopupData = employee;

  // Display all data
  displayPopupDetails(employee);

  // Setup close listeners
  setupPopupTaskTabs();

  // Show modal
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/**
 * Close employee details popup
 */
function closeEmployeePopup() {
  const modal = document.getElementById('employeePopupModal');
  if (!modal) return;

  modal.classList.add('hidden');
  document.body.style.overflow = 'auto';
}

/**
 * Setup task tab event listeners in popup
 */
function setupPopupTaskTabs() {
  // Close popup when clicking overlay
  const overlay = document.querySelector('.popup-overlay');
  if (overlay) {
    overlay.removeEventListener('click', closeEmployeePopup);
    overlay.addEventListener('click', closeEmployeePopup);
  }

  // Close popup when clicking close button
  const closeBtn = document.querySelector('.popup-close-btn');
  if (closeBtn) {
    closeBtn.removeEventListener('click', closeEmployeePopup);
    closeBtn.addEventListener('click', closeEmployeePopup);
  }
}

/**
 * Display employee details in popup
 */
function displayPopupDetails(employeeData) {
  const tasksCount = {};
  const brandCounts = {};
  let shootCount = 0;

  // Count task types, brands, and videos (excluding DELETED entries from counts)
  employeeData.forEach(row => {
    const taskType = row['Task type'] ?? row['Type'] ?? '-';
    const brand = row['B_IP_Name'] ?? row['Brand'] ?? '-';
    const noOfShoot = parseInt(row['No Of Shoot'] ?? 0) || 0;
    const finalStatus = row['Final Status'] ?? row['Status'] ?? '';

    // Skip deleted entries for counting
    if (finalStatus === 'Deleted') {
      return;
    }

    tasksCount[taskType] = (tasksCount[taskType] || 0) + 1;
    brandCounts[brand] = (brandCounts[brand] || 0) + 1;

    // Only count video/shoot count if NOT deleted
    if (taskType === 'Shoot') {
      shootCount += noOfShoot;
    }
  });

  // Display summary table at top
  const shootSummary = document.getElementById('popupShootSummary');
  if (shootSummary) {
    // Count only non-deleted entries
    const totalNonDeleted = employeeData.filter(row => 
      (row['Final Status'] ?? row['Status'] ?? '') !== 'Deleted'
    ).length;
    const shootTypeCount = tasksCount['Shoot'] || 0;
    const preProCount = tasksCount['Pre-Production'] || 0;
    const postProCount = tasksCount['Post-Production'] || 0;

    let summaryHtml = `
      <div class="shoot-summary-grid">
        <div class="summary-item">
          <div class="summary-label">Total</div>
          <div class="summary-value">${totalNonDeleted}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Shoot</div>
          <div class="summary-value">${shootTypeCount}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Pre-Prod</div>
          <div class="summary-value">${preProCount}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">Post-Prod</div>
          <div class="summary-value">${postProCount}</div>
        </div>
      </div>
      <div class="video-count">
        <strong>Video Count:</strong> ${shootCount}
      </div>
      <div class="brand-breakdown">
        <strong>Brand/IP Breakdown:</strong>
        <div class="brand-list">
          ${Object.entries(brandCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([brand, count]) => `<span class="brand-tag">${escapeHtml(brand)} <strong>${count}</strong></span>`)
            .join('')}
        </div>
      </div>
    `;
    shootSummary.innerHTML = summaryHtml;
  }

  // Display all entry cards (including deleted, for visibility)
  const detailsContainer = document.getElementById('popupDetailsContainer');
  if (!detailsContainer) return;

  let html = '';
  if (employeeData.length === 0) {
    html = '<p class="placeholder-text" style="text-align: center; padding: 1rem;">No entries found</p>';
  } else {
    employeeData.forEach((entry, idx) => {
      console.log(`Entry ${idx}:`, entry);
      
      const type = entry['Type'] ?? '-';
      const brand = entry['B_IP_Name'] ?? entry['Brand'] ?? entry['Project'] ?? '-';
      const noOfShoot = entry['No Of Shoot'] ?? entry['Shoot Number'] ?? entry['No of Shoot'] ?? '-';
      const timeStr = entry['Time'] ?? '-';
      const totalTime = formatDuration(parseTimeDuration(timeStr));
      const remark1 = entry['Remark 1'] ?? entry['Remark1'] ?? '';
      const remark2 = entry['Remark 2'] ?? entry['Remark2'] ?? '';
      const docLink = entry['Doc Link'] ?? entry['DocLink'] ?? entry['Links'] ?? '';
      const taskType = entry['Task type'] ?? entry['TaskType'] ?? entry['Type'] ?? '-';
      const finalStatus = entry['Final Status'] ?? entry['Status'] ?? '';
      const deleteReason = entry['Delete Reason'] ?? entry['DeleteReason'] ?? '';
      
      // Check if entry is deleted
      const isDeleted = finalStatus === 'Deleted';
      
      // Show remarks and links for Post-Production and Pre-Production (only if not deleted)
      const showRemarks = !isDeleted && (taskType === 'Post-Production' || taskType === 'Pre-Production');
      
      console.log(`  Type: "${type}", TaskType: "${taskType}", ShowRemarks: ${showRemarks}, IsDeleted: ${isDeleted}`);
      console.log(`  Brand: "${brand}", NoOfShoot: "${noOfShoot}", Time: "${timeStr}"`);
      console.log(`  Remark1: "${remark1}", Remark2: "${remark2}", DeleteReason: "${deleteReason}"`);
      console.log(`  DocLink: "${docLink}"`);
      
      html += `
        <div class="popup-entry-card ${isDeleted ? 'entry-deleted' : ''}">
          <div class="entry-main">
            <div class="entry-header">
              <span class="entry-type-badge ${type.toLowerCase()}">${escapeHtml(type)}</span>
              <span class="entry-brand">${escapeHtml(brand)}</span>
            </div>
            <div class="entry-details-grid">
              <div class="entry-detail-item">
                <span class="entry-detail-label">Shoot #</span>
                <span class="entry-detail-value">${escapeHtml(String(noOfShoot))}</span>
              </div>
              <div class="entry-detail-item">
                <span class="entry-detail-label">Time</span>
                <span class="entry-detail-value">${escapeHtml(totalTime)}</span>
              </div>
            </div>
          </div>
          ${isDeleted ? `
            <div class="entry-deleted-notice">
              <div class="deleted-label">DELETED</div>
              ${deleteReason ? `<div class="remark"><span class="remark-label">Delete Reason:</span> ${escapeHtml(deleteReason)}</div>` : ''}
            </div>
          ` : ''}
          ${showRemarks ? `
            <div class="entry-remarks">
              ${remark1 ? `<div class="remark"><span class="remark-label">Remark 1:</span> ${escapeHtml(remark1)}</div>` : ''}
              ${remark2 ? `<div class="remark"><span class="remark-label">Remark 2:</span> ${escapeHtml(remark2)}</div>` : ''}
              ${docLink ? `<div class="remark-links">${generateLinkIcons(docLink)}</div>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    });
  }

  detailsContainer.innerHTML = html;
}
