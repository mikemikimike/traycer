import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ChatDockCompactStrip,
  ChatDockCompactStripProvider,
} from "@/components/chat/chat-dock-compact-strip";
import type { ChatDockSection } from "@/lib/chat/chat-dock-sections";
import { createHoverChip } from "@/components/layout-editor/canvas/hover-chip";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import { PresetsBlock } from "@/components/layout-editor/inspector/presets-block";
import { SpecimenStage } from "@/components/layout-editor/inspector/specimen-stage";
import {
  depictRegion,
  regionDepiction,
} from "@/components/layout-editor/region-depiction";
import { HostContextFrame } from "@/components/layout-editor/region-depiction-frame";
import { LAYOUT_REGION_IDS } from "@/components/layout-editor/regions/region-facts";
import { ComposerTileIdProvider } from "@/components/home/composer/composer-tile-context";
import { ComposerToolbar } from "@/components/home/toolbar/composer-toolbar";
import { SampleWorkspaceRail } from "@/components/sample-workspace/sample-workspace-rail";
import {
  SAMPLE_DOCK,
  SAMPLE_TILE_ID,
} from "@/components/sample-workspace/sample-workspace-scene";
import { TooltipProvider } from "@/components/ui/tooltip";
import { USAGE_PROVIDER_IDS } from "@/lib/layout/layout-arrangement";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import { createComposerToolbarStore } from "@/stores/composer/composer-toolbar-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";
import "@/lib/theme-applier";
import "@/index.css";
import "@/components/layout-editor/layout-editor.css";

/**
 * THE PARITY REGRESSION (P2, L-11, L-53, L-85), in real Chrome with the real
 * stylesheet.
 *
 * What a unit test cannot decide is whether a picture of a region LOOKS like
 * the region: that is resolved computed styles and laid-out rects, and jsdom
 * has neither. Four claims live here.
 *
 * 1. **Live versus picture.** Every live surface this fixture can mount
 *    WITHOUT the host runtime is mounted under the same host frame the
 *    picture is drawn in, and the driver compares the two: the icon's painted
 *    box and colour where the region has one, its own type scale and colour
 *    where it does not. A region this fixture cannot mount live is named in
 *    {@link NO_LIVE_LEAF} with the reason, and the driver PRINTS those rather
 *    than counting them as covered - a coverage claim nobody can rely on is
 *    worse than an honest gap (G3-02). The two picture entry points are one
 *    function since L-77, so comparing them with each other proved nothing.
 * 2. **The live surfaces.** Three of them, and each is a mount the app itself
 *    makes. The sample workspace's rail is a real surface built from the app's
 *    own components, so each of the nine rail regions has a live node. The
 *    composer's toolbar in presentation mode carries the toolbar regions. The
 *    dock's compact strip carries every dock member at Chip size (L-98) - the
 *    size at which they mount with no host runtime behind them. Neither count
 *    is written down here: both clusters have gained and lost members (L-136,
 *    L-139, L-142), and a number in a comment is the thing that goes stale.
 * 3. **Uniform scaling only.** The preset miniature's frame is measured
 *    untransformed, with `offsetWidth`/`offsetHeight`, against the 1000x620
 *    it claims - a reflowed card would be any other size.
 * 4. **The hover chip's PAINTED position.** Real Chrome resolves anchor
 *    positioning, so the chip is asserted where the browser put it rather
 *    than where a measurement says it should be.
 *
 * `window.__layoutEditorProbe.ready` gates all of it.
 */

/**
 * Why a region has no live node here, one line each.
 *
 * The driver requires every region it did not find live to be named here, so
 * the gap is stated by a person rather than discovered by a count.
 */
const NO_LIVE_LEAF: Readonly<Partial<Record<RegionId, string>>> = {
  homeTab:
    "the real Home item is drawn by the tab strip, which reads the tabs store and the router",
  usageLimits:
    "the status bar's usage cluster resolves the watched host's rate-limit subscription",
  resourceMonitor:
    "StatusBarResourceSegment resolves its readings through the desktop sampler and the resource registry",
  minimap:
    "ChatTurnMinimapView is driven by the transcript's measured viewport and its scroll position",
  contextUsage:
    "ContextUsageChip draws through `motion/react-m`, which needs the app's LazyMotion feature provider",
};

declare global {
  interface Window {
    __layoutEditorProbe?: {
      ready: boolean;
      noLiveLeaf: Readonly<Partial<Record<RegionId, string>>>;
      regionIds: ReadonlyArray<RegionId>;
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
    <div data-region-row={regionId} style={{ width: 360 }}>
      <SpecimenStage off={false}>
        {regionDepiction(regionId, values, arrangement)}
      </SpecimenStage>
    </div>
  );
}

/**
 * The composer's real toolbar, in presentation mode - the same mount the
 * sample workspace makes, which is the one that draws the five toolbar
 * regions without reaching a host. It is wrapped in the picture's own host
 * frame so the two sides inherit the same type scale, which is the whole
 * point of comparing them.
 */
function LiveToolbar(): ReactNode {
  const [store] = useState(() =>
    createComposerToolbarStore({
      seedKey: "layout-editor-browser-fixture",
      values: {
        permission: "supervised",
        selection: {
          harnessId: "claude",
          modelSlug: "sample-model",
          profileId: null,
        },
        reasoning: "medium",
        serviceTier: "",
      },
      onSettingsChange: null,
      tuiOnly: false,
      chatLineCarriesAutoMode: null,
      hostId: null,
    }),
  );
  return (
    <ComposerTileIdProvider tileId="layout-editor-browser-fixture">
      <HostContextFrame host="toolbar">
        <ComposerToolbar
          presentation
          store={store}
          onAttachImages={() => undefined}
          canSubmit={false}
          attachmentPending={false}
          onSubmit={() => undefined}
          activeTurnStatus={null}
          stopDisabled
          onStopTurn={null}
          composerDisabledHint={null}
          dictation={{
            state: "idle",
            onToggle: () => undefined,
            onStop: () => undefined,
            onCancel: () => undefined,
            getStream: () => null,
          }}
          dictationPreparing={null}
          settingsLocked={false}
          createProfileHostId={null}
          runTargetHostId={null}
          terminalLoginSurface={null}
          chatLineCarriesAutoMode={null}
        />
      </HostContextFrame>
    </ComposerTileIdProvider>
  );
}

/**
 * The dock's members, live, as the pills they are at Chip size.
 *
 * They had no live node here at all while the rows mounted only inside a chat
 * tile's lower surfaces. L-98 moved the sample workspace onto the REAL dock, and
 * its compact strip is the half that needs no host runtime: the chips are
 * `ChatDockCompactChip` fed a model, which is the same leaf the picture draws.
 * The full ROW still has none - `ActiveAgentsPanel` mounts `AgentStopButton`,
 * which resolves a host client and a mutation - so this fixture draws all three
 * at Chip size on both sides (see the store seed below), all five of them
 * since L-139/L-142 added the Message Queue and Todo.
 *
 * `working: false` on every chip, against the sample scene's own two: a working
 * glyph is `text-primary` under a per-frame opacity sweep, and the driver
 * compares the glyph's resolved colour. The picture is drawn at rest, so the
 * live side is too - the state is not what is being compared here.
 */
function LiveDockChips(): ReactNode {
  const files = useLayoutRegion({
    regionId: "changedFiles",
    instanceId: SAMPLE_TILE_ID,
  });
  const agents = useLayoutRegion({
    regionId: "runningAgents",
    instanceId: SAMPLE_TILE_ID,
  });
  const background = useLayoutRegion({
    regionId: "background",
    instanceId: SAMPLE_TILE_ID,
  });
  // Five since L-139/L-142, and the count is load-bearing rather than
  // incidental: `SAMPLE_DOCK` grew the Message Queue and Todo chips, and a
  // `refs` table that still named three handed those two an `undefined`
  // hotspot - so they drew a chip that registered no region, and the coverage
  // claim below reported them as regions with no live leaf anywhere.
  const queue = useLayoutRegion({
    regionId: "queue",
    instanceId: SAMPLE_TILE_ID,
  });
  const todo = useLayoutRegion({
    regionId: "todo",
    instanceId: SAMPLE_TILE_ID,
  });
  const refs: Readonly<
    Record<ChatDockSection, (node: HTMLElement | null) => void>
  > = {
    filesChanged: files.ref,
    activeAgents: agents.ref,
    background: background.ref,
    queue: queue.ref,
    todo: todo.ref,
  };
  const chips = SAMPLE_DOCK.map((chip) => ({
    ...chip,
    working: false,
    hotspotRef: refs[chip.section],
  }));
  return (
    <ChatDockCompactStripProvider
      value={{
        chips,
        // Every pill at rest, for the same reason `working` is false above:
        // the open pill is drawn selected, and what is compared here is the
        // resting chip the picture draws.
        openSection: null,
        panelId: "layout-editor-browser-dock-panel",
        onToggle: () => undefined,
      }}
    >
      <HostContextFrame host="chip-strip">
        <ChatDockCompactStrip actionsRef={() => undefined} snapshotLoaded />
      </HostContextFrame>
    </ChatDockCompactStripProvider>
  );
}

/**
 * The clip fade, on the one picture that can outgrow the inspector (LV2-14).
 *
 * The Usage limits picture draws EVERY shown provider since R3-03, and eight
 * segments do not fit the 292px a docked stage gives them. That is what
 * `HostContextFrame`'s measured `data-clipped` and its `CLIP_FADE` mask are
 * for, and jsdom can decide neither: `scrollWidth`, `clientWidth` and a
 * resolved `mask-image` are all real layout. The driver asserts on this node -
 * `data-clipped="true"` and a computed `mask-image` other than `none` on the
 * `[data-layout-depiction]` frame inside it.
 *
 * Its own arrangement rather than the store's, so the case is eight providers
 * whatever this build ships as a default and whatever the preset rows above
 * leave hidden.
 */
function ClipFadeCase(): ReactNode {
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  const values = effectiveLayoutValues(basePreset, overrides);
  return (
    <div data-clip-case="usage-limits" style={{ width: 292 }}>
      <SpecimenStage off={false}>
        {depictRegion(
          "usageLimits",
          values.usageLimits,
          {
            ...arrangement,
            usageProviders: USAGE_PROVIDER_IDS,
            hiddenProviders: [],
          },
          null,
        )}
      </SpecimenStage>
    </div>
  );
}

export function Fixture(): ReactNode {
  useEffect(() => {
    const chip = createHoverChip();
    window.__layoutEditorProbe = {
      ready: true,
      noLiveLeaf: NO_LIVE_LEAF,
      regionIds: LAYOUT_REGION_IDS,
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
    <TooltipProvider>
      <div data-layout-editing="1" style={{ width: 1400 }}>
        <section data-live-surface id="live-rail" style={{ display: "flex" }}>
          <SampleWorkspaceRail />
        </section>

        <section data-live-surface id="live-toolbar" style={{ width: 720 }}>
          <LiveToolbar />
        </section>

        <section data-live-surface id="live-dock" style={{ width: 720 }}>
          <LiveDockChips />
        </section>

        <section id="pictures">
          {LAYOUT_REGION_IDS.map((regionId) => (
            <PictureRow key={regionId} regionId={regionId} />
          ))}
        </section>

        <section id="clip-fade">
          <ClipFadeCase />
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
    </TooltipProvider>
  );
}

// `useLayoutRegion` only marks a node while a session is live, and the live
// surfaces' `data-layout-region` attributes are what the driver compares
// against.
useLayoutEditorStore.getState().beginSession({
  entry: "pointer",
  source: "direct_ui",
  startedAt: 0,
});

// Every dock member at Chip size, so the picture and the live leaf are
// pictures of the same thing (see `LiveDockChips`). Every other region is drawn
// at whatever this build ships as its default.
//
// Read off the arrangement rather than listed here: the dock's membership and
// its order are model facts that have already changed twice (L-139, L-142),
// and a list written down in a fixture is the thing that goes stale while the
// coverage claim above still reports green.
for (const regionId of useLayoutStore.getState().arrangement.dock)
  useLayoutStore.getState().setRegionValues(regionId, { size: "chip" });

const container = document.getElementById("root");
if (container !== null) createRoot(container).render(<Fixture />);
