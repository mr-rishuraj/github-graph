import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export interface GitHubUser {
  login: string;
  avatarUrl: string;
  name: string;
}

export function useGitHubAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('gh_token'));
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [loading, setLoading] = useState(false);

  // On mount: check URL hash for access_token or auth_error
  useEffect(() => {
    const hash = window.location.hash;
    const tokenMatch = hash.match(/access_token=([^&]+)/);
    const errorMatch = hash.match(/auth_error=([^&]+)/);
    if (tokenMatch) {
      const newToken = tokenMatch[1];
      localStorage.setItem('gh_token', newToken);
      setToken(newToken);
      // Clean hash
      history.replaceState('', document.title, window.location.pathname + window.location.search);
    } else if (errorMatch) {
      console.error('OAuth error:', errorMatch[1]);
      history.replaceState('', document.title, window.location.pathname + window.location.search);
    }
  }, []);

  // When token changes, fetch user info
  useEffect(() => {
    if (!token) { setUser(null); return; }
    setLoading(true);
    axios.get<GitHubUser>('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setUser(r.data))
      .catch(() => {
        // Token invalid — clear it
        localStorage.removeItem('gh_token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = useCallback(() => {
    window.location.href = '/api/auth/github';
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gh_token');
    setToken(null);
    setUser(null);
  }, []);

  return { token, user, loading, login, logout };
}
