import type { ReactNode } from "react";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import { useComposerTileId } from "@/components/home/composer/composer-tile-hooks";
import { UNAVAILABLE_DASH } from "@/lib/resources/memory-metric";

/**
 * Order-only toolbar tile: the active harness's name, so `composer.harness`
 * has a real element in the strip to reorder. No visibility toggle - the
 * catalog entry says "Move rows only" because there is nothing to hide here
 * that the model chip does not already carry; this exists to give that
 * ordering slot a place to render.
 */
export function ComposerHarnessLabel(props: {
  readonly label: string | null;
}): ReactNode {
  const tileId = useComposerTileId();
  const { ref } = useLayoutRegion({ regionId: "agent", instanceId: tileId });
  return (
    <span
      ref={ref}
      // The plain chip: no border, no fill, the composer's own muted text
      // (L-88). `@max-lg` is the COMPOSER's container query, the same box every
      // neighbouring control measures itself against - a viewport `lg:` drew
      // the label in all four tiles of a wide canvas however narrow each tile
      // was, and then truncated it to nothing useful.
      className="inline-block shrink-0 truncate px-1 text-ui-xs text-muted-foreground @max-lg:hidden"
    >
      {props.label ?? UNAVAILABLE_DASH}
    </span>
  );
}
