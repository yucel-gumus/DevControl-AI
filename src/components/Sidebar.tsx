import React from 'react';
import {
  LayoutDashboard,
  Flame,
  FolderGit2,
  Github,
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
  /** Kritik hotspot sayısı; `null` = telemetri henüz ölçülmedi (istek sürüyor ya da başarısız). */
  hotspotsCount: number | null;
  /** Kritik risk sayısı; `null` = telemetri henüz ölçülmedi. */
  risksCount: number | null;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  user,
  authenticated = false,
  hotspotsCount,
  risksCount,
}) => {
  /**
   * Rozet sayacı; ölçülmemiş kaynak varken `null`.
   *
   * İki sayacın toplamı, bileşenlerden biri ölçülmemişse "ölçülmüş bir toplam"
   * değildir: başarısız bir risk isteğinin boş dizisi 0 üretir ve rozet, kalan
   * hotspot sayısını tam toplam gibi yazardı. Ölçümsüz durum aynı işaretle
   * bildirilir ("--"); sayaçların ölçüm işaretiyle ortak kural (bkz.
   * src/utils/formatters.ts).
   */
  const countsMeasured = hotspotsCount !== null && risksCount !== null;
  const totalIssuesCount = countsMeasured ? hotspotsCount + risksCount : null;

  const navItems = [
    {
      id: 'overview' as ActiveTab,
      label: 'Genel Bakış',
      icon: LayoutDashboard,
      description: 'Canlı Durum & Bülten',
    },
    {
      id: 'hotspots' as ActiveTab,
      label: 'Kritik Dosyalar & Riskler',
      icon: Flame,
      // Toplam ölçülmemişse rozet sayı yerine ölçümsüzlük işaretini taşır;
      // ölçülmüş ve sıfırsa rozet hiç çizilmez ("kritik sorun yok").
      badge: totalIssuesCount === null ? '--' : totalIssuesCount > 0 ? String(totalIssuesCount) : undefined,
      description: 'Kod Kalitesi & Risk Radarı',
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
      // Dar ekranlarda (max-md) kenar çubuğu ikon rayına iner: 256 px sabit
      // genişlik, 390 px'lik bir telefonda içeriğe ~134 px bırakıp panoyu
      // okunamaz hâle getirirdi. Yalnızca `max-md:` varyantları kullanılır, bu
      // yüzden ≥768 px yerleşim bir piksel bile değişmez; etiketler gizlense de
      // erişilebilir ad `aria-label`dan gelir (bkz. aşağıdaki navItems).
      className="w-64 max-md:w-16 bg-[#cdc1b5] border-r border-[#a89997] flex flex-col justify-between shrink-0 h-screen sticky top-0 font-sans select-none z-20 text-[#231c1a]"
    >
      {/* Marka Başlığı */}
      <div>
        <div className="px-5 max-md:px-2 py-5 border-b border-[#a89997]">
          <div className="flex items-center gap-3 max-md:justify-center">
            <div className="w-8 h-8 rounded-lg bg-[#f9b88e] border border-[#231c1a]/15 flex items-center justify-center text-[#231c1a] font-bold text-xs shadow-xs shrink-0">
              DC
            </div>
            <div className="flex flex-col max-md:hidden">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-[#231c1a] tracking-tight">
                  DevControl
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/15">
                  AI
                </span>
              </div>
              <span className="text-[11px] text-[#4a3e3b] font-normal">
                Mühendislik Zekası
              </span>
            </div>
          </div>
        </div>

        {/* Ana Menü Listesi */}
        <nav className="p-3 max-md:p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-item-${item.id}`}
                type="button"
                onClick={() => onSelectTab(item.id)}
                // Sayaç erişilebilir ada DAHİL edilir: `aria-label` düğüm
                // içeriğini geçersiz kıldığı için yalnızca "sekmesine geç" yazan
                // bir ad, rozetteki kritik sorun sayısını ekran okuyucudan
                // gizlerdi (sayaç yalnızca görebilen kullanıcıya ulaşırdı).
                aria-label={
                  item.badge === undefined
                    ? `${item.label} sekmesine geç`
                    : countsMeasured
                      ? `${item.label} sekmesine geç (${item.badge} kritik sorun)`
                      : `${item.label} sekmesine geç (kritik sorun sayısı henüz ölçülmedi)`
                }
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                className={`w-full flex items-center justify-between max-md:justify-center gap-2 px-3 max-md:px-1.5 py-2.5 rounded-lg text-xs transition-all cursor-pointer text-left group relative ${
                  isActive
                    ? 'bg-[#f9b88e] text-[#231c1a] font-bold border border-[#231c1a]/20 shadow-xs'
                    : 'text-[#4a3e3b] hover:text-[#231c1a] hover:bg-[#b9aba9]/40 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    aria-hidden="true"
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive
                        ? 'text-[#231c1a]'
                        : 'text-[#4a3e3b] group-hover:text-[#231c1a]'
                    }`}
                  />
                  <span className="truncate max-md:hidden">{item.label}</span>
                </div>

                {/* Sayaç, ikon rayında köşeye taşınır: 64 px'lik düğmede
                    ikonun yanına sığmayan rozet, satırı taşırıp kırpılırdı
                    (sayı görünmez olurdu). Akıştan çıkarıldığı için ikon tam
                    ortada kalır. */}
                <div className="flex items-center gap-1.5 shrink-0 max-md:absolute max-md:top-0.5 max-md:right-0.5">
                  {item.badge !== undefined && (
                    <span className="px-1.5 max-md:px-1 rounded-md text-[10px] font-bold bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20">
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
      <div className="p-3 max-md:p-2 border-t border-[#a89997] space-y-2">
        {/* Canlı GitHub Durumu.
            Durum metni ikon rayında sığmadığı için yalnızca görsel olarak
            gizlenir; erişilebilir ad her genişlikte `aria-label`dan gelir
            (metin gizlendiğinde ekran okuyucu için geriye yalnızca renkli nokta
            kalırdı — durum bilgisi görebilen kullanıcıya özel olurdu). */}
        <div
          className="flex items-center justify-between gap-1 px-3 max-md:px-1.5 py-2 rounded-lg bg-[#b9aba9]/40 border border-[#a89997] text-xs"
          role="status"
          aria-label={authenticated ? 'GitHub bağlantısı: bağlı' : 'GitHub bağlantısı: bekleniyor'}
        >
          <div className="flex items-center gap-2 text-[#231c1a]">
            <Github className="w-3.5 h-3.5 text-[#231c1a] shrink-0" aria-hidden="true" />
            <span className="text-[11px] font-bold max-md:hidden">GitHub</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full ${
                authenticated ? 'bg-[#231c1a]' : 'bg-[#6e5f5c]'
              }`}
            />
            <span className="text-[10px] font-bold text-[#231c1a] max-md:hidden">
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
          aria-label="Geliştirici Yücel Gümüş web sitesini ziyaret et (yeni sekmede açılır)"
          className="flex items-center justify-between gap-2 px-2.5 max-md:px-1.5 py-1.5 rounded-lg border border-transparent hover:border-[#a89997] hover:bg-[#b9aba9]/40 transition-all group"
        >
          <div className="flex items-center gap-2.5 min-w-0 max-md:justify-center max-md:w-full">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-7 h-7 rounded-full border border-[#a89997] object-cover shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[#f9b88e] text-[#231c1a] border border-[#231c1a]/20 flex items-center justify-center font-bold text-xs shrink-0">
                U
              </div>
            )}
            <div className="flex flex-col min-w-0 text-left max-md:hidden">
              <span className="text-xs font-bold text-[#231c1a] truncate group-hover:underline">
                {user?.name || user?.login || 'Yücel Gümüş'}
              </span>
              <span className="text-[10px] text-[#4a3e3b] truncate font-medium">
                yucelgumus.dev
              </span>
            </div>
          </div>
          <ExternalLink className="w-3 h-3 text-[#6e5f5c] group-hover:text-[#231c1a] shrink-0 max-md:hidden" aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
};
