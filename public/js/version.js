/**
 * version.js - Version and update info displayy
 */

const VERSION_INFO = {
    async load() {
        try {
            const response = await fetch('/version.json');
            return response.json();
        } catch (error) {
            console.warn('Failed to load version info:', error);
            return null;
        }
    },

    async displayInFooter(containerId) {
        const versionData = await this.load();
        if (!versionData) return;

        const container = document.getElementById(containerId);
        if (!container) return;

        const html = `
            <div class="version-info">
                <small>v${versionData.version} • ${versionData.lastUpdate}</small>
            </div>
        `;

        container.innerHTML = html;
    },

    async getVersion() {
        return await this.load();
    }
};

export { VERSION_INFO };
