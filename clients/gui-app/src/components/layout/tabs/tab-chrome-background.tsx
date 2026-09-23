import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { TAB_BOX_CLASS, TAB_COLOR_MARK_CLASS } from "./tab-chrome-tokens";

/**
 * The selected header tab: a self-contained box on the ground, in the sheets'
 * own material. It never reaches toward the sheet below - F4 retired the
 * folder tab that tried to - so the header and the sheets are separate boxes
 * with the shell gap between them.
 */
export function TabChromeBackground(props: {
  readonly fill: string;
  readonly borderColor: string;
  readonly className: string | undefined;
}) {
  return (
    <span
      aria-hidden
      data-testid="tab-chrome-box"
      className={cn(
        TAB_BOX_CLASS,
        "border border-(--swatch-border) bg-(--swatch)",
        props.className,
      )}
      style={
        {
          "--swatch": props.fill,
          "--swatch-border": props.borderColor,
        } as CSSProperties
      }
    />
  );
}

/** A tab's colour where no box wears it: see `TAB_COLOR_MARK_CLASS`. */
export function TabColorMark(props: { readonly color: string }) {
  return (
    <span
      aria-hidden
      data-testid="tab-color-mark"
      className={TAB_COLOR_MARK_CLASS}
      style={{ "--swatch": props.color } as CSSProperties}
    />
  );
}
