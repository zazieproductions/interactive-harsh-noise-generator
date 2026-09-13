import { useState, type ReactNode } from 'react';

export interface SectionProps {
  title: string;
  /** Rendered opposite the title — e.g. the current value or a status chip. */
  summary?: ReactNode;
  children: ReactNode;
  /** Open by default on phones; every section is always open on `lg`+ . */
  defaultOpen?: boolean;
  /** Optional paragraph shown above the controls. */
  description?: string;
}

/**
 * A control group.
 *
 * On phones the panel collapses (a 12-control instrument is a lot of scrolling
 * with a 6-inch screen), on tablets/desktop it is always expanded — so the
 * desktop experience is unchanged while the phone experience is a set of
 * tappable headers.
 */
export function Section({ title, summary, children, defaultOpen = false, description }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `section-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

  return (
    <section className="bg-gray-900/40 border border-gray-800/60 rounded-xl overflow-hidden lg:overflow-visible">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 min-h-[48px] text-left lg:cursor-default lg:pointer-events-none"
      >
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">{title}</span>
        <span className="flex items-center gap-2">
          {summary ? <span className="text-[10px] font-mono text-gray-500 tabular-nums">{summary}</span> : null}
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className={`w-4 h-4 text-gray-600 transition-transform lg:hidden ${open ? 'rotate-180' : ''}`}
          >
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      <div id={panelId} className={`px-4 pb-4 ${open ? 'block' : 'hidden'} lg:block`}>
        {description ? <p className="text-[10px] text-gray-600 leading-snug mb-3">{description}</p> : null}
        <div className="space-y-3">{children}</div>
      </div>
    </section>
  );
}
