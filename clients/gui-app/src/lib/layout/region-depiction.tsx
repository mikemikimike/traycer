import type { ReactNode } from "react";
import { Bot, Cpu, FileDiff, History, Mic, Shield } from "lucide-react";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { ActiveAgentsHeader } from "@/components/chat/chat-active-agents-panel";
import { BackgroundItemsHeader } from "@/components/chat/chat-background-items-panel";
import { ChatDockCompactChip } from "@/components/chat/chat-dock-compact-chip";
import { contextUsageTone } from "@/components/chat/context-usage";
import { FileChangeHeader } from "@/components/chat/segments/file-change-segment";
import { LeftPanelRailIcon } from "@/components/epic-canvas/sidebar/left-panel-rail-icon";
import { ComposerAttachImageTrigger } from "@/components/home/toolbar/composer-attach-image-button";
import { ToolbarIconButton } from "@/components/home/toolbar/toolbar-buttons";
import { HarnessModelTrigger } from "@/components/home/pickers/harness-model-trigger";
import { PermissionsTrigger } from "@/components/home/pickers/permissions-picker";
import { StatusBarUsageReadings } from "@/components/layout/status-bar/status-bar-usage-readings";
import { TabStripHomeItemView } from "@/components/layout/tabs/tab-strip-home-item";
import { MinimapRailTick } from "@/components/minimap/minimap-rail-tick";
import { Collapsible } from "@/components/ui/collapsible";
import {
  HostContextFrame,
  type HostContextId,
} from "@/lib/layout/region-depiction-frame";
import {
  leftPanelIdForRailRegion,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import type {
  ContextUsageValues,
  LayoutValues,
  ModelValues,
  ResourceMonitorValues,
  SizedValues,
  UsageLimitsValues,
} from "@/lib/layout/layout-values";
import type { RailRegionId, RegionId } from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";
import type { StatusBarRateLimitWindow } from "@/hooks/rate-limits/use-status-bar-rate-limit-segments";

/**
 * The only way a region is drawn outside the canvas (L-11).
 *
 * Two rules decide everything in this file.
 *
 * **The real leaf wherever it takes its answer as a prop.** Most of the app's
 * chrome is already split into an interactive mount and a drawing view -
 * `StatusBarUsageReadings`, `HarnessModelTrigger`, `PermissionsTrigger`,
 * `TabStripHomeItemView`, `MinimapRailTick`, `LeftPanelRailIcon`, the dock's
 * three headers and its compact chip all take what they draw from props - and
 * for those a depiction IS the shipping component under specimen data. The
 * four that read a preference through a hook of their own rather than from a
 * prop (the resource segment, the context chip, the mic button, the harness
 * label) are drawn here from their own markup, because the alternative is a
 * translation from this build's `LayoutValues` into the pre-rework preference
 * shapes - code the switch-over deletes. The parity regression (L-53) is what
 * holds those four to the real thing; nothing in the mechanism is linted.
 *
 * **A depiction never asks whether the region is shown.** The stage's job is
 * to show what a region WOULD look like, so `shown` is the one value no
 * renderer here reads; the stage dims itself instead.
 *
 * Nothing in this file fetches, subscribes, writes or opens anything: it is a
 * value in, one picture out. That is the passivity contract `lib/layout-overrides.ts`
 * spells out, and it is why the specimen data below is static rather than the
 * watched host's own numbers.
 */

export type { HostContextId };

/**
 * Where a region really lives, given what the arrangement says about it.
 *
 * Read off the region rather than off the registry's `surface`, so the
 * depiction module owes the registry nothing and the two can be imported in
 * one direction only.
 */
export function hostContextFor(
  regionId: RegionId,
  arrangement: LayoutArrangement,
): HostContextId {
  switch (regionId) {
    case "homeTab":
      return "top-bar";
    case "usageLimits":
      return arrangement.usageHost === "header" ? "top-bar" : "status-bar";
    case "resourceMonitor":
      return "status-bar";
    case "minimap":
      return "chat";
    case "contextUsage":
      return "composer-foot";
    case "runningAgents":
    case "changedFiles":
    case "background":
      return "dock";
    case "attachImage":
    case "access":
    case "agent":
    case "model":
    case "mic":
      return "toolbar";
    default:
      return "rail";
  }
}

/**
 * One region as a picture, in its host's own context.
 *
 * `hostContext` is `null` everywhere the region is drawn where it lives, and
 * names a host only where a caller is deliberately drawing it somewhere else -
 * a dock row shown as the chip it would become, or a usage example pinned to
 * the strip while the cluster is hosted in the top bar.
 */
export function depictRegion<K extends RegionId>(
  regionId: K,
  values: LayoutValues[K],
  arrangement: LayoutArrangement,
  hostContext: HostContextId | null,
): ReactNode {
  const depict = REGION_DEPICTIONS[regionId];
  return (
    <HostContextFrame
      host={hostContext ?? hostContextFor(regionId, arrangement)}
    >
      {depict(values, arrangement)}
    </HostContextFrame>
  );
}

// ── Specimen data ───────────────────────────────────────────────────────────

/**
 * The numbers every picture is drawn from.
 *
 * Fixed rather than live, for the reason the passivity contract gives: a
 * depiction that read the watched host would be a second mount of the chrome
 * it is a picture of. They are chosen so that every switch in the grammar has
 * something to change - a reading part-way through a window, a countdown that
 * has not expired, a diff with both signs, a context window with room left.
 */
const SPECIMEN_USED_PERCENT = 35;
const SPECIMEN_CONTEXT_PERCENT_LEFT = 36;
const SPECIMEN_RESET_MS = 59 * 60 * 1000;

function specimenWindow(): StatusBarRateLimitWindow {
  return {
    windowKey: "specimen",
    label: "5h",
    labelIsDuration: true,
    kind: "session",
    usedPercent: SPECIMEN_USED_PERCENT,
    resetsAt: Date.now() + SPECIMEN_RESET_MS,
    severity: "healthy",
  };
}

function noop(): void {}

// ── Per-region renderers ────────────────────────────────────────────────────

/**
 * One provider's usage segment, at the detail the values ask for.
 *
 * Exported because two callers draw ONE segment rather than the cluster: the
 * Style examples, whose caption promises "the real segment, drawn at full
 * size", and a provider's own second level.
 */
export function depictUsageProviderSegment(
  providerId: RateLimitProviderId,
  values: UsageLimitsValues,
): ReactNode {
  const window = specimenWindow();
  return (
    <StatusBarUsageReadings
      interactive={false}
      display={{
        percentMode: values.amount,
        showModeWord: values.word,
        showBar: values.bar,
        showTimer: values.reset,
      }}
      // `values.percent` has no counterpart here yet: the strip prints the
      // percentage unconditionally, so `StatusBarUsageDisplay` carries no
      // `showPercent` for it to switch. Dropping the window instead would
      // leave the segment drawing its cold track, which is a different state
      // rather than a shorter reading - so the reading is drawn whole and the
      // switch-over adds the part (see this ticket's report).
      cluster={{
        kind: "segments",
        segments: [
          {
            providerId,
            profileId: null,
            account: null,
            hidden: false,
            state: "live",
            reason: null,
            windows: [window],
            shown: [window],
            tightest: window,
          },
        ],
      }}
    />
  );
}

function depictUsageLimits(
  values: UsageLimitsValues,
  arrangement: LayoutArrangement,
): ReactNode {
  const shownProviders = arrangement.usageProviders.filter(
    (providerId) => !arrangement.hiddenProviders.includes(providerId),
  );
  return shownProviders.map((providerId) => (
    <span key={providerId} className="inline-flex shrink-0 items-center">
      {depictUsageProviderSegment(providerId, values)}
    </span>
  ));
}

/**
 * The four metric readings, in the canonical order the strip prints them.
 *
 * Labels and markup mirror `StatusBarResourceSegment` rather than mounting it:
 * that component resolves its readings through `useStatusBarResourceMetricViews`,
 * which subscribes to the desktop sampler and the resource registry, so a
 * picture of it cannot be one of its mounts.
 */
const RESOURCE_SPECIMEN: ReadonlyArray<{
  readonly key: keyof ResourceMonitorValues;
  readonly label: string;
  readonly value: string;
}> = [
  { key: "cpu", label: "cpu", value: "4.6%" },
  { key: "memory", label: "mem", value: "1.2 GB" },
  { key: "processes", label: "procs", value: "6" },
  { key: "ramShare", label: "ram", value: "8%" },
];

function depictResourceMonitor(values: ResourceMonitorValues): ReactNode {
  const readings = RESOURCE_SPECIMEN.filter(
    (reading) => values[reading.key] === true,
  );
  return (
    <span className="inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 px-2 text-muted-foreground">
      <Cpu className="size-3 shrink-0" aria-hidden />
      {readings.map((reading, index) => (
        <span
          key={reading.key}
          className="inline-flex min-w-0 items-center gap-1"
        >
          {index === 0 ? null : (
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
          )}
          <span className="text-muted-foreground/80">{reading.label}</span>
          <span className="truncate">{reading.value}</span>
        </span>
      ))}
    </span>
  );
}

/** Three ticks of transcript, on the edge the arrangement puts them. */
function depictMinimap(arrangement: LayoutArrangement): ReactNode {
  return (
    <span className="relative inline-block h-full w-6 min-w-0">
      {["20%", "50%", "80%"].map((top, index) => (
        <MinimapRailTick
          key={top}
          active={index === 1}
          availableWidth={24}
          hierarchical={false}
          level={1}
          open={false}
          side={arrangement.minimapSide}
          top={top}
        />
      ))}
    </span>
  );
}

/**
 * The context chip in each of its three readings.
 *
 * Drawn here rather than through `ContextUsageChipView`, which reads its style
 * and its pin from the preference seam instead of from props - see this
 * module's header. The ring is `ContextUsageRing`'s own geometry.
 */
const CONTEXT_RING_RADIUS = 8.5;
const CONTEXT_RING_CIRCUMFERENCE = 2 * Math.PI * CONTEXT_RING_RADIUS;

function depictContextUsage(values: ContextUsageValues): ReactNode {
  const percent = SPECIMEN_CONTEXT_PERCENT_LEFT;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm bg-transparent text-ui-sm font-normal tabular-nums whitespace-nowrap",
        values.style === "text" && "opacity-70",
        contextUsageTone(percent),
      )}
    >
      {values.style === "text" ? (
        `${percent}% context left`
      ) : (
        <span
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center",
            values.style === "ring" ? "size-5" : "size-4",
          )}
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            className="absolute inset-0 size-full -rotate-90"
          >
            <circle
              cx="10"
              cy="10"
              r={CONTEXT_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.25}
              strokeWidth="2"
            />
            <circle
              cx="10"
              cy="10"
              r={CONTEXT_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CONTEXT_RING_CIRCUMFERENCE}
              strokeDashoffset={
                CONTEXT_RING_CIRCUMFERENCE * (1 - percent / 100)
              }
            />
          </svg>
          {values.style === "ring" ? (
            <span
              aria-hidden
              className="relative text-[0.625rem] font-semibold leading-none tabular-nums"
            >
              {percent}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}

function depictRunningAgents(values: SizedValues): ReactNode {
  if (values.size === "chip") {
    return (
      <ChatDockCompactChip
        icon={<Bot className="size-3.5" />}
        text="1"
        working={false}
        lineDeltas={null}
        label="Active agents"
        pulseToken={null}
        expanded={false}
        testId="layout-depiction-running-agents"
        onClick={noop}
      />
    );
  }
  return (
    <Collapsible open={false} variant="panel">
      <ActiveAgentsHeader open={false} runningCount={1} />
    </Collapsible>
  );
}

function depictChangedFiles(values: SizedValues): ReactNode {
  if (values.size === "chip") {
    return (
      <ChatDockCompactChip
        icon={<FileDiff className="size-3.5" />}
        text="1"
        working={false}
        lineDeltas={null}
        label="Changed files"
        pulseToken={null}
        expanded={false}
        testId="layout-depiction-changed-files"
        onClick={noop}
      />
    );
  }
  return (
    <span className="flex items-center gap-1">
      <FileChangeHeader
        filePath="src/task-list.tsx"
        operation="edit"
        additions={12}
        deletions={3}
        isStreaming={false}
        endState={null}
        reason="snapshot"
        clickHandlers={null}
      />
    </span>
  );
}

function depictBackground(values: SizedValues): ReactNode {
  if (values.size === "chip") {
    return (
      <ChatDockCompactChip
        icon={<History className="size-3.5" />}
        text="1"
        working={false}
        lineDeltas={null}
        label="Background"
        pulseToken={null}
        expanded={false}
        testId="layout-depiction-background"
        onClick={noop}
      />
    );
  }
  return (
    <Collapsible open={false} variant="panel">
      <BackgroundItemsHeader open={false} headerSummary="1 running" />
    </Collapsible>
  );
}

function depictModel(values: ModelValues): ReactNode {
  return (
    <HarnessModelTrigger
      selection={{ harnessId: "codex", modelSlug: "specimen", profileId: null }}
      label="Model"
      reasoningLabel="Medium"
      reasoningStep={{ index: 2, count: 4 }}
      reasoningIndicator={values.style}
      serviceTierLabel={null}
      serviceTierActive={false}
      profileLabel={null}
      profileAccentDot={null}
      isLoading={false}
      disabled={false}
      labelDisplay="responsive"
    />
  );
}

function depictRailPanel(regionId: RailRegionId): ReactNode {
  return (
    <span className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground">
      <LeftPanelRailIcon
        panelId={leftPanelIdForRailRegion(regionId)}
        hidden={false}
      />
    </span>
  );
}

/**
 * Every region's picture, by id.
 *
 * The registry's `depict` field points at these entries rather than restating
 * them, which is also why the import runs registry -> depiction and never back.
 */
export const REGION_DEPICTIONS: {
  readonly [K in RegionId]: (
    values: LayoutValues[K],
    arrangement: LayoutArrangement,
  ) => ReactNode;
} = {
  homeTab: () => (
    <TabStripHomeItemView isActive={false} onActivate={noop} badgeCount={0} />
  ),
  usageLimits: depictUsageLimits,
  resourceMonitor: depictResourceMonitor,
  minimap: (_values, arrangement) => depictMinimap(arrangement),
  contextUsage: depictContextUsage,
  runningAgents: depictRunningAgents,
  changedFiles: depictChangedFiles,
  background: depictBackground,
  attachImage: () => <ComposerAttachImageTrigger />,
  access: (values) => (
    <PermissionsTrigger
      label="Full access"
      compact={values.size === "chip"}
      icon={<Shield className="size-4" />}
    />
  ),
  // `ComposerHarnessLabel`'s own span: that component binds itself to the
  // composer's tile and its hotspot, neither of which a picture has.
  agent: () => (
    <span className="inline-block shrink-0 truncate px-1 text-ui-xs text-muted-foreground/70">
      Codex
    </span>
  ),
  model: depictModel,
  // `ComposerMicButton`'s own button, which gates itself on the preference
  // rather than taking it as a prop - a picture must draw it either way.
  mic: () => (
    <ToolbarIconButton aria-label="Voice input">
      <Mic className="size-4" />
    </ToolbarIconButton>
  ),
  railAgents: () => depictRailPanel("railAgents"),
  railTerminals: () => depictRailPanel("railTerminals"),
  railBrowsers: () => depictRailPanel("railBrowsers"),
  railArtifacts: () => depictRailPanel("railArtifacts"),
  railGitDiff: () => depictRailPanel("railGitDiff"),
  railPullRequests: () => depictRailPanel("railPullRequests"),
  railFileTree: () => depictRailPanel("railFileTree"),
  railSharing: () => depictRailPanel("railSharing"),
  railComments: () => depictRailPanel("railComments"),
};
