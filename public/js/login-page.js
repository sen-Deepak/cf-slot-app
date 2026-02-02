/**
 * login-page.js - Login page logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');
    const loginBtn = loginForm.querySelector('button[type="submit"]');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const forgotLink = document.getElementById('forgotPasswordLink');
    const modal = document.getElementById('forgotPasswordModal');
    const modalCloseBtn = document.getElementById('modalClose');

    // Password visibility toggle
    if (togglePasswordBtn && passwordInput) {
        const iconEye = togglePasswordBtn.querySelector('.icon-eye');
        const iconEyeOff = togglePasswordBtn.querySelector('.icon-eye-off');
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
            if (iconEye && iconEyeOff) {
                iconEye.classList.toggle('hidden', !isPassword);
                iconEyeOff.classList.toggle('hidden', isPassword);
            }
        });
    }

    // Forgot password: show modal
    if (forgotLink && modal) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('modal-open');
            modal.setAttribute('aria-hidden', 'false');
        });
    }
    if (modalCloseBtn && modal) {
        modalCloseBtn.addEventListener('click', () => {
            modal.classList.remove('modal-open');
            modal.setAttribute('aria-hidden', 'true');
        });
    }
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('modal-open');
                modal.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // Email validation: red border when value is non-empty and invalid
    function validateEmailField() {
        const value = emailInput.value.trim();
        const valid = !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        emailInput.classList.toggle('input-invalid', !valid);
    }
    emailInput.addEventListener('input', validateEmailField);
    emailInput.addEventListener('blur', validateEmailField);

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // Clear previous error
        UI.showError(loginError, '');

        // Validate
        validateEmailField();
        if (!email || !password) {
            UI.showError(loginError, 'Please enter both email and password');
            return;
        }
        if (emailInput.classList.contains('input-invalid')) {
            UI.showError(loginError, 'Please enter a valid email address');
            return;
        }

        // Show loading state
        loginBtn.disabled = true;
        loginBtn.textContent = 'Authenticating...';

        try {
            // Attempt login (now async)
            const user = await AUTH.login(email, password);
            
            if (user) {
                UI.showToast('Login successful!', 'success', 1500);
                setTimeout(() => {
                    window.location.href = '/public/booking.html';
                }, 500);
            } else {
                UI.showError(loginError, 'Invalid email or password');
                UI.showToast('Login failed', 'error', 3000);
                loginBtn.disabled = false;
                loginBtn.textContent = 'Login';
            }
        } catch (error) {
            console.error('Login error:', error);
            UI.showError(loginError, 'An error occurred. Please try again.');
            UI.showToast('Login error', 'error', 3000);
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    });
});
