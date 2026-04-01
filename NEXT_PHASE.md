# WerkStack Rev 2 — Next Phase Items

Items deferred from the Phase 13 review audit. These are non-blocking but should be addressed before Rev 2.1.

---

## Bug Fixes / Polish

### Loading Skeletons (Priority: Medium)
A `Skeleton` component exists (`frontend-v2/src/components/Skeleton.tsx`) with 4 variants (`table-row`, `card`, `text`, `block`) but only 5 of 15 pages use it. The remaining pages show plain "Loading..." text or nothing.

**Pages needing skeletons:**
- OverviewPage (use `card` variant for widget placeholders)
- RackViewHub (use `block` for rack area)
- DeviceLibrary (use `table-row`)
- SubnetsPage (use `card` for subnet cards)
- LeasesPage (use `table-row`)
- ActivityPage (use `card` for status cards)
- GuidesPage (use `text`)
- TodoListPage (use `text`)

### Shared EmptyState Component (Priority: Low)
All pages implement empty states inline with inconsistent patterns (some use emoji+text, some plain text). Create a shared `EmptyState.tsx` component in `frontend-v2/src/components/` matching the Rev 1 API: `EmptyState({ icon?, title, subtitle?, action? })`. Then migrate all pages to use it.

### Wizard ErrorBoundaries (Priority: Low)
10 wizard modals have no ErrorBoundary wrapping. If a wizard crashes, the page-level ErrorBoundary catches it — but the entire page crashes, not just the modal. Low urgency because wizards already have try/catch for API errors. Consider wrapping the 3 most complex wizards:
- `OnboardingWizard` (838 lines, sequential API calls)
- `TemplateWizard` (complex grid editor)
- `PlatformImportWizard` (external API calls)

### TemplateWizard Shared Block Math (Priority: Low)
GridEditor in TemplateWizard duplicates ~80% of TemplateOverlay's block positioning math. Extract a shared `getBlockDimensions(block, cellW, cellH)` utility to prevent future drift. The duplication is intentional (editor vs. read-only renderer) but the math should be centralized.

### Remaining Hardcoded Colors (Priority: Low)
~50 hex values remain in .module.css files that don't have clear token matches:
- Status badge backgrounds/text: `#1a2a2a`, `#4a9a8a`, `#9a9a4a`, `#6a6aba`, etc.
- Dark panel backgrounds: `#111417`, `#161a1d`
- Danger states: `#5c2828`, `#3a1818`

Consider adding new tokens to `theme.css` for these categories:
- `--color-surface-deep` for `#111417`/`#161a1d`
- `--color-error-bg`/`--color-error-border` for danger states
- Status badge tokens per monitoring state

---

## Deferred Features (from REV2_PLAN)

### Rev 2.1
- Blueprints (staged deployments)
- Ledger (inventory tracking)
- Mobile-friendly read views (responsive layouts for Overview, Activity, Guides)
- User-adjustable Activity refresh interval (via Site Settings)
- Dashboard widget drag-to-reorder (react-grid-layout)
- User-editable icon list for simple-icons

### Rev 2.2
- Cost tracking (power costs, device purchase prices, subscription costs)
- Webhooks (event-driven notifications)
- Auto-discovery (network scan, SNMP/LLDP, ARP table import)
- Centralized per-port VLAN config from VLAN management page
- Platform import re-sync with conflict resolution
