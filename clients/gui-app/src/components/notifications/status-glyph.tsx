import { useId, type ReactNode } from "react";
import { AgentSpinningDots } from "@/components/ui/agent-spinning-dots";
import { cn } from "@/lib/utils";
import type { StatusGlyphKind } from "./status-glyph-kind";

/** The status role each glyph paints in, through `currentColor`. */
const STATUS_GLYPH_TONE: Readonly<Record<StatusGlyphKind, string>> = {
  approval: "text-warning",
  reply: "text-warning",
  failed: "text-destructive",
  unread: "text-info",
  running: "text-muted-foreground",
  background: "text-muted-foreground",
};

/**
 * One status glyph on a 16-unit grid, scaled by `className` (`size-3`,
 * `size-4`, ...). The filled shapes cut their inner mark out rather than
 * painting it, so the mark shows whatever surface the glyph sits on and needs
 * no second colour. `label` names it for assistive tech; pass `null` where the
 * surrounding text already says the state.
 */
export function StatusGlyph(props: {
  readonly kind: StatusGlyphKind;
  readonly className: string | undefined;
  readonly label: string | null;
}): ReactNode {
  const maskId = useId();
  const a11y =
    props.label === null
      ? { "aria-hidden": true }
      : { role: "img", "aria-label": props.label };
  if (props.kind === "running") {
    return (
      <span
        {...a11y}
        data-status-glyph="running"
        className={cn(
          "inline-flex shrink-0 items-center justify-center",
          props.className,
        )}
      >
        <AgentSpinningDots
          className="size-full"
          testId={undefined}
          variant="dots2"
          tone="muted"
        />
      </span>
    );
  }
  return (
    <svg
      {...a11y}
      viewBox="0 0 16 16"
      data-status-glyph={props.kind}
      className={cn("shrink-0", STATUS_GLYPH_TONE[props.kind], props.className)}
    >
      <GlyphShape kind={props.kind} maskId={maskId} />
    </svg>
  );
}

function GlyphShape(props: {
  readonly kind: Exclude<StatusGlyphKind, "running">;
  readonly maskId: string;
}): ReactNode {
  switch (props.kind) {
    case "approval":
      // A diamond with an exclamation mark cut out.
      return (
        <CutOut
          maskId={props.maskId}
          mark={
            <>
              <rect x="7.25" y="4.4" width="1.5" height="4.6" rx="0.75" />
              <circle cx="8" cy="11" r="0.95" />
            </>
          }
        >
          <path d="M8 1.2 14.8 8 8 14.8 1.2 8Z" />
        </CutOut>
      );
    case "reply":
      // A speech bubble with a question mark cut out.
      return (
        <CutOut
          maskId={props.maskId}
          mark={
            <>
              <path
                d="M6.4 5.6a1.6 1.6 0 1 1 2.3 1.5c-.5.2-.7.5-.7 1v.3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <circle cx="8" cy="10" r="0.8" />
            </>
          }
        >
          <path d="M2 3.8A1.8 1.8 0 0 1 3.8 2h8.4A1.8 1.8 0 0 1 14 3.8v6.4a1.8 1.8 0 0 1-1.8 1.8H7l-3.4 2.6V12A1.8 1.8 0 0 1 2 10.2Z" />
        </CutOut>
      );
    case "failed":
      // A disc with a cross cut out.
      return (
        <CutOut
          maskId={props.maskId}
          mark={
            <path
              d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          }
        >
          <circle cx="8" cy="8" r="6.5" />
        </CutOut>
      );
    case "unread":
      return <circle cx="8" cy="8" r="4" fill="currentColor" />;
    case "background":
      // A dashed ring round a dot: the turn is over, work is still alive.
      return (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeDasharray="2.2 2"
          />
          <circle cx="8" cy="8" r="1.6" fill="currentColor" />
        </>
      );
  }
}

/** A `currentColor` shape with `mark` (drawn in black) masked out of it. */
function CutOut(props: {
  readonly maskId: string;
  readonly mark: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <>
      <mask id={props.maskId}>
        <rect width="16" height="16" className="fill-white" />
        <g className="fill-black text-black">{props.mark}</g>
      </mask>
      <g fill="currentColor" mask={`url(#${props.maskId})`}>
        {props.children}
      </g>
    </>
  );
}
