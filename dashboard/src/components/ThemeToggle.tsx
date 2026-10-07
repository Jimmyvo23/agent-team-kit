import { useLayoutEffect, useState } from 'react';

export const THEMES = [
  { value: 'day', label: 'Cozy day' },
  { value: 'night', label: 'Night shift' },
  { value: 'pastel', label: 'Pastel' },
] as const;

export type Theme = (typeof THEMES)[number]['value'];

const STORAGE_KEY = 'agent-team-kit.theme';

/** Stored theme, or Cozy day. Storage can be missing or throw (private windows, blocked site data). */
function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return THEMES.some((t) => t.value === v) ? (v as Theme) : 'day';
  } catch {
    return 'day';
  }
}

function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered in this browser; the page still works.
  }
}

/** Theme radio group. The choice goes on <html data-theme>, where theme.css swaps tokens. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => (
        <label key={t.value} className={theme === t.value ? 'is-on' : undefined}>
          <input
            type="radio"
            name="theme"
            value={t.value}
            checked={theme === t.value}
            onChange={() => { setTheme(t.value); saveTheme(t.value); }}
          />
          {t.label}
        </label>
      ))}
    </div>
  );
}
