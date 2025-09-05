import React, { useEffect } from 'react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
  topOffsetPx?: number; // default 64

  headerTitle?: string;
  onPrev?: () => void;
  onNext?: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
};

export default function RightDrawer({
  isOpen,
  onClose,
  children,
  widthClass = 'md:w-1/2 w-full',
  topOffsetPx = 64,
  headerTitle = 'Issues',
  onPrev,
  onNext,
  disablePrev,
  disableNext
}: Props) {
  // Close on ESC
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          'fixed left-0 right-0 z-40 bg-black/30 transition-opacity',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        ].join(' ')}
        style={{ top: topOffsetPx, bottom: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={[
          'fixed right-0 z-50 bg-white shadow-xl border-l',
          widthClass,
          'transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
          'flex flex-col'
        ].join(' ')}
        style={{ top: topOffsetPx, bottom: 0 }}
        role="dialog"
        aria-modal="true"
      >
        {/* Toolbar (scrolls with content) */}
        <div className="px-6 py-3 flex items-center justify-between gap-4 border-b">
          {/* Left: Title */}
          <div className="text-sm text-slate-800">{headerTitle}</div>

          {/* Right: Prev/Next + Close */}
          <div className="flex items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-full border border-slate-200">
              <button
                type="button"
                onClick={onPrev}
                disabled={disablePrev}
                className={[
                  'px-3 py-1 text-xs font-medium',
                  disablePrev
                    ? 'bg-slate-200 text-white cursor-not-allowed'
                    : 'bg-slate-400 text-white hover:bg-slate-500'
                ].join(' ')}
              >
                Prev
              </button>
              <div className="w-px bg-white/60" />
              <button
                type="button"
                onClick={onNext}
                disabled={disableNext}
                className={[
                  'px-3 py-1 text-xs font-medium',
                  disableNext
                    ? 'bg-blue-300 text-white cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                ].join(' ')}
              >
                Next
              </button>
            </div>

            {/* Close (X) */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-slate-700 hover:text-slate-900 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="h-full overflow-auto">{children}</div>
      </aside>
    </>
  );
}
