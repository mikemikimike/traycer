import { useCallback, useEffect, useRef } from "react";
import { useEpicViewTabId } from "@/components/epic-canvas/view-tab-context";
import { usePaneVisible } from "@/components/epic-tabs/pane-visibility-context";
import type { RegionId } from "@/lib/layout/region-id";
import {
  preferredRegionInstance,
  useLayoutEditorStore,
  type LayoutEditorState,
  type RegionInstance,
} from "@/stores/layout/layout-editor-store";

/**
 * Marks a real element as a customizable region (4.1).
 *
 * The evolution of `useLayoutHotspot`: the node ref, the scene/instance key
 * and the pane-visibility gate are unchanged, because they are what makes a
 * hidden pane's copy of a region stay out of the editor. What changed is what
 * registration is FOR. The node used to be a rect source for a proxy button
 * drawn on top of it; it is now the attribute host that the decoration CSS
 * styles in place, plus the element the ring measures and the chip anchors to
 * (L-13).
 *
 * Decoration is written straight onto the node rather than returned as props:
 * the element belongs to the app, its props belong to whatever renders it, and
 * a hover must not re-render a chat tile.
 */
export function useLayoutRegion(input: {
  regionId: RegionId;
  instanceId: string | null;
}): {
  readonly ref: (node: HTMLElement | null) => void;
  readonly editing: boolean;
} {
  const { regionId, instanceId } = input;
  const viewTabId = useEpicViewTabId();
  const visible = usePaneVisible();
  const editing = useLayoutEditorStore((state) => state.session !== null);
  const nodeRef = useRef<HTMLElement | null>(null);
  const registered = useRef<RegionInstance | null>(null);

  const sync = useCallback(() => {
    const previous = registered.current;
    const state = useLayoutEditorStore.getState();
    if (previous !== null) {
      strip(previous.node);
      state.unregisterInstance(previous.key, previous.node);
    }
    registered.current = null;
    const node = nodeRef.current;
    if (state.session === null || node === null || !visible) return;
    const sceneId = viewTabId ?? "shell";
    const instance: RegionInstance = {
      key: `${regionId}@${sceneId}:${instanceId ?? "-"}`,
      regionId,
      sceneId,
      instanceId,
      node,
    };
    registered.current = instance;
    node.setAttribute("data-layout-region", regionId);
    if (instanceId !== null)
      node.setAttribute("data-layout-instance", instanceId);
    state.registerInstance(instance);
    decorate(instance);
  }, [regionId, instanceId, viewTabId, visible]);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      nodeRef.current = node;
      sync();
    },
    [sync],
  );

  useEffect(() => {
    sync();
    const unsubscribe = useLayoutEditorStore.subscribe((state, previous) => {
      if (state.session !== previous.session) {
        sync();
        return;
      }
      if (
        state.hovered !== previous.hovered ||
        state.selected !== previous.selected ||
        state.instances !== previous.instances
      ) {
        const instance = registered.current;
        if (instance !== null) decorate(instance);
      }
    });
    return () => {
      unsubscribe();
      const instance = registered.current;
      if (instance !== null) {
        strip(instance.node);
        useLayoutEditorStore
          .getState()
          .unregisterInstance(instance.key, instance.node);
      }
      registered.current = null;
    };
  }, [sync]);

  return { ref, editing };
}

/**
 * The live attributes 4.2's CSS keys off.
 *
 * `data-hover` and `data-selected` land on EVERY instance of the region, which
 * is what makes both tiles' copies light up together (L-23). `data-layout-anchor`
 * lands on exactly one node per role, because two elements sharing an
 * `anchor-name` resolve to the last in tree order and would anchor an overlay
 * to a background tile (C-12). The roles are separate names because the chip
 * follows the pointer while the pinned card stays on the open section.
 */
function decorate(instance: RegionInstance): void {
  const state = useLayoutEditorStore.getState();
  const editing = state.session !== null;
  const hovered = editing && state.hovered === instance.regionId;
  const selected = editing && state.selected === instance.regionId;
  flag(instance.node, "data-hover", hovered);
  flag(instance.node, "data-selected", selected);
  const roles: string[] = [];
  if (hovered && isAnchorInstance(state, instance)) roles.push("hover");
  if (selected && isAnchorInstance(state, instance)) roles.push("selected");
  if (roles.length === 0) instance.node.removeAttribute("data-layout-anchor");
  else instance.node.setAttribute("data-layout-anchor", roles.join(" "));
}

function isAnchorInstance(
  state: LayoutEditorState,
  instance: RegionInstance,
): boolean {
  return preferredRegionInstance(state, instance.regionId) === instance;
}

function flag(node: HTMLElement, attribute: string, on: boolean): void {
  if (on) node.setAttribute(attribute, "1");
  else node.removeAttribute(attribute);
}

/** Leaves the app's own element exactly as it was found. */
function strip(node: HTMLElement): void {
  node.removeAttribute("data-layout-region");
  node.removeAttribute("data-layout-instance");
  node.removeAttribute("data-layout-anchor");
  node.removeAttribute("data-hover");
  node.removeAttribute("data-selected");
}
