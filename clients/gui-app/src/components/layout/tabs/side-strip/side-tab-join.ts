import { use, useEffect, useState } from "react";
import { useEpicDndStore } from "@/components/epic-canvas/dnd/dnd-store";
import { ColumnEdgeContext } from "@/components/layout/column-edge-context";
import { useArrangementValue } from "@/lib/layout-overrides";
import {
  sideTabJoinsPanel,
  type EdgeSide,
} from "@/lib/layout/layout-arrangement";
import type { SideRowFrame } from "./side-tab-row";

/**
 * The edge on which an active row, tile or split pair joins its panel sheet
 * (D3), or `null`. `surfaceIsEpic` answers for the pane that sits against the
 * strip's edge. Off while a tab is dragged: the join is anchored to the row's
 * layout box, which a drag displacement moves only by transform. Off while
 * `node` (the row, tile or pair) is not wholly inside the row list: the list
 * clips a row scrolled partly out, and the bridge outside the list cannot be
 * clipped with it, so a half-hidden row is drawn as a plain active row.
 */
export function useSideTabJoinedEdge(
  active: boolean,
  surfaceIsEpic: (edge: EdgeSide) => boolean,
  node: HTMLElement | null,
): EdgeSide | null {
  const edge = use(ColumnEdgeContext);
  const sidebarSide = useArrangementValue("sidebarSide");
  const dragging = useEpicDndStore((state) => state.activeHeaderTab !== null);
  const joins =
    edge !== null &&
    active &&
    !dragging &&
    sideTabJoinsPanel(edge, sidebarSide, surfaceIsEpic(edge));
  const inList = useWhollyInRowList(node, joins);
  return joins && inList ? edge : null;
}

/**
 * Whether `node` lies wholly inside the row list that scrolls it, observed
 * only while `watching`. Starts true, so a row that joins does so on its first
 * frame; the observer's first report corrects it at once if it is clipped.
 */
function useWhollyInRowList(
  node: HTMLElement | null,
  watching: boolean,
): boolean {
  const [inList, setInList] = useState(true);
  useEffect(() => {
    if (!watching || node === null) return;
    if (typeof IntersectionObserver === "undefined") return;
    const list = node.closest<HTMLElement>('[data-strip-axis="y"]');
    if (list === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry !== undefined) setInList(entry.intersectionRatio >= 1);
      },
      { root: list, threshold: [0, 1] },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [node, watching]);
  return inList;
}

/** The marker the joined paint in `index.css` keys on. */
export function joinedAttribute(joined: EdgeSide | null): SideRowFrame {
  return joined === null ? {} : { "data-side-tab-joined": joined };
}
