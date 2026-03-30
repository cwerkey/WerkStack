// ─── Block System ─────────────────────────────────────────────────────────────

export type BlockType =
  // Network ports
  | 'rj45' | 'sfp' | 'sfp+' | 'sfp28' | 'qsfp' | 'qsfp28'
  // Peripheral ports
  | 'usb-a' | 'usb-c' | 'serial' | 'hdmi' | 'displayport' | 'vga' | 'ipmi' | 'misc-port'
  // Drive bays
  | 'bay-3.5' | 'bay-2.5' | 'bay-2.5v' | 'bay-m2' | 'bay-u2' | 'bay-flash' | 'bay-sd'
  // Power
  | 'power'
  // PCIe brackets
  | 'pcie-fh' | 'pcie-lp' | 'pcie-dw'
  // Misc / Filler
  | 'misc-small' | 'misc-med' | 'misc-large';

export type BlockPanel = 'front' | 'rear' | 'all';

export interface BlockMeta {
  speed?: string;
  vlan?: string;
  laneCount?: string;
  gen?: string;
  [key: string]: unknown;
}

export interface PlacedBlock {
  id:       string;
  type:     BlockType;
  col:      number;
  row:      number;
  w:        number;
  h:        number;
  label?:   string;
  rotated?: boolean;
  slot?:    0 | 1;    // 0 = left half, 1 = right half (for half-width blocks)
  meta?:    BlockMeta;
}

export interface BlockDef {
  type:        BlockType;
  label:       string;
  w:           number;
  h:           number;
  panel:       BlockPanel;
  isPort:      boolean;
  isNet:       boolean;
  isSlot:      boolean;
  canRotate:   boolean;
  color:       string;
  borderColor: string;
}

// ─── Grid Layout ──────────────────────────────────────────────────────────────

export interface GridLayout {
  front: PlacedBlock[];
  rear:  PlacedBlock[];
}

// ─── Device Templates ─────────────────────────────────────────────────────────

export type FormFactor = 'rack' | 'desktop' | 'wall-mount';

export interface DeviceTemplate {
  id:            string;
  orgId:         string;
  manufacturer?: string;
  make:          string;
  model:         string;
  category:      string;
  formFactor:    FormFactor;
  uHeight:       number;
  gridCols?:     number;
  gridRows?:     number;
  wattageMax?:   number;
  layout:        GridLayout;
  imageUrl?:     string;
  isShelf:       boolean;
  createdAt:     string;
}

// ─── PCIe Card Templates ──────────────────────────────────────────────────────

export type PcieFormFactor = 'fh' | 'lp' | 'dw';
export type PcieBusSize = 'x1' | 'x4' | 'x8' | 'x16';

export interface PcieTemplate {
  id:            string;
  orgId:         string;
  manufacturer?: string;
  make:          string;
  model:         string;
  busSize:       PcieBusSize;
  formFactor:    PcieFormFactor;
  laneDepth:     number;
  layout:        { rear: PlacedBlock[] };
  createdAt:     string;
}

// ─── Organization / Auth ──────────────────────────────────────────────────────

export interface Organization {
  id:        string;
  name:      string;
  slug:      string;
  createdAt: string;
}

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface User {
  id:        string;
  orgId:     string;
  email:     string;
  username:  string;
  role:      UserRole;
  createdAt: string;
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export interface Site {
  id:          string;
  orgId:       string;
  name:        string;
  location:    string;
  color:       string;
  description?: string;
  createdAt:   string;
}

// ─── Zones ────────────────────────────────────────────────────────────────────

export interface Zone {
  id:           string;
  orgId:        string;
  siteId:       string;
  name:         string;
  description?: string;
  createdAt:    string;
}

// ─── Racks ────────────────────────────────────────────────────────────────────

export interface Rack {
  id:               string;
  orgId:            string;
  siteId:           string;
  zoneId?:          string;
  name:             string;
  uHeight:          number;
  powerBudgetWatts?: number;
  createdAt: string;
}

// ─── Device Instances ─────────────────────────────────────────────────────────

export interface DeviceInstance {
  id:             string;
  orgId:          string;
  siteId:         string;
  zoneId?:        string;
  rackId?:        string;
  templateId?:    string;
  typeId:         string;
  name:           string;
  rackU?:         number;
  uHeight?:       number;
  face?:          'front' | 'rear';
  ip?:            string;
  serial?:        string;
  assetTag?:      string;
  notes?:         string;
  isDraft:        boolean;
  currentStatus?: DeviceStatus;
  shelfDeviceId?: string;
  shelfCol?:      number;
  shelfRow?:      number;
  createdAt:      string;
}

// ─── Module Instances (PCIe cards installed in devices) ───────────────────────

export interface ModuleInstance {
  id:             string;
  deviceId:       string;
  slotBlockId:    string;
  cardTemplateId: string;
  serialNumber?:  string;
  assetTag?:      string;
}

// ─── Type System ──────────────────────────────────────────────────────────────
// orgId is null for built-in types, a UUID for custom org types.

export interface DeviceType {
  id:        string;
  orgId:     string | null;
  name:      string;
  color:     string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface PcieType {
  id:        string;
  orgId:     string | null;
  name:      string;
  color:     string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface CableType {
  id:        string;
  orgId:     string | null;
  name:      string;
  color:     string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface VmType {
  id:        string;
  orgId:     string | null;
  name:      string;
  color:     string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface AppType {
  id:        string;
  orgId:     string | null;
  name:      string;
  color:     string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface TicketCategory {
  id:        string;
  orgId:     string | null;
  name:      string;
  color:     string;
  isBuiltin: boolean;
  createdAt: string;
}

export interface TypesData {
  deviceTypes:      DeviceType[];
  pcieTypes:        PcieType[];
  cableTypes:       CableType[];
  vmTypes:          VmType[];
  appTypes:         AppType[];
  ticketCategories: TicketCategory[];
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export type DriveType = 'hdd' | 'ssd' | 'nvme' | 'flash' | 'tape';

export interface Drive {
  id:             string;
  orgId:          string;
  siteId:         string;
  deviceId?:      string;   // null = inventory/ledger drive (not installed)
  slotBlockId?:   string;   // PlacedBlock.id in template layout; null = internal/unlisted
  label?:         string;
  capacity:       string;   // e.g. "4T", "960G"
  driveType:      DriveType;
  serial?:        string;
  poolId?:        string;
  isBoot:         boolean;
  vmPassthrough?: string;   // VM name/id assigned to
  createdAt:      string;
}

export type VdevType =
  | 'mirror' | 'raidz1' | 'raidz2' | 'raidz3'
  | 'stripe' | 'special' | 'log' | 'cache' | 'spare';

export interface VdevGroup {
  id:       string;
  type:     VdevType;
  driveIds: string[];
  label?:   string;
}

export type PoolType  = 'zfs' | 'raid' | 'ceph' | 'lvm' | 'drive';
export type RaidLevel =
  | 'single' | 'mirror' | 'stripe'
  | 'raid0' | 'raid1' | 'raid5' | 'raid6' | 'raid10'
  | 'raidz1' | 'raidz2' | 'raidz3';

export interface StoragePool {
  id:         string;
  orgId:      string;
  siteId:     string;
  deviceId:   string;
  name:       string;
  color:      string;
  poolType:   PoolType;
  raidLevel:  RaidLevel;
  vdevGroups: VdevGroup[];
  notes?:     string;
  createdAt:  string;
}

export type ShareProtocol = 'smb' | 'nfs' | 'iscsi';

export interface Share {
  id:        string;
  orgId:     string;
  siteId:    string;
  poolId?:   string;
  name:      string;
  protocol:  ShareProtocol;
  path?:     string;
  notes?:    string;
  createdAt: string;
}

// ─── OS Stack ─────────────────────────────────────────────────────────────────

export interface OsHost {
  id:          string;
  orgId:       string;
  siteId:      string;
  deviceId:    string;
  hostOs:      string;
  osVersion?:  string;
  kernel?:     string;
  notes?:      string;
  createdAt:   string;
}

export interface OsVmDrive {
  label:       string;
  size:        string;
  mountpoint?: string;
}

export interface OsExtraIp {
  label: string;
  ip:    string;
}

export interface OsVm {
  id:           string;
  orgId:        string;
  siteId:       string;
  hostId:       string;
  parentVmId?:  string;
  name:         string;
  typeId:       string;
  vmOs?:        string;
  osVersion?:   string;
  cpus?:        number;
  ramGb?:       number;
  ip?:          string;
  extraIps:     OsExtraIp[];
  drives:       OsVmDrive[];
  notes?:       string;
  createdAt:    string;
}

export interface OsApp {
  id:        string;
  orgId:     string;
  siteId:    string;
  vmId?:     string;
  hostId?:   string;
  name:      string;
  typeId:    string;
  version?:  string;
  url?:      string;
  ip?:       string;
  extraIps:  OsExtraIp[];
  notes?:    string;
  createdAt: string;
}

// ─── Cable Map / Connections ──────────────────────────────────────────────────

export interface Connection {
  id:             string;
  orgId:          string;
  siteId:         string;
  srcDeviceId:    string;
  srcPort?:       string;
  srcBlockId?:    string;
  srcBlockType?:  string;
  dstDeviceId:    string | null;  // null when externalLabel is set
  dstPort?:       string;
  dstBlockId?:    string;
  dstBlockType?:  string;
  externalLabel:  string | null;  // null when dstDeviceId is set
  cableTypeId?:   string;
  label?:         string;
  notes?:         string;
  createdAt:      string;
}

// ─── IP Plan ──────────────────────────────────────────────────────────────────

export interface Subnet {
  id:        string;
  orgId:     string;
  siteId:    string;
  cidr:      string;
  name:      string;
  vlan?:     number;
  gateway?:  string;
  notes?:    string;
  createdAt: string;
}

export interface IpAssignment {
  id:        string;
  orgId:     string;
  siteId:    string;
  subnetId:  string;
  ip:        string;
  deviceId?: string;
  label?:    string;
  notes?:    string;
  createdAt: string;
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export type TicketStatus   = 'open' | 'in-progress' | 'closed';
export type TicketPriority = 'low'  | 'normal' | 'high' | 'critical';

export interface Ticket {
  id:           string;
  orgId:        string;
  siteId:       string;
  title:        string;
  description?: string;
  status:       TicketStatus;
  priority:     TicketPriority;
  categoryId?:  string;
  createdBy?:   string;
  createdAt:    string;
  updatedAt:    string;
}

// ─── Guides ───────────────────────────────────────────────────────────────────

export interface GuideManual {
  id:        string;
  orgId:     string;
  siteId:    string;
  name:      string;
  sortOrder: number;
  parentId:  string | null;
  createdAt: string;
}

export interface GuideLink {
  id:         string;
  orgId:      string;
  guideId:    string;
  entityType: string;
  entityId:   string;
  createdAt:  string;
}

export interface Guide {
  id:         string;
  orgId:      string;
  siteId:     string;
  title:      string;
  content:    string;
  manualId:   string | null;
  sortOrder:  number;
  isLocked:   boolean;
  manualName: string | null;
  links:      GuideLink[];
  createdBy?: string;
  createdAt:  string;
  updatedAt:  string;
}

export interface SearchResult {
  type:     'device' | 'guide' | 'subnet' | 'pool' | 'vm' | 'app' | 'connection';
  id:       string;
  name:     string;
  subtitle: string;
  icon:     string;
  route:    string;
}

export type GuideBlockType =
  | 'h1' | 'h2' | 'h3'
  | 'paragraph'
  | 'code'
  | 'list'
  | 'ordered'
  | 'divider'
  | 'callout';

export interface GuideBlock {
  id:      string;
  type:    GuideBlockType;
  content: string;
  meta?:   {
    language?: string;
    variant?:  string;   // callout: 'info' | 'warning' | 'tip'
  };
}

// ─── Pathfinder ──────────────────────────────────────────────────────────────

export type PathLayer = 'L1' | 'L3';

export interface PathStep {
  deviceId:    string;
  deviceName:  string;
  port?:       string;
  blockId?:    string;
  blockType?:  string;
  linkType:    PathLayer;
  linkLabel?:  string;
  isBridge:    boolean;
  depth:       number;
}

export interface PathResult {
  source:      string;
  destination: string;
  found:       boolean;
  path:        PathStep[];
  hasCycle:    boolean;
  depth:       number;
}

// ─── VPN Tunnels ─────────────────────────────────────────────────────────────

export type TunnelType = 'vpn' | 'vxlan' | 'gre' | 'ipsec' | 'wireguard';

export interface VpnTunnel {
  id:           string;
  orgId:        string;
  siteId:       string;
  srcDeviceId:  string;
  dstDeviceId:  string;
  tunnelType:   TunnelType;
  label?:       string;
  notes?:       string;
  createdAt:    string;
}

// ─── Resource Ledger ─────────────────────────────────────────────────────────

export type LedgerCategory = 'ram' | 'cpu' | 'drive' | 'cable' | 'psu' | 'fan' | 'pcie-card' | 'misc';
export type LedgerAction   = 'add' | 'remove' | 'reserve' | 'unreserve' | 'install' | 'uninstall';

export interface LedgerItem {
  id:        string;
  orgId:     string;
  siteId:    string;
  name:      string;
  category:  LedgerCategory;
  sku?:      string;
  quantity:  number;
  reserved:  number;
  unitCost?: number;
  notes?:    string;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerTransaction {
  id:           string;
  orgId:        string;
  siteId:       string;
  ledgerItemId: string;
  deviceId?:    string;
  action:       LedgerAction;
  quantity:     number;
  note?:        string;
  createdBy?:   string;
  createdAt:    string;
}

// ─── Heartbeat & Monitor ─────────────────────────────────────────────────────

export type DeviceStatus = 'up' | 'down' | 'degraded' | 'unknown' | 'maintenance';

export interface Heartbeat {
  id:         string;
  orgId:      string;
  siteId:     string;
  deviceId:   string;
  status:     DeviceStatus;
  latencyMs?: number;
  payload?:   Record<string, unknown>;
  receivedAt: string;
}

export type DeviceEventType =
  | 'status_change' | 'heartbeat_missed' | 'heartbeat_restored'
  | 'draft_created' | 'draft_promoted' | 'draft_abandoned'
  | 'install' | 'uninstall' | 'maintenance_start' | 'maintenance_end';

export interface DeviceEvent {
  id:         string;
  orgId:      string;
  siteId:     string;
  deviceId:   string;
  eventType:  DeviceEventType;
  fromState?: string;
  toState?:   string;
  details?:   Record<string, unknown>;
  createdBy?: string;
  createdAt:  string;
}

// ─── Git-Sync ────────────────────────────────────────────────────────────────

export interface GitSyncConfig {
  id:            string;
  orgId:         string;
  siteId:        string;
  repoUrl:       string;
  branch:        string;
  enabled:       boolean;
  pushInterval:  number;
  lastPushAt?:   string;
  lastPushError?: string;
  createdAt:     string;
  updatedAt:     string;
}

// ─── Blueprint / BOM ─────────────────────────────────────────────────────────

export interface BomLine {
  templateId:   string;
  templateName: string;
  make:         string;
  model:        string;
  count:        number;
  wattageEach?: number;
  wattageTotal: number;
}

export interface BlueprintSummary {
  totalDrafts:    number;
  totalWatts:     number;
  totalU:         number;
  bom:            BomLine[];
  missingLedger:  { name: string; needed: number; available: number }[];
}

// ─── Conflict Report (Phase 12) ──────────────────────────────────────────────

export type ConflictLevel = 'warn' | 'error';

export interface ConflictItem {
  type:    'spatial' | 'power' | 'ip' | 'medium' | 'inventory' | 'loop';
  level:   ConflictLevel;
  message: string;
  [key: string]: unknown;
}

export interface ConflictReport {
  spatialConflicts:   ConflictItem[];
  powerConflicts:     ConflictItem[];
  ipConflicts:        ConflictItem[];
  mediumMismatches:   ConflictItem[];
  inventoryShortages: ConflictItem[];
  loopConflicts:      ConflictItem[];
  totalErrors:        number;
  totalWarnings:      number;
}

// ─── Assembly Manual (Phase 12) ──────────────────────────────────────────────

export interface AssemblyBomLine {
  make:        string;
  model:       string;
  count:       number;
  wattageEach: number;
  instances:   {
    name:      string;
    rackName:  string | null;
    zoneName:  string | null;
    rackU:     number | null;
    uHeight:   number | null;
    serial:    string | null;
    assetTag:  string | null;
  }[];
}

export interface WiringStep {
  connectionId:  string;
  label:         string | null;
  cableType:     string | null;
  srcDevice:     string;
  srcRack:       string | null;
  srcRackU:      number | null;
  srcPort:       string | null;
  srcBlockType:  string | null;
  dstDevice:     string;
  dstRack:       string | null;
  dstRackU:      number | null;
  dstPort:       string | null;
  dstBlockType:  string | null;
}

export interface AssemblyManual {
  generatedAt:  string;
  totalDrafts:  number;
  totalWatts:   number;
  totalU:       number;
  bom:          AssemblyBomLine[];
  wiringGuide:  WiringStep[];
}

// ─── Audit Log (Phase 12) ────────────────────────────────────────────────────

export interface AuditLogEntry {
  id:          string;
  orgId:       string;
  siteId?:     string;
  actorId?:    string;
  actorEmail?: string;
  action:      string;
  resource?:   string;
  resourceId?: string;
  details?:    Record<string, unknown>;
  ipAddress?:  string;
  createdAt:   string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total:   number;
  limit:   number;
  offset:  number;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  issues?: unknown[];
}
