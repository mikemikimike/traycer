import {
  Bot,
  FileDiff,
  History,
  ImagePlus,
  ListChecks,
  ListOrdered,
  Mic,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import {
  SHOW_HIDE_VERBS,
  SIZED_VERBS,
  type LayoutRegion,
  type StyleExample,
} from "@/components/layout-editor/regions/region-grammar";
import {
  modelStateWord,
  shownStateWord,
  sizedStateWord,
} from "@/components/layout-editor/regions/region-state-words";

/**
 * The composer's nine regions: the five dock rows above the message box, and
 * the four toolbar elements below it.
 *
 * They share three row shapes, which is why they share a file: a dock row's
 * order, a toolbar cluster's order, and the full-row/chip size that only the
 * elements which shrink rather than disappear have.
 *
 * Todo and Message queue are dock rows like the other three (L-139, L-142) and
 * so their entries are copies of `BACKGROUND_REGION` down to the row list: one
 * rule for everything above the message box means there is nothing here that
 * reads differently for them.
 */

const DOCK_ORDER_ROW = { kind: "position-order", group: "dock" } as const;

const TOOLBAR_LEFT_ORDER_ROW = {
  kind: "position-order",
  group: "toolbarLeft",
} as const;

const TOOLBAR_RIGHT_ORDER_ROW = {
  kind: "position-order",
  group: "toolbarRight",
} as const;

const DOCK_SIZE_ROW = {
  kind: "size",
  description: "A full row, or a chip in the compact strip.",
} as const;

const MODEL_EXAMPLES: ReadonlyArray<StyleExample<"model">> = [
  { id: "text", label: "Text", patch: { style: "text" } },
  { id: "bars", label: "Bars", patch: { style: "bars" } },
  { id: "barsText", label: "Bars and text", patch: { style: "bars-text" } },
];

export const RUNNING_AGENTS_REGION: LayoutRegion<"runningAgents"> = {
  id: "runningAgents",
  name: "Running agents",
  surface: "composer",
  icon: Bot,
  where: "Composer - above the message box",
  whereByHost: null,
  hint: null,
  keywords: ["agents", "running", "active", "work"],
  rows: [DOCK_SIZE_ROW, DOCK_ORDER_ROW],
  quickVerbs: SIZED_VERBS,
  stateWord: sizedStateWord,
};

export const CHANGED_FILES_REGION: LayoutRegion<"changedFiles"> = {
  id: "changedFiles",
  name: "Changed files",
  surface: "composer",
  icon: FileDiff,
  where: "Composer - above the message box",
  whereByHost: null,
  hint: null,
  keywords: ["changed", "files", "diff", "edits", "added", "removed"],
  rows: [DOCK_SIZE_ROW, DOCK_ORDER_ROW],
  quickVerbs: SIZED_VERBS,
  stateWord: sizedStateWord,
};

export const BACKGROUND_REGION: LayoutRegion<"background"> = {
  id: "background",
  name: "Background",
  surface: "composer",
  icon: History,
  where: "Composer - above the message box",
  whereByHost: null,
  hint: null,
  keywords: ["background", "shell", "tasks", "running"],
  rows: [DOCK_SIZE_ROW, DOCK_ORDER_ROW],
  quickVerbs: SIZED_VERBS,
  stateWord: sizedStateWord,
};

/**
 * `ListOrdered` is the glyph the real panel's own header prints beside
 * "Message queue", so the index row, the quick-verb menu and the compact pill
 * all name the row with the mark a reader already associates with it.
 */
export const QUEUE_REGION: LayoutRegion<"queue"> = {
  id: "queue",
  name: "Message queue",
  surface: "composer",
  icon: ListOrdered,
  where: "Composer - above the message box",
  whereByHost: null,
  hint: null,
  keywords: ["queue", "queued", "messages", "pending", "next", "steer"],
  rows: [DOCK_SIZE_ROW, DOCK_ORDER_ROW],
  quickVerbs: SIZED_VERBS,
  stateWord: sizedStateWord,
};

/** `ListChecks` for the same reason: the Todo header's own resting glyph. */
export const TODO_REGION: LayoutRegion<"todo"> = {
  id: "todo",
  name: "Todo",
  surface: "composer",
  icon: ListChecks,
  where: "Composer - above the message box",
  whereByHost: null,
  hint: null,
  keywords: ["todo", "todos", "tasks", "checklist", "plan", "progress"],
  rows: [DOCK_SIZE_ROW, DOCK_ORDER_ROW],
  quickVerbs: SIZED_VERBS,
  stateWord: sizedStateWord,
};

export const ATTACH_IMAGE_REGION: LayoutRegion<"attachImage"> = {
  id: "attachImage",
  name: "Attach image",
  surface: "composer",
  icon: ImagePlus,
  where: "Composer - toolbar, left",
  whereByHost: null,
  hint: null,
  keywords: ["attach", "image", "screenshot", "paste", "upload"],
  rows: [TOOLBAR_LEFT_ORDER_ROW],
  quickVerbs: SHOW_HIDE_VERBS,
  stateWord: shownStateWord,
};

export const ACCESS_REGION: LayoutRegion<"access"> = {
  id: "access",
  name: "Access",
  surface: "composer",
  icon: Shield,
  where: "Composer - toolbar, left",
  whereByHost: null,
  hint: null,
  keywords: ["access", "supervised", "permissions", "approval"],
  rows: [
    {
      kind: "size",
      description: "The chip keeps the shield icon only.",
    },
    TOOLBAR_LEFT_ORDER_ROW,
  ],
  quickVerbs: SIZED_VERBS,
  stateWord: sizedStateWord,
};

export const MODEL_REGION: LayoutRegion<"model"> = {
  id: "model",
  name: "Model",
  surface: "composer",
  icon: SlidersHorizontal,
  where: "Composer - toolbar, right",
  whereByHost: null,
  hint: null,
  keywords: ["model", "chip", "effort", "medium", "bars", "reasoning"],
  rows: [
    {
      kind: "style",
      description: null,
      specimen: "region",
      examples: MODEL_EXAMPLES,
    },
    TOOLBAR_RIGHT_ORDER_ROW,
  ],
  quickVerbs: SHOW_HIDE_VERBS,
  stateWord: modelStateWord,
};

export const MIC_REGION: LayoutRegion<"mic"> = {
  id: "mic",
  name: "Microphone",
  surface: "composer",
  icon: Mic,
  where: "Composer - toolbar, right",
  whereByHost: null,
  hint: null,
  keywords: ["microphone", "mic", "voice", "dictation", "speech"],
  rows: [TOOLBAR_RIGHT_ORDER_ROW],
  quickVerbs: SHOW_HIDE_VERBS,
  stateWord: shownStateWord,
};
