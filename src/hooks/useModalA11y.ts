import { useEffect, useRef, type RefObject } from 'react';

/**
 * Açık modalların açılış sırasını tutan yığın. Escape yalnızca **en üstteki**
 * modalı kapatır: modallar üst üste açılabildiği için (ör. dosya önerisi
 * modalının üzerine açıklama modalı) aksi hâlde tek tuşla ikisi birden kapanır
 * ve kullanıcı okumakta olduğu bağlamı kaybederdi.
 */
const openModalStack: object[] = [];

/**
 * Diyaloğun içinde odaklanabilir öğeler. Sıra DOM sırasıdır; Tab döngüsü bu
 * sırayı izler, böylece görsel sıralama ile klavye sıralaması ayrışmaz.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Kapsayıcı içindeki **görünür** odaklanabilir öğeler.
 *
 * `getClientRects()` boşluğu, `display: none` altındaki ve sıfır boyutlu
 * öğeleri eler; `offsetParent` kontrolü burada kullanılamaz çünkü modal
 * katmanları `position: fixed` ile açılır ve `offsetParent` onlar için her
 * zaman `null` döner.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getClientRects().length > 0);
}

/**
 * Modal erişilebilirliği: Escape ile kapatma, açılışta odağı modala taşıma,
 * Tab odağını diyaloğun içinde tutma ve kapanışta odağı açan öğeye geri verme.
 *
 * Üç modal da (açıklama, depo incelemesi, dosya önerisi) aynı davranışı
 * beklediği için tek yerde tutulur. Her modala ayrı bir `keydown` dinleyicisi
 * yazmak, birinde Escape'in unutulması ve klavyeyle çalışan kullanıcının
 * modaldan çıkamaması demekti.
 *
 * Dönen `ref` diyalog kapsayıcısına bağlanmalı ve kapsayıcıda `tabIndex={-1}`
 * bulunmalıdır: programatik odak yalnızca odaklanabilir bir öğeye taşınabilir.
 */
export function useModalA11y(
  isOpen: boolean,
  onClose: () => void,
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // `onClose` her render'da yeni bir fonksiyon olabilir; etkiyi ona bağlamak
  // her render'da odağı yeniden kurardı (ve kapanışta odağı modala geri
  // verirdi). Bu yüzden en güncel geri çağrı bir ref üzerinden okunur.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    // Bu modal örneğinin yığındaki kimliği. Nesne kimliği yalnızca referans
    // eşitliğiyle karşılaştırılır; bir değer taşıması gerekmez.
    const modalId = {};
    openModalStack.push(modalId);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      // Yalnızca en üstteki modal klavye olaylarına tepki verir.
      if (openModalStack[openModalStack.length - 1] !== modalId) return;

      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        // Diyalogda odaklanabilir öğe yoksa odak kapsayıcıda tutulur
        // (kapsayıcı `tabIndex={-1}` ile odaklanabilir); aksi hâlde Tab
        // arkasındaki sayfaya kaçardı.
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const focusIsInside = Boolean(active) && container.contains(active);

      if (!focusIsInside) {
        // Odak diyaloğun dışına kaçmışsa (ör. arkadaki sayfaya tıklanmış) ilk
        // adıma geri getirilir: `aria-modal="true"` ile beklenen davranış bu.
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const stackIndex = openModalStack.lastIndexOf(modalId);
      if (stackIndex !== -1) openModalStack.splice(stackIndex, 1);
      // Odağı tetikleyici öğeye geri ver; aksi halde klavye kullanıcısı
      // belge başına düşer ve bağlamını kaybeder.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  return containerRef;
}
