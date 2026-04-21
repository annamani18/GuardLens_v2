/**
 * GuardLens Side Panel v2.0
 * - Animated trust-score count-up ring
 * - Market Comparison module (multi-tab)
 * - Re-scan button
 * - Works on any e-commerce site
 */

const ECOM_SIGNALS = [
  /amazon\./i, /flipkart\./i, /ebay\./i, /walmart\./i, /etsy\./i,
  /myntra\./i, /meesho\./i, /snapdeal\./i, /ajio\./i, /nykaa\./i,
  /aliexpress\./i, /alibaba\./i, /temu\./i, /shein\./i,
  /target\./i, /bestbuy\./i, /newegg\./i, /overstock\./i
];
function isEcom(url) {
  if (!url) return false;
  return ECOM_SIGNALS.some(r => r.test(url)) ||
    /\/(cart|checkout|basket|product|shop|store)\b/i.test(url);
}

function scoreColor(s) {
  if (s >= 80) return '#22c55e';
  if (s >= 60) return '#f59e0b';
  if (s >= 40) return '#f97316';
  return '#ef4444';
}

function scoreDesc(s, patterns) {
  if (patterns === 0)  return '✅ Clean — no dark patterns detected';
  if (s >= 80) return `⚡ ${patterns} minor pattern${patterns > 1 ? 's' : ''} spotted`;
  if (s >= 60) return `⚠️ ${patterns} patterns — shop carefully`;
  if (s >= 40) return `🚨 ${patterns} patterns — high manipulation risk`;
  return `🚫 ${patterns} patterns — very aggressive dark patterns`;
}

function scoreClass(s) {
  if (s >= 80) return 'high';
  if (s >= 60) return 'medium';
  return 'low';
}

// ─── ANIMATED RING ────────────────────────────────────────────────────────────
const CIRC = 2 * Math.PI * 35; // 219.9
function animateRing(targetScore) {
  const ring  = document.getElementById('ringFg');
  const valEl = document.getElementById('scoreVal');
  const color = scoreColor(targetScore);
  ring.style.stroke = color;

  const offset = CIRC - (targetScore / 100) * CIRC;
  // count-up from 0
  let current = 0;
  const duration = 1200;
  const start    = performance.now();

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
    current = Math.round(eased * targetScore);
    valEl.textContent = current;
    ring.style.strokeDashoffset = CIRC - (current / 100) * CIRC;
    if (t < 1) requestAnimationFrame(step);
    else {
      valEl.textContent = targetScore;
      ring.style.strokeDashoffset = offset;
    }
  }
  requestAnimationFrame(step);
}

// ─── COMPARISON RENDERER ──────────────────────────────────────────────────────
function renderComparison(comparison) {
  const el = document.getElementById('comparisonContent');
  if (!comparison.hasComparison || comparison.sites.length < 2) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:10px 0">
      Open multiple e-commerce tabs to compare trust scores side by side.
    </div>`;
    return;
  }

  const topTwo = comparison.sites.slice(0, 2);
  const cols = topTwo.map(site => {
    const isWinner = site.siteName === comparison.winner;
    const sc = scoreClass(site.trustScore);
    return `
      <div class="site-col ${isWinner ? 'winner' : ''}">
        <div class="site-name" title="${site.hostname}">${site.siteName}</div>
        <div class="site-score ${sc}">${site.trustScore}<span style="font-size:13px;font-weight:400">%</span></div>
        <div class="site-meta">${site.patternCount} pattern${site.patternCount !== 1 ? 's' : ''} found</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="comparison-card">
      <div class="comparison-header">⚡ Trust Comparison</div>
      <div class="comparison-sites">${cols}</div>
      <div class="smart-choice">
        <span class="badge-winner">Smart Choice</span>
        <span>${comparison.winner} has the higher trust score — safer to shop here.</span>
      </div>
    </div>`;
}

// ─── TAGS ─────────────────────────────────────────────────────────────────────
const TAG_STYLES = {
  FakeUrgency:          'tag-red',
  FalseScarcity:        'tag-amber',
  SneakIntoBasket:      'tag-green',
  DeceptiveSocialProof: 'tag-blue',
  MisleadingPricing:    'tag-purple'
};
const TAG_LABELS = {
  FakeUrgency:          '⏰ Fake Urgency',
  FalseScarcity:        '📦 False Scarcity',
  SneakIntoBasket:      '🛒 Sneak-in',
  DeceptiveSocialProof: '👥 Social Proof',
  MisleadingPricing:    '💸 Misleading Price'
};

function renderTags(categoryCounts) {
  const el = document.getElementById('patternTags');
  el.innerHTML = '';
  for (const [cat, count] of Object.entries(categoryCounts)) {
    if (!count) continue;
    const span = document.createElement('span');
    span.className = `tag ${TAG_STYLES[cat] || 'tag-blue'}`;
    span.textContent = `${TAG_LABELS[cat] || cat} ×${count}`;
    el.appendChild(span);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
class SidePanel {
  constructor() {
    this.tabId  = null;
    this.tabUrl = null;
    this.init();
  }

  async init() {
    await this.loadStats();
    this.loadComparison();
    this.bindEvents();

    // Live updates from background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'STATS_UPDATED' && msg.tabId === this.tabId) {
        this.renderStats(msg.data);
      }
    });
  }

  async loadStats() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_STATS' });
      this.tabId  = resp?.tabId  ?? null;
      this.tabUrl = resp?.tabUrl ?? null;

      document.getElementById('loading').style.display = 'none';

      if (!this.tabUrl || !isEcom(this.tabUrl)) {
        document.getElementById('non-ecom-state').style.display = 'block';
        return;
      }

      document.getElementById('dashboard').style.display = 'block';

      if (resp?.stats) {
        this.renderStats(resp.stats);
      } else {
        this.renderEmpty();
      }
    } catch (e) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('non-ecom-state').style.display = 'block';
    }
  }

  async loadComparison() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_COMPARISON' });
      if (resp?.comparison) renderComparison(resp.comparison);
    } catch (_) {}
  }

  renderStats(stats) {
    const count  = stats.patternCount ?? 0;
    const score  = stats.trustScore   ?? 100;
    const cats   = stats.categoryCounts ?? {};
    const host   = stats.hostname ?? (this.tabUrl ? new URL(this.tabUrl).hostname : '—');

    document.getElementById('siteName').textContent = host.replace(/^www\./, '');
    document.getElementById('scoreDesc').textContent = scoreDesc(score, count);

    document.getElementById('urgencyCount').textContent = cats.FakeUrgency          ?? 0;
    document.getElementById('scarcityCount').textContent = cats.FalseScarcity       ?? 0;
    document.getElementById('sneakCount').textContent    = cats.SneakIntoBasket     ?? 0;
    document.getElementById('socialCount').textContent   = cats.DeceptiveSocialProof ?? 0;

    renderTags(cats);

    // Empty state
    document.getElementById('emptyState').style.display = count === 0 ? 'block' : 'none';

    animateRing(score);
    this.loadComparison(); // refresh comparison
  }

  renderEmpty() {
    document.getElementById('siteName').textContent = this.tabUrl
      ? new URL(this.tabUrl).hostname.replace(/^www\./, '') : '—';
    document.getElementById('scoreDesc').textContent = '🔄 Scanning…  Scroll the page to trigger detection.';
    animateRing(100);
  }

  bindEvents() {
    document.getElementById('rescanBtn').addEventListener('click', async () => {
      const btn = document.getElementById('rescanBtn');
      btn.textContent = '⏳ Rescanning…';
      btn.disabled = true;

      try {
        await chrome.runtime.sendMessage({ type: 'RESCAN', tabId: this.tabId });
        // Wait a bit then reload stats
        setTimeout(async () => {
          await this.loadStats();
          btn.textContent = '🔄 Re-scan Page';
          btn.disabled = false;
        }, 2500);
      } catch (_) {
        btn.textContent = '🔄 Re-scan Page';
        btn.disabled = false;
      }
    });

    document.getElementById('reportBtn').addEventListener('click', async () => {
      const btn = document.getElementById('reportBtn');
      btn.textContent = '✅ Reported!';
      btn.disabled = true;
      try {
        await chrome.runtime.sendMessage({
          type: 'REPORT_MISSING',
          data: { url: this.tabUrl, hostname: this.tabUrl ? new URL(this.tabUrl).hostname : '' }
        });
      } catch (_) {}
      setTimeout(() => { btn.textContent = '📝 Report Missing Pattern'; btn.disabled = false; }, 2200);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new SidePanel());
