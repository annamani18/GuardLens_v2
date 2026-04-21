/**
 * GuardLens v2.0 - Content Script (Scanner)
 * Scans DOM for dark patterns with MutationObserver for dynamic content
 */

console.log('[GuardLens Scanner] Content script initialized');

// Prevent duplicate injection
if (window.guardLensScanner) {
  console.log('[GuardLens Scanner] Already running, skipping');
} else {
  window.guardLensScanner = true;

  // Configuration
  const CONFIG = {
    scanInterval: 3000, // Scan every 3 seconds
    maxPatternsPerScan: 50,
    debounceDelay: 1000
  };

  // Amazon India specific selectors
  const SELECTORS = {
    // Fake Urgency
    urgency: [
      '[data-component-type*="timer"]',
      '.dealBadge',
      '.a-color-price',
      '[class*="countdown"]',
      '[class*="timer"]',
      '[class*="urgency"]',
      '.a-text-bold:has-text("left")',
      '[id*="deal"]',
      '.deal-badge'
    ],

    // False Scarcity
    scarcity: [
      '[class*="stock"]',
      '[class*="availability"]',
      '.a-size-medium.a-color-price',
      '[data-component-type*="availability"]',
      '.availability',
      '[class*="inventory"]',
      '[aria-label*="stock"]'
    ],

    // Sneak-in (pre-selected items)
    sneakIn: [
      'input[type="checkbox"][checked]',
      'input[type="radio"][checked]',
      '[class*="warranty"]',
      '[class*="protection"]',
      '[class*="addon"]',
      '.a-checkbox-fancy.a-checked',
      '[data-action*="add"]'
    ],

    // Social Proof
    socialProof: [
      '[data-hook="total-review-count"]',
      '.a-size-base.a-link-normal',
      '[class*="rating"]',
      '[class*="review"]',
      '[aria-label*="stars"]',
      '[class*="bestseller"]',
      '[class*="popular"]',
      '.a-badge-text'
    ]
  };

  // Generic selectors for other e-commerce sites
  const GENERIC_SELECTORS = {
    urgency: ['[class*="timer"]', '[class*="countdown"]', '[class*="urgency"]', '[class*="deal"]'],
    scarcity: ['[class*="stock"]', '[class*="availability"]', '[class*="inventory"]'],
    sneakIn: ['input[type="checkbox"][checked]', 'input[type="radio"][checked]', '[class*="warranty"]'],
    socialProof: ['[class*="rating"]', '[class*="review"]', '[class*="bestseller"]', '[class*="popular"]']
  };

  // Detected patterns cache
  let detectedPatterns = [];
  let scanTimeout = null;
  let isScanning = false;

  // Get appropriate selectors based on domain
  function getSelectors() {
    const hostname = window.location.hostname;
    if (hostname.includes('amazon.in') || hostname.includes('amazon.com')) {
      return SELECTORS;
    }
    return GENERIC_SELECTORS;
  }

  // Extract text from element safely
  function extractText(element) {
    try {
      // Get visible text only
      if (element.offsetParent === null) return null; // Hidden element

      let text = '';

      // Try different text sources
      if (element.textContent) {
        text = element.textContent.trim();
      } else if (element.innerText) {
        text = element.innerText.trim();
      } else if (element.getAttribute('aria-label')) {
        text = element.getAttribute('aria-label').trim();
      } else if (element.getAttribute('title')) {
        text = element.getAttribute('title').trim();
      }

      // Filter out empty or too short text
      if (!text || text.length < 3) return null;

      // Filter out common non-pattern text
      const excludePatterns = [
        /^[\d\s\-\+\(\)]+$/, // Only numbers and symbols
        /^[a-z]$/i, // Single letter
        /^\s*$/ // Only whitespace
      ];

      if (excludePatterns.some(pattern => pattern.test(text))) {
        return null;
      }

      return text.slice(0, 500); // Limit length
    } catch (error) {
      return null;
    }
  }

  // Get CSS selector path for element
  function getSelectorPath(element) {
    try {
      if (element.id) return `#${element.id}`;
      if (element.className && typeof element.className === 'string') {
        const classes = element.className.split(' ').filter(c => c).slice(0, 2).join('.');
        if (classes) return `.${classes}`;
      }
      return element.tagName.toLowerCase();
    } catch (error) {
      return 'unknown';
    }
  }

  // Scan page for dark patterns
  async function scanPage() {
    if (isScanning) {
      console.log('[GuardLens Scanner] Scan already in progress, skipping');
      return;
    }

    isScanning = true;
    console.log('[GuardLens Scanner] Starting page scan...');

    const patterns = [];
    const selectors = getSelectors();
    const seenTexts = new Set(); // Avoid duplicates

    try {
      // Scan each category
      for (const [category, selectorList] of Object.entries(selectors)) {
        for (const selector of selectorList) {
          try {
            const elements = document.querySelectorAll(selector);

            for (const element of elements) {
              if (patterns.length >= CONFIG.maxPatternsPerScan) break;

              const text = extractText(element);
              if (!text || seenTexts.has(text)) continue;

              seenTexts.add(text);
              patterns.push({
                category,
                text,
                selector: getSelectorPath(element),
                timestamp: Date.now()
              });
            }
          } catch (error) {
            // Selector might be invalid, skip it
            continue;
          }
        }
      }

      console.log(`[GuardLens Scanner] Found ${patterns.length} potential patterns`);

      // Send to background for AI analysis
      if (patterns.length > 0) {
        const response = await chrome.runtime.sendMessage({
          type: 'ANALYZE_PATTERNS',
          patterns
        });

        if (response.success) {
          console.log('[GuardLens Scanner] Analysis complete:', {
            trustScore: response.trustScore,
            totalPatterns: response.totalPatterns,
            aiUsed: response.aiUsed
          });

          // Calculate category counts
          const categoryCounts = {
            FakeUrgency: response.detections.FakeUrgency.length,
            FalseScarcity: response.detections.FalseScarcity.length,
            SneakIntoBasket: response.detections.SneakIntoBasket.length,
            DeceptiveSocialProof: response.detections.DeceptiveSocialProof.length
          };

          // Store results
          const data = {
            url: window.location.href,
            hostname: window.location.hostname,
            trustScore: response.trustScore,
            patternCount: response.totalPatterns,
            categoryCounts,
            detections: response.detections,
            aiUsed: response.aiUsed,
            timestamp: Date.now()
          };

          // Send to background to store
          await chrome.runtime.sendMessage({
            type: 'UPDATE_STATS',
            data
          });

          // Store locally for quick access
          detectedPatterns = response.detections;

          console.log('[GuardLens Scanner] Results stored successfully');
        }
      } else {
        // No patterns found - perfect score
        const data = {
          url: window.location.href,
          hostname: window.location.hostname,
          trustScore: 100,
          patternCount: 0,
          categoryCounts: {
            FakeUrgency: 0,
            FalseScarcity: 0,
            SneakIntoBasket: 0,
            DeceptiveSocialProof: 0
          },
          detections: {
            FakeUrgency: [],
            FalseScarcity: [],
            SneakIntoBasket: [],
            DeceptiveSocialProof: []
          },
          aiUsed: false,
          timestamp: Date.now()
        };

        await chrome.runtime.sendMessage({
          type: 'UPDATE_STATS',
          data
        });

        console.log('[GuardLens Scanner] No patterns detected - clean site');
      }
    } catch (error) {
      console.error('[GuardLens Scanner] Scan error:', error);
    } finally {
      isScanning = false;
    }
  }

  // Debounced scan function
  function debouncedScan() {
    if (scanTimeout) {
      clearTimeout(scanTimeout);
    }
    scanTimeout = setTimeout(scanPage, CONFIG.debounceDelay);
  }

  // MutationObserver to detect dynamic content
  const observer = new MutationObserver((mutations) => {
    // Check if any meaningful changes occurred
    const hasSignificantChanges = mutations.some(mutation => {
      return mutation.addedNodes.length > 0 ||
             mutation.removedNodes.length > 0 ||
             (mutation.type === 'attributes' &&
              (mutation.attributeName === 'class' || mutation.attributeName === 'data-component-type'));
    });

    if (hasSignificantChanges) {
      console.log('[GuardLens Scanner] DOM changed, scheduling re-scan');
      debouncedScan();
    }
  });

  // Start observing
  function startObserver() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-component-type', 'aria-label']
    });
    console.log('[GuardLens Scanner] MutationObserver started');
  }

  // Initial scan when page loads
  function initialize() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[GuardLens Scanner] DOM loaded, starting initial scan');
        setTimeout(scanPage, 2000); // Wait for dynamic content
        startObserver();
      });
    } else {
      console.log('[GuardLens Scanner] DOM already loaded, starting initial scan');
      setTimeout(scanPage, 2000);
      startObserver();
    }

    // Periodic re-scan for dynamic content
    setInterval(() => {
      if (!isScanning) {
        console.log('[GuardLens Scanner] Periodic re-scan');
        scanPage();
      }
    }, CONFIG.scanInterval);
  }

  // Message listener for manual scans
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'RESCAN') {
      console.log('[GuardLens Scanner] Manual re-scan requested');
      scanPage().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep channel open
    }

    if (message.type === 'GET_DETECTIONS') {
      sendResponse({ detections: detectedPatterns });
      return true;
    }
  });

  // Initialize scanner
  initialize();

  console.log('[GuardLens Scanner] Ready and monitoring page');
}
