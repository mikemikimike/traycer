import NumberFlow, { useIsSupported, type Format } from "@number-flow/react";

import { useMotionEnabled } from "@/lib/animation/use-motion-enabled";
import { cn } from "@/lib/utils";

/**
 * Digit travel and the width change that a place-value crossing (9 -> 10)
 * brings with it. 180ms on the app's only strong easing token, so a rolling
 * number sits in the same family as the 140ms leader badge and the 90ms tab
 * reorder rather than in a generic 200-300ms default.
 */
const ROLL_TIMING: EffectTiming = {
  duration: 180,
  easing: "cubic-bezier(0.32, 0.72, 0, 1)",
};

/** Digits entering and leaving fade a touch faster than they travel. */
const OPACITY_TIMING: EffectTiming = { duration: 140, easing: "ease-out" };

interface RollingNumberProps {
  readonly value: number;
  readonly format: Format | undefined;
  readonly className: string | undefined;
  readonly testId: string | undefined;
}

/**
 * A number that rolls its digits when it changes, and is plain text whenever
 * it must not.
 *
 * Why the gate lives here rather than at each call site: `@number-flow/react`
 * honours the OS reduced-motion query and nothing else, so a call site that
 * trusted the package would keep animating with the app's own "Panel
 * animations" switch off - which is exactly the gap `AnimatedPinnedInteger`
 * shipped with. `useMotionEnabled` closes it once, for every caller.
 *
 * Why `useIsSupported` and never `useCanAnimate`: the latter also calls
 * `usePrefersReducedMotion`, whose snapshot dereferences a `MediaQueryList`
 * that only exists in a browser, and our own gate already covers reduced
 * motion better than the package can.
 *
 * Both branches format through `Intl.NumberFormat` with the same `format`, so
 * the plain text and the rolled digits can never disagree about the string.
 * In jsdom neither `Element.prototype.animate` nor the `CSS` global exists, so
 * `useIsSupported()` is false for the whole suite and this renders the plain
 * span - which is why existing `getByText` and `textContent` assertions at the
 * call sites keep passing even though the animated element hides its digits in
 * a shadow root.
 *
 * It carries no tone and no font: `color`, `font-family`, `font-size` and
 * `font-variant-numeric` all inherit, and they inherit across the shadow
 * boundary too, so the caller keeps wearing the tone. It emits no `sr-only`
 * mirror and no `aria-live`: the element sets its own `role="img"` plus the
 * whole formatted value as its accessible name, which a live region would turn
 * into an announcement per tick. It never sets `willChange`, and it never
 * animates its first value.
 *
 * A caller whose value is not a number - `99+` - does not use this component
 * and renders plain text instead.
 */
export function RollingNumber({
  value,
  format,
  className,
  testId,
}: RollingNumberProps) {
  const supported = useIsSupported();
  const motionEnabled = useMotionEnabled();

  if (!supported || !motionEnabled) {
    return (
      <span data-testid={testId} className={cn("tabular-nums", className)}>
        {new Intl.NumberFormat(undefined, format).format(value)}
      </span>
    );
  }

  return (
    <NumberFlow
      value={value}
      format={format}
      data-testid={testId}
      className={cn("tabular-nums", className)}
      transformTiming={ROLL_TIMING}
      spinTiming={ROLL_TIMING}
      opacityTiming={OPACITY_TIMING}
    />
  );
}
