/**
 * version.js — App version watermark
 * Change APP_VERSION before every push so you can confirm users loaded the new build.
 */

const APP_VERSION = 'V-1.1';

function injectVersionBadge() {
    const badge = document.createElement('div');
    badge.id = 'app-version-badge';
    badge.textContent = APP_VERSION;
    document.body.appendChild(badge);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectVersionBadge);
} else {
    injectVersionBadge();
}

export { APP_VERSION };
