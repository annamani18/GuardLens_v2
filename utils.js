/**
 * GuardLens Utilities
 * Shared helper functions across the extension
 */

const GuardLensUtils = {
  /**
   * Debounce function to limit execution rate
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Safely parse JSON with fallback
   */
  safeJSONParse(str, fallback = null) {
    try {
      return JSON.parse(str);
    } catch (e) {
      console.warn('[GuardLens] JSON parse failed:', e);
      return fallback;
    }
  },

  /**
   * Generate cache key for a hostname
   */
  getCacheKey(hostname) {
    return `guardlens_cache_${hostname}`;
  },

  /**
   * Check if a URL is supported
   */
  isSupportedSite(url) {
    try {
      const hostname = new URL(url).hostname;
      const supportedDomains = [
        'amazon.com', 'amazon.in',
        'flipkart.com',
        'ebay.com', 'ebay.in'
      ];
      return supportedDomains.some(domain => hostname.includes(domain));
    } catch (e) {
      return false;
    }
  },

  /**
   * Format timestamp to readable string
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  },

  /**
   * Sanitize text for display
   */
  sanitizeText(text) {
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .trim();
  },

  /**
   * Calculate trust score from pattern count
   */
  calculateTrustScore(patternCount) {
    const score = Math.max(0, 100 - (patternCount * 5));
    return Math.round(score);
  },

  /**
   * Get score color based on value
   */
  getScoreColor(score) {
    if (score >= 80) return '#4CAF50'; // Green
    if (score >= 60) return '#FFBF00'; // Amber
    if (score >= 40) return '#FF9500'; // Orange
    return '#FF4444'; // Red
  },

  /**
   * Get score description
   */
  getScoreDescription(score) {
    if (score >= 80) return '✅ Excellent - Minimal dark patterns detected';
    if (score >= 60) return '⚠️ Moderate - Some manipulative patterns found';
    if (score >= 40) return '⚠️ Concerning - Multiple dark patterns detected';
    return '🚨 High Risk - Many manipulative tactics present';
  },

  /**
   * Truncate text to max length
   */
  truncate(text, maxLength = 100) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },

  /**
   * Check if Chrome AI is available
   */
  async checkAIAvailability() {
    try {
      if (!window.ai || !window.ai.languageModel) {
        return { available: false, reason: 'API not found' };
      }

      const capabilities = await window.ai.languageModel.capabilities();

      if (capabilities.available === 'no') {
        return { available: false, reason: 'Model not available' };
      }

      if (capabilities.available === 'after-download') {
        return { available: false, reason: 'Model downloading' };
      }

      return { available: true, reason: 'Ready' };
    } catch (error) {
      return { available: false, reason: error.message };
    }
  },

  /**
   * Log with timestamp (only in debug mode)
   */
  log(message, ...args) {
    if (typeof GUARDLENS_CONFIG !== 'undefined' && GUARDLENS_CONFIG.debug) {
      console.log(`[GuardLens ${new Date().toISOString()}]`, message, ...args);
    }
  },

  /**
   * Error logging (always enabled)
   */
  error(message, ...args) {
    console.error(`[GuardLens Error]`, message, ...args);
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GuardLensUtils;
}
