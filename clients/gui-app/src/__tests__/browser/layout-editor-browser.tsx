import { useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createHoverChip } from "@/components/layout-editor/canvas/hover-chip";
import { PresetsBlock } from "@/components/layout-editor/inspector/presets-block";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import { depictRegion } from "@/components/layout-editor/region-depiction";
import {
  LAYOUT_REGION_IDS,
  regionDepiction,
} from "@/components/layout-editor/regions/region-facts";
import { SampleWorkspaceRail } from "@/components/sample-workspace/sample-workspace-rail";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";
import "@/lib/theme-applier";
import "@/index.css";
import "@/components/layout-editor/layout-editor.css";

/**
 * THE PARITY REGRESSION (P2, L-11, L-53), in real Chrome with the real
 * stylesheet.
 *
 * What a unit test cannot decide is whether two pictures of the same region
 * LOOK the same: that is resolved computed styles and laid-out rects, and
 * jsdom has neither. Four claims live here.
 *
 * 1. **One picture per region.** A region is drawn through two entry points -
 *    the registry face the inspector's sections and Style examples use, and
 *    `depictRegion`, which the canvas ghosts and the preset miniatures use.
 *    Both are mounted in the SAME stage at the same width, and the driver
 *    walks the two trees in parallel comparing tag, eight computed properties
 *    and each node's rect relative to its own frame. This is the drift that
 *    actually happened: the stage used to draw its picture without the host
 *    context frame, so a status-bar segment in the inspector inherited the
 *    form's type scale.
 * 2. **The live rail.** The sample workspace's rail is a real surface built
 *    from the app's own components, so each of the nine rail regions has a
 *    LIVE node to compare its picture against. The driver measures the glyph
 *    in each.
 * 3. **Uniform scaling only.** The preset miniature's frame is measured
 *    untransformed, with `offsetWidth`/`offsetHeight`, against the 1000x620
 *    it claims - a reflowed card would be any other size.
 * 4. **The hover chip's PAINTED position.** Real Chrome resolves anchor
 *    positioning, so the chip is asserted where the browser put it rather
 *    than where a measurement says it should be.
 *
 * `window.__layoutEditorProbe.ready` gates all of it.
 */

declare global {
  interface Window {
    __layoutEditorProbe?: {
      ready: boolean;
      showChip: () => void;
    };
  }
}

export function PictureRow(props: { readonly regionId: RegionId }): ReactNode {
  const { regionId } = props;
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  const values = effectiveLayoutValues(basePreset, overrides);
  return (
    <div
      data-region-row={regionId}
      style={{ display: "flex", width: 720, alignItems: "flex-start" }}
    >
      <div data-picture="via-registry" style={{ width: 360 }}>
        <SpecimenStage off={false}>
          {regionDepiction(regionId, values, arrangement)}
        </SpecimenStage>
      </div>
      <div data-picture="via-depict" style={{ width: 360 }}>
        <SpecimenStage off={false}>
          {depictRegion(regionId, values[regionId], arrangement, null)}
        </SpecimenStage>
      </div>
    </div>
  );
}

export function Fixture(): ReactNode {
  useEffect(() => {
    const chip = createHoverChip();
    window.__layoutEditorProbe = {
      ready: true,
      showChip: () => {
        const node = document.querySelector("[data-chip-anchor]");
        if (!(node instanceof HTMLElement)) return;
        chip.show({ label: "Minimap - Right", node, placement: "above" });
      },
    };
    return () => {
      chip.destroy();
      window.__layoutEditorProbe = undefined;
    };
  }, []);

  return (
    <div data-layout-editing="1" style={{ width: 1400 }}>
      <section id="live-rail" style={{ display: "flex" }}>
        <SampleWorkspaceRail />
      </section>

      <section id="pictures">
        {LAYOUT_REGION_IDS.map((regionId) => (
          <PictureRow key={regionId} regionId={regionId} />
        ))}
      </section>

      <section id="presets" style={{ width: 320 }}>
        <PresetsBlock onPreviewPreset={() => undefined} />
      </section>

      {/* The two states the canvas decoration is read off: a dimmed leaf and
          a region the chip anchors to. Both carry the attributes
          `use-layout-region.ts` writes onto the app's own elements, so the
          driver measures the shipped rules rather than fixture styling. */}
      <section id="decoration" style={{ paddingTop: 80 }}>
        <span data-layout-passive style={{ display: "inline-block" }}>
          Passive leaf
        </span>
        <span
          data-chip-anchor
          data-layout-region="minimap"
          data-layout-anchor="hover"
          style={{
            display: "inline-block",
            width: 120,
            height: 24,
            marginLeft: 200,
          }}
        />
      </section>
    </div>
  );
}

// `useLayoutRegion` only marks a node while a session is live, and the live
// rail's `data-layout-region` attributes are what the driver compares against.
useLayoutEditorStore.getState().beginSession({
  scene: "sample",
  entry: "pointer",
  source: "direct_ui",
  preferredInstanceId: null,
  startedAt: 0,
});

const container = document.getElementById("root");
if (container !== null) createRoot(container).render(<Fixture />);
