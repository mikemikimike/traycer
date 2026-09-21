/**
 * The sidebar's nine panels, as ids and as the grouping the rail draws them in.
 *
 * Zero imports by design, for the same reason `lib/layout/region-id.ts` has
 * none: the layout model owns the rail's shape (`lib/layout/rail.ts`), the
 * panel store owns each panel's view state, and the sidebar components own the
 * panels themselves - so the vocabulary all three speak cannot sit inside any
 * one of them without making the other two depend on it.
 */

export const LEFT_PANEL_IDS = [
  "chats",
  "terminals",
  "browsers",
  "artifacts",
  "git-diff",
  "pull-requests",
  "file-tree",
  "sharing",
  "comments",
] as const;

export type LeftPanelId = (typeof LEFT_PANEL_IDS)[number];

export function isLeftPanelId(value: unknown): value is LeftPanelId {
  return LEFT_PANEL_IDS.some((panelId) => panelId === value);
}

/** One rail group: the panels between two dividers, in the order they are drawn. */
export interface LeftPanelGroup {
  readonly panelIds: ReadonlyArray<LeftPanelId>;
}

/**
 * Explicit show/hide the user chose. An absent entry means the panel follows
 * its own presence rule, which is what keeps the map sparse.
 */
export type PanelVisibilityOverrideById = Readonly<
  Partial<Record<LeftPanelId, boolean>>
>;

export function areLeftPanelGroupsEqual(
  left: ReadonlyArray<LeftPanelGroup>,
  right: ReadonlyArray<LeftPanelGroup>,
): boolean {
  return (
    left.length === right.length &&
    left.every((group, groupIndex) => {
      const rightGroup = right[groupIndex];
      return (
        group.panelIds.length === rightGroup.panelIds.length &&
        group.panelIds.every(
          (panelId, panelIndex) => rightGroup.panelIds[panelIndex] === panelId,
        )
      );
    })
  );
}
