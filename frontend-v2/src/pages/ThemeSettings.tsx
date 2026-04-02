import { useState } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import type { ThemeMode } from '@/stores/themeStore';
import styles from './ThemeSettings.module.css';
import settingsStyles from './SettingsPage.module.css';

const DEFAULT_THEME: ThemeMode = 'dark';
const DEFAULT_ACCENT = '#c47c5a';

export default function ThemeSettings() {
  const theme = useThemeStore((s) => s.theme);
  const accentColor = useThemeStore((s) => s.accentColor);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setAccent = useThemeStore((s) => s.setAccent);

  const deviceBg = useThemeStore((s) => s.deviceBg);
  const setDeviceBg = useThemeStore((s) => s.setDeviceBg);

  const [hexInput, setHexInput] = useState(accentColor);
  const [deviceBgHex, setDeviceBgHex] = useState(deviceBg);

  const handleSwatchClick = () => {
    document.getElementById('accent-color-picker')?.click();
  };

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const c = e.target.value;
    setHexInput(c);
    setAccent(c);
  };

  const handleHexInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setHexInput(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      setAccent(v);
    }
  };

  const handleReset = () => {
    setTheme(DEFAULT_THEME);
    setAccent(DEFAULT_ACCENT);
    setHexInput(DEFAULT_ACCENT);
    setDeviceBg('#1e2022');
    setDeviceBgHex('#1e2022');
  };

  return (
    <div className={styles.container}>
      {/* Theme Mode */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Theme Mode</p>
        <div className={styles.card}>
          <div className={styles.toggleRow}>
            <button
              className={`${styles.toggleBtn} ${theme === 'dark' ? styles.toggleBtnActive : ''}`}
              onClick={() => setTheme('dark')}
            >
              Dark
            </button>
            <button
              className={`${styles.toggleBtn} ${theme === 'light' ? styles.toggleBtnActive : ''}`}
              onClick={() => setTheme('light')}
            >
              Light
            </button>
          </div>
        </div>
      </div>

      {/* Accent Color */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Accent Color</p>
        <div className={styles.card}>
          <div className={styles.accentRow}>
            <span
              className={styles.colorSwatch}
              style={{ background: accentColor }}
              onClick={handleSwatchClick}
              title="Click to pick color"
            />
            <input
              id="accent-color-picker"
              type="color"
              value={accentColor}
              onChange={handleColorPickerChange}
              className={styles.colorPickerHidden}
            />
            <input
              className={styles.hexInput}
              type="text"
              value={hexInput}
              maxLength={7}
              onChange={handleHexInput}
              placeholder="#c47c5a"
              onBlur={() => {
                if (!/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
                  setHexInput(accentColor);
                }
              }}
            />
            <span style={{ fontSize: '11px', color: '#8a9299', fontFamily: 'Inter, system-ui, sans-serif' }}>
              Used for active tabs, buttons, and highlights
            </span>
          </div>
        </div>
      </div>

      {/* Device Background */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Device Background</p>
        <div className={styles.card}>
          <div className={styles.accentRow}>
            <span
              className={styles.colorSwatch}
              style={{ background: deviceBg }}
              onClick={() => document.getElementById('device-bg-picker')?.click()}
              title="Click to pick color"
            />
            <input
              id="device-bg-picker"
              type="color"
              value={deviceBg}
              onChange={(e) => { setDeviceBgHex(e.target.value); setDeviceBg(e.target.value); }}
              className={styles.colorPickerHidden}
            />
            <input
              className={styles.hexInput}
              type="text"
              value={deviceBgHex}
              maxLength={7}
              onChange={(e) => {
                const v = e.target.value;
                setDeviceBgHex(v);
                if (/^#[0-9a-fA-F]{6}$/.test(v)) setDeviceBg(v);
              }}
              onBlur={() => {
                if (!/^#[0-9a-fA-F]{6}$/.test(deviceBgHex)) setDeviceBgHex(deviceBg);
              }}
              placeholder="#1e2022"
            />
            <span style={{ fontSize: '11px', color: '#8a9299', fontFamily: 'Inter, system-ui, sans-serif' }}>
              Device block background color in rack view
            </span>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Preview</p>
        <div className={styles.card}>
          <div className={styles.previewPanel}>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Accent</span>
              <span
                className={styles.previewSwatch}
                style={{ background: accentColor }}
              />
              <span style={{ fontSize: '11px', color: '#8a9299', fontFamily: 'Inter, system-ui, sans-serif' }}>
                {accentColor}
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Background</span>
              <span
                className={styles.previewSwatch}
                style={{ background: '#161a1d', border: '1px solid #3a4248' }}
              />
              <span style={{ fontSize: '11px', color: '#8a9299', fontFamily: 'Inter, system-ui, sans-serif' }}>
                #161a1d
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Surface</span>
              <span
                className={styles.previewSwatch}
                style={{ background: '#1a1e22' }}
              />
              <span style={{ fontSize: '11px', color: '#8a9299', fontFamily: 'Inter, system-ui, sans-serif' }}>
                #1a1e22
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Device BG</span>
              <span
                className={styles.previewSwatch}
                style={{ background: deviceBg, border: '1px solid #3a4248' }}
              />
              <span style={{ fontSize: '11px', color: '#8a9299', fontFamily: 'Inter, system-ui, sans-serif' }}>
                {deviceBg}
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Text</span>
              <span
                className={styles.previewText}
                style={{
                  color: '#d4d9dd',
                  background: '#1a1e22',
                }}
              >
                Sample text
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Button</span>
              <button
                className={settingsStyles.primaryBtn}
                style={{ background: accentColor }}
                onClick={() => {}}
              >
                Primary
              </button>
              <button className={settingsStyles.ghostBtn} onClick={() => {}}>
                Ghost
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reset */}
      <div className={styles.resetRow}>
        <button className={settingsStyles.ghostBtn} onClick={handleReset}>
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
