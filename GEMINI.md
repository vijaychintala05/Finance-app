# FirmBooks Agent Instructions & Guidelines

## END-TO-END FEATURE IMPLEMENTATION RULE

For every feature, change, screen, widget, dashboard, report, form, table, chart, or workflow requested:

You must implement it as a COMPLETE production feature, not just as UI.

### Required Chain:
**UI → state/query layer → API/server action → business logic → database → API response → UI refresh**

A feature is **not complete** if any link is mocked, hard-coded, or only stored in browser state.

---

### 1. Inspect before coding
Before making changes, inspect the existing:
- Database schema
- Backend/API architecture
- Authentication
- Organization/tenant isolation
- Permissions/RBAC
- Existing services/repositories
- Frontend data-fetching pattern
- State management
- Existing API endpoints
- Existing database migrations
- Relevant tests

Reuse the existing architecture instead of creating parallel implementations.

---

### 2. Trace the complete data flow
For every feature, explicitly verify this path:

USER ACTION  
↓  
FRONTEND COMPONENT  
↓  
QUERY / STATE LAYER  
↓  
API / SERVER ACTION  
↓  
BUSINESS LOGIC  
↓  
DATABASE  
↓  
API RESPONSE  
↓  
FRONTEND REFRESH  

If any layer is missing, implement it.

---

### 3. Never use fake data unless explicitly requested
DO NOT:
- Hard-code dashboard numbers
- Hard-code chart values
- Create fake arrays as production data
- Use placeholder transactions
- Calculate important financial information only in the browser
- Store business records only in React/local state
- Use localStorage as the source of truth
- Create UI without connecting it to the backend

Mock data may only be used inside tests, development fixtures, or when explicitly requested as a prototype. Production screens must use real database-backed data.

---

### 4. Backend is mandatory
If the feature requires data that the current backend does not provide, create or modify the necessary:
- Database tables/columns
- Migrations
- Constraints
- Indexes
- Relationships
- Server services
- API endpoints/server actions
- Validation
- Authorization
- Error handling
- Transaction handling

Do not stop at the frontend because an API is missing. Build the missing backend.

---

### 5. Database must remain the source of truth
Any create/update/delete operation must:
1. Validate input
2. Check authentication
3. Check authorization
4. Check tenant/organization ownership
5. Write to the database
6. Return the authoritative saved record
7. Refresh/invalidate the frontend query
8. Display the latest server state

Changes must survive:
- Page refresh
- Logout/login
- Opening the app in another browser
- Opening the app on another device

If they do not survive these, the feature is incomplete.

---

### 6. Real-time / current data representation
Dashboard cards, charts, tables, balances, counts, statuses and reports must always represent actual backend data.

Use the application's existing query invalidation/refetch mechanism after mutations.

When genuine multi-user live updates are required, use the existing real-time infrastructure such as:
- WebSockets
- Server-Sent Events
- PostgreSQL/Supabase subscriptions
- Existing realtime service

Do not introduce realtime infrastructure unnecessarily if normal server refetch/query invalidation provides the required behaviour.

---

### 7. No duplicate business logic
Business-critical calculations must live in the authoritative backend/domain layer whenever appropriate.

Do not independently calculate the same value in multiple frontend components.

The frontend should primarily display authoritative results returned by the backend.

This is especially important for:
- Balances
- Outstanding amounts
- Revenue
- Expenses
- Profit
- Tax
- Invoice totals
- Payment allocations
- Customer/vendor balances
- Financial reports

---

### 8. Existing architecture first
Before creating a new:
- API
- Service
- Hook
- Store
- Database table
- Utility
- Component pattern

Search the codebase for the existing equivalent and extend it. Avoid duplicate architecture.

---

### 9. Handle all feature states
Every data-driven UI must properly handle:
- Loading
- Empty state
- Success
- Validation errors
- Server errors
- Unauthorized access
- Permission restrictions
- Network failure
- Stale data
- Retry/refetch where appropriate

Do not silently fall back to fake data when an API fails.

---

### 10. Test the complete vertical slice
Do not test only whether the UI renders.

Verify:
- **CREATE**: UI → API → DB → UI
- **READ**: DB → API → UI
- **UPDATE**: UI → API → DB → UI
- **DELETE**: UI → API → DB → UI

Also verify refresh persistence. For important features, verify another authenticated session receives the correct updated state.

---

### 11. Before declaring DONE
Provide an implementation audit:

- **Frontend**: What changed
- **Backend**: What changed
- **Database**: What changed
- **API**: Endpoints used/created/modified
- **Data source**: Where each displayed value comes from
- **Realtime/refetch**: How the UI receives updated information
- **Permissions**: What authorization checks are performed
- **Tests**: Tests added/run and results
- **Remaining mocks/placeholders**: List every one. If none, explicitly state **NONE**.

---

### Definition of Done
A feature is **NOT DONE** merely because it looks correct.

A feature is **DONE** only when:
- UI is complete
- Backend is complete
- Database integration is complete
- Real data is displayed
- CRUD operations persist
- Refresh shows the same saved state
- Permissions are enforced
- Tenant isolation is preserved
- Errors are handled
- Relevant tests pass
- No unintended mocks or hard-coded production values remain

If a request appears to describe only UI, assume the complete end-to-end production implementation is expected unless explicitly told: "UI ONLY — DO NOT IMPLEMENT BACKEND."
