import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setViewUser } from './lib/api';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [meta, setMeta] = useState(null);
  const [people, setPeople] = useState([]);
  const [viewing, setViewingState] = useState(() => {
    try {
      return localStorage.getItem('fh-viewing') || 'all';
    } catch {
      return 'all';
    }
  });
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [version, setVersion] = useState(0);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    api('/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    api('/meta').then(setMeta).catch(() => {});
    if (user.role === 'admin') api('/users').then(setPeople).catch(() => {});
  }, [user]);

  // Applied synchronously so the first fetches of child components use the right scope.
  if (isAdmin) setViewUser(viewing);
  else setViewUser(null);

  const setViewing = useCallback((v) => {
    try {
      localStorage.setItem('fh-viewing', v);
    } catch {
      /* ignore */
    }
    setViewingState(v);
    setVersion((n) => n + 1);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('fh-theme', next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    setDark(next);
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      meta,
      isAdmin,
      people,
      setPeople,
      viewing: isAdmin ? viewing : String(user?.id ?? ''),
      setViewing,
      viewingAll: isAdmin && viewing === 'all',
      dark,
      toggleTheme,
      logout,
      version,
      refresh: () => setVersion((n) => n + 1),
    }),
    [user, meta, isAdmin, people, viewing, setViewing, dark, toggleTheme, logout, version]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);

/** Fetches `path` and re-fetches when deps or the global data version change. */
export function useApi(path, params, deps = []) {
  const { version } = useApp();
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const key = JSON.stringify(params || {});
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return api(path, { params })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, version, ...deps]);
  return { ...state, reload: load };
}
