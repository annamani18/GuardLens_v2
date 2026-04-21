/**
 * GuardLens v2.0 - Production Popup Controller
 * Professional UI with smooth updates and actionable insights
 */

// Color schemes for scores
function getScoreColor(score) {
  if (score >= 80) return { primary: '#22c55e', secondary: '#10b981', gradient: 'linear-gradient(135deg, #22c55e, #10b981)' };
  if (score >= 60) return { primary: '#3b82f6', secondary: '#2563eb', gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' };
  if (score >= 40) return { primary: '#f59e0b', secondary: '#d97706', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' };
  return { primary: '#ef4444', secondary: '#dc2626', gradient: 'linear-gradient(135deg, #ef4444, #dc2626)' };
}

function getScoreExplanation(score, count) {
  if (count === 0) return { icon: '✨', text: 'No manipulative patterns detected. This site appears trustworthy!' };
  if (score >= 80) return { icon: '✓', text: `${count} minor pattern${count > 1 ? 's' : ''} detected. Generally safe to shop here.` };
  if (score >= 60) return { icon: '⚠️', text: `${count} patterns detected. Shop with caution and verify claims.` };
  if (score >= 40) return { icon: '⚠️', text: `${count} patterns detected. High manipulation risk. Be very careful.` };
  return { icon: '🚨', text: `${count} patterns detected. Very aggressive dark patterns. Consider alternatives.` };
}

// Animate score circle with smooth transition
function animateScoreCircle(targetScore) {
  const circle = document.getElementById('scoreCircle');
  const scoreValue = document.getElementById('scoreVal');
  const colors = getScoreColor(targetScore);

  const gradient = document.querySelector('#scoreGradient stop:first-child');
  const gradient2 = document.querySelector('#scoreGradient stop:last-child');
  if (gradient && gradient2) {
    gradient.style.stopColor = colors.primary;
    gradient2.style.stopColor = colors.secondary;
  }

  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (targetScore / 100) * circumference;
  circle.style.strokeDashoffset = offset;

  let current = 0;
  const duration = 1500;
  const start = performance.now();

  function step(timestamp) {
    const elapsed = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    current = Math.round(eased * targetScore);

    scoreValue.textContent = current;
    scoreValue.style.background = colors.gradient;
    scoreValue.style.webkitBackgroundClip = 'text';
    scoreValue.style.webkitTextFillColor = 'transparent';

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      scoreValue.textContent = targetScore;
    }
  }

  requestAnimationFrame(step);
}

// Update pattern indicators with visual feedback
function updatePatternIndicators(counts) {
  const patterns = ['urgency', 'scarcity', 'sneak', 'social'];

  patterns.forEach(pattern => {
    const card = document.querySelector(`.pattern-card[data-pattern="${pattern}"]`);
    if (!card) return;

    const count = counts[pattern] || 0;

    if (count === 0) {
      card.setAttribute('data-level', 'safe');
    } else if (count <= 2) {
      card.setAttribute('data-level', 'warning');
    } else {
      card.setAttribute('data-level', 'danger');
    }

    card.classList.add('fade-in');
  });
}

// Generate "Why this score?" content with structured explanation
function generateWhyScore(data) {
  const whyContent = document.getElementById('whyScoreContent');

  if (!data) {
    whyContent.innerHTML = `
      <div class="why-item slide-in">
        <div class="why-icon positive">✓</div>
        <div class="why-text">Analyzing page patterns...</div>
      </div>
    `;
    return;
  }

  // Use structured explanation if available
  if (data.explanation) {
    const { positives, warnings } = data.explanation;
    const items = [];

    positives.forEach(text => {
      items.push({ icon: '✓', type: 'positive', text });
    });

    warnings.forEach(text => {
      items.push({ icon: '✗', type: 'negative', text });
    });

    whyContent.innerHTML = items.map((item, index) => `
      <div class="why-item slide-in" style="animation-delay: ${index * 0.1}s">
        <div class="why-icon ${item.type}">${item.icon}</div>
        <div class="why-text">${item.text}</div>
      </div>
    `).join('');
  } else if (data.insights) {
    // Fallback to legacy insights
    const sentences = data.insights.split('. ').filter(s => s.trim());
    const items = sentences.map(sentence => {
      const isNegative = /uses|detected|found|spotted/i.test(sentence);
      return {
        icon: isNegative ? '✗' : '✓',
        type: isNegative ? 'negative' : 'positive',
        text: sentence
      };
    });

    whyContent.innerHTML = items.map((item, index) => `
      <div class="why-item slide-in" style="animation-delay: ${index * 0.1}s">
        <div class="why-icon ${item.type}">${item.icon}</div>
        <div class="why-text">${item.text}</div>
      </div>
    `).join('');
  }
}

// Display smart actionable suggestions
function displaySmartSuggestions(suggestions) {
  const suggestionsSection = document.getElementById('smartSuggestions');
  if (!suggestionsSection) return;

  if (!suggestions || suggestions.length === 0) {
    suggestionsSection.style.display = 'none';
    return;
  }

  suggestionsSection.style.display = 'block';
  const suggestionsList = suggestionsSection.querySelector('.suggestions-list');

  suggestionsList.innerHTML = suggestions.map((suggestion, index) => `
    <div class="suggestion-item fade-in" style="animation-delay: ${index * 0.1}s">
      <div class="suggestion-icon">💡</div>
      <div class="suggestion-text">${suggestion}</div>
    </div>
  `).join('');
}

// Load market comparison with e-commerce filtering and LIVE score sync
async function loadComparison(currentData, currentUrl) {
  try {
    const comparisonList = document.getElementById('comparisonList');
    const comparisonSection = document.querySelector('.comparison-section');
    const comparisonBadge = document.getElementById('comparisonBadge');

    // Check if current site is e-commerce
    const currentHostname = currentUrl ? new URL(currentUrl).hostname : null;
    const isCurrentSiteEcommerce = currentHostname ? isEcommerceDomain(currentHostname) : false;

    // If current site is NOT e-commerce, hide comparison entirely
    if (!isCurrentSiteEcommerce) {
      comparisonSection.style.display = 'none';
      return;
    }

    // Current site is e-commerce, show comparison
    comparisonSection.style.display = 'block';

    const response = await chrome.runtime.sendMessage({ type: 'GET_MARKET_COMPARISON' });
    let sites = response.comparison || [];

    // FILTER: Keep only e-commerce domains
    sites = sites.filter(site => isEcommerceDomain(site.site));

    // Update current site with LIVE score if it's in the filtered list
    if (currentData && currentUrl) {
      const currentSiteIndex = sites.findIndex(site => {
        const siteHostname = site.site.includes('www.') ? site.site : 'www.' + site.site;
        return siteHostname === currentHostname || site.site === currentHostname.replace('www.', '');
      });

      if (currentSiteIndex !== -1) {
        // Update with LIVE score from current scan
        sites[currentSiteIndex] = {
          ...sites[currentSiteIndex],
          score: currentData.score,
          patterns: currentData.patterns,
          isCurrentSite: true
        };

        console.log(`[GuardLens Popup] Updated comparison for current site ${currentHostname} with LIVE score: ${currentData.score}`);
      } else if (isCurrentSiteEcommerce) {
        // Current site not in comparison yet, add it with LIVE score
        sites.push({
          site: currentHostname.replace('www.', ''),
          score: currentData.score,
          patterns: currentData.patterns,
          isCurrentSite: true,
          ranking: { emoji: '✓', label: 'Current' }
        });

        console.log(`[GuardLens Popup] Added current site ${currentHostname} to comparison with LIVE score: ${currentData.score}`);
      }
    }

    // Re-sort by score (current site might have moved up/down)
    sites.sort((a, b) => b.score - a.score);

    if (sites.length < 1) {
      comparisonList.innerHTML = `
        <div class="comparison-empty">
          <div class="empty-icon">🏪</div>
          <div class="empty-text">Open multiple e-commerce tabs to compare trust scores and find the safest sites</div>
        </div>
      `;
      comparisonBadge.textContent = '0 sites';
      return;
    }

    comparisonBadge.textContent = `${sites.length} site${sites.length !== 1 ? 's' : ''}`;

    comparisonList.innerHTML = sites.slice(0, 5).map((site, index) => {
      const colors = getScoreColor(site.score);
      const ranking = site.ranking || { emoji: '•', label: 'Analyzed' };

      // Highlight current site with LIVE indicator
      const isCurrentSite = site.isCurrentSite;
      const currentBadge = isCurrentSite ? ' <span style="margin-left: 8px; font-size: 10px; color: #6366f1; font-weight: 700; background: rgba(99, 102, 241, 0.2); padding: 2px 6px; border-radius: 4px;">● LIVE</span>' : '';
      const currentSiteStyle = isCurrentSite ? ' style="background: rgba(99, 102, 241, 0.08); border-left: 3px solid #6366f1; padding-left: 9px;"' : '';

      return `
        <div class="comparison-item fade-in"${currentSiteStyle} style="animation-delay: ${index * 0.1}s">
          <div class="comparison-rank">${ranking.emoji}</div>
          <div class="comparison-info">
            <div class="comparison-site">${site.site}${currentBadge}</div>
            <div class="comparison-patterns">${ranking.label} • ${Object.values(site.patterns).reduce((a, b) => a + b, 0)} patterns</div>
          </div>
          <div class="comparison-score" style="color: ${colors.primary}">${site.score}</div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('[GuardLens Popup] Comparison error:', error);
  }
}

// Check if URL is valid for scanning
function isValidUrl(url) {
  if (!url) return false;
  const blocked = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'data:', 'file://'];
  if (blocked.some(pattern => url.startsWith(pattern))) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

// Check if URL is scannable (comprehensive validation)
function isScannableUrl(url) {
  if (!url) return false;

  const unsupportedPatterns = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'file://',
    'devtools://',
    'view-source:',
    'chrome-search://',
    'data:',
    'blob:'
  ];

  const urlLower = url.toLowerCase();
  if (unsupportedPatterns.some(pattern => urlLower.startsWith(pattern))) {
    return false;
  }

  return url.startsWith('http://') || url.startsWith('https://');
}

// E-commerce domain whitelist and detection
const ECOMMERCE_WHITELIST = new Set([
  'amazon.in', 'amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr',
  'flipkart.com',
  'myntra.com',
  'nykaa.com',
  'meesho.com',
  'ajio.com',
  'alibaba.com', 'aliexpress.com',
  'snapdeal.com',
  'ebay.com', 'ebay.co.uk',
  'etsy.com',
  'shopify.com',
  'walmart.com',
  'target.com',
  'bestbuy.com',
  'ikea.com',
  'zara.com',
  'h&m.com', 'hm.com',
  'uniqlo.com',
  'forever21.com',
  'shein.com',
  'asos.com',
  'boohoo.com',
  'missguided.com',
  'prettylittlething.com',
  'fashionnova.com',
  'revolve.com',
  'farfetch.com',
  'ssense.com',
  'net-a-porter.com',
  'matchesfashion.com',
  'selfridges.com',
  'harrods.com',
  'johnlewis.com',
  'debenhams.com',
  'next.co.uk',
  'topshop.com',
  'gap.com',
  'hm.com',
  'inditex.com',
  'decathlon.com',
  'alibabagroup.com'
]);

// Check if domain is e-commerce using whitelist and keyword detection
function isEcommerceDomain(domain) {
  if (!domain) return false;

  const cleanDomain = domain.toLowerCase().replace('www.', '');

  // Check whitelist first
  if (ECOMMERCE_WHITELIST.has(cleanDomain)) return true;

  // Check for e-commerce keywords in domain
  const ecommerceKeywords = ['shop', 'store', 'buy', 'cart', 'checkout', 'product', 'fashion', 'electronics', 'mall', 'bazaar', 'market', 'commerce', 'retail', 'sale', 'deal', 'offer'];
  const domainLower = cleanDomain.toLowerCase();

  return ecommerceKeywords.some(keyword => domainLower.includes(keyword));
}

// Hybrid e-commerce detection with DOM analysis and confidence scoring
async function detectEcommerceWithDOMAnalysis(tabId) {
  try {
    // First check: whitelist or domain keywords (fast path)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return { isEcommerce: false, confidence: 0, reason: 'Tab not found' };

    const hostname = new URL(tab.url).hostname;
    if (isEcommerceDomain(hostname)) {
      return { isEcommerce: true, confidence: 100, reason: 'Known e-commerce domain', source: 'whitelist' };
    }

    // Second check: DOM analysis for e-commerce signals
    const domSignals = await chrome.tabs.sendMessage(tabId, { type: 'ANALYZE_ECOMMERCE_SIGNALS' }).catch(() => null);

    if (!domSignals) {
      return { isEcommerce: false, confidence: 0, reason: 'Could not analyze page', source: 'error' };
    }

    const confidence = domSignals.confidence;
    const isEcommerce = confidence >= 50; // 50% confidence threshold

    return {
      isEcommerce,
      confidence,
      reason: isEcommerce ? `E-commerce signals detected (${confidence}% confidence)` : 'Not enough e-commerce signals detected',
      source: 'dom_analysis',
      signals: domSignals.signals,
      detectedSignals: domSignals.detectedSignals
    };
  } catch (error) {
    console.warn('[GuardLens Popup] DOM analysis error:', error.message);
    return { isEcommerce: false, confidence: 0, reason: 'Analysis failed', source: 'error' };
  }
}

// Show error state
function showError(message) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('main').style.display = 'block';
  document.getElementById('scoreDesc').textContent = message;
}

// Clear UI to prevent stale data display
function clearUI() {
  document.getElementById('siteName').textContent = '';
  document.getElementById('scoreDesc').textContent = '';
  document.getElementById('scoreVal').textContent = '...';
  document.getElementById('urgencyCount').textContent = '0';
  document.getElementById('scarcityCount').textContent = '0';
  document.getElementById('sneakCount').textContent = '0';
  document.getElementById('socialCount').textContent = '0';
  document.getElementById('whyScoreContent').innerHTML = '';
  document.getElementById('smartSuggestions').style.display = 'none';
}

// Main load function with proper state management and error handling
async function loadStats() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Validate tab exists and has required properties
    if (!tab || !tab.id || !tab.url) {
      showError('Unable to get active tab');
      return;
    }

    const tabHostname = new URL(tab.url).hostname;
    console.log('[GuardLens Popup] Loading stats for:', tab.url, '(domain:', tabHostname, ')');

    // Check if URL is scannable - graceful handling for unsupported pages
    if (!isScannableUrl(tab.url)) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('main').style.display = 'block';
      document.getElementById('siteName').textContent = 'Restricted Page';
      document.getElementById('scoreDesc').textContent = 'This page cannot be scanned.';
      document.getElementById('scoreVal').textContent = '--';

      const explanation = document.getElementById('scoreExplanation');
      explanation.querySelector('.explanation-icon').textContent = '🚫';
      explanation.querySelector('.explanation-text').textContent = 'Scanning is available only on regular websites (http:// or https://)';

      document.querySelector('.patterns-section').style.display = 'none';
      document.querySelector('.why-score-section').style.display = 'none';
      document.getElementById('smartSuggestions').style.display = 'none';
      document.querySelector('.comparison-section').style.display = 'none';

      // Disable re-scan button for unsupported pages
      const rescanBtn = document.getElementById('rescanBtn');
      if (rescanBtn) {
        rescanBtn.disabled = true;
        rescanBtn.title = 'Scanning available only on supported websites.';
        rescanBtn.style.opacity = '0.5';
        rescanBtn.style.cursor = 'not-allowed';
      }

      return;
    }

    // Check if domain is known e-commerce
    const isKnownEcommerce = isEcommerceDomain(tabHostname);

    // If not known e-commerce, perform hybrid DOM analysis
    let ecommerceAnalysis = null;
    if (!isKnownEcommerce) {
      console.log('[GuardLens Popup] Unknown domain, performing DOM analysis:', tabHostname);
      ecommerceAnalysis = await detectEcommerceWithDOMAnalysis(tab.id);
      console.log('[GuardLens Popup] DOM analysis result:', ecommerceAnalysis);

      // If not enough e-commerce signals, show friendly message
      if (!ecommerceAnalysis.isEcommerce) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('main').style.display = 'block';
        document.getElementById('siteName').textContent = tabHostname.replace('www.', '');
        document.getElementById('scoreDesc').textContent = 'GuardLens works only on shopping websites.';
        document.getElementById('scoreVal').textContent = '--';

        const explanation = document.getElementById('scoreExplanation');
        explanation.querySelector('.explanation-icon').textContent = '🛍️';
        explanation.querySelector('.explanation-text').textContent = `This site doesn't appear to be an e-commerce platform. GuardLens detects dark patterns on shopping sites.`;

        document.querySelector('.patterns-section').style.display = 'none';
        document.querySelector('.why-score-section').style.display = 'none';
        document.getElementById('smartSuggestions').style.display = 'none';
        document.querySelector('.comparison-section').style.display = 'none';

        // Disable re-scan button
        const rescanBtn = document.getElementById('rescanBtn');
        if (rescanBtn) {
          rescanBtn.disabled = true;
          rescanBtn.title = 'GuardLens works only on shopping websites.';
          rescanBtn.style.opacity = '0.5';
          rescanBtn.style.cursor = 'not-allowed';
        }

        console.log('[GuardLens Popup] Not enough e-commerce signals (confidence: ' + ecommerceAnalysis.confidence + '%)');
        return;
      }

      console.log('[GuardLens Popup] E-commerce signals detected (confidence: ' + ecommerceAnalysis.confidence + '%)');
    }

    // Enable re-scan button for supported pages
    const rescanBtn = document.getElementById('rescanBtn');
    if (rescanBtn) {
      rescanBtn.disabled = false;
      rescanBtn.title = 'Re-scan this page for dark patterns';
      rescanBtn.style.opacity = '1';
      rescanBtn.style.cursor = 'pointer';
    }

    // CRITICAL: Clear UI first to prevent stale data from previous tab
    clearUI();

    // Try to get existing data for THIS page
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'GET_TAB_DATA',
        tabId: tab.id,
        hostname: tabHostname
      });
    } catch (error) {
      console.warn('[GuardLens Popup] Failed to get tab data:', error.message);
      response = { data: null };
    }

    let data = response?.data;

    // Hide loading, show main content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('main').style.display = 'block';
    document.getElementById('main').classList.add('fade-in');

    // Show all sections
    document.querySelector('.patterns-section').style.display = 'block';
    document.querySelector('.why-score-section').style.display = 'block';
    document.querySelector('.comparison-section').style.display = 'block';

    if (!data) {
      // No data for this page - show loading state and trigger scan
      console.log('[GuardLens Popup] No data found for', tabHostname, ', triggering scan');
      document.getElementById('siteName').textContent = tabHostname.replace('www.', '');
      document.getElementById('scoreDesc').textContent = 'Scanning current site...';
      document.getElementById('scoreVal').textContent = '...';
      generateWhyScore(null);
      displaySmartSuggestions(null);

      try {
        const scanResponse = await chrome.runtime.sendMessage({
          type: 'INJECT_AND_SCAN',
          tabId: tab.id
        });

        if (scanResponse?.success && scanResponse?.data) {
          data = scanResponse.data;
        }
      } catch (error) {
        console.warn('[GuardLens Popup] Scan failed:', error.message);
      }

      if (!data) {
        document.getElementById('scoreDesc').textContent = 'This tab has not been analyzed yet.';
        return;
      }
    }

    // Display results
    const score = data.score ?? 100;
    const patterns = data.patterns || {};
    const total = Object.values(patterns).reduce((sum, val) => sum + val, 0);

    document.getElementById('siteName').textContent = data.hostname.replace('www.', '');
    document.getElementById('scoreDesc').textContent = total === 0 ? 'Clean site' : `${total} pattern${total > 1 ? 's' : ''} detected`;

    document.getElementById('urgencyCount').textContent = patterns.fakeUrgency ?? 0;
    document.getElementById('scarcityCount').textContent = patterns.falseScarcity ?? 0;
    document.getElementById('sneakCount').textContent = patterns.sneakIn ?? 0;
    document.getElementById('socialCount').textContent = patterns.socialProof ?? 0;

    animateScoreCircle(score);

    const explanation = getScoreExplanation(score, total);
    document.getElementById('scoreExplanation').querySelector('.explanation-icon').textContent = explanation.icon;
    document.getElementById('scoreExplanation').querySelector('.explanation-text').textContent = explanation.text;

    updatePatternIndicators({
      urgency: patterns.fakeUrgency ?? 0,
      scarcity: patterns.falseScarcity ?? 0,
      sneak: patterns.sneakIn ?? 0,
      social: patterns.socialProof ?? 0
    });

    generateWhyScore(data);
    displaySmartSuggestions(data.suggestions);

    // Load comparison with LIVE score sync
    await loadComparison(data, tab.url);

  } catch (error) {
    console.warn('[GuardLens Popup] Error loading stats:', error.message);
    showError('Error loading stats');
  }
}

// Re-scan button with proper state management and error handling
document.getElementById('rescanBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('rescanBtn');
  const btnText = btn.querySelector('.btn-text');
  const originalText = btnText.textContent;

  btnText.textContent = 'Rescanning...';
  btn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Validate tab exists with all required properties
    if (!tab || !tab.id || !tab.url) {
      btnText.textContent = 'Error';
      setTimeout(() => {
        btnText.textContent = originalText;
        btn.disabled = false;
      }, 2000);
      return;
    }

    // Check if URL is scannable - graceful handling
    if (!isScannableUrl(tab.url)) {
      btnText.textContent = 'Unsupported';
      setTimeout(() => {
        btnText.textContent = originalText;
        btn.disabled = true;
        btn.title = 'Scanning available only on supported websites.';
      }, 2000);
      return;
    }

    // Attempt to scan with error recovery
    let response;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'INJECT_AND_SCAN',
        tabId: tab.id
      });
    } catch (error) {
      console.warn('[GuardLens Popup] Re-scan messaging failed:', error.message);
      // Graceful recovery - show error but don't throw
      btnText.textContent = 'Error';
      setTimeout(() => {
        btnText.textContent = originalText;
        btn.disabled = false;
      }, 2000);
      return;
    }

    // Check response validity
    if (!response) {
      btnText.textContent = 'Error';
      setTimeout(() => {
        btnText.textContent = originalText;
        btn.disabled = false;
      }, 2000);
      return;
    }

    if (response.success) {
      // Reload stats to show updated data
      await loadStats();
      btnText.textContent = 'Rescanned!';
      setTimeout(() => {
        btnText.textContent = originalText;
        btn.disabled = false;
      }, 1500);
    } else {
      // Scan failed but don't throw - show friendly message
      console.warn('[GuardLens Popup] Scan returned error:', response.error);
      btnText.textContent = 'Error';
      setTimeout(() => {
        btnText.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    }

  } catch (error) {
    // Catch-all for unexpected errors - log but don't throw
    console.warn('[GuardLens Popup] Re-scan unexpected error:', error.message);
    btnText.textContent = 'Error';
    setTimeout(() => {
      btnText.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
});

// Report Modal System
const reportManager = new ReportManager();
let currentTabData = null;
let currentTabUrl = null;

// Open report modal
document.getElementById('reportBtn')?.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab.url;

    // Get current data
    const response = await chrome.runtime.sendMessage({
      type: 'GET_TAB_DATA',
      tabId: tab.id,
      hostname: new URL(tab.url).hostname
    });

    currentTabData = response.data;

    // Pre-fill form
    const hostname = new URL(tab.url).hostname;
    document.getElementById('reportDomain').value = hostname.replace('www.', '');

    if (currentTabData) {
      const score = currentTabData.score ?? 100;
      const patterns = currentTabData.patterns || {};
      const total = Object.values(patterns).reduce((sum, val) => sum + val, 0);
      document.getElementById('reportScore').value = `${score} / ${total === 0 ? 'Clean' : 'Risky'}`;
    } else {
      document.getElementById('reportScore').value = 'Not analyzed yet';
    }

    // Show modal
    document.getElementById('reportModal').style.display = 'flex';
    document.getElementById('reportForm').style.display = 'block';
    document.getElementById('successState').style.display = 'none';
    document.getElementById('errorState').style.display = 'none';

    // Focus first field
    document.getElementById('issueType').focus();
  } catch (error) {
    console.error('[GuardLens Popup] Error opening report modal:', error);
  }
});

// Close modal
function closeReportModal() {
  document.getElementById('reportModal').style.display = 'none';
  document.getElementById('reportForm').reset();
  clearFormErrors();
}

document.getElementById('modalCloseBtn')?.addEventListener('click', closeReportModal);
document.getElementById('modalCancelBtn')?.addEventListener('click', closeReportModal);

// Close on overlay click
document.querySelector('.modal-overlay')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    closeReportModal();
  }
});

// Close on ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('reportModal').style.display === 'flex') {
    closeReportModal();
  }
});

// Clear form errors
function clearFormErrors() {
  document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
}

// Validate form
function validateReportForm() {
  clearFormErrors();
  let isValid = true;

  const issueType = document.getElementById('issueType').value;
  if (!issueType) {
    document.getElementById('issueTypeError').textContent = 'Please select an issue type';
    isValid = false;
  }

  const description = document.getElementById('description').value.trim();
  if (!description) {
    document.getElementById('descriptionError').textContent = 'Please describe the issue';
    isValid = false;
  } else if (description.length < 10) {
    document.getElementById('descriptionError').textContent = 'Description must be at least 10 characters';
    isValid = false;
  }

  const email = document.getElementById('reportEmail').value.trim();
  if (email && !isValidEmail(email)) {
    document.getElementById('emailError').textContent = 'Please enter a valid email';
    isValid = false;
  }

  const consent = document.getElementById('consentCheckbox').checked;
  if (!consent) {
    document.getElementById('consentError').textContent = 'You must agree to share details';
    isValid = false;
  }

  return isValid;
}

// Validate email format
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Submit report
document.getElementById('reportForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!validateReportForm()) {
    return;
  }

  const submitBtn = document.getElementById('submitReportBtn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnSpinner = submitBtn.querySelector('.btn-spinner');
  const originalText = btnText.textContent;

  submitBtn.disabled = true;
  btnText.style.display = 'none';
  btnSpinner.style.display = 'inline';

  try {
    const formData = {
      issueType: document.getElementById('issueType').value,
      domain: document.getElementById('reportDomain').value,
      trustScore: currentTabData?.score ?? null,
      riskLabel: currentTabData ? 'Analyzed' : 'Not analyzed',
      description: document.getElementById('description').value.trim(),
      email: document.getElementById('reportEmail').value.trim(),
      pageUrl: currentTabUrl
    };

    const report = reportManager.createReport(formData);
    await reportManager.submitReport(report);

    // Show success state
    document.getElementById('reportForm').style.display = 'none';
    document.getElementById('successState').style.display = 'flex';
    document.getElementById('ticketId').textContent = report.id;

    console.log('[GuardLens Popup] Report submitted:', report.id);
  } catch (error) {
    console.error('[GuardLens Popup] Report submission error:', error);

    // Show error state
    document.getElementById('reportForm').style.display = 'none';
    document.getElementById('errorState').style.display = 'flex';
    document.getElementById('errorMessage').textContent = error.message || 'Failed to submit report. Please try again.';
  } finally {
    submitBtn.disabled = false;
    btnText.style.display = 'inline';
    btnSpinner.style.display = 'none';
    btnText.textContent = originalText;
  }
});

// Success close button
document.getElementById('successCloseBtn')?.addEventListener('click', closeReportModal);

// Error retry button
document.getElementById('errorRetryBtn')?.addEventListener('click', () => {
  document.getElementById('reportForm').style.display = 'block';
  document.getElementById('errorState').style.display = 'none';
  clearFormErrors();
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', loadStats);

console.log('[GuardLens Popup] Production UI controller loaded');
