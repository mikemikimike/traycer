/**
 * Every region the layout editor can address, as one flat union.
 *
 * Zero imports by design: the value model, the arrangement, the region
 * registry and the settings-search index all name these ids, and a module
 * that owned the union alongside anything else would put one of them in a
 * cycle with the rest.
 *
 * A region is a THING ON SCREEN, not a setting: `usageLimits` is the one
 * region the three old usage rows collapsed into (L-28), and the sidebar rail
 * is nine regions rather than one list, because each icon is hoverable,
 * selectable and separately shown or hidden.
 */

/** The composer toolbar's movable elements. Send is not one - it renders last. */
export type ToolbarRegionId =
  | "attachImage"
  | "access"
  | "agent"
  | "model"
  | "mic";

/** The three rows above the message box, which share one order. */
export type DockRegionId = "runningAgents" | "changedFiles" | "background";

/**
 * The sidebar rail's nine panels. Named for what they are rather than for the
 * panel ids they map onto (`chats` is titled "Agents"), which is what the rail
 * shows and what a person searching for one would type.
 */
export type RailRegionId =
  | "railAgents"
  | "railTerminals"
  | "railBrowsers"
  | "railArtifacts"
  | "railGitDiff"
  | "railPullRequests"
  | "railFileTree"
  | "railSharing"
  | "railComments";

export type RegionId =
  | "homeTab"
  | "usageLimits"
  | "resourceMonitor"
  | "minimap"
  | "contextUsage"
  | DockRegionId
  | ToolbarRegionId
  | RailRegionId;
