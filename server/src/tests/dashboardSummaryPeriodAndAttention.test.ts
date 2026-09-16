import { describe, it, expect } from 'vitest';
import { calculatePeriodBounds, DashboardSummaryService } from '../services/DashboardSummaryService';

describe('DashboardSummaryService - Period Bounds & Attention Contract', () => {
  describe('calculatePeriodBounds', () => {
    it('calculates Today bounds correctly', () => {
      const bounds = calculatePeriodBounds('2026-09-16', 'today');
      expect(bounds.periodStart).toBe('2026-09-16');
      expect(bounds.periodEnd).toBe('2026-09-30');
      expect(bounds.label).toContain('Today');
    });

    it('calculates MTD bounds correctly', () => {
      const bounds = calculatePeriodBounds('2026-09-16', 'mtd');
      expect(bounds.periodStart).toBe('2026-09-01');
      expect(bounds.periodEnd).toBe('2026-09-30');
      expect(bounds.label).toContain('Month to date');
    });

    it('calculates QTD bounds correctly for each quarter', () => {
      // Q1 (Jan-Mar)
      const q1 = calculatePeriodBounds('2026-02-15', 'qtd');
      expect(q1.periodStart).toBe('2026-01-01');
      expect(q1.label).toContain('Q1');

      // Q2 (Apr-Jun)
      const q2 = calculatePeriodBounds('2026-05-10', 'qtd');
      expect(q2.periodStart).toBe('2026-04-01');
      expect(q2.label).toContain('Q2');

      // Q3 (Jul-Sep)
      const q3 = calculatePeriodBounds('2026-09-16', 'qtd');
      expect(q3.periodStart).toBe('2026-07-01');
      expect(q3.label).toContain('Q3');

      // Q4 (Oct-Dec)
      const q4 = calculatePeriodBounds('2026-11-20', 'qtd');
      expect(q4.periodStart).toBe('2026-10-01');
      expect(q4.label).toContain('Q4');
    });

    it('calculates YTD bounds correctly', () => {
      const bounds = calculatePeriodBounds('2026-09-16', 'ytd');
      expect(bounds.periodStart).toBe('2026-01-01');
      expect(bounds.periodEnd).toBe('2026-09-30');
      expect(bounds.label).toContain('Year to date');
    });

    it('handles custom valid start date', () => {
      const bounds = calculatePeriodBounds('2026-09-16', 'custom', '2026-08-15');
      expect(bounds.periodStart).toBe('2026-08-15');
      expect(bounds.periodEnd).toBe('2026-09-30');
      expect(bounds.label).toBe('2026-08-15 to 2026-09-16');
    });

    it('falls back to MTD if custom start date is in the future relative to asOfDate', () => {
      const bounds = calculatePeriodBounds('2026-09-16', 'custom', '2026-09-25');
      expect(bounds.periodStart).toBe('2026-09-01');
    });
  });

  describe('parameter validation', () => {
    it('throws DASHBOARD_VIEW_INVALID for unknown view', async () => {
      await expect(
        DashboardSummaryService.getDashboard('org-1', ['banking.view'], 'invalid-view', '2026-09-16')
      ).rejects.toThrow('DASHBOARD_VIEW_INVALID');
    });

    it('throws DASHBOARD_DATE_INVALID for malformed asOfDate', async () => {
      await expect(
        DashboardSummaryService.getDashboard('org-1', ['banking.view'], 'overview', '16-09-2026')
      ).rejects.toThrow('DASHBOARD_DATE_INVALID');
    });

    it('throws DASHBOARD_DATE_INVALID for malformed startDate', async () => {
      await expect(
        DashboardSummaryService.getDashboard('org-1', ['banking.view'], 'overview', '2026-09-16', 'custom', 'invalid')
      ).rejects.toThrow('DASHBOARD_DATE_INVALID');
    });

    it('throws DASHBOARD_VIEW_FORBIDDEN if user lacks permissions for view', async () => {
      await expect(
        DashboardSummaryService.getDashboard('org-1', [], 'close-controls', '2026-09-16')
      ).rejects.toThrow('DASHBOARD_VIEW_FORBIDDEN');
    });

    it.each(['today', 'mtd', 'qtd', 'ytd'] as const)('generates valid period bounds for preset %s', (preset) => {
      const bounds = calculatePeriodBounds('2026-09-16', preset);
      expect(bounds.periodStart <= '2026-09-16').toBe(true);
      expect(bounds.periodEnd >= '2026-09-16').toBe(true);
      expect(bounds.label).toBeDefined();
    });
  });
});
