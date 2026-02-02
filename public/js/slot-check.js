/**
 * slot-check.js - Slot Check page logic
 */

// State
let slotCheckState = {
    currentMode: 'time', // 'time' or 'creators'
    timeModeState: {
        selectedDateOffset: null,
        selectedDateKey: null,
        fromTime: null,
        toTime: null
    },
    creatorsModeState: {
        selectedDateOffset: null,
        selectedDateKey: null,
        selectedCreators: new Set()
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Check auth first
    if (!AUTH.isAuthenticated()) {
        return;
    }

    initializePage();
    setupModeToggle();
    setupDateAndTime();
    
    // Wait for creators to load, then setup creators mode
    if (window.CF_CREATORS && window.CF_CREATORS.length > 0) {
        // Creators already loaded
        setupCreators();
    } else {
        // Wait for creators to load
        window.addEventListener('creatorsLoaded', () => {
            console.log('Creators loaded, setting up creators mode');
            setupCreators();
        });
    }
});

function initializePage() {
    // Setup logout button
    document.getElementById('logoutBtn').addEventListener('click', () => {
        AUTH.logout();
        window.location.href = '/public/login.html';
    });
}

function displayCreatorsAvailabilityResult(response, resultElement) {
    /**
     * Display creators availability data
     * Expected response format:
     * {
     *   "data": [
     *     {
     *       "Creators": "Name",
     *       "Available": "12:00 am to 4:00 pm\n6:30 pm to 7:30 pm",
     *       "Booked": "4:00 pm to 6:30 pm"
     *     },
     *     ...
     *   ],
     *   "common_free_text": "12:00 am to 4:00 pm\n6:30 pm to 7:30 pm"
     * }
     */
    
    try {
        let creatorsData = [];
        let commonFreeText = '';
        
        // Extract from response object
        if (response?.data && Array.isArray(response.data)) {
            creatorsData = response.data;
            commonFreeText = response.common_free_text || '';
        }
        
        console.log('Extracted creators:', creatorsData);
        console.log('Common free times:', commonFreeText);
        
        if (!creatorsData || creatorsData.length === 0) {
            resultElement.innerHTML = '<p style="color: #666; padding: 16px;">No creators data available</p>';
            resultElement.style.display = 'block';
            resultElement.classList.remove('hidden');
            return;
        }
        
        // Build HTML
        let html = '<div class="availability-result">';
        html += '<h3>Creator Availability Schedule</h3>';
        
        // Show common free times at top
        if (commonFreeText && commonFreeText.trim()) {
            html += '<div class="common-free-section">';
            html += '<h4>⏰ Common Available Times</h4>';
            const slots = commonFreeText.split('\n').filter(s => s.trim());
            slots.forEach(slot => {
                html += `<div class="time-slot">${slot.trim()}</div>`;
            });
            html += '</div>';
        }
        
        // Show each creator's schedule
        html += '<div class="creators-schedule-container">';
        
        creatorsData.forEach((creator, idx) => {
            html += '<div class="creator-schedule-card">';
            html += '<div class="creator-header">';
            html += `<span class="creator-number">${idx + 1}</span>`;
            html += `<span class="creator-name">${creator.Creators || 'Unknown'}</span>`;
            html += '</div>';
            
            // Available times
            if (creator.Available && creator.Available.trim()) {
                html += '<div class="schedule-section available-section">';
                html += '<h5>✓ Available</h5>';
                const availableSlots = creator.Available.split('\n').filter(s => s.trim());
                availableSlots.forEach(slot => {
                    html += `<div class="time-slot available">✓ ${slot.trim()}</div>`;
                });
                html += '</div>';
            }
            
            // Booked times
            if (creator.Booked && creator.Booked.trim()) {
                html += '<div class="schedule-section booked-section">';
                html += '<h5>✗ Booked</h5>';
                const bookedSlots = creator.Booked.split('\n').filter(s => s.trim());
                bookedSlots.forEach(slot => {
                    html += `<div class="time-slot booked">✗ ${slot.trim()}</div>`;
                });
                html += '</div>';
            }
            
            html += '</div>';
        });
        
        html += '</div>';
        html += '</div>';
        
        // Set content and display
        resultElement.innerHTML = html;
        resultElement.style.display = 'block';
        resultElement.classList.remove('hidden');
        
        console.log('✓ Creators availability displayed successfully');
        
    } catch (error) {
        console.error('Error displaying creators availability:', error);
        resultElement.innerHTML = '<p style="color: #d32f2f; padding: 16px;">Error displaying data: ' + error.message + '</p>';
        resultElement.style.display = 'block';
        resultElement.classList.remove('hidden');
    }
}

function displayAvailabilityResult(response, resultElement) {
    /**
     * Display availability data as a formatted list (for time mode)
     * Response format: [{ "name": ["Creator1", "Creator2", ...] }] or { "name": [...] }
     */
    console.log('displayAvailabilityResult called with response:', response);
    console.log('Result element:', resultElement);
    
    let namesList = [];
    
    // Extract names from response
    if (Array.isArray(response) && response.length > 0) {
        namesList = response[0].name || [];
        console.log('Response is array, extracted names:', namesList);
    } else if (response.name && Array.isArray(response.name)) {
        namesList = response.name;
        console.log('Response has name property, extracted names:', namesList);
    }
    
    console.log('Final namesList:', namesList);
    
    if (namesList.length === 0) {
        resultElement.innerHTML = '<p>No data available</p>';
        resultElement.style.display = 'block';
        resultElement.classList.remove('hidden');
        return;
    }
    
    // Separate DOPs and Creators, then sort
    const dops = [];
    const creators = [];
    
    namesList.forEach(name => {
        if (name.includes('DOP')) {
            dops.push(name);
        } else {
            creators.push(name);
        }
    });
    
    // Sort alphabetically
    dops.sort();
    creators.sort();
    
    // Combine - DOPs first, then Creators
    const sortedList = [...dops, ...creators];
    
    console.log('Sorted list:', sortedList);
    
    // Build HTML
    let html = '<div class="availability-result">';
    html += '<h3>Available People</h3>';
    html += '<div class="availability-list">';
    
    sortedList.forEach((name, index) => {
        const isDop = name.includes('DOP');
        const badgeClass = isDop ? 'dop-badge' : 'creator-badge';
        const badge = isDop ? '🎥 DOP' : '🎬 Creator';
        
        // Extract just the name without the role suffix
        const cleanName = name.split(' - ')[0].trim();
        
        html += `
            <div class="availability-item ${isDop ? 'dop-item' : 'creator-item'}">
                <span class="item-number">${index + 1}</span>
                <span class="item-name">${cleanName}</span>
                <span class="item-badge ${badgeClass}">${badge}</span>
            </div>
        `;
    });
    
    html += '</div>';
    html += `<p class="result-count">Total: ${sortedList.length} (${dops.length} DOP, ${creators.length} Creator)</p>`;
    html += '</div>';
    
    console.log('Generated HTML:', html);
    
    resultElement.innerHTML = html;
    // Override the .hidden class with !important by using inline style
    resultElement.style.display = 'block';
    resultElement.classList.remove('hidden');
    
    console.log('Result element updated and unhidden');
}

function setupModeToggle() {
    const modeBtns = document.querySelectorAll('.mode-btn');
    
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            switchMode(mode);
        });
    });
}

function switchMode(mode) {
    slotCheckState.currentMode = mode;

    // Update button states
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('mode-active', btn.dataset.mode === mode);
    });

    // Show/hide sections
    const timeModeSection = document.getElementById('timeModeSection');
    const creatorsModeSection = document.getElementById('creatorsModeSection');

    if (mode === 'time') {
        timeModeSection.classList.remove('hidden');
        creatorsModeSection.classList.add('hidden');
    } else {
        timeModeSection.classList.add('hidden');
        creatorsModeSection.classList.remove('hidden');
    }

    // Clear results when switching
    document.getElementById('timeModeResult').classList.add('hidden');
    document.getElementById('creatorsModeResult').classList.add('hidden');
}

function setupDateAndTime() {
    // Generate time options
    const times = [];
    for (let h = 8; h < 32; h++) {  // 8 to 31 (8 AM + 24 hours)
        for (let m = 0; m < 60; m += 30) {
            const actualHour = h % 24;  // Wrap around after 23:59
            const time = `${String(actualHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            times.push(time);
        }
    }

    // Populate time mode from time
    const timeModeFromTime = document.getElementById('timeModeFromTime');
    times.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = UI.formatTimeToAmPm(time);
        timeModeFromTime.appendChild(option);
    });

    // Populate time mode to time
    const timeModeToTime = document.getElementById('timeModeToTime');
    times.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = UI.formatTimeToAmPm(time);
        timeModeToTime.appendChild(option);
    });

    // Date buttons - Time Mode
    document.querySelectorAll('.time-mode-date').forEach(btn => {
        btn.addEventListener('click', () => {
            const offset = parseInt(btn.dataset.offset);
            selectTimeModeDate(offset);
        });
    });

    // Time selection listeners
    timeModeFromTime.addEventListener('change', updateTimeModeSelection);
    timeModeToTime.addEventListener('change', updateTimeModeSelection);

    // Time check button
    document.getElementById('timeCheckBtn').addEventListener('click', checkTimeAvailability);
}

function selectTimeModeDate(offset) {
    slotCheckState.timeModeState.selectedDateOffset = offset;
    slotCheckState.timeModeState.selectedDateKey = UI.dateKeyForOffset(offset);

    // Update UI
    document.querySelectorAll('.time-mode-date').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === offset);
    });

    const dateKey = slotCheckState.timeModeState.selectedDateKey;
    const dateLabel = UI.getDateLabel(offset);
    const dateFormatted = UI.formatDateKey(dateKey);
    document.getElementById('timeModeDateDisplay').textContent = `${dateLabel} - ${dateFormatted}`;

    updateTimeModeButtonState();
}

function updateTimeModeSelection() {
    const fromTime = document.getElementById('timeModeFromTime').value;
    const toTime = document.getElementById('timeModeToTime').value;

    slotCheckState.timeModeState.fromTime = fromTime;
    slotCheckState.timeModeState.toTime = toTime;

    updateTimeModeButtonState();
}

function updateTimeModeButtonState() {
    const timeCheckBtn = document.getElementById('timeCheckBtn');
    const hasValidSelection = slotCheckState.timeModeState.selectedDateOffset !== null &&
                             slotCheckState.timeModeState.fromTime &&
                             slotCheckState.timeModeState.toTime;

    if (hasValidSelection) {
        const validation = UI.validateTimeSelection(
            slotCheckState.timeModeState.fromTime,
            slotCheckState.timeModeState.toTime
        );
        timeCheckBtn.disabled = !validation.valid;
    } else {
        timeCheckBtn.disabled = true;
    }
}

async function checkTimeAvailability() {
    const timeCheckBtn = document.getElementById('timeCheckBtn');
    const timeModeError = document.getElementById('timeModeError');
    const timeModeLoading = document.getElementById('timeModeLoading');
    const timeModeResult = document.getElementById('timeModeResult');

    try {
        UI.showError(timeModeError, '');
        UI.setLoading(timeModeLoading, true);
        timeCheckBtn.disabled = true;

        // Get user
        const user = AUTH.getCurrentUser();

        // Prepare payload
        const payload = {
            action: 'slotcheck_time',
            command: '/slot_check',
            user: {
                name: user.name,
                role: user.role,
                email: user.email
            },
            dateKey: slotCheckState.timeModeState.selectedDateKey,
            fromTime: slotCheckState.timeModeState.fromTime,
            toTime: slotCheckState.timeModeState.toTime
        };

        console.log('Sending Time Check payload:', payload);

        // Call API
        const response = await API.postToN8n(payload);

        console.log('Time Check response:', response);

        // Display result
        displayAvailabilityResult(response, timeModeResult);

        UI.showToast('Check completed', 'success', 2000);

    } catch (error) {
        UI.showError(timeModeError, error.message || 'Failed to check availability');
        UI.showToast('Check failed', 'error', 3000);
    } finally {
        UI.setLoading(timeModeLoading, false);
        timeCheckBtn.disabled = false;
    }
}

function setupCreators() {
    // Populate creator checkboxes
    const creatorCheckboxes = document.getElementById('creatorCheckboxes');
    
    if (window.CF_CREATORS && Array.isArray(window.CF_CREATORS)) {
        window.CF_CREATORS.forEach(creator => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = creator;
            checkbox.id = `creator-${creator.replace(/\s+/g, '-').toLowerCase()}`;

            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    slotCheckState.creatorsModeState.selectedCreators.add(creator);
                } else {
                    slotCheckState.creatorsModeState.selectedCreators.delete(creator);
                }
                updateCreatorsModeButtonState();
            });

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = creator;

            div.appendChild(checkbox);
            div.appendChild(label);
            creatorCheckboxes.appendChild(div);
        });
    }

    // Date buttons - Creators Mode
    document.querySelectorAll('.creators-mode-date').forEach(btn => {
        btn.addEventListener('click', () => {
            const offset = parseInt(btn.dataset.offset);
            selectCreatorsModeDate(offset);
        });
    });

    // Creators check button
    document.getElementById('creatorsCheckBtn').addEventListener('click', checkCreatorsAvailability);
}

function selectCreatorsModeDate(offset) {
    slotCheckState.creatorsModeState.selectedDateOffset = offset;
    slotCheckState.creatorsModeState.selectedDateKey = UI.dateKeyForOffset(offset);

    // Update UI
    document.querySelectorAll('.creators-mode-date').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === offset);
    });

    const dateKey = slotCheckState.creatorsModeState.selectedDateKey;
    const dateLabel = UI.getDateLabel(offset);
    const dateFormatted = UI.formatDateKey(dateKey);
    document.getElementById('creatorModeDateDisplay').textContent = `${dateLabel} - ${dateFormatted}`;

    updateCreatorsModeButtonState();
}

function updateCreatorsModeButtonState() {
    const creatorsCheckBtn = document.getElementById('creatorsCheckBtn');
    const hasDateSelected = slotCheckState.creatorsModeState.selectedDateOffset !== null;
    const hasCreatorSelected = slotCheckState.creatorsModeState.selectedCreators.size > 0;

    creatorsCheckBtn.disabled = !hasDateSelected || !hasCreatorSelected;
}

async function checkCreatorsAvailability() {
    const creatorsCheckBtn = document.getElementById('creatorsCheckBtn');
    const creatorsModeError = document.getElementById('creatorsModeError');
    const creatorsModeLoading = document.getElementById('creatorsModeLoading');
    const creatorsModeResult = document.getElementById('creatorsModeResult');

    try {
        UI.showError(creatorsModeError, '');
        UI.setLoading(creatorsModeLoading, true);
        creatorsCheckBtn.disabled = true;

        // Get user
        const user = AUTH.getCurrentUser();

        // Prepare payload
        const payload = {
            action: 'slotcheck_creators',
            command: '/slot_check',
            user: {
                name: user.name,
                role: user.role,
                email: user.email
            },
            dateKey: slotCheckState.creatorsModeState.selectedDateKey,
            creators: Array.from(slotCheckState.creatorsModeState.selectedCreators)
        };

        console.log('Sending Creators Check payload:', payload);

        // Call API
        const response = await API.postToN8n(payload);

        console.log('Creators Check response:', response);

        // Display result
        displayCreatorsAvailabilityResult(response, creatorsModeResult);

        UI.showToast('Check completed', 'success', 2000);

    } catch (error) {
        UI.showError(creatorsModeError, error.message || 'Failed to check creators');
        UI.showToast('Check failed', 'error', 3000);
    } finally {
        UI.setLoading(creatorsModeLoading, false);
        creatorsCheckBtn.disabled = false;
    }
}
