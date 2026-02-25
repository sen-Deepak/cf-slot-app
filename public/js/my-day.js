import { fetchWithTimeout } from './fetch-util.js';
import { AUTH } from './auth.js';
import { UI } from './ui.js';
import { API } from './api.js';
import { getConfig } from './config.js';

/**
 * my-day.js - My Day page logic (FINAL)
 * Fixes:
 * 1) Calls Google Apps Script Web App directly (no /api proxy)
 * 2) Sends BOTH employee + name params (supports old + new GAS)
 * 3) Supports role param too
 * 4) Handles GAS response format: { ok, rows } OR array fallback
 * 5) Fixes time sorting for "4:00 pm" strings
 */

let GOOGLE_SCRIPT_API_ENDPOINT = null;

const BOOKING_API_KEY = "bookingkey";

let myDayState = {
  userBookings: [],
  sortedBookings: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!AUTH.isAuthenticated()) return;
  GOOGLE_SCRIPT_API_ENDPOINT = await getConfig('google_myday_script_url');
  if (!GOOGLE_SCRIPT_API_ENDPOINT) {
    console.error('❌ GOOGLE_SCRIPT_API_ENDPOINT not configured');
    return;
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
      userNameDisplay.textContent = "hii "+firstName;
    }
  }

  const role =
    user?.role ||
    user?.designation ||
    user?.Role ||
    user?.Designation ||
    "creator";

  const name =
    user?.name ||
    user?.Name ||
    user?.employee ||
    user?.Employee ||
    "";

  loadUserBookings(name, role);

  // Initialize delete confirmation modal listeners
  initializeDeleteModal();
  // Initialize free confirmation modal listeners
  initializeFreeModal();
}

async function loadUserBookings(userName, userRole) {
  const bookingsContainer = document.getElementById("myBookingsContainer");
  const bookingsLoading = document.getElementById("myBookingsLoading");
  const bookingsError = document.getElementById("myBookingsError");

  try {
    UI.showError(bookingsError, "");
    UI.setLoading(bookingsLoading, true);

    if (!userName) {
      throw new Error("User name is missing from AUTH.getCurrentUser()");
    }

    // Normalize role to match API expectation: "creator" | "dop"
    const roleNormalized =
      String(userRole || "creator").trim().toLowerCase() === "dop"
        ? "dop"
        : "creator";

    // ✅ IMPORTANT: send employee param (because your GAS complains "Missing employee")
    // Also send name param for forward compatibility if you later switch GAS to name.
    const apiUrl =
      GOOGLE_SCRIPT_API_ENDPOINT +
      "?employee=" + encodeURIComponent(userName) +
      "&name=" + encodeURIComponent(userName) +
      "&role=" + encodeURIComponent(roleNormalized) +
      "&key=" + encodeURIComponent(BOOKING_API_KEY);

    console.log("🔍 Fetching bookings for:", { userName, role: roleNormalized });
    console.log("📍 GAS endpoint:", apiUrl);

    const response = await fetchWithTimeout(apiUrl, { method: "GET" });

    if (!response.ok) {
      if (response.error) {
        throw new Error(response.error);
      }
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();
    console.log("✓ API Response received:", data);

    // ---- RESPONSE NORMALIZATION ----
    // Your GAS might return:
    // A) { ok:true, rows:[...] }
    // B) [ ... ] (array)
    // C) { ok:false, error:"..." }
    let rows = [];

    if (Array.isArray(data)) {
      // Old style API returning array directly
      rows = data;
    } else {
      if (!data || data.ok !== true) {
        throw new Error(data?.error || "API returned ok=false");
      }
      rows = Array.isArray(data.rows) ? data.rows : [];
    }

    if (rows.length === 0) {
      console.warn("⚠️ No bookings found for:", userName);
      if (bookingsContainer) {
        bookingsContainer.innerHTML =
          '<p class="placeholder-text">No bookings found for your profile</p>';
      }
      updateBookingCountBadges([]);
      UI.showToast("No bookings available", "info", 2000);
      return;
    }

    console.log("📊 Number of bookings:", rows.length);
    console.log("📋 First booking structure:", rows[0]);

    myDayState.userBookings = rows;
    myDayState.sortedBookings = sortBookingsByTime(rows);

    displayUserBookings(myDayState.sortedBookings, bookingsContainer);
    updateBookingCountBadges(myDayState.sortedBookings);
    UI.showToast(`Loaded ${rows.length} booking(s)`, "success", 2000);
  } catch (error) {
    console.error("❌ Error loading bookings:", error);
    UI.showError(bookingsError, "Failed to load bookings: " + error.message);
    if (bookingsContainer) {
      bookingsContainer.innerHTML =
        '<p class="placeholder-text">Error loading bookings. Please check console.</p>';
    }
  } finally {
    UI.setLoading(bookingsLoading, false);
  }
}

/**
 * Parse times like "4:00 pm" into minutes since midnight
 * Handles multiple formats:
 * - 12-hour: "4:00 pm" or "4 pm"
 * - ISO 8601: "1899-12-30t04:00:50.000z" (after toLowerCase)
 * - JavaScript Date string: "Sat Dec 30 1899 10:00:00 GMT+0521"
 */
function parseTimeToMinutes(t) {
  if (!t) return 999999;
  const s = String(t).trim().toLowerCase();

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
    return hh * 60 + mm;
  }

  // Try JavaScript Date string: "Sat Dec 30 1899 10:00:00 GMT+0521"
  const jsDateMatch = s.match(/(\d{2}):(\d{2}):(\d{2})/);
  if (jsDateMatch) {
    const hh = parseInt(jsDateMatch[1], 10);
    const mm = parseInt(jsDateMatch[2], 10);
    return hh * 60 + mm;
  }

  // Fallback: try parsing as Date object
  try {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      const hh = d.getHours();
      const mm = d.getMinutes();
      return hh * 60 + mm;
    }
  } catch (e) {
    // ignore
  }

  return 999999;
}

function sortBookingsByTime(bookings) {
  return bookings.slice().sort((a, b) => {
    // Get dates
    const aRawDate = a["Date"] ?? a["Shoot Date"] ?? a["Booking Date"] ?? "-";
    const bRawDate = b["Date"] ?? b["Shoot Date"] ?? b["Booking Date"] ?? "-";

    // Determine date priority: Today (0) > Tomorrow (1) > Others (2)
    const aIsToday = isDateToday(aRawDate) ? 0 : (isDateTomorrow(aRawDate) ? 1 : 2);
    const bIsToday = isDateToday(bRawDate) ? 0 : (isDateTomorrow(bRawDate) ? 1 : 2);

    // First, sort by date priority (today first, then tomorrow, then others)
    if (aIsToday !== bIsToday) {
      return aIsToday - bIsToday;
    }

    // If same date priority, sort by time
    const aMin = parseTimeToMinutes(a["From Time"]);
    const bMin = parseTimeToMinutes(b["From Time"]);
    return aMin - bMin;
  });
}

function countBookingsByDate(bookings) {
  let todayCount = 0;
  let tomorrowCount = 0;
  if (!bookings || !bookings.length) return { todayCount, tomorrowCount };
  bookings.forEach((b) => {
    const raw =
      b["Date"] ?? b["Shoot Date"] ?? b["Booking Date"] ?? null;
    if (!raw) return;
    if (isDateToday(raw)) todayCount++;
    else if (isDateTomorrow(raw)) tomorrowCount++;
  });
  return { todayCount, tomorrowCount };
}

function updateBookingCountBadges(bookings) {
  const el = document.getElementById("myBookingsCountBadges");
  if (!el) return;
  const { todayCount, tomorrowCount } = countBookingsByDate(bookings);
  el.setAttribute("aria-hidden", todayCount === 0 && tomorrowCount === 0 ? "true" : "false");
  el.innerHTML = `
    <span class="count-badge count-badge--today" title="Today">${todayCount}</span>
    <span class="count-badge count-badge--tomorrow" title="Tomorrow">${tomorrowCount}</span>
  `;
}

function displayUserBookings(bookings, container) {
  try {
    if (!container) return;

    if (!bookings || bookings.length === 0) {
      container.innerHTML = '<p class="placeholder-text">No bookings for you</p>';
      return;
    }

    // Get current user for authorization check
    const currentUser = AUTH.getCurrentUser();
    const currentUserName = currentUser?.name || currentUser?.Name || "";

    let html = '<div class="bookings-list">';

    bookings.forEach((booking, idx) => {
      const shootName = booking["Shoot Name"] ?? "-";
      const bookingType = booking["Type"] ?? "N/A";
      const bIpName = booking["B_IP_Name"] ?? "-";

      const role = booking["Role"] ?? "-";

      const rawDate =
        booking["Date"] ??
        booking["Shoot Date"] ??
        booking["Booking Date"] ??
        "-";
      const date = formatShortDate(rawDate);
      const isTomorrow = isDateTomorrow(rawDate);

      const fromTime = formatTime(booking["From Time"]);
      const toTime = formatTime(booking["To Time"]);

      const shootLead = booking["Creator"] ?? "-";
      const location = booking["Location"] ?? "-";

      const dop = booking["DOP"] ?? "-";
      const cast = booking["Cast"] ?? "-";
      const noOfShoot = booking["No Of Shoot"] ?? "-";

      // Check if current user is freed from this booking
      const bookingId = booking["Booking ID"] ?? booking["ID"] ?? "-";
      const isUserFreed = isUserFreedFromBooking(bookingId, currentUserName);
      
      if (isUserFreed) {
        console.log(`🔴 Card ${idx + 1}: Booking ID ${bookingId} marked as freed`);
      }

      let cardClass = "booking-card user-booking-card" + (isTomorrow ? " user-booking-card--tomorrow" : "");
      if (isUserFreed) {
        cardClass += " booking-card--freed";
      }

      // Check if current user is the shoot lead (creator)
      const isShootLead = currentUserName && shootLead && 
                          String(currentUserName).trim().toLowerCase() === String(shootLead).trim().toLowerCase();

      // Create booking data JSON string for delete button
      const bookingData = {
        bookingId: bookingId,
        shootName: shootName,
        type: bookingType,
        bIpName: bIpName,
        date: rawDate,
        fromTime: booking["From Time"] ?? "-",
        toTime: booking["To Time"] ?? "-",
        role: role,
        creator: shootLead,
        location: location,
        dop: dop,
        cast: cast,
        noOfShoot: noOfShoot
      };
      const bookingDataStr = escapeHtml(JSON.stringify(bookingData));

      // Show delete button only if user is the shoot lead
      const deleteButtonHtml = isShootLead 
        ? `<button class="delete-booking-btn" data-booking='${bookingDataStr}' title="Delete this booking">
             🗑️ Delete
           </button>`
        : '';

      // Show free button only if user is NOT the shoot lead and NOT already freed
      const freeButtonHtml = !isShootLead && !isUserFreed
        ? `<button class="free-booking-btn" data-booking='${bookingDataStr}' title="Mark this shoot as free">
             ✓ Free
           </button>`
        : '';

      // Show freed badge if user is freed
      const freedBadgeHtml = isUserFreed
        ? `<span class="freed-badge">Freed</span>`
        : '';

      html += `
        <div class="${cardClass}">
          <div class="booking-header">
            <span class="booking-number">${idx + 1}</span>
            <div class="booking-title-section">
              <h4 class="booking-title">${escapeHtml(String(shootName))} · ${escapeHtml(String(bookingType))} · ${escapeHtml(String(bIpName))}</h4>
              ${freedBadgeHtml}
            </div>
            ${deleteButtonHtml}
            ${freeButtonHtml}
          </div>

          <div class="booking-details">
            <div class="booking-detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${escapeHtml(String(date))}</span>
            </div>

            <div class="booking-detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-value">${escapeHtml(fromTime)} - ${escapeHtml(toTime)}</span>
            </div>

            <div class="booking-detail-row">
              <span class="detail-label">No. of Shoots:</span>
              <span class="detail-value">${escapeHtml(String(noOfShoot))}</span>
            </div>

            <div class="booking-detail-row">
              <span class="detail-label">Your Role:</span>
              <span class="detail-value">${escapeHtml(String(role))}</span>
            </div>

            <div class="booking-detail-row">
              <span class="detail-label">Shoot Lead:</span>
              <span class="detail-value">${escapeHtml(String(shootLead))}</span>
            </div>

            <div class="booking-detail-row">
              <span class="detail-label">Location:</span>
              <span class="detail-value">${escapeHtml(String(location))}</span>
            </div>

            <div class="booking-detail-row">
              <span class="detail-label">DOP:</span>
              <span class="detail-value">${escapeHtml(String(dop))}</span>
            </div>

            <div class="booking-detail-row">
              <span class="detail-label">Cast:</span>
              <span class="detail-value">${escapeHtml(String(cast))}</span>
            </div>
          </div>
        </div>
      `;
    });

    html += "</div>";
    container.innerHTML = html;

    // Attach delete button event listeners
    attachDeleteButtonListeners();
    // Attach free button event listeners
    attachFreeButtonListeners();

    console.log("✓ Bookings displayed successfully");
  } catch (error) {
    console.error("Error displaying bookings:", error);
    if (container) {
      container.innerHTML = '<p style="color: #d32f2f;">Error displaying bookings</p>';
    }
  }
}

function formatTime(timeValue) {
  try {
    if (!timeValue) return "-";
    const s = String(timeValue).trim();

    // Handle 24-hour format "14:00" or "14:30" or "14"
    const h24Match = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (h24Match) {
      let hh = parseInt(h24Match[1], 10);
      const mm = String(h24Match[2] || "00").padStart(2, "0");
      
      const ampm = hh >= 12 ? "PM" : "AM";
      if (hh > 12) hh -= 12;
      if (hh === 0) hh = 12;
      
      return `${hh}:${mm} ${ampm}`;
    }

    // "4:00 pm" or "4 pm" (already in AM/PM format)
    const ampmMatch = s.toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (ampmMatch) {
      const hh = parseInt(ampmMatch[1], 10);
      const mm = String(ampmMatch[2] || "00").padStart(2, "0");
      return `${hh}:${mm} ${ampmMatch[3].toUpperCase()}`;
    }

    // Fallback ISO/Date
    const d = new Date(timeValue);
    if (isNaN(d.getTime())) return s;

    let hh2 = d.getHours();
    const mm2 = String(d.getMinutes()).padStart(2, "0");
    const ampm2 = hh2 >= 12 ? "PM" : "AM";
    if (hh2 > 12) hh2 -= 12;
    if (hh2 === 0) hh2 = 12;
    
    return `${hh2}:${mm2} ${ampm2}`;
  } catch (error) {
    console.error("Error formatting time:", error);
    return String(timeValue);
  }
}

// Returns true if the given date string is today
function isDateToday(dateValue) {
  try {
    if (!dateValue || dateValue === "-") return false;
    const s = String(dateValue).trim();
    let d = new Date(s);
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
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  } catch (e) {
    return false;
  }
}

// Returns true if the given date string is tomorrow (next calendar day)
function isDateTomorrow(dateValue) {
  try {
    if (!dateValue || dateValue === "-") return false;
    const s = String(dateValue).trim();
    let d = new Date(s);
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
    if (isNaN(d.getTime())) return false;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return (
      d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate()
    );
  } catch (e) {
    return false;
  }
}

// Format date to "dd mmm yy" (e.g. "03 Jan 26")
function formatShortDate(dateValue) {
  try {
    if (!dateValue || dateValue === "-") return "-";

    // If it's already in the desired format, just return
    const s = String(dateValue).trim();
    if (/^\d{2}\s+[A-Za-z]{3}\s+\d{2}$/.test(s)) {
      return s;
    }

    let d = new Date(s);

    // If direct parse fails, try common Excel-like formats "dd/mm/yyyy" or "dd-mm-yyyy"
    if (isNaN(d.getTime())) {
      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1; // JS months 0-11
        let year = parseInt(m[3], 10);
        if (year < 100) year += 2000; // treat 2-digit year as 20xx
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

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Initialize delete confirmation modal event listeners
 */
function initializeDeleteModal() {
  const modal = document.getElementById('deleteConfirmationModal');
  const cancelBtn = document.getElementById('deleteModalCancelBtn');
  const deleteBtn = document.getElementById('deleteModalDeleteBtn');
  const reasonInput = document.getElementById('deleteReasonInput');
  
  // Cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleDeleteCancel);
  }
  
  // Delete button
  if (deleteBtn) {
    deleteBtn.addEventListener('click', handleDeleteConfirm);
  }
  
  // Character count on input
  if (reasonInput) {
    reasonInput.addEventListener('input', updateCharCount);
    
    // Also handle when modal is closed by clicking outside
    reasonInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDeleteModal();
      }
    });
  }
  
  // Close modal when clicking outside
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeDeleteModal();
      }
    });
  }
}

/**
 * Attach event listeners to delete buttons
 */
function attachDeleteButtonListeners() {
  const deleteButtons = document.querySelectorAll('.delete-booking-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', handleDeleteBookingClick);
  });
}

/**
 * Attach event listeners to free buttons
 */
function attachFreeButtonListeners() {
  const freeButtons = document.querySelectorAll('.free-booking-btn');
  freeButtons.forEach(btn => {
    btn.addEventListener('click', handleFreeBookingClick);
  });
}

/**
 * Handle delete button click
 */
function handleDeleteBookingClick(event) {
  event.preventDefault();
  const bookingDataStr = this.getAttribute('data-booking');
  
  try {
    const bookingData = JSON.parse(bookingDataStr);
    showConfirmationDialog(bookingData);
  } catch (error) {
    console.error("Error parsing booking data:", error);
    UI.showToast("Error processing booking data", "error", 3000);
  }
}

/**
 * Show confirmation dialog for deleting a booking
 */
function showConfirmationDialog(bookingData) {
  const shootName = bookingData.shootName || "-";
  const date = formatShortDate(bookingData.date) || "-";
  const fromTime = formatTime(bookingData.fromTime);
  const toTime = formatTime(bookingData.toTime);
  const timeRange = (fromTime !== "-" || toTime !== "-") ? `${fromTime} - ${toTime}` : "-";
  
  // Set booking details in modal
  document.getElementById('deleteModalShootName').textContent = shootName;
  document.getElementById('deleteModalDate').textContent = date;
  document.getElementById('deleteModalTime').textContent = timeRange;
  
  // Clear the reason input
  const reasonInput = document.getElementById('deleteReasonInput');
  reasonInput.value = '';
  reasonInput.focus();
  updateCharCount();
  
  // Store booking data in modal for later use
  const modal = document.getElementById('deleteConfirmationModal');
  modal.dataset.bookingData = JSON.stringify(bookingData);
  
  // Show modal
  modal.classList.add('modal-open');
}

/**
 * Update character count display
 */
function updateCharCount() {
  const reasonInput = document.getElementById('deleteReasonInput');
  const charCount = document.getElementById('charCount');
  charCount.textContent = reasonInput.value.length;
}

/**
 * Close delete confirmation modal
 */
function closeDeleteModal() {
  const modal = document.getElementById('deleteConfirmationModal');
  modal.classList.remove('modal-open');
  document.getElementById('deleteReasonInput').value = '';
  updateCharCount();
}

/**
 * Handle delete modal cancel button
 */
function handleDeleteCancel() {
  closeDeleteModal();
}

/**
 * Handle delete modal delete button
 */
function handleDeleteConfirm() {
  const reasonInput = document.getElementById('deleteReasonInput');
  const reason = reasonInput.value.trim();
  
  // Validate reason is not empty
  if (!reason) {
    UI.showToast("Please provide a reason for deletion", "error", 3000);
    reasonInput.focus();
    return;
  }
  
  // Get booking data from modal
  const modal = document.getElementById('deleteConfirmationModal');
  const bookingDataStr = modal.dataset.bookingData;
  
  try {
    const bookingData = JSON.parse(bookingDataStr);
    closeDeleteModal();
    deleteBooking(bookingData, reason);
  } catch (error) {
    console.error("Error parsing booking data:", error);
    UI.showToast("Error processing booking data", "error", 3000);
  }
}

/**
 * Delete booking by sending webhook to n8n
 */
async function deleteBooking(bookingData, reason = '') {
  try {
    const user = AUTH.getCurrentUser();
    
    // Prepare webhook payload
    const payload = {
      action: 'delete_booking',
      command: '/delete_booking',
      booking: {
        bookingId: bookingData.bookingId,
        shootName: bookingData.shootName,
        type: bookingData.type,
        bIpName: bookingData.bIpName,
        date: bookingData.date,
        fromTime: bookingData.fromTime,
        toTime: bookingData.toTime,
        role: bookingData.role,
        creator: bookingData.creator,
        location: bookingData.location,
        dop: bookingData.dop,
        cast: bookingData.cast,
        deleteReason: reason || ""
      },
      user: {
        name: user?.name || "-",
        role: user?.role || "-",
        email: user?.email || "-"
      }
    };

    console.log("📤 Sending delete booking webhook:", payload);
    
    // Show loading indicator
    UI.showToast("Deleting booking...", "info", 2000);
    
    // Send webhook
    const response = await API.postToN8n(payload);
    
    console.log("✓ Delete booking response:", response);
    
    // Show success and reload bookings
    UI.showToast("Booking deleted successfully!", "success", 3000);
    
    // Reload bookings after a short delay
    setTimeout(() => {
      const user = AUTH.getCurrentUser();
      const role = user?.role || user?.designation || "creator";
      const name = user?.name || user?.Name || user?.employee || "";
      loadUserBookings(name, role);
    }, 1500);
    
  } catch (error) {
    console.error("❌ Error deleting booking:", error);
    UI.showToast("Failed to delete booking: " + error.message, "error", 4000);
  }
}

/**
 * Handle free button click
 */
function handleFreeBookingClick(event) {
  event.preventDefault();
  const bookingDataStr = this.getAttribute('data-booking');
  
  try {
    const bookingData = JSON.parse(bookingDataStr);
    showFreeConfirmationDialog(bookingData);
  } catch (error) {
    console.error("Error parsing booking data:", error);
    UI.showToast("Error processing booking data", "error", 3000);
  }
}

/**
 * Show confirmation dialog for marking a booking as free
 */
function showFreeConfirmationDialog(bookingData) {
  const shootName = bookingData.shootName || "-";
  const date = formatShortDate(bookingData.date) || "-";
  const fromTime = formatTime(bookingData.fromTime);
  const toTime = formatTime(bookingData.toTime);
  const timeRange = (fromTime !== "-" || toTime !== "-") ? `${fromTime} - ${toTime}` : "-";
  
  // Set booking details in modal
  document.getElementById('freeModalShootName').textContent = shootName;
  document.getElementById('freeModalDate').textContent = date;
  document.getElementById('freeModalTime').textContent = timeRange;
  
  // Store booking data in modal for later use
  const modal = document.getElementById('freeConfirmationModal');
  modal.dataset.bookingData = JSON.stringify(bookingData);
  
  // Show modal
  modal.classList.add('modal-open');
}

/**
 * Close free confirmation modal
 */
function closeFreeModal() {
  const modal = document.getElementById('freeConfirmationModal');
  modal.classList.remove('modal-open');
}

/**
 * Handle free modal cancel button
 */
function handleFreeCancel() {
  closeFreeModal();
}

/**
 * Handle free modal OK button
 */
function handleFreeConfirm() {
  // Get booking data from modal
  const modal = document.getElementById('freeConfirmationModal');
  const bookingDataStr = modal.dataset.bookingData;
  
  try {
    const bookingData = JSON.parse(bookingDataStr);
    closeFreeModal();
    markBookingFree(bookingData);
  } catch (error) {
    console.error("Error parsing booking data:", error);
    UI.showToast("Error processing booking data", "error", 3000);
  }
}

/**
 * Save freed booking to localStorage
 */
function saveFreedBooking(bookingId, freePersonList) {
  try {
    let freedBookings = JSON.parse(localStorage.getItem('freedBookings')) || {};
    freedBookings[bookingId] = freePersonList;
    localStorage.setItem('freedBookings', JSON.stringify(freedBookings));
    console.log("✓ Freed booking saved to localStorage:", { bookingId, freePersonList });
    console.log("📦 All freed bookings:", freedBookings);
  } catch (error) {
    console.error("Error saving freed booking:", error);
  }
}

/**
 * Get freed bookings from localStorage
 */
function getFreedBookings() {
  try {
    return JSON.parse(localStorage.getItem('freedBookings')) || {};
  } catch (error) {
    console.error("Error getting freed bookings:", error);
    return {};
  }
}

/**
 * Check if current user is in the freed list for a booking
 */
function isUserFreedFromBooking(bookingId, currentUserName) {
  const freedBookings = getFreedBookings();
  const freePersonList = freedBookings[bookingId];
  
  if (!freePersonList || !currentUserName) return false;
  
  // Parse comma-separated list and check if user is in it (case-insensitive)
  const freePersonArray = freePersonList
    .split(',')
    .map(name => name.trim().toLowerCase());
  
  const userNameLower = String(currentUserName).trim().toLowerCase();
  const isFreed = freePersonArray.includes(userNameLower);
  
  if (isFreed) {
    console.log(`✓ User ${currentUserName} is freed from booking ${bookingId}`, { freePersonArray, userNameLower });
  }
  
  return isFreed;
}

/**
 * Mark booking as free by sending webhook to n8n
 */
async function markBookingFree(bookingData) {
  try {
    const user = AUTH.getCurrentUser();
    
    // Prepare webhook payload
    const payload = {
      action: 'free',
      command: '/creator_exit_shoot',
      booking: {
        bookingId: bookingData.bookingId,
        shootName: bookingData.shootName,
        type: bookingData.type,
        bIpName: bookingData.bIpName,
        date: bookingData.date,
        fromTime: bookingData.fromTime,
        toTime: bookingData.toTime,
        role: bookingData.role,
        creator: bookingData.creator,
        location: bookingData.location,
        dop: bookingData.dop,
        cast: bookingData.cast,
        noOfShoot: bookingData.noOfShoot
      },
      user: {
        name: user?.name || "-",
        role: user?.role || "-",
        email: user?.email || "-"
      }
    };

    console.log("📤 Sending free booking webhook:", payload);
    
    // Show loading indicator
    UI.showToast("Marking shoot as free...", "info", 2000);
    
    // Send webhook
    const response = await API.postToN8n(payload);
    
    console.log("✓ Free booking response:", response);
    
    // Store freed booking data in localStorage
    if (response) {
      let freedData = response;
      
      // Handle array response
      if (Array.isArray(response) && response.length > 0) {
        freedData = response[0];
      }
      
      if (freedData["Booking ID"] && freedData["Free person"]) {
        console.log("📝 Saving freed booking:", freedData);
        saveFreedBooking(freedData["Booking ID"], freedData["Free person"]);
      }
    }
    
    // Show success and reload bookings
    UI.showToast("Shoot marked as free successfully!", "success", 3000);
    
    // Reload bookings after a short delay
    setTimeout(() => {
      const user = AUTH.getCurrentUser();
      const role = user?.role || user?.designation || "creator";
      const name = user?.name || user?.Name || user?.employee || "";
      loadUserBookings(name, role);
    }, 1500);
    
  } catch (error) {
    console.error("❌ Error marking booking as free:", error);
    UI.showToast("Failed to mark shoot as free: " + error.message, "error", 4000);
  }
}

/**
 * Initialize free confirmation modal event listeners
 */
function initializeFreeModal() {
  const modal = document.getElementById('freeConfirmationModal');
  const cancelBtn = document.getElementById('freeModalCancelBtn');
  const okBtn = document.getElementById('freeModalOkBtn');
  
  // Cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleFreeCancel);
  }
  
  // OK button
  if (okBtn) {
    okBtn.addEventListener('click', handleFreeConfirm);
  }
  
  // Close modal when clicking outside
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeFreeModal();
      }
    });
  }
}