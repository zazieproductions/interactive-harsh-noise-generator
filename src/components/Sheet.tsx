import { useEffect, useRef, type ReactNode } from 'react';

export interface SheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Bottom sheet on phones, dialog on larger screens.
 *
 * Deliberately dependency-free: backdrop click closes, `Escape` closes, the
 * page behind is scroll-locked, and focus moves into the panel so screen
 * readers announce it.
 */
export function Sheet({ open, title, subtitle, onClose, children, footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 w-full h-full bg-black/70 backdrop-blur-sm cursor-default"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto bg-[#0d0d15] border-t sm:border border-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/60 outline-none pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4"
      >
        <div className="sticky top-0 bg-[#0d0d15]/95 backdrop-blur px-4 pt-3 pb-3 border-b border-gray-800/60">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-700 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-200">{title}</h2>
              {subtitle ? <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 w-9 h-9 -mr-1 grid place-items-center rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">{children}</div>
        {footer ? <div className="px-4 pb-2">{footer}</div> : null}
      </div>
    </div>
  );
}
