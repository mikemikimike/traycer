import { Cpu, Gauge } from "lucide-react";
import {
  SHOW_HIDE_VERBS,
  type LayoutRegion,
  type StyleExample,
} from "@/components/layout-editor/regions/region-grammar";
import { barPlacementStateWord } from "@/components/layout-editor/regions/region-state-words";

/**
 * The five readings worth picking between, each a complete answer rather than
 * a toggle: every combination is still reachable under Fine-tune, so nothing
 * is lost by not listing thirty-two of them (L-10, resolves O-3).
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

/**
 * One of the two regions whose home is itself a setting - a bar and an end of
 * it, picked for this region alone (L-156) - plus its per-provider level.
 */
export const USAGE_LIMITS_REGION: LayoutRegion<"usageLimits"> = {
  id: "usageLimits",
  name: "Usage limits",
  surface: "statusBar",
  icon: Gauge,
  where: "Status bar - left side",
  whereByHost: { "status-bar": "Status bar", header: "Top bar" },
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
    // Where it can LIVE, not only what it says: the page's own "Show these
    // in" row carried these words and is gone with L-156, and a search entry
    // is generated from this list (L-126).
    "header",
    "top bar",
    "status bar",
    "move",
  ],
  rows: [
    {
      kind: "position-host",
      description: "Which bar the cluster lives in.",
    },
    {
      kind: "position-side",
      description: "Which end of that bar.",
    },
    {
      kind: "style",
      description: "Each example is the real segment, drawn at full size.",
      specimen: "usage-provider",
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
  stateWord: (values, arrangement) =>
    barPlacementStateWord(values, arrangement, "usageLimits"),
};

export const RESOURCE_MONITOR_REGION: LayoutRegion<"resourceMonitor"> = {
  id: "resourceMonitor",
  name: "Resource monitor",
  surface: "statusBar",
  icon: Cpu,
  where: "Status bar - right side",
  whereByHost: { "status-bar": "Status bar", header: "Top bar" },
  hint: null,
  keywords: [
    "cpu",
    "memory",
    "procs",
    "processes",
    "ram",
    "resource",
    "monitor",
    // The same four as the usage cluster's: since L-156 this reading picks
    // its own bar, so "header" and "move" have to find it too.
    "header",
    "top bar",
    "status bar",
    "move",
  ],
  rows: [
    {
      kind: "position-host",
      description: "Which bar the monitor lives in.",
    },
    { kind: "position-side", description: "Which end of that bar." },
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
    barPlacementStateWord(values, arrangement, "resourceMonitor"),
};
