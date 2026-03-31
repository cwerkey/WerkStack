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
