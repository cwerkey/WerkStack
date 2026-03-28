// ─── Built-in Type Seed Data ──────────────────────────────────────────────────
// These arrays mirror the seed rows in migration 002_types.sql.
// Used as fallback values in useTypesStore before the API responds,
// and as reference for ID prefix conventions across the app.

import type {
  DeviceType,
  PcieType,
  CableType,
  VmType,
  AppType,
  TicketCategory,
} from '../types';

export const DEFAULT_DEVICE_TYPES: DeviceType[] = [
  { id: 'dt-server',      orgId: null, name: 'Server',        color: '#7090b8', isBuiltin: true, createdAt: '' },
  { id: 'dt-switch',      orgId: null, name: 'Network Switch', color: '#8ab89e', isBuiltin: true, createdAt: '' },
  { id: 'dt-firewall',    orgId: null, name: 'Firewall',       color: '#c07070', isBuiltin: true, createdAt: '' },
  { id: 'dt-nas',         orgId: null, name: 'NAS',            color: '#aa8abb', isBuiltin: true, createdAt: '' },
  { id: 'dt-pdu',         orgId: null, name: 'PDU',            color: '#b89870', isBuiltin: true, createdAt: '' },
  { id: 'dt-ups',         orgId: null, name: 'UPS',            color: '#8ab89e', isBuiltin: true, createdAt: '' },
  { id: 'dt-patch-panel', orgId: null, name: 'Patch Panel',    color: '#7090b8', isBuiltin: true, createdAt: '' },
  { id: 'dt-kvm',         orgId: null, name: 'KVM Switch',     color: '#8a9299', isBuiltin: true, createdAt: '' },
  { id: 'dt-shelf',       orgId: null, name: 'Shelf',          color: '#8a9299', isBuiltin: true, createdAt: '' },
  { id: 'dt-router',      orgId: null, name: 'Router',         color: '#b89870', isBuiltin: true, createdAt: '' },
  { id: 'dt-other',       orgId: null, name: 'Other',          color: '#4e5560', isBuiltin: true, createdAt: '' },
];

export const DEFAULT_PCIE_TYPES: PcieType[] = [
  { id: 'pcie-nic',     orgId: null, name: 'NIC',          color: '#7090b8', isBuiltin: true, createdAt: '' },
  { id: 'pcie-hba',     orgId: null, name: 'HBA',          color: '#aa8abb', isBuiltin: true, createdAt: '' },
  { id: 'pcie-gpu',     orgId: null, name: 'GPU',          color: '#c07070', isBuiltin: true, createdAt: '' },
  { id: 'pcie-capture', orgId: null, name: 'Capture Card', color: '#8ab89e', isBuiltin: true, createdAt: '' },
  { id: 'pcie-other',   orgId: null, name: 'Other',        color: '#4e5560', isBuiltin: true, createdAt: '' },
];

export const DEFAULT_CABLE_TYPES: CableType[] = [
  { id: 'cable-cat5e',    orgId: null, name: 'CAT5e',          color: '#8ab89e', isBuiltin: true, createdAt: '' },
  { id: 'cable-cat6',     orgId: null, name: 'CAT6',           color: '#7090b8', isBuiltin: true, createdAt: '' },
  { id: 'cable-cat6a',    orgId: null, name: 'CAT6A',          color: '#8a9299', isBuiltin: true, createdAt: '' },
  { id: 'cable-fiber-sm', orgId: null, name: 'Fiber (SM)',      color: '#c47c5a', isBuiltin: true, createdAt: '' },
  { id: 'cable-fiber-mm', orgId: null, name: 'Fiber (MM)',      color: '#b89870', isBuiltin: true, createdAt: '' },
  { id: 'cable-dac',      orgId: null, name: 'DAC',             color: '#aa8abb', isBuiltin: true, createdAt: '' },
  { id: 'cable-aoc',      orgId: null, name: 'AOC',             color: '#c07070', isBuiltin: true, createdAt: '' },
  { id: 'cable-power',    orgId: null, name: 'Power (C13/C14)', color: '#b89870', isBuiltin: true, createdAt: '' },
  { id: 'cable-usb',      orgId: null, name: 'USB',             color: '#8a9299', isBuiltin: true, createdAt: '' },
  { id: 'cable-other',    orgId: null, name: 'Other',           color: '#4e5560', isBuiltin: true, createdAt: '' },
];

export const DEFAULT_VM_TYPES: VmType[] = [
  { id: 'vt-vm',     orgId: null, name: 'Virtual Machine',   color: '#7090b8', isBuiltin: true, createdAt: '' },
  { id: 'vt-lxc',    orgId: null, name: 'LXC Container',     color: '#8ab89e', isBuiltin: true, createdAt: '' },
  { id: 'vt-docker', orgId: null, name: 'Docker Container',  color: '#aa8abb', isBuiltin: true, createdAt: '' },
  { id: 'vt-other',  orgId: null, name: 'Other',             color: '#4e5560', isBuiltin: true, createdAt: '' },
];

export const DEFAULT_APP_TYPES: AppType[] = [
  { id: 'at-web',        orgId: null, name: 'Web Server',      color: '#7090b8', isBuiltin: true, createdAt: '' },
  { id: 'at-proxy',      orgId: null, name: 'Reverse Proxy',   color: '#8ab89e', isBuiltin: true, createdAt: '' },
  { id: 'at-monitoring', orgId: null, name: 'Monitoring',      color: '#c07070', isBuiltin: true, createdAt: '' },
  { id: 'at-database',   orgId: null, name: 'Database',        color: '#aa8abb', isBuiltin: true, createdAt: '' },
  { id: 'at-storage',    orgId: null, name: 'Storage Service', color: '#b89870', isBuiltin: true, createdAt: '' },
  { id: 'at-media',      orgId: null, name: 'Media Server',    color: '#c47c5a', isBuiltin: true, createdAt: '' },
  { id: 'at-security',   orgId: null, name: 'Security',        color: '#c07070', isBuiltin: true, createdAt: '' },
  { id: 'at-network',    orgId: null, name: 'Network Service', color: '#8a9299', isBuiltin: true, createdAt: '' },
  { id: 'at-other',      orgId: null, name: 'Other',           color: '#4e5560', isBuiltin: true, createdAt: '' },
];

export const DEFAULT_TICKET_CATEGORIES: TicketCategory[] = [
  { id: 'tcat-hardware',    orgId: null, name: 'Hardware Failure',   color: '#c07070', isBuiltin: true, createdAt: '' },
  { id: 'tcat-maintenance', orgId: null, name: 'Maintenance',        color: '#b89870', isBuiltin: true, createdAt: '' },
  { id: 'tcat-performance', orgId: null, name: 'Performance Issue',  color: '#8ab89e', isBuiltin: true, createdAt: '' },
  { id: 'tcat-config',      orgId: null, name: 'Configuration',      color: '#7090b8', isBuiltin: true, createdAt: '' },
  { id: 'tcat-security',    orgId: null, name: 'Security',           color: '#c07070', isBuiltin: true, createdAt: '' },
  { id: 'tcat-network',     orgId: null, name: 'Network Issue',      color: '#8a9299', isBuiltin: true, createdAt: '' },
  { id: 'tcat-other',       orgId: null, name: 'Other',              color: '#4e5560', isBuiltin: true, createdAt: '' },
];
