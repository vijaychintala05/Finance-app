# QA Remediation Autoplan

## Goal

Restore a trustworthy local verification loop, verify the current financial and mobile UI changes, and prevent the Bills workspace compile regression from returning.

## What Already Exists

- `npm run lint` typechecks the production frontend configuration.
- The application has a NAS deployment reachable through the private network.
- Financial integrity, recovery, and UI test suites already exist across the workspace.
- `BillsView` now uses deferred filtering, but a legacy duplicate filter declaration was left behind during the change.

## Findings And Decisions

| Finding | Decision | Rationale |
| --- | --- | --- |
| `BillsView` declared `filtered` twice, blocking TypeScript | Keep the deferred, memoized version and remove the legacy filter | One authoritative derived list prevents a compilation failure and preserves responsive filtering. |
| Vitest cannot load Vite because esbuild cannot read or resolve local files | Repair the local dependency installation before interpreting any test result | A non-starting runner offers no confidence signal. Do not change application code to compensate for a broken toolchain. |
| Browser automation has no inspectable authenticated application state | Use a controlled browser session after the test runner is repaired, then test the deployed NAS app with non-destructive paths | Live financial data must not be mutated for UI smoke testing. |

## Architecture

```text
Source change
  -> npm run lint
  -> npm test
  -> isolated feature tests
  -> NAS browser smoke test (desktop + mobile)
  -> deploy decision
```

## Implementation Tasks

1. Repair the local JavaScript dependency tree from `package-lock.json` without changing application dependencies.
   - Use a clean install in the workspace.
   - Confirm `vite.config.ts` and the React/Lucide/Recharts package files resolve through esbuild.
   - Do not update package versions as part of this repair.

2. Run the complete automated verification set.
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - Record the exact file/test counts and failures, if any.

3. Add a regression test for Bills search rendering.
   - Render `BillsView` with a bill lacking optional `notes`.
   - Verify deferred search returns matching bill number/vendor records without an exception.
   - This guards the retained memoized `filtered` implementation.

4. Browser-test the NAS deployment without posting financial data.
   - Desktop: Dashboard, Bills, Expenses, Chart of Accounts, and Reports navigation.
   - Mobile: header controls, three quick actions, two-column KPI layout, and bottom navigation.
   - Check console errors and capture screenshots at both viewports.

5. Only after all checks pass, publish the current working tree through the existing NAS deployment process.

## Failure Modes And Safeguards

| Failure mode | Safeguard |
| --- | --- |
| Dependency repair silently changes versions | Use the existing lockfile and review `git diff` before proceeding. |
| Test runner becomes available but tests fail | Stop deployment; fix one failure at a time with a regression test where appropriate. |
| Browser smoke test reaches live tenant data | Use read-only navigation and never submit a financial form during QA. |
| Mobile UI is clipped by the fixed navigation | Validate at 375px and verify all content clears the bottom safe area. |

## Not In Scope

- Database pool/index/pagination performance roadmap.
- Financial posting, approval, recovery, or migration changes.
- Dependency upgrades.
- NAS network or Tailscale configuration changes.

## Acceptance Criteria

- No TypeScript or build failures.
- Full Vitest suite starts and completes successfully.
- New Bills regression test passes.
- No browser console errors on the listed desktop/mobile routes.
- The deployed NAS application has the intended mobile dashboard navigation and remains read-only during smoke testing.

## Decision Audit Trail

| # | Decision | Principle | Rationale |
| --- | --- | --- | --- |
| 1 | Repair toolchain before feature work | Reliability | Tests cannot establish safety until the runner works. |
| 2 | Retain deferred memoized Bills filtering | Performance and correctness | It avoids both duplicate declarations and avoidable keystroke work. |
| 3 | Separate deployment verification from financial changes | Blast-radius control | Infrastructure repair should not alter accounting behavior. |
