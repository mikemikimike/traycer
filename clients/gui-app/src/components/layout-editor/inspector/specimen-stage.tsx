import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SpecimenStageProps {
  readonly children: ReactNode;
  /** Greyed when the region (or the provider) is off (L-08's "everything below Shown"). */
  readonly off: boolean;
}

/**
 * The section's own lit plinth (L-09): the real component rendered 1:1,
 * never wrapped, clipped with a soft right-edge fade instead (L-45's known
 * deviation from the prototype's own hand-placed clip). `.stage` in the
 * prototype.
 *
 * Centred, and left-aligned only where the picture is too wide to fit. Both
 * come out of the one `justify-center` below rather than a second measurement:
 * the wrapper is the stage's full width and centres what it holds, so a
 * depiction that fits sits in the middle, and one that overflows shrinks to
 * the wrapper instead - its left edge is the stage's, and `HostContextFrame`
 * fades the right (I-07). The ticket-04 note that left-aligned everything
 * predates L-86, and it also dropped the prototype's own condition
 * (`.stage .depict-clip { justify-content: center }` against
 * `.depict-clip.is-clipped { justify-content: flex-start }`).
 *
 * **The wrapper takes the width; the child decides what to do with it.** It
 * used to shrink-wrap, and a flex item that shrink-wraps is sized from its
 * content: every `flex-1` spacer inside a SURFACE specimen contributes zero to
 * that measurement, so the Top bar's avatar and bell and the Status bar's
 * resource readout were pulled in against the left-hand group instead of
 * standing at the surface's right edge, and `w-full` on those rows resolved
 * against a width their own content had chosen (R1-08). A leaf depiction is
 * unaffected: it has no width of its own, so it still shrink-wraps inside the
 * wrapper and `justify-center` centres it, which is what the rail column and
 * every single-region stage want.
 *
 * Fluid otherwise: the fixed 88px minimum height is the one value the plan's
 * section 6 freezes, not a layout width (5.5 bans those outside its own short
 * list).
 */
export function SpecimenStage(props: SpecimenStageProps): ReactNode {
  return (
    <div
      // The plan's section 6 freezes the stage radius at 10px, which IS a token
      // here: this app's `--radius` is 6px and `--radius-xl` is 1.6667x it.
      // Stock Tailwind's 12px `rounded-xl` is not what this theme means by it.
      className="relative m-3 flex min-h-22 items-center overflow-hidden rounded-xl border border-border bg-card px-4 py-4.5"
      style={{
        backgroundImage:
          "radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--foreground) 7%, transparent) 0%, transparent 62%)",
      }}
    >
      <span className="absolute top-1.5 left-2.5 text-micro tracking-[0.09em] text-muted-foreground uppercase opacity-80">
        Specimen
      </span>
      {/* `inert`, the same rule `PresetCard`'s miniature already follows: a
        specimen draws the REAL leaf, and several of them are genuinely
        interactive components with their own buttons. A stage is a PICTURE,
        so nothing in it belongs in the tab order, the a11y tree or hit
        testing - on the page that was roughly 22 dead controls interleaved
        with the real ones (P-8). */}
      <div
        inert
        className={cn(
          "flex w-full min-w-0 justify-center transition-opacity",
          props.off && "opacity-30",
        )}
      >
        {props.children}
      </div>
    </div>
  );
}
