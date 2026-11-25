'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from './Icon';
import { cx } from './Popover';
import s from './org.module.css';

/** Org workspace sidebar — matches design.pdf p1: Ethiopia switcher,
 *  ORGANIZATION + ADMINISTRATION sections and the "Structure model" card. */
export function OrgSidebar() {
  const pathname = usePathname();

  const isOverview = pathname === '/dashboard/organization';
  const isZones = pathname.startsWith('/dashboard/organization/zones');
  const isRegions = pathname.startsWith('/dashboard/organization/regions');
  const isManage = pathname.startsWith('/dashboard/organization/manage');

  const orgItems: { href: string; label: string; icon: IconName; active: boolean }[] = [
    { href: '/dashboard/organization', label: 'Overview', icon: 'users', active: isOverview },
    { href: '/dashboard/organization/zones', label: 'Zones', icon: 'building', active: isZones },
    { href: '/dashboard/organization/regions', label: 'Regions', icon: 'pin', active: isRegions },
    { href: '/dashboard/organization/manage/new', label: 'Manage hierarchy', icon: 'branch', active: isManage },
  ];
  const adminItems: { href: string; label: string; icon: IconName }[] = [
    { href: '/dashboard/admin/permissions', label: 'Roles & permissions', icon: 'shield' },
    { href: '/dashboard/admin/settings', label: 'Workspace settings', icon: 'sliders' },
  ];

  return (
    <aside className={s.side}>
      <div className={s.sideTop}>
        <button type="button" className={s.sideSwitch} aria-label="Switch organization">
          <Icon name="globe" size={17} />
          <span className={s.sideSwitchName}>Ethiopia</span>
          <Icon name="switcher" size={13} className={s.sideSwitchChev} />
        </button>
      </div>

      <nav className={s.sideNav} aria-label="Organization navigation">
        <div className={s.sideSection}>Organization</div>
        <ul>
          {orgItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cx(s.sideItem, item.active && s.sideItemActive)}
                aria-current={item.active ? 'page' : undefined}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className={s.sideSection}>Administration</div>
        <ul>
          {adminItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={s.sideItem}>
                <Icon name={item.icon} size={16} />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className={s.sideFootCard}>
        <Icon name="layers" size={17} />
        <h4>Structure model</h4>
        <p>Organizational units and reporting relationships. No employee records shown.</p>
      </div>
    </aside>
  );
}
