import { useColumnOverlayPlacement } from "@/components/layout/column-edge-context";
import { useEffect, useState, type ReactNode } from "react";
import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { RateLimitPopover } from "@/components/layout/header/rate-limit-popover";
import {
  useHeaderRateLimitBars,
  type HeaderRateLimitBar,
} from "@/hooks/rate-limits/use-header-rate-limit-bars";
import { useRateLimitResolveHostScope } from "@/hooks/rate-limits/use-rate-limit-host-scope";
import {
  useRateLimitProfileSelection,
  type RateLimitProfileSelection,
} from "@/hooks/rate-limits/use-rate-limit-profile-selection";
import { isHostScopeUsable } from "@/components/settings/host-scope/host-scope-status";
import { useScopedHostBinding } from "@/components/settings/host-scope/use-scoped-host-binding";
import type { HostScope } from "@/components/settings/host-scope/use-host-scope";
import { useTitleBarDragSuppression } from "@/stores/layout/title-bar-drag-store";
import { HostRuntimeContext, useHostBinding } from "@/lib/host";
import {
  rateLimitWindowFillPercent,
  rateLimitWindowSeverityBarClassName,
  rateLimitWindowSeverityTextClassName,
  RUNNING_LOW_TEXT_CLASS_NAME,
} from "@/lib/rate-limits/window-severity";
import { cn } from "@/lib/utils";
import { HarnessIcon } from "@/components/home/pickers/harness-icon";
import { StatusBarMiniBar } from "@/components/layout/status-bar/status-bar-mini-bar";
import {
  STRIP_READOUT_LINE_CLASS,
  type ReadingButtonForm,
} from "@/components/layout/tabs/side-strip/side-strip-tokens";
import { useRegionValues } from "@/lib/layout-overrides";
import {
  providerDisplayName,
  providerIdToGuiHarnessId,
} from "@/lib/provider-ordering";
import {
  windowPercentText,
  windowPercentValueText,
} from "@/lib/rate-limits/status-bar-window-text";
import type { AmountMode } from "@/lib/layout/layout-values";
import { registerDynamicActionHandler } from "@/lib/keybindings/dispatch";
import { formatChordForDisplay } from "@/lib/keybindings/chord";
import { useBindingForAction } from "@/stores/settings/keybinding-store";

const EMPTY_BAR_KEYS = ["primary", "secondary"] as const;

/** Stable identity so the placeholder path never re-renders on a new array. */
const NO_BARS: ReadonlyArray<HeaderRateLimitBar> = [];

/**
 * Header trigger for the provider rate-limit popover, scoped to the host the
 * popover's own picker selected.
 *
 * The scope is resolved HERE, above both the glyph and the popover, and
 * re-provided as this subtree's `HostRuntimeContext`. That one swap is what
 * re-targets the whole surface: every hook below reaches its host through
 * `useHostClient()` / `useAddressableHostId()`, and both read the binding
 * from context, so the query keys, the usage fetch scope and the
 * invalidations all move together and cannot end up describing different
 * machines. Nothing outside this subtree moves — picking a host to WATCH is
 * not picking where new work lands (`stores/rate-limits/rate-limit-popover-store`).
 *
 * `useScopedHostBinding` returns null while the pick is the active host, or
 * while it has not resolved to its own client — in both cases the value below
 * falls back to the AMBIENT binding, which is exactly what this subtree read
 * before there was a picker at all.
 *
 * The provider is rendered unconditionally, and that is load-bearing rather
 * than tidiness. Mounting it only when a scoped binding exists changes the
 * element type at this position the moment a pick resolves, so React unmounts
 * the whole subtree and mounts a fresh one — taking the popover's own `open`
 * state with it. The popover therefore closed the instant a host was chosen
 * from the picker inside it, which is to say the control could not be used.
 * The fallback re-provides the ambient binding VERBATIM (never a copy), so a
 * subtree that is not scoped still sees ambient binding updates.
 */
export function RateLimitIconButton(props: {
  /** The header's glyph, or a strip tile (F6). */
  readonly form: ReadingButtonForm;
}): ReactNode {
  const { scope, hasExplicitPick } = useRateLimitResolveHostScope();
  const scopedBinding = useScopedHostBinding(scope);
  const ambientBinding = useHostBinding();
  return (
    <HostRuntimeContext.Provider value={scopedBinding ?? ambientBinding}>
      <ScopedRateLimitIconButton
        scope={scope}
        hasExplicitPick={hasExplicitPick}
        form={props.form}
      />
    </HostRuntimeContext.Provider>
  );
}

/**
 * Its compact outlined surface combines a recognizable gauge icon with the two
 * live usage bars, so the control still reads as an intentional button when
 * both fills are 0%. Clicking opens the popover in any glyph state, including
 * empty (which lands on the zero-provider CTA).
 *
 * Never gates on data loading: `useHeaderRateLimitBars` returns `[]` both
 * before any provider has data and when zero providers are configured, and
 * both render the same neutral empty tracks - there is no separate loading
 * state and no fabricated placeholder usage.
 */
function ScopedRateLimitIconButton({
  scope,
  hasExplicitPick,
  form,
}: {
  readonly scope: HostScope;
  readonly hasExplicitPick: boolean;
  readonly form: ReadingButtonForm;
}): ReactNode {
  const placement = useColumnOverlayPlacement("foot");
  const [open, setOpen] = useState(false);
  const chord = useBindingForAction("app.rate-limits.open");
  useEffect(
    () =>
      registerDynamicActionHandler("app.rate-limits.open", () => {
        setOpen(true);
      }),
    [],
  );
  useTitleBarDragSuppression("rate-limits", open);
  // One subscription bridge owns the checked-account + per-harness profile
  // state for both the always-mounted glyph and the lazily-mounted popover,
  // keyed by the host this surface is watching - the accounts it names are
  // that host's, not the app-wide one's.
  const profileSelection = useRateLimitProfileSelection(scope.hostId);
  // A PICK that has not resolved to its own client leaves this subtree on the
  // AMBIENT binding, so mounting the bars here would draw one host's usage
  // under a glyph that stands for another - and the glyph, unlike every panel
  // in the popover, has no room to name the host it is describing. The neutral
  // placeholder is the honest reading, and keeping the hook out of the tree
  // (rather than discarding its output) also stops it driving fetch-on-mount
  // subprocesses against the host the user did not choose.
  //
  // Without a pick there is no second host to confuse this one with: the
  // ambient binding is the only thing the glyph has ever meant, and an
  // `unreachable` active host is the routine blip the envelope's last-good
  // retention is built to ride out. Blanking the bars there would be a
  // regression paid by every single-host user for a picker they never opened.
  const scopedToOwnHost = !hasExplicitPick || isHostScopeUsable(scope.status);
  const tooltipLabel = scope.isViewingActive
    ? "Usage limits"
    : `Usage limits · ${scope.hostLabel}`;
  const tooltip =
    chord === null
      ? tooltipLabel
      : `${tooltipLabel} (${formatChordForDisplay(chord)})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipWrapper
        // The host belongs in the label only when it is NOT the obvious one.
        // Naming the active host on every hover would train people to ignore
        // the one case the words exist for.
        label={tooltip}
        side={placement?.side ?? "top"}
        sideOffset={6}
        align={placement?.align}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            // The readout names itself from its readings (R1-A3).
            aria-label={form === "readout" ? undefined : "Usage limits"}
            data-testid="rate-limit-header-button"
            className={cn("shadow-xs", form !== "glyph" && "w-full")}
          >
            {scopedToOwnHost ? (
              <LiveRateLimitGlyph
                profileSelection={profileSelection}
                form={form}
              />
            ) : (
              <RateLimitTriggerContent bars={NO_BARS} form={form} />
            )}
          </Button>
        </PopoverTrigger>
      </TooltipWrapper>
      <RateLimitPopover
        side="bottom"
        align="end"
        onClose={() => setOpen(false)}
        profileSelection={profileSelection}
        scope={scope}
        hasExplicitPick={hasExplicitPick}
      />
    </Popover>
  );
}

/**
 * The glyph over live data. Split from `RateLimitGlyph` so the hook is mounted
 * only when this subtree is actually bound to the host being displayed - see
 * `scopedToOwnHost` above.
 */
function LiveRateLimitGlyph({
  profileSelection,
  form,
}: {
  readonly profileSelection: RateLimitProfileSelection;
  readonly form: ReadingButtonForm;
}): ReactNode {
  const bars = useHeaderRateLimitBars(profileSelection);
  return <RateLimitTriggerContent bars={bars} form={form} />;
}

/** The glyph, or its readings in words where the trigger fills a row (F6). */
function RateLimitTriggerContent({
  bars,
  form,
}: {
  readonly bars: ReadonlyArray<HeaderRateLimitBar>;
  readonly form: ReadingButtonForm;
}): ReactNode {
  return form === "readout" ? (
    <StripUsageReadout bars={bars} />
  ) : (
    <RateLimitGlyph bars={bars} />
  );
}

export function RateLimitGlyph({
  bars,
}: {
  readonly bars: ReadonlyArray<HeaderRateLimitBar>;
}): ReactNode {
  const isEmpty = bars.length === 0;
  const isDegraded = !isEmpty && bars.some((bar) => bar.degraded);
  return (
    <>
      <Gauge
        data-testid="rate-limit-gauge-icon"
        className={cn("size-3.5", isDegraded && RUNNING_LOW_TEXT_CLASS_NAME)}
        aria-hidden
      />
      <span
        aria-hidden
        className="inline-flex flex-col items-start gap-[2.5px]"
      >
        {isEmpty
          ? EMPTY_BAR_KEYS.map((key) => (
              <span
                key={key}
                data-testid="rate-limit-bar-track"
                className="relative h-1 w-4 overflow-hidden rounded-xs bg-muted-foreground/35 dark:bg-muted-foreground/40"
              />
            ))
          : bars.map((bar) => (
              <span
                key={`${bar.providerId}-${bar.windowLabel}`}
                data-testid="rate-limit-bar-track"
                className="relative h-1 w-4 overflow-hidden rounded-xs bg-muted-foreground/35 dark:bg-muted-foreground/40"
              >
                <span
                  data-testid="rate-limit-bar-fill"
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-xs",
                    rateLimitWindowSeverityBarClassName(bar.severity),
                  )}
                  style={{
                    width: `${rateLimitWindowFillPercent(bar.usedPercent)}%`,
                  }}
                />
              </span>
            ))}
      </span>
    </>
  );
}

/**
 * The glyph's readings in words, for a trigger that has the room: the
 * vertical strip's readings row (F6), where a gauge alone left a wide box
 * nearly empty. Each bar reads as its provider's icon, its meter and its
 * percent. The line is one row tall and wraps what does not fit onto a row
 * that is clipped, so a half-width tile shows the first reading whole and the
 * full width shows both, never a reading cut in half; the popover has the rest.
 */
function StripUsageReadout({
  bars,
}: {
  readonly bars: ReadonlyArray<HeaderRateLimitBar>;
}): ReactNode {
  const amount = useRegionValues("usageLimits").amount;
  if (bars.length === 0) {
    return (
      <>
        <span className="sr-only">Usage limits</span>
        <Gauge className="size-3.5" aria-hidden />
        <span aria-hidden className="text-ui-xs text-muted-foreground">
          Usage
        </span>
      </>
    );
  }
  return (
    <>
      <span className="sr-only">{usageReadoutName(bars, amount)}</span>
      <UsageReadoutLine bars={bars} amount={amount} />
    </>
  );
}

/**
 * The readout's accessible name, from the same bars and amount preference the
 * line draws, worded the way the status bar's usage trigger words its own
 * (`Usage limits: Codex 5h 19% used, ...`). Every bar is named, including the
 * ones the tile's width has sent to the clipped row: what a screen reader
 * hears cannot depend on how wide the strip is.
 */
function usageReadoutName(
  bars: ReadonlyArray<HeaderRateLimitBar>,
  amount: AmountMode,
): string {
  const readings = bars.map(
    (bar) =>
      `${providerDisplayName(bar.providerId)} ${bar.windowLabel} ${windowPercentText(bar.usedPercent, amount)}`,
  );
  return `Usage limits: ${readings.join(", ")}`;
}

function UsageReadoutLine({
  bars,
  amount,
}: {
  readonly bars: ReadonlyArray<HeaderRateLimitBar>;
  readonly amount: AmountMode;
}): ReactNode {
  return (
    <span aria-hidden className={STRIP_READOUT_LINE_CLASS}>
      {bars.map((bar) => (
        <span
          key={`${bar.providerId}-${bar.windowLabel}`}
          data-testid="rate-limit-strip-reading"
          className="inline-flex items-center gap-1"
        >
          <HarnessIcon
            harnessId={providerIdToGuiHarnessId(bar.providerId)}
            className={cn("size-3", bar.degraded && "opacity-60")}
          />
          <StatusBarMiniBar
            windowKey={`${bar.providerId}:${bar.windowLabel}`}
            usedPercent={bar.usedPercent}
            severity={bar.severity}
          />
          <span
            className={cn(
              "tabular-nums",
              rateLimitWindowSeverityTextClassName(bar.severity),
            )}
          >
            {windowPercentValueText(bar.usedPercent, amount)}
          </span>
        </span>
      ))}
    </span>
  );
}
