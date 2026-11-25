import { GeographiesIndex } from "@/components/org-structure/GeographiesIndex";
import { canEditHierarchy } from "@/lib/org/permissions";
import { getOrgOverview } from "@/lib/org/orgService";

/** /dashboard/organization/zones — Addis Ababa zones (category ADDIS_ABABA).
 *  Regional units live on /dashboard/organization/regions. */
export const dynamic = "force-dynamic";

export default async function ZonesPage() {
  const [overview, canEdit] = await Promise.all([getOrgOverview(), canEditHierarchy()]);
  return <GeographiesIndex overview={overview} canEdit={canEdit} category="ADDIS_ABABA" />;
}
