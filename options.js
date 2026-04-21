/**
 * GuardLens Options Page
 * Settings and preferences management
 */

class GuardLensOptions {
  constructor() {
    this.settings = {
      enableAI: true,
      showTooltips: true,
      autoScan: true,
      showBadge: true
    };

    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.loadStatistics();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get('guardlens_settings');
      if (result.guardlens_settings) {
        this.settings = { ...this.settings, ...result.guardlens_settings };
      }
    } catch (error) {
      console.error('[GuardLens Options] Failed to load settings:', error);
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({
        guardlens_settings: this.settings
      });

      // Show success feedback
      const saveBtn = document.getElementById('saveBtn');
      const originalText = saveBtn.textContent;
      saveBtn.textContent = '✅ Saved!';
      saveBtn.disabled = true;

      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
      }, 2000);

    } catch (error) {
      console.error('[GuardLens Options] Failed to save settings:', error);
      alert('Failed to save settings. Please try again.');
    }
  }

  async loadStatistics() {
    try {
      const result = await chrome.storage.local.get('guardlens_site_stats');
      const stats = result.guardlens_site_stats || {};

      let totalScans = 0;
      let totalPatterns = 0;
      const sitesScanned = Object.keys(stats).length;

      for (const site of Object.values(stats)) {
        totalScans += site.totalScans || 0;
        totalPatterns += site.totalPatterns || 0;
      }

      document.getElementById('totalScans').textContent = totalScans;
      document.getElementById('totalPatterns').textContent = totalPatterns;
      document.getElementById('sitesScanned').textContent = sitesScanned;

    } catch (error) {
      console.error('[GuardLens Options] Failed to load statistics:', error);
    }
  }

  updateUI() {
    // Update toggle switches
    document.getElementById('toggleAI').classList.toggle('active', this.settings.enableAI);
    document.getElementById('toggleTooltips').classList.toggle('active', this.settings.showTooltips);
    document.getElementById('toggleAutoScan').classList.toggle('active', this.settings.autoScan);
    document.getElementById('toggleBadge').classList.toggle('active', this.settings.showBadge);
  }

  setupEventListeners() {
    // Toggle switches
    document.getElementById('toggleAI').addEventListener('click', () => {
      this.settings.enableAI = !this.settings.enableAI;
      this.updateUI();
    });

    document.getElementById('toggleTooltips').addEventListener('click', () => {
      this.settings.showTooltips = !this.settings.showTooltips;
      this.updateUI();
    });

    document.getElementById('toggleAutoScan').addEventListener('click', () => {
      this.settings.autoScan = !this.settings.autoScan;
      this.updateUI();
    });

    document.getElementById('toggleBadge').addEventListener('click', () => {
      this.settings.showBadge = !this.settings.showBadge;
      this.updateUI();
    });

    // Save button
    document.getElementById('saveBtn').addEventListener('click', () => {
      this.saveSettings();
    });

    // Reset button
    document.getElementById('resetBtn').addEventListener('click', () => {
      if (confirm('Reset all settings to defaults?')) {
        this.settings = {
          enableAI: true,
          showTooltips: true,
          autoScan: true,
          showBadge: true
        };
        this.updateUI();
        this.saveSettings();
      }
    });

    // Clear cache button
    document.getElementById('clearCacheBtn').addEventListener('click', async () => {
      if (confirm('Clear all cached scan results?')) {
        await this.clearCache();
      }
    });

    // Reset stats button
    document.getElementById('resetStatsBtn').addEventListener('click', async () => {
      if (confirm('This will permanently delete all scan history. Continue?')) {
        await this.resetStatistics();
      }
    });

    // Export button
    document.getElementById('exportBtn').addEventListener('click', async () => {
      await this.exportData();
    });
  }

  async clearCache() {
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });

      alert('Cache cleared successfully!');
      await this.loadStatistics();

    } catch (error) {
      console.error('[GuardLens Options] Failed to clear cache:', error);
      alert('Failed to clear cache. Please try again.');
    }
  }

  async resetStatistics() {
    try {
      await chrome.storage.local.remove(['guardlens_site_stats', 'guardlens_reports']);

      alert('Statistics reset successfully!');
      await this.loadStatistics();

    } catch (error) {
      console.error('[GuardLens Options] Failed to reset statistics:', error);
      alert('Failed to reset statistics. Please try again.');
    }
  }

  async exportData() {
    try {
      const data = await chrome.storage.local.get(null);

      // Filter GuardLens data
      const exportData = {};
      for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('guardlens_')) {
          exportData[key] = value;
        }
      }

      // Create download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `guardlens-data-${new Date().toISOString().split('T')[0]}.json`;
      a.click();

      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('[GuardLens Options] Failed to export data:', error);
      alert('Failed to export data. Please try again.');
    }
  }
}

// Initialize options page
document.addEventListener('DOMContentLoaded', () => {
  new GuardLensOptions();
});
