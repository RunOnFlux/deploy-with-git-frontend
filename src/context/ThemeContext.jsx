import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // This initializer runs during render, so it must not touch localStorage during
  // the SSR prerender (there is no browser there). 'dark' is also what the server
  // markup and the client's first, hydrating render must agree on — the stored
  // preference is applied by the effect below, after hydration.
  const [theme, setTheme] = useState(
    () => (typeof window === 'undefined' ? 'dark' : localStorage.getItem('orbit-theme') || 'dark')
  );

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
