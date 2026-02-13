import { AUTH } from './auth.js';
import { UI } from './ui.js';

/**
 * attendance.js - Attendance marking page
 * Integrates with local API proxy for Google Apps Script
 */

// Use local API proxy instead of direct GAS URL (avoids CORS issues)
const API_URL = "/api/attendance";

const ATTENDANCE_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'first-half-leave', label: 'First Half-Day Leave' },
  { value: 'second-half-leave', label: 'Second Half-Day Leave' },
  { value: 'partial-late', label: 'Partial Day – Late Arrival' },
  { value: 'partial-early', label: 'Partial Day – Leave Early' },
];

let attendanceState = {
  records: {}, // { dateString: selectedValue }
  existingRecords: {}, // { dateString: status } - from database
  userName: '', // Current user name
};

document.addEventListener("DOMContentLoaded", () => {
  if (!AUTH.isAuthenticated()) return;
  initializePage();
});

function initializePage() {
  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    AUTH.logout();
    window.location.href = "/login.html";
  });

  const user = AUTH.getCurrentUser();

  // Display username in header
  if (user && user.name) {
    const firstName = user.name.split(' ')[0];
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userNameDisplay) {
      userNameDisplay.textContent = "hii " + firstName;
    }
    attendanceState.userName = user.name;
  }

  // Load existing attendance data
  loadExistingAttendance();
}

/**
 * Read existing attendance from API
 */
async function loadExistingAttendance() {
  try {
    if (!attendanceState.userName) {
      throw new Error("User name not available");
    }

    const data = await readAttendance(attendanceState.userName);
    
    if (data && typeof data === 'object') {
      // Parse API response format:
      // { ok: true, rows: [{ Date: "14 Feb 26", Attendance: "Present" }, ...] }
      if (data.ok === true && Array.isArray(data.rows) && data.rows.length > 0) {
        // Convert rows array to flat object: { "14 Feb 26": "present", ... }
        const recordsMap = {};
        data.rows.forEach(row => {
          if (row.Date && row.Attendance) {
            // Convert API attendance value to option value format
            const normalizedStatus = normalizeAttendanceStatus(row.Attendance);
            recordsMap[row.Date] = normalizedStatus;
          }
        });
        attendanceState.existingRecords = recordsMap;
      } else {
        attendanceState.existingRecords = {};
      }
    }

    // Generate cards (will mark read-only if data exists)
    generateAttendanceCards();
  } catch (error) {
    console.error("❌ Error loading attendance:", error);
    // Still generate cards even if loading fails
    generateAttendanceCards();
  }
}

/**
 * API: Read attendance data from local proxy (which calls Google Apps Script)
 */
async function readAttendance(employee) {
  try {
    const url = `${API_URL}?action=read&employee=${encodeURIComponent(employee)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const res = await fetch(url, { 
      signal: controller.signal,
      cache: 'no-cache' 
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ API Error (${res.status}):`, errorText);
      throw new Error(`API returned status ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error("❌ Error reading attendance:", error.message);
    return {};
  }
}

/**
 * API: Write attendance data via local proxy (which calls Google Apps Script)
 */
async function writeAttendance({ date, employee, attendance }) {
  try {
    const key = `${date}${employee}`;
    
    const payload = {
      action: "write",
      date,
      employee,
      attendance,
      key
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`API returned status ${res.status}`);
    }

    const data = await res.json();
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please try again');
    }
    console.error("❌ Error in writeAttendance:", error.message);
    throw error;
  }
}

/**
 * Generate 7 date cards starting from tomorrow
 */
function generateAttendanceCards() {
  const container = document.getElementById("attendanceCardsContainer");
  if (!container) return;

  let html = '<div class="attendance-cards">';

  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + 1 + i); // Tomorrow + 7 days
    const dateString = formatDateForKey(date);
    const displayDate = formatShortDate(date);
    const dayOfWeek = formatDayOfWeek(date);
    const isSunday = date.getDay() === 0;

    // Check if this date already has attendance recorded
    const existingStatus = attendanceState.existingRecords[displayDate];
    const isReadOnly = !!existingStatus;

    const cardHtml = `
      <div class="attendance-card ${isReadOnly ? 'attendance-card--readonly' : ''}">
        <div class="attendance-card-header">
          <div class="attendance-date-section">
            <span class="attendance-date">${displayDate}</span>
            <span class="attendance-day ${isSunday ? 'attendance-day--sunday' : ''}">${dayOfWeek}</span>
          </div>
          <select class="attendance-dropdown" data-date="${displayDate}" ${isReadOnly ? 'disabled' : ''}>
            <option value="">Select Status</option>
            ${ATTENDANCE_OPTIONS.map(opt => 
              `<option value="${opt.value}" ${existingStatus === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('')}
          </select>
        </div>
        ${isReadOnly ? `<div class="attendance-card-badge">✓ Already Recorded</div>` : ''}
        <button class="attendance-submit-btn" data-date="${displayDate}" ${isReadOnly ? 'disabled' : ''}>
          ${isReadOnly ? '✓ Submitted' : 'Submit'}
        </button>
        <div class="attendance-card-message" data-date="${displayDate}"></div>
      </div>
    `;
    
    html += cardHtml;
  }

  html += '</div>';
  container.innerHTML = html;

  // Attach event listeners
  setTimeout(() => {
    attachDropdownListeners();
    attachSubmitListeners();
  }, 0);
}

/**
 * Attach change event listeners to dropdowns
 */
function attachDropdownListeners() {
  const dropdowns = document.querySelectorAll('.attendance-dropdown');
  dropdowns.forEach(dropdown => {
    dropdown.addEventListener("change", (e) => {
      const dateString = e.target.dataset.date;
      attendanceState.records[dateString] = e.target.value;
    });
  });
}

/**
 * Attach click event listeners to submit buttons
 */
function attachSubmitListeners() {
  const submitButtons = document.querySelectorAll('.attendance-submit-btn');
  submitButtons.forEach(button => {
    button.addEventListener("click", (e) => {
      const dateString = button.dataset.date;
      submitAttendanceForDate(dateString, button);
    });
  });
}

/**
 * Submit attendance for a specific date
 */
async function submitAttendanceForDate(dateString, submitButton) {
  const selectedValue = attendanceState.records[dateString];
  const messageDiv = document.querySelector(`.attendance-card-message[data-date="${dateString}"]`);

  try {
    // Clear previous message
    if (messageDiv) {
      messageDiv.innerHTML = '';
      messageDiv.classList.remove('show', 'success', 'error');
    }

    // Validate selection
    if (!selectedValue || selectedValue === '') {
      throw new Error("Please select an attendance status");
    }

    // Disable button during submission
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';

    if (!attendanceState.userName) {
      throw new Error("User name not available");
    }

    // Call API to write attendance
    const result = await writeAttendance({
      date: dateString, // Format: "14 Feb 26"
      employee: attendanceState.userName,
      attendance: selectedValue
    });

    // Check API response - could be { ok: true } or other format
    if (!result || (result.ok === false)) {
      throw new Error(result?.error || "Failed to submit attendance");
    }

    UI.showToast(`Attendance marked as ${selectedValue}`, "success", 2000);
    
    if (messageDiv) {
      messageDiv.innerHTML = `<span class="success-badge">✓ Submitted</span>`;
      messageDiv.classList.add('show', 'success');
    }

    // Update existing records to prevent re-editing
    attendanceState.existingRecords[dateString] = selectedValue;

    // Mark card as read-only
    submitButton.textContent = '✓ Submitted';
    const dropdown = document.querySelector(`.attendance-dropdown[data-date="${dateString}"]`);
    if (dropdown) {
      dropdown.disabled = true;
    }

    // Mark card with readonly class
    const card = submitButton.closest('.attendance-card');
    if (card && !card.classList.contains('attendance-card--readonly')) {
      card.classList.add('attendance-card--readonly');
      
      // Add badge if not already present
      const existingBadge = card.querySelector('.attendance-card-badge');
      if (!existingBadge) {
        const badge = document.createElement('div');
        badge.className = 'attendance-card-badge';
        badge.textContent = '✓ Already Recorded';
        card.insertBefore(badge, submitButton);
      }
    }

  } catch (error) {
    console.error("❌ Error submitting attendance:", error.message);
    
    if (messageDiv) {
      messageDiv.innerHTML = `<span class="error-badge">${error.message}</span>`;
      messageDiv.classList.add('show', 'error');
    }

    // Re-enable button on error
    submitButton.disabled = false;
    submitButton.textContent = 'Submit';
  }
}

/**
 * Format date as dd/mm/yyyy for internal storage
 */
function formatDateForKey(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Format date to "dd mmm yy" (e.g. "13 Feb 26")
 */
function formatShortDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getMonth()];
  const yearShort = String(date.getFullYear()).slice(-2);
  return `${day} ${month} ${yearShort}`;
}

/**
 * Format day of week (e.g. "Monday", "Tuesday")
 */
function formatDayOfWeek(date) {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return dayNames[date.getDay()];
}

/**
 * Normalize attendance status from API format to option value format
 * Maps API values to our dropdown option values
 */
function normalizeAttendanceStatus(apiStatus) {
  if (!apiStatus) return '';
  
  const statusMap = {
    'present': 'present',
    'Present': 'present',
    'absent': 'absent',
    'Absent': 'absent',
    'first-half-leave': 'first-half-leave',
    'First Half-Day Leave': 'first-half-leave',
    'second-half-leave': 'second-half-leave',
    'Second Half-Day Leave': 'second-half-leave',
    'partial-late': 'partial-late',
    'Partial Day – Late Arrival': 'partial-late',
    'partial-early': 'partial-early',
    'Partial Day – Leave Early': 'partial-early',
  };
  
  return statusMap[apiStatus] || apiStatus.toLowerCase();
}
