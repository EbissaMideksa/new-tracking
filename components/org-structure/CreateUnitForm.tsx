'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { OrgShell } from './OrgShell';
import { Icon } from './Icon';
import { cx } from './Popover';
import { createUnit } from '@/lib/org/orgApi';
import { CATEGORY_LABEL, buildUnitName, type GeoCategory, type OrgOverview } from '@/lib/org/types';
import s from './org.module.css';

interface Props {
  overview: OrgOverview;
  canEdit: boolean;
  initialDepartmentId?: string;
  initialZoneId?: string;
}

/** Screen 3 (design p3) — "Create organization unit": pick a functional parent
 *  in the expandable Placement-in-Hierarchy tree, scope it to one geography.
 *  The Reporting-preview column visualises the two reporting relationships. */
export function CreateUnitForm({ overview, canEdit, initialDepartmentId, initialZoneId }: Props) {
  const router = useRouter();

  const depts = useMemo(
    () => overview.divisions.flatMap((division) => division.departments.map((dept) => ({ division, dept }))),
    [overview],
  );
  const initialZone = overview.zones.find((z) => z.id === initialZoneId);

  const [departmentId, setDepartmentId] = useState(
    depts.some((d) => d.dept.id === initialDepartmentId) ? initialDepartmentId! : '',
  );
  const [category, setCategory] = useState<GeoCategory>(initialZone?.category ?? 'ADDIS_ABABA');
  const [zoneId, setZoneId] = useState(initialZone?.id ?? '');
  // Expandable nodes of the placement tree (divisions, departments, categories, zones).
  const [open, setOpen] = useState<Set<string>>(() => {
    const initial = depts.find((d) => d.dept.id === initialDepartmentId);
    const seeds: string[] = [];
    if (initial) {
      seeds.push(initial.division.id, initial.dept.id);
      if (initialZone) seeds.push(`cat:${initialZone.category}`, `zone:${initialZone.id}`);
    }
    return new Set(seeds);
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = depts.find((d) => d.dept.id === departmentId) ?? null;
  const zone = overview.zones.find((z) => z.id === zoneId) ?? null;
  const zonesInCategory = overview.zones.filter((z) => z.category === category);

  const unitName = selected && zone ? buildUnitName(zone.code, selected.division.code, selected.dept.name) : '';
  const duplicate = !!(selected && zone && selected.dept.units.some((u) => u.zoneId === zone.id));
  const valid = !!(selected && zone && !duplicate);
  const disabled = !canEdit || submitting;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const selectDept = (id: string) => {
    setDepartmentId(id);
    setError(null);
    const d = depts.find((x) => x.dept.id === id);
    if (d) setOpen((p) => new Set(p).add(d.division.id).add(d.dept.id));
  };

  const changeCategory = (cat: GeoCategory) => {
    setCategory(cat);
    if (zone && zone.category !== cat) setZoneId('');
    setError(null);
  };

  const pickZone = (id: string) => {
    setZoneId(id);
    setError(null);
    const z = overview.zones.find((x) => x.id === id);
    if (z) setOpen((p) => new Set(p).add(`cat:${z.category}`).add(`zone:${z.id}`));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || disabled || !zone) return;
    setSubmitting(true);
    setError(null);
    try {
      await createUnit({ departmentId, zoneId });
      router.push(`/dashboard/organization/zones/${zone.code}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the unit.');
      setSubmitting(false);
    }
  };

  return (
    <OrgShell canEdit={canEdit}>
      <nav className={s.cuCrumbs} aria-label="Breadcrumb">
        Organization <i>›</i> Manage hierarchy / New unit
      </nav>

      <div className={s.cuHead}>
        <div>
          <h1 className={s.h1Big}>Create organization unit</h1>
          <p className={s.subLine}>
            Add a geographic workforce unit without changing the corporate division or department structure.
          </p>
        </div>
        <Link href="/dashboard/organization" className={s.btnGhost}>
          <Icon name="arrowLeft" size={15} /> Back to hierarchy
        </Link>
      </div>

      <div className={cx(s.bannerWide, !canEdit && s.bannerWideWarn)}>
        <Icon name="shield" size={15} />
        <strong>
          {canEdit ? 'Hierarchy editing enabled · Privileged user' : 'Hierarchy editing disabled · Read-only access'}
        </strong>
        <span>{canEdit ? 'All other roles have view-only access' : 'Ask an administrator for hierarchy permission'}</span>
      </div>

      <form className={s.createCols3} onSubmit={submit} noValidate>
        {/* ── Placement in hierarchy (expandable / collapsible) ──── */}
        <div>
          <section className={s.cuCard}>
            <header className={s.cuCardHead}>
              <h3>Placement in hierarchy</h3>
              <Icon name="branch" size={16} />
            </header>

            <div className={s.placeTree}>
              <span className={cx(s.pRow, s.pRowRoot)}>
                <span className={s.pChev}>▾</span>
                <Icon name="globe" size={14} /> {overview.name}
              </span>

              <div className={s.pKids}>
                {overview.divisions.map((d) => {
                  const divOpen = open.has(d.id);
                  const isSelectedDept = d.departments.some((p) => p.id === departmentId);
                  return (
                    <div key={d.id}>
                      <button
                        type="button"
                        className={cx(s.pRow, isSelectedDept && s.pRowStrong)}
                        onClick={() => toggle(d.id)}
                        aria-expanded={divOpen}
                      >
                        <span className={s.pChev}>{divOpen ? '▾' : '▸'}</span>
                        {d.name}
                      </button>

                      {divOpen && (
                        <div className={s.pKids}>
                          {d.departments.map((p) => {
                            const deptOpen = open.has(p.id);
                            const on = p.id === departmentId;
                            return (
                              <div key={p.id}>
                                <button
                                  type="button"
                                  className={cx(s.pRow, on && s.pRowSel)}
                                  onClick={() => (on ? toggle(p.id) : selectDept(p.id))}
                                  aria-expanded={on ? deptOpen : undefined}
                                >
                                  <span className={s.pChev}>{on && deptOpen ? '▾' : '▸'}</span>
                                  {p.name}
                                </button>

                                {on && deptOpen && (
                                  <div className={s.pKids}>
                                    <p className={s.pMeta}>
                                      <span className={s.pChip}>
                                        <Icon name="building" size={10} /> {overview.corporate.name}
                                      </span>
                                    </p>
                                    <p className={s.pMeta}>Corporate workforce</p>

                                    {(['ADDIS_ABABA', 'REGION'] as const).map((cat) => {
                                      const catKey = `cat:${cat}`;
                                      const catOpen = open.has(catKey);
                                      const catZones = overview.zones.filter((z) => z.category === cat);
                                      return (
                                        <div key={cat}>
                                          <button
                                            type="button"
                                            className={cx(s.pRow, s.pRowStrong)}
                                            onClick={() => toggle(catKey)}
                                            aria-expanded={catOpen}
                                          >
                                            <span className={s.pChev}>{catOpen ? '▾' : '▸'}</span>
                                            {cat === 'ADDIS_ABABA' ? 'Addis Ababa' : 'Regions'}
                                          </button>

                                          {catOpen && (
                                            <div className={s.pKids}>
                                              {catZones.map((z) => {
                                                const zoneKey = `zone:${z.id}`;
                                                const zoneOpen = open.has(zoneKey);
                                                const existing = p.units.find((u) => u.zoneId === z.id);
                                                const proposed = buildUnitName(z.code, d.code, p.name);
                                                return (
                                                  <div key={z.id}>
                                                    <button
                                                      type="button"
                                                      className={cx(s.pRow, s.pRowMuted, zoneId === z.id && s.pRowSel)}
                                                      onClick={() =>
                                                        zoneId === z.id ? toggle(zoneKey) : pickZone(z.id)
                                                      }
                                                      aria-expanded={zoneOpen}
                                                    >
                                                      <span className={s.pChev}>
                                                        {zoneOpen ? '▾' : existing ? '▸' : '·'}
                                                      </span>
                                                      {z.code}
                                                    </button>

                                                    {zoneOpen && (
                                                      <div className={s.pKids}>
                                                        <span className={s.pMeta}>
                                                          {existing ? existing.name : proposed}
                                                        </span>
                                                        <button
                                                          type="button"
                                                          className={s.pNew}
                                                          onClick={() => pickZone(z.id)}
                                                        >
                                                          <Icon name="plus" size={12} />{' '}
                                                          {existing ? existing.name : proposed}
                                                        </button>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={cx(s.cuCard, s.repNoteTeal)} style={{ marginTop: 14 }}>
            <strong style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Corporate structure stays intact</strong>
            <p style={{ fontSize: 11.5, color: '#4b6b67', lineHeight: 1.55 }}>
              Divisions and departments remain at {overview.corporate.name}. This unit groups distributed workers
              in {zone?.code ?? 'the selected geography'}.
            </p>
          </section>
        </div>

        {/* ── Unit details ───────────────────────────────────────── */}
        <section className={s.cuCard}>
          <header className={s.cuCardHead}>
            <div>
              <h3>Unit details</h3>
              <p>Define its place in the functional and geographic structure.</p>
            </div>
            <span className={s.cuUnsaved}>Unsaved</span>
          </header>

          <div className={s.cuField}>
            <label htmlFor="unit-type">Unit type *</label>
            <select id="unit-type" className={s.cuSelect} value="geo" disabled onChange={() => {}}>
              <option value="geo">Geographic workforce unit</option>
            </select>
            <p className={s.cuHelp}>A combined unit under a department, scoped to one zone or region.</p>
          </div>

          <div className={s.cuField}>
            <label htmlFor="unit-name">Unit name *</label>
            <div className={s.cuInputLocked}>
              <input id="unit-name" value={unitName} readOnly placeholder="Select a parent and a zone" />
              <Icon name="lock" size={14} />
            </div>
            <p className={s.cuHelp}>Use geography + division + department. No additional unit suffix is needed.</p>
          </div>

          <div className={s.cuDivider} />
          <p className={s.cuSectionLabel}>Functional placement</p>

          <div className={s.cuField}>
            <label htmlFor="parent">Parent *</label>
            <select
              id="parent"
              className={s.cuSelect}
              value={departmentId}
              disabled={disabled}
              onChange={(e) => selectDept(e.target.value)}
            >
              <option value="">Select a department…</option>
              {depts.map(({ division, dept }) => (
                <option key={dept.id} value={dept.id}>
                  {overview.name} / {division.name} / {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className={s.cuField}>
            <label htmlFor="func-dept">Functional department</label>
            <div className={s.cuInputLocked}>
              <input
                id="func-dept"
                readOnly
                value={selected ? `${selected.division.name} · ${selected.dept.name}` : ''}
                placeholder="Inherited from the selected parent"
              />
              <Icon name="lock" size={14} />
            </div>
            <p className={s.cuHelp}>
              Inherited from the parent department · located at {overview.corporate.name}.
            </p>
          </div>

          <div className={s.cuDivider} />
          <p className={s.cuSectionLabel}>Workforce location</p>

          <div className={s.cuTwoCol}>
            <div className={s.cuField}>
              <label htmlFor="category">Category *</label>
              <select
                id="category"
                className={s.cuSelect}
                value={category}
                disabled={disabled}
                onChange={(e) => changeCategory(e.target.value as GeoCategory)}
              >
                <option value="ADDIS_ABABA">{CATEGORY_LABEL.ADDIS_ABABA}</option>
                <option value="REGION">{CATEGORY_LABEL.REGION}</option>
              </select>
            </div>
            <div className={s.cuField}>
              <label htmlFor="zone">{category === 'REGION' ? 'Region' : 'Zone'} *</label>
              <select
                id="zone"
                className={s.cuSelect}
                value={zoneId}
                disabled={disabled}
                onChange={(e) => pickZone(e.target.value)}
              >
                <option value="">Select…</option>
                {zonesInCategory.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={s.cuInherit}>
            <div className={s.cuInheritHead}>
              Local Operational Director
              <span className={s.cuInheritBadge}>
                <Icon name="lock" size={11} /> Inherited
              </span>
            </div>
            {zone ? (
              <>
                <h4>{zone.code} Operational Director</h4>
                <p>
                  Automatically shared with all {zone.code} workers across{' '}
                  {overview.divisions.map((d) => d.code).join(' and ')}. This form does not create or assign
                  another director.
                </p>
              </>
            ) : (
              <p>Choose a {category === 'REGION' ? 'region' : 'zone'} to see the shared director this unit will inherit.</p>
            )}
          </div>

          {(duplicate || error) && (
            <p className={s.modalError} role="alert" style={{ marginTop: 12 }}>
              {duplicate ? `${unitName} already exists.` : error}
            </p>
          )}

          <footer className={s.cuFoot}>
            <span className={s.cuFootNote}>* Required fields</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Link href="/dashboard/organization" className={s.btnGhost}>
                Cancel
              </Link>
              <button type="submit" className={s.btnTeal} disabled={!valid || disabled}>
                <Icon name="plus" size={14} /> {submitting ? 'Creating…' : 'Create unit'}
              </button>
            </span>
          </footer>
        </section>

        {/* ── Reporting preview ──────────────────────────────────── */}
        <section className={s.cuCard} aria-live="polite">
          <header className={s.cuCardHead}>
            <div>
              <h3>Reporting preview</h3>
              <p>One workforce group with two reporting relationships.</p>
            </div>
            <Icon name="branch" size={16} />
          </header>

          <div className={s.repBox}>
            <p className={s.repLabel}>Functional parent</p>
            <p className={s.repName}>{selected ? `${selected.division.name.replace(' Division', '')} ${selected.dept.name}` : '—'}</p>
            <p className={s.repMeta}>
              <Icon name="building" size={12} /> {overview.corporate.name}
            </p>
          </div>

          <p className={s.repLink}>Functional reporting</p>

          <div className={cx(s.repBox, s.repBoxTeal)}>
            <p className={cx(s.repLabel, s.repLabelTeal)}>New unit</p>
            <p className={cx(s.repName, s.repNameTeal)}>{unitName || '—'}</p>
            <p className={s.repMeta}>
              <Icon name="users" size={12} /> Workers · {zone?.code ?? '—'}
            </p>
          </div>

          <p className={cx(s.repLink, s.repLinkDash)}>Additional local reporting</p>

          <div className={cx(s.repBox, s.repBoxOut)}>
            <p className={cx(s.repLabel, s.repLabelTeal)}>Geography-wide role</p>
            <p className={s.repName}>{zone ? `${zone.code} Operational Director` : '—'}</p>
            <p className={s.repMeta}>Shared by every {zone?.code ?? 'zone'} unit, not assigned per department.</p>
          </div>

          <div className={cx(s.repNoteCard, s.repNoteTeal)}>
            <strong>Director assignment is geography-wide</strong>
            <p>
              Change the {zone?.code ?? 'geography'} director in geography settings. Any change applies to all{' '}
              {zone?.code ?? 'geography'} workers, regardless of division or department.
            </p>
            {zone && (
              <Link href={`/dashboard/organization/zones/${zone.code}`} className={s.repNoteLink}>
                <Icon name="arrowUpRight" size={13} /> {zone.code} geography settings
              </Link>
            )}
          </div>
        </section>
      </form>
    </OrgShell>
  );
}
