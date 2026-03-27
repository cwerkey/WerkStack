# WerkStack — Master Build Plan

**Date:** March 25, 2026
**Status:** All architectural decisions resolved. Ready to build.

---

## Resolved Decisions

| Decision | Resolution |
|---|---|
| Codebase | Fresh build from scratch |
| Database | PostgreSQL with RLS from day one |
| Deployment | Docker Compose (frontend + backend + Postgres) |
| Project structure | Monorepo with npm workspaces (`shared/`, `frontend/`, `backend/`) |
| Grid system | 96 columns × 12 rows per 1U (Template Block Sizes doc is canonical) |
| Block registry | Merge: ~30 type names + behavioral flags from proposal, dimensions from Block Sizes doc |
| Theme system | Three modes (homelab-dark, enterprise-dark, enterprise-light) replace global color/font tokens. Layout constants (radii, z-index, spacing, font sizes) stay static. Per-site accent continues to work on top. |
| Zones | Kept. Sites → Zones → Racks. Zone management table under Site Settings (not a core nav page). Zones also serve as containers for non-racked devices (desktops, wall-mounts). |
| Renderer | DOM-based TemplateOverlay (not Canvas) |
| CSS | Hand-built single index.css file (not Tailwind) |
| Template images | Grid-only for v1. Optional `imageUrl` field in schema for future use. |
| Admin shadowing | Deferred to post-v1. `impersonator_id` field included in JWT schema design now. |

---

## Canonical Block Type Registry (96×12 Grid)

All dimensions in grid units. 96 columns wide, 12 rows per 1U of rack height.

### Network Ports

| Type | w | h | Panel | isPort | isNet | isSlot | Notes |
|---|---|---|---|---|---|---|---|
| `rj45` | 4 | 4 | all | — | ✓ | — | 24 fit across 96-unit width |
| `sfp` | 4 | 3 | all | — | ✓ | — | |
| `sfp+` | 4 | 3 | all | — | ✓ | — | |
| `sfp28` | 4 | 3 | all | — | ✓ | — | |
| `qsfp` | 6 | 4 | all | — | ✓ | — | 40Gb/100Gb |
| `qsfp28` | 6 | 4 | all | — | ✓ | — | |

### Peripheral Ports (Half-width concept replaced — these are full grid-sized blocks)

| Type | w | h | Panel | isPort | isNet | isSlot | Notes |
|---|---|---|---|---|---|---|---|
| `usb-a` | 3 | 3 | all | ✓ | — | — | |
| `usb-c` | 3 | 2 | all | ✓ | — | — | |
| `serial` | 4 | 3 | all | ✓ | — | — | DB9 |
| `hdmi` | 4 | 2 | all | ✓ | — | — | |
| `displayport` | 4 | 2 | all | ✓ | — | — | |
| `vga` | 6 | 3 | all | ✓ | — | — | DE-15 |
| `ipmi` | 4 | 4 | rear | — | ✓ | — | Management port |
| `misc-port` | 4 | 3 | all | ✓ | — | — | Generic small port |

### Drive Bays

| Type | w | h | Panel | isPort | isNet | isSlot | Notes |
|---|---|---|---|---|---|---|---|
| `bay-3.5` | 22 | 7 | front | — | — | ✓ | 3.5" LFF horizontal |
| `bay-2.5` | 16 | 5 | front | — | — | ✓ | 2.5" SFF horizontal |
| `bay-2.5v` | 6 | 16 | front | — | — | ✓ | 2.5" SFF vertical (storage servers) |
| `bay-m2` | 4 | 10 | all | — | — | ✓ | M.2 slot |
| `bay-u2` | 4 | 4 | all | — | — | ✓ | U.2 2.5" hot-swap |
| `bay-flash` | 3 | 3 | all | — | — | ✓ | USB flash internal |
| `bay-sd` | 3 | 2 | all | — | — | ✓ | SD card internal |

### Power

| Type | w | h | Panel | isPort | isNet | isSlot | Notes |
|---|---|---|---|---|---|---|---|
| `power` | 8 | 6 | all | — | — | — | C14/C13 connector |

### PCIe Bracket Zones

| Type | w | h | Panel | isPort | isNet | isSlot | Notes |
|---|---|---|---|---|---|---|---|
| `pcie-fh` | 32 | 10 | rear | — | — | ✓ | Full-height single slot |
| `pcie-lp` | 32 | 6 | rear | — | — | ✓ | Low-profile single slot |
| `pcie-dw` | 32 | 20 | rear | — | — | ✓ | Double-width (GPU/HBA) |

### Misc / Filler

| Type | w | h | Panel | isPort | isNet | isSlot | Notes |
|---|---|---|---|---|---|---|---|
| `misc-small` | 4 | 4 | all | — | — | — | Generic small block |
| `misc-med` | 8 | 6 | all | — | — | — | Generic medium block |
| `misc-large` | 16 | 10 | all | — | — | — | Generic large block |

### Additional Properties on All Blocks

- `canRotate: boolean` — 90° rotation permitted (swaps w and h)
- `color: string` — hex fill tint for rendering
- `border_color: string` — hex border color for rendering
- `label: string` — display name

### Grid Sizing Reference (96×12 System)

| Component | Grid (w × h) | Notes |
|---|---|---|
| Rack-mount chassis panel | 96 × (rackU × 12) | Per panel, front and rear identical |
| Desktop/wall-mount chassis | gridCols × gridRows | User-defined in template wizard |
| 1U rack panel | 96 × 12 | |
| 2U rack panel | 96 × 24 | |
| 4U rack panel | 96 × 48 | |
| PCIe card face (FH single) | 32 × 10 | Card template grid |
| PCIe card face (LP single) | 32 × 6 | Card template grid |
| PCIe card face (DW) | 32 × 20 | Card template grid |

---

## Theme Token System

Three modes replace global color/font tokens. Layout constants remain static.

### Static Constants (mode-independent)

```
Font sizes:    FS_BODY=13px, FS_INTERACTIVE=11px, FS_LABEL=10px, FS_INPUT_LARGE=12px
Border radii:  R=4px, R2=6px, R3=14px
Layout:        SIDEBAR_WIDTH=188px, TOPBAR_HEIGHT=38px, MODAL_MIN_WIDTH=460px, RACK_UNIT_HEIGHT=40px
Z-index:       base=0, raised=10, sticky=100, modal=1000, tooltip=1200
Padding:       INPUT_PAD='5px 10px', CARD_PAD='12px 14px'
```

### Mode-Aware Tokens (from useThemeStore)

28 token fields covering: pageBg, cardBg, cardBg2, rowBg, inputBg, hdrBg, hdrText, hdrBorder, border, border2, border3, text, text2, text3, red, green, blue, gold, purple, vmTint, appTint, hostTint, infraBg, profBg, profText, fontMain, fontSub, fontLabel, fontData.

See Amendments document for full value table across all three modes.

### Per-Site Accent (works on top of theme)

The accent color system (makeCSS, css.vars, --accent custom properties) continues to work independently. Theme controls the "canvas" (backgrounds, borders, text colors). Accent controls the "highlight" (active states, pills, buttons, selection indicators).

---

## Data Model — Zone Addition

Sites → Zones → Racks (with Zones also holding non-racked devices)

```sql
CREATE TABLE zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Racks belong to zones
ALTER TABLE racks ADD COLUMN zone_id UUID REFERENCES zones(id);

-- Non-racked devices can belong to zones directly
ALTER TABLE device_instances ADD COLUMN zone_id UUID REFERENCES zones(id);
```

Zone management is a table within Site Settings (not its own sidebar nav page). CRUD operations available to admins.

---

## Phase Breakdown

### Phase 1 — Project Scaffolding & Shell
**Goal:** Empty app that compiles, routes, and renders all page stubs with correct layout.

- Initialize monorepo: `werkstack/` root with npm workspaces
  - `shared/` — TypeScript interfaces, Zod schemas, block registry
  - `frontend/` — React 18 + Vite + TypeScript
  - `backend/` — Express + PostgreSQL (pg driver)
- `docker-compose.yml` — frontend (Vite dev → Nginx prod), backend (Node), PostgreSQL
- `index.css` — Full CSS class system from Part 2 of spec
- `tokens.ts` — Static layout constants only (radii, z-index, spacing, font sizes)
- `useThemeStore.ts` — Three-mode theme store with 28 token fields
- `theme.ts` — `makeCSS(accentHex)` for per-site accent derivation
- Google Fonts import (JetBrains Mono, Inter, Ubuntu)
- App shell components: AppHeader, Sidebar, Topbar, SiteShell
- React Router v6 routing: login, landing, `/sites/:siteId/*` with all 13 page stubs
- `SiteCtx` outlet context: `{ site, accent, css }`
- Icon folder system for easy icon updates
- `uid()` utility (crypto.randomUUID)
- `sanitizeUrl()` utility
- `api.ts` utility with error handling (reads `body.error`)
- EmptyState, ErrorBoundary, Modal shared components

### Phase 2 — Auth & Identity Engine
**Goal:** Users can register, log in, and be scoped to an organization.

- PostgreSQL schema: organizations, users, memberships tables with RLS
- `SET app.current_org_id` middleware on every transaction
- JWT in httpOnly cookie (`werkdocs_session`), bcrypt password hashing
- `requireAuth`, `requireSiteAccess(db)`, `requireRole()` middleware chain
- `GET /api/auth/me` → hydrates `useAuthStore`
- Login page
- Permission system: `can(taskGroup, level)` — read < write < delete, owner bypasses all
- Zod validation middleware
- Consistent error response shapes: `{ error: 'message' }` / `{ error, issues }`
- JWT schema includes reserved `impersonator_id` field (unused in v1)

### Phase 3 — Type System & Core Data
**Goal:** Six-category type system loaded and editable.

- PostgreSQL tables for: device_types, pcie_types, cable_types, vm_types, app_types, ticket_categories
- Seed data for built-in types (dt-server, dt-switch, dt-nas, etc.)
- `useTypesStore` — hydrated from `GET /api/types` post-login
- CRUD API routes for custom types
- Type color system integrated with theme tokens

### Phase 4 — Sites, Zones & Landing Page
**Goal:** Users can create sites, manage zones, and the accent system works.

- PostgreSQL: sites, zones tables with RLS
- Landing page / site picker with site cards
- `useSiteStore` — `activeSiteId` from URL
- `makeCSS(site.color)` → `css.vars` cascade on SiteShell
- Site Settings page with zones CRUD table
- Site CRUD (create, edit, delete)

### Phase 5 — Device Library & Template System
**Goal:** Full template creation, editing, and management.

- PostgreSQL: device_templates, placed_blocks, block_type_definitions, pcie_card_templates, module_instances
- `shared/` package: BLOCK_DEFS array (96×12 dimensions), PlacedBlock interface, BlockDef interface
- `useTemplateStore` — deviceTemplates[], pcieTemplates[]
- Device Library page with four tabs: active, shelf, device_temps, pcie_temps
- Template Creator Wizard: info step → grid editor (two-panel: front/rear)
- GridEditor component with 96×12 grid
- BlockPalette component (type picker)
- Collision detection (server-side spatial query + client-side preview)
- PCIe Card Template Creator (sized to form factor: FH=32×10, LP=32×6, DW=32×20)
- Community exchange format: JSON import/export with schema validation
- Deploy Modal: creates RackDevice from DeviceTemplate
- Optional `imageUrl` field on DeviceTemplate (not rendered in v1)

### Phase 6 — Rack View
**Goal:** The flagship visual page — devices in racks with template overlays.

- PostgreSQL: racks table (belongs to zones)
- `useRackStore` — racks[], devices[]
- Rack Setup page (admin): CRUD for racks within zones
- RackViewScreen with U-position numbering
- Front/rear face toggle (mount filter)
- TemplateOverlay: DOM renderer, computes cellW = availW / 96, positions each block
- DeviceOverlay: fallback for devices with no template
- MAP overlay pills (network / power / bays) — filter block types visible
- Ghost devices (opposite face, 35% opacity)
- Device drag-and-drop positioning with collision checking
- "Device rear" toggle (shows rear panel of front-mounted devices)
- Device Editor Modal (tabs: info / ports / drives / PCIe)
- Port Aggregator: `buildVirtualFaceplate()` merges PCIe card ports onto rear panel

### Phase 7 — Storage Screen
**Goal:** Drive management, pools, shares, bay visualization.

- StorageScreen with devices/pools/shares/drives tabs
- StorageBay interface with positional grid data
- Bay grid rendering (uses TemplateOverlay for positioned bays)
- Internal bays (M.2, U.2 not on front/rear panel) as table view
- Drive CRUD with boot drive (★) marking and VM passthrough assignment
- Pool Wizard (4 steps): name+device+color → type+layout → drives → create
- Pool types: ZFS, RAID, Ceph, LVM, Drive
- Vdev group management within pools
- Share CRUD: SMB, NFS, iSCSI with pool association

### Phase 8 — OS Stack Screen
**Goal:** Software layer documentation — hosts, VMs, applications.

- OsStackScreen with stacks/vms/applications tabs
- Data model: OsDevice, OsVm, OsApp
- Stacks tab block view: StackBlock cards with full hierarchy rendering
- VM columns, application cards, host OS row, infrastructure row
- Filter bar: rack filter, device filter, VM OS filter, service type filter
- VM Editor Modal: all fields including extra IPs, drives, parent VM
- App Editor Modal: all fields including extra IPs
- List view: folder tree with double-click to edit
- Theme-aware: reads all colors/fonts from useThemeStore

### Phase 9 — Cable Map, Topology, IP Plan
**Goal:** Network documentation and IP management.

- Cable Map page: connection CRUD, cable type assignment, medium mismatch warnings
- Connection/Patch Wizard: source port → destination port → cable type → label
- Topology page: node-and-link graph visualization (logical view)
- IP Plan page: subnet management, IP assignment modal
- IP collision detection (unique constraint per org + subnet)
- Next-available IP suggestion
- IP transfer (reassign in single transaction)

### Phase 10 — Remaining Pages
**Goal:** All 13 sidebar pages fully functional.

- Overview page: KPI cards (total devices, power load, open tickets, staged projects)
- Guides page: Markdown editor (split-pane: edit + preview)
- Tickets page: ticket CRUD with categories
- Users page: user/membership management, role assignment

### Phase 11 — Pathfinder & Advanced Features
**Goal:** Recursive path tracing, blueprints, monitoring.

- Pathfinder: recursive CTE engine with depth limit of 15
- Bridge/Hub logic for transparent switches
- Cycle detection via path array
- L1 (physical cable) and L3 (VPN tunnel) path support
- Blueprint Studio: draft rack view, BOM, power/space projections
- Promotion Wizard: BOM checklist → inventory check → metadata entry → commit
- `is_draft` flag on DeviceInstances
- Shadow resource reservation (Total = Active + Staged)
- Resource Ledger: loose components CRUD, quantity tracking, atomic shelf→server transactions
- Status & Heartbeat Monitor: heartbeat buffer, state machine event logger, node-cron for missed beats
- Git-Sync: file system watcher → simple-git worker (throttled 5-min push)
- Abandoned draft cleanup background worker

### Phase 12 — Polish & Hardening
**Goal:** Production readiness.

- Conflict warning system: all 6 types (spatial, power, IP, medium mismatch, inventory shortage, loop detection)
- Power overload warnings (80% soft, 100% hard block with admin override)
- Build Wizard: assembly manual generation (BOM + wiring guide)
- PNG export of rack views and template layouts
- Full audit logging
- Admin Shadowing UI (if time permits — JWT schema already supports it)
- Performance testing with large datasets
- Accessibility pass
- Error handling audit

---

## Key Architectural Invariants

These rules apply across all phases and every component:

1. **PlacedBlock[] is THE data format** — never convert to pixel coords, never split into sub-arrays
2. **TemplateOverlay is THE renderer** — one component, all contexts (rack view, detail, storage, export)
3. **96×12 grid is resolution-independent** — cellW computed at render time, never stored
4. **CSS custom properties cascade** — every screen root spreads `css.vars` or `av`
5. **Theme tokens from useThemeStore** — never import color/font hex values directly
6. **Single index.css** — no CSS modules, no CSS-in-JS, no Tailwind
7. **Hover states are CSS only** — never onMouseOver/onMouseOut
8. **Wizards never close on Escape or backdrop** — only modals do
9. **Filter state is Set<string> | null** — three states, not two
10. **Zustand stores for cross-component state** — useState for UI-only state
11. **uid() for all identifiers** — never Math.random() or sequential counters
12. **sanitizeUrl() on all user-provided href** — mandatory XSS prevention
13. **Error responses always `{ error: 'message' }`** — never `{ message }` or `{ detail }`
14. **Timestamps are ISO strings** — never Date objects in storage
15. **getState() in event handlers** — avoid stale Zustand closures
