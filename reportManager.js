/**
 * GuardLens Report Manager v2.0
 * Handles issue reporting, storage, and ticket generation
 */

class ReportManager {
  constructor() {
    this.storageKey = 'guardlens_reports';
    this.maxReports = 100;
    this.extensionVersion = '2.0.0';
  }

  // Generate unique ticket ID
  generateTicketId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `GL-${timestamp}${random}`;
  }

  // Create report object
  createReport(formData) {
    return {
      id: this.generateTicketId(),
      createdAt: new Date().toISOString(),
      issueType: formData.issueType,
      domain: formData.domain,
      trustScore: formData.trustScore,
      riskLabel: formData.riskLabel,
      description: formData.description,
      email: formData.email || null,
      browser: 'Chrome',
      extensionVersion: this.extensionVersion,
      userAgent: navigator.userAgent,
      pageUrl: formData.pageUrl,
      screenshot: formData.screenshot || null
    };
  }

  // Save report to local storage
  async saveReport(report) {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      const reports = result[this.storageKey] || [];

      reports.push(report);

      // Keep only last N reports
      if (reports.length > this.maxReports) {
        reports.splice(0, reports.length - this.maxReports);
      }

      await chrome.storage.local.set({ [this.storageKey]: reports });

      console.log('[GuardLens Report] Saved report:', report.id);
      return report;
    } catch (error) {
      console.error('[GuardLens Report] Error saving report:', error);
      throw error;
    }
  }

  // Get all reports
  async getAllReports() {
    try {
      const result = await chrome.storage.local.get(this.storageKey);
      return result[this.storageKey] || [];
    } catch (error) {
      console.error('[GuardLens Report] Error getting reports:', error);
      return [];
    }
  }

  // Get reports by domain
  async getReportsByDomain(domain) {
    try {
      const reports = await this.getAllReports();
      return reports.filter(r => r.domain === domain);
    } catch (error) {
      console.error('[GuardLens Report] Error filtering reports:', error);
      return [];
    }
  }

  // Submit report (can be extended for API integration)
  async submitReport(report) {
    try {
      // Save locally first
      await this.saveReport(report);

      // TODO: Integrate with backend API when ready
      // Example: await fetch('https://api.guardlens.ai/reports', { method: 'POST', body: JSON.stringify(report) })

      console.log('[GuardLens Report] Report submitted:', report.id);
      return { success: true, ticketId: report.id };
    } catch (error) {
      console.error('[GuardLens Report] Error submitting report:', error);
      throw error;
    }
  }

  // Clear old reports (older than 30 days)
  async clearOldReports() {
    try {
      const reports = await this.getAllReports();
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      const filtered = reports.filter(r => {
        const reportTime = new Date(r.createdAt).getTime();
        return reportTime > thirtyDaysAgo;
      });

      await chrome.storage.local.set({ [this.storageKey]: filtered });
      console.log(`[GuardLens Report] Cleaned up old reports. Kept ${filtered.length} reports.`);
    } catch (error) {
      console.error('[GuardLens Report] Error clearing old reports:', error);
    }
  }
}

// Export for use in popup
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReportManager;
}
