import { Search, SlidersHorizontal, BarChart2, GitCompare } from 'lucide-react';

type MobileTab = 'graph' | 'search' | 'filter' | 'stats' | 'diff';

interface MobileBottomBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  hasCircularDeps?: boolean;
  diffMode?: boolean;
}

export function MobileBottomBar({ activeTab, onTabChange, hasCircularDeps, diffMode }: MobileBottomBarProps) {
  const tabs: { id: MobileTab; icon: React.ReactNode; label: string; alert?: boolean }[] = [
    { id: 'search', icon: <Search size={18} />, label: 'Search' },
    { id: 'filter', icon: <SlidersHorizontal size={18} />, label: 'Filter' },
    { id: 'stats', icon: <BarChart2 size={18} />, label: 'Stats', alert: hasCircularDeps },
    ...(diffMode ? [{ id: 'diff' as MobileTab, icon: <GitCompare size={18} />, label: 'Diff' }] : []),
  ];

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(activeTab === tab.id ? 'graph' : tab.id)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === tab.id ? '#388bfd' : 'var(--fg-subtle)',
            position: 'relative',
          }}
        >
          {tab.alert && (
            <div style={{
              position: 'absolute', top: 8, right: 'calc(50% - 12px)',
              width: 7, height: 7, borderRadius: '50%', background: '#ef4444',
            }} />
          )}
          {tab.icon}
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
}
