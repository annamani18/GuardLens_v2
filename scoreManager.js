/**
 * GuardLens Score Manager v2.0
 * Centralized, deduplicating trust-score logic shared by content + popup.
 */
class ScoreManager {
  constructor() {
    this.uniquePatterns = new Map(); // key: element text → value: pattern data
    this.score = 100;
  }

  addPattern(text, patternData) {
    if (!this.uniquePatterns.has(text)) {
      this.uniquePatterns.set(text, patternData);
      this.recalculateScore();
    }
    return this.score;
  }

  recalculateScore() {
    const count = this.uniquePatterns.size;
    this.score = Math.max(0, 100 - count * 5);
    return this.score;
  }

  getScore()         { return this.score; }
  getPatternCount()  { return this.uniquePatterns.size; }
  getPatterns()      { return Array.from(this.uniquePatterns.values()); }

  getPatternsByCategory() {
    const counts = {};
    this.uniquePatterns.forEach(p => {
      const cat = p.category || 'Unknown';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }

  reset() {
    this.uniquePatterns.clear();
    this.score = 100;
  }

  loadFromCache(patterns) {
    this.uniquePatterns.clear();
    if (Array.isArray(patterns)) {
      patterns.forEach(p => { if (p.text) this.uniquePatterns.set(p.text, p); });
    }
    this.recalculateScore();
  }

  getScoreColor(score = this.score) {
    if (score >= 80) return '#4CAF50';
    if (score >= 60) return '#FFBF00';
    if (score >= 40) return '#FF9500';
    return '#FF4444';
  }

  getScoreDescription(score = this.score) {
    if (score >= 80) return '✅ Excellent — minimal dark patterns';
    if (score >= 60) return '⚠️ Moderate — some manipulative patterns';
    if (score >= 40) return '⚠️ Concerning — multiple dark patterns';
    return '🚨 High Risk — many manipulative tactics';
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ScoreManager;
