import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { DrawerTab, DeviceInstance } from '@werkstack/shared';
import { useNavStore } from '@/stores/navStore';
import { useTypesStore } from '@/stores/typesStore';
import { useSiteStore } from '@/stores/siteStore';
import { useGetZones } from '@/api/zones';
import { useGetRacks } from '@/api/racks';
import { useGetDevices, useUpdateDevice, useDeleteDevice, useUpdateDevicePosition } from '@/api/devices';
import { useGetDeviceTemplates, useGetPcieTemplates } from '@/api/templates';
import { ZoneSidebar } from './ZoneSidebar';
import { RackView } from './RackView';
import { DetailDrawer } from './DetailDrawer/DetailDrawer';
import { InfoTab } from './DetailDrawer/InfoTab';
import { StubTab } from './DetailDrawer/StubTab';
import styles from './RackViewHub.module.css';

export default function RackViewHub() {
  const siteId = useSiteStore(s => s.currentSite?.id ?? '');
  const navigate = useNavigate();
  const params = useParams<{ zoneId?: string; rackId?: string; deviceId?: string }>();

  // Nav store
  const selectedZoneId = useNavStore(s => s.selectedZoneId);
  const selectedRackId = useNavStore(s => s.selectedRackId);
  const selectedDeviceId = useNavStore(s => s.selectedDeviceId);
  const drawerOpen = useNavStore(s => s.drawerOpen);
  const drawerTab = useNavStore(s => s.drawerTab);

  // Queries
  const { data: zones = [] } = useGetZones(siteId);
  const { data: racks = [] } = useGetRacks(siteId);
  const { data: devices = [] } = useGetDevices(siteId);
  const { data: templates = [] } = useGetDeviceTemplates();
  const { data: pcieTemplates = [] } = useGetPcieTemplates();
  const deviceTypes = useTypesStore(s => s.deviceTypes);

  // Mutations
  const updateDevice = useUpdateDevice(siteId);
  const deleteDevice = useDeleteDevice(siteId);
  const updatePosition = useUpdateDevicePosition(siteId);

  // Face toggle
  const [face, setFace] = useState<'front' | 'rear'>('front');

  // Sync URL params → navStore on mount
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    if (zones.length === 0) return;

    const zoneId = params.zoneId ?? zones[0]?.id ?? null;
    if (zoneId) {
      useNavStore.getState().setZone(zoneId);
      const zoneRacks = racks.filter(r => r.zoneId === zoneId);
      const rackId = params.rackId ?? zoneRacks[0]?.id ?? null;
      if (rackId) useNavStore.getState().setRack(rackId);
      if (params.deviceId) {
        useNavStore.getState().selectDevice(params.deviceId);
      }
    }
    initialized.current = true;
  }, [zones, racks, params.zoneId, params.rackId, params.deviceId]);

  // Build URL from nav state
  const updateUrl = useCallback(() => {
    const state = useNavStore.getState();
    let path = '/infrastructure/rack';
    if (state.selectedZoneId) {
      path += `/${state.selectedZoneId}`;
      if (state.selectedRackId) {
        path += `/${state.selectedRackId}`;
        if (state.selectedDeviceId) {
          path += `/${state.selectedDeviceId}`;
        }
      }
    }
    navigate(path, { replace: true });
  }, [navigate]);

  // Handlers
  function handleZoneSelect(zoneId: string) {
    const store = useNavStore.getState();
    store.setZone(zoneId);
    // Auto-select first rack in zone
    const zoneRacks = racks.filter(r => r.zoneId === zoneId);
    if (zoneRacks.length > 0) store.setRack(zoneRacks[0].id);
    store.closeDrawer();
    updateUrl();
  }

  function handleRackSelect(rackId: string) {
    const store = useNavStore.getState();
    store.setRack(rackId);
    store.closeDrawer();
    updateUrl();
  }

  function handleDeviceClick(deviceId: string) {
    useNavStore.getState().selectDevice(deviceId);
    updateUrl();
  }

  function handleCloseDrawer() {
    useNavStore.getState().closeDrawer();
    updateUrl();
  }

  function handleTabChange(tab: DrawerTab) {
    useNavStore.getState().setDrawerTab(tab);
  }

  function handleDeviceSave(updated: Partial<DeviceInstance> & { id: string }) {
    updateDevice.mutate(updated);
  }

  function handleDeviceDelete(id: string) {
    deleteDevice.mutate(id);
    useNavStore.getState().closeDrawer();
    updateUrl();
  }

  function handleDevicePositionChange(deviceId: string, newRackU: number) {
    if (!selectedRackId) return;
    updatePosition.mutate({ id: deviceId, rackId: selectedRackId, rackU: newRackU, face });
  }

  // Current rack
  const currentRack = racks.find(r => r.id === selectedRackId);
  const selectedDevice = devices.find(d => d.id === selectedDeviceId);

  // Rack tabs for current zone
  const zoneRacks = racks.filter(r => r.zoneId === selectedZoneId);

  return (
    <div className={styles.hub}>
      <ZoneSidebar
        zones={zones}
        racks={racks}
        selectedZoneId={selectedZoneId}
        selectedRackId={selectedRackId}
        onZoneSelect={handleZoneSelect}
        onRackSelect={handleRackSelect}
      />

      <div className={styles.main}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.rackTabs}>
            {zoneRacks.map(r => (
              <button
                key={r.id}
                className={`${styles.rackTab}${r.id === selectedRackId ? ` ${styles.rackTabActive}` : ''}`}
                onClick={() => handleRackSelect(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
          <div className={styles.controls}>
            <div className={styles.faceToggle}>
              <button
                className={`${styles.faceBtn}${face === 'front' ? ` ${styles.faceBtnActive}` : ''}`}
                onClick={() => setFace('front')}
              >
                Front
              </button>
              <button
                className={`${styles.faceBtn}${face === 'rear' ? ` ${styles.faceBtnActive}` : ''}`}
                onClick={() => setFace('rear')}
              >
                Rear
              </button>
            </div>
          </div>
        </div>

        {/* Rack View */}
        <div className={styles.rackArea}>
          {currentRack ? (
            <RackView
              rack={currentRack}
              devices={devices}
              templates={templates}
              pcieTemplates={pcieTemplates}
              deviceTypes={deviceTypes}
              face={face}
              selectedDeviceId={selectedDeviceId}
              onDeviceClick={handleDeviceClick}
              onDevicePositionChange={handleDevicePositionChange}
            />
          ) : (
            <div className={styles.noRack}>
              {zones.length === 0
                ? 'No zones — create one in Settings'
                : racks.length === 0
                  ? 'No racks — create one in Settings'
                  : 'Select a rack from the sidebar'}
            </div>
          )}
        </div>
      </div>

      {/* Detail Drawer */}
      <DetailDrawer
        open={drawerOpen}
        activeTab={drawerTab}
        onTabChange={handleTabChange}
        onClose={handleCloseDrawer}
      >
        {selectedDevice && drawerTab === 'info' && (
          <InfoTab
            device={selectedDevice}
            deviceTypes={deviceTypes}
            templates={templates}
            racks={racks}
            zones={zones}
            onSave={handleDeviceSave}
            onDelete={handleDeviceDelete}
          />
        )}
        {selectedDevice && drawerTab !== 'info' && (
          <StubTab tab={drawerTab} />
        )}
      </DetailDrawer>
    </div>
  );
}
