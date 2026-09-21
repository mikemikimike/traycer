import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import type { RegionId } from "@/lib/layout/region-id";

/** The index's filter (L-07), which matches on what a region SAYS about itself. */

/** Whether a region's name or keywords match, which is what the index filters on. */
export function regionMatchesFilter(region: RegionId, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  const entry = regionFacts(region);
  return [entry.name, ...entry.keywords].some((term) =>
    term.toLowerCase().includes(needle),
  );
}

/**
 * Whether the match is inside Fine-tune, which is what auto-expands it: a
 * person who typed "reset" is looking at a row that is collapsed by default,
 * and a section that stayed shut would read as no match at all.
 */
export function fineTuneMatchesFilter(
  region: RegionId,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return false;
  return regionFacts(region).rows.some(
    (row) =>
      row.kind === "fine-tune" &&
      row.rows.some((fineTuneRow) =>
        fineTuneRow.label.toLowerCase().includes(needle),
      ),
  );
}
