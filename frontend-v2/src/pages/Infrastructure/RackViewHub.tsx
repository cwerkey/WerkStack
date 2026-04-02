import { useEffect, useCallback, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { DrawerTab, DeviceInstance, Connection, PlacedBlock, OsVm, Container } from '@werkstack/shared';
import { useNavStore } from '@/stores/navStore';
import { useTypesStore } from '@/stores/typesStore';
import { useSiteStore } from '@/stores/siteStore';
import { useGetZones } from '@/api/zones';
import { useGetRacks } from '@/api/racks';
import { useGetDevices, useUpdateDevice, useDeleteDevice, useUpdateDevicePosition } from '@/api/devices';
import { useGetDeviceTemplates, useGetPcieTemplates } from '@/api/templates';
import {
  useGetDeviceConnections,
  useGetSiteConnections,
  useCreateConnection,
  useUpdateConnection,
  useDeleteConnection,
  useDeleteConnectionsByDevice,
} from '@/api/connections';
import { useGetModules, useInstallModule } from '@/api/modules';
import {
  useGetSiteDrives,
  useGetDeviceExternalDrives,
  useGetSitePools,
  useCreatePool,
  useGetSiteShares,
} from '@/api/storage';
import {
  useGetOsHosts,
  useGetOsVms,
  useCreateOsVm,
  useGetOsApps,
} from '@/api/os-stack';
import { useGetDeviceContainers } from '@/api/containers';
import { useGetSubnets, useGetSiteIps } from '@/api/network';
import { ZoneSidebar } from './ZoneSidebar';
import { RackView } from './RackView';
import { DetailDrawer } from './DetailDrawer/DetailDrawer';
import { InfoTab } from './DetailDrawer/InfoTab';
import { PortsTab } from './DetailDrawer/PortsTab';
import { StorageTab } from './DetailDrawer/StorageTab';
import { OsStackTab } from './DetailDrawer/OsStackTab';
import { NetworkTab } from './DetailDrawer/NetworkTab';
import { IpAssignmentModal } from './DetailDrawer/IpAssignmentModal';
import { StubTab } from './DetailDrawer/StubTab';
import { DeployWizard } from '@/wizards/DeployWizard';
import { ConnectionWizard } from '@/wizards/ConnectionWizard';
import { ConnectionEditModal } from '@/wizards/ConnectionEditModal';
import { PoolWizard } from '@/wizards/PoolWizard';
import { ExternalStorageWizard } from '@/wizards/ExternalStorageWizard';
import { VmWizard } from '@/wizards/VmWizard';
import { DockerComposeImport } from '@/wizards/DockerComposeImport';
import { RackPickerModal } from './RackPickerModal';
import { ShelfDetailModal } from './ShelfDetailModal';
import { ExportDropdown } from '@/components/ExportDropdown';
import { exportToPNG, exportRackToPDF } from '@/utils/exportUtils';
import QueryErrorState from '@/components/QueryErrorState';
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

  // Types
  const deviceTypes = useTypesStore(s => s.deviceTypes);
  const cableTypes = useTypesStore(s => s.cableTypes);

  // Queries
  const { data: zones = [] } = useGetZones(siteId);
  const { data: racks = [] } = useGetRacks(siteId);
  const devicesQ = useGetDevices(siteId);
  const { data: devices = [] } = devicesQ;
  const { data: templates = [] } = useGetDeviceTemplates();
  const { data: pcieTemplates = [] } = useGetPcieTemplates();

  // Connections — per-device for the drawer, site-wide for the wizard
  const { data: selectedDeviceConnections = [] } = useGetDeviceConnections(
    siteId,
    selectedDeviceId ?? '',
  );
  const { data: siteConnections = [] } = useGetSiteConnections(siteId);

  // Modules for selected device
  const { data: selectedDeviceModules = [] } = useGetModules(
    siteId,
    selectedDeviceId ?? '',
  );

  // Storage data
  const { data: siteDrives = [] } = useGetSiteDrives(siteId);
  const { data: externalDrives = [] } = useGetDeviceExternalDrives(siteId, selectedDeviceId ?? '');
  const { data: sitePools = [] } = useGetSitePools(siteId);
  const { data: siteShares = [] } = useGetSiteShares(siteId);

  // OS stack data
  const { data: osHosts = [] } = useGetOsHosts(siteId);
  const { data: osVms = [] } = useGetOsVms(siteId);
  const { data: osApps = [] } = useGetOsApps(siteId);
  const { data: osContainers = [] } = useGetDeviceContainers(siteId, selectedDeviceId ?? '');

  // Network data
  const { data: subnets = [] } = useGetSubnets(siteId);
  const { data: siteIps = [] } = useGetSiteIps(siteId);

  // Mutations
  const updateDevice = useUpdateDevice(siteId);
  const deleteDevice = useDeleteDevice(siteId);
  const updatePosition = useUpdateDevicePosition(siteId);
  const deleteConnections = useDeleteConnectionsByDevice(siteId);
  const createConnection = useCreateConnection(siteId);
  const updateConnection = useUpdateConnection(siteId);
  const deleteConnection = useDeleteConnection(siteId);
  const createPool = useCreatePool(siteId);
  const installModule = useInstallModule(siteId, selectedDeviceId ?? '');
  const createOsVm = useCreateOsVm(siteId);

  // Face toggle
  const [face, setFace] = useState<'front' | 'rear'>('front');
  const [showDeviceRear, setShowDeviceRear] = useState(false);
  const templateFace: 'front' | 'rear' = showDeviceRear ? 'rear' : 'front';

  // Deploy wizard state
  const [deployWizardOpen, setDeployWizardOpen] = useState(false);
  const [deployTargetU, setDeployTargetU] = useState<number | undefined>();

  // Shelf modal state
  const [shelfModalDeviceId, setShelfModalDeviceId] = useState<string | null>(null);

  // Connection wizard state
  const [connWizardOpen, setConnWizardOpen] = useState(false);
  const [connWizardSrcBlock, setConnWizardSrcBlock] = useState<PlacedBlock | null>(null);

  // Connection edit modal state
  const [editingConn, setEditingConn] = useState<Connection | null>(null);

  // Pool wizard state
  const [poolWizardOpen, setPoolWizardOpen] = useState(false);

  // External storage wizard state
  const [extStorageWizardOpen, setExtStorageWizardOpen] = useState(false);

  // Rack picker state
  const [rackPickerOpen, setRackPickerOpen] = useState(false);

  // VM wizard state
  const [vmWizardOpen, setVmWizardOpen] = useState(false);
  const [vmWizardHostId, setVmWizardHostId] = useState('');

  // Docker Compose import state
  const [composeImportOpen, setComposeImportOpen] = useState(false);

  // IP assignment modal state
  const [ipAssignOpen, setIpAssignOpen] = useState(false);

  // Rack area ref for export
  const rackAreaRef = useRef<HTMLDivElement>(null);

  // Export handlers
  const currentSite = useSiteStore(s => s.currentSite);

  async function handleExportPng() {
    if (!rackAreaRef.current) return;
    const rackName = racks.find(r => r.id === selectedRackId)?.name ?? 'rack';
    await exportToPNG(rackAreaRef.current, `${rackName}.png`);
  }

  async function handleExportPdf() {
    if (!rackAreaRef.current) return;
    const rack = racks.find(r => r.id === selectedRackId);
    const siteName = currentSite?.name ?? 'Site';
    const rackName = rack?.name ?? 'Rack';
    const legend = devices
      .filter(d => d.rackId === selectedRackId)
      .map(d => ({
        name: d.name,
        type: d.typeId ?? '',
        uPos: d.rackU != null ? `U${d.rackU}` : '—',
        ip: d.ip ?? '',
      }));
    await exportRackToPDF({
      title: `${siteName} — ${rackName}`,
      rackElement: rackAreaRef.current,
      legend,
    });
  }

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

  function handleDeviceDrop(deviceId: string, rackU: number) {
    if (!selectedRackId) return;
    updatePosition.mutate({ id: deviceId, rackId: selectedRackId, rackU, face });
  }

  function handleEmptySlotDblClick(rackU: number) {
    setDeployTargetU(rackU);
    setDeployWizardOpen(true);
  }

  function handleMoveToUnassigned() {
    const device = devices.find(d => d.id === selectedDeviceId);
    if (!device) return;
    deleteConnections.mutate(device.id, {
      onSettled: () => {
        updateDevice.mutate({
          id: device.id,
          rackId: undefined,
          rackU: undefined,
          face: undefined,
        });
        useNavStore.getState().closeDrawer();
        updateUrl();
      },
    });
  }

  function handleMoveToRack(rackId: string, rackU: number, newFace: 'front' | 'rear') {
    if (!selectedDeviceId) return;
    updatePosition.mutate({ id: selectedDeviceId, rackId, rackU, face: newFace });
    setRackPickerOpen(false);
  }

  // Connection handlers
  function handleAddConnection(block: PlacedBlock) {
    setConnWizardSrcBlock(block);
    setConnWizardOpen(true);
  }

  function handleEditConnection(conn: Connection) {
    setEditingConn(conn);
  }

  function handleDeleteConnection(connId: string) {
    const conn = siteConnections.find(c => c.id === connId)
      ?? selectedDeviceConnections.find(c => c.id === connId);
    deleteConnection.mutate({
      connId,
      srcDeviceId: conn?.srcDeviceId,
      dstDeviceId: conn?.dstDeviceId ?? undefined,
    });
  }

  function handleConnectionWizardSubmit(payload: Omit<Connection, 'id' | 'orgId' | 'siteId' | 'createdAt'>) {
    createConnection.mutate(payload, {
      onSuccess: () => {
        setConnWizardOpen(false);
        setConnWizardSrcBlock(null);
      },
    });
  }

  function handleEditConnectionSave(updated: Connection) {
    updateConnection.mutate({
      id: updated.id,
      srcDeviceId: updated.srcDeviceId,
      srcPort: updated.srcPort,
      srcBlockId: updated.srcBlockId,
      srcBlockType: updated.srcBlockType,
      dstDeviceId: updated.dstDeviceId,
      dstPort: updated.dstPort,
      dstBlockId: updated.dstBlockId,
      dstBlockType: updated.dstBlockType,
      externalLabel: updated.externalLabel,
      cableTypeId: updated.cableTypeId,
      label: updated.label,
      notes: updated.notes,
    }, {
      onSuccess: () => setEditingConn(null),
    });
  }

  function handleEditConnectionDelete(connId: string) {
    if (!editingConn) return;
    deleteConnection.mutate({
      connId,
      srcDeviceId: editingConn.srcDeviceId,
      dstDeviceId: editingConn.dstDeviceId ?? undefined,
    }, {
      onSuccess: () => setEditingConn(null),
    });
  }

  // Current rack
  const currentRack = racks.find(r => r.id === selectedRackId);
  const selectedDevice = devices.find(d => d.id === selectedDeviceId);
  const selectedTemplate = templates.find(t => t.id === selectedDevice?.templateId);

  // Rack tabs for current zone
  const zoneRacks = racks.filter(r => r.zoneId === selectedZoneId);

  // Connections passed to RackView
  const rackConnections = selectedDeviceId ? selectedDeviceConnections : [];

  // Unracked devices (site-wide)
  const unrackedDevices = devices.filter(d => !d.rackId && !d.shelfDeviceId);

  return (
    <div className={styles.hub}>
      {devicesQ.error && <QueryErrorState error={devicesQ.error} onRetry={() => devicesQ.refetch()} />}
      <ZoneSidebar
        zones={zones}
        racks={racks}
        devices={devices}
        templates={templates}
        selectedZoneId={selectedZoneId}
        selectedRackId={selectedRackId}
        onZoneSelect={handleZoneSelect}
        onRackSelect={handleRackSelect}
        onDeviceClick={handleDeviceClick}
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
            <label
              className={styles.deviceRearLabel}
              onClick={() => setShowDeviceRear(v => !v)}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: `1px solid ${showDeviceRear ? 'var(--color-accent, #c47c5a)' : 'var(--color-border, #2a3038)'}`,
                  background: showDeviceRear ? 'var(--color-accent, #c47c5a)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {showDeviceRear && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5L4.5 7.5L8 3" stroke="#0c0d0e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              device rear
            </label>
            <ExportDropdown
              disabled={!currentRack}
              options={[
                { label: 'Export PNG', onSelect: handleExportPng },
                { label: 'Export PDF', onSelect: handleExportPdf },
              ]}
            />
            <button
              onClick={() => setDeployWizardOpen(true)}
              style={{
                background: '#c47c5a',
                border: 'none',
                borderRadius: 4,
                padding: '5px 14px',
                fontFamily: 'Inter,system-ui,sans-serif',
                fontSize: 12,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              + Deploy Device
            </button>
          </div>
        </div>

        {/* Rack View + Unracked Panel */}
        <div className={styles.rackArea} ref={rackAreaRef}>
          {currentRack ? (
            <RackView
              rack={currentRack}
              devices={devices}
              templates={templates}
              pcieTemplates={pcieTemplates}
              deviceTypes={deviceTypes}
              modules={selectedDeviceModules}
              face={face}
              templateFace={templateFace}
              connections={rackConnections}
              selectedDeviceId={selectedDeviceId}
              onDeviceClick={handleDeviceClick}
              onDevicePositionChange={handleDevicePositionChange}
              onDeviceDrop={handleDeviceDrop}
              onEmptySlotDblClick={handleEmptySlotDblClick}
              onShelfOpen={setShelfModalDeviceId}
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

          {/* Unracked panel */}
          <div className={styles.unrackedPanel}>
            <div className={styles.unrackedPanelHeader}>
              UNRACKED ({unrackedDevices.length})
            </div>
            {unrackedDevices.length === 0 ? (
              <div className={styles.unrackedPanelEmpty}>all devices are racked</div>
            ) : (
              <div className={styles.unrackedPanelList}>
                {unrackedDevices.map(device => {
                  const tmpl = templates.find(t => t.id === device.templateId);
                  const uH = device.uHeight ?? tmpl?.uHeight ?? 1;
                  return (
                    <div
                      key={device.id}
                      className={styles.unrackedPanelDevice}
                      draggable
                      onClick={() => handleDeviceClick(device.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('werkstack/device-id', device.id);
                        e.dataTransfer.setData('werkstack/device-uheight', String(uH));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      <span className={styles.unrackedPanelDeviceName}>{device.name}</span>
                      <span style={{
                        background: '#2a3038', borderRadius: 3, padding: '1px 6px',
                        fontSize: 9, color: '#8a9299', fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {uH}U
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
            onMoveToRack={() => setRackPickerOpen(true)}
            onMoveToUnassigned={handleMoveToUnassigned}
          />
        )}
        {selectedDevice && drawerTab === 'ports' && (
          <PortsTab
            device={selectedDevice}
            template={selectedTemplate}
            modules={selectedDeviceModules}
            pcieTemplates={pcieTemplates}
            connections={selectedDeviceConnections}
            allDevices={devices}
            cableTypes={cableTypes}
            onAddConnection={handleAddConnection}
            onEditConnection={handleEditConnection}
            onDeleteConnection={handleDeleteConnection}
          />
        )}
        {selectedDevice && drawerTab === 'storage' && (
          <StorageTab
            device={selectedDevice}
            template={selectedTemplate}
            drives={siteDrives}
            externalDrives={externalDrives}
            pools={sitePools}
            shares={siteShares}
            onCreatePool={() => setPoolWizardOpen(true)}
            onConnectExternal={() => setExtStorageWizardOpen(true)}
          />
        )}
        {selectedDevice && drawerTab === 'os' && (
          <OsStackTab
            device={selectedDevice}
            hosts={osHosts}
            vms={osVms}
            apps={osApps}
            containers={osContainers}
            onAddVm={(hostId) => {
              setVmWizardHostId(hostId);
              setVmWizardOpen(true);
            }}
            onAddContainer={() => {/* TODO: container editor */}}
            onImportCompose={() => setComposeImportOpen(true)}
          />
        )}
        {selectedDevice && drawerTab === 'network' && (
          <NetworkTab
            device={selectedDevice}
            subnets={subnets}
            allIpAssignments={siteIps}
            connections={selectedDeviceConnections}
            hosts={osHosts}
            vms={osVms}
            apps={osApps}
            containers={osContainers}
            onAssignIp={() => setIpAssignOpen(true)}
          />
        )}
        {selectedDevice && drawerTab === 'guides' && (
          <StubTab tab={drawerTab} />
        )}
      </DetailDrawer>

      {/* Deploy Wizard */}
      {/* Shelf Detail Modal */}
      {shelfModalDeviceId && (
        <ShelfDetailModal
          shelf={devices.find(d => d.id === shelfModalDeviceId)!}
          siteId={siteId}
          devices={devices}
          templates={templates}
          onClose={() => setShelfModalDeviceId(null)}
          onDeviceClick={handleDeviceClick}
        />
      )}

      <DeployWizard
        open={deployWizardOpen}
        siteId={siteId}
        rackId={selectedRackId ?? undefined}
        rackU={deployTargetU}
        devices={devices}
        zones={zones}
        racks={racks}
        templates={templates}
        onClose={() => {
          setDeployWizardOpen(false);
          setDeployTargetU(undefined);
        }}
        onDeployed={(deviceId, rackId, zoneId) => {
          setDeployWizardOpen(false);
          setDeployTargetU(undefined);
          if (zoneId && rackId) {
            navigate(`/infrastructure/rack/${zoneId}/${rackId}/${deviceId}`);
          }
        }}
      />

      {/* Connection Wizard */}
      {connWizardOpen && connWizardSrcBlock && selectedDevice && (
        <ConnectionWizard
          open={connWizardOpen}
          siteId={siteId}
          srcDevice={selectedDevice}
          srcBlock={connWizardSrcBlock}
          devices={devices}
          templates={templates}
          modules={selectedDeviceModules}
          pcieTemplates={pcieTemplates}
          cableTypes={cableTypes}
          allConnections={siteConnections}
          onSubmit={handleConnectionWizardSubmit}
          onClose={() => {
            setConnWizardOpen(false);
            setConnWizardSrcBlock(null);
          }}
        />
      )}

      {/* Connection Edit Modal */}
      <ConnectionEditModal
        open={editingConn !== null}
        connection={editingConn}
        devices={devices}
        cableTypes={cableTypes}
        onSave={handleEditConnectionSave}
        onDelete={handleEditConnectionDelete}
        onClose={() => setEditingConn(null)}
      />

      {/* Pool Wizard */}
      {poolWizardOpen && selectedDevice && (
        <PoolWizard
          open={poolWizardOpen}
          deviceId={selectedDevice.id}
          localDrives={siteDrives}
          externalDrives={externalDrives}
          onSubmit={payload => {
            createPool.mutate(payload, {
              onSuccess: () => setPoolWizardOpen(false),
            });
          }}
          onConnectExternal={() => {
            setPoolWizardOpen(false);
            setExtStorageWizardOpen(true);
          }}
          onClose={() => setPoolWizardOpen(false)}
        />
      )}

      {/* External Storage Wizard */}
      {extStorageWizardOpen && selectedDevice && (
        <ExternalStorageWizard
          open={extStorageWizardOpen}
          device={selectedDevice}
          template={selectedTemplate}
          modules={selectedDeviceModules}
          pcieTemplates={pcieTemplates}
          cableTypes={cableTypes}
          allDevices={devices}
          allTemplates={templates}
          allConnections={siteConnections}
          onInstallModule={body => installModule.mutate(body)}
          onCreateConnection={payload => {
            createConnection.mutate(payload, {
              onSuccess: () => setExtStorageWizardOpen(false),
            });
          }}
          onClose={() => setExtStorageWizardOpen(false)}
        />
      )}

      {/* VM Wizard */}
      {vmWizardOpen && selectedDevice && (() => {
        const host = osHosts.find(h => h.id === vmWizardHostId);
        const hostOsName = host
          ? `${host.hostOs}${host.osVersion ? ` ${host.osVersion}` : ''}`
          : 'Unknown';
        return (
          <VmWizard
            open={vmWizardOpen}
            hostId={vmWizardHostId}
            hostOsName={hostOsName}
            siteId={siteId}
            onSubmit={(payload) => {
              createOsVm.mutate(payload, {
                onSuccess: () => {
                  setVmWizardOpen(false);
                  setVmWizardHostId('');
                },
              });
            }}
            onClose={() => {
              setVmWizardOpen(false);
              setVmWizardHostId('');
            }}
          />
        );
      })()}

      {/* Docker Compose Import */}
      {composeImportOpen && selectedDevice && (() => {
        const host = osHosts.find(h => h.deviceId === selectedDevice.id);
        return (
          <DockerComposeImport
            open={composeImportOpen}
            siteId={siteId}
            hostId={host?.id}
            onClose={() => setComposeImportOpen(false)}
            onImported={() => setComposeImportOpen(false)}
          />
        );
      })()}

      {/* IP Assignment Modal */}
      {ipAssignOpen && selectedDevice && (
        <IpAssignmentModal
          open={ipAssignOpen}
          siteId={siteId}
          deviceId={selectedDevice.id}
          subnets={subnets}
          allIpAssignments={siteIps}
          onClose={() => setIpAssignOpen(false)}
          onAssigned={() => setIpAssignOpen(false)}
        />
      )}

      {/* Rack Picker Modal */}
      <RackPickerModal
        open={rackPickerOpen}
        zones={zones}
        racks={racks}
        currentRackId={selectedDevice?.rackId}
        onConfirm={handleMoveToRack}
        onClose={() => setRackPickerOpen(false)}
      />
    </div>
  );
}
