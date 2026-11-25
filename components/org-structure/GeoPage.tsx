import { notFound, redirect } from 'next/navigation';
import { getOrgOverview } from '@/lib/org/orgService';
import { canEditHierarchy } from '@/lib/org/permissions';
import { ZoneCoordinationView } from './ZoneCoordinationView';

/** Shared by /zones/[id] and /regions/[id]. `id` is the geography code (e.g. EAAZ, CWR). */
export async function renderGeoPage(id: string, section: 'zones' | 'regions') {
  const [overview, canEdit] = await Promise.all([getOrgOverview(), canEditHierarchy()]);
  const key = decodeURIComponent(id).toLowerCase();
  const zone = overview.zones.find((z) => z.code.toLowerCase() === key || z.id.toLowerCase() === key);
  if (!zone) notFound();

  const correct = zone.category === 'REGION' ? 'regions' : 'zones';
  if (correct !== section) {
    redirect(`/dashboard/organization/${correct}/${encodeURIComponent(zone.code)}`);
  }

  return <ZoneCoordinationView overview={overview} zone={zone} canEdit={canEdit} />;
}

