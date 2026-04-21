/**
 * GuardLens Configuration
 * Centralized configuration for the extension
 */

const GUARDLENS_CONFIG = {
  // Extension metadata
  name: 'GuardLens',
  version: '1.0.0',

  // Cache settings
  cache: {
    duration: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    cleanupAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    keyPrefix: 'guardlens_cache_'
  },

  // AI settings
  ai: {
    temperature: 0.3,
    topK: 3,
    maxRetries: 2,
    timeout: 5000 // 5 seconds
  },

  // Scanner settings
  scanner: {
    minTextLength: 5,
    maxTextLength: 500,
    observerMargin: '50px',
    observerThreshold: 0.1,
    debounceDelay: 300
  },

  // Trust score calculation
  scoring: {
    baseScore: 100,
    penaltyPerPattern: 5,
    minScore: 0,
    thresholds: {
      excellent: 80,
      moderate: 60,
      concerning: 40
    }
  },

  // UI settings
  ui: {
    primaryColor: '#FFBF00',
    borderWidth: '2px',
    borderStyle: 'dashed',
    tooltipDelay: 200,
    animationDuration: 300
  },

  // Supported sites
  supportedSites: [
    'amazon.com',
    'amazon.in',
    'flipkart.com',
    'ebay.com',
    'ebay.in'
  ],

  // Pattern categories
  categories: {
    FAKE_URGENCY: 'FakeUrgency',
    FALSE_SCARCITY: 'FalseScarcity',
    SNEAK_INTO_BASKET: 'SneakIntoBasket',
    DECEPTIVE_SOCIAL_PROOF: 'DeceptiveSocialProof'
  },

  // Debug mode
  debug: false
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GUARDLENS_CONFIG;
}
