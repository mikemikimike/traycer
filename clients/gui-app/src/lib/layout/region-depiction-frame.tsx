import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/**
 * The host's row around a depiction, and the only React component in the
 * depiction layer.
 *
 * Its own file because the rest of that layer exports functions rather than
 * components, and a module holding both loses fast refresh - the same split
 * `providers/layout-override-provider.tsx` makes for the same reason.
 */

/**
 * Which real surface a region lives in.
 *
 * A depiction is wrapped in its host's typography, gap and height, so the same
 * markup lands at the same size wherever it is drawn - the specimen stage, an
 * example row and the canvas all read as one thing. Without it a status-bar
 * segment drawn inside a form would inherit the form's type scale and stop
 * being a picture of the strip.
 */
export type HostContextId =
  | "top-bar"
  | "status-bar"
  | "toolbar"
  | "composer-foot"
  | "dock"
  | "chip-strip"
  | "rail"
  | "chat";

/**
 * Each host's own row, copied from the surface named beside it rather than
 * approximated - these are the numbers the parity regression compares (L-53).
 */
const HOST_CONTEXT_CLASS: Readonly<Record<HostContextId, string>> = {
  // `layout/tabs/tab-strip.tsx`: tabs stand on the strip's baseline.
  "top-bar": "flex items-end gap-0.5 text-ui-sm",
  // `layout/status-bar/app-status-bar.tsx`: the strip's one row.
  "status-bar": "flex h-6 items-center gap-2 text-ui-xs tabular-nums",
  // `home/toolbar/composer-toolbar-left.tsx`, which the right cluster shares.
  toolbar: "flex items-center gap-1 text-ui-sm",
  // The composer's lower row, where the context chip sits.
  "composer-foot": "flex items-center gap-0.5 text-ui-sm",
  // `chat/chat-lower-dock.tsx`: a dock row takes the card's whole width.
  dock: "flex w-full flex-col items-stretch gap-1 text-ui-sm",
  // `chat/chat-dock-compact-strip.tsx`: the chips share one row.
  "chip-strip": "flex items-center gap-1 text-ui-xs",
  // `epic-canvas/sidebar/epic-sidebar-rail.tsx`, vertical orientation.
  rail: "flex w-12 flex-col items-center gap-1 py-2",
  // The transcript edge the minimap's ticks are positioned against.
  chat: "relative flex h-16 items-stretch",
};

/**
 * One line, never wrapped, never scaled.
 *
 * A picture that outgrows the box it is in is CLIPPED with a soft right-edge
 * fade (L-45), because both alternatives lie: wrapping invents a second row
 * the real surface does not have, and scaling shows a size nothing on screen
 * is drawn at. The fade rides a data attribute rather than always being on,
 * because a row that fits - a full-width dock row, whose right edge IS the
 * frame's - would otherwise fade content nothing was hiding.
 *
 * The same class strings as `hooks/ui/use-horizontal-scroll-edges.ts`, which
 * is the app's other measured edge fade.
 */
const CLIP_FADE =
  "data-[clipped=true]:[-webkit-mask-image:linear-gradient(to_right,black_calc(100%-34px),transparent)] data-[clipped=true]:[mask-image:linear-gradient(to_right,black_calc(100%-34px),transparent)]";

export function HostContextFrame(props: {
  readonly host: HostContextId;
  readonly children: ReactNode;
}): ReactNode {
  const frameRef = useRef<HTMLDivElement>(null);
  const [clipped, setClipped] = useState(false);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    setClipped(frame.scrollWidth > frame.clientWidth + 1);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [measure]);

  // The box is not the only thing that moves: a longer reading at the same
  // width overflows a frame that never resized, so every render re-reads the
  // two numbers. `setClipped` bails out on an unchanged answer, so the common
  // case costs two DOM reads.
  useEffect(measure);

  return (
    <div
      ref={frameRef}
      data-layout-depiction={props.host}
      data-clipped={clipped ? "true" : "false"}
      className={cn(
        "min-w-0 max-w-full flex-nowrap overflow-hidden",
        HOST_CONTEXT_CLASS[props.host],
        CLIP_FADE,
      )}
    >
      {props.children}
    </div>
  );
}
