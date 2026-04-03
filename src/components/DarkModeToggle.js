import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function DarkModeToggle() {
  const [dark, setDark] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      const saved = localStorage.getItem('rurality-dark-mode');
      if (saved !== null) return saved === 'true';
      return false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try { localStorage.setItem('rurality-dark-mode', String(dark)); } catch {}
  }, [dark]);

  return (
    <button
      onClick={() => setDark(prev => !prev)}
      className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
