import { useState, useCallback } from 'react';

export interface RecentRepo {
  url: string;
  label: string;
  nodeCount: number;
  timestamp: number;
}

const STORAGE_KEY = 'github-graph-recent';
const MAX_ENTRIES = 8;

function loadRepos(): RecentRepo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentRepo[];
  } catch {
    return [];
  }
}

function saveRepos(repos: RecentRepo[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(repos));
  } catch {
    // ignore localStorage errors (private browsing, quota exceeded, etc.)
  }
}

export function useRecentRepos() {
  const [repos, setRepos] = useState<RecentRepo[]>(() => loadRepos());

  const addRepo = useCallback((entry: Omit<RecentRepo, 'timestamp'>) => {
    setRepos(prev => {
      // Dedupe by URL, remove existing entry for this URL
      const filtered = prev.filter(r => r.url !== entry.url);
      const next: RecentRepo[] = [
        { ...entry, timestamp: Date.now() },
        ...filtered,
      ].slice(0, MAX_ENTRIES);
      saveRepos(next);
      return next;
    });
  }, []);

  const clearRepos = useCallback(() => {
    setRepos([]);
    saveRepos([]);
  }, []);

  const exportRepos = useCallback(() => {
    const blob = new Blob([JSON.stringify(repos, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'github-graph-recent-repos.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, [repos]);

  const importRepos = useCallback((incoming: RecentRepo[]) => {
    setRepos(prev => {
      const merged = [...incoming, ...prev.filter(r => !incoming.some(i => i.url === r.url))]
        .slice(0, MAX_ENTRIES);
      saveRepos(merged);
      return merged;
    });
  }, []);

  return { repos, addRepo, clearRepos, exportRepos, importRepos };
}

export function timeAgo(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
