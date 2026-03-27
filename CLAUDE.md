# WerkStack — Claude Code Instructions

## Project Overview

WerkStack is a high-fidelity Infrastructure Documentation & Orchestration platform. It bridges the gap between simple diagramming tools and enterprise DCIM software like NetBox, targeting homelabbers and small-business IT operators.

## Reference Documents

Full specifications live in `../Project Guidelines/`. Read the relevant doc before implementing any feature:

- `BUILD_PLAN.md` — Master build plan with all resolved decisions, phase breakdown, and block registry
- `Proposal and Technical Reference.docx` — Complete feature spec, UI patterns, theme tokens, CSS class system, coding standards
- `Ammendments.docx` — Theme system amendment (three-mode tokens replacing global constants)
- `Template Block Sizes.docx` — Canonical 96×12 grid block dimensions

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, React Router v6, TanStack Query v5, Zustand
- **Backend:** Node.js, Express 4, PostgreSQL (pg driver), Zod validation, JWT (httpOnly cookies)
- **Styling:** Single `index.css` file — no CSS modules, no CSS-in-JS, no Tailwind
- **Deployment:** Docker Compose (frontend + backend + PostgreSQL)
- **Monorepo:** npm workspaces — `shared/`, `frontend/`, `backend/`

## Project Structure

```
app/
├── CLAUDE.md              ← you are here
├── docker-compose.yml
├── package.json           ← workspace root (npm workspaces)
├── shared/                ← TypeScript interfaces, Zod schemas, block registry
│   ├── package.json
│   └── src/
│       ├── types/         ← PlacedBlock, DeviceTemplate, BlockDef, etc.
│       ├── schemas/       ← Zod validation schemas
│       └── constants/     ← BLOCK_DEFS, type seed data
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css      ← ALL shared CSS classes (the only CSS file)
│       ├── components/
│       │   ├── layout/    ← AppHeader, Sidebar, Topbar
│       │   └── ui/        ← Icon, Modal, EmptyState, ErrorBoundary
│       ├── constants/     ← Default type arrays (seed/fallback)
│       ├── features/
│       │   ├── SiteShell.tsx
│       │   ├── auth/
│       │   ├── landing/
│       │   └── sites/tabs/
│       │       └── device_lib/
│       ├── store/         ← Zustand stores
│       ├── styles/        ← tokens.ts (static constants), theme.ts (makeCSS)
│       ├── types/         ← API shape interfaces (imports from @werkstack/shared)
│       └── utils/         ← api.ts, uid.ts, sanitize.ts
└── backend/
    ├── package.json
    └── src/
        ├── index.js
        ├── db/            ← PostgreSQL connection, migrations
        ├── middleware/     ← auth.js, validate.js
        └── routes/        ← One file per resource
```

## 15 Architectural Invariants — ALWAYS FOLLOW

1. **PlacedBlock[] is THE data format.** Never convert to pixel coords, never split into sub-arrays. Template layout is always PlacedBlock[].

2. **TemplateOverlay is THE renderer.** One component renders device layouts everywhere: rack view, detail panel, storage screen, export. Never build parallel rendering logic.

3. **96×12 grid is resolution-independent.** `cellW = availableWidth / 96` computed at render time. Never store pixel values in templates.

4. **CSS custom properties cascade.** Every screen root element must spread `css.vars` or `av` (`{'--accent': accent}`). Without this, all hover states fall back to default orange.

5. **Theme tokens from useThemeStore.** Never import color/font hex values directly from constants. Components read colors from the theme store's active mode (homelab-dark, enterprise-dark, enterprise-light).

6. **Single index.css.** No `.module.css` files. No CSS-in-JS. No Tailwind. The accent system depends on CSS custom properties cascading in a single stylesheet.

7. **Hover states are CSS only.** Never use `onMouseOver`/`onMouseOut` for hover effects. Always use CSS class hover rules with `!important` in the `<style>` block.

8. **Wizards never close on Escape or backdrop click.** Only simple single-step modals close on Escape/backdrop. Wizards use `.wizard-modal-overlay` + `.wizard-panel`, not the Modal component.

9. **Filter state is `Set<string> | null`.** Three states: `null` = all pass, `Set` with IDs = only those pass, empty `Set` = nothing passes. Never collapse to a boolean.

10. **Zustand stores for cross-component state.** `useState` for UI-only state. Five stores: useAuthStore, useSiteStore, useTypesStore, useRackStore, useTemplateStore (plus useThemeStore for theme mode).

11. **`uid()` for all identifiers.** From `utils/uid.ts` using `crypto.randomUUID()`. Never `Math.random()`, `Date.now()`, or sequential counters.

12. **`sanitizeUrl()` on all user-provided hrefs.** Mandatory XSS prevention. Returns '#' for dangerous schemes. Import from `utils/sanitize.ts`.

13. **Error responses always `{ error: 'message' }`.** Never `{ message }`, `{ detail }`, or `{ msg }`. The frontend's `api.ts` reads `body.error`.

14. **Timestamps are ISO strings.** Store as `TIMESTAMPTZ` in PostgreSQL. Display with `new Date(str).toLocaleDateString()`. Never store Date objects.

15. **`getState()` in event handlers.** Zustand hook values are stale in closures. Always use `useRackStore.getState()` inside click handlers and async callbacks.

## Key Patterns

### Every Screen Must Do These 5 Things

```tsx
// 1. Read outlet context
const { accent, css } = useOutletContext<SiteCtx>();
const av = { '--accent': accent } as React.CSSProperties;

// 2. Spread theme vars on root element
<div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, ...av }}>

// 3. Include hover style block
<style>{`
  .act-primary:hover { background: var(--accent-dark, #a8653e) !important; }
  .btn-ghost:hover { background: #262c30 !important; border-color: #3a4248 !important; color: #d4d9dd !important; }
  .rpill:hover:not(.on) { background: var(--accent-tint, #c47c5a22) !important; border-color: var(--accent, #c47c5a) !important; }
  .rpill.on:hover { background: var(--accent-dark, #a8653e) !important; }
  .tpill:hover { filter: brightness(1.2); }
  .tab-wrap:hover .tab-btn-inner { color: var(--accent, #c47c5a) !important; }
`}</style>

// 4. Use EmptyState for empty data
if (!items.length) return <EmptyState icon="layers" title="no items yet" action={...} />;

// 5. Wrap complex sub-components in ErrorBoundary
<ErrorBoundary><GridEditor ... /></ErrorBoundary>
```

### Filter Pill Logic

```tsx
// State
const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null);

// "all" pill
<button className={`rpill${typeFilter === null ? ' on' : ''}`}
  onClick={() => setTypeFilter(typeFilter === null ? new Set() : null)}>all</button>

// Individual pill
const isOn = typeFilter === null || typeFilter.has(item.id);
// Click: if null → Set of all minus this one. If Set → toggle membership. If all re-selected → collapse to null.

// Filtering
const visible = items.filter(x => typeFilter === null || typeFilter.has(x.typeId));
```

### Modal Form State

```tsx
const blank: Thing = { id: uid(), name: '', ... };
const [f, setF] = useState<Thing>(initial ?? blank);
useEffect(() => { if (open) setF(initial ?? { ...blank, id: uid() }); }, [open]);
const set = <K extends keyof Thing>(k: K, v: Thing[K]) => setF(p => ({ ...p, [k]: v }));
```

### Store Reads in Event Handlers

```tsx
// WRONG — stale closure
const devices = useRackStore(s => s.devices);
function handleSave() { /* devices may be outdated */ }

// RIGHT — always current
function handleSave() {
  const store = useRackStore.getState();
  store.updateDevice(updated);
}
```

### Backend Route Pattern

```js
module.exports = function thingsRoutes(db) {
  const router = express.Router({ mergeParams: true });
  router.use(requireAuth, requireSiteAccess(db));
  router.get('/', handler);
  router.post('/', validate(ThingSchema), handler);
  return router;
};
```

## Grid System — 96×12 Master Grid

Rack-mount chassis: 96 columns × (rackU × 12) rows per panel.
Desktop/wall-mount: user-defined gridCols × gridRows.

Key block dimensions (grid units):
- RJ45/IPMI: 4×4 | SFP/SFP+/SFP28: 4×3 | QSFP: 6×4
- 3.5" bay: 22×7 | 2.5" bay: 16×5 | 2.5" vertical: 6×16
- Power (C14): 8×6
- PCIe full-height: 32×10 | PCIe low-profile: 32×6 | PCIe double-width: 32×20

Full block registry with behavioral flags (isPort, isNet, isSlot, canRotate) is in BUILD_PLAN.md.

## Static Layout Constants

```
FONT_UI    = 'Inter, system-ui, sans-serif'
FONT_MONO  = "'JetBrains Mono', monospace"
FONT_HERO  = "'Ubuntu', sans-serif"

FS_BODY=13px  FS_INTERACTIVE=11px  FS_LABEL=10px  FS_INPUT_LARGE=12px

R=4px  R2=6px  R3=14px

SIDEBAR_WIDTH=188px  TOPBAR_HEIGHT=38px  MODAL_MIN_WIDTH=460px  RACK_UNIT_HEIGHT=40px
INPUT_PAD='5px 10px'  CARD_PAD='12px 14px'

Z: base=0, raised=10, sticky=100, modal=1000, tooltip=1200
```

## Component File Location Rule

If a component is used by exactly one screen → lives in that screen's subfolder.
If used by 2+ screens → lives in `components/`.
No `shared/`, `common/`, or `helpers/` folders in the frontend.

## Database Conventions

- All tables have `org_id` with RLS policies
- `SET app.current_org_id` at start of every transaction
- UUIDs everywhere (never INTEGER AUTOINCREMENT)
- JSON columns stored as JSONB in PostgreSQL
- Hierarchy: Organizations → Sites → Zones → Racks → DeviceInstances
- Zones also hold non-racked devices (desktops, wall-mounts)

## ID Prefix Conventions

```
dt-    Device type         (dt-server, dt-switch, dt-nas)
vt-    VM/container type   (vt-vm, vt-lxc, vt-docker)
at-    App/service type    (at-web, at-proxy, at-monitoring)
pcie-  PCIe card type      (pcie-nic, pcie-hba, pcie-gpu)
```

## What NOT To Do

- Don't use `onMouseOver`/`onMouseOut` for hover effects
- Don't create `.module.css` files or introduce CSS-in-JS
- Don't use `Modal` component for wizards (prevents Escape/backdrop close)
- Don't call store setters during render (infinite loop)
- Don't read Zustand hook values inside event handler closures
- Don't use `JSON.parse()` without a fallback on database fields
- Don't store Date objects as timestamps
- Don't return `{ message }` instead of `{ error }` from routes
- Don't place blocks without a `uid()` ID
- Don't import colors from tokens.ts directly — use theme.ts
- Don't build parallel rendering logic outside TemplateOverlay
- Don't skip `sanitizeUrl()` on user-provided URLs
