
'use client';

import { useEffect, useState } from 'react';
import { fetchDirectorCandidates, type DirectorOption } from '@/lib/org/directorCandidates';
import type { DirectorCandidate } from '@/lib/org/orgApi';
import d from './directorPicker.module.css';

interface Props {
  title: string;
  subtitle?: string;
  currentUserId?: string | null;
  unassignLabel?: string;
  onClose: () => void;
  onSubmit: (user: DirectorCandidate | null) => Promise<void> | void;
}

const TIMEOUT_MS = 20_000;

export function DirectorPickerDialog({
  title,
  subtitle,
  currentUserId = null,
  unassignLabel = 'Clear assignment',
  onClose,
  onSubmit,
}: Props) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<DirectorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(currentUserId);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    let timedOut = false;

    const start = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const killer = setTimeout(() => {
        timedOut = true;
        ctrl.abort();
      }, TIMEOUT_MS);
      try {
        setItems(await fetchDirectorCandidates(q, ctrl.signal));
      } catch (e: any) {
        if (timedOut) setError('Timed out loading users — check your connection and try again.');
        else if (e?.name !== 'AbortError') setError(e?.message ?? 'Failed to load users');
      } finally {
        clearTimeout(killer);
        if (!ctrl.signal.aborted || timedOut) setLoading(false);
      }
    }, q ? 250 : 0); // debounce typing only

    return () => {
      clearTimeout(start);
      ctrl.abort();
    };
  }, [q, retry]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (id: string | null) => {
    setSaving(true);
    setError(null);
    try {
      const opt = id ? items.find((i) => i.id === id) : null;
      if (id && !opt) throw new Error('Pick a person from the list first.');
      await onSubmit(opt ? (opt as unknown as DirectorCandidate) : null);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the assignment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={d.backdrop} onClick={onClose} />
      <div className={d.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <header className={d.head}>
          <h3 className={d.title}>{title}</h3>
          {subtitle && <p className={d.sub}>{subtitle}</p>}
        </header>

        <input
          className={d.search}
          type="search"
          autoFocus
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className={d.list}>
          {loading && <p className={d.state}>Loading…</p>}
          {error && (
            <p className={d.stateErr}>
              {error}{' '}
              <button type="button" className={d.link} onClick={() => setRetry((n) => n + 1)}>
                Retry
              </button>
            </p>
          )}
          {!loading && !error && items.length === 0 && <p className={d.state}>No matching people.</p>}
          {items.map((u) => (
            <label key={u.id} className={d.row} data-on={selected === u.id ? 'true' : undefined}>
              <input
                type="radio"
                name="director"
                checked={selected === u.id}
                onChange={() => setSelected(u.id)}
              />
              <span className={d.info}>
                <span className={d.name}>{u.name}</span>
                <span className={d.meta}>
                  {u.email}
                  {u.orgUnitName ? ` · ${u.orgUnitName}` : ''}
                </span>
              </span>
              <span className={d.role}>{u.role}</span>
            </label>
          ))}
        </div>

        <footer className={d.foot}>
          <button type="button" className={d.link} onClick={() => submit(null)} disabled={saving}>
            {unassignLabel}
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className={d.btn} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className={d.btnPrimary}
            onClick={() => submit(selected)}
            disabled={saving || !selected}
          >
            {saving ? 'Saving…' : 'Assign'}
          </button>
        </footer>
      </div>
    </>
  );
}
