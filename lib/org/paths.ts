import type { GeoCategory } from '@/lib/org/types';

/** Regions live under /regions, Addis Ababa zones under /zones. */
export const geoHref = (code: string, category?: GeoCategory | string | null) =>
  `/dashboard/organization/${category === 'REGION' ? 'regions' : 'zones'}/${encodeURIComponent(code)}`;

