import React from 'react';
import {
  LayoutDashboard,
  Flame,
  Terminal,
  FolderGit2,
  Github,
  Sparkles,
  ExternalLink,
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
      isAi: true,
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
      className="w-64 bg-[#f9efec] border-r border-[#e8ded9] flex flex-col justify-between shrink-0 h-screen sticky top-0 font-sans select-none z-20 text-[#241c1d]"
    >
      {/* Marka Başlığı */}
      <div>
        <div className="px-5 py-5 border-b border-[#e8ded9]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#fff4f0] border border-[#e8ded9] flex items-center justify-center text-[#241c1d] font-bold text-xs shadow-xs">
              DC
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-[#241c1d] tracking-tight">
                  DevControl
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9]">
                  AI
                </span>
              </div>
              <span className="text-[11px] text-[#5c5254] font-normal">
                Mühendislik Zekası
              </span>
            </div>
          </div>
        </div>

        {/* Ana Menü Listesi */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-all cursor-pointer text-left group relative ${
                  isActive
                    ? 'bg-[#fff4f0] text-[#241c1d] font-bold border border-[#e8ded9] shadow-xs'
                    : 'text-[#5c5254] hover:text-[#241c1d] hover:bg-[#fff4f0]/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive
                        ? 'text-[#241c1d]'
                        : 'text-[#5c5254] group-hover:text-[#241c1d]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.isAi && (
                    <Sparkles className="w-3.5 h-3.5 text-[#241c1d]" />
                  )}
                  {item.badge !== undefined && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9]">
                      {item.badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Kullanıcı & GitHub Durum Altlığı */}
      <div className="p-3 border-t border-[#e8ded9] space-y-2">
        {/* Canlı GitHub Durumu */}
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#fff4f0] border border-[#e8ded9] text-xs">
          <div className="flex items-center gap-2 text-[#241c1d]">
            <Github className="w-3.5 h-3.5 text-[#241c1d]" />
            <span className="text-[11px] font-medium">GitHub</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                authenticated ? 'bg-[#241c1d]' : 'bg-[#8c8082]'
              }`}
            />
            <span className="text-[10px] font-semibold text-[#241c1d]">
              {authenticated ? 'Bağlı' : 'Bekleniyor'}
            </span>
          </div>
        </div>

        {/* Geliştirici Kartı & Web Sitesi Bağlantısı */}
        <a
          href="https://yucelgumus.dev/"
          target="_blank"
          rel="author external"
          title="Geliştirici: Yücel Gümüş (yucelgumus.dev)"
          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-transparent hover:border-[#e8ded9] hover:bg-[#fff4f0] transition-all group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-7 h-7 rounded-full border border-[#e8ded9] object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#fff4f0] text-[#241c1d] border border-[#e8ded9] flex items-center justify-center font-bold text-xs shrink-0">
                U
              </div>
            )}
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-xs font-bold text-[#241c1d] truncate group-hover:underline">
                {user?.name || user?.login || 'Yücel Gümüş'}
              </span>
              <span className="text-[10px] text-[#5c5254] truncate">
                yucelgumus.dev
              </span>
            </div>
          </div>
          <ExternalLink className="w-3 h-3 text-[#8c8082] group-hover:text-[#241c1d] shrink-0" />
        </a>
      </div>
    </aside>
  );
};
