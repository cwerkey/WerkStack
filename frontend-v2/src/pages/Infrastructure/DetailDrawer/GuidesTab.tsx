import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetGuidesByEntity,
  useGetGuides,
  type GuideByEntity,
} from '@/api/guides';
import { api } from '@/utils/api';
import styles from './GuidesTab.module.css';

interface GuidesTabProps {
  siteId: string;
  deviceId: string;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function GuidesTab({ siteId, deviceId }: GuidesTabProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const { data: linked = [], isLoading } = useGetGuidesByEntity(siteId, 'device', deviceId);
  const { data: allGuides = [] } = useGetGuides(siteId);

  const linkedIds = new Set(linked.map((g: GuideByEntity) => g.id));

  const filteredGuides = allGuides.filter(g => {
    const q = search.toLowerCase();
    return (
      g.title.toLowerCase().includes(q) ||
      (g.manualName ?? '').toLowerCase().includes(q)
    );
  });

  function handleOpenPicker() {
    setSearch('');
    setPickerOpen(true);
  }

  function handleCreateGuide() {
    navigate(`/sites/${siteId}/guides?linkDevice=${deviceId}`);
  }

  async function handlePickerItemClick(guideId: string) {
    if (linkedIds.has(guideId) || linkingId) return;
    setLinkingId(guideId);
    try {
      await api.post(`/api/sites/${siteId}/guides/${guideId}/links`, {
        entityType: 'device',
        entityId: deviceId,
      });
      qc.invalidateQueries({ queryKey: ['guides-by-entity', siteId, 'device', deviceId] });
      qc.invalidateQueries({ queryKey: ['guides', siteId] });
      setPickerOpen(false);
    } catch {
      // silently fail — could show a toast in the future
    } finally {
      setLinkingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyText}>Loading guides…</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.tab}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Linked Guides</span>
          <div className={styles.headerActions}>
            <button className={styles.actionBtn} onClick={handleOpenPicker}>
              Link Guide
            </button>
            <button className={styles.actionBtn} onClick={handleCreateGuide}>
              Create Guide
            </button>
          </div>
        </div>

        {linked.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyText}>No guides linked to this device.</span>
            <div className={styles.emptyActions}>
              <button className={styles.actionBtn} onClick={handleOpenPicker}>
                Link Guide
              </button>
              <button className={styles.actionBtn} onClick={handleCreateGuide}>
                Create Guide
              </button>
            </div>
          </div>
        ) : (
          <div>
            {linked.map((g: GuideByEntity) => (
              <div key={g.id} className={styles.guideRow}>
                <button
                  className={styles.guideTitle}
                  onClick={() => navigate(`/sites/${siteId}/guides?highlight=${g.id}`)}
                >
                  {g.title}
                </button>
                {g.manualName && (
                  <span className={styles.manualBadge}>{g.manualName}</span>
                )}
                <span className={styles.guideDate}>{relativeDate(g.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <div className={styles.pickerOverlay} onClick={() => setPickerOpen(false)}>
          <div className={styles.pickerPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.pickerHeader}>
              <span className={styles.pickerTitle}>Link a Guide</span>
              <button className={styles.pickerClose} onClick={() => setPickerOpen(false)}>
                ×
              </button>
            </div>

            <div className={styles.pickerSearch}>
              <input
                className={styles.pickerSearchInput}
                type="text"
                placeholder="Search guides…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.pickerList}>
              {filteredGuides.length === 0 ? (
                <div className={styles.pickerEmpty}>
                  {allGuides.length === 0
                    ? 'No guides exist yet. Create one first.'
                    : 'No guides match your search.'}
                </div>
              ) : (
                filteredGuides.map(g => {
                  const already = linkedIds.has(g.id);
                  const linking = linkingId === g.id;
                  return (
                    <button
                      key={g.id}
                      className={`${styles.pickerItem}${already ? ` ${styles.pickerAlreadyLinked}` : ''}`}
                      onClick={() => handlePickerItemClick(g.id)}
                      disabled={already || linking}
                    >
                      <span className={styles.pickerItemTitle}>
                        {linking ? 'Linking…' : g.title}
                        {already ? ' — already linked' : ''}
                      </span>
                      {g.manualName && (
                        <span className={styles.pickerItemMeta}>{g.manualName}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
