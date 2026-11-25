// @/components/org-structure/AddDivisionForm.tsx
// "Add division" form on /dashboard/admin/org-structure.
//
// The page below renders OrgStructureEditor, which reads the legacy OrgUnit
// tree (/api/tree) — so the division is created through POST /api/org, NOT
// /api/org/nodes (that endpoint writes the newer OrgNode tree rendered by the
// /dashboard/organization screens; adding there would leave it invisible in the
// editor under this button). After a create the form dispatches "org:tree-changed"
// so the editor reloads without a full page refresh.
//
// Styling follows the org-structure design system (Dialog + org.module.css).
"use client";

import { FormEvent, useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { useToast } from "@/components/ToastProvider";
import s from "./org.module.css";

export default function AddDivisionForm({ label = "Add division" }: { label?: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The legacy tree's root (the caller's scope root — the country for an admin).
  // A DIVISION may only hang off it, so the id is fetched when the dialog opens.
  const [rootId, setRootId] = useState<string | null>(null);
  const [rootLoading, setRootLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRootLoading(true);
    fetch("/api/tree", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((tree) => {
        if (!cancelled && tree?.id) setRootId(tree.id);
      })
      .catch(() => {/* create button stays disabled; retry on next open */})
      .finally(() => {
        if (!cancelled) setRootLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const openModal = () => {
    setError(null);
    setBusy(false);
    setName("");
    setCode("");
    setOpen(true);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rootId) {
      setError("Could not determine the organization root — close and try again.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: rootId,
          type: "DIVISION",
          name: name.trim(),
          code: code.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      showToast(`Division "${name.trim()}" created.`, "success");
      window.dispatchEvent(new Event("org:tree-changed"));
      setOpen(false);
    } catch (err: any) {
      setError(err?.message ?? "Could not create division.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={s.btnPrimary} onClick={openModal} disabled={busy}>
        {label}
      </button>

      {open && (
        <Dialog
          title="Add division"
          subtitle="A division sits at the corporate office and holds departments. Every department below carries a functional director."
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" className={s.btnGhost} onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                form="add-division-form"
                className={s.btnTeal}
                disabled={!name.trim() || !rootId || busy}
              >
                {busy ? "Creating…" : "Create division"}
              </button>
            </>
          }
        >
          <form id="add-division-form" onSubmit={save}>
            <label className={s.modalLabel} htmlFor="add-division-name">
              Division name *
            </label>
            <input
              id="add-division-name"
              className={s.modalInput}
              value={name}
              placeholder="e.g. Fixed Network"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />

            <label className={s.modalLabel} htmlFor="add-division-code">
              Division code (short)
            </label>
            <input
              id="add-division-code"
              className={s.modalInput}
              value={code}
              placeholder="e.g. FN"
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
            <p className={s.modalHelp}>
              The code prefixes field unit names (e.g. EAAZ FN O&amp;M), so keep it short and stable.
            </p>

            {rootLoading && <p className={s.modalHelp}>Checking the organization root…</p>}
            {error && (
              <p className={s.modalError} role="alert">
                {error}
              </p>
            )}
          </form>
        </Dialog>
      )}
    </>
  );
}
