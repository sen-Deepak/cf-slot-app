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
  
  // Check if user is admin - if so, redirect to admin dashboard
  const user = AUTH.getCurrentUser();
  if (user && user.role === 'Admin') {
    window.location.href = '/todays-shoots.html';
    return;
  }
  
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
  // Initialize edit modal listeners
  initializeEditModal();
  // Initialize complete modal listeners
  initializeCompleteModal();
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

/**
 * Detect link type and return icon SVG and type
 */
function getLinkIconInfo(url) {
  const urlLower = String(url).toLowerCase();
  
  // PDF
  if (urlLower.includes(".pdf") || urlLower.includes("pdf")) {
    return {
      type: "pdf",
      svg: '<path d="M4 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2zm0 1h8a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1"/><path d="M4.603 12.087a.8.8 0 0 1-.438-.42c-.195-.388-.13-.776.08-1.102.198-.307.526-.568.897-.787a7.7 7.7 0 0 1 1.482-.645 20 20 0 0 0 1.062-2.227 7.3 7.3 0 0 1-.43-1.295c-.086-.4-.119-.796-.046-1.136.075-.354.274-.672.65-.823.192-.077.4-.12.602-.077a.7.7 0 0 1 .477.365c.088.164.12.356.127.538.007.187-.012.395-.047.614-.084.51-.27 1.134-.52 1.794a11 11 0 0 0 .98 1.686 5.8 5.8 0 0 1 1.334.05c.364.065.734.195.96.465.12.144.193.32.2.518.007.192-.047.382-.138.563a1.04 1.04 0 0 1-.354.416.86.86 0 0 1-.51.138c-.331-.014-.654-.196-.933-.417a5.7 5.7 0 0 1-.911-.95 11.6 11.6 0 0 0-1.997.406 11.3 11.3 0 0 1-1.021 1.51c-.29.35-.608.655-.926.787a.8.8 0 0 1-.58.029m1.379-1.901q-.25.115-.459.238c-.328.194-.541.383-.647.547-.094.145-.096.25-.04.361q.016.032.026.044l.035-.012c.137-.056.355-.235.635-.572a8 8 0 0 0 .45-.606m1.64-1.33a13 13 0 0 1 1.01-.193 12 12 0 0 1-.51-.858 21 21 0 0 1-.5 1.05zm2.446.45q.226.244.435.41c.24.19.407.253.498.256a.1.1 0 0 0 .07-.015.3.3 0 0 0 .094-.125.44.44 0 0 0 .059-.2.1.1 0 0 0-.026-.063c-.052-.062-.2-.152-.518-.209a4 4 0 0 0-.612-.053zM8.078 5.8a7 7 0 0 0 .2-.828q.046-.282.038-.465a.6.6 0 0 0-.032-.198.5.5 0 0 0-.145.04c-.087.035-.158.106-.196.283-.04.192-.03.469.046.822q.036.167.09.346z"/>'
    };
  }
  
  // Google Sheets
  if (urlLower.includes("docs.google.com/spreadsheets")) {
    return {
      type: "sheets",
      svg: '<path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zm15 2h-4v3h4zm0 4h-4v3h4zm0 4h-4v3h3a1 1 0 0 0 1-1zm-5 3v-3H6v3zm-5 0v-3H1v2a1 1 0 0 0 1 1zm-4-4h4V8H1zm0-4h4V4H1zm5-3v3h4V4zm4 4H6v3h4z"/>'
    };
  }
  
  // Google Slides (must come before generic document)
  if (urlLower.includes("docs.google.com/presentation")) {
    return {
      type: "slides",
      svg: '<path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1"/><path d="M6 5a1 1 0 0 1 1-1h1.188a2.75 2.75 0 0 1 0 5.5H7v2a.5.5 0 0 1-1 0zm1 3.5h1.188a1.75 1.75 0 1 0 0-3.5H7z"/>'
    };
  }
  
  // PowerPoint
  if (urlLower.includes(".ppt") || urlLower.includes(".pptx") || urlLower.includes("powerpoint")) {
    return {
      type: "ppt",
      svg: '<path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1"/><path d="M6 5a1 1 0 0 1 1-1h1.188a2.75 2.75 0 0 1 0 5.5H7v2a.5.5 0 0 1-1 0zm1 3.5h1.188a1.75 1.75 0 1 0 0-3.5H7z"/>'
    };
  }
  
  // Google Docs (generic document)
  if (urlLower.includes("docs.google.com/document")) {
    return {
      type: "docs",
      svg: '<path fill-rule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2v-1a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zm-7.839 9.166v.522q0 .384-.117.641a.86.86 0 0 1-.322.387.9.9 0 0 1-.469.126.9.9 0 0 1-.471-.126.87.87 0 0 1-.32-.386 1.55 1.55 0 0 1-.117-.642v-.522q0-.386.117-.641a.87.87 0 0 1 .32-.387.87.87 0 0 1 .471-.129q.264 0 .469.13a.86.86 0 0 1 .322.386q.117.255.117.641m.803.519v-.513q0-.565-.205-.972a1.46 1.46 0 0 0-.589-.63q-.381-.22-.917-.22-.533 0-.92.22a1.44 1.44 0 0 0-.589.627q-.204.406-.205.975v.513q0 .563.205.973.205.406.59.627.386.216.92.216.535 0 .916-.216.383-.22.59-.627.204-.41.204-.973M0 11.926v4h1.459q.603 0 .999-.238a1.45 1.45 0 0 0 .595-.689q.196-.45.196-1.084 0-.63-.196-1.075a1.43 1.43 0 0 0-.59-.68q-.395-.234-1.004-.234zm.791.645h.563q.371 0 .609.152a.9.9 0 0 1 .354.454q.118.302.118.753a2.3 2.3 0 0 1-.068.592 1.1 1.1 0 0 1-.196.422.8.8 0 0 1-.334.252 1.3 1.3 0 0 1-.483.082H.79V12.57Zm7.422.483a1.7 1.7 0 0 0-.103.633v.495q0 .369.103.627a.83.83 0 0 0 .298.393.85.85 0 0 0 .478.131.9.9 0 0 0 .401-.088.7.7 0 0 0 .273-.248.8.8 0 0 0 .117-.364h.765v.076a1.27 1.27 0 0 1-.226.674q-.205.29-.55.454a1.8 1.8 0 0 1-.786.164q-.54 0-.914-.216a1.4 1.4 0 0 1-.571-.627q-.194-.408-.194-.976v-.498q0-.568.197-.978.195-.411.571-.633.378-.223.911-.223.328 0 .607.097.28.093.489.272a1.33 1.33 0 0 1 .466.964v.073H9.78a.85.85 0 0 0-.12-.38.7.7 0 0 0-.273-.261.8.8 0 0 0-.398-.097.8.8 0 0 0-.475.138.87.87 0 0 0-.301.398"/>'
    };
  }
  
  // Canva
  if (urlLower.includes("canva.com")) {
    return {
      type: "canva",
      svg: '<path d="M8 2C4.14 2 1 5.13 1 9s3.14 7 7 7 7-3.13 7-7-3.14-7-7-7zm0 12c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>'
    };
  }
  
  // Default for other links
  return {
    type: "other",
    svg: '<path fill-rule="evenodd" d="M14 4.5V14a2 2 0 0 1-2 2v-1a1 1 0 0 0 1-1V4.5h-2A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v9H2V2a2 2 0 0 1 2-2h5.5zm-7.839 9.166v.522q0 .384-.117.641a.86.86 0 0 1-.322.387.9.9 0 0 1-.469.126.9.9 0 0 1-.471-.126.87.87 0 0 1-.32-.386 1.55 1.55 0 0 1-.117-.642v-.522q0-.386.117-.641a.87.87 0 0 1 .32-.387.87.87 0 0 1 .471-.129q.264 0 .469.13a.86.86 0 0 1 .322.386q.117.255.117.641m.803.519v-.513q0-.565-.205-.972a1.46 1.46 0 0 0-.589-.63q-.381-.22-.917-.22-.533 0-.92.22a1.44 1.44 0 0 0-.589.627q-.204.406-.205.975v.513q0 .563.205.973.205.406.59.627.386.216.92.216.535 0 .916-.216.383-.22.59-.627.204-.41.204-.973M0 11.926v4h1.459q.603 0 .999-.238a1.45 1.45 0 0 0 .595-.689q.196-.45.196-1.084 0-.63-.196-1.075a1.43 1.43 0 0 0-.59-.68q-.395-.234-1.004-.234zm.791.645h.563q.371 0 .609.152a.9.9 0 0 1 .354.454q.118.302.118.753a2.3 2.3 0 0 1-.068.592 1.1 1.1 0 0 1-.196.422.8.8 0 0 1-.334.252 1.3 1.3 0 0 1-.483.082H.79V12.57Zm7.422.483a1.7 1.7 0 0 0-.103.633v.495q0 .369.103.627a.83.83 0 0 0 .298.393.85.85 0 0 0 .478.131.9.9 0 0 0 .401-.088.7.7 0 0 0 .273-.248.8.8 0 0 0 .117-.364h.765v.076a1.27 1.27 0 0 1-.226.674q-.205.29-.55.454a1.8 1.8 0 0 1-.786.164q-.54 0-.914-.216a1.4 1.4 0 0 1-.571-.627q-.194-.408-.194-.976v-.498q0-.568.197-.978.195-.411.571-.633.378-.223.911-.223.328 0 .607.097.28.093.489.272a1.33 1.33 0 0 1 .466.964v.073H9.78a.85.85 0 0 0-.12-.38.7.7 0 0 0-.273-.261.8.8 0 0 0-.398-.097.8.8 0 0 0-.475.138.87.87 0 0 0-.301.398"/>'
  };
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
      const taskType = booking["Task Type"] ?? booking["Task type"] ?? "-";
      const taskName = booking["Task Name"] ?? booking["Task name"] ?? "-";
      const remark1 = booking["Remark 1"] ?? "-";
      const remark2 = booking["Remark 2"] ?? "-";
      const finalStatus = booking["Final Status"] ?? booking["final status"] ?? booking["Final status"] ?? "-";
      const docLink = booking["Doc Link"] ?? "-";

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

      // Create booking data JSON string for buttons
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
        noOfShoot: noOfShoot,
        taskType: taskType,
        taskName: taskName,
        remark1: remark1,
        finalStatus: finalStatus
      };
      const bookingDataStr = escapeHtml(JSON.stringify(bookingData));

      // Check if booking is completed
      const isCompleted = String(finalStatus).trim().toLowerCase() === "completed";

      // Show delete button only if user is the shoot lead AND booking is not completed
      const deleteButtonHtml = isShootLead && !isCompleted
        ? `<button class="delete-booking-btn" data-booking='${bookingDataStr}' title="Delete this booking"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg></button>`
        : '';

      // Show edit button only if user is the shoot lead AND booking is not completed
      const editButtonHtml = isShootLead && !isCompleted
        ? `<button class="edit-booking-btn" data-booking='${bookingDataStr}' title="Edit this booking"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil" viewBox="0 0 16 16"><path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325"/></svg></button>`
        : '';

      // Show completed badge if booking is completed
      const completedBadgeHtml = isCompleted
        ? `<span class="completed-badge">✓ Completed</span>`
        : '';

      // Show complete button only if: Task Type = "Post-Production" OR "Pre-Production" AND user is shoot lead AND final_status != "Completed"
      const taskTypeNormalized = String(taskType).trim().toLowerCase();
      const completeButtonHtml = ((taskTypeNormalized === "post-production" || taskTypeNormalized === "pre-production") && isShootLead && !isCompleted)
        ? `<button class="complete-booking-btn" data-booking='${bookingDataStr}' title="Complete this shoot"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-check2-circle" viewBox="0 0 16 16"><path d="M2.5 8a5.5 5.5 0 0 1 8.25-4.764.5.5 0 0 0 .5-.866A6.5 6.5 0 1 0 14.5 8a.5.5 0 0 0-1 0 5.5 5.5 0 1 1-11 0"/><path d="M15.354 3.354a.5.5 0 0 0-.708-.708L8 9.293 5.354 6.646a.5.5 0 1 0-.708.708l3 3a.5.5 0 0 0 .708 0z"/></svg></button>`
        : '';

      // Show free button only if user is NOT the shoot lead and NOT already freed
      const freeButtonHtml = !isShootLead && !isUserFreed
        ? `<button class="free-booking-btn" data-booking='${bookingDataStr}' title="Mark this shoot as free"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-right" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0z"/><path fill-rule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708z"/></svg></button>`
        : '';

      // Show freed badge if user is freed
      const freedBadgeHtml = isUserFreed
        ? `<span class="freed-badge">Freed</span>`
        : '';

      // Function to get badge info based on task type
      function getTaskTypeBadgeInfo(type) {
        if (!type || type === "-") return { text: "", class: "" };
        const normalized = String(type).trim().toLowerCase();
        if (normalized === "pre-production") {
          return { text: "Pre-Pro", class: "task-type-badge--pre-pro" };
        } else if (normalized === "post-production") {
          return { text: "Post-Pro", class: "task-type-badge--post-pro" };
        } else if (normalized === "shoot") {
          return { text: "Shoot", class: "task-type-badge--shoot" };
        }
        return { text: "", class: "" };
      }

      const badgeInfo = getTaskTypeBadgeInfo(taskType);
      const taskTypeBadge = badgeInfo.text
        ? `<span class="task-type-badge ${badgeInfo.class}">${escapeHtml(badgeInfo.text)}</span>`
        : '';

      html += `
        <div class="${cardClass}">
          <div class="booking-header">
            <span class="booking-number">${idx + 1}</span>
            <div class="booking-title-section">
              <h4 class="booking-title">${escapeHtml(String(shootName))} · ${escapeHtml(String(bookingType))} · ${escapeHtml(String(bIpName))}</h4>
              ${freedBadgeHtml}
            </div>
            <div class="booking-header-right">
              ${isCompleted ? completedBadgeHtml : ''}
              ${isCompleted ? '' : deleteButtonHtml}
              ${isCompleted ? '' : editButtonHtml}
              ${completeButtonHtml}
              ${freeButtonHtml}
            </div>
          </div>

          <div class="booking-details">
            <div class="booking-detail-row booking-detail-row--date-badge">
              <div>
                <span class="detail-label">Date:</span>
                <span class="detail-value">${escapeHtml(String(date))}</span>
              </div>
              ${taskTypeBadge}
            </div>

            ${(() => {
              const taskTypeNor = String(taskType).trim().toLowerCase();
              const isProduction = taskTypeNor === "pre-production" || taskTypeNor === "post-production";
              
              if (isProduction) {
                // For Pre-Production and Post-Production cards
                const transformedRole = (() => {
                  const roleNor = String(role).trim().toLowerCase();
                  if (roleNor === "dop" || roleNor === "cast") {
                    return "Team";
                  } else if (roleNor === "shoot lead") {
                    return "Task Lead";
                  }
                  return String(role);
                })();

                const linkIconsHtml = (() => {
                  if (docLink === "-" || !docLink) return "";
                  const links = docLink.split(",").map(l => l.trim()).filter(l => l);
                  return links.map(url => {
                    const iconInfo = getLinkIconInfo(url);
                    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="doc-link-icon doc-link-icon--${iconInfo.type}" title="${iconInfo.type}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">${iconInfo.svg}</svg></a>`;
                  }).join("");
                })();

                let productionHtml = `
                  <div class="booking-detail-row">
                    <span class="detail-label">Task Name:</span>
                    <span class="detail-value">${escapeHtml(String(taskName))}</span>
                  </div>

                  <div class="booking-detail-row">
                    <span class="detail-label">Time:</span>
                    <span class="detail-value">${escapeHtml(fromTime)} - ${escapeHtml(toTime)}</span>
                  </div>

                  <div class="booking-detail-row">
                    <span class="detail-label">Task Count:</span>
                    <span class="detail-value">${escapeHtml(String(noOfShoot))}</span>
                  </div>

                  <div class="booking-detail-row">
                    <span class="detail-label">Your Role:</span>
                    <span class="detail-value">${escapeHtml(transformedRole)}</span>
                  </div>

                  <div class="booking-detail-row">
                    <span class="detail-label">Task Lead:</span>
                    <span class="detail-value">${escapeHtml(String(shootLead))}</span>
                  </div>

                  <div class="booking-detail-row">
                    <span class="detail-label">Team:</span>
                    <span class="detail-value">${escapeHtml(String(cast))}</span>
                  </div>

                  <div class="booking-detail-row">
                    <span class="detail-label">Remark 1:</span>
                    <span class="detail-value">${escapeHtml(String(remark1))}</span>
                  </div>`;
                
                if (isCompleted) {
                  productionHtml += `
                  <div class="booking-detail-row">
                    <span class="detail-label">Remark 2:</span>
                    <span class="detail-value">${escapeHtml(String(remark2))}</span>
                  </div>`;
                }
                
                if (linkIconsHtml) {
                  productionHtml += `<div class="booking-detail-row"><span class="detail-label">Documents:</span><div class="doc-links-container">${linkIconsHtml}</div></div>`;
                }
                
                return productionHtml;
              } else {
                // For Shoot cards (original layout)
                return `
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
                `;
              }
            })()}
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
    // Attach edit button event listeners
    attachEditButtonListeners();
    // Attach complete button event listeners
    attachCompleteButtonListeners();

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
 * Attach event listeners to edit buttons
 */
function attachEditButtonListeners() {
  const editButtons = document.querySelectorAll('.edit-booking-btn');
  editButtons.forEach(btn => {
    btn.addEventListener('click', handleEditBookingClick);
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
 * Handle edit button click
 */
function handleEditBookingClick(event) {
  event.preventDefault();
  const bookingDataStr = this.getAttribute('data-booking');
  
  try {
    const bookingData = JSON.parse(bookingDataStr);
    
    console.log("✅ Edit booking allowed anytime");
    initiateEditBooking(bookingData);
  } catch (error) {
    console.error("Error parsing booking data:", error);
    UI.showToast("Error processing booking data", "error", 3000);
  }
}

/**
 * Parse shoot date and time into a Date object for comparison
 */
function parseShootDateTime(dateStr, timeStr) {
  try {
    // Parse date: "25 Feb 26" → Date object
    const date = new Date(dateStr);
    
    // Extract time from multiple possible formats
    let hours = 0, minutes = 0;
    
    // Try HH:MM format first
    const hhmmMatch = String(timeStr).match(/(\d{1,2}):(\d{2})/);
    if (hhmmMatch) {
      hours = parseInt(hhmmMatch[1], 10);
      minutes = parseInt(hhmmMatch[2], 10);
    }
    // Try full datetime format
    else {
      const timeObj = new Date(timeStr);
      if (!isNaN(timeObj.getTime())) {
        hours = timeObj.getHours();
        minutes = timeObj.getMinutes();
      }
    }
    
    // Set time on date
    date.setHours(hours, minutes, 0, 0);
    return date;
  } catch (e) {
    console.error("Error parsing shoot datetime:", e);
    return new Date(2099, 0, 1); // Far future if parsing fails
  }
}

/**
 * Extract just the name from "Name - Role" format
 * Example: "Yuvraj Singh Solanki - Creator" → "Yuvraj Singh Solanki"
 */
function extractNameOnly(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return fullName;
  }
  const match = fullName.match(/^(.+?)\s*-\s*[^-]+$/);
  return match ? match[1].trim() : fullName.trim();
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

/**
 * Convert date to YYYY-MM-DD format for webhook
 */
function formatDateForWebhook(dateValue) {
  try {
    if (!dateValue || dateValue === "-") return "-";
    
    const s = String(dateValue).trim();
    
    // Parse date - handles "25 Feb 26", "2026-02-25", etc.
    let d = new Date(s);
    
    if (isNaN(d.getTime())) {
      // Try parsing "DD MMM YY" format
      const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2})$/);
      if (m) {
        const day = m[1];
        const month = m[2];
        const year = 2000 + parseInt(m[3], 10);
        d = new Date(`${month} ${day} ${year}`);
      }
    }
    
    if (isNaN(d.getTime())) return s;
    
    // Format as YYYY-MM-DD
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Error formatting date for webhook:", error);
    return String(dateValue);
  }
}

/**
 * Extract HH:MM time from full datetime string for webhook
 */
function formatTimeForWebhook(timeValue) {
  try {
    if (!timeValue || timeValue === "-") return "-";
    
    const s = String(timeValue).trim();
    
    // If already in HH:MM format, return it
    if (/^\d{2}:\d{2}$/.test(s)) {
      return s;
    }
    
    // If it's a full datetime string like "Sat Dec 30 1899 12:00:00 GMT..."
    const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (timeMatch) {
      const hour = String(timeMatch[1]).padStart(2, '0');
      const minute = timeMatch[2];
      return `${hour}:${minute}`;
    }
    
    return s;
  } catch (error) {
    console.error("Error formatting time for webhook:", error);
    return String(timeValue);
  }
}

/**
 * Initiate edit booking - send first webhook to lock and get available users
 */
async function initiateEditBooking(bookingData) {
  try {
    const user = AUTH.getCurrentUser();
    
    // Store booking data for later use
    const editState = {
      bookingData: bookingData,
      originalDops: [],
      originalCast: [],
      originalNoOfShoot: bookingData.noOfShoot || "1",
      selectedDops: new Set(),
      selectedCast: new Set(),
      availableDops: [],
      availableCast: []
    };
    
    // Show loading
    showEditModal(bookingData, editState);
    
    // Prepare first webhook payload (same as lock date and time)
    const payload = {
      action: 'booking_lock',
      command: '/slot_booking',
      user: {
        name: user?.name || "-",
        role: user?.role || "-",
        email: user?.email || "-"
      },
      dateKey: formatDateForWebhook(bookingData.date),
      fromTime: formatTimeForWebhook(bookingData.fromTime),
      toTime: formatTimeForWebhook(bookingData.toTime)
    };
    
    console.log("📤 Sending edit booking lock webhook:", payload);
    
    // Send first webhook
    const response = await API.postToN8n(payload);
    
    console.log("✓ Lock response:", response);
    console.log("   Response type:", typeof response);
    console.log("   Is array?:", Array.isArray(response));
    console.log("   Is null?:", response === null);
    console.log("   Is undefined?:", response === undefined);
    console.log("   JSON.stringify:", JSON.stringify(response));
    
    if (response) {
      console.log("   Response keys:", Object.keys(response));
      if (Array.isArray(response)) {
        console.log("   Array length:", response.length);
        if (response.length > 0) {
          console.log("   First item:", response[0]);
          console.log("   First item keys:", Object.keys(response[0]));
        }
      }
    }
    
    // Parse response to get available users
    // Response could be in different formats - handle both
    let dopsData = [];
    let castData = [];
    let namesArray = [];
    
    if (response) {
      console.log("📊 Parsing response...");
      
      // Try to extract names array from response
      // Format 1: response has direct "name" property
      if (response.name && Array.isArray(response.name)) {
        console.log("✓ Found response.name array");
        namesArray = response.name;
      }
      // Format 2: response is an array with first item having "name"
      else if (Array.isArray(response) && response.length > 0 && response[0].name && Array.isArray(response[0].name)) {
        console.log("✓ Found response[0].name array");
        namesArray = response[0].name;
      }
      // Format 3: response is the array itself
      else if (Array.isArray(response)) {
        console.log("✓ Response is direct array");
        namesArray = response;
      }
      
      console.log("📋 Names array extracted:", namesArray);
      console.log("   Array length:", namesArray.length);
      
      // Separate DOPs and Cast
      if (namesArray.length > 0) {
        dopsData = namesArray.filter(name => name && String(name).includes('DOP'));
        castData = namesArray;  // Full list for cast (could include DOPs)
        console.log("✓ Separated DOP/Cast:", { dopsCount: dopsData.length, castCount: castData.length });
      }
    } else {
      console.log("⚠️ WARNING: Response is null/undefined/empty!");
    }
    
    editState.availableDops = dopsData;
    editState.availableCast = castData;
    
    console.log("✅ Available users:", { availableDops: editState.availableDops, availableCast: editState.availableCast });
    
    // Set original selections from booking data
    console.log("📌 Booking data - dop:", bookingData.dop, "| cast:", bookingData.cast);
    
    editState.originalDops = (bookingData.dop && typeof bookingData.dop === 'string') 
      ? bookingData.dop.split(',').map(d => d.trim()).filter(d => d)
      : [];
    editState.originalCast = (bookingData.cast && typeof bookingData.cast === 'string')
      ? bookingData.cast.split(',').map(c => c.trim()).filter(c => c)
      : [];
    
    console.log("✓ Parsed original DOPs:", editState.originalDops);
    console.log("✓ Parsed original Cast:", editState.originalCast);
    
    // Add currently assigned DOP/Cast to available lists if not already there
    editState.originalDops.forEach(dop => {
      if (!editState.availableDops.includes(dop)) {
        editState.availableDops.unshift(dop);
        console.log("➕ Added current DOP to available:", dop);
      }
    });
    
    editState.originalCast.forEach(cast => {
      if (!editState.availableCast.includes(cast)) {
        editState.availableCast.unshift(cast);
        console.log("➕ Added current Cast to available:", cast);
      }
    });
    
    console.log("✓ Updated available DOPs:", editState.availableDops);
    console.log("✓ Updated available Cast:", editState.availableCast);
    
    // Initialize selected with original
    editState.selectedDops = new Set(editState.originalDops);
    editState.selectedCast = new Set(editState.originalCast);
    
    console.log("✓ Selected DOPs Set:", Array.from(editState.selectedDops));
    console.log("✓ Selected Cast Set:", Array.from(editState.selectedCast));
    
    // Store in window for access in event handlers
    window.editState = editState;
    
    // Display the selections
    displayEditModal(editState);
    
  } catch (error) {
    console.error("❌ Error initiating edit booking:", error);
    UI.showToast("Failed to load edit form: " + error.message, "error", 4000);
  }
}

/**
 * Show edit modal with loading state
 */
function showEditModal(bookingData, editState) {
  const shootName = bookingData.shootName || "-";
  const date = formatShortDate(bookingData.date) || "-";
  const fromTime = formatTime(bookingData.fromTime);
  const toTime = formatTime(bookingData.toTime);
  const timeRange = (fromTime !== "-" || toTime !== "-") ? `${fromTime} - ${toTime}` : "-";
  
  // Set booking details
  document.getElementById('editModalShootName').textContent = shootName;
  document.getElementById('editModalDate').textContent = date;
  document.getElementById('editModalTime').textContent = timeRange;
  
  // Show loading in lists
  document.getElementById('dopList').innerHTML = '<p class="loading-text">Loading DOP list...</p>';
  document.getElementById('castList').innerHTML = '<p class="loading-text">Loading cast list...</p>';
  
  // Show modal
  const modal = document.getElementById('editBookingModal');
  modal.classList.add('modal-open');
}

/**
 * Display edit modal with available selections
 */
function displayEditModal(editState) {
  console.log("🎨 Displaying edit modal with state:", editState);
  
  const dopListContainer = document.getElementById('dopList');
  const castListContainer = document.getElementById('castList');
  
  console.log("📦 Containers found?:", { dopListContainer: !!dopListContainer, castListContainer: !!castListContainer });
  
  if (!dopListContainer || !castListContainer) {
    console.error("❌ Modal containers not found!");
    return;
  }
  
  // Build DOP list
  let dopHtml = '';
  console.log("🔍 Available DOPs:", editState.availableDops, "Type:", typeof editState.availableDops);
  console.log("🔍 Selected DOPs:", Array.from(editState.selectedDops));
  
  if (editState.availableDops && editState.availableDops.length > 0) {
    dopHtml = editState.availableDops.map(dop => {
      const dopTrimmed = dop ? String(dop).trim() : dop;
      const dopNameOnly = extractNameOnly(dopTrimmed);  // Display only name, not designation
      const isChecked = editState.selectedDops.has(dopTrimmed);
      console.log(`  📍 DOP: "${dopTrimmed}" (display: "${dopNameOnly}") | Checked:`, isChecked);
      return `
        <div class="team-member">
          <input type="checkbox" id="dop-${escapeHtml(dopTrimmed)}" class="dop-checkbox" value="${escapeHtml(dopTrimmed)}" ${isChecked ? 'checked' : ''}>
          <label for="dop-${escapeHtml(dopTrimmed)}">${escapeHtml(dopNameOnly)}</label>
        </div>
      `;
    }).join('');
  } else {
    dopHtml = '<p class="loading-text">No DOP available</p>';
  }
  dopListContainer.innerHTML = dopHtml;
  console.log("✅ DOP HTML set");
  
  // Build Cast list
  let castHtml = '';
  console.log("🔍 Available Cast:", editState.availableCast, "Type:", typeof editState.availableCast);
  console.log("🔍 Selected Cast:", Array.from(editState.selectedCast));
  
  if (editState.availableCast && editState.availableCast.length > 0) {
    castHtml = editState.availableCast.map(cast => {
      const castTrimmed = cast ? String(cast).trim() : cast;
      const castNameOnly = extractNameOnly(castTrimmed);  // Display only name, not designation
      const isChecked = editState.selectedCast.has(castTrimmed);
      console.log(`  📍 Cast: "${castTrimmed}" (display: "${castNameOnly}") | Checked:`, isChecked);
      return `
        <div class="team-member">
          <input type="checkbox" id="cast-${escapeHtml(castTrimmed)}" class="cast-checkbox" value="${escapeHtml(castTrimmed)}" ${isChecked ? 'checked' : ''}>
          <label for="cast-${escapeHtml(castTrimmed)}">${escapeHtml(castNameOnly)}</label>
        </div>
      `;
    }).join('');
  } else {
    castHtml = '<p class="loading-text">No cast available</p>';
  }
  castListContainer.innerHTML = castHtml;
  console.log("✅ Cast HTML set");
  
  // Set No Of Shoot dropdown value
  const noOfShootSelect = document.getElementById('noOfShootSelect');
  if (noOfShootSelect) {
    noOfShootSelect.value = editState.originalNoOfShoot || "1";
    console.log("✅ No Of Shoot dropdown set to:", noOfShootSelect.value);
  }
  
  // Attach checkbox listeners
  attachEditCheckboxListeners();
}

/**
 * Attach listeners to checkboxes in edit modal
 */
function attachEditCheckboxListeners() {
  // DOP checkboxes
  const dopCheckboxes = document.querySelectorAll('.dop-checkbox');
  dopCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const dopName = e.target.value;
      if (e.target.checked) {
        window.editState.selectedDops.add(dopName);
      } else {
        window.editState.selectedDops.delete(dopName);
      }
    });
  });
  
  // Cast checkboxes
  const castCheckboxes = document.querySelectorAll('.cast-checkbox');
  castCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const castName = e.target.value;
      if (e.target.checked) {
        window.editState.selectedCast.add(castName);
      } else {
        window.editState.selectedCast.delete(castName);
      }
    });
  });
}

/**
 * Close edit modal
 */
function closeEditModal() {
  const modal = document.getElementById('editBookingModal');
  modal.classList.remove('modal-open');
  window.editState = null;
}

/**
 * Initialize edit modal event listeners
 */
function initializeEditModal() {
  const cancelBtn = document.getElementById('editModalCancelBtn');
  const updateBtn = document.getElementById('editModalUpdateBtn');
  const modal = document.getElementById('editBookingModal');
  
  // Cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeEditModal);
  }
  
  // Update button
  if (updateBtn) {
    updateBtn.addEventListener('click', handleUpdateBookingClick);
  }
  
  // Close modal when clicking outside
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeEditModal();
      }
    });
  }
}

/**
 * Handle Update Booking button click
 */
async function handleUpdateBookingClick() {
  if (!window.editState) {
    UI.showToast("Error: Edit state not found", "error", 3000);
    return;
  }
  
  try {
    const editState = window.editState;
    
    // Get new No Of Shoot value from dropdown
    const noOfShootSelect = document.getElementById('noOfShootSelect');
    const newNoOfShoot = noOfShootSelect ? noOfShootSelect.value : editState.originalNoOfShoot;
    
    console.log("📊 No Of Shoot change:");
    console.log("  Old:", editState.originalNoOfShoot);
    console.log("  New:", newNoOfShoot);
    
    // Calculate differences
    const removeUsers = [];
    const addUsers = [];
    
    // Find users to remove (in original but not in selected)
    editState.originalDops.forEach(dop => {
      if (!editState.selectedDops.has(dop)) {
        removeUsers.push(extractNameOnly(dop));
      }
    });
    editState.originalCast.forEach(cast => {
      if (!editState.selectedCast.has(cast)) {
        removeUsers.push(extractNameOnly(cast));
      }
    });
    
    // Find users to add (in selected but not in original)
    editState.selectedDops.forEach(dop => {
      if (!editState.originalDops.includes(dop)) {
        addUsers.push(extractNameOnly(dop));
      }
    });
    editState.selectedCast.forEach(cast => {
      if (!editState.originalCast.includes(cast)) {
        addUsers.push(extractNameOnly(cast));
      }
    });
    
    console.log("📋 Team changes:", { removeUsers, addUsers });
    
    // Check if No Of Shoot changed
    const noOfShootChanged = String(newNoOfShoot) !== String(editState.originalNoOfShoot);
    
    // If no changes, just close modal
    if (removeUsers.length === 0 && addUsers.length === 0 && !noOfShootChanged) {
      UI.showToast("No changes made", "info", 2000);
      closeEditModal();
      return;
    }
    
    // Send second webhook with changes
    await submitUpdatedBooking(editState.bookingData, editState, removeUsers, addUsers, newNoOfShoot);
    
  } catch (error) {
    console.error("❌ Error updating booking:", error);
    UI.showToast("Failed to update booking: " + error.message, "error", 4000);
  }
}

/**
 * Submit updated booking to webhook
 */
async function submitUpdatedBooking(bookingData, editState, removeUsers, addUsers, newNoOfShoot) {
  try {
    const user = AUTH.getCurrentUser();
    
    // Get old DOP and Cast (before changes) - names only
    const oldDop = bookingData.dop ? extractNameOnly(bookingData.dop) : "";
    const oldCast = bookingData.cast ? bookingData.cast.split(',').map(c => extractNameOnly(c.trim())).join(", ") : "";
    
    // Get final selected DOP and Cast lists with names only (no designations)
    const newDop = Array.from(editState.selectedDops).map(extractNameOnly).join(", ");
    const newCast = Array.from(editState.selectedCast).map(extractNameOnly).join(", ");
    
    console.log("📊 Team Changes (names only):");
    console.log("  🎥 Old DOP:", oldDop);
    console.log("  🎥 New DOP:", newDop);
    console.log("  🎬 Old Cast:", oldCast);
    console.log("  🎬 New Cast:", newCast);
    console.log("  📊 Old No Of Shoot:", editState.originalNoOfShoot);
    console.log("  📊 New No Of Shoot:", newNoOfShoot);
    
    // Prepare second webhook payload
    const payload = {
      action: 'update_booking',
      command: '/Update_booking',
      booking: {
        bookingId: bookingData.bookingId,
        shootName: bookingData.shootName,
        type: bookingData.type,
        bIpName: bookingData.bIpName,
        date: formatDateForWebhook(bookingData.date),
        fromTime: formatTimeForWebhook(bookingData.fromTime),
        toTime: formatTimeForWebhook(bookingData.toTime),
        role: bookingData.role,
        creator: bookingData.creator,
        location: bookingData.location,
        oldDop: oldDop,
        newDop: newDop,
        oldCast: oldCast,
        newCast: newCast,
        oldNoOfShoot: editState.originalNoOfShoot,
        newNoOfShoot: newNoOfShoot,
        noOfShoot: newNoOfShoot
      },
      removeUsers: removeUsers,
      addUsers: addUsers,
      user: {
        name: user?.name || "-",
        role: user?.role || "-",
        email: user?.email || "-"
      }
    };
    
    console.log("📤 Sending update booking webhook:", payload);
    
    // Show loading indicator
    UI.showToast("Updating booking...", "info", 2000);
    
    // Send webhook
    const response = await API.postToN8n(payload);
    
    console.log("✓ Update booking response:", response);
    
    // Show success and reload bookings
    UI.showToast("Booking updated successfully!", "success", 3000);
    
    // Close modal
    closeEditModal();
    
    // Reload bookings after a short delay
    setTimeout(() => {
      const user = AUTH.getCurrentUser();
      const role = user?.role || user?.designation || "creator";
      const name = user?.name || user?.Name || user?.employee || "";
      loadUserBookings(name, role);
    }, 1500);
    
  } catch (error) {
    console.error("❌ Error submitting update:", error);
    UI.showToast("Failed to update booking: " + error.message, "error", 4000);
  }
}

// ==================== Complete Booking Modal Functions ====================

function initializeCompleteModal() {
  const modal = document.getElementById('completeBookingModal');
  const cancelBtn = document.getElementById('completeModalCancelBtn');
  const completeBtn = document.getElementById('completeModalCompleteBtn');
  const addLinkBtn = document.getElementById('addLinkBtn');
  const remark2Input = document.getElementById('remark2Input');
  const remark2CharCount = document.getElementById('remark2CharCount');

  // Add character counter for remark2
  remark2Input?.addEventListener('input', () => {
    remark2CharCount.textContent = remark2Input.value.length;
  });

  cancelBtn?.addEventListener('click', closeCompleteModal);
  completeBtn?.addEventListener('click', submitCompleteBooking);
  addLinkBtn?.addEventListener('click', addLinkField);

  // Close modal when clicking outside
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeCompleteModal();
    }
  });
}

function attachCompleteButtonListeners() {
  const completeButtons = document.querySelectorAll('.complete-booking-btn');
  completeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const bookingDataStr = btn.getAttribute('data-booking');
      try {
        const bookingData = JSON.parse(bookingDataStr);
        openCompleteModal(bookingData);
      } catch (error) {
        console.error('Failed to parse booking data:', error);
      }
    });
  });
}

function openCompleteModal(bookingData) {
  const modal = document.getElementById('completeBookingModal');
  
  // Populate modal with booking details
  document.getElementById('completeModalShootName').textContent = bookingData.shootName || '-';
  document.getElementById('completeModalDate').textContent = bookingData.date || '-';
  
  // Format time correctly using the same formatTime function
  const fromTime = formatTime(bookingData.fromTime);
  const toTime = formatTime(bookingData.toTime);
  document.getElementById('completeModalTime').textContent = `${fromTime} - ${toTime}`;

  // Clear previous form data
  document.getElementById('remark2Input').value = '';
  
  // Generate only 1 DOL link field initially
  const dolLinksContainer = document.getElementById('dolLinksContainer');
  dolLinksContainer.innerHTML = '';
  
  const linkDiv = document.createElement('div');
  linkDiv.className = 'dol-link-item';
  linkDiv.innerHTML = `
    <input 
      type="url" 
      id="dolLink_1"
      name="dol-link-1"
      class="dol-link-input" 
      placeholder="Enter valid URL (e.g., https://example.com)" 
    >
    <button type="button" class="remove-link-btn">✕</button>
  `;
  dolLinksContainer.appendChild(linkDiv);
  
  // Add remove button listener
  linkDiv.querySelector('.remove-link-btn').addEventListener('click', () => {
    linkDiv.remove();
  });

  // Store booking data for submission
  window.currentCompleteBookingData = bookingData;

  // Show modal
  modal.classList.add('modal-open');
}

function closeCompleteModal() {
  const modal = document.getElementById('completeBookingModal');
  modal.classList.remove('modal-open');
  window.currentCompleteBookingData = null;
}

function addLinkField() {
  const dolLinksContainer = document.getElementById('dolLinksContainer');
  const currentCount = dolLinksContainer.children.length + 1;
  
  const linkDiv = document.createElement('div');
  linkDiv.className = 'dol-link-item';
  linkDiv.innerHTML = `
    <input 
      type="url" 
      id="dolLink_extra_${currentCount}"
      name="dol-link-extra-${currentCount}"
      class="dol-link-input" 
      placeholder="Enter valid URL (e.g., https://example.com)" 
    >
    <button type="button" class="remove-link-btn">✕</button>
  `;
  dolLinksContainer.appendChild(linkDiv);
  
  // Add remove button listener
  linkDiv.querySelector('.remove-link-btn').addEventListener('click', () => {
    linkDiv.remove();
  });
}

async function submitCompleteBooking() {
  const bookingData = window.currentCompleteBookingData;
  if (!bookingData) {
    UI.showToast('Booking data not found', 'error', 3000);
    return;
  }

  // Get Remark 2
  const remark2 = document.getElementById('remark2Input').value.trim();
  if (!remark2) {
    UI.showToast('Remark 2 is mandatory', 'warning', 3000);
    return;
  }

  if (remark2.length > 200) {
    UI.showToast('Remark 2 cannot exceed 200 characters', 'warning', 3000);
    return;
  }

  // Get all DOL links and validate each one
  const linkInputs = document.querySelectorAll('.dol-link-input');
  const links = [];
  let hasInvalidLinks = false;

  linkInputs.forEach((input, index) => {
    const url = input.value.trim();
    if (url) {
      // Validate URL
      try {
        new URL(url);
        links.push(url);
      } catch (e) {
        hasInvalidLinks = true;
        console.error(`Invalid URL in field ${index + 1}: ${url}`);
        UI.showToast(`Link ${index + 1} is not a valid URL. Please enter a proper link (e.g., https://example.com)`, 'error', 4000);
      }
    }
  });

  // Stop if any invalid links were found
  if (hasInvalidLinks) {
    return;
  }

  try {
    // Get current user
    const user = AUTH.getCurrentUser();

    // Prepare payload
    const payload = {
      action: 'booking_complete',
      command: '/complete',
      user: {
        name: user?.name || '-',
        role: user?.role || '-',
        email: user?.email || '-'
      },
      bookingData: {
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
        noOfShoot: bookingData.noOfShoot,
        taskType: bookingData.taskType,
        taskName: bookingData.taskName,
        remark1: bookingData.remark1,
        finalStatus: bookingData.finalStatus
      },
      completeData: {
        remark2: remark2,
        links: links.join(', ')
      }
    };

    console.log('📤 Sending complete booking webhook:', payload);
    UI.showToast('Completing booking...', 'info', 2000);

    // Send webhook
    const response = await API.postToN8n(payload);
    console.log('✓ Complete booking response:', response);

    // Show success and reload
    UI.showToast('Booking completed successfully!', 'success', 3000);
    closeCompleteModal();

    // Reload bookings after a short delay
    setTimeout(() => {
      const user = AUTH.getCurrentUser();
      const role = user?.role || user?.designation || "creator";
      const name = user?.name || user?.Name || user?.employee || "";
      loadUserBookings(name, role);
    }, 1500);

  } catch (error) {
    console.error('❌ Error completing booking:', error);
    UI.showToast('Failed to complete booking: ' + error.message, 'error', 4000);
  }
}