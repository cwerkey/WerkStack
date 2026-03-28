import { z } from 'zod';

export const PlacedBlockSchema = z.object({
  id:      z.string().uuid(),
  type:    z.string(),
  col:     z.number(),
  row:     z.number(),
  w:       z.number().positive(),
  h:       z.number().positive(),
  label:   z.string().optional(),
  rotated: z.boolean().optional(),
  slot:    z.union([z.literal(0), z.literal(1)]).optional(),
  meta:    z.record(z.unknown()).optional(),
});

export const GridLayoutSchema = z.object({
  front: z.array(PlacedBlockSchema),
  rear:  z.array(PlacedBlockSchema),
});

export const DeviceTemplateSchema = z.object({
  manufacturer: z.string().max(200).optional(),
  make:         z.string().min(1),
  model:        z.string().min(1),
  category:     z.string().min(1),
  formFactor:   z.enum(['rack', 'desktop', 'wall-mount']),
  uHeight:      z.number().int().positive(),
  gridCols:     z.number().int().positive().optional(),
  gridRows:     z.number().int().positive().optional(),
  wattageMax:   z.number().positive().optional(),
  layout:       GridLayoutSchema,
  imageUrl:     z.string().url().optional(),
  isShelf:      z.boolean().default(false),
});

export const PcieTemplateSchema = z.object({
  manufacturer: z.string().max(200).optional(),
  make:         z.string().min(1),
  model:        z.string().min(1),
  busSize:      z.enum(['x1', 'x4', 'x8', 'x16']),
  formFactor:   z.enum(['fh', 'lp', 'dw']),
  layout:       z.object({ rear: z.array(PlacedBlockSchema) }),
});

export const SiteSchema = z.object({
  name:        z.string().min(1).max(100),
  location:    z.string().min(1).max(200),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().max(500).optional(),
});

export const ZoneSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const RackSchema = z.object({
  name:    z.string().min(1).max(100),
  zoneId:  z.string().uuid().optional(),
  uHeight: z.number().int().min(1).max(100),
});

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
});

export const RegisterSchema = z.object({
  email:    z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  orgName:  z.string().min(1).max(100),
});

// ─── Type System CRUD ─────────────────────────────────────────────────────────
// Used for POST /api/types/:category and PATCH /api/types/:category/:id

const TypePayloadSchema = z.object({
  name:  z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const DeviceTypeSchema     = TypePayloadSchema;
export const PcieTypeSchema       = TypePayloadSchema;
export const CableTypeSchema      = TypePayloadSchema;
export const VmTypeSchema         = TypePayloadSchema;
export const AppTypeSchema        = TypePayloadSchema;
export const TicketCategorySchema = TypePayloadSchema;

// ─── Device Instance CRUD ────────────────────────────────────────────────────
export const DeviceInstanceSchema = z.object({
  templateId:    z.string().uuid().optional(),
  typeId:        z.string().min(1),
  name:          z.string().min(1).max(200),
  rackId:        z.string().uuid().optional(),
  zoneId:        z.string().uuid().optional(),
  rackU:         z.number().int().min(1).optional(),
  uHeight:       z.number().int().min(1).optional(),
  face:          z.enum(['front', 'rear']).default('front'),
  ip:            z.string().max(200).optional(),
  serial:        z.string().max(200).optional(),
  assetTag:      z.string().max(200).optional(),
  notes:         z.string().max(2000).optional(),
  isDraft:       z.boolean().default(true),
  shelfDeviceId: z.string().uuid().optional(),
  shelfCol:      z.number().int().min(0).optional(),
  shelfRow:      z.number().int().min(0).optional(),
});

// ─── VPN Tunnel ─────────────────────────────────────────────────────────────
export const VpnTunnelSchema = z.object({
  srcDeviceId: z.string().uuid(),
  dstDeviceId: z.string().uuid(),
  tunnelType:  z.enum(['vpn', 'vxlan', 'gre', 'ipsec', 'wireguard']).default('vpn'),
  label:       z.string().max(200).optional(),
  notes:       z.string().max(2000).optional(),
});

// ─── Pathfinder Request ─────────────────────────────────────────────────────
export const PathfinderQuerySchema = z.object({
  srcDeviceId: z.string().uuid(),
  dstDeviceId: z.string().uuid(),
  layer:       z.enum(['L1', 'L3', 'all']).default('all'),
  maxDepth:    z.number().int().min(1).max(15).default(15),
});

// ─── Resource Ledger ────────────────────────────────────────────────────────
export const LedgerItemSchema = z.object({
  name:     z.string().min(1).max(200),
  category: z.enum(['ram', 'cpu', 'drive', 'cable', 'psu', 'fan', 'pcie-card', 'misc']).default('misc'),
  sku:      z.string().max(100).optional(),
  quantity: z.number().int().min(0).default(0),
  unitCost: z.number().min(0).optional(),
  notes:    z.string().max(2000).optional(),
});

export const LedgerTransactionSchema = z.object({
  ledgerItemId: z.string().uuid(),
  deviceId:     z.string().uuid().optional(),
  action:       z.enum(['add', 'remove', 'reserve', 'unreserve', 'install', 'uninstall']),
  quantity:     z.number().int().min(1),
  note:         z.string().max(2000).optional(),
});

// ─── Heartbeat ──────────────────────────────────────────────────────────────
export const HeartbeatSchema = z.object({
  deviceId:  z.string().uuid(),
  status:    z.enum(['up', 'down', 'degraded', 'unknown']).default('up'),
  latencyMs: z.number().int().min(0).optional(),
  payload:   z.record(z.unknown()).optional(),
});

// ─── Git-Sync Config ────────────────────────────────────────────────────────
export const GitSyncConfigSchema = z.object({
  repoUrl:      z.string().min(1).max(500),
  branch:       z.string().min(1).max(100).default('main'),
  enabled:      z.boolean().default(false),
  pushInterval: z.number().int().min(60).max(86400).default(300),
});

// ─── Blueprint Promotion ────────────────────────────────────────────────────
export const PromotionSchema = z.object({
  deviceIds: z.array(z.string().uuid()).min(1),
});

// Community Exchange Format v2
export const TemplateImportSchema = z.object({
  schema_version: z.literal('2'),
  metadata: z.object({
    make:       z.string(),
    model:      z.string(),
    category:   z.string().optional(),
    u_height:   z.number().optional(),
    wattage_max: z.number().optional(),
  }),
  layout: z.object({
    front: z.array(z.record(z.unknown())),
    rear:  z.array(z.record(z.unknown())),
  }),
});
