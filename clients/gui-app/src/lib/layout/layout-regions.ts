import type { ReactNode } from "react";
import {
  Bot,
  CircleGauge,
  Cpu,
  FileDiff,
  Gauge,
  History,
  House,
  ImagePlus,
  Layers,
  Map as MapIcon,
  Mic,
  Shield,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  CONTEXT_USAGE_ROW_KEYS,
  CONTEXT_USAGE_ROW_LABELS,
} from "@/components/chat/context-usage";
import { getLeftPanelDefinition } from "@/components/epic-canvas/sidebar/left-panel-registry";
import {
  DEFAULT_ARRANGEMENT,
  leftPanelIdForRailRegion,
  type EdgeSide,
  type LayoutArrangement,
  type OrderGroupId,
  type UsageHost,
} from "@/lib/layout/layout-arrangement";
import { reorderedGroups } from "@/lib/layout/layout-diff";
import type {
  ContextUsageValues,
  LayoutValues,
  ModelValues,
  RailValues,
  ShownValues,
  SizedValues,
  UsageLimitsValues,
} from "@/lib/layout/layout-values";
import { REGION_DEPICTIONS } from "@/lib/layout/region-depiction";
import type { RailRegionId, RegionId } from "@/lib/layout/region-id";
import type { LayoutSnapshot } from "@/stores/layout/layout-store";

/**
 * Every region the editor can address, said once.
 *
 * This is the one declarative registry (L-03), and it feeds five callers: the
 * docked inspector's section renderer, the full-width `Settings > Layout` host,
 * the index grouped by surface, the filter, and the quick verbs and search
 * launch entries. A section is not written per region anywhere - a region
 * declares its rows in the fixed grammar order (L-08) and one renderer draws
 * them, which is what keeps the two hosts the same form.
 *
 * Every row is generic over the region id, so a row naming a key the region
 * does not have is a compile error rather than a runtime test (C-20).
 *
 * The copy here is final (L-33, L-52) and matches the prototype (L-45).
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

// ── State words (L-33, L-47) ────────────────────────────────────────────────

function shownStateWord(values: ShownValues): string {
  return values.shown === "shown" ? "Shown" : "Hidden";
}

function sizedStateWord(values: SizedValues): string {
  if (values.shown === "hidden") return "Hidden";
  return values.size === "chip" ? "Chip" : "Full row";
}

function sideStateWord(values: ShownValues, side: EdgeSide): string {
  if (values.shown === "hidden") return "Hidden";
  return side === "left" ? "Left" : "Right";
}

function railStateWord(values: RailValues): string {
  if (values.shown === "auto") return "Auto";
  return values.shown === "shown" ? "Shown" : "Hidden";
}

function usageLimitsStateWord(
  values: UsageLimitsValues,
  arrangement: LayoutArrangement,
): string {
  if (values.shown === "hidden") return "Hidden";
  return arrangement.usageHost === "header" ? "Header" : "Status bar";
}

function contextUsageStateWord(values: ContextUsageValues): string {
  if (values.shown === "hidden") return "Hidden";
  if (values.style === "text") return "Text";
  return values.style === "ring" ? "Ring" : "Ring only";
}

function modelStateWord(values: ModelValues): string {
  if (values.shown === "hidden") return "Hidden";
  if (values.style === "text") return "Text";
  return values.style === "bars" ? "Bars" : "Bars + text";
}

// ── Curated examples (L-10, resolves O-3) ───────────────────────────────────

/**
 * The five readings worth picking between, each a complete answer rather than
 * a toggle: every combination is still reachable under Fine-tune, so nothing
 * is lost by not listing thirty-two of them.
 */
const USAGE_LIMITS_EXAMPLES: ReadonlyArray<StyleExample<"usageLimits">> = [
  {
    id: "full",
    label: "bar, percent, word and reset",
    patch: {
      bar: true,
      percent: true,
      word: true,
      reset: true,
      amount: "used",
    },
  },
  {
    id: "barPercent",
    label: "bar and percent",
    patch: {
      bar: true,
      percent: true,
      word: false,
      reset: false,
      amount: "used",
    },
  },
  {
    id: "leftWithReset",
    label: "percent left with reset, no bar",
    patch: {
      bar: false,
      percent: true,
      word: true,
      reset: true,
      amount: "remaining",
    },
  },
  {
    id: "barOnly",
    label: "bar only",
    patch: {
      bar: true,
      percent: false,
      word: false,
      reset: false,
      amount: "used",
    },
  },
  {
    id: "percentOnly",
    label: "percent only",
    patch: {
      bar: false,
      percent: true,
      word: false,
      reset: false,
      amount: "used",
    },
  },
];

/** Shown under the examples when the values match none of them. */
export const NO_EXAMPLE_MATCH_COPY =
  "Custom - no example matches the fine-tune below.";

const CONTEXT_USAGE_EXAMPLES: ReadonlyArray<StyleExample<"contextUsage">> = [
  { id: "text", label: "Text", patch: { style: "text" } },
  { id: "ring", label: "Ring", patch: { style: "ring" } },
  { id: "ringOnly", label: "Ring only", patch: { style: "ring-only" } },
];

const MODEL_EXAMPLES: ReadonlyArray<StyleExample<"model">> = [
  { id: "text", label: "Text", patch: { style: "text" } },
  { id: "bars", label: "Bars", patch: { style: "bars" } },
  { id: "barsText", label: "Bars and text", patch: { style: "bars-text" } },
];

// ── Shared rows ─────────────────────────────────────────────────────────────

const DOCK_ORDER_ROW = {
  kind: "position-order",
  group: "dock",
  description: "Drag to reorder, here or on the canvas.",
  pinnedRight: false,
  dividers: false,
} as const;

const TOOLBAR_LEFT_ORDER_ROW = {
  kind: "position-order",
  group: "toolbarLeft",
  description: "Drag to reorder, here or on the canvas.",
  pinnedRight: false,
  dividers: false,
} as const;

const TOOLBAR_RIGHT_ORDER_ROW = {
  kind: "position-order",
  group: "toolbarRight",
  description: "Drag to reorder, here or on the canvas.",
  pinnedRight: false,
  dividers: false,
} as const;

const DOCK_SIZE_ROW = {
  kind: "size",
  description: "A full row, or a chip in the compact strip.",
} as const;

const RAIL_ROWS = [
  {
    kind: "position-order",
    group: "rail",
    description: "Drag to reorder. Dividers are items too.",
    pinnedRight: false,
    dividers: true,
  },
] as const;

const SHOW_HIDE_VERBS: ReadonlyArray<QuickVerbId> = ["hide", "show"];
const MOVABLE_VERBS: ReadonlyArray<QuickVerbId> = ["hide", "show", "move"];
const SIZED_VERBS: ReadonlyArray<QuickVerbId> = [
  "hide",
  "show",
  "chip",
  "full",
  "move",
];

/**
 * Everything the nine rail regions say identically. Their name and icon come
 * from `LEFT_PANEL_DEFINITIONS` rather than from a second list here, which is
 * why the Chats panel is "Agents" in the index (C-35).
 */
function railRegionBase(
  regionId: RailRegionId,
  keywords: ReadonlyArray<string>,
  hint: string | null,
): Omit<LayoutRegion<RailRegionId>, "id" | "depict"> {
  const definition = getLeftPanelDefinition(leftPanelIdForRailRegion(regionId));
  return {
    name: definition.title,
    surface: "sidebar",
    icon: definition.icon,
    where: "Sidebar - icon rail",
    whereByHost: null,
    hint,
    keywords: [...keywords, "sidebar", "rail", "panel"],
    sampleFilled: false,
    rows: RAIL_ROWS,
    quickVerbs: MOVABLE_VERBS,
    stateWord: railStateWord,
  };
}

// ── The registry (resolves O-2) ─────────────────────────────────────────────

export const LAYOUT_REGIONS: {
  readonly [K in RegionId]: LayoutRegion<K>;
} = {
  homeTab: {
    id: "homeTab",
    name: "Home tab",
    surface: "topBar",
    icon: House,
    where: "Top bar - left of the tabs",
    whereByHost: null,
    hint: null,
    keywords: ["home", "start", "page", "tab"],
    sampleFilled: false,
    rows: [],
    quickVerbs: SHOW_HIDE_VERBS,
    stateWord: shownStateWord,
    depict: REGION_DEPICTIONS.homeTab,
  },
  usageLimits: {
    id: "usageLimits",
    name: "Usage limits",
    surface: "statusBar",
    icon: Gauge,
    where: "Status bar - left side",
    whereByHost: {
      "status-bar": "Status bar - left side",
      header: "Top bar - right, before the icons",
    },
    hint: null,
    keywords: [
      "usage",
      "limits",
      "quota",
      "plan",
      "percent",
      "used",
      "left",
      "timer",
      "reset",
      "providers",
      "bar",
    ],
    sampleFilled: false,
    rows: [
      {
        kind: "position-host",
        description: "Where the cluster lives.",
      },
      {
        kind: "style",
        description: "Each example is the real segment, drawn at full size.",
        examples: USAGE_LIMITS_EXAMPLES,
      },
      {
        kind: "fine-tune",
        rows: [
          {
            id: "word",
            label: "Show the word used/left",
            description: null,
            pinsTransient: false,
            control: { kind: "switch", key: "word" },
          },
          {
            id: "reset",
            label: "Time until reset",
            description: null,
            pinsTransient: false,
            control: { kind: "switch", key: "reset" },
          },
          {
            id: "bar",
            label: "Progress bar",
            description: null,
            pinsTransient: false,
            control: { kind: "switch", key: "bar" },
          },
          {
            id: "percent",
            label: "Percentage",
            description: null,
            pinsTransient: false,
            control: { kind: "switch", key: "percent" },
          },
          {
            id: "amount",
            label: "Used or remaining",
            description: null,
            pinsTransient: false,
            control: {
              kind: "segment",
              key: "amount",
              options: [
                { value: "used", label: "Used" },
                { value: "remaining", label: "Remaining" },
              ],
            },
          },
        ],
      },
      { kind: "children", level: "usage-providers" },
    ],
    quickVerbs: SHOW_HIDE_VERBS,
    stateWord: usageLimitsStateWord,
    depict: REGION_DEPICTIONS.usageLimits,
  },
  resourceMonitor: {
    id: "resourceMonitor",
    name: "Resource monitor",
    surface: "statusBar",
    icon: Cpu,
    where: "Status bar - right side",
    whereByHost: null,
    hint: null,
    keywords: [
      "cpu",
      "memory",
      "procs",
      "processes",
      "ram",
      "resource",
      "monitor",
    ],
    sampleFilled: false,
    rows: [
      { kind: "position-side", description: "Which end of the status bar." },
      {
        kind: "fine-tune",
        rows: [
          {
            id: "metrics",
            label: "Metrics",
            description: "What the monitor reports.",
            pinsTransient: false,
            control: {
              kind: "checks",
              keys: ["cpu", "memory", "processes", "ramShare"],
              options: [
                { value: "cpu", label: "CPU" },
                { value: "memory", label: "Memory" },
                { value: "processes", label: "Processes" },
                { value: "ramShare", label: "RAM share" },
              ],
            },
          },
        ],
      },
    ],
    quickVerbs: SHOW_HIDE_VERBS,
    stateWord: (values, arrangement) =>
      sideStateWord(values, arrangement.resourceSide),
    depict: REGION_DEPICTIONS.resourceMonitor,
  },
  minimap: {
    id: "minimap",
    name: "Minimap",
    surface: "chat",
    icon: MapIcon,
    where: "Chat - edge of the transcript",
    whereByHost: null,
    hint: null,
    keywords: ["minimap", "overview", "scrollbar", "map", "transcript"],
    sampleFilled: false,
    rows: [
      {
        kind: "position-side",
        description: "Which edge of the transcript it sits on.",
      },
    ],
    quickVerbs: SHOW_HIDE_VERBS,
    stateWord: (values, arrangement) =>
      sideStateWord(values, arrangement.minimapSide),
    depict: REGION_DEPICTIONS.minimap,
  },
  contextUsage: {
    id: "contextUsage",
    name: "Context usage",
    surface: "chat",
    icon: CircleGauge,
    where: "Chat - bottom right of the composer",
    whereByHost: null,
    hint: null,
    keywords: [
      "context",
      "usage",
      "tokens",
      "window",
      "percent",
      "ring",
      "breakdown",
    ],
    sampleFilled: false,
    rows: [
      { kind: "style", description: null, examples: CONTEXT_USAGE_EXAMPLES },
      {
        kind: "fine-tune",
        rows: [
          {
            id: "pinBreakdown",
            label: "Pin the breakdown",
            description: "Keeps the per-source card open above the chip.",
            pinsTransient: true,
            control: { kind: "switch", key: "pinBreakdown" },
          },
          {
            id: "pinnedFields",
            label: "Rows in the pinned card",
            description: null,
            pinsTransient: true,
            control: {
              kind: "field-checks",
              key: "pinnedFields",
              options: CONTEXT_USAGE_ROW_KEYS.map((key) => ({
                value: key,
                label: CONTEXT_USAGE_ROW_LABELS[key],
              })),
            },
          },
          {
            id: "compactButton",
            label: "Compact button",
            description: null,
            pinsTransient: false,
            control: { kind: "switch", key: "compactButton" },
          },
        ],
      },
    ],
    quickVerbs: SHOW_HIDE_VERBS,
    stateWord: contextUsageStateWord,
    depict: REGION_DEPICTIONS.contextUsage,
  },
  runningAgents: {
    id: "runningAgents",
    name: "Running agents",
    surface: "composer",
    icon: Bot,
    where: "Composer - above the message box",
    whereByHost: null,
    hint: null,
    keywords: ["agents", "running", "active", "work"],
    sampleFilled: true,
    rows: [DOCK_SIZE_ROW, DOCK_ORDER_ROW],
    quickVerbs: SIZED_VERBS,
    stateWord: sizedStateWord,
    depict: REGION_DEPICTIONS.runningAgents,
  },
  changedFiles: {
    id: "changedFiles",
    name: "Changed files",
    surface: "composer",
    icon: FileDiff,
    where: "Composer - above the message box",
    whereByHost: null,
    hint: null,
    keywords: ["changed", "files", "diff", "edits", "added", "removed"],
    sampleFilled: true,
    rows: [DOCK_SIZE_ROW, DOCK_ORDER_ROW],
    quickVerbs: SIZED_VERBS,
    stateWord: sizedStateWord,
    depict: REGION_DEPICTIONS.changedFiles,
  },
  background: {
    id: "background",
    name: "Background",
    surface: "composer",
    icon: History,
    where: "Composer - above the message box",
    whereByHost: null,
    hint: null,
    keywords: ["background", "shell", "tasks", "running"],
    sampleFilled: true,
    rows: [DOCK_SIZE_ROW, DOCK_ORDER_ROW],
    quickVerbs: SIZED_VERBS,
    stateWord: sizedStateWord,
    depict: REGION_DEPICTIONS.background,
  },
  attachImage: {
    id: "attachImage",
    name: "Attach image",
    surface: "composer",
    icon: ImagePlus,
    where: "Composer - toolbar, left",
    whereByHost: null,
    hint: null,
    keywords: ["attach", "image", "screenshot", "paste", "upload"],
    sampleFilled: false,
    rows: [TOOLBAR_LEFT_ORDER_ROW],
    quickVerbs: MOVABLE_VERBS,
    stateWord: shownStateWord,
    depict: REGION_DEPICTIONS.attachImage,
  },
  access: {
    id: "access",
    name: "Access",
    surface: "composer",
    icon: Shield,
    where: "Composer - toolbar, left",
    whereByHost: null,
    hint: null,
    keywords: ["access", "supervised", "permissions", "approval"],
    sampleFilled: false,
    rows: [
      {
        kind: "size",
        description: "The chip keeps the shield icon only.",
      },
      TOOLBAR_LEFT_ORDER_ROW,
    ],
    quickVerbs: SIZED_VERBS,
    stateWord: sizedStateWord,
    depict: REGION_DEPICTIONS.access,
  },
  agent: {
    id: "agent",
    name: "Agent",
    surface: "composer",
    icon: Layers,
    where: "Composer - toolbar, left",
    whereByHost: null,
    hint: null,
    keywords: ["harness", "provider", "vendor", "model"],
    sampleFilled: false,
    rows: [TOOLBAR_LEFT_ORDER_ROW],
    quickVerbs: MOVABLE_VERBS,
    stateWord: shownStateWord,
    depict: REGION_DEPICTIONS.agent,
  },
  model: {
    id: "model",
    name: "Model",
    surface: "composer",
    icon: SlidersHorizontal,
    where: "Composer - toolbar, right",
    whereByHost: null,
    hint: null,
    keywords: ["model", "chip", "effort", "medium", "bars", "reasoning"],
    sampleFilled: false,
    rows: [
      { kind: "style", description: null, examples: MODEL_EXAMPLES },
      { ...TOOLBAR_RIGHT_ORDER_ROW, pinnedRight: true },
    ],
    quickVerbs: MOVABLE_VERBS,
    stateWord: modelStateWord,
    depict: REGION_DEPICTIONS.model,
  },
  mic: {
    id: "mic",
    name: "Microphone",
    surface: "composer",
    icon: Mic,
    where: "Composer - toolbar, right",
    whereByHost: null,
    hint: null,
    keywords: ["microphone", "mic", "voice", "dictation", "speech"],
    sampleFilled: false,
    rows: [TOOLBAR_RIGHT_ORDER_ROW],
    quickVerbs: MOVABLE_VERBS,
    stateWord: shownStateWord,
    depict: REGION_DEPICTIONS.mic,
  },
  railAgents: {
    id: "railAgents",
    ...railRegionBase("railAgents", ["chats", "conversations", "agents"], null),
    depict: REGION_DEPICTIONS.railAgents,
  },
  railTerminals: {
    id: "railTerminals",
    ...railRegionBase("railTerminals", ["terminals", "shell", "console"], null),
    depict: REGION_DEPICTIONS.railTerminals,
  },
  railBrowsers: {
    id: "railBrowsers",
    ...railRegionBase("railBrowsers", ["browsers", "web", "pages"], null),
    depict: REGION_DEPICTIONS.railBrowsers,
  },
  railArtifacts: {
    id: "railArtifacts",
    ...railRegionBase("railArtifacts", ["artifacts", "outputs", "files"], null),
    depict: REGION_DEPICTIONS.railArtifacts,
  },
  railGitDiff: {
    id: "railGitDiff",
    ...railRegionBase("railGitDiff", ["git", "diff", "changes"], null),
    depict: REGION_DEPICTIONS.railGitDiff,
  },
  railPullRequests: {
    id: "railPullRequests",
    ...railRegionBase(
      "railPullRequests",
      ["pull", "requests", "pr", "review"],
      "Auto - appears when this repo has pull requests",
    ),
    depict: REGION_DEPICTIONS.railPullRequests,
  },
  railFileTree: {
    id: "railFileTree",
    ...railRegionBase(
      "railFileTree",
      ["file", "tree", "explorer", "folders"],
      null,
    ),
    depict: REGION_DEPICTIONS.railFileTree,
  },
  railSharing: {
    id: "railSharing",
    ...railRegionBase(
      "railSharing",
      ["sharing", "invite", "collaborators"],
      null,
    ),
    depict: REGION_DEPICTIONS.railSharing,
  },
  railComments: {
    id: "railComments",
    ...railRegionBase(
      "railComments",
      ["comments", "notes", "feedback"],
      "Auto - appears when an artifact is open",
    ),
    depict: REGION_DEPICTIONS.railComments,
  },
};

/**
 * A region's row, with only what a caller walking EVERY region can ask about.
 *
 * Which keys a control writes is the part that cannot survive the walk, since
 * `keyof LayoutValues[K]` collapses to what all twenty-two regions share.
 */
export type RegionRowFacts =
  | {
      readonly kind:
        | "size"
        | "position-host"
        | "position-side"
        | "style"
        | "children";
    }
  | { readonly kind: "position-order"; readonly group: OrderGroupId }
  | {
      readonly kind: "fine-tune";
      readonly rows: ReadonlyArray<{ readonly label: string }>;
    };

/**
 * The part of a region that does not depend on its value bag.
 *
 * `LayoutRegion<K>` has no useful supertype - `stateWord` and `depict` take
 * the region's own bag, so widening `K` to `RegionId` makes them uncallable -
 * which means a caller that walks all the regions (the index, the filter, the
 * search entries) reads them through this face, and a caller holding ONE id
 * indexes {@link LAYOUT_REGIONS} and gets the generic entry back.
 */
export interface RegionFacts {
  readonly id: RegionId;
  readonly name: string;
  readonly surface: SurfaceGroupId;
  readonly icon: LayoutRegionIcon;
  readonly where: string;
  readonly whereByHost: Readonly<Record<UsageHost, string>> | null;
  readonly hint: string | null;
  readonly keywords: ReadonlyArray<string>;
  readonly sampleFilled: boolean;
  readonly rows: ReadonlyArray<RegionRowFacts>;
  readonly quickVerbs: ReadonlyArray<QuickVerbId>;
}

const REGION_FACTS: Readonly<Record<RegionId, RegionFacts>> = LAYOUT_REGIONS;

export function regionFacts(region: RegionId): RegionFacts {
  return REGION_FACTS[region];
}

/**
 * Every region grouped by surface, which is the index's own order (L-06).
 *
 * Within a surface the declaration order stands, except on the sidebar, where
 * the rail's current order is the one on screen - the index sorts that group
 * against `arrangement.rail` rather than baking an order in here.
 */
export const LAYOUT_REGION_LIST: ReadonlyArray<RegionFacts> =
  SURFACE_GROUPS.flatMap((group) =>
    Object.values(REGION_FACTS).filter((region) => region.surface === group.id),
  );

export const LAYOUT_REGION_IDS: ReadonlyArray<RegionId> =
  LAYOUT_REGION_LIST.map((region) => region.id);

/**
 * One region's state word, for a caller holding an id rather than a literal.
 *
 * The indirection through a locally annotated function is what lets the
 * indexed accesses resolve together: `LAYOUT_REGIONS[region]` and
 * `values[region]` are the same `K`, and stating that once is what makes the
 * call well typed for every region at once.
 */
export function regionStateWord<K extends RegionId>(
  region: K,
  values: LayoutValues,
  arrangement: LayoutArrangement,
): string {
  const stateWord: (
    regionValues: LayoutValues[K],
    regionArrangement: LayoutArrangement,
  ) => string = LAYOUT_REGIONS[region].stateWord;
  return stateWord(values[region], arrangement);
}

/** {@link regionStateWord}, for the picture. */
export function regionDepiction<K extends RegionId>(
  region: K,
  values: LayoutValues,
  arrangement: LayoutArrangement,
): ReactNode {
  const depict: (
    regionValues: LayoutValues[K],
    regionArrangement: LayoutArrangement,
  ) => ReactNode = LAYOUT_REGIONS[region].depict;
  return depict(values[region], arrangement);
}

// ── Surface-level rows (L-51) ───────────────────────────────────────────────

/**
 * The grammar's surface tier: a row that belongs to a surface rather than to
 * anything in it, shown above that surface's regions in the index.
 *
 * One entry, and it decides whether a SURFACE exists at all, which is why it
 * lives on the arrangement rather than in a region's value bag. Only the
 * full-width host renders it, and only on a narrow window.
 */
export interface SurfaceRow {
  readonly id: "mobileFooter";
  readonly surface: SurfaceGroupId;
  readonly label: string;
  readonly description: string | null;
}

export const SURFACE_ROWS: ReadonlyArray<SurfaceRow> = [
  {
    id: "mobileFooter",
    surface: "statusBar",
    label: "Show the status bar on small screens",
    description: null,
  },
];

// ── The provider level (L-26) ───────────────────────────────────────────────

/**
 * One provider's own screen, reached from the Usage limits section's children
 * row: which of that provider's limits its segment draws, and whether it draws
 * at all.
 *
 * Everything here is about ONE provider. The prototype's "Segment details"
 * block is deliberately not carried over: two of its three rows wrote a global
 * value from a per-provider screen, which is the one mistake a second level
 * makes easy (C-23).
 */
export const USAGE_PROVIDER_LEVEL = {
  breadcrumb: (providerName: string): string =>
    `Usage limits > ${providerName}`,
  where: "Status bar - one segment of the usage cluster",
  limitsLabel: "Limits",
  limitsDescription: "Automatic follows the plan reported by the provider.",
  limitsOptions: [
    { value: "automatic", label: "Automatic (recommended)" },
    { value: "choose", label: "Choose..." },
  ] as ReadonlyArray<SegmentOption>,
};

// ── Quick verbs (L-19) ──────────────────────────────────────────────────────

/** What the context menu calls a verb, with the region named where it reads better. */
export function quickVerbLabel(verb: QuickVerbId, regionName: string): string {
  switch (verb) {
    case "hide":
      return `Hide ${regionName}`;
    case "show":
      return `Show ${regionName}`;
    case "chip":
      return "Show as chip";
    case "full":
      return "Show as full row";
    case "move":
      return "Move";
  }
}

/**
 * What the toast says afterwards, or `null` for the verb that has nothing to
 * announce: `move` hands the region to the editor rather than changing it.
 */
export function quickVerbToast(
  verb: QuickVerbId,
  regionName: string,
): string | null {
  switch (verb) {
    case "hide":
      return `${regionName} hidden`;
    case "show":
      return `${regionName} shown`;
    case "chip":
      return `${regionName} is a chip`;
    case "full":
      return `${regionName} is a full row`;
    case "move":
      return null;
  }
}

// ── The filter (L-07) ───────────────────────────────────────────────────────

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

// ── Position rows against the default arrangement (L-57) ────────────────────

/**
 * Whether this region's Position row differs from the shipped arrangement.
 *
 * The header's change count is values only, because that is exactly what
 * "Reset to Compact" puts back and the two have to agree (L-57). An
 * arrangement change is still a change a person made, so it earns a dot in the
 * index and a revert on the row it belongs to - measured against the DEFAULT
 * arrangement rather than against the base preset, which by construction has
 * no opinion about position.
 *
 * `false` for a region with no Position row, which includes every region whose
 * only row is Size or Style.
 */
export function positionRowChanged(
  snapshot: LayoutSnapshot,
  region: RegionId,
): boolean {
  const arrangement = snapshot.arrangement;
  const reordered = reorderedGroups(arrangement);
  return positionRows(region).some((row) => {
    switch (row.kind) {
      case "position-host":
        return arrangement.usageHost !== DEFAULT_ARRANGEMENT.usageHost;
      case "position-side":
        return (
          edgeSideFor(region, arrangement) !==
          edgeSideFor(region, DEFAULT_ARRANGEMENT)
        );
      case "position-order":
        return reordered.includes(row.group);
    }
  });
}

/** This region's Position row put back, leaving every other row alone. */
export function revertPositionRow(
  arrangement: LayoutArrangement,
  region: RegionId,
): LayoutArrangement {
  return positionRows(region).reduce((current, row): LayoutArrangement => {
    switch (row.kind) {
      case "position-host":
        return { ...current, usageHost: DEFAULT_ARRANGEMENT.usageHost };
      case "position-side":
        return region === "minimap"
          ? { ...current, minimapSide: DEFAULT_ARRANGEMENT.minimapSide }
          : { ...current, resourceSide: DEFAULT_ARRANGEMENT.resourceSide };
      case "position-order":
        return revertOrderGroup(current, row.group);
    }
  }, arrangement);
}

type PositionRow =
  | { readonly kind: "position-host" }
  | { readonly kind: "position-side" }
  | { readonly kind: "position-order"; readonly group: OrderGroupId };

function positionRows(region: RegionId): ReadonlyArray<PositionRow> {
  return regionFacts(region).rows.flatMap((row): PositionRow[] => {
    if (row.kind === "position-host") return [{ kind: "position-host" }];
    if (row.kind === "position-side") return [{ kind: "position-side" }];
    if (row.kind === "position-order") {
      return [{ kind: "position-order", group: row.group }];
    }
    return [];
  });
}

/** The side the one `position-side` region in question is drawn on. */
function edgeSideFor(
  region: RegionId,
  arrangement: LayoutArrangement,
): EdgeSide {
  return region === "minimap"
    ? arrangement.minimapSide
    : arrangement.resourceSide;
}

function revertOrderGroup(
  arrangement: LayoutArrangement,
  group: OrderGroupId,
): LayoutArrangement {
  switch (group) {
    case "dock":
      return { ...arrangement, dock: DEFAULT_ARRANGEMENT.dock };
    case "toolbarLeft":
      return { ...arrangement, toolbarLeft: DEFAULT_ARRANGEMENT.toolbarLeft };
    case "toolbarRight":
      return { ...arrangement, toolbarRight: DEFAULT_ARRANGEMENT.toolbarRight };
    case "rail":
      return { ...arrangement, rail: DEFAULT_ARRANGEMENT.rail };
    case "usageProviders":
      return {
        ...arrangement,
        usageProviders: DEFAULT_ARRANGEMENT.usageProviders,
      };
  }
}
