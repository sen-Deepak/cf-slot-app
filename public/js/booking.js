/**
 * booking.js - Booking page logic
 */

import { AUTH } from './auth.js';
import { UI } from './ui.js';
import { BRANDIP_API } from './brandip-api.js';
import { API } from './api.js';

// State
let bookingState = {
    selectedDateOffset: null,
    selectedDateKey: null,
    fromTime: null,
    toTime: null,
    isLocked: false,
    allTimes: [],  // Store all available times
    dopList: [],  // All DOPs (3 items)
    castList: [],  // All employees - full list for cast section (16 items)
    selectedDops: new Set(),  // Multiple DOPs can be selected
    selectedCast: new Set(),
    brandOrIp: 'brand',  // Track which option is selected
    brandList: [],  // List of available brands
    ipList: []  // List of available IPs
};

let bookingSubmitInFlight = false;
let employeeSelectionTimeout = null;  // Track timeout for employee selection 90-second timer

document.addEventListener('DOMContentLoaded', () => {
    // Check auth first
    if (!AUTH.isAuthenticated()) {
        return;
    }

    initializePage();
    setupEventListeners();
    generateTimeOptions();
    loadBrandAndIpLists();  // Load brand and IP lists on page load
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
            userNameDisplay.textContent = "hii "+ firstName;
        }
    }
}

function generateTimeOptions() {
    /**
     * Generate time options in 30-minute increments from 08:00 to 07:30 (next day)
     * This covers all 24 hours starting from 8 AM
     */
    const times = [];
    for (let h = 8; h < 32; h++) {  // 8 to 31 (8 AM + 24 hours)
        for (let m = 0; m < 60; m += 30) {
            const actualHour = h % 24;  // Wrap around after 23:59
            const time = `${String(actualHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            times.push(time);
        }
    }

    // Store all times globally for filtering
    bookingState.allTimes = times;

    // Initial population (all times)
    populateTimeSelects(times);
}

function populateTimeSelects(times) {
    // Populate from time
    const fromTimeSelect = document.getElementById('fromTime');
    fromTimeSelect.innerHTML = '<option value="">Select start time</option>';
    times.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = UI.formatTimeToAmPm(time);
        fromTimeSelect.appendChild(option);
    });

    // Populate to time
    const toTimeSelect = document.getElementById('toTime');
    toTimeSelect.innerHTML = '<option value="">Select end time</option>';
    times.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = UI.formatTimeToAmPm(time);
        toTimeSelect.appendChild(option);
    });
}

function setupEventListeners() {
    // Date selection
    document.querySelectorAll('.date-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const offset = parseInt(btn.dataset.offset);
            selectDate(offset);
        });
    });

    // Time selection
    document.getElementById('fromTime').addEventListener('change', () => {
        updateTimeSelection();
    });

    document.getElementById('toTime').addEventListener('change', () => {
        updateTimeSelection();
    });

    // Brand/IP toggle
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const option = e.target.dataset.option;
            toggleBrandIp(option);
        });
    });

    // Lock button
    document.getElementById('lockBtn').addEventListener('click', lockDateAndTime);

    // Submit button
    document.getElementById('submitBookingBtn').addEventListener('click', submitBooking);
}

function toggleBrandIp(option) {
    bookingState.brandOrIp = option;
    
    // Update button states
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.option === option);
    });
    
    // Toggle visibility and clear the non-selected field
    const brandGroup = document.getElementById('brandGroup');
    const ipGroup = document.getElementById('ipGroup');
    const brandSelect = document.getElementById('brand');
    const ipSelect = document.getElementById('ip');
    
    if (option === 'brand') {
        brandGroup.classList.remove('hidden');
        ipGroup.classList.add('hidden');
        ipSelect.value = '';  // Clear IP field
        brandSelect.focus();
        // Populate brand dropdown if not already populated
        if (bookingState.brandList.length > 0) {
            populateBrandDropdown();
        }
    } else {
        brandGroup.classList.add('hidden');
        ipGroup.classList.remove('hidden');
        brandSelect.value = '';  // Clear Brand field
        ipSelect.focus();
        // Populate IP dropdown if not already populated
        if (bookingState.ipList.length > 0) {
            populateIpDropdown();
        }
    }
    
    console.log('Selected option:', option);
}

async function loadBrandAndIpLists() {
    try {
        console.log('Loading Brand and IP lists...');
        
        // Load brands
        bookingState.brandList = await BRANDIP_API.getNames('Brand');
        populateBrandDropdown();
        
        // Load IPs
        bookingState.ipList = await BRANDIP_API.getNames('IP');
        populateIpDropdown();
        
        console.log('✅ Brand and IP lists loaded successfully');
    } catch (error) {
        console.error('❌ Error loading Brand/IP lists:', error);
        UI.showToast('Failed to load Brand/IP lists', 'error', 3000);
    }
}

function populateBrandDropdown() {
    const brandSelect = document.getElementById('brand');
    const selectedValue = brandSelect.value;
    
    brandSelect.innerHTML = '<option value="">Select a brand</option>';
    
    bookingState.brandList.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandSelect.appendChild(option);
    });
    
    // Restore previous selection if available
    if (selectedValue && bookingState.brandList.includes(selectedValue)) {
        brandSelect.value = selectedValue;
    }
    
    brandSelect.disabled = false;
    console.log('✅ Brand dropdown populated with', bookingState.brandList.length, 'items');
}

function populateIpDropdown() {
    const ipSelect = document.getElementById('ip');
    const selectedValue = ipSelect.value;
    
    ipSelect.innerHTML = '<option value="">Select an IP</option>';
    
    bookingState.ipList.forEach(ip => {
        const option = document.createElement('option');
        option.value = ip;
        option.textContent = ip;
        ipSelect.appendChild(option);
    });
    
    // Restore previous selection if available
    if (selectedValue && bookingState.ipList.includes(selectedValue)) {
        ipSelect.value = selectedValue;
    }
    
    ipSelect.disabled = false;
    console.log('✅ IP dropdown populated with', bookingState.ipList.length, 'items');
}

function selectDate(offset) {
    bookingState.selectedDateOffset = offset;
    bookingState.selectedDateKey = UI.dateKeyForOffset(offset);

    // Update UI
    document.querySelectorAll('.date-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === offset);
    });

    const dateKey = bookingState.selectedDateKey;
    const dateFormatted = UI.formatDateKeyShort(dateKey);
    document.getElementById('selectedDateDisplay').textContent = dateFormatted;

    // Filter times based on whether today is selected
    let availableTimes = bookingState.allTimes;
    
    if (offset === 0) {
        // Today is selected - filter out past times
        const now = new Date();
        const currentHour = String(now.getHours()).padStart(2, '0');
        const currentMinute = String(now.getMinutes()).padStart(2, '0');
        
        // Round up to next 30-minute interval
        let filterTime;
        if (now.getMinutes() <= 30) {
            filterTime = currentHour + ':30';
        } else {
            const nextHour = (now.getHours() + 1) % 24;
            filterTime = String(nextHour).padStart(2, '0') + ':00';
        }
        
        console.log('Current time:', currentHour + ':' + currentMinute, 'Filtering from:', filterTime);
        
        availableTimes = bookingState.allTimes.filter(time => {
            return time >= filterTime;
        });
        
        if (availableTimes.length === 0) {
            console.warn('No available times remaining today');
        }
    }
    
    populateTimeSelects(availableTimes);

    // If user changes date after lock, reset lock
    if (bookingState.isLocked) {
        resetLock();
    }

    updateLockButtonState();
}

function updateTimeSelection() {
    const fromTime = document.getElementById('fromTime').value;
    const toTime = document.getElementById('toTime').value;

    bookingState.fromTime = fromTime;
    bookingState.toTime = toTime;

    // Update duration display
    const durationInfo = document.getElementById('durationInfo');
    if (fromTime && toTime) {
        const duration = UI.getTimeDuration(fromTime, toTime);
        const validation = UI.validateTimeSelection(fromTime, toTime);

        if (validation.valid) {
            const hours = Math.floor(duration / 60);
            const minutes = duration % 60;
            const durationText = `${hours}h ${minutes}m`;
            durationInfo.textContent = `Duration: ${durationText}`;
            durationInfo.classList.remove('error');
        } else {
            durationInfo.textContent = validation.error;
            durationInfo.classList.add('error');
        }
    } else {
        durationInfo.textContent = '';
    }

    // If user changes time after lock, reset lock
    if (bookingState.isLocked) {
        resetLock();
    }

    updateLockButtonState();
}

function updateLockButtonState() {
    const lockBtn = document.getElementById('lockBtn');
    const hasValidSelection = bookingState.selectedDateOffset !== null && 
                             bookingState.fromTime && 
                             bookingState.toTime;
    
    if (hasValidSelection) {
        const validation = UI.validateTimeSelection(bookingState.fromTime, bookingState.toTime);
        lockBtn.disabled = !validation.valid;
    } else {
        lockBtn.disabled = true;
    }
}

async function lockDateAndTime() {
    const lockBtn = document.getElementById('lockBtn');
    const lockError = document.getElementById('lockError');
    const lockLoading = document.getElementById('lockLoading');

    try {
        UI.showError(lockError, '');
        UI.setLoading(lockLoading, true);
        lockBtn.disabled = true;

        // Get current user
        const user = AUTH.getCurrentUser();

        // Prepare payload
        const payload = {
            action: 'booking_lock',
            command: '/slot_booking',
            user: {
                name: user.name,
                role: user.role,
                email: user.email
            },
            dateKey: bookingState.selectedDateKey,
            fromTime: bookingState.fromTime,
            toTime: bookingState.toTime
        };

        // Call API
        const response = await API.postToN8n(payload);

        console.log('Lock response:', response);

        // Check if response is "Ongoing Booking" (someone is currently booking)
        // Response format: {"key":"Ongoing Booking"}
        if (response?.key === "Ongoing Booking") {
            const msg = 'someone else is booking try after 90 sec';
            UI.showError(lockError, msg);
            lockError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            
            // Auto-refresh after 90 seconds
            setTimeout(() => {
                window.location.reload();
            }, 90000);
            
            UI.setLoading(lockLoading, false);
            lockBtn.disabled = false;
            return;
        }

        // Get name list from webhook: { "name": ["Anusha Koshta - Creator", ...] } or [{ "name": [...] }]
        let namesArray = null;
        if (response && response.name && Array.isArray(response.name)) {
            namesArray = response.name;
        } else if (Array.isArray(response) && response.length > 0 && response[0].name) {
            namesArray = response[0].name;
        }
        namesArray = Array.isArray(namesArray) ? namesArray : [];

        // Check if current user is IN the list (list format: "Name - Role", e.g. "Deepak - Creator")
        const currentName = (user.name || '').trim();
        const currentNameLower = currentName.toLowerCase();
        const isInList = currentName && namesArray.some(entry => {
            const s = String(entry || '').trim();
            const sLower = s.toLowerCase();
            return sLower === currentNameLower ||
                sLower.startsWith(currentNameLower + ' -') ||
                sLower.startsWith(currentNameLower + ' ');
        });

        // If user is NOT in the list → show error and block
        if (namesArray.length > 0 && !isInList) {
            const msg = 'Your Already Booked for this slot.';
            if (lockError) {
                UI.showError(lockError, msg);
                lockError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            UI.showToast(msg, 'warning', 5000);
            alert(msg);
            return;
        }

        // Handle cast list from webhook - use same name array for DOP/cast
        let dopList = [];
        let fullList = [];

        if (namesArray.length > 0) {
            fullList = [...namesArray];
            dopList = namesArray.filter(name => name.includes('DOP'));
            console.log('DOP list loaded:', dopList.length, 'members');
            console.log('Cast list loaded:', fullList.length, 'members');
        }

        bookingState.dopList = dopList;
        bookingState.castList = fullList;  // Full list including DOPs
        bookingState.isLocked = true;
        bookingState.selectedDops = new Set();
        bookingState.selectedCast = new Set();

        // Show DOP and cast checkboxes and submit button
        renderDopCheckboxes();
        renderCastCheckboxes();
        document.getElementById('submitSection').classList.remove('hidden');

        // Start 90-second timer - if user doesn't submit within 90 seconds, refresh page
        if (employeeSelectionTimeout) {
            clearTimeout(employeeSelectionTimeout);
        }
        employeeSelectionTimeout = setTimeout(() => {
            console.log('90 seconds passed without booking submission - refreshing page');
            window.location.reload();
        }, 90000);

        UI.showToast('Date & Time locked successfully!', 'success', 2000);

    } catch (error) {
        UI.showError(lockError, error.message || 'Failed to lock date and time');
        UI.showToast('Lock failed', 'error', 3000);
    } finally {
        UI.setLoading(lockLoading, false);
        lockBtn.disabled = false;
    }
}

function renderDopCheckboxes() {
    const dopCheckboxes = document.getElementById('dopCheckboxes');
    dopCheckboxes.innerHTML = '';

    console.log('Rendering', bookingState.dopList.length, 'DOP members');

    if (bookingState.dopList.length === 0) {
        dopCheckboxes.innerHTML = '<p>No DOP available</p>';
        return;
    }

    bookingState.dopList.forEach((dopName, index) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = dopName;
        checkbox.id = `dop-checkbox-${index}-${dopName.replace(/\s+/g, '-')}`;

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                bookingState.selectedDops.add(dopName);
                console.log('Selected DOP:', dopName);
            } else {
                bookingState.selectedDops.delete(dopName);
                console.log('Deselected DOP:', dopName);
            }
            updateCastCheckboxesAvailability();
            updateSubmitButtonState();
        });

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = dopName;

        div.appendChild(checkbox);
        div.appendChild(label);
        dopCheckboxes.appendChild(div);
    });

    console.log('DOP checkboxes rendered successfully');
}

function renderCastCheckboxes() {
    const castCheckboxes = document.getElementById('castCheckboxes');
    castCheckboxes.innerHTML = '';

    console.log('Rendering', bookingState.castList.length, 'cast members (full list)');

    if (bookingState.castList.length === 0) {
        castCheckboxes.innerHTML = '<p>No cast members available</p>';
        return;
    }

    // Sort full list - DOPs first, then Creators
    const sortedCastList = [...bookingState.castList].sort((a, b) => {
        const aIsDop = a.includes('DOP');
        const bIsDop = b.includes('DOP');
        if (aIsDop && !bIsDop) return -1;
        if (!aIsDop && bIsDop) return 1;
        return a.localeCompare(b);
    });

    sortedCastList.forEach((fullName, index) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = fullName;
        checkbox.id = `cast-checkbox-${index}-${fullName.replace(/\s+/g, '-')}`;

        // Disable if this person is selected as DOP
        const isSelectedDop = bookingState.selectedDops.has(fullName);
        checkbox.disabled = isSelectedDop;

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                bookingState.selectedCast.add(checkbox.value);
                console.log('Selected in cast:', checkbox.value);
            } else {
                bookingState.selectedCast.delete(checkbox.value);
                console.log('Deselected from cast:', checkbox.value);
            }
            updateSubmitButtonState();
        });

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        
        // Show badge for DOPs
        const isDop = fullName.includes('DOP');
        if (isDop) {
            label.textContent = fullName + ' 🎥';
        } else {
            label.textContent = fullName;
        }

        if (checkbox.disabled) {
            label.style.opacity = '0.5';
        }

        div.appendChild(checkbox);
        div.appendChild(label);
        castCheckboxes.appendChild(div);
    });

    console.log('Cast checkboxes rendered successfully');
    updateSubmitButtonState();
}

function updateCastCheckboxesAvailability() {
    // Re-render cast checkboxes to update disabled state
    renderCastCheckboxes();
}

function resetLock() {
    bookingState.isLocked = false;
    bookingState.dopList = [];
    bookingState.castList = [];
    bookingState.selectedDops = new Set();
    bookingState.selectedCast = new Set();

    // Clear the 90-second timeout
    if (employeeSelectionTimeout) {
        clearTimeout(employeeSelectionTimeout);
        employeeSelectionTimeout = null;
    }

    // Keep form visible but clear DOP and cast checkboxes and submit button
    document.getElementById('dopCheckboxes').innerHTML = '';
    document.getElementById('castCheckboxes').innerHTML = '';
    document.getElementById('submitSection').classList.add('hidden');

    UI.showError(document.getElementById('lockError'), '');
}

function resetBookingForm() {
    // Reset all form fields
    document.getElementById('shootName').value = '';
    document.getElementById('brand').value = '';
    document.getElementById('ip').value = '';
    document.getElementById('noOfShoot').value = '';
    document.getElementById('location').value = '';
    
    // Reset date and time selections
    bookingState.selectedDateOffset = null;
    bookingState.selectedDateKey = null;
    bookingState.fromTime = null;
    bookingState.toTime = null;
    
    // Reset lock state
    resetLock();
    
    // Clear error messages
    UI.showError(document.getElementById('lockError'), '');
    UI.showError(document.getElementById('submitError'), '');
    
    // Reset date button UI
    document.querySelectorAll('.date-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById('selectedDateDisplay').textContent = '';
    
    // Reset time selections
    document.getElementById('fromTime').value = '';
    document.getElementById('toTime').value = '';
    document.getElementById('durationInfo').textContent = '';
    
    // Regenerate time options
    populateTimeSelects(bookingState.allTimes);
    
    // Update button states
    updateLockButtonState();
    updateSubmitButtonState();
    
    console.log('Booking form reset successfully');
}

function updateSubmitButtonState() {
    const submitBtn = document.getElementById('submitBookingBtn');
    const shootName = document.getElementById('shootName').value.trim();
    const brand = document.getElementById('brand').value.trim();
    const ip = document.getElementById('ip').value.trim();
    const noOfShoot = document.getElementById('noOfShoot').value;
    const location = document.getElementById('location').value;

    // Check: shootName, either brand OR ip, noOfShoot, location, and cast selected
    const hasRequiredFields = shootName && (brand || ip) && noOfShoot && location;
    const hasCastSelected = bookingState.selectedCast.size > 0;

    submitBtn.disabled = !hasRequiredFields || !hasCastSelected;
}

// Update submit button state when booking details change
document.addEventListener('change', (e) => {
    if (e.target.id === 'shootName' || e.target.id === 'brand' || 
        e.target.id === 'ip' || e.target.id === 'noOfShoot' || e.target.id === 'location') {
        updateSubmitButtonState();
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'shootName' || e.target.id === 'brand' || e.target.id === 'ip') {
        updateSubmitButtonState();
    }
});

async function submitBooking() {
    if (bookingSubmitInFlight) return; // Prevent duplicate submission
    bookingSubmitInFlight = true;
    const submitBtn = document.getElementById('submitBookingBtn');
    const submitError = document.getElementById('submitError');
    const submitLoading = document.getElementById('submitLoading');
    const successMessage = document.getElementById('successMessage');
    submitBtn.disabled = true;
    UI.setLoading(submitLoading, true);
    try {
        // Get form data
        const shootName = document.getElementById('shootName').value.trim();
        const brand = document.getElementById('brand').value.trim();
        const ip = document.getElementById('ip').value.trim();
        const noOfShoot = document.getElementById('noOfShoot').value;
        const location = document.getElementById('location').value;

        // Get user
        const user = AUTH.getCurrentUser();

        // Prepare payload
        const payload = {
            action: 'booking_submit',
            command: '/slot_booking',
            user: {
                name: user.name,
                role: user.role,
                email: user.email
            },
            dateKey: bookingState.selectedDateKey,
            fromTime: bookingState.fromTime,
            toTime: bookingState.toTime,
            shoot: {
                shootName,
                brand: brand,  // Blank if IP selected
                ip: ip,        // Blank if Brand selected
                noOfShoot: parseInt(noOfShoot),
                location
            },
            selected: {
                dops: Array.from(bookingState.selectedDops),  // Array of DOPs
                names: Array.from(bookingState.selectedCast)   // Array of cast/creators
            }
        };

        // Add idempotency key
        let request_id;
        if (window.crypto && window.crypto.randomUUID) {
            request_id = crypto.randomUUID();
        } else {
            request_id = Date.now().toString() + '-' + Math.floor(Math.random() * 1000000);
        }
        payload.request_id = request_id;

        // Call API
        await API.postToN8n(payload);

        // Clear the 90-second timeout since booking was submitted successfully
        if (employeeSelectionTimeout) {
            clearTimeout(employeeSelectionTimeout);
            employeeSelectionTimeout = null;
        }

        // Success
        successMessage.classList.add('show');
        successMessage.classList.remove('hidden');
        setTimeout(() => {
            resetBookingForm();
            successMessage.classList.remove('show');
            successMessage.classList.add('hidden');
        }, 3000);
    } catch (error) {
        UI.showError(submitError, error.message || 'Failed to submit booking');
        UI.showToast('Submission failed', 'error', 3000);
    } finally {
        UI.setLoading(submitLoading, false);
        submitBtn.disabled = false;
        bookingSubmitInFlight = false;
    }
}
