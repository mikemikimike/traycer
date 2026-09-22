import {
  alwaysAvailable,
  isMobileFooterRowAvailable,
} from "@/lib/settings/settings-availability";
import { defineSettingsSection } from "@/lib/settings-search/settings-definitions";

/**
 * Where the app's own chrome sits and how much of it shows.
 *
 * The page is the full-width host for the SAME section tree the inspector
 * docks (L-03), so this collection describes only what search has to land on:
 * the page, the presets block, one anchor per surface group, and the one row
 * that belongs to a surface rather than to a region (L-51).
 *
 * The regions themselves are not listed here. They come from
 * `components/layout-editor/layout-search.definitions.ts`, generated from the region
 * registry, because the registry is already the one description of a region's
 * name and its keywords and a second copy here could only drift from it.
 */
export const LAYOUT = defineSettingsSection("layout", {
  page: {
    availableWhen: alwaysAvailable,
    label: "Layout",
    description: "Where the app's chrome sits and how much of it shows.",
    keywords: [
      "chrome",
      "customize",
      "footer",
      "header",
      "arrange",
      "position",
      "visibility",
    ],
  },
  /**
   * The card holding the way into the canvas editor (L-15, L-33), and the
   * coachmark target the "Appearance and layout" guide ends on (L-50).
   *
   * The card contributes its words to the row inside it rather than owning an
   * entry of its own: both say "Customize layout", and two results under one
   * name on one page is a choice with no answer.
   */
  customize: {
    kind: "group",
    search: { contributesTo: "customizeEntry" },
    label: "Customize layout",
    description: null,
    breadcrumb: null,
    availableWhen: alwaysAvailable,
    keywords: [],
  },
  customizeEntry: {
    kind: "row",
    group: "customize",
    search: { anchor: "layout-customize" },
    label: "Customize layout",
    // What pressing it actually does (L-87): the editor always opens a sample
    // workspace, so the user's own task is never rearranged under them. The old
    // copy said "where it lives", which read as "in your task".
    description:
      "Point at the app's own chrome in a sample workspace and change it there. Everything below is the same set of settings.",
    availableWhen: alwaysAvailable,
    keywords: [
      "customize",
      "edit",
      "editor",
      "arrange",
      "move",
      "reorder",
      "drag",
      "visual",
    ],
  },
  // First on the page: the coarsest control here, and the one every section
  // below is measured against ("Compact + 3 changes").
  presets: {
    kind: "group",
    search: { anchor: "layout-presets" },
    label: "Presets",
    description: null,
    breadcrumb: null,
    availableWhen: alwaysAvailable,
    keywords: [
      "preset",
      "compact",
      "detailed",
      "reset",
      "defaults",
      "density",
      "custom",
    ],
  },
  topBar: {
    kind: "group",
    search: { anchor: "layout-surface-top-bar" },
    label: "Top bar",
    description: null,
    breadcrumb: null,
    availableWhen: alwaysAvailable,
    keywords: ["tabs", "home", "title bar"],
  },
  taskTabLayout: {
    kind: "row",
    group: "topBar",
    search: { anchor: "layout-task-tab-layout" },
    label: "Task tab layout",
    description:
      "Scroll keeps titles readable. Shrink to fit makes tabs narrower as you open more.",
    availableWhen: alwaysAvailable,
    keywords: [
      "task tabs",
      "scroll",
      "shrink",
      "overflow",
      "hidden",
      "count",
      "chrome",
    ],
  },
  sidebar: {
    kind: "group",
    search: { anchor: "layout-surface-sidebar" },
    label: "Sidebar",
    description: null,
    breadcrumb: null,
    availableWhen: alwaysAvailable,
    keywords: ["rail", "panels", "icons", "order", "group"],
  },
  chat: {
    kind: "group",
    search: { anchor: "layout-surface-chat" },
    label: "Chat",
    description: null,
    breadcrumb: null,
    availableWhen: alwaysAvailable,
    keywords: ["transcript", "minimap", "context"],
  },
  composer: {
    kind: "group",
    search: { anchor: "layout-surface-composer" },
    label: "Composer",
    description: null,
    breadcrumb: null,
    availableWhen: alwaysAvailable,
    keywords: ["toolbar", "dock", "message box", "buttons"],
  },
  statusBar: {
    kind: "group",
    search: { anchor: "layout-surface-status-bar" },
    label: "Status bar",
    description: null,
    breadcrumb: null,
    availableWhen: alwaysAvailable,
    keywords: ["footer", "strip", "usage", "resources"],
  },
  /*
   * There is no surface-tier row for where the strip's readings live any more
   * (L-156). "Show these in" moved both at once and said so in its own copy;
   * each reading now names its own bar and its own end of it, on its own
   * region row, which is where the page draws them - the same Position and
   * Side rows the inspector draws (L-03). A region's search entries are
   * generated from the registry
   * (`components/layout-editor/layout-search.definitions.ts`), so the two
   * picks are findable without an entry here.
   */
  /**
   * The grammar's surface tier (L-51): it belongs to no region, and it decides
   * whether the strip exists at all on a narrow viewport. Only the installed
   * mobile app withholds the footer by default, so only that build has the
   * switch; every other build draws the strip whenever a reading still names
   * it.
   */
  mobileFooter: {
    kind: "row",
    group: "statusBar",
    search: { anchor: "layout-mobile-footer" },
    label: "Show the status bar on small screens",
    description: null,
    availableWhen: isMobileFooterRowAvailable,
    keywords: ["footer", "phone", "mobile", "small screen", "status bar"],
  },
  /**
   * Last on the page, and the only card with a tone (redesign 4.4).
   *
   * "Reset everything" used to be `variant="muted" size="sm"` on the same line
   * as "Reset to Compact", inside the Presets card: the one irreversible
   * action on the page, styled and placed as the least consequential of the
   * three. The house orders groups by frequency and risk with destructive
   * last, and has a `tone="danger"` group for exactly this. The confirm stays
   * (L-108) - this host has no Undo.
   */
  resetEverything: {
    kind: "group",
    search: { anchor: "layout-reset-everything" },
    label: "Reset everything",
    description: null,
    breadcrumb: null,
    availableWhen: alwaysAvailable,
    keywords: ["reset", "default", "start over", "restore", "undo all"],
  },
  resetEverythingAction: {
    kind: "row",
    group: "resetEverything",
    // The card's own name and this row's are the same words, and two results
    // under one name on one page is a choice with no answer - the same reason
    // the Customize card folds into its row.
    search: { contributesTo: "resetEverything" },
    label: "Put the whole layout back",
    description:
      "Every setting, and where everything sits, go back to how the app shipped. This cannot be undone here.",
    availableWhen: alwaysAvailable,
    keywords: [],
  },
});
