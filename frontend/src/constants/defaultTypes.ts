// Re-export from shared so screens can import from a single local path.
// Use these as fallback values when useTypesStore.isLoaded is false.
export {
  DEFAULT_DEVICE_TYPES,
  DEFAULT_PCIE_TYPES,
  DEFAULT_CABLE_TYPES,
  DEFAULT_VM_TYPES,
  DEFAULT_APP_TYPES,
  DEFAULT_TICKET_CATEGORIES,
} from '@werkstack/shared';
