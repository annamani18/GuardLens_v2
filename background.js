/**
 * GuardLens v2.0 - Production Background Service Worker
 * Page-based storage with real-time scoring and reliable messaging
 */

const pageData = new Map(); // Stores by full URL (page-based, not domain-based)
const tabToUrl = new Map(); // Maps tabId to current URL for badge updates
const MAX_COMPARISON_SITES = 10;

console.log('[GuardLens Background] Production service worker started');

// Store scan result - PAGE-BASED STORAGE (not domain-based)
function storeScanResult(tabId, data) {
  try {
    const pageUrl = data.url; // Use full URL, not just hostname
    const hostname = new URL(data.url).hostname;

    // ALWAYS update with fresh scan result (don't skip lower scores)
    pageData.set(pageUrl, {
      ...data,
      hostname,
      lastUpdated: Date.now(),
      scanCount: (pageData.get(pageUrl)?.scanCount || 0) + 1
    });

    console.log(`[GuardLens Background] Stored data for page ${pageUrl}, score: ${data.score}, scan #${pageData.get(pageUrl).scanCount}`);

    // Map tab to URL for badge updates
    tabToUrl.set(tabId, pageUrl);

    // Update badge
    updateBadge(tabId, data.patterns);
  } catch (error) {
    console.error('[GuardLens Background] Error storing scan result:', error);
  }
}

// Update badge with color coding
function updateBadge(tabId, patterns) {
  try {
    const total = Object.values(patterns).reduce((sum, val) => sum + val, 0);
    const text = total > 0 ? total.toString() : '';

    let color;
    if (total === 0) color = '#22c55e'; // Green
    else if (total <= 3) color = '#3b82f6'; // Blue
    else if (total <= 6) color = '#f59e0b'; // Orange
    else color = '#ef4444'; // Red

    chrome.action.setBadgeText({ text, tabId });
    chrome.action.setBadgeBackgroundColor({ color, tabId });
  } catch (error) {
    console.error('[GuardLens Background] Error updating badge:', error);
  }
}

// Get ranking label for market comparison
function getRankingLabel(index, score) {
  if (index === 0 && score >= 80) return { emoji: '🥇', label: 'Safest' };
  if (index === 1 && score >= 70) return { emoji: '🥈', label: 'Moderate' };
  if (index === 2 && score >= 60) return { emoji: '🥉', label: 'Risky' };
  if (score >= 80) return { emoji: '🟢', label: 'Safe' };
  if (score >= 60) return { emoji: '🟡', label: 'Moderate' };
  return { emoji: '🔴', label: 'Risky' };
}

// Check if URL is e-commerce
function isEcommerceSite(url) {
  if (!url) return false;
  const ecommercePatterns = [
    'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'snapdeal',
    'ebay', 'walmart', 'etsy', 'alibaba', 'aliexpress', 'temu',
    'shein', 'target', 'bestbuy', 'nykaa', 'shop', 'store', 'buy',
    'cart', 'product', 'item', 'checkout'
  ];
  return ecommercePatterns.some(pattern => url.toLowerCase().includes(pattern));
}

// Message handler with proper async handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'SCAN_RESULT': {
          const tabId = sender.tab?.id;
          if (tabId) {
            storeScanResult(tabId, message.data);
          }
          sendResponse({ success: true });
          break;
        }

        case 'GET_TAB_DATA': {
          try {
            const tab = await chrome.tabs.get(message.tabId);
            if (tab && tab.url) {
              const pageUrl = tab.url; // Use full URL, not just hostname
              const hostname = new URL(tab.url).hostname;

              // Validate hostname matches if provided (prevents stale data)
              if (message.hostname && message.hostname !== hostname) {
                console.log(`[GuardLens Background] Hostname mismatch: expected ${message.hostname}, got ${hostname}`);
                sendResponse({ data: null });
                break;
              }

              // Get page-specific data (not domain-wide)
              const data = pageData.get(pageUrl);
              console.log(`[GuardLens Background] GET_TAB_DATA for ${pageUrl}: ${data ? 'found (score: ' + data.score + ')' : 'not found'}`);
              sendResponse({ data: data || null });
            } else {
              sendResponse({ data: null });
            }
          } catch (error) {
            console.error('[GuardLens Background] Error getting tab data:', error);
            sendResponse({ data: null });
          }
          break;
        }

        case 'GET_MARKET_COMPARISON': {
          // Build comparison from pageData (deduplicate by domain)
          const comparisonMap = new Map(); // domain → best score

          for (const [pageUrl, data] of pageData.entries()) {
            if (isEcommerceSite(data.url)) {
              const hostname = new URL(data.url).hostname;
              const existing = comparisonMap.get(hostname);

              // Keep highest score per domain for comparison
              if (!existing || data.score > existing.score) {
                comparisonMap.set(hostname, {
                  site: hostname.replace('www.', ''),
                  score: data.score,
                  patterns: data.patterns,
                  url: data.url
                });
              }
            }
          }

          // Convert to array and sort by score (descending)
          const comparison = Array.from(comparisonMap.values());
          comparison.sort((a, b) => b.score - a.score);

          // Add ranking labels
          const rankedComparison = comparison.slice(0, MAX_COMPARISON_SITES).map((item, index) => ({
            ...item,
            rank: index + 1,
            ranking: getRankingLabel(index, item.score)
          }));

          sendResponse({ comparison: rankedComparison });
          break;
        }

        case 'GET_ALL_TABS': {
          // Build results from pageData (deduplicate by domain)
          const resultsMap = new Map(); // domain → best score

          for (const [pageUrl, data] of pageData.entries()) {
            if (isEcommerceSite(data.url)) {
              const hostname = new URL(data.url).hostname;
              const existing = resultsMap.get(hostname);

              // Keep highest score per domain
              if (!existing || data.score > existing.score) {
                resultsMap.set(hostname, {
                  site: hostname.replace('www.', ''),
                  score: data.score,
                  patterns: data.patterns,
                  url: data.url
                });
              }
            }
          }

          const results = Array.from(resultsMap.values());
          results.sort((a, b) => b.score - a.score);
          sendResponse({ tabs: results });
          break;
        }

        case 'INJECT_AND_SCAN': {
          try {
            // Check if content script is already injected
            let needsInjection = false;
            try {
              await chrome.tabs.sendMessage(message.tabId, { type: 'PING' });
            } catch (e) {
              needsInjection = true;
            }

            if (needsInjection) {
              console.log('[GuardLens Background] Injecting content script');
              await chrome.scripting.executeScript({
                target: { tabId: message.tabId },
                files: ['content.js']
              });
              // Wait for content script to initialize
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Trigger scan
            const response = await chrome.tabs.sendMessage(message.tabId, { type: 'SCAN_NOW' });
            sendResponse(response);
          } catch (error) {
            console.error('[GuardLens Background] Injection error:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
        }

        case 'REPORT_ISSUE': {
          try {
            const { url, score, patterns } = message.data;
            const totalPatterns = Object.values(patterns).reduce((sum, val) => sum + val, 0);

            // Create report data
            const reportData = {
              url,
              score,
              patterns,
              totalPatterns,
              timestamp: new Date().toISOString(),
              userAgent: navigator.userAgent
            };

            // Store report locally
            const result = await chrome.storage.local.get('guardlens_reports');
            const reports = result.guardlens_reports || [];
            reports.push(reportData);

            // Keep only last 100 reports
            if (reports.length > 100) {
              reports.splice(0, reports.length - 100);
            }

            await chrome.storage.local.set({ guardlens_reports: reports });

            console.log('[GuardLens Background] Issue reported:', reportData);
            sendResponse({ success: true, reportId: reports.length });
          } catch (error) {
            console.error('[GuardLens Background] Error reporting issue:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[GuardLens Background] Error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep message channel open for async response
});

// Clear URL mapping when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabToUrl.delete(tabId);
  console.log(`[GuardLens Background] Tab ${tabId} closed, mapping cleared`);
});

// Clear URL mapping when tab navigates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabToUrl.delete(tabId);
    chrome.action.setBadgeText({ text: '', tabId });
    console.log(`[GuardLens Background] Tab ${tabId} navigating to ${changeInfo.url}, mapping cleared`);
  }
});

// Update badge when tab becomes active
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      const pageUrl = tab.url;
      const data = pageData.get(pageUrl);
      if (data) {
        updateBadge(activeInfo.tabId, data.patterns);
      } else {
        chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
      }
    }
  } catch (error) {
    console.error('[GuardLens Background] Error updating badge on tab activation:', error);
  }
});

// Cleanup old page data periodically (every 30 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [pageUrl, data] of pageData.entries()) {
    if (now - data.lastUpdated > maxAge) {
      pageData.delete(pageUrl);
      console.log(`[GuardLens Background] Cleaned up old data for ${pageUrl}`);
    }
  }
}, 30 * 60 * 1000);

console.log('[GuardLens Background] Ready for production detection');
