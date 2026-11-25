// lib/org/useOrg.ts — React hook for fetching org data from the API.
// Provides reactive data fetching with manual refresh capability.
import { useCallback, useEffect, useState } from "react";
import { fetchOrgOverview, type OrgOverviewResponse } from "./orgApi";

interface UseOrgResult {
  overview: OrgOverviewResponse["overview"] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/** Hook that fetches org overview from the API on mount and on refetch(). */
export function useOrg(): UseOrgResult {
  const [overview, setOverview] = useState<OrgOverviewResponse["overview"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrgOverview();
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load org data.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { overview, loading, error, refetch: fetchData };
}
