'use client';

import { Icon } from './Icon';
import s from './org.module.css';

/** Global workspace bar — "telecom · Organization workspace" with the
 *  privilege chip, matching design.pdf. Rendered inside OrgShell. */
export function OrgTopbar({ canEdit }: { canEdit: boolean }) {
  return (
    <header className={s.topBar}>
      <span className={s.brandMark}>
        <Icon name="branch" size={16} />
      </span>
      <span className={s.brandName}>telecom</span>
      <span className={s.brandDivider} />
      <span className={s.brandSub}>Organization workspace</span>

      <div className={s.topBarRight}>
        {canEdit ? (
          <span className={s.chipPriv}>
            <Icon name="shield" size={13} /> Privileged user
          </span>
        ) : (
          <span className={s.chipPriv} style={{ background: 'var(--soft)', borderColor: 'var(--line)', color: 'var(--muted)' }}>
            <Icon name="lock" size={13} /> View only
          </span>
        )}
        <button type="button" className={s.roundBtn} aria-label="Help">
          <Icon name="help" size={15} />
        </button>
        <span className={s.avatarCircle} aria-hidden="true">
          <Icon name="user" size={16} />
        </span>
      </div>
    </header>
  );
}
