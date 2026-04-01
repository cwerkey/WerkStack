import { useState, useEffect, useMemo } from 'react';
import type { Subnet, IpAssignment } from '@werkstack/shared';
import { useCreateIpAssignment, useGetNextAvailableIp } from '@/api/network';
import styles from './IpAssignmentModal.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface IpAssignmentModalProps {
  open:              boolean;
  siteId:            string;
  deviceId:          string;
  subnets:           Subnet[];
  allIpAssignments:  IpAssignment[];
  onClose:           () => void;
  onAssigned:        () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const INTERFACE_OPTIONS = [
  'management',
  'eth0',
  'eth1',
  'bond0',
  'vlan-tagged',
  'ilo/ipmi',
  'storage',
  'other',
];

const TYPE_OPTIONS = [
  { value: 'static',         label: 'Static' },
  { value: 'dhcp-reserved',  label: 'DHCP Reserved' },
  { value: 'dhcp-dynamic',   label: 'DHCP Dynamic' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Attempt to match an IP to a subnet CIDR (simple prefix-based check). */
function detectSubnet(ip: string, subnets: Subnet[]): Subnet | undefined {
  if (!ip) return undefined;
  const parts = ip.split('.');
  if (parts.length !== 4) return undefined;

  for (const subnet of subnets) {
    const [cidrNet, cidrBitsStr] = subnet.cidr.split('/');
    const cidrBits = parseInt(cidrBitsStr, 10);
    if (isNaN(cidrBits)) continue;

    const cidrParts = cidrNet.split('.');
    if (cidrParts.length !== 4) continue;

    // Convert to 32-bit integers
    const ipNum = parts.reduce((acc, p) => (acc << 8) + parseInt(p, 10), 0) >>> 0;
    const cidrNum = cidrParts.reduce((acc, p) => (acc << 8) + parseInt(p, 10), 0) >>> 0;
    const mask = cidrBits === 0 ? 0 : (~0 << (32 - cidrBits)) >>> 0;

    if ((ipNum & mask) === (cidrNum & mask)) {
      return subnet;
    }
  }
  return undefined;
}

/** Check if an IP already exists in the given subnet's assignments. */
function checkCollision(
  ip: string,
  subnetId: string,
  allIpAssignments: IpAssignment[],
): IpAssignment | undefined {
  return allIpAssignments.find(a => a.subnetId === subnetId && a.ip === ip);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function IpAssignmentModal({
  open,
  siteId,
  deviceId,
  subnets,
  allIpAssignments,
  onClose,
  onAssigned,
}: IpAssignmentModalProps) {
  // Form state
  const [interfaceLabel, setInterfaceLabel] = useState('management');
  const [ip, setIp] = useState('');
  const [subnetId, setSubnetId] = useState('');
  const [assignmentType, setAssignmentType] = useState('static');
  const [hostname, setHostname] = useState('');
  const [error, setError] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setInterfaceLabel('management');
      setIp('');
      setSubnetId(subnets.length > 0 ? subnets[0].id : '');
      setAssignmentType('static');
      setHostname('');
      setError('');
    }
  }, [open, subnets]);

  // Auto-detect subnet when IP changes
  useEffect(() => {
    if (!ip) return;
    const detected = detectSubnet(ip, subnets);
    if (detected) {
      setSubnetId(detected.id);
    }
  }, [ip, subnets]);

  // Derived: selected subnet
  const selectedSubnet = useMemo(
    () => subnets.find(s => s.id === subnetId),
    [subnets, subnetId],
  );

  // Collision detection
  const collision = useMemo(() => {
    if (!ip || !subnetId) return undefined;
    return checkCollision(ip, subnetId, allIpAssignments);
  }, [ip, subnetId, allIpAssignments]);

  // Next available IP query (only when a subnet is selected)
  const nextIpQuery = useGetNextAvailableIp(siteId, subnetId);

  // Create mutation
  const createIp = useCreateIpAssignment(siteId, subnetId);

  function handleNextAvailable() {
    if (nextIpQuery.data?.ip) {
      setIp(nextIpQuery.data.ip);
    }
  }

  async function handleSubmit() {
    if (!ip.trim()) {
      setError('IP address is required');
      return;
    }
    if (!subnetId) {
      setError('Please select a subnet');
      return;
    }

    // Build label string combining interface + type + hostname
    const labelParts: string[] = [interfaceLabel];
    if (assignmentType !== 'static') {
      labelParts.push(`[${assignmentType}]`);
    }
    if (hostname.trim()) {
      labelParts.push(hostname.trim());
    }
    const label = labelParts.join(' ');

    try {
      await createIp.mutateAsync({
        subnetId,
        ip: ip.trim(),
        deviceId,
        label,
      });
      onAssigned();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign IP';
      setError(msg);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.title}>Assign IP Address</span>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Interface */}
          <div className={styles.field}>
            <label className={styles.label}>Interface</label>
            <select
              className={styles.select}
              value={interfaceLabel}
              onChange={e => setInterfaceLabel(e.target.value)}
            >
              {INTERFACE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Subnet */}
          <div className={styles.field}>
            <label className={styles.label}>Subnet</label>
            <select
              className={styles.select}
              value={subnetId}
              onChange={e => setSubnetId(e.target.value)}
            >
              {subnets.length === 0 && (
                <option value="">No subnets available</option>
              )}
              {subnets.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.cidr}){s.vlan != null ? ` — VLAN ${s.vlan}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* IP Address */}
          <div className={styles.field}>
            <label className={styles.label}>IP Address</label>
            <div className={styles.ipInputRow}>
              <input
                className={styles.inputMono}
                type="text"
                placeholder="e.g. 10.0.1.50"
                value={ip}
                onChange={e => { setIp(e.target.value); setError(''); }}
              />
              <button
                className={styles.nextBtn}
                onClick={handleNextAvailable}
                disabled={!subnetId || nextIpQuery.isLoading}
                title="Fill with next available IP in subnet"
              >
                Next Available
              </button>
            </div>
          </div>

          {/* Collision warning */}
          {collision && (
            <div className={styles.collision}>
              This IP is already assigned
              {collision.deviceId ? ` to device ${collision.deviceId}` : ''}
              {collision.label ? ` (${collision.label})` : ''}
            </div>
          )}

          {/* VLAN (read-only) */}
          <div className={styles.field}>
            <label className={styles.label}>VLAN</label>
            <span className={styles.readOnly}>
              {selectedSubnet?.vlan != null ? `VLAN ${selectedSubnet.vlan}` : 'None'}
            </span>
          </div>

          {/* Type */}
          <div className={styles.field}>
            <label className={styles.label}>Type</label>
            <select
              className={styles.select}
              value={assignmentType}
              onChange={e => setAssignmentType(e.target.value)}
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Hostname */}
          <div className={styles.field}>
            <label className={styles.label}>Hostname (optional)</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g. nas01.local"
              value={hostname}
              onChange={e => setHostname(e.target.value)}
            />
          </div>

          {/* Error */}
          {error && <div className={styles.error}>{error}</div>}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={createIp.isPending || !ip.trim() || !subnetId}
          >
            {createIp.isPending ? 'Assigning...' : 'Assign IP'}
          </button>
        </div>
      </div>
    </div>
  );
}
