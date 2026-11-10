'use client';

import { useEffect, useState } from 'react';
import styles from './theme-toggle.module.css';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'color-scheme';

function applyColorSchemeMeta(preference: ThemePreference): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = preference === 'system' ? 'light dark' : preference;
  }
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
  return 'system';
}

/**
 * Unobtrusive color-scheme override control (System / Light / Dark).
 * Decoupled from business logic; updates `<meta name="color-scheme">` and syncs across tabs.
 */
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system');

  useEffect(() => {
    const initial = readStoredPreference();
    setPreference(initial);
    applyColorSchemeMeta(initial);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next =
        event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system';
      setPreference(next);
      applyColorSchemeMeta(next);
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function selectPreference(next: ThemePreference): void {
    setPreference(next);
    applyColorSchemeMeta(next);
    try {
      if (next === 'system') {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // Theme still applies to current page even if persistence fails
    }
  }

  const options: ReadonlyArray<{ value: ThemePreference; label: string }> = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <div className={styles.group} role="group" aria-label="Color theme">
      <span className={styles.legend} aria-hidden="true">
        Theme
      </span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          aria-pressed={preference === option.value}
          onClick={() => selectPreference(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
