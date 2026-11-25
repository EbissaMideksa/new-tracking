'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import s from './org.module.css';

/** Small modal dialog used for rename / add-node / director-assignment forms. */
export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={s.modalOverlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <h3 className={s.modalTitle}>{title}</h3>
            {subtitle && <p className={s.modalSub}>{subtitle}</p>}
          </div>
          <button type="button" className={s.iconBtn} aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </div>
        {children}
        <div className={s.modalFoot}>{footer}</div>
      </div>
    </div>
  );
}

/** One-field text dialog (name / code / director). */
export function TextDialog({
  title,
  subtitle,
  label,
  help,
  initial = '',
  placeholder,
  confirmLabel = 'Save',
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  label: string;
  help?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={s.btnGhost} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="text-dialog-form" className={s.btnTeal} disabled={busy}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </>
      }
    >
      <form id="text-dialog-form" onSubmit={submit}>
        <label className={s.modalLabel} htmlFor="text-dialog-input">
          {label}
        </label>
        <input
          id="text-dialog-input"
          className={s.modalInput}
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
        />
        {help && <p className={s.modalHelp}>{help}</p>}
        {error && (
          <p className={s.modalError} role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** Department creation dialog — name + placement (corporate-only vs spreadable). */
export function DepartmentCreateDialog({
  division,
  onClose,
  onSubmit,
}: {
  division: { id: string; name: string; subtitle?: string };
  onClose: () => void;
  onSubmit: (values: { name: string; placement: string }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [placement, setPlacement] = useState<'SPREADABLE' | 'CORPORATE_ONLY'>('SPREADABLE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), placement });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add department"
      subtitle={`New department under ${division.name} · ${division.subtitle}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={s.btnGhost} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="add-department-form" className={s.btnTeal} disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create department'}
          </button>
        </>
      }
    >
      <form id="add-department-form" onSubmit={submit}>
        <label className={s.modalLabel} htmlFor="add-department-name">
          Department name *
        </label>
        <input
          id="add-department-name"
          className={s.modalInput}
          value={name}
          placeholder="e.g. Transmission"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />

        <label className={s.modalLabel} htmlFor="add-department-placement">
          Placement *
        </label>
        <select
          id="add-department-placement"
          className={s.modalInput}
          value={placement}
          onChange={(e) => setPlacement(e.target.value as 'SPREADABLE' | 'CORPORATE_ONLY')}
          disabled={busy}
        >
          <option value="SPREADABLE">
            Spreadable — head office + field (zones/regions)
          </option>
          <option value="CORPORATE_ONLY">
            Corporate-only — head office only
          </option>
        </select>
        <p className={s.modalHelp}>
          Corporate-only departments live at the head office and cannot hold Zones/Regions folders or local workforce units.
          Spreadable departments get the Zones and Regions category folders pre-created so their field-arm units can be placed in geographies.
        </p>
        {error && (
          <p className={s.modalError} role="alert">{error}</p>
        )}
      </form>
    </Dialog>
  );
}