# FirmBooks Point 1 QA Report

## Summary

| Field | Result |
| --- | --- |
| Date | 2026-08-23 |
| Target | http://127.0.0.1:3000 |
| Mode | Standard, diff-aware |
| Branch | codex/point-1-features |
| Framework | React 19, Vite 6, Express |
| Browser coverage | Chromium desktop and Mobile Chrome |
| Baseline health | 96/100 |
| Final health | 100/100 |
| Issues | 2 medium, 2 verified fixes, 0 deferred |

## Coverage

Tested tenant registration, customer and invoice creation, unsaved-change protection,
payment allocation, hard-reload persistence, General Ledger reporting, bank tenant
isolation, PWA/settings metadata, receivables corrections, payables settlement,
recurring invoices, fixed assets, period close, team access, and encrypted recovery
creation, validation, and owner-approved promotion.

The authenticated final pass visited `reports`, `settings`, `credit_notes`,
`payments_made`, `recurring_invoices`, `fixed_assets`, `period_close`, `team_access`,
and `recovery_center` with zero browser console errors.

## Findings

### ISSUE-001: Navigation count changed the accessible button name

- Severity: Medium
- Category: Accessibility
- Status: Verified
- Reproduction: Register a tenant on desktop, then locate the exact `Settings` navigation button. The count badge exposed the accessible name as `Settings 3`.
- Fix: Marked the visual count badge as presentation-only for assistive technology.
- Commit: `32c02e7`
- File: `src/components/layout/Sidebar.tsx`
- Evidence after: [Settings desktop](screenshots/settings-desktop-after.png)

### ISSUE-002: Responsive report catalog duplicated hidden interactive content

- Severity: Medium
- Category: Accessibility / Functional
- Status: Verified
- Reproduction: Open Reports on desktop and locate `General Ledger`. The first DOM match belonged to the hidden mobile catalog, so accessibility-driven interaction selected an invisible element.
- Fix: Replaced separate mobile and desktop catalogs with one responsive card grid.
- Commit: `5cf06a4`
- File: `src/components/reports/ReportCardGrid.tsx`
- Evidence after: [Reports desktop](screenshots/reports-desktop-after.png), [Reports mobile](screenshots/reports-mobile-after.png)

## Verification

- Playwright: 10/10 passed across desktop and mobile
- Vitest: 54/54 files, 509/509 tests passed
- TypeScript: `tsc --noEmit` passed
- Production build: passed
- Authenticated changed-route console scan: 0 errors
- Point 1 workspace page overflow assertions: passed
- Recovery lifecycle: encrypted export created, staged, validated, and promoted

## Score

Baseline deductions were two medium findings: functional 92 and accessibility 84,
for a weighted score of 96. After verified fixes, all categories score 100.

PR summary: QA found 2 issues, fixed 2, health score 96 -> 100.

