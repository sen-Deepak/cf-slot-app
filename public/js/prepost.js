/**
 * prepost.js - Pre/Post Production booking page logic
 */

import { AUTH } from './auth.js';
import { UI } from './ui.js';
import { BRANDIP_API } from './brandip-api.js';
import { API } from './api.js';

// State
let prepostState = {
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
    productionStage: 'preproduction',  // 'preproduction' or 'postproduction'
    brandIpCampaign: 'brand',  // Track which option is selected: 'brand', 'ip', or 'campaign'
    brandList: [],  // List of available brands
    ipList: [],  // List of available IPs
    campaignList: [],  // List of available campaigns
    preproductionList: [],  // List of Pre-Production options
    postproductionList: [],  // List of Post-Production options
    numberField: null  // Track selected number (1-10)
};

let prepostSubmitInFlight = false;
let employeeSelectionTimeout = null;  // Track timeout for employee selection 90-second timer

document.addEventListener('DOMContentLoaded', () => {
    // Check auth first
    if (!AUTH.isAuthenticated()) {
        return;
    }

    // Check if user is admin - if so, redirect to admin dashboard
    const user = AUTH.getCurrentUser();
    if (user && user.role === 'Admin') {
        window.location.href = '/todays-shoots.html';
        return;
    }

    initializePage();
    setupEventListeners();
    generateTimeOptions();
    loadAllDropdownLists();  // Load all brand, IP, campaign, pre/post lists on page load
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
    prepostState.allTimes = times;

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
    document.querySelectorAll('.date-btn').forEach((btn, idx) => {
        btn.addEventListener('click', () => selectDate(idx));
    });

    // Time selection
    document.getElementById('fromTime').addEventListener('change', updateTimeSelection);
    document.getElementById('toTime').addEventListener('change', updateTimeSelection);

    // Production stage toggle (Pre/Post)
    const prepostToggleBtns = document.querySelectorAll(
        '#productionStageToggle .toggle-btn'
    );
    prepostToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => selectProductionStage(btn.dataset.option));
    });

    // Brand/IP/Campaign toggle
    const brandIpCampaignToggleBtns = document.querySelectorAll(
        '#brandIpCampaignToggle .toggle-btn'
    );
    brandIpCampaignToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => selectBrandIpCampaign(btn.dataset.option));
    });

    // Number field change
    document.getElementById('numberField').addEventListener('change', () => {
        prepostState.numberField = document.getElementById('numberField').value;
        updateSubmitButtonState();
    });

    // Lock button
    document.getElementById('lockBtn').addEventListener('click', lockDateAndTime);

    // Submit button
    document.getElementById('submitBookingBtn').addEventListener('click', submitBooking);
}

async function loadAllDropdownLists() {
    /**
     * Load all dropdown lists from Brand IP API
     */
    try {
        console.log('📥 Loading all dropdown lists...');
        const results = await Promise.allSettled([
            BRANDIP_API.getNames('Brand'),
            BRANDIP_API.getNames('IP'),
            BRANDIP_API.getNames('Campaign'),
            BRANDIP_API.getNames('Pre-Production'),
            BRANDIP_API.getNames('Post-Production')
        ]);

        if (results[0].status === 'fulfilled') {
            prepostState.brandList = results[0].value;
            populateBrandDropdown();
        }
        if (results[1].status === 'fulfilled') {
            prepostState.ipList = results[1].value;
            populateIpDropdown();
        }
        if (results[2].status === 'fulfilled') {
            prepostState.campaignList = results[2].value;
            populateCampaignDropdown();
        }
        if (results[3].status === 'fulfilled') {
            prepostState.preproductionList = results[3].value;
            populatePreproductionDropdown();
        }
        if (results[4].status === 'fulfilled') {
            prepostState.postproductionList = results[4].value;
            populatePostproductionDropdown();
        }

        console.log('✅ All dropdown lists loaded');
    } catch (error) {
        console.error('❌ Error loading dropdown lists:', error);
    }
}

function populateBrandDropdown() {
    const brandSelect = document.getElementById('brand');
    const selectedValue = brandSelect.value;
    
    brandSelect.innerHTML = '<option value="">Select a brand</option>';
    
    prepostState.brandList.forEach(brand => {
        const option = document.createElement('option');
        option.value = brand;
        option.textContent = brand;
        brandSelect.appendChild(option);
    });
    
    // Restore previous selection if available
    if (selectedValue && prepostState.brandList.includes(selectedValue)) {
        brandSelect.value = selectedValue;
    }
    
    brandSelect.disabled = false;
    console.log('✅ Brand dropdown populated with', prepostState.brandList.length, 'items');
}

function populateIpDropdown() {
    const ipSelect = document.getElementById('ip');
    const selectedValue = ipSelect.value;
    
    ipSelect.innerHTML = '<option value="">Select an IP</option>';
    
    prepostState.ipList.forEach(ip => {
        const option = document.createElement('option');
        option.value = ip;
        option.textContent = ip;
        ipSelect.appendChild(option);
    });
    
    // Restore previous selection if available
    if (selectedValue && prepostState.ipList.includes(selectedValue)) {
        ipSelect.value = selectedValue;
    }
    
    ipSelect.disabled = false;
    console.log('✅ IP dropdown populated with', prepostState.ipList.length, 'items');
}

function populateCampaignDropdown() {
    const campaignSelect = document.getElementById('campaign');
    const selectedValue = campaignSelect.value;
    
    campaignSelect.innerHTML = '<option value="">Select a campaign</option>';
    
    prepostState.campaignList.forEach(campaign => {
        const option = document.createElement('option');
        option.value = campaign;
        option.textContent = campaign;
        campaignSelect.appendChild(option);
    });
    
    // Restore previous selection if available
    if (selectedValue && prepostState.campaignList.includes(selectedValue)) {
        campaignSelect.value = selectedValue;
    }
    
    campaignSelect.disabled = false;
    console.log('✅ Campaign dropdown populated with', prepostState.campaignList.length, 'items');
}

function populatePreproductionDropdown() {
    const preproductionSelect = document.getElementById('preproductionDropdown');
    const selectedValue = preproductionSelect.value;
    
    preproductionSelect.innerHTML = '<option value="">Select a pre-production option</option>';
    
    prepostState.preproductionList.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        preproductionSelect.appendChild(optionElement);
    });
    
    // Restore previous selection if available
    if (selectedValue && prepostState.preproductionList.includes(selectedValue)) {
        preproductionSelect.value = selectedValue;
    }
    
    preproductionSelect.disabled = false;
    console.log('✅ Pre-Production dropdown populated with', prepostState.preproductionList.length, 'items');
}

function populatePostproductionDropdown() {
    const postproductionSelect = document.getElementById('postproductionDropdown');
    const selectedValue = postproductionSelect.value;
    
    postproductionSelect.innerHTML = '<option value="">Select a post-production option</option>';
    
    prepostState.postproductionList.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        postproductionSelect.appendChild(optionElement);
    });
    
    // Restore previous selection if available
    if (selectedValue && prepostState.postproductionList.includes(selectedValue)) {
        postproductionSelect.value = selectedValue;
    }
    
    postproductionSelect.disabled = false;
    console.log('✅ Post-Production dropdown populated with', prepostState.postproductionList.length, 'items');
}

function selectDate(offset) {
    prepostState.selectedDateOffset = offset;
    prepostState.selectedDateKey = UI.dateKeyForOffset(offset);

    // Update UI
    document.querySelectorAll('.date-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === offset);
    });

    const dateKey = prepostState.selectedDateKey;
    const dateFormatted = UI.formatDateKeyShort(dateKey);
    document.getElementById('selectedDateDisplay').textContent = dateFormatted;

    // Filter times based on whether today is selected
    let availableTimes = prepostState.allTimes;
    
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
        
        availableTimes = prepostState.allTimes.filter(time => {
            return time >= filterTime;
        });
        
        if (availableTimes.length === 0) {
            console.warn('No available times remaining today');
        }
    }
    
    populateTimeSelects(availableTimes);

    // If user changes date after lock, reset lock
    if (prepostState.isLocked) {
        resetLock();
    }

    updateLockButtonState();
}

function updateTimeSelection() {
    const fromTime = document.getElementById('fromTime').value;
    const toTime = document.getElementById('toTime').value;

    prepostState.fromTime = fromTime;
    prepostState.toTime = toTime;

    // Update duration info
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

    updateLockButtonState();
}

function updateLockButtonState() {
    const lockBtn = document.getElementById('lockBtn');
    const validation = {
        valid:
            prepostState.selectedDateOffset !== null &&
            prepostState.fromTime &&
            prepostState.toTime
    };

    if (validation.valid) {
        lockBtn.disabled = false;
    } else {
        lockBtn.disabled = true;
    }
}

function selectProductionStage(stage) {
    prepostState.productionStage = stage;

    // Update toggle buttons
    const toggleBtns = document.querySelectorAll(
        '#productionStageToggle .toggle-btn'
    );
    toggleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.option === stage);
    });

    // Update dropdowns
    if (stage === 'preproduction') {
        document.getElementById('preproductionGroup').classList.remove('hidden');
        document.getElementById('postproductionGroup').classList.add('hidden');
    } else {
        document.getElementById('preproductionGroup').classList.add('hidden');
        document.getElementById('postproductionGroup').classList.remove('hidden');
    }
}

function selectBrandIpCampaign(option) {
    prepostState.brandIpCampaign = option;

    // Update toggle buttons
    const toggleBtns = document.querySelectorAll(
        '#brandIpCampaignToggle .toggle-btn'
    );
    toggleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.option === option);
    });

    // Update dropdowns visibility
    if (option === 'brand') {
        document.getElementById('brandGroup').classList.remove('hidden');
        document.getElementById('ipGroup').classList.add('hidden');
        document.getElementById('campaignGroup').classList.add('hidden');
    } else if (option === 'ip') {
        document.getElementById('brandGroup').classList.add('hidden');
        document.getElementById('ipGroup').classList.remove('hidden');
        document.getElementById('campaignGroup').classList.add('hidden');
    } else if (option === 'campaign') {
        document.getElementById('brandGroup').classList.add('hidden');
        document.getElementById('ipGroup').classList.add('hidden');
        document.getElementById('campaignGroup').classList.remove('hidden');
    }
}

async function lockDateAndTime() {
    const lockBtn = document.getElementById('lockBtn');
    const lockError = document.getElementById('lockError');
    const lockSuccess = document.getElementById('lockSuccess');
    const lockLoading = document.getElementById('lockLoading');

    try {
        UI.showError(lockError, '');
        if (lockSuccess) lockSuccess.textContent = '';
        UI.setLoading(lockLoading, true);
        lockBtn.disabled = true;

        // Get current user
        const user = AUTH.getCurrentUser();

        // Prepare payload (same as booking page)
        const payload = {
            action: 'booking_lock',
            command: '/slot_booking',
            user: {
                name: user.name,
                role: user.role,
                email: user.email
            },
            dateKey: prepostState.selectedDateKey,
            fromTime: prepostState.fromTime,
            toTime: prepostState.toTime
        };

        // Call API
        const response = await API.postToN8n(payload);

        console.log('Lock response:', response);

        // Check if response is "Ongoing Booking" (someone is currently booking)
        // Response format: {"key":"Ongoing Booking"}
        if (response?.key === "Ongoing Booking") {
            const msg = 'someone else is booking try after 90 sec';
            UI.showError(lockError, msg);
            if (lockSuccess) lockSuccess.classList.remove('show');
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
            if (lockSuccess) lockSuccess.classList.remove('show');
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

        prepostState.dopList = dopList;
        prepostState.castList = fullList;  // Full list including DOPs
        prepostState.isLocked = true;
        prepostState.selectedDops = new Set();
        prepostState.selectedCast = new Set();

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

        // Show success message below button
        if (lockSuccess) {
            lockSuccess.textContent = 'List successfully loaded';
            lockSuccess.classList.add('show');
        }

    } catch (error) {
        UI.showError(lockError, error.message || 'Failed to lock date and time');
        UI.showToast('Lock failed', 'error', 3000);
    } finally {
        UI.setLoading(lockLoading, false);
        // Keep button disabled if lock was successful
        if (!prepostState.isLocked) {
            lockBtn.disabled = false;
        }
    }
}

function renderDopCheckboxes() {
    const dopCheckboxes = document.getElementById('dopCheckboxes');
    dopCheckboxes.innerHTML = '';

    console.log('Rendering', prepostState.dopList.length, 'DOP members');

    if (prepostState.dopList.length === 0) {
        dopCheckboxes.innerHTML = '<p>No DOP available</p>';
        return;
    }

    prepostState.dopList.forEach((dopName, index) => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = dopName;
        checkbox.id = `dop-checkbox-${index}-${dopName.replace(/\s+/g, '-')}`;

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                prepostState.selectedDops.add(dopName);
                console.log('Selected DOP:', dopName);
            } else {
                prepostState.selectedDops.delete(dopName);
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

    console.log('Rendering', prepostState.castList.length, 'cast members (full list)');

    if (prepostState.castList.length === 0) {
        castCheckboxes.innerHTML = '<p>No cast members available</p>';
        return;
    }

    // Sort full list - DOPs first, then Creators
    const sortedCastList = [...prepostState.castList].sort((a, b) => {
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
        const isSelectedDop = prepostState.selectedDops.has(fullName);
        checkbox.disabled = isSelectedDop;

        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                prepostState.selectedCast.add(checkbox.value);
                console.log('Selected in cast:', checkbox.value);
            } else {
                prepostState.selectedCast.delete(checkbox.value);
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

function updateSubmitButtonState() {
    const submitBtn = document.getElementById('submitBookingBtn');
    
    // Check if all mandatory fields are filled
    let productionStageValue = '';
    let brandIpCampaignValue = '';

    if (prepostState.productionStage === 'preproduction') {
        productionStageValue = document.getElementById('preproductionDropdown').value;
    } else {
        productionStageValue = document.getElementById('postproductionDropdown').value;
    }

    if (prepostState.brandIpCampaign === 'brand') {
        brandIpCampaignValue = document.getElementById('brand').value;
    } else if (prepostState.brandIpCampaign === 'ip') {
        brandIpCampaignValue = document.getElementById('ip').value;
    } else if (prepostState.brandIpCampaign === 'campaign') {
        brandIpCampaignValue = document.getElementById('campaign').value;
    }

    const workName = document.getElementById('workName').value.trim();

    const allFieldsFilled = 
        productionStageValue && 
        brandIpCampaignValue && 
        workName && 
        prepostState.selectedDops.size > 0;

    submitBtn.disabled = !allFieldsFilled;
}

function resetLock() {
    prepostState.isLocked = false;
    prepostState.dopList = [];
    prepostState.castList = [];
    prepostState.selectedDops = new Set();
    prepostState.selectedCast = new Set();

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
    document.getElementById('preproductionDropdown').value = '';
    document.getElementById('postproductionDropdown').value = '';
    document.getElementById('brand').value = '';
    document.getElementById('ip').value = '';
    document.getElementById('campaign').value = '';
    document.getElementById('workName').value = '';
    document.getElementById('numberField').value = '';
    document.getElementById('remark').value = '';
    prepostState.numberField = null;
    
    // Reset date and time selections
    prepostState.selectedDateOffset = null;
    prepostState.selectedDateKey = null;
    prepostState.fromTime = null;
    prepostState.toTime = null;
    
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
    populateTimeSelects(prepostState.allTimes);
    
    // Reset production stage to pre-production
    prepostState.productionStage = 'preproduction';
    document.getElementById('preproductionGroup').classList.remove('hidden');
    document.getElementById('postproductionGroup').classList.add('hidden');
    document.querySelectorAll('#productionStageToggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.option === 'preproduction');
    });

    // Reset brand/IP/campaign to brand
    prepostState.brandIpCampaign = 'brand';
    document.getElementById('brandGroup').classList.remove('hidden');
    document.getElementById('ipGroup').classList.add('hidden');
    document.getElementById('campaignGroup').classList.add('hidden');
    document.querySelectorAll('#brandIpCampaignToggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.option === 'brand');
    });

    updateLockButtonState();
}

async function submitBooking() {
    if (prepostSubmitInFlight) return; // Prevent duplicate submission
    prepostSubmitInFlight = true;
    const submitBtn = document.getElementById('submitBookingBtn');
    const submitError = document.getElementById('submitError');
    const submitLoading = document.getElementById('submitLoading');
    const successMessage = document.getElementById('successMessage');
    submitBtn.disabled = true;
    UI.setLoading(submitLoading, true);
    try {
        // Get form data
        let productionStageValue = '';
        let productionStageType = prepostState.productionStage;
        
        if (prepostState.productionStage === 'preproduction') {
            productionStageValue = document.getElementById('preproductionDropdown').value.trim();
            productionStageType = 'Pre-Production';
        } else {
            productionStageValue = document.getElementById('postproductionDropdown').value.trim();
            productionStageType = 'Post-Production';
        }

        let brandIpCampaignValue = '';
        let brandIpCampaignType = prepostState.brandIpCampaign;
        
        if (prepostState.brandIpCampaign === 'brand') {
            brandIpCampaignValue = document.getElementById('brand').value.trim();
            brandIpCampaignType = 'Brand';
        } else if (prepostState.brandIpCampaign === 'ip') {
            brandIpCampaignValue = document.getElementById('ip').value.trim();
            brandIpCampaignType = 'IP';
        } else if (prepostState.brandIpCampaign === 'campaign') {
            brandIpCampaignValue = document.getElementById('campaign').value.trim();
            brandIpCampaignType = 'Campaign';
        }

        const workName = document.getElementById('workName').value.trim();
        const numberField = document.getElementById('numberField').value;
        const remark = document.getElementById('remark').value.trim();

        // Get user
        const user = AUTH.getCurrentUser();

        // Prepare payload
        const payload = {
            action: 'pro_or_post',
            command: '/prepost',
            user: {
                name: user.name,
                role: user.role,
                email: user.email
            },
            dateKey: prepostState.selectedDateKey,
            fromTime: prepostState.fromTime,
            toTime: prepostState.toTime,
            productionDetails: {
                productionStageType: productionStageType,  // 'preproduction' or 'postproduction'
                productionStageValue: productionStageValue,  // Selected option
                brandIpCampaignType: brandIpCampaignType,  // 'brand', 'ip', or 'campaign'
                brandIpCampaignValue: brandIpCampaignValue,  // Selected option
                workName: workName,
                number: numberField ? parseInt(numberField) : null,
                remark: remark
            },
            selected: {
                dops: Array.from(prepostState.selectedDops),  // Array of DOPs
                names: Array.from(prepostState.selectedCast)   // Array of cast/creators
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
        prepostSubmitInFlight = false;
    }
}
