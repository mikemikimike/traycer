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
 * Left-aligned per the decision-log's ticket-04 note, and fluid: the fixed
 * 88px minimum height is the one value the plan's section 6 freezes, not a
 * layout width (5.5 bans those outside its own short list).
 */
export function SpecimenStage(props: SpecimenStageProps): ReactNode {
  return (
    <div
      // The plan's section 6 freezes the stage radius at 10px, which IS a token
      // here: this app's `--radius` is 6px and `--radius-xl` is 1.6667x it.
      // Stock Tailwind's 12px `rounded-xl` is not what this theme means by it.
      className="relative m-3 flex min-h-22 items-center justify-start overflow-hidden rounded-xl border border-border bg-card px-4 py-4.5"
      style={{
        backgroundImage:
          "radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--foreground) 7%, transparent) 0%, transparent 62%)",
      }}
    >
      <span className="absolute top-1.5 left-2.5 text-micro tracking-[0.09em] text-muted-foreground uppercase opacity-80">
        Specimen
      </span>
      <div
        className={cn("min-w-0 transition-opacity", props.off && "opacity-30")}
      >
        {props.children}
      </div>
    </div>
  );
}
