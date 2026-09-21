import { CircleGauge, Map as MapIcon } from "lucide-react";
import { CONTEXT_USAGE_ROW_LABELS } from "@/components/chat/context-usage";
import { REGION_DEPICTIONS } from "@/components/layout-editor/region-depiction";
import {
  SHOW_HIDE_VERBS,
  type LayoutRegion,
  type StyleExample,
} from "@/components/layout-editor/regions/region-grammar";
import {
  contextUsageStateWord,
  sideStateWord,
} from "@/components/layout-editor/regions/region-state-words";
import { CONTEXT_USAGE_ROW_KEYS } from "@/lib/context-usage-rows";

export const MINIMAP_REGION: LayoutRegion<"minimap"> = {
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
};

const CONTEXT_USAGE_EXAMPLES: ReadonlyArray<StyleExample<"contextUsage">> = [
  { id: "text", label: "Text", patch: { style: "text" } },
  { id: "ring", label: "Ring", patch: { style: "ring" } },
  { id: "ringOnly", label: "Ring only", patch: { style: "ring-only" } },
];

export const CONTEXT_USAGE_REGION: LayoutRegion<"contextUsage"> = {
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
};
