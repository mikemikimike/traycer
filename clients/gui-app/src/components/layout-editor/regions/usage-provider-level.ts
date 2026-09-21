import type { SegmentOption } from "@/components/layout-editor/regions/region-grammar";

/**
 * One provider's own screen, reached from the Usage limits section's children
 * row (L-26): which of that provider's limits its segment draws, and whether it
 * draws at all.
 *
 * Everything here is about ONE provider. The prototype's "Segment details"
 * block is deliberately not carried over: two of its three rows wrote a global
 * value from a per-provider screen, which is the one mistake a second level
 * makes easy (C-23).
 */
export const USAGE_PROVIDER_LEVEL = {
  where: "Status bar - one segment of the usage cluster",
  limitsLabel: "Limits",
  limitsDescription: "Automatic follows the plan reported by the provider.",
  limitsOptions: [
    { value: "automatic", label: "Automatic (recommended)" },
    { value: "choose", label: "Choose..." },
  ] as ReadonlyArray<SegmentOption>,
  /** The checklist `Choose...` opens: this provider's own live windows (L-96). */
  limitsPickLabel: "Limits to draw",
  /**
   * What stands where the checklist would be when the provider has reported
   * nothing yet. Not an error: a provider is read lazily, so "no windows" is
   * the ordinary state of one nobody has used this session - and with nothing
   * to pick, `Automatic` is the only answer there is.
   */
  limitsEmpty: "No limits reported yet - showing the tightest one.",
};
