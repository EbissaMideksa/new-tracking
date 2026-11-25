'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import s from './org.module.css';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Minimal click-outside / Esc-to-close popover used for the "⋯" and "Departments" menus. */
export function Popover({
  buttonClass,
  buttonContent,
  label,
  align = 'right',
  children,
}: {
  buttonClass: string;
  buttonContent: ReactNode;
  label: string;
  align?: 'left' | 'right';
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={s.popWrap} ref={ref}>
      <button
        type="button"
        className={buttonClass}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {buttonContent}
      </button>
      {open && (
        <div role="menu" className={cx(s.popPanel, align === 'left' ? s.popLeft : s.popRight)}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
