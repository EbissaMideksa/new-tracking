import { GeographiesIndex } from "@/components/org-structure/GeographiesIndex";
import { canEditHierarchy } from "@/lib/org/permissions";
import { getOrgOverview } from "@/lib/org/orgService";

/** /dashboard/organization/regions — regional units (category REGION).
 *  Addis Ababa zones live on /dashboard/organization/zones. */
export const dynamic = "force-dynamic";

export default async function RegionsPage() {
  const [overview, canEdit] = await Promise.all([getOrgOverview(), canEditHierarchy()]);
  return <GeographiesIndex overview={overview} canEdit={canEdit} category="REGION" />;
}