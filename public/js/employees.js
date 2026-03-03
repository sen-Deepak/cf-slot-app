/**
 * employees.js - Employees page logic
 */

import { AUTH } from './auth.js';
import { NAV } from './nav.js';

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
    loadEmployeesData();
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

function loadEmployeesData() {
    // TODO: Load employees data from your backend API
    const employeesList = document.getElementById('employeesList');
    
    // Placeholder content
    employeesList.innerHTML = `
        <div class="employees-grid">
            <div class="employee-card">
                <h3>John Doe</h3>
                <p>Role: DOP</p>
                <p>Status: Available</p>
            </div>
            <div class="employee-card">
                <h3>Jane Smith</h3>
                <p>Role: DOP</p>
                <p>Status: On Shoot</p>
            </div>
            <div class="employee-card">
                <h3>Mike Johnson</h3>
                <p>Role: Editor</p>
                <p>Status: Available</p>
            </div>
            <div class="employee-card">
                <h3>Sarah Williams</h3>
                <p>Role: Producer</p>
                <p>Status: Available</p>
            </div>
        </div>
    `;
}
