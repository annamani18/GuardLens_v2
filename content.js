/**
 * GuardLens v2.0 - Production-Ready Content Scanner
 * Professional dark pattern detection with visual feedback and real-time monitoring
 */

if (!window.guardLensInitialized) {
  window.guardLensInitialized = true;

  // Safe messaging helper - handles extension context invalidation gracefully
  async function safeSendMessage(payload) {
    try {
      const response = await chrome.runtime.sendMessage(payload);
      return response;
    } catch (error) {
      const errorMsg = error?.message || '';

      // Silently handle extension reload/context invalidation
      if (
        errorMsg.includes('Extension context invalidated') ||
        errorMsg.includes('Receiving end does not exist') ||
        errorMsg.includes('context invalidated') ||
        errorMsg.includes('Could not establish connection') ||
        errorMsg.includes('The message port closed before a response was received')
      ) {
        console.warn('[GuardLens] Extension context lost. Please refresh this tab after extension update.');
        return { success: false, recovered: true };
      }

      // Log unexpected errors
      console.error('[GuardLens] Messaging error:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  // Detection rules with weights and explanations
  const DETECTION_RULES = {
    fakeUrgency: {
      patterns: [
        /only\s+\d+\s+(left|remaining|available)/i,
        /\d+\s+(left|remaining)\s+in\s+stock/i,
        /hurry[^.]{0,30}(selling|going)\s+fast/i,
        /limited\s+time\s+(offer|deal|sale)/i,
        /ending\s+(soon|today|tonight)/i,
        /last\s+chance/i,
        /deal\s+ends\s+in/i,
        /offer\s+expires\s+in/i,
        /act\s+now/i,
        /don't\s+miss\s+out/i,
        /flash\s+sale/i,
        /today\s+only/i,
        /order\s+within\s+\d+/i,
        /\d+\s+(hours?|minutes?|seconds?)\s+(left|remaining)/i,
        /almost\s+gone/i,
        /selling\s+out\s+fast/i
      ],
      selectors: [
        '[class*="timer"]',
        '[class*="countdown"]',
        '[id*="countdown"]',
        '[data-component*="timer"]',
        '[class*="urgency"]',
        '[class*="limited"]'
      ],
      weight: 8,
      label: 'Fake Urgency',
      explanation: 'Creates artificial time pressure to rush your decision'
    },

    falseScarcity: {
      patterns: [
        /only\s+\d+\s+(items?|units?|pieces?)\s+left/i,
        /\d+\s+in\s+stock/i,
        /low\s+stock/i,
        /almost\s+sold\s+out/i,
        /selling\s+fast/i,
        /high\s+demand/i,
        /limited\s+(quantity|stock|availability)/i,
        /while\s+supplies\s+last/i,
        /stock\s+running\s+(out|low)/i,
        /going\s+fast/i,
        /limited\s+inventory/i,
        /few\s+items?\s+left/i
      ],
      selectors: [
        '[class*="stock"]',
        '[class*="availability"]',
        '[class*="inventory"]',
        '[data-component*="availability"]'
      ],
      weight: 12,
      label: 'False Scarcity',
      explanation: 'Exaggerates low stock to create fear of missing out'
    },

    sneakIn: {
      patterns: [
        /warranty.*automatically\s+added/i,
        /protection\s+plan.*included/i,
        /gift\s+wrap.*selected/i,
        /pre-?selected/i,
        /automatically\s+added/i,
        /included\s+by\s+default/i,
        /subscription.*added/i,
        /insurance.*included/i,
        /extended\s+warranty.*added/i
      ],
      selectors: [
        'input[type="checkbox"]:checked:not([disabled])',
        'input[type="radio"]:checked:not([disabled])',
        '[class*="warranty"][class*="selected"]',
        '[class*="protection"][class*="selected"]',
        '[class*="addon"][class*="selected"]'
      ],
      weight: 20,
      label: 'Sneak-in',
      explanation: 'Pre-selects options you may not want, increasing your bill'
    },

    socialProof: {
      patterns: [
        /\d+\+?\s+(people|customers|users|shoppers)\s+(bought|purchased|ordered|viewing|watching)/i,
        /bestseller/i,
        /trending\s+(now|today)/i,
        /most\s+popular/i,
        /top\s+rated/i,
        /\d+k?\+?\s+(sold|orders?)/i,
        /hot\s+(deal|item)/i,
        /customer\s+favorite/i,
        /\d+\s+people\s+are\s+viewing/i,
        /in\s+\d+\s+carts?/i,
        /\d+\s+bought\s+in\s+last/i
      ],
      selectors: [
        '[class*="bestseller"]',
        '[class*="trending"]',
        '[class*="popular"]',
        '[data-component*="social-proof"]'
      ],
      weight: 6,
      label: 'Social Proof Manipulation',
      explanation: 'Uses crowd behavior claims that may be exaggerated or fake'
    }
  };

  // State management
  let scanCount = 0;
  let lastScanTime = 0;
  let isScanning = false;
  let scanTimeout = null;
  let mutationObserver = null;
  let highlightedElements = new Set();
  let floatingBadge = null;
  let lastScanResult = null;

  // Check if element is visible
  function isElementVisible(element) {
    if (!element || !element.offsetParent) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }

  // Extract text with context (visible only)
  function extractTextWithContext(element) {
    if (!isElementVisible(element)) return null;

    const text = (element.textContent || element.innerText || '').trim();
    if (!text || text.length < 3 || text.length > 500) return null;

    // Filter noise
    if (/^[\d\s\-\+\(\)\.]+$/.test(text)) return null;
    if (/^[a-z]$/i.test(text)) return null;

    return text;
  }

  // Highlight element with tooltip
  function highlightElement(element, category, matchText) {
    if (!element || highlightedElements.has(element)) return;
    if (!isElementVisible(element)) return;

    highlightedElements.add(element);

    // Store original styles
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    const originalPosition = element.style.position;

    // Add highlight
    element.style.outline = '2px solid #ef4444';
    element.style.outlineOffset = '2px';
    element.setAttribute('data-guardlens-highlight', category);
    element.setAttribute('data-guardlens-original-outline', originalOutline);
    element.setAttribute('data-guardlens-original-offset', originalOutlineOffset);
    element.setAttribute('data-guardlens-original-position', originalPosition);

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'guardlens-tooltip';
    tooltip.innerHTML = `
      <div class="guardlens-tooltip-header">⚠️ ${DETECTION_RULES[category].label}</div>
      <div class="guardlens-tooltip-body">${DETECTION_RULES[category].explanation}</div>
      <div class="guardlens-tooltip-match">"${matchText.slice(0, 60)}${matchText.length > 60 ? '...' : ''}"</div>
    `;

    // Ensure element can contain tooltip
    if (element.style.position === '' || element.style.position === 'static') {
      element.style.position = 'relative';
    }
    element.appendChild(tooltip);

    // Show/hide tooltip on hover
    element.addEventListener('mouseenter', () => {
      tooltip.style.display = 'block';
    });

    element.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  }

  // Clear all highlights
  function clearHighlights() {
    highlightedElements.forEach(element => {
      if (element && element.isConnected) {
        // Restore original styles
        const originalOutline = element.getAttribute('data-guardlens-original-outline');
        const originalOffset = element.getAttribute('data-guardlens-original-offset');
        const originalPosition = element.getAttribute('data-guardlens-original-position');

        element.style.outline = originalOutline || '';
        element.style.outlineOffset = originalOffset || '';
        if (originalPosition) {
          element.style.position = originalPosition;
        }

        element.removeAttribute('data-guardlens-highlight');
        element.removeAttribute('data-guardlens-original-outline');
        element.removeAttribute('data-guardlens-original-offset');
        element.removeAttribute('data-guardlens-original-position');

        const tooltip = element.querySelector('.guardlens-tooltip');
        if (tooltip) tooltip.remove();
      }
    });
    highlightedElements.clear();
  }

  // Detect countdown timers
  function detectCountdownTimers() {
    const timers = [];
    const timerElements = document.querySelectorAll(
      '[class*="timer"], [class*="countdown"], [id*="countdown"], [data-countdown]'
    );

    timerElements.forEach(el => {
      const text = extractTextWithContext(el);
      if (text && /\d+:\d+/.test(text)) {
        timers.push({ element: el, text });
      }
    });

    return timers;
  }

  // Detect pre-selected checkboxes
  function detectSneakInElements() {
    const sneaky = [];
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked:not([disabled])');

    checkboxes.forEach(checkbox => {
      const label = checkbox.labels?.[0] || checkbox.closest('label') || checkbox.parentElement;
      const labelText = label ? extractTextWithContext(label) : '';

      if (labelText && /warranty|protection|insurance|gift|addon|extended|plan/i.test(labelText)) {
        if (!checkbox.hasAttribute('data-user-selected') && !checkbox.hasAttribute('data-guardlens-checked')) {
          sneaky.push({ element: label || checkbox, text: labelText });
          checkbox.setAttribute('data-guardlens-checked', 'true');
        }
      }
    });

    return sneaky;
  }

  // Advanced pattern detection with element tracking
  function detectPatterns() {
    const results = {
      fakeUrgency: { count: 0, instances: [], elements: [] },
      falseScarcity: { count: 0, instances: [], elements: [] },
      sneakIn: { count: 0, instances: [], elements: [] },
      socialProof: { count: 0, instances: [], elements: [] }
    };

    const seenTexts = new Set();
    const seenElements = new Set();

    // Text-based detection with TreeWalker for precision
    for (const [category, config] of Object.entries(DETECTION_RULES)) {
      for (const regex of config.patterns) {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              const parent = node.parentElement;
              if (!parent || !isElementVisible(parent)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          },
          false
        );

        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (!text || text.length < 3) continue;

          const match = text.match(regex);
          if (match) {
            const matchText = match[0];
            const lowerMatch = matchText.toLowerCase();
            const element = node.parentElement;

            if (!seenTexts.has(lowerMatch) && !seenElements.has(element)) {
              seenTexts.add(lowerMatch);
              seenElements.add(element);

              if (element && isElementVisible(element)) {
                results[category].count++;
                results[category].instances.push(matchText.slice(0, 100));
                results[category].elements.push({ element, text: matchText });
              }
            }
          }
        }
      }
    }

    // Element-based detection
    for (const [category, config] of Object.entries(DETECTION_RULES)) {
      for (const selector of config.selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (seenElements.has(el)) return;

            const text = extractTextWithContext(el);
            if (text && !seenTexts.has(text.toLowerCase())) {
              seenTexts.add(text.toLowerCase());
              seenElements.add(el);
              results[category].count++;
              results[category].instances.push(text.slice(0, 100));
              results[category].elements.push({ element: el, text });
            }
          });
        } catch (e) {
          // Invalid selector
        }
      }
    }

    // Special: Countdown timers
    const timers = detectCountdownTimers();
    timers.forEach(timer => {
      if (!seenTexts.has(timer.text.toLowerCase()) && !seenElements.has(timer.element)) {
        seenTexts.add(timer.text.toLowerCase());
        seenElements.add(timer.element);
        results.fakeUrgency.count++;
        results.fakeUrgency.instances.push(timer.text);
        results.fakeUrgency.elements.push(timer);
      }
    });

    // Special: Sneak-in elements
    const sneaky = detectSneakInElements();
    sneaky.forEach(item => {
      if (!seenTexts.has(item.text.toLowerCase()) && !seenElements.has(item.element)) {
        seenTexts.add(item.text.toLowerCase());
        seenElements.add(item.element);
        results.sneakIn.count++;
        results.sneakIn.instances.push(item.text);
        results.sneakIn.elements.push(item);
      }
    });

    return results;
  }

  // Calculate trust score with consistent weighted logic
  function calculateTrustScore(detections) {
    let score = 100;

    // Apply weighted penalties
    score -= detections.fakeUrgency.count * DETECTION_RULES.fakeUrgency.weight;
    score -= detections.falseScarcity.count * DETECTION_RULES.falseScarcity.weight;
    score -= detections.sneakIn.count * DETECTION_RULES.sneakIn.weight;
    score -= detections.socialProof.count * DETECTION_RULES.socialProof.weight;

    // Bonus for clean sites
    const totalPatterns = detections.fakeUrgency.count +
                          detections.falseScarcity.count +
                          detections.sneakIn.count +
                          detections.socialProof.count;

    if (totalPatterns === 0) {
      score = Math.min(100, score + 5);
    }

    // Clamp between 0-100
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // Generate structured explanation
  function generateStructuredExplanation(detections, score) {
    const positives = [];
    const warnings = [];
    let verdict = 'Safe';

    const totalPatterns = detections.fakeUrgency.count +
                          detections.falseScarcity.count +
                          detections.sneakIn.count +
                          detections.socialProof.count;

    if (totalPatterns === 0) {
      positives.push('No manipulative dark patterns detected');
      positives.push('Website appears transparent and trustworthy');
      positives.push('No artificial urgency or scarcity tactics found');
      verdict = 'Safe';
    } else {
      if (detections.fakeUrgency.count > 0) {
        const examples = detections.fakeUrgency.instances.slice(0, 2).map(s => `"${s}"`).join(', ');
        warnings.push(`${detections.fakeUrgency.count} fake urgency tactic${detections.fakeUrgency.count > 1 ? 's' : ''} detected (${examples}) - creates artificial time pressure`);
      }
      if (detections.falseScarcity.count > 0) {
        warnings.push(`${detections.falseScarcity.count} false scarcity claim${detections.falseScarcity.count > 1 ? 's' : ''} found - may exaggerate low stock to pressure you`);
      }
      if (detections.sneakIn.count > 0) {
        warnings.push(`${detections.sneakIn.count} pre-selected option${detections.sneakIn.count > 1 ? 's' : ''} detected - check your cart carefully before checkout`);
      }
      if (detections.socialProof.count > 0) {
        warnings.push(`${detections.socialProof.count} social proof manipulation${detections.socialProof.count > 1 ? 's' : ''} spotted - claims may be exaggerated or fake`);
      }

      if (score >= 70) {
        positives.push('Moderate use of persuasion tactics');
        verdict = 'Moderate';
      } else if (score >= 50) {
        verdict = 'Risky';
      } else {
        verdict = 'Very Risky';
      }
    }

    return { positives, warnings, verdict };
  }

  // Generate smart actionable suggestions
  function generateSmartSuggestions(detections, score) {
    const suggestions = [];

    if (detections.fakeUrgency.count > 2) {
      suggestions.push('Take your time - artificial urgency is being used to rush your decision');
      suggestions.push('Wait 24 hours before purchasing to avoid impulse buying');
    }

    if (detections.falseScarcity.count > 2) {
      suggestions.push('Verify stock claims - check back later to see if "low stock" warnings are real');
    }

    if (detections.sneakIn.count > 0) {
      suggestions.push('Review your cart carefully - uncheck unwanted add-ons and warranties before checkout');
    }

    if (detections.socialProof.count > 3) {
      suggestions.push('Read actual customer reviews on independent review sites');
      suggestions.push('Verify popularity claims through third-party sources like Trustpilot');
    }

    if (score < 70) {
      suggestions.push('Compare prices on other trusted websites before buying');
      suggestions.push('Check seller ratings, return policy, and customer service reviews');
    }

    if (score < 50) {
      suggestions.push('Consider shopping on more trustworthy platforms');
    }

    if (suggestions.length === 0) {
      suggestions.push('This site appears trustworthy - shop with confidence');
      suggestions.push('Always read product descriptions and reviews carefully');
    }

    return suggestions;
  }

  // Generate legacy insights for backward compatibility
  function generateInsights(detections, score) {
    const totalPatterns = detections.fakeUrgency.count +
                          detections.falseScarcity.count +
                          detections.sneakIn.count +
                          detections.socialProof.count;

    if (totalPatterns === 0) {
      return "No major dark patterns detected. The website appears transparent and trustworthy. Overall trust level: High.";
    }

    const insights = [];

    if (detections.fakeUrgency.count > 0) {
      const examples = detections.fakeUrgency.instances.slice(0, 2).map(s => `"${s}"`).join(', ');
      insights.push(`This page uses ${detections.fakeUrgency.count} urgency tactic${detections.fakeUrgency.count > 1 ? 's' : ''} such as ${examples} which may pressure quick decisions`);
    }

    if (detections.falseScarcity.count > 0) {
      insights.push(`Detected ${detections.falseScarcity.count} false scarcity claim${detections.falseScarcity.count > 1 ? 's' : ''} about stock levels that may not be accurate`);
    }

    if (detections.sneakIn.count > 0) {
      insights.push(`Found ${detections.sneakIn.count} pre-selected option${detections.sneakIn.count > 1 ? 's' : ''} (like warranties or add-ons) which may lead to unintended purchases`);
    }

    if (detections.socialProof.count > 0) {
      insights.push(`Spotted ${detections.socialProof.count} social proof manipulation${detections.socialProof.count > 1 ? 's' : ''} like "X people bought this" which may be exaggerated`);
    }

    let trustLevel;
    if (score >= 80) trustLevel = "High";
    else if (score >= 60) trustLevel = "Medium";
    else if (score >= 40) trustLevel = "Low";
    else trustLevel = "Very Low";

    insights.push(`Overall trust level: ${trustLevel}`);

    return insights.join('. ') + '.';
  }

  // Create or update floating badge
  function updateFloatingBadge(score, verdict) {
    if (!floatingBadge) {
      floatingBadge = document.createElement('div');
      floatingBadge.id = 'guardlens-floating-badge';
      document.body.appendChild(floatingBadge);
    }

    let color, emoji;
    if (score >= 80) {
      color = '#22c55e';
      emoji = '✓';
    } else if (score >= 60) {
      color = '#3b82f6';
      emoji = '⚠️';
    } else if (score >= 40) {
      color = '#f59e0b';
      emoji = '⚠️';
    } else {
      color = '#ef4444';
      emoji = '🚨';
    }

    floatingBadge.style.background = color;
    floatingBadge.innerHTML = `
      <div class="guardlens-badge-score">${score}</div>
      <div class="guardlens-badge-label">${emoji} ${verdict}</div>
    `;
  }

  // Main scan function - FULL RE-SCAN every time
  async function scanPage(reason = 'initial') {
    if (isScanning) {
      console.log('[GuardLens] Scan already in progress, skipping');
      return lastScanResult;
    }

    const now = Date.now();
    if (now - lastScanTime < 1000) {
      console.log('[GuardLens] Scan throttled (too soon)');
      return lastScanResult;
    }

    isScanning = true;
    lastScanTime = now;
    scanCount++;

    try {
      if (reason === 'mutation') {
        console.log('[GuardLens] Re-scanning due to DOM change');
      } else {
        console.log(`[GuardLens] Scan #${scanCount} started (${reason})`);
      }

      // Clear previous highlights
      clearHighlights();

      // FULL RE-SCAN - reset all counts
      const detections = detectPatterns();
      const score = calculateTrustScore(detections);
      const insights = generateInsights(detections, score);
      const explanation = generateStructuredExplanation(detections, score);
      const suggestions = generateSmartSuggestions(detections, score);

      // Highlight detected elements
      for (const [category, data] of Object.entries(detections)) {
        data.elements.forEach(item => {
          highlightElement(item.element, category, item.text);
        });
      }

      // Update floating badge
      updateFloatingBadge(score, explanation.verdict);

      const patterns = {
        fakeUrgency: detections.fakeUrgency.count,
        falseScarcity: detections.falseScarcity.count,
        sneakIn: detections.sneakIn.count,
        socialProof: detections.socialProof.count
      };

      const data = {
        score,
        patterns,
        insights,
        explanation,
        suggestions,
        url: window.location.href,
        hostname: window.location.hostname,
        timestamp: now,
        scanCount
      };

      console.log('[GuardLens] Patterns detected:', patterns);
      console.log('[GuardLens] Updated score:', score);

      // Send to background using safe messaging
      const sendResult = await safeSendMessage({
        type: 'SCAN_RESULT',
        data
      });

      if (!sendResult.success && !sendResult.recovered) {
        console.warn('[GuardLens] Failed to send scan result to background');
      }

      lastScanResult = data;
      return data;

    } catch (error) {
      console.error('[GuardLens] Scan error:', error);
      return lastScanResult;
    } finally {
      isScanning = false;
    }
  }

  // Debounced scan - prevents excessive scanning
  function debouncedScan(reason = 'mutation') {
    clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      scanPage(reason);
    }, 500);
  }

  // MutationObserver for real-time dynamic content detection
  function initializeMutationObserver() {
    if (mutationObserver) {
      console.log('[GuardLens] MutationObserver already initialized');
      return;
    }

    mutationObserver = new MutationObserver((mutations) => {
      let hasSignificantChanges = false;

      for (const mutation of mutations) {
        // New nodes added
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if it's not our own elements
              if (!node.id || !node.id.startsWith('guardlens-')) {
                hasSignificantChanges = true;
                break;
              }
            }
          }
        }

        // Text content changed (countdown timers, stock updates)
        if (mutation.type === 'characterData') {
          const text = mutation.target.textContent || '';
          if (/\d/.test(text)) {
            hasSignificantChanges = true;
          }
        }

        if (hasSignificantChanges) break;
      }

      if (hasSignificantChanges) {
        debouncedScan('mutation');
      }
    });

    // Start observing
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    console.log('[GuardLens] MutationObserver initialized - watching for dynamic content');
  }

  // Inject styles
  function injectStyles() {
    if (document.getElementById('guardlens-styles')) return;

    const style = document.createElement('style');
    style.id = 'guardlens-styles';
    style.textContent = `
      .guardlens-tooltip {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        z-index: 999999;
        background: white;
        border: 2px solid #ef4444;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-width: 300px;
        margin-top: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .guardlens-tooltip-header {
        font-weight: 600;
        font-size: 13px;
        color: #ef4444;
        margin-bottom: 6px;
      }

      .guardlens-tooltip-body {
        font-size: 12px;
        color: #374151;
        margin-bottom: 6px;
        line-height: 1.4;
      }

      .guardlens-tooltip-match {
        font-size: 11px;
        color: #6b7280;
        font-style: italic;
        border-top: 1px solid #e5e7eb;
        padding-top: 6px;
      }

      #guardlens-floating-badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999998;
        padding: 12px 16px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
      }

      #guardlens-floating-badge:hover {
        transform: scale(1.05);
      }

      .guardlens-badge-score {
        font-size: 24px;
        text-align: center;
        margin-bottom: 4px;
      }

      .guardlens-badge-label {
        font-size: 11px;
        text-align: center;
        opacity: 0.95;
      }
    `;
    document.head.appendChild(style);
  }

  // Initialize scanner
  function initialize() {
    console.log('[GuardLens] Production scanner initializing...');

    injectStyles();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
          scanPage('initial');
          initializeMutationObserver();
        }, 1500);
      });
    } else {
      setTimeout(() => {
        scanPage('initial');
        initializeMutationObserver();
      }, 1500);
    }
  }

  // E-commerce signal detection with confidence scoring
  function analyzeEcommerceSignals() {
    const signals = {
      addToCart: { weight: 25, found: false, elements: [] },
      buyNow: { weight: 20, found: false, elements: [] },
      checkout: { weight: 20, found: false, elements: [] },
      priceSymbols: { weight: 15, found: false, count: 0 },
      productCards: { weight: 15, found: false, count: 0 },
      ratings: { weight: 10, found: false, count: 0 },
      reviews: { weight: 10, found: false, count: 0 },
      shipping: { weight: 8, found: false, count: 0 },
      wishlist: { weight: 8, found: false, elements: [] },
      cart: { weight: 8, found: false, elements: [] }
    };

    // Add to Cart detection
    const addToCartPatterns = [
      /add\s+to\s+cart/i,
      /add\s+to\s+bag/i,
      /add\s+to\s+basket/i,
      /add\s+item/i,
      /add\s+to\s+order/i
    ];
    const addToCartElements = document.querySelectorAll('button, a, [role="button"]');
    addToCartElements.forEach(el => {
      const text = el.textContent || '';
      if (addToCartPatterns.some(p => p.test(text))) {
        signals.addToCart.found = true;
        signals.addToCart.elements.push(el);
      }
    });

    // Buy Now detection
    const buyNowPatterns = [
      /buy\s+now/i,
      /purchase\s+now/i,
      /order\s+now/i,
      /buy\s+it\s+now/i,
      /place\s+order/i
    ];
    buyNowElements = document.querySelectorAll('button, a, [role="button"]');
    buyNowElements.forEach(el => {
      const text = el.textContent || '';
      if (buyNowPatterns.some(p => p.test(text))) {
        signals.buyNow.found = true;
        signals.buyNow.elements.push(el);
      }
    });

    // Checkout detection
    const checkoutPatterns = [
      /checkout/i,
      /proceed\s+to\s+checkout/i,
      /go\s+to\s+checkout/i,
      /payment/i,
      /billing/i
    ];
    const checkoutElements = document.querySelectorAll('button, a, [role="button"]');
    checkoutElements.forEach(el => {
      const text = el.textContent || '';
      if (checkoutPatterns.some(p => p.test(text))) {
        signals.checkout.found = true;
        signals.checkout.elements.push(el);
      }
    });

    // Price symbols detection ($ € £ ₹ ¥ etc.)
    const priceSymbols = /[\$€£₹¥₽₩₪₨₱₡₲₴₵]/g;
    const bodyText = document.body.innerText || '';
    const priceMatches = bodyText.match(priceSymbols);
    if (priceMatches && priceMatches.length > 0) {
      signals.priceSymbols.found = true;
      signals.priceSymbols.count = Math.min(priceMatches.length, 50); // Cap at 50
    }

    // Product cards detection (common e-commerce patterns)
    const productCardSelectors = [
      '[class*="product"]',
      '[class*="item"]',
      '[class*="card"]',
      '[data-component*="product"]',
      'article[class*="product"]',
      'div[class*="product-card"]'
    ];
    let productCardCount = 0;
    productCardSelectors.forEach(selector => {
      try {
        productCardCount += document.querySelectorAll(selector).length;
      } catch (e) {
        // Invalid selector, skip
      }
    });
    if (productCardCount > 2) {
      signals.productCards.found = true;
      signals.productCards.count = Math.min(productCardCount, 100);
    }

    // Ratings detection
    const ratingPatterns = [
      /★|⭐|rating|stars?|out\s+of\s+5/i,
      /\d+\.?\d*\s*\/\s*5/,
      /\(\d+\s+reviews?\)/i
    ];
    const ratingElements = document.querySelectorAll('[class*="rating"], [class*="stars"], [class*="review"]');
    if (ratingElements.length > 0) {
      signals.ratings.found = true;
      signals.ratings.count = ratingElements.length;
    }

    // Reviews detection
    const reviewPatterns = [
      /customer\s+reviews?/i,
      /user\s+reviews?/i,
      /reviews?/i,
      /what\s+customers?\s+say/i
    ];
    const reviewElements = document.querySelectorAll('[class*="review"], [class*="comment"], [class*="feedback"]');
    if (reviewElements.length > 0) {
      signals.reviews.found = true;
      signals.reviews.count = reviewElements.length;
    }

    // Shipping detection
    const shippingPatterns = [
      /shipping/i,
      /delivery/i,
      /free\s+shipping/i,
      /express\s+shipping/i,
      /standard\s+shipping/i,
      /track\s+order/i
    ];
    const bodyHTML = document.body.innerHTML || '';
    const shippingMatches = bodyHTML.match(new RegExp(shippingPatterns.map(p => p.source).join('|'), 'gi'));
    if (shippingMatches && shippingMatches.length > 0) {
      signals.shipping.found = true;
      signals.shipping.count = shippingMatches.length;
    }

    // Wishlist detection
    const wishlistPatterns = [
      /wishlist/i,
      /save\s+for\s+later/i,
      /add\s+to\s+favorites?/i,
      /heart\s+icon/i,
      /save\s+item/i
    ];
    const wishlistElements = document.querySelectorAll('button, a, [role="button"]');
    wishlistElements.forEach(el => {
      const text = el.textContent || '';
      if (wishlistPatterns.some(p => p.test(text))) {
        signals.wishlist.found = true;
        signals.wishlist.elements.push(el);
      }
    });

    // Cart icon/link detection
    const cartPatterns = [
      /cart|bag|basket/i,
      /\(\d+\)/, // (0), (1), etc. - item count
      /shopping\s+cart/i
    ];
    const cartElements = document.querySelectorAll('a, button, [role="button"], [class*="cart"], [class*="bag"]');
    cartElements.forEach(el => {
      const text = el.textContent || '';
      if (cartPatterns.some(p => p.test(text))) {
        signals.cart.found = true;
        signals.cart.elements.push(el);
      }
    });

    // Calculate confidence score
    let totalWeight = 0;
    let foundWeight = 0;

    for (const [key, signal] of Object.entries(signals)) {
      totalWeight += signal.weight;
      if (signal.found) {
        foundWeight += signal.weight;
      }
    }

    const confidence = totalWeight > 0 ? Math.round((foundWeight / totalWeight) * 100) : 0;

    // Get detected signals for logging
    const detectedSignals = Object.entries(signals)
      .filter(([_, signal]) => signal.found)
      .map(([key, _]) => key);

    return {
      confidence,
      signals,
      detectedSignals,
      totalSignalsFound: detectedSignals.length,
      totalSignalsAvailable: Object.keys(signals).length
    };
  }

  // Message listener for manual scans and communication
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_NOW') {
      scanPage('manual').then(data => {
        sendResponse({ success: true, data });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (message.type === 'PING') {
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'GET_CACHE') {
      sendResponse({ data: lastScanResult });
      return true;
    }

    if (message.type === 'ANALYZE_ECOMMERCE_SIGNALS') {
      try {
        const analysis = analyzeEcommerceSignals();
        sendResponse({ success: true, ...analysis });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }
  });

  // Start the scanner
  initialize();
  console.log('[GuardLens] Production scanner ready');
}
