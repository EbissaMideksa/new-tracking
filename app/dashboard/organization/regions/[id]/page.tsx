import { renderGeoPage } from '@/components/org-structure/GeoPage';

export const dynamic = 'force-dynamic';

export default async function RegionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderGeoPage(id, 'regions');
}

