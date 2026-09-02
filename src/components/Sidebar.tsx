import React from 'react';
import {
  LayoutDashboard,
  Flame,
  Terminal,
  FolderGit2,
  Github,
} from 'lucide-react';
import { GitHubUser } from '../types.js';

export type ActiveTab =
  | 'overview'
  | 'hotspots'
  | 'ask'
  | 'repositories';

interface Props {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  user: GitHubUser | null;
  authenticated?: boolean;
  hotspotsCount: number;
  risksCount: number;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  user,
  authenticated = false,
  hotspotsCount,
  risksCount,
}) => {
  const totalIssuesCount = hotspotsCount + risksCount;

  const navItems = [
    {
      id: 'overview' as ActiveTab,
      label: 'Genel Bakış',
      icon: LayoutDashboard,
      description: 'Canlı Durum & Bülten',
    },
    {
      id: 'hotspots' as ActiveTab,
      label: 'Sıcak Noktalar & Riskler',
      icon: Flame,
      badge: totalIssuesCount > 0 ? totalIssuesCount : undefined,
      description: 'Kod Kalitesi & Risk Radarı',
    },
    {
      id: 'ask' as ActiveTab,
      label: 'Yapay Zeka Analisti',
      icon: Terminal,
      highlight: true,
      description: 'Mühendislik Soru & Cevap',
    },
    {
      id: 'repositories' as ActiveTab,
      label: 'Kişisel Depolar',
      icon: FolderGit2,
      description: 'Kod Tabanı Yönetimi',
    },
  ];

  return (
    <aside
      id="app-sidebar"
      className="w-64 border-r flex flex-col justify-between shrink-0 h-screen sticky top-0 font-sans shadow-lg"
      style={{
        backgroundColor: 'rgba(var(--c1-rgb), 0.25)',
        borderColor: 'var(--c1)',
        color: 'var(--ink-primary)',
      }}
    >
      {/* Marka Başlığı */}
      <div>
        <div className="p-5 border-b" style={{ borderColor: 'var(--c1)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shadow-xs"
              style={{
                backgroundColor: 'var(--c3)',
                color: 'var(--ink-primary)',
                border: '1px solid rgba(var(--c3-rgb), 0.8)',
              }}
            >
              DC
            </div>
            <div className="flex flex-col">
              <h1 className="font-extrabold text-base tracking-tight" style={{ color: 'var(--ink-primary)' }}>
                DevControl AI
              </h1>
              <span className="text-[10px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                Mühendislik Zekası Platformu
              </span>
            </div>
          </div>
        </div>

        {/* Ana Menü Listesi */}
        <nav className="p-3 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className="w-full flex items-center justify-between p-3 rounded-xl text-xs font-semibold transition-all cursor-pointer text-left shadow-xs"
                style={{
                  backgroundColor: isActive ? 'var(--c3)' : 'rgba(var(--c2-rgb), 0.6)',
                  color: 'var(--ink-primary)',
                  boxShadow: isActive ? '0 2px 10px rgba(var(--c3-rgb), 0.5)' : 'none',
                  border: isActive ? '1px solid rgba(var(--c3-rgb), 0.9)' : '1px solid var(--c1)',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="p-1.5 rounded-lg border shrink-0"
                    style={{
                      backgroundColor: isActive ? 'rgba(var(--c2-rgb), 0.9)' : 'var(--c1)',
                      borderColor: 'rgba(var(--c1-rgb), 0.8)',
                    }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-extrabold block text-xs">{item.label}</span>
                    <span className="text-[10px] block opacity-75 font-normal">{item.description}</span>
                  </div>
                </div>

                {item.badge !== undefined && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-black border shrink-0"
                    style={{
                      backgroundColor: 'var(--c1)',
                      borderColor: 'rgba(var(--c1-rgb), 0.8)',
                      color: 'var(--ink-primary)',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Kullanıcı & GitHub Durum Altlığı */}
      <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--c1)' }}>
        {/* Canlı GitHub Durumu */}
        <div
          className="flex items-center justify-between px-3 py-2 rounded-xl border text-xs shadow-xs"
          style={{
            backgroundColor: 'rgba(var(--c2-rgb), 0.85)',
            borderColor: 'var(--c1)',
          }}
        >
          <div className="flex items-center gap-2">
            <Github className="w-3.5 h-3.5" style={{ color: 'var(--ink-primary)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-secondary)' }}>GitHub Bağlantısı</span>
          </div>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1.5"
            style={{
              backgroundColor: 'var(--c3)',
              borderColor: 'rgba(var(--c3-rgb), 0.8)',
              color: 'var(--ink-primary)',
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'var(--ink-primary)' }}></span>
            {authenticated ? 'Bağlı' : 'Bekleniyor'}
          </span>
        </div>

        {/* Kullanıcı Kartı */}
        <div className="flex items-center gap-3 px-1">
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              className="w-8 h-8 rounded-full border object-cover shrink-0"
              style={{ borderColor: 'var(--c1)' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border"
              style={{
                backgroundColor: 'var(--c3)',
                borderColor: 'var(--c1)',
                color: 'var(--ink-primary)',
              }}
            >
              U
            </div>
          )}
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs font-bold truncate" style={{ color: 'var(--ink-primary)' }}>
              {user?.name || user?.login || 'GitHub Kullanıcısı'}
            </span>
            <span className="text-[10px] truncate" style={{ color: 'var(--ink-muted)' }}>
              {user ? `@${user.login}` : 'GitHub hesabı bağlı değil'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
