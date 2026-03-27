// DeviceOverlay — fallback renderer info for devices that have no template.
// Returns a simple colored block label. The actual rendering is handled inline
// in RackViewScreen to avoid building parallel rendering logic (invariant #2).
// This module just provides the helper to compute display info.

import type { DeviceInstance, DeviceType } from '@werkstack/shared';

export interface DeviceDisplayInfo {
  name:   string;
  color:  string;
  uHeight: number;
}

export function getDeviceDisplayInfo(
  device: DeviceInstance,
  deviceTypes: DeviceType[],
): DeviceDisplayInfo {
  const dt = deviceTypes.find(t => t.id === device.typeId);
  return {
    name:    device.name,
    color:   dt?.color ?? '#4e5560',
    uHeight: device.uHeight ?? 1,
  };
}
