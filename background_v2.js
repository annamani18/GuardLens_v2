/**
 * GuardLens v2.0 - Background Service Worker
 * Handles AI-powered dark pattern detection using Gemini Nano with regex fallback
 */

console.log('[GuardLens Background] Service worker started');

// State management
const tabStats = new Map();
const comparisonHistory = [];
let aiSession = null;
let aiAvailable = false;

// Initialize Gemini Nano AI
async function initializeAI() {
  try {
    // Check if window.ai is available (Gemini Nano)
    if (typeof self.ai !== 'undefined' && self.ai?.createTextSession) {
      console.log('[GuardLens AI] Initializing Gemini Nano...');
      aiSession = await self.ai.createTextSession({
        temperature: 0.3,
        topK: 3
      });
      aiAvailable = true;
      console.log('[GuardLens AI] Gemini Nano initialized successfully');
    } else {
      console.log('[GuardLens AI] Gemini Nano not available, using regex fallback');
      aiAvailable = false;
    }
  } catch (error) {
    console.error('[GuardLens AI] Failed to initialize:', error);
    aiAvailable = false;
  }
}

// Initialize AI on startup
initializeAI();

// Sanitize text to prevent prompt injection
function sanitizeText(text) {
  if (!text) return '';
  return text
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .slice(0, 500); // Limit length
}

// AI-powered pattern detection
async function detectWithAI(text, category) {
  if (!aiAvailable || !aiSession) {
    return detectWithRegex(text, category);
  }

  try {
    const prompts = {
      FakeUrgency: `Analyze this text for fake urgency tactics (limited time, hurry, ending soon). Reply with only "YES" or "NO":\n\n"${text}"`,
      FalseScarcity: `Analyze this text for false scarcity claims (only X left, low stock, selling fast). Reply with only "YES" or "NO":\n\n"${text}"`,
      SneakIntoBasket: `Analyze this text for sneaky pre-selected items (warranty added, protection plan, gift wrap selected). Reply with only "YES" or "NO":\n\n"${text}"`,
      DeceptiveSocialProof: `Analyze this text for deceptive social proof (X people bought, trending, bestseller without verification). Reply with only "YES" or "NO":\n\n"${text}"`
    };

    const prompt = prompts[category];
    if (!prompt) return false;

    const response = await aiSession.prompt(prompt);
    const result = response.trim().toUpperCase();

    console.log(`[GuardLens AI] ${category} detection:`, result);
    return result === 'YES';
  } catch (error) {
    console.error('[GuardLens AI] Detection error:', error);
    return detectWithRegex(text, category);
  }
}

// Regex-based fallback detection
function detectWithRegex(text, category) {
  const patterns = {
    FakeUrgency: [
      /only\s+\d+\s+(hours?|minutes?|days?)\s+left/i,
      /hurry/i,
      /limited\s+time/i,
      /ending\s+soon/i,
      /last\s+chance/i,
      /deal\s+ends/i,
      /offer\s+expires/i,
      /act\s+now/i,
      /don't\s+miss/i,
      /flash\s+sale/i
    ],
    FalseScarcity: [
      /only\s+\d+\s+left/i,
      /\d+\s+in\s+stock/i,
      /low\s+stock/i,
      /almost\s+sold\s+out/i,
      /selling\s+fast/i,
      /high\s+demand/i,
      /limited\s+quantity/i,
      /while\s+supplies\s+last/i
    ],
    SneakIntoBasket: [
      /warranty.*added/i,
      /protection.*plan/i,
      /gift.*wrap.*selected/i,
      /pre-?selected/i,
      /automatically\s+added/i,
      /included\s+by\s+default/i
    ],
    DeceptiveSocialProof: [
      /\d+\+?\s+(people|customers)?\s*(bought|purchased|viewing)/i,
      /bestseller/i,
      /trending\s+now/i,
      /most\s+popular/i,
      /top\s+rated/i,
      /\d+\s+reviews?/i
    ]
  };

  const categoryPatterns = patterns[category] || [];
  return categoryPatterns.some(pattern => pattern.test(text));
}

// Calculate Trust Score
function calculateTrustScore(detections) {
  let score = 100;

  // Count unique pattern types
  const uniqueTypes = new Set();
  let totalInstances = 0;

  for (const [category, instances] of Object.entries(detections)) {
    if (instances.length > 0) {
      uniqueTypes.add(category);
      totalInstances += instances.length;
    }
  }

  // Deduct 15 points per unique pattern type
  score -= uniqueTypes.size * 15;

  // Deduct 5 points per instance
  score -= totalInstances * 5;

  return Math.max(0, Math.min(100, score));
}

// Update badge
function updateBadge(tabId, patternCount) {
  if (!tabId) return;

  const text = patternCount > 0 ? patternCount.toString() : '';
  let color = '#22c55e'; // Green

  if (patternCount > 10) {
    color = '#ef4444'; // Red
  } else if (patternCount > 5) {
    color = '#f59e0b'; // Orange
  }

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// Store in comparison history
async function updateComparisonHistory(data) {
  try {
    const result = await chrome.storage.local.get('comparison_history');
    let history = result.comparison_history || [];

    // Add new entry
    history.unshift({
      domain: data.hostname,
      trustScore: data.trustScore,
      patternCount: data.patternCount,
      timestamp: Date.now()
    });

    // Keep only last 5
    history = history.slice(0, 5);

    await chrome.storage.local.set({ comparison_history: history });
    console.log('[GuardLens Background] Comparison history updated:', history);
  } catch (error) {
    console.error('[GuardLens Background] Failed to update history:', error);
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[GuardLens Background] Message received:', message.type);

  // Handle async messages
  (async () => {
    try {
      switch (message.type) {
        case 'ANALYZE_PATTERNS': {
          const { patterns } = message;
          const detections = {
            FakeUrgency: [],
            FalseScarcity: [],
            SneakIntoBasket: [],
            DeceptiveSocialProof: []
          };

          // Analyze each pattern with AI or regex
          for (const pattern of patterns) {
            const sanitized = sanitizeText(pattern.text);

            for (const category of Object.keys(detections)) {
              const isMatch = await detectWithAI(sanitized, category);
              if (isMatch) {
                detections[category].push({
                  text: pattern.text.slice(0, 100),
                  selector: pattern.selector,
                  timestamp: Date.now()
                });
              }
            }
          }

          const trustScore = calculateTrustScore(detections);
          const totalPatterns = Object.values(detections).reduce((sum, arr) => sum + arr.length, 0);

          sendResponse({
            success: true,
            trustScore,
            detections,
            totalPatterns,
            aiUsed: aiAvailable
          });
          break;
        }

        case 'UPDATE_STATS': {
          const tabId = sender.tab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: 'No tab ID' });
            return;
          }

          const data = message.data;
          console.log('[GuardLens Background] Updating stats for tab', tabId, data);

          // Store stats for this tab
          tabStats.set(tabId, {
            ...data,
            tabId,
            lastUpdated: Date.now()
          });

          // Update badge
          updateBadge(tabId, data.patternCount);

          // Update comparison history
          await updateComparisonHistory(data);

          sendResponse({ success: true });
          break;
        }

        case 'GET_TAB_STATS': {
          const tabId = message.tabId || sender.tab?.id;
          if (!tabId) {
            sendResponse({ stats: null });
            return;
          }

          const stats = tabStats.get(tabId) || null;
          console.log('[GuardLens Background] Getting stats for tab', tabId, stats);
          sendResponse({ stats });
          break;
        }

        case 'GET_COMPARISON_HISTORY': {
          const result = await chrome.storage.local.get('comparison_history');
          sendResponse({ history: result.comparison_history || [] });
          break;
        }

        case 'CLEAR_TAB_STATS': {
          const tabId = message.tabId;
          if (tabId) {
            tabStats.delete(tabId);
            updateBadge(tabId, 0);
          }
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[GuardLens Background] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep channel open for async response
});

// Clear stats when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log('[GuardLens Background] Tab closed:', tabId);
  tabStats.delete(tabId);
});

// Clear stats when tab navigates to new URL
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    console.log('[GuardLens Background] Tab navigating:', tabId);
    tabStats.delete(tabId);
    updateBadge(tabId, 0);
  }
});

console.log('[GuardLens Background] Service worker ready');
