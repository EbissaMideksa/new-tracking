//components/org-structure/OrgShell.tsx
'use client';

import type { ReactNode } from 'react';
import { OrgSidebar } from './OrgSidebar';
import { OrgTopbar } from './OrgTopbar';
import s from './org.module.css';

/** Layout shell shared by every organization screen:
 *  org sidebar (left) + global workspace bar + scrollable page column. */
export function OrgShell({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  return (
    <div className={s.shell}>
      <OrgSidebar />
      <div className={s.pageCol}>
        <OrgTopbar canEdit={canEdit} />
        <div className={s.pageScroll}>
          <div className={s.pageBody}>{children}</div>
        </div>
      </div>
    </div>
  );
}