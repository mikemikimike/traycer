import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type {
  LayoutArrangement,
  OrderGroupId,
  UsageHost,
} from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * The grammar every region's section is written in (L-08), and the few row
 * shapes and option sets more than one surface reuses.
 *
 * A section is not written per region anywhere: a region declares its rows in
 * the fixed grammar order and one renderer draws them, which is what keeps the
 * docked inspector and the full-width `Settings > Layout` host the same form
 * (L-03). Every row is generic over the region id, so a row naming a key the
 * region does not have is a compile error rather than a runtime test (C-20).
 *
 * The regions themselves are the five per-surface tables beside this file; the
 * index that joins them is `layout-regions.ts`.
 */

export type SurfaceGroupId =
  | "topBar"
  | "sidebar"
  | "chat"
  | "composer"
  | "statusBar";

/** The index's groups, in the order a reader meets them top to bottom. */
export const SURFACE_GROUPS: ReadonlyArray<{
  readonly id: SurfaceGroupId;
  readonly label: string;
}> = [
  { id: "topBar", label: "Top bar" },
  { id: "sidebar", label: "Sidebar" },
  { id: "chat", label: "Chat" },
  { id: "composer", label: "Composer" },
  { id: "statusBar", label: "Status bar" },
];

/**
 * What a right-click on a customizable element offers (L-19).
 *
 * `hide` and `show` are one pair rather than one verb because the menu names
 * the region ("Hide Minimap"), so which of the two is offered is a question
 * about the region's current state, not about which verbs it has.
 */
export type QuickVerbId = "hide" | "show" | "chip" | "full" | "move";

export type LayoutRegionIcon = LucideIcon;

export interface SegmentOption {
  readonly value: string;
  readonly label: string;
}

/**
 * How one fine-tune row is operated.
 *
 * `switch` is a two-state key, which is a `boolean` on most regions and a
 * `Visibility` on the two that spell it out; the renderer reads the region's
 * own value type. `checks` is one boolean key per option, paired by position,
 * so `options[i].value` is `keys[i]`. `field-checks` is the other shape a check
 * list has: ONE key holding the list of what is checked, which is also the list
 * a drag reorders.
 */
export type ControlSpec<K extends RegionId> =
  | { readonly kind: "switch"; readonly key: keyof LayoutValues[K] & string }
  | {
      readonly kind: "segment";
      readonly key: keyof LayoutValues[K] & string;
      readonly options: ReadonlyArray<SegmentOption>;
    }
  | {
      readonly kind: "checks";
      readonly keys: ReadonlyArray<keyof LayoutValues[K] & string>;
      readonly options: ReadonlyArray<SegmentOption>;
    }
  | {
      readonly kind: "field-checks";
      readonly key: keyof LayoutValues[K] & string;
      readonly options: ReadonlyArray<SegmentOption>;
    };

export interface FineTuneRow<K extends RegionId> {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  /**
   * Whether an active row opens the real transient surface this setting is
   * about, pinned and inert on the canvas (L-27) - the only way to see a
   * change that lands inside a popover or a hover card. The section renderer
   * owns the pinning; this is what tells it which row asks for one.
   */
  readonly pinsTransient: boolean;
  readonly control: ControlSpec<K>;
}

export interface StyleExample<K extends RegionId> {
  readonly id: string;
  readonly label: string;
  readonly patch: Partial<LayoutValues[K]>;
}

export type GrammarRow<K extends RegionId> =
  | { readonly kind: "size"; readonly description: string }
  | { readonly kind: "position-host"; readonly description: string }
  | { readonly kind: "position-side"; readonly description: string }
  | {
      readonly kind: "position-order";
      readonly group: OrderGroupId;
      readonly description: string;
      readonly pinnedRight: boolean;
      readonly dividers: boolean;
    }
  | {
      readonly kind: "style";
      readonly description: string | null;
      readonly examples: ReadonlyArray<StyleExample<K>>;
    }
  | { readonly kind: "fine-tune"; readonly rows: ReadonlyArray<FineTuneRow<K>> }
  | { readonly kind: "children"; readonly level: "usage-providers" };

export interface LayoutRegion<K extends RegionId> {
  readonly id: K;
  readonly name: string;
  readonly surface: SurfaceGroupId;
  readonly icon: LayoutRegionIcon;
  readonly where: string;
  /** Set only where the region's home is itself a setting: the usage cluster. */
  readonly whereByHost: Readonly<Record<UsageHost, string>> | null;
  /**
   * The presence rule a region follows when nobody has chosen for it (L-47),
   * spelled out in its row. `null` means the region has no rule, which is also
   * what makes its Shown control a plain switch rather than the tri-state one.
   */
  readonly hint: string | null;
  readonly keywords: ReadonlyArray<string>;
  /** Renders the sample leaf when the live app has no content for it (L-16). */
  readonly sampleFilled: boolean;
  readonly rows: ReadonlyArray<GrammarRow<K>>;
  readonly quickVerbs: ReadonlyArray<QuickVerbId>;
  readonly stateWord: (
    values: LayoutValues[K],
    arrangement: LayoutArrangement,
  ) => string;
  readonly depict: (
    values: LayoutValues[K],
    arrangement: LayoutArrangement,
  ) => ReactNode;
}

// ── Shared option sets ──────────────────────────────────────────────────────

export const SIZE_OPTIONS: ReadonlyArray<SegmentOption> = [
  { value: "full", label: "Full row" },
  { value: "chip", label: "Chip" },
];

export const USAGE_HOST_OPTIONS: ReadonlyArray<SegmentOption> = [
  { value: "status-bar", label: "Status bar" },
  { value: "header", label: "Header" },
];

export const EDGE_SIDE_OPTIONS: ReadonlyArray<SegmentOption> = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

/** Shown under the examples when the values match none of them. */
export const NO_EXAMPLE_MATCH_COPY =
  "Custom - no example matches the fine-tune below.";

// ── Shared verb sets ────────────────────────────────────────────────────────

export const SHOW_HIDE_VERBS: ReadonlyArray<QuickVerbId> = ["hide", "show"];
export const MOVABLE_VERBS: ReadonlyArray<QuickVerbId> = [
  "hide",
  "show",
  "move",
];
export const SIZED_VERBS: ReadonlyArray<QuickVerbId> = [
  "hide",
  "show",
  "chip",
  "full",
  "move",
];
