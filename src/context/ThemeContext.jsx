import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // 'dark' is what the SSR markup and the client's first (hydrating) render must
  // agree on, so the initial state is 'dark' on BOTH sides — reading localStorage
  // here would make a returning light-theme user's first render disagree with the
  // server's dark markup (a hydration mismatch). The stored preference is applied
  // by the mount effect below, after hydration.
  const [theme, setTheme] = useState('dark');

  // After hydration, adopt the visitor's saved preference (if any).
  useEffect(() => {
    const stored = localStorage.getItem('orbit-theme');
    if (stored && stored !== theme) setTheme(stored);
    // Run once on mount; theme intentionally omitted so a later toggle isn't reverted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply data-theme to <html> immediately and on every change.
  // The landing page overrides this back to 'dark' via its own useEffect.
  useEffect(() => {
    localStorage.setItem('orbit-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
