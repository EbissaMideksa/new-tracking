//components/org-structure/OrgOverviewScreen.tsx
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { OrgShell } from './OrgShell';
import { OrgHierarchyView } from './OrgHierarchyView';
import { OrgGeographyView } from './OrgGeographyView';
import { TextDialog } from './Dialog';
import { DepartmentCreateDialog } from './Dialog';
import { DirectorPickerDialog } from './DirectorPickerDialog';
import { Icon } from './Icon';
import { useConfirm } from '@/components/ConfirmProvider';
import { useAlert } from '@/components/AlertProvider';
import { cx } from './Popover';
import {
  createOrgUnitNode,
  deleteOrgUnit,
  renameOrgUnit,
  setDepartmentDirector,
  setZoneDirector,
  type DirectorCandidate,
} from '@/lib/org/orgApi';
import { geoHref } from '@/lib/org/paths';
import type { OrgDepartment, OrgDivision, OrgOverview, OrgZone } from '@/lib/org/types';
import { useOrg } from '@/lib/org/useOrg';
import s from './org.module.css';

type DialogState =
  | { kind: 'rename'; id: string; name: string; nodeKind: 'DIVISION' | 'DEPARTMENT' }
  | { kind: 'addDepartment'; division: OrgDivision }
  | { kind: 'addDivision' }
  | { kind: 'director'; zone: OrgZone }
  | { kind: 'deptDirector'; department: OrgDepartment }
  | null;

/** Page shell for /dashboard/organization — the "Organization overview"
 *  screen from design.pdf p1. Data: SSR fallback + live API via useOrg(). */
export function OrgOverviewScreen({ overview, canEdit }: { overview: OrgOverview; canEdit: boolean }) {
  const confirm = useConfirm();
  const alert = useAlert();
  const { overview: live, loading, error, refetch } = useOrg();
  const current = live ?? overview;

  const [tab, setTab] = useState<'hierarchy' | 'geography'>('hierarchy');
  const [editMode, setEditMode] = useState(false);
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState<'80' | '100' | '125'>('100');
  const [expandTick, setExpandTick] = useState(0);
  const [collapseTick, setCollapseTick] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);

  // Operational Directors rail (By geography tab only) — collapsed by default.
  const [railOpen, setRailOpen] = useState(false);
  const [railCats, setRailCats] = useState<Set<string>>(new Set());

  // "Collapse all" also folds the rail.
  useEffect(() => {
    if (collapseTick > 0) {
      setRailOpen(false);
      setRailCats(new Set());
    }
  }, [collapseTick]);

  // "Edit hierarchy" from the zone page opens the director dialog via a custom event.
  useEffect(() => {
    const onEditDirector = (e: Event) => {
      const zoneId = (e as CustomEvent<{ zoneId: string }>).detail?.zoneId;
      const zone = current.zones.find((z) => z.id === zoneId);
      if (zone) setDialog({ kind: 'director', zone });
    };
    window.addEventListener('org:edit-director', onEditDirector as EventListener);
    return () => window.removeEventListener('org:edit-director', onEditDirector as EventListener);
  }, [current.zones]);

  const afterWrite = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const doRename = useCallback(
    async (value: string) => {
      if (dialog?.kind !== 'rename') return;
      await renameOrgUnit(dialog.id, value);
      await afterWrite();
    },
    [dialog, afterWrite]
  );

  const doAddDepartment = useCallback(
    async (values: { name: string; placement: string }) => {
      if (dialog?.kind !== 'addDepartment') return;
      await createOrgUnitNode({
        type: 'DEPARTMENT',
        parentId: dialog.division.id,
        name: values.name,
        placement: values.placement,
      });
      await afterWrite();
    },
    [dialog, afterWrite]
  );

  const doAddDivision = useCallback(
    async (value: string) => {
      const [name, code] = value.split('|').map((p) => p.trim());
      // The root (country) node is the parent of every division.
      await createOrgUnitNode({
        type: 'DIVISION',
        parentId: current.corporate.id,
        name,
        code: code || undefined,
      });
      await afterWrite();
    },
    [afterWrite, current.corporate.id]
  );

  const doDirector = useCallback(
    async (user: DirectorCandidate | null) => {
      if (dialog?.kind !== 'director') return;
      await setZoneDirector(dialog.zone.id, {
        directorUserId: user?.id ?? null,
        directorName: null,
      });
      await afterWrite();
    },
    [dialog, afterWrite]
  );

  const doDeptDirector = useCallback(
    async (user: DirectorCandidate | null) => {
      if (dialog?.kind !== 'deptDirector') return;
      // Functional directors live on the OrgNode department; resolve it via the
      // nodeId carried on the OrgUnit-backed department (fallback to id).
      await setDepartmentDirector(dialog.department.nodeId ?? dialog.department.id, {
        directorUserId: user?.id ?? null,
        directorName: null,
      });
      await afterWrite();
    },
    [dialog, afterWrite]
  );

  const doDelete = useCallback(
    async (nodeId: string) => {
      await deleteOrgUnit(nodeId);
      await afterWrite();
    },
    [afterWrite]
  );

  const unitTotal = current.divisions.reduce(
    (n, d) => n + d.departments.reduce((m, p) => m + p.units.length, 0),
    0
  );

  const flip = (set: Set<string>, key: string) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  };

  return (
    <OrgShell canEdit={canEdit}>
      <nav className={s.crumbRow} aria-label="Breadcrumb">
        Organization <i>›</i> <b>Overview</b>
      </nav>

      <div className={s.headRow}>
        <div>
          <h1 className={s.h1Big}>Organization overview</h1>
          <p className={s.subLine}>
            Corporate structure, distributed workforce and shared local coordination — in one view.
          </p>
        </div>
        <div className={s.headActions}>
          {canEdit && (
            <>
              <button
                type="button"
                className={cx(s.btnGhost, editMode && s.btnGhostActive)}
                onClick={() => setEditMode((p) => !p)}
                aria-pressed={editMode}
              >
                <Icon name="pencil" size={15} /> {editMode ? 'Done editing' : 'Edit hierarchy'}
              </button>
              <Link href="/dashboard/organization/manage/new" className={s.btnTeal}>
                <Icon name="plus" size={15} /> Add unit
              </Link>
            </>
          )}
          {!canEdit && (
            <span className={s.chipPriv} style={{ background: 'var(--soft)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
              <Icon name="lock" size={13} /> Read-only access
            </span>
          )}
        </div>
      </div>

      <div className={s.ctrlRow}>
        <div className={s.segTabs} role="tablist" aria-label="Organization views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'hierarchy'}
            className={cx(s.segTab, tab === 'hierarchy' && s.segTabActive)}
            onClick={() => setTab('hierarchy')}
          >
            Hierarchy
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'geography'}
            className={cx(s.segTab, tab === 'geography' && s.segTabActive)}
            onClick={() => setTab('geography')}
          >
            By geography
          </button>
        </div>

        <span className={s.ctrlSpacer} />

        <label className={s.searchBox2}>
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find unit or geography"
            aria-label="Find unit or geography"
          />
        </label>
        {tab === 'hierarchy' ? (
          <button type="button" className={s.toolBtn} onClick={() => setExpandTick((n) => n + 1)}>
            <Icon name="expand" size={13} /> Expand all
          </button>
        ) : null}
        <button type="button" className={s.toolBtn} onClick={() => setCollapseTick((n) => n + 1)}>
          <Icon name="collapse" size={13} /> Collapse all
        </button>
        {canEdit && editMode && (
          <button type="button" className={s.toolBtn} onClick={() => setDialog({ kind: 'addDivision' })}>
            <Icon name="plus" size={13} /> Add division
          </button>
        )}
        <select
          className={s.zoomSel}
          value={zoom}
          onChange={(e) => setZoom(e.target.value as typeof zoom)}
          aria-label="Zoom"
        >
          <option value="80">80%</option>
          <option value="100">100%</option>
          <option value="125">125%</option>
        </select>
      </div>

      <div className={s.legendRow}>
        <span>
          <i className={s.legSolid} /> Functional reporting
        </span>
        <span>
          <i className={s.legDash} /> Local operational reporting
        </span>
        <span className={s.legendSpacer} />
        <span>
          {loading
            ? 'Updating…'
            : `Complete workforce structure · ${unitTotal} local units · all departments`}
          {error ? ` · ⚠ ${error}` : ''}
        </span>
      </div>

      {/* Hierarchy tab → full width (no rail). By geography → body + collapsible rail. */}
      <div
        className={s.mainCols}
        style={tab === 'hierarchy' ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}
      >
        <div style={{ zoom: zoom === '100' ? undefined : Number(zoom) / 100, minWidth: 0 }}>
          {tab === 'hierarchy' ? (
            <OrgHierarchyView
              overview={current}
              canEdit={canEdit}
              editMode={editMode}
              query={query}
              expandTick={expandTick}
              collapseTick={collapseTick}
              onRenameNode={(node) =>
                setDialog({ kind: 'rename', id: node.id, name: node.name, nodeKind: node.kind })
              }
              onAddDepartment={(division) => setDialog({ kind: 'addDepartment', division })}
              onAssignDeptDirector={(department) => setDialog({ kind: 'deptDirector', department })}
              onDeleteDivision={async (division) => {
                if (await confirm({ message: `Delete "${division.name}"? It must have no departments or units.`, confirmLabel: "Delete" })) {
                  doDelete(division.id).catch(async (e) => { await alert(e.message); });
                }
              }}
              onDeleteDepartment={async (division, dept) => {
                if (await confirm({ message: `Delete "${division.code} ${dept.name}"? It must have no local units.`, confirmLabel: "Delete" })) {
                  doDelete(dept.id).catch(async (e) => { await alert(e.message); });
                }
              }}
            />
          ) : (
            <OrgGeographyView overview={current} collapseTick={collapseTick} query={query} />
          )}
        </div>

        {/* ── Right rail · Operational Directors (By geography only) ───── */}
        {tab === 'geography' && (
          <aside className={s.rail} aria-label="Operational Directors">
            <div className={cx(s.railCard, s.railCardTeal)}>
              <button
                type="button"
                onClick={() => setRailOpen((o) => !o)}
                aria-expanded={railOpen}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                  background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit',
                }}
              >
                <span style={{ width: 12 }}>{railOpen ? '▾' : '▸'}</span>
                <span style={{ flex: 1 }}>
                  <span className={s.railEyebrow}>Geography-wide</span>
                  <h3 className={s.railTitle} style={{ margin: 0 }}>Operational Directors</h3>
                </span>
                <Icon name="branch" size={15} className={s.railIcon} />
              </button>
              {railOpen && (
                <p className={s.railSub}>
                  One director per zone or region, shared by all local workers across{' '}
                  {current.divisions.map((d) => d.code).join(', ')}.
                </p>
              )}
            </div>

            {railOpen && (
              <div className={s.railCard}>
                {(['ADDIS_ABABA', 'REGION'] as const).map((cat) => {
                  const zones = current.zones.filter((z) => z.category === cat);
                  if (!zones.length) return null;
                  const open = railCats.has(cat);
                  return (
                    <div key={cat}>
                      <button
                        type="button"
                        className={s.railGroup}
                        onClick={() => setRailCats((p) => flip(p, cat))}
                        aria-expanded={open}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                          background: 'none', border: 0, cursor: 'pointer', font: 'inherit',
                        }}
                      >
                        <span style={{ width: 12 }}>{open ? '▾' : '▸'}</span>
                        {cat === 'ADDIS_ABABA' ? 'Addis Ababa' : 'Regions'} · {zones.length}
                      </button>
                      {open &&
                        zones.map((z) => (
                          <div key={z.id} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                            <Link
                              href={geoHref(z.code, z.category)}
                              className={cx(s.railRow, z.unitCount > 0 && s.railRowActive)}
                              style={{ marginBottom: 6 }}
                            >
                              <span className={s.railCode}>{z.code}</span>
                              <span className={s.railRowName}>
                                Operational Director
                                <small>{z.directorName ?? 'Unassigned'}</small>
                              </span>
                              <Icon name="chevronRight" size={13} />
                            </Link>
                            {canEdit && (
                              <button
                                type="button"
                                className={s.iconBtn}
                                aria-label={`Edit ${z.code} Operational Director`}
                                onClick={() => setDialog({ kind: 'director', zone: z })}
                                style={{ alignSelf: 'center' }}
                              >
                                <Icon name="pencil" size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  );
                })}

                <p className={s.railNote}>
                  <Icon name="help" size={13} />
                  Local coordination is additional reporting, not a replacement for the functional department.
                </p>

                {canEdit && (
                  <button
                    type="button"
                    className={s.railBtn}
                    onClick={() => {
                      setEditMode(true);
                      const first = current.zones[0];
                      if (first) setDialog({ kind: 'director', zone: first });
                    }}
                  >
                    <Icon name="sliders" size={14} /> Manage directors
                  </button>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────── */}
      {dialog?.kind === 'rename' && (
        <TextDialog
          title={`Rename ${dialog.nodeKind === 'DIVISION' ? 'division' : 'department'}`}
          subtitle="Local unit names embed the division code and department name — renames here do not rewrite existing unit names."
          label="Name"
          initial={dialog.name}
          onClose={() => setDialog(null)}
          onSubmit={doRename}
        />
      )}

      {dialog?.kind === 'addDepartment' && (
        <DepartmentCreateDialog
          division={dialog.division}
          onClose={() => setDialog(null)}
          onSubmit={doAddDepartment}
        />
      )}

      {dialog?.kind === 'addDivision' && (
        <TextDialog
          title="Add division"
          subtitle="Use “Name | Code” — e.g. “IN Division | IN”."
          label="Division name and code"
          placeholder="IN Division | IN"
          onClose={() => setDialog(null)}
          onSubmit={doAddDivision}
        />
      )}

      {dialog?.kind === 'director' && (
        <DirectorPickerDialog
          title={`${dialog.zone.code} Operational Director`}
          subtitle="One geography-wide role shared by every local worker in this zone or region, across all divisions and departments."
          currentUserId={dialog.zone.directorUserId}
          unassignLabel="Clear assignment"
          onClose={() => setDialog(null)}
          onSubmit={doDirector}
        />
      )}

      {dialog?.kind === 'deptDirector' && (
        <DirectorPickerDialog
          title={`${dialog.department.name} Functional Director`}
          subtitle="One functional director per department. This is the department's own head — distinct from the shared Operational Director of a geography."
          currentUserId={dialog.department.directorUserId}
          unassignLabel="Clear assignment"
          onClose={() => setDialog(null)}
          onSubmit={doDeptDirector}
        />
      )}
    </OrgShell>
  );
}
