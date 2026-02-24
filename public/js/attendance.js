import { AUTH } from './auth.js';
import { UI } from './ui.js';
import { getConfig } from './config.js';
import { API } from './api.js';

/**
 * attendance.js - Attendance marking page
 * Integrates with local API proxy for Google Apps Script
 * Filters attendance options based on shoot schedule
 */

// Use local API proxy instead of direct GAS URL (avoids CORS issues)
const API_URL = "/api/attendance";

const ATTENDANCE_OPTIONS = [
  { value: 'Present', label: 'Present' },
  { value: 'Absent', label: 'Absent' },
  { value: 'First-Half-Leave', label: 'First Half-Day Leave' },
  { value: 'Second-Half-Leave', label: 'Second Half-Day Leave' },
  { value: 'Partial-Late', label: 'Partial Day – Late Arrival' },
  { value: 'Partial-Early', label: 'Partial Day – Leave Early' },
];

const BOOKING_API_KEY = "bookingkey";

let GOOGLE_SCRIPT_API_ENDPOINT = null;

let attendanceState = {
  records: {}, // { dateString: selectedValue }
  existingRecords: {}, // { dateString: status } - from database
  shoots: {}, // { dateString: [shoot objects] } - organized by date
  userName: '', // Current user name
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!AUTH.isAuthenticated()) return;
  GOOGLE_SCRIPT_API_ENDPOINT = await getConfig('google_myday_script_url');
  if (!GOOGLE_SCRIPT_API_ENDPOINT) {
    console.error('❌ GOOGLE_SCRIPT_API_ENDPOINT not configured');
  }
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
 * Read existing attendance from API and fetch shoot schedule
 */
async function loadExistingAttendance() {
  try {
    if (!attendanceState.userName) {
      throw new Error("User name not available");
    }

    // Fetch both attendance records and shoots in parallel
    const [attendanceData, shootsData] = await Promise.all([
      readAttendance(attendanceState.userName),
      fetchShootsData(attendanceState.userName)
    ]);
    
    if (attendanceData && typeof attendanceData === 'object') {
      // Parse API response format:
      // { ok: true, rows: [{ Date: "14 Feb 26", Attendance: "Present" }, ...] }
      if (attendanceData.ok === true && Array.isArray(attendanceData.rows) && attendanceData.rows.length > 0) {
        // Convert rows array to flat object: { "14 Feb 26": "present", ... }
        const recordsMap = {};
        attendanceData.rows.forEach(row => {
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

    // Store shoots organized by date
    if (shootsData && shootsData.ok === true && Array.isArray(shootsData.rows)) {
      attendanceState.shoots = organizeShootsByDate(shootsData.rows);
    } else {
      attendanceState.shoots = {};
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
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (increased)
    
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
    if (error.name === 'AbortError') {
      console.error("❌ Error reading attendance: Request timeout (>15s)");
      return { ok: false, rows: [] }; // Return empty instead of error
    }
    console.error("❌ Error reading attendance:", error.message);
    return { ok: false, rows: [] }; // Return empty instead of error
  }
}

/**
 * API: Write/Update attendance data via local proxy (which calls Google Apps Script)
 */
async function writeAttendance({ date, employee, attendance, isUpdate = false }) {
  try {
    const key = `${date}${employee}`;
    
    const payload = {
      action: isUpdate ? "update" : "write",
      date,
      employee,
      attendance,
      key
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (increased)

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
      throw new Error('Request timeout (>15s) - please try again');
    }
    console.error("❌ Error in writeAttendance:", error.message);
    throw error;
  }
}

/**
 * Fetch shoots/bookings data from Google Apps Script API
 */
async function fetchShootsData(userName) {
  try {
    if (!GOOGLE_SCRIPT_API_ENDPOINT || !userName) {
      console.warn("⚠️ Cannot fetch shoots: missing endpoint or userName");
      return { ok: true, rows: [] };
    }

    const roleNormalized = "creator"; // Default to creator for shoots fetch
    const apiUrl =
      GOOGLE_SCRIPT_API_ENDPOINT +
      "?employee=" + encodeURIComponent(userName) +
      "&name=" + encodeURIComponent(userName) +
      "&role=" + encodeURIComponent(roleNormalized) +
      "&key=" + encodeURIComponent(BOOKING_API_KEY);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (increased)

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      cache: 'no-cache'
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`⚠️ Shoots API returned status ${response.status}`);
      return { ok: true, rows: [] };
    }

    const data = await response.json();

    // Handle both array and { ok, rows } response formats
    if (Array.isArray(data)) {
      console.log("✅ Shoots API returned array:", data.length, "items");
      return { ok: true, rows: data };
    }

    console.log("✅ Shoots API returned object with", data.rows?.length || 0, "shoots");
    // DEBUG: Sample first shoot to see data format
    if (data.rows && data.rows.length > 0) {
      console.log("📋 Sample shoot:", JSON.stringify(data.rows[0], null, 2));
    }

    return data || { ok: true, rows: [] };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn("⚠️ Shoots API request timeout (>15s)");
    } else {
      console.warn("⚠️ Error fetching shoots:", error.message);
    }
    return { ok: true, rows: [] };
  }
}

/**
 * Organize shoots by date for quick lookup
 */
function organizeShootsByDate(shoots) {
  const shootsByDate = {};

  if (!Array.isArray(shoots)) return shootsByDate;

  shoots.forEach(shoot => {
    const rawDate = shoot["Date"] ?? shoot["Shoot Date"] ?? shoot["Booking Date"];
    if (!rawDate) return;

    // Normalize date to "dd mmm yy" format for consistent matching with attendance dates
    const normalizedDate = normalizeDateFormat(rawDate);

    if (!shootsByDate[normalizedDate]) {
      shootsByDate[normalizedDate] = [];
    }
    shootsByDate[normalizedDate].push(shoot);
  });

  // DEBUG: Log shoots for inspection
  console.log("🔍 DEBUG - organizeShootsByDate:");
  console.log("Total shoots:", shoots.length);
  console.log("Shoots by date:", Object.keys(shootsByDate));
  shoots.slice(0, 3).forEach((shoot, idx) => {
    console.log(`  Shoot ${idx}: Date=${shoot["Date"] ?? shoot["Shoot Date"] ?? shoot["Booking Date"]}, From=${shoot["From Time"]}, To=${shoot["To Time"]}`);
  });

  return shootsByDate;
}

/**
 * Normalize date from various formats to "dd mmm yy" (e.g., "14 Feb 26")
 */
function normalizeDateFormat(dateValue) {
  try {
    if (!dateValue || dateValue === "-") return "-";

    const s = String(dateValue).trim();

    // If already in desired format, return as-is
    if (/^\d{2}\s+[A-Za-z]{3}\s+\d{2}$/.test(s)) {
      return s;
    }

    let d = new Date(s);

    // Try common Excel-like formats: "dd/mm/yyyy" or "dd-mm-yyyy"
    if (isNaN(d.getTime())) {
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1;
        let year = parseInt(m[3], 10);
        if (year < 100) year += 2000;
        d = new Date(year, month, day);
      }
    }

    if (isNaN(d.getTime())) {
      return s; // fallback to original if still invalid
    }

    const day = String(d.getDate()).padStart(2, "0");
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[d.getMonth()];
    const yearShort = String(d.getFullYear()).slice(-2);

    return `${day} ${month} ${yearShort}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return String(dateValue);
  }
}

/**
 * Parse time string to minutes since midnight
 * Handles multiple formats:
 * - 12-hour: "4:00 pm" or "4 pm"
 * - ISO 8601: "1899-12-30T04:00:50.000Z"
 * - JavaScript Date string: "Sat Dec 30 1899 10:00:00 GMT+0521"
 * Returns 999999 if parsing fails
 */
function parseTimeToMinutes(timeValue) {
  if (!timeValue) return 999999;
  const s = String(timeValue).trim().toLowerCase();

  // Try 12-hour format first: "4 pm" or "4:00 pm"
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m) {
    let hh = parseInt(m[1], 10);
    const mm = parseInt(m[2] || "0", 10);
    const ap = m[3];

    if (ap === "pm" && hh !== 12) hh += 12;
    if (ap === "am" && hh === 12) hh = 0;

    return hh * 60 + mm;
  }

  // Try ISO 8601 format: "1899-12-30t04:00:50.000z" (after toLowerCase)
  const iso8601Match = s.match(/t(\d{2}):(\d{2}):/);
  if (iso8601Match) {
    const hh = parseInt(iso8601Match[1], 10);
    const mm = parseInt(iso8601Match[2], 10);
    console.log(`⏰ Parsed ISO time ${timeValue} → ${hh}:${String(mm).padStart(2, '0')} (${hh * 60 + mm} minutes)`);
    return hh * 60 + mm;
  }

  // Try JavaScript Date string: "Sat Dec 30 1899 10:00:00 GMT+0521"
  const jsDateMatch = s.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (jsDateMatch) {
    let hh = parseInt(jsDateMatch[1], 10);
    const mm = parseInt(jsDateMatch[2], 10);
    console.log(`⏰ Parsed JS Date time ${timeValue} → ${hh}:${String(mm).padStart(2, '0')} (${hh * 60 + mm} minutes)`);
    return hh * 60 + mm;
  }

  console.warn(`⚠️ Unable to parse time: "${timeValue}"`);
  return 999999;
}

/**
 * Filter attendance options based on shoot schedule for a given date
 * 
 * Business Rules:
 * - Always include "Present"
 * - If NO shoots: allow all options
 * - If shoots exist BEFORE 11:30 am: exclude "Partial Day – Late Arrival"
 * - If shoots exist BEFORE 3:00 pm (15:00): exclude "First Half-Day Leave"
 * - If shoots exist AFTER 3:00 pm (15:00): exclude "Second Half-Day Leave"
 * - If shoots exist AFTER 6:30 pm (18:30): exclude "Partial Day – Leave Early"
 */
function getFilteredAttendanceOptions(dateString) {
  // Start with all options
  let filtered = [...ATTENDANCE_OPTIONS];

  // Get shoots for this date
  const shoots = attendanceState.shoots[dateString] || [];

  // DEBUG: Log filtering for each date
  if (shoots.length > 0) {
    console.log(`🎬 Filtering for ${dateString}: ${shoots.length} shoot(s)`);
    shoots.forEach((shoot, idx) => {
      console.log(`    Shoot ${idx + 1}: ${shoot["From Time"]} - ${shoot["To Time"]}`);
    });
  }

  // If no shoots, return all options
  if (shoots.length === 0) {
    return filtered;
  }

  // Parse time thresholds (in minutes since midnight)
  const BEFORE_LATE_ARRIVAL = 11 * 60 + 30; // 11:30 am (690 minutes)
  const BEFORE_FIRST_HALF = 15 * 60; // 3:00 pm (900 minutes)
  const AFTER_SECOND_HALF = 15 * 60; // 3:00 pm (900 minutes)
  const AFTER_LEAVE_EARLY = 18 * 60 + 30; // 6:30 pm (1110 minutes)

  // Check if any shoot violates each condition
  let hasShootBeforeLateArrival = false; // Before 11:30 am
  let hasShootBeforeFirstHalf = false; // Before 3:00 pm
  let hasShootAfterSecondHalf = false; // After 3:00 pm
  let hasShootAfterLeaveEarly = false; // After 6:30 pm

  shoots.forEach(shoot => {
    const fromTime = shoot["From Time"] || "";
    const toTime = shoot["To Time"] || "";

    const fromMinutes = parseTimeToMinutes(fromTime);
    const toMinutes = parseTimeToMinutes(toTime);

    // Rule 1: If shoot starts before 11:30 am, exclude "Partial Day – Late Arrival"
    if (fromMinutes < BEFORE_LATE_ARRIVAL) {
      hasShootBeforeLateArrival = true;
    }

    // Rule 2: If shoot starts before 3:00 pm, exclude "First Half-Day Leave"
    if (fromMinutes < BEFORE_FIRST_HALF) {
      hasShootBeforeFirstHalf = true;
    }

    // Rule 3: If shoot ends at or after 3:00 pm, exclude "Second Half-Day Leave"
    // Using >= to catch shoots starting exactly at 15:00 or ending at 15:00
    if (toMinutes >= AFTER_SECOND_HALF || fromMinutes >= AFTER_SECOND_HALF) {
      hasShootAfterSecondHalf = true;
    }

    // Rule 4: If shoot ends after 6:30 pm, exclude "Partial Day – Leave Early"
    if (toMinutes > AFTER_LEAVE_EARLY) {
      hasShootAfterLeaveEarly = true;
    }
  });

  // Rule: If day has ANY shoots, exclude "Absent" (only allowed if no shoots)
  if (shoots.length > 0) {
    filtered = filtered.filter(opt => opt.value !== 'Absent');
  }

  // Apply filtering rules
  if (hasShootBeforeLateArrival) {
    filtered = filtered.filter(opt => opt.value !== 'Partial-Late');
  }

  if (hasShootBeforeFirstHalf) {
    filtered = filtered.filter(opt => opt.value !== 'First-Half-Leave');
  }

  if (hasShootAfterSecondHalf) {
    filtered = filtered.filter(opt => opt.value !== 'Second-Half-Leave');
  }

  if (hasShootAfterLeaveEarly) {
    filtered = filtered.filter(opt => opt.value !== 'Partial-Early');
  }

  // Always ensure "Present" is included
  if (!filtered.find(opt => opt.value === 'Present')) {
    filtered.unshift(ATTENDANCE_OPTIONS.find(opt => opt.value === 'Present'));
  }

  // DEBUG: Log final result
  console.log(`    ✓ After filtering: ${filtered.map(o => o.label).join(", ")}`);

  return filtered;
}

/**
 * Generate 7 date cards starting from today
 */
function generateAttendanceCards() {
  const container = document.getElementById("attendanceCardsContainer");
  if (!container) return;

  let html = '<div class="attendance-cards">';


  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i); // Today + 6 days ahead
    const dateString = formatDateForKey(date);
    const displayDate = formatShortDate(date);
    const dayOfWeek = formatDayOfWeek(date);
    const isSunday = date.getDay() === 0;
    const isToday = i === 0; // First card is today

    // Check if this date already has attendance recorded
    const existingStatus = attendanceState.existingRecords[displayDate];
    const isReadOnly = !!existingStatus;

    // Get filtered options for this specific date based on shoot schedule
    const filteredOptions = getFilteredAttendanceOptions(displayDate);

    const cardHtml = `
      <div class="attendance-card ${isReadOnly ? 'attendance-card--readonly' : ''}">
        <div class="attendance-card-header">
          <div class="attendance-date-section">
            <span class="attendance-date">${displayDate}</span>
            ${isToday ? '<span class="attendance-today-badge">TODAY</span>' : ''}
            <span class="attendance-day ${isSunday ? 'attendance-day--sunday' : ''}">${dayOfWeek}</span>
          </div>
          <select class="attendance-dropdown" data-date="${displayDate}" ${isReadOnly ? 'disabled' : ''}>
            <option value="">Select Status</option>
            ${filteredOptions.map(opt => 
              `<option value="${opt.value}" ${existingStatus === opt.value ? 'selected' : ''}>${opt.label}</option>`
            ).join('')}
          </select>
        </div>
        ${isReadOnly ? `<div class="attendance-card-badge">✓ Click Edit to update</div>` : ''}
        <button class="attendance-submit-btn" data-date="${displayDate}" data-is-edit="${isReadOnly ? 'true' : 'false'}">
          ${isReadOnly ? 'Edit' : 'Submit'}
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
 * Submit/Update attendance for a specific date
 */
async function submitAttendanceForDate(dateString, submitButton) {
  const isEdit = submitButton.dataset.isEdit === 'true';
  const selectedValue = attendanceState.records[dateString] || attendanceState.existingRecords[dateString];
  const messageDiv = document.querySelector(`.attendance-card-message[data-date="${dateString}"]`);
  const dropdown = document.querySelector(`.attendance-dropdown[data-date="${dateString}"]`);

  try {
    // Clear previous message
    if (messageDiv) {
      messageDiv.innerHTML = '';
      messageDiv.classList.remove('show', 'success', 'error');
    }

    // If editing, toggle the edit mode
    if (isEdit && !dropdown.classList.contains('editing')) {
      // Enable editing mode
      dropdown.classList.add('editing');
      dropdown.disabled = false;
      submitButton.textContent = 'Update';
      submitButton.dataset.isEdit = 'false';
      if (messageDiv) {
        messageDiv.innerHTML = `<span class="info-badge">Select new status and click Update</span>`;
        messageDiv.classList.add('show');
      }
      return;
    }

    // Validate selection
    if (!selectedValue || selectedValue === '') {
      throw new Error("Please select an attendance status");
    }

    // Disable button during submission
    submitButton.disabled = true;
    const originalText = isEdit || dropdown.classList.contains('editing') ? 'Updating...' : 'Submitting...';
    submitButton.textContent = originalText;

    if (!attendanceState.userName) {
      throw new Error("User name not available");
    }

    // Determine if this is an update (existing record being edited) or new submission
    const hasExistingRecord = !!attendanceState.existingRecords[dateString];
    
    // Convert short value to full label for Google Sheet storage
    const fullLabel = getAttendanceLabel(selectedValue);
    
    // Call API to write/update attendance
    const result = await writeAttendance({
      date: dateString, // Format: "14 Feb 26"
      employee: attendanceState.userName,
      attendance: fullLabel, // Send full label, not short value
      isUpdate: hasExistingRecord && (isEdit || dropdown.classList.contains('editing'))
    });

    // Check API response - could be { ok: true } or other format
    if (!result || (result.ok === false)) {
      throw new Error(result?.error || "Failed to submit attendance");
    }

    const actionType = (isEdit || dropdown.classList.contains('editing')) ? 'Updated' : 'Marked';
    UI.showToast(`Attendance ${actionType.toLowerCase()} as ${selectedValue}`, "success", 2000);
    
    if (messageDiv) {
      messageDiv.innerHTML = `<span class="success-badge">✓ ${actionType}</span>`;
      messageDiv.classList.add('show', 'success');
    }

    // Update existing records
    const oldAttendance = attendanceState.existingRecords[dateString] || "-";
    attendanceState.existingRecords[dateString] = selectedValue;
    attendanceState.records[dateString] = selectedValue;

    // Send webhook notification for attendance update (with full labels)
    sendAttendanceWebhook({
      date: dateString,
      old_attendance: oldAttendance === "-" ? "-" : getAttendanceLabel(oldAttendance),
      new_attendance: fullLabel,
      employee: attendanceState.userName,
      action: "update_attendance",
      command: "/attendance"
    });

    // Return card to read-only state
    submitButton.textContent = 'Edit';
    submitButton.dataset.isEdit = 'true';
    dropdown.disabled = true;
    dropdown.classList.remove('editing');

    // Mark card with readonly class
    const card = submitButton.closest('.attendance-card');
    if (!card.classList.contains('attendance-card--readonly')) {
      card.classList.add('attendance-card--readonly');
      
      // Add or update badge
      let badge = card.querySelector('.attendance-card-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'attendance-card-badge';
        card.insertBefore(badge, submitButton);
      }
      badge.textContent = '✓ Click Edit to update';
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
 * Send attendance update webhook notification using same n8n endpoint as other pages
 * Payload: { date, old_attendance, new_attendance, employee, action, command }
 */
async function sendAttendanceWebhook(webhookData) {
  try {
    const user = AUTH.getCurrentUser();
    
    // Prepare payload in same format as delete booking
    const payload = {
      action: 'update_attendance',
      command: '/attendance',
      attendance: {
        date: webhookData.date,
        old_attendance: webhookData.old_attendance,
        new_attendance: webhookData.new_attendance,
        employee: webhookData.employee || user?.name || "-"
      },
      user: {
        name: user?.name || "-",
        role: user?.role || "-",
        email: user?.email || "-"
      },
      timestamp: new Date().toISOString()
    };

    console.log('🔔 Sending attendance webhook:', payload);

    // Use same API endpoint as delete booking
    const response = await API.postToN8n(payload);
    
    console.log('✅ Attendance webhook sent successfully:', response);
  } catch (error) {
    // Log but don't break the app - attendance was already saved
    console.warn('⚠️ Error sending webhook:', error.message);
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
    'present': 'Present',
    'Present': 'Present',
    'absent': 'Absent',
    'Absent': 'Absent',
    'first-half-leave': 'First-Half-Leave',
    'First Half-Day Leave': 'First-Half-Leave',
    'second-half-leave': 'Second-Half-Leave',
    'Second Half-Day Leave': 'Second-Half-Leave',
    'partial-late': 'Partial-Late',
    'Partial Day – Late Arrival': 'Partial-Late',
    'partial-early': 'Partial-Early',
    'Partial Day – Leave Early': 'Partial-Early',
  };
  
  return statusMap[apiStatus] || apiStatus;
}

/**
 * Get full attendance label from short value
 * Maps option value to option label for Google Sheet storage
 * E.g., "Partial-Early" → "Partial Day – Leave Early"
 */
function getAttendanceLabel(value) {
  if (!value) return value;
  
  const option = ATTENDANCE_OPTIONS.find(opt => opt.value === value);
  return option ? option.label : value;
}
