import { useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => typeof document !== 'undefined' ? (document.documentElement.getAttribute('data-theme') || 'dark') : 'dark'
  );

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('nn5g-theme', next);
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      style={{
        background: 'none',
        border: '1px solid var(--border-strong)',
        borderRadius: '20px',
        padding: '4px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        transition: 'all 0.2s',
      }}
    >
      {theme === 'dark' ? '☀ Light' : '◑ Dark'}
    </button>
  );
}
