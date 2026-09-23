// THE LAYOUT EDITOR'S PARITY REGRESSION (P2, L-11, L-53).
//
// Run it with one command, from `clients/gui-app`:
//
//     bun scripts/layout-editor-browser.mjs
//
// It serves `src/__tests__/browser/layout-editor-browser.html` from this
// package's own Vite config (which is what compiles Tailwind for the fixture -
// without it every utility class is present with no rule behind it and every
// geometric claim below passes vacuously), drives headless Chrome over CDP,
// and shuts both down in `finally`. Set `CHROME_BIN` if Chrome is somewhere
// non-standard.
//
// Four claims, each a thing jsdom cannot decide:
//
//   1. Every region the fixture can mount LIVE without the host runtime is
//      compared with its picture, under the same host frame: the icon's
//      painted box and colour where the region draws one, its own resolved
//      `font-size` / `line-height` / `color` where it does not. Live versus
//      picture, never picture versus picture - the two picture entry points
//      became one function in L-77, so comparing them with each other could
//      not fail for any input (G3-02, L-85). Three live surfaces answer for
//      sixteen of the twenty-one regions: the sample rail (nine), the
//      composer toolbar in presentation mode (four, since L-136 retired the
//      harness label), and the dock's compact strip at Chip size (five, since
//      L-98 put the sample workspace on the real dock and L-139/L-142 added
//      the Message Queue and Todo to it).
//   2. The coverage is stated rather than counted: every region with no live
//      node here must be named in the fixture's `NO_LIVE_LEAF` table with the
//      reason, and every region that HAS one must not be. The driver prints
//      the uncovered list so the gap is visible in the output.
//   3. The preset miniature is a uniformly SCALED app frame, not a reflowed
//      one: its untransformed frame measures exactly 1000x620 with
//      `offsetWidth`/`offsetHeight`, and its scale is the box width over that
//      width. A reflowed card is any other size.
//   4. The hover chip is where the BROWSER painted it under CSS anchor
//      positioning, not where a measurement would have put it.
//
// A fifth, first: the shipped stylesheet is actually in effect. Everything
// else is a comparison of computed values, and comparisons of nothing agree.
//
// ---------------------------------------------------------------------------
// PHASE 2: THE CANVAS INTERACTION REGRESSION (L-115 .. L-135)
//
// The same command then navigates the same Chrome to
// `src/__tests__/browser/layout-editor-canvas.html` and drives the real sample
// scene, inside the real app column, beside the real editor, with REAL mouse
// input (`Input.dispatchMouseEvent`). It exists because three review gates and
// thousands of jsdom tests passed while that scene was wrapped in `inert`:
// jsdom has no hit testing, no layout and no paint order, so nothing below is
// decidable there.
//
//   A1. No `inert` anywhere inside the canvas column.
//   A2. Every region on the scene is the hit target at its own centre.
//   A3. A real `mouseMoved` stamps `data-hover` and raises the name chip.
//   A4. A real click selects, opens that region's inspector section, and the
//       APP does not act: no menu, no popover, no file chooser, no panel
//       toggled.
//   A5. Seven real drags - a compact pill, a full dock row, a toolbar member
//       each way (the leftward one past the cluster's narrow leading member,
//       L-143), a rail icon across a divider, a rail DIVIDER, and the clamp -
//       each read back off the layout store as exactly one history step, with
//       `[data-layout-dragging]` and a reflowing sibling measured mid-gesture.
//   A6. Microphone Shown draws a box, Hidden removes it, and its ghost comes
//       back under a real hover on the inspector's index row.
//   A7. A Hidden + Chip dock member ghosts as a PILL, not as the row it never
//       takes at rest.
//   A8. A real right-click opens the quick-verb menu on a region inside a
//       session and at rest - the dock's rows, the sample rail's icons and the
//       minimap included (L-144) - and opens nothing on the sample transcript.
//   A9. The editing frame is counted in PIXELS off a screenshot, within 3 CSS
//       px of each of the column's four edges, in all three dock modes -
//       including the top edge under the opaque positioned header, which is
//       the exact place the pre-L-130 outline was painted under (LV2-04). Its
//       inset and radius are asserted against L-137's numbers rather than
//       merely read, each of the four corners is checked for the square join
//       an arc cannot draw, and the editor's own TAB under the top run is
//       READ - fill against stroke - rather than sampled (L-163).
//  A10. The selection ring's painted box is the region's box plus its padding,
//       stays inside the window on the bottom row, and follows a dock switch.
//
// The canvas fixture mounts the shell's own `AppColumnFrame`; A1-A10 run it at
// the `top` placement.
//
// ---------------------------------------------------------------------------
// THE SIDE TAB STRIP (specs/side-tabs, ticket 12)
//
// Every variant below is a fresh navigation with its own query, and the
// page-load guard re-baselines per variant.
//
//   Phase 1b (parity). The preset miniature draws the strip on the stored edge
//       and the rail on the stored side, for every placement/side pair.
//   Phase 2b (sides), `layout-editor-canvas.html?tabs=&collapsed=&wco=&dock=`
//       with the real `SideTabStrip` and `DesktopMenuHeader` band:
//       A9 generalised - the editing frame on all four column edges with no
//       header, and the session row's solid `--warning-foreground` fill with
//       `--background` text (L-163), sampled in pixels.
//       A11 - every strip part (top block, Home, a row, the active close, the
//       foot, the handle) is the hit target at its centre; a right strip sits
//       left of a right-docked inspector; with the inspector docked left on
//       macOS its header keeps the 82px inset and the strip's title row 12px.
//       A12 - the rail is 56px (at least 82px on macOS with the strip at the
//       left) with monograms drawn; the active ring on a tinted tile in both
//       themes.
//       A13 - the band per platform (40px, strip top at its bottom, hidden in
//       macOS fullscreen), the 40px title row where the strip owns the title
//       bar, the -1px tuck only while a band is displayed, and the dialog
//       overlay's top under `.wco`.
//       Row kit - the 10px badge on a 16px leading tile, and the group line as
//       one continuous line across its members.
//   Phase 2c (switch). A14 - a real click on Position "Left" moves the strip in
//       one frame as one history step; one undo restores the top, with the
//       selection ring heading for the moved node at once.
//   Phase 3 (strip), `side-tab-strip.html?edge=left|right`: real-mouse y
//       reorder with a neighbour stepping aside, a drop on a row's half that
//       pairs two tabs, a split dragged whole, the tear-off preview and the
//       new-window request 30px into the content, and none toward the window
//       edge until the pointer leaves the viewport.
//
// What these fixtures cannot mount (native controls, real `env()` values,
// `-webkit-app-region`, the menu bar's popups, the signed-in foot) is the
// Staging checklist's: specs/side-tabs/tickets/12-browser-and-staging.md.
//
// Set LAYOUT_EDITOR_BROWSER_PHASES to a comma list of parity, canvas, sides,
// switch, strip to run only those while iterating; every selected phase runs
// even after one fails, and the run fails if any did.
// ---------------------------------------------------------------------------
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer as createTcpServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  findChrome,
  launchChromeWithDevTools,
  terminateProcessTree,
} from "./chrome-launcher.mjs";

// --- page-side probes -------------------------------------------------------

/**
 * Every live region node the fixture mounted, beside its picture.
 *
 * The icon is the comparison wherever a region draws one - its painted box and
 * its resolved colour, which is what a wrong type scale or a wrong token moves.
 * A region that draws no icon is compared on its own type scale and colour
 * instead; its TEXT is not, because a picture is drawn from specimen data and
 * a live leaf from the app's, and P2 is about how a region looks rather than
 * what it currently says.
 */
const LIVE_PROBE = `(() => {
  const glyph = (node) => {
    const svg = node.querySelector("svg");
    if (svg === null) return null;
    const style = getComputedStyle(svg);
    const rect = svg.getBoundingClientRect();
    return {
      kind: "glyph",
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      color: style.color,
    };
  };
  const scale = (node) => {
    const style = getComputedStyle(node);
    return {
      kind: "scale",
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      color: style.color,
    };
  };
  const nodes = [...document.querySelectorAll("[data-live-surface] [data-layout-region]")];
  return nodes.map((node) => {
    const regionId = node.getAttribute("data-layout-region");
    const row = document.querySelector('[data-region-row="' + regionId + '"]');
    const picture = row === null
      ? null
      : row.querySelector("[data-layout-depiction]");
    if (picture === null) {
      return { regionId, error: "the fixture drew no picture for it", live: null, drawn: null };
    }
    // The depiction's OWN root, not the host frame around it: the frame
    // carries the surface's type scale, which is the thing the leaf inside it
    // is supposed to inherit rather than the thing being compared.
    const leaf = picture.firstElementChild ?? picture;
    const live = glyph(node) ?? scale(node);
    const drawn = live.kind === "glyph" ? glyph(leaf) : scale(leaf);
    if (drawn === null) {
      return { regionId, error: "the live leaf draws an icon and the picture does not", live, drawn: null };
    }
    return { regionId, error: null, live, drawn };
  });
})()`;

const PICTURE_PROBE = `(() => {
  return [...document.querySelectorAll("[data-region-row]")].map((row) => ({
    regionId: row.getAttribute("data-region-row"),
    framed: row.querySelector("[data-layout-depiction]") !== null,
  }));
})()`;

const COVERAGE_PROBE = `(() => ({
  regionIds: window.__layoutEditorProbe.regionIds,
  noLiveLeaf: window.__layoutEditorProbe.noLiveLeaf,
}))()`;

/**
 * The clipped Usage limits picture: what the frame MEASURED, and the mask the
 * measurement turned on.
 *
 * \`webkitMaskImage\` is read as well, because a Chrome that only supports the
 * prefixed property resolves the unprefixed one to the empty string - which is
 * the same shape as "no mask" and would read as the defect rather than as the
 * spelling.
 */
const CLIP_FADE_PROBE = `(() => {
  const frame = document.querySelector("#clip-fade [data-layout-depiction]");
  if (frame === null) return { error: "no [data-layout-depiction] inside #clip-fade" };
  const style = getComputedStyle(frame);
  const mask = style.maskImage === "" || style.maskImage === undefined
    ? style.webkitMaskImage
    : style.maskImage;
  return {
    error: null,
    clipped: frame.dataset.clipped ?? null,
    mask: mask ?? "",
    frameWidth: Math.round(frame.getBoundingClientRect().width),
    scrollWidth: frame.scrollWidth,
    clientWidth: frame.clientWidth,
  };
})()`;

const MINIATURE_PROBE = `(() => {
  const box = document.querySelector('[data-testid="preset-miniature"]');
  if (box === null) return { error: "no preset miniature rendered" };
  const frame = box.firstElementChild;
  if (frame === null) return { error: "the miniature has no frame" };
  const matrix = new DOMMatrixReadOnly(getComputedStyle(frame).transform);
  return {
    error: null,
    boxWidth: box.clientWidth,
    frameWidth: frame.offsetWidth,
    frameHeight: frame.offsetHeight,
    scale: matrix.a,
    scaleX: matrix.a,
    scaleY: matrix.d,
  };
})()`;

const CHIP_PROBE = `(() => {
  const chip = document.querySelector("[data-layout-hover-chip]");
  const anchor = document.querySelector("[data-chip-anchor]");
  if (chip === null || anchor === null) return { error: "no chip or anchor" };
  const style = getComputedStyle(chip);
  const chipRect = chip.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  return {
    error: null,
    anchored: chip.getAttribute("data-anchored"),
    positionArea: style.positionArea ?? style.getPropertyValue("position-area"),
    margin: Number.parseFloat(style.marginBottom),
    gapBelow: anchorRect.top - chipRect.bottom,
    centreOffset:
      chipRect.left + chipRect.width / 2 - (anchorRect.left + anchorRect.width / 2),
  };
})()`;

/**
 * Whether the shipped rules are in effect at all.
 *
 * Read off the two the rest of this file depends on: the passive dim's
 * opacity, which only `layout-editor.css` sets, and the ring's box-shadow,
 * which is three bands and would be `none` with no stylesheet.
 */
const STYLESHEET_PROBE = `(() => {
  const passive = document.querySelector("[data-layout-passive]");
  const ring = document.createElement("div");
  ring.setAttribute("data-layout-selection-ring", "");
  document.body.append(ring);
  const shadow = getComputedStyle(ring).boxShadow;
  ring.remove();
  const opacity = passive === null ? null : getComputedStyle(passive).opacity;
  return {
    loaded: opacity !== null && Number(opacity) < 1 && shadow !== "none",
    dimOpacity: opacity,
    ringShadow: shadow,
  };
})()`;

/**
 * THE ONE ROW METRIC (L-171).
 *
 * Five attached panels, one one-line row each, measured as the browser laid
 * them out. `min-h-8` on a shared row class, a `py-0.5`, a `size-6` control
 * and a floated toolbar are four things jsdom resolves to nothing, and the
 * defect they fix is a NUMBER: switching pills between two one-line panels
 * moved the composer's upper edge by 3.75px.
 *
 * The panel body is what the slot sizes itself to, so that is what is
 * measured - the list's own top and bottom inset included, since the ruling
 * binds the inset as much as the row.
 */
const DOCK_ROW_METRIC_PROBE = `(() => {
  // The recipe the page itself states, so a row is counted by the box it
  // claims rather than by a tag or a test id - the six panels agree on
  // neither. A child count cannot stand in for it: the body's own first child
  // is the scroll box, and the queue's list sits under dnd-kit's nodes inside
  // it, so counting children reports the wrapper rather than the rows.
  const recipe = window.__layoutEditorProbe.dockRowRecipe;
  const sections = [...document.querySelectorAll("[data-dock-row-metric]")];
  const rows = sections.map((section) => {
    const body = section.querySelector(
      "[data-testid='chat-dock-attached-panel']",
    );
    const drawn =
      body === null
        ? null
        : [...body.querySelectorAll("*")].filter((node) =>
            recipe.every((token) => node.classList.contains(token)),
          ).length;
    return {
      section: section.getAttribute("data-dock-row-metric"),
      height: body === null ? null : body.getBoundingClientRect().height,
      rows: drawn,
    };
  });
  return { rows };
})()`;

/**
 * The list's own `py-1.5` inset, which is what an EMPTY panel measures.
 *
 * A bare equality check passes on five identical numbers, and five 11.25s -
 * every panel drawing its inset and no rows at all - are five identical
 * numbers (R6H-04). So the shared height has to clear the inset as well as
 * be shared, and each panel has to have drawn exactly the one row it was fed.
 */
const DOCK_ROW_METRIC_LIST_INSET = 11.25;

// --- phase 2: canvas-interaction constants ---------------------------------

/** `selection-ring.ts`'s own two numbers, restated so a drift is a failure. */
const RING_PADDING = 3;
const RING_BLEED = 6;

/**
 * The window the editing frame's stroke is looked for in, across each edge.
 *
 * The frame is held `--layout-editor-frame-inset` inside the column and
 * rounded by `--layout-editor-frame-radius`, both read at run time: where the
 * stylesheet puts the stroke is a design decision, and a driver that kept
 * scanning the outermost four pixels reported a deliberate 4px inset as four
 * unlit edges (measured, 0 of 1180 on every one of twelve edges). The window
 * is wider than the 2px border on purpose - what is being asserted is that the
 * edge is LIT near the inset, not that it is a CSS border, so the same count
 * survives the stroke becoming an SVG or a shadow.
 */
const FRAME_BAND_BEFORE_INSET = 2;
const FRAME_BAND_AFTER_INSET = 6;

/**
 * L-137's two numbers, stated here so that reading them is not the same as
 * accepting them.
 *
 * A9 counts each edge AT the inset the column reports, which is what lets one
 * count describe all three dock modes without restating the stylesheet. The
 * cost is that the count moves with the value: a frame that regressed to
 * `inset: 0` with square corners - which is exactly what the owner's fourth
 * live pass believed it was looking at - would be counted at zero and pass
 * every edge, because a stroke flush with the window edge is still a stroke.
 * So the value is asserted as well as read. The pixels below then answer the
 * other half, which no computed style can: whether the CORNERS are drawn on
 * the radius the stylesheet declares.
 */
const DESIGNED_FRAME_INSET = 4;
const DESIGNED_FRAME_RADIUS = 12;

/**
 * The square of pixels a SQUARE corner would light and a rounded one cannot.
 *
 * Centred on the frame's own rectangle corner, `(inset, inset)` in the
 * column's coordinates. With `border-radius: r`, the stroke's outer edge near
 * that corner is the arc centred at `(inset + r, inset + r)` with radius `r`,
 * and every point of this box is further from that centre than `r` - the
 * nearest, `(inset + 2, inset + 2)`, by 14.1 against 12 - so the designed
 * frame provably leaves it dark no matter where the dot phase falls. A square
 * corner puts its mitre join exactly there. The assertion is therefore in the
 * safe direction: it can only fire on ink the design cannot produce.
 */
const FRAME_CORNER_PROBE = 4;

/**
 * The share of an edge's straight run that a DOTTED stroke lights, as this
 * count can see it.
 *
 * A 2px dotted border repeats every 4px, so the design duty cycle is a half.
 * What the count measures is narrower than that: a position is lit when some
 * pixel in the band is within tolerance of pure amber, and whether a dot's
 * 2px disc covers one pixel fully or two pixels at 77% is decided by where
 * that dot's centre falls on the pixel grid. Chromium distributes the dots
 * along the WHOLE rounded border path, so each side starts at its own
 * sub-pixel phase, and the same one stylesheet rule measures 50.0% on the top
 * edge and 25.0% on the other three (measured, all three dock modes). Neither
 * number is a fact about the design, so the band is set where it separates
 * the three things that ARE: an edge that is missing or painted over reads 0%
 * (the inset bug this count was added for measured exactly that), a SOLID
 * stroke reads 100%, and a dotted one lands between.
 */
const FRAME_LIT_FLOOR = 0.15;
const FRAME_LIT_CEILING = 0.8;

/**
 * The same question asked of each QUARTER of an edge's straight run.
 *
 * The band above cannot fail for a HALF-covered edge, which is the defect the
 * frame was rebuilt for (L-130): an edge that loses 40% of its lit positions
 * to an opaque descendant still lands inside 15-80%. An opaque child covers a
 * CONTIGUOUS stretch, so it empties whole quarters; a stroke that is merely
 * phased differently does not, because the dot pitch is 4px and a quarter of
 * the shortest edge is far longer than that.
 *
 * Floored well under the measured 25% baseline (50% on the top edge) rather
 * than beside it, because a quarter is a quarter of the sample and the phase
 * is decided per edge by where the rounded path's dots land.
 */
const FRAME_QUARTER_LIT_FLOOR = 0.1;

/**
 * How far past a neighbour's centre a drag is aimed.
 *
 * `drag-engine.ts` takes its grab point at the move that CROSSES the 6px
 * activation distance rather than at the press, so the effective travel is six
 * pixels less than the pointer's. Aiming six past a centre therefore lands
 * exactly ON it, where the comparison is strict and the member keeps its own
 * slot. Measured: the rail's two drags wrote nothing for exactly that reason.
 * Eighteen leaves twelve pixels of margin.
 *
 * What the overshoot is measured ON changed with L-143: `drag-model.ts` now
 * claims a slot once the dragged member's LEADING EDGE in the direction of
 * travel passes the neighbour's centre, not once its own centre does. A plan
 * whose anchor is smaller than the member it drags therefore sets
 * `leadingEdge`, and the pointer is placed so that EDGE lands the overshoot
 * past the anchor - otherwise a 36px rail icon aimed 18px past an 8px divider
 * carries its top edge 44px, which is past the panel above the divider as
 * well, and one gesture claims two slots.
 *
 * `drag-model.ts` also floors the travel a claim needs at 12px (L-150(4)), so
 * every plan below has to clear that as well as the claim boundary itself.
 * The two rail plans are the tight ones and both do, on the rail's measured
 * geometry, which L-166 leaves exactly where it was: Agents 0..36, the
 * capsule's 4px seam 36..40, Artifacts 40..76, a 4px gap, the 8px divider at
 * 80..88, a 4px gap, Terminals 92..128. The capsule adds a surface behind the
 * two icons and a seam the width of the rail's own `gap-1`, so a stacked pair
 * occupies the same 76px two loose icons did, and nothing below it moves.
 * "Rail icon across a divider" aims Terminals' top edge at 84 - 18 = 66 and
 * places the pointer half a member behind it, at 84, so the pointer travels
 * 110 - 84 = 26 and the member travels 26 - 6 = 20. "Rail divider itself"
 * aims the 8px divider's centre at 110 + 18 = 128, so the pointer travels 44
 * and the member 38. Every other plan passes an ordinary neighbour, whose own
 * boundary is already above the floor.
 */
const DROP_OVERSHOOT = 18;

/**
 * Regions the sample scene draws, in the order the assertions walk them. The
 * three it does not draw are named by the fixture, with a reason each, and the
 * driver checks that list against this one rather than trusting either.
 *
 * Intersected with the product's own `LAYOUT_REGION_IDS` at run time (see
 * `mountedRegions`), so a region the app retires stops being asserted here
 * instead of failing as "no node on the canvas" - and a region the app ADDS
 * still fails the coverage cross-check below, which is the direction that
 * needs to be loud.
 */
const CANVAS_REGIONS = [
  "railAgents",
  "railArtifacts",
  "railTerminals",
  "railBrowsers",
  "railGitDiff",
  "railPullRequests",
  "railFileTree",
  "railSharing",
  "railComments",
  "minimap",
  "contextUsage",
  "changedFiles",
  "runningAgents",
  "background",
  "queue",
  "todo",
  "attachImage",
  "access",
  "model",
  "mic",
];

/**
 * Everything the amber-frame count needs, installed once per page: the token's
 * PAINTED colour, sampled through the same screenshot pipeline the edges are
 * counted in rather than parsed out of a computed style (`--warning-foreground`
 * is an `oklch()` behind a `light-dark()` in some themes, and a parse that
 * silently produced black would make every edge below read as unlit), and a
 * decoder that turns a clipped screenshot back into pixels with a canvas.
 */
const INSTALL_PIXEL_TOOLS = `(() => {
  // Decoded in the PAGE rather than in the driver: a screenshot is a PNG, and
  // the only zlib-and-unfilter this scenario is allowed to add is the one the
  // browser already has. The counting happens in the same call so the pixels
  // never cross the wire.
  const decode = async (base64) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve);
      image.addEventListener("error", () => reject(new Error("screenshot decode failed")));
      image.src = "data:image/png;base64," + base64;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return {
      width: canvas.width,
      height: canvas.height,
      data: context.getImageData(0, 0, canvas.width, canvas.height).data,
    };
  };
  window.__samplePixel = async (base64) => {
    const shot = await decode(base64);
    if (shot.width === 0) return null;
    return [shot.data[0], shot.data[1], shot.data[2]];
  };
  window.__countShot = async (base64, horizontal, target, tolerance) => {
    const shot = await decode(base64);
    return window.__countLit(shot, horizontal, target, tolerance);
  };
  window.__swatch = (on) => {
    const existing = document.querySelector("[data-amber-swatch]");
    if (existing !== null) existing.remove();
    if (!on) return null;
    const node = document.createElement("div");
    node.setAttribute("data-amber-swatch", "");
    node.style.position = "fixed";
    node.style.left = "600px";
    node.style.top = "600px";
    node.style.width = "12px";
    node.style.height = "12px";
    node.style.zIndex = "2147483000";
    node.style.background = "var(--warning-foreground)";
    document.body.append(node);
    return { left: 600, top: 600 };
  };
  window.__countLit = (shot, horizontal, target, tolerance) => {
    const { width, height, data } = shot;
    const along = horizontal ? width : height;
    const across = horizontal ? height : width;
    let lit = 0;
    // Also per QUARTER of the run: one number for a whole edge cannot fail
    // for an edge that is half covered, which is the defect class the frame
    // was rebuilt for (L-130, R4B-07).
    const quarters = [0, 0, 0, 0];
    const quarterAlong = [0, 0, 0, 0];
    for (let a = 0; a < along; a += 1) {
      let hit = false;
      for (let b = 0; b < across && !hit; b += 1) {
        const x = horizontal ? a : b;
        const y = horizontal ? b : a;
        const i = (y * width + x) * 4;
        const distance =
          Math.abs(data[i] - target[0]) +
          Math.abs(data[i + 1] - target[1]) +
          Math.abs(data[i + 2] - target[2]);
        if (distance <= tolerance && data[i + 3] > 200) hit = true;
      }
      const quarter = Math.min(3, Math.floor((a * 4) / Math.max(1, along)));
      quarterAlong[quarter] += 1;
      if (hit) {
        lit += 1;
        quarters[quarter] += 1;
      }
    }
    return {
      lit,
      along,
      quarters: quarters.map((count, index) => ({
        lit: count,
        along: quarterAlong[index],
      })),
    };
  };
})()`;

/**
 * Whether the APP acted, read either side of a click (4.4).
 *
 * A swallowed click leaves nothing behind, so the proof has to be that every
 * observable the app's own controls move is unchanged: the open/closed state
 * of every disclosure inside the column, and the number of menu, dialog and
 * popover layers anywhere. The file chooser is the one the DOM cannot answer;
 * that one is a CDP event.
 */
const APP_ACTED_PROBE = `(() => {
  const column = document.querySelector("[data-layout-column]");
  if (column === null) return { expanded: "no column", states: "no column", layers: -1 };
  return {
    expanded: [...column.querySelectorAll("[aria-expanded]")]
      .map((node) => node.getAttribute("aria-expanded"))
      .join(","),
    states: [...column.querySelectorAll("[data-state]")]
      .map((node) => node.getAttribute("data-state"))
      .join(","),
    layers: document.querySelectorAll(
      '[role="menu"],[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]',
    ).length,
  };
})()`;

/**
 * `railTerminals` ended up above the divider, however the gesture got it there.
 *
 * The shipped rail carries no dividers (L-155), so both rail plans put one in
 * first through the product's own add-divider action - between Artifacts and
 * Terminals, which is where `divider:1` sat in the rail this wave replaced, so
 * the measured geometry the overshoot is tuned on is unchanged.
 *
 * `stack:railAgents+railArtifacts` is the shipped rail's one stack LINK
 * (L-166), named after the PAIR it joins. It is a member of the order like any
 * other entry, so it is named here, and the capsule draws its two icons 4px
 * apart - the rail's own `gap-1` - which is why the geometry below is the same
 * as it was before stacks existed.
 */
const TERMINALS_ABOVE_THE_DIVIDER = [
  "railAgents",
  "stack:railAgents+railArtifacts",
  "railArtifacts",
  "railTerminals",
  "divider:1",
  "railBrowsers",
  "railGitDiff",
  "railPullRequests",
  "railFileTree",
  "railSharing",
  "railComments",
];

/**
 * Terminals joined to Browsers by a link the user made (L-168).
 *
 * Terminals stays ABOVE Browsers and every panel keeps its place: the list's
 * row action hands the panel BELOW to the writer as the source, so the join
 * costs no reorder at all (L-170).
 */
const TERMINALS_STACKED_ABOVE_BROWSERS = [
  "railAgents",
  "stack:railAgents+railArtifacts",
  "railArtifacts",
  "railTerminals",
  "stack:railTerminals+railBrowsers",
  "railBrowsers",
  "railGitDiff",
  "railPullRequests",
  "railFileTree",
  "railSharing",
  "railComments",
];

// --- phase 1b: the miniature's placements -----------------------------------

/**
 * Every stored tab strip placement and sidebar side the miniature has to draw,
 * as the query the parity fixture reads. `top/left` is the shipped layout the
 * base phase already covered.
 */
const MINIATURE_PLACEMENTS = [
  { tabs: "left", sidebar: "left" },
  { tabs: "right", sidebar: "right" },
  { tabs: "left", sidebar: "right" },
  { tabs: "right", sidebar: "left" },
  { tabs: "top", sidebar: "right" },
];

/**
 * Where the miniature drew the strip and the rail, in its own scaled frame.
 * The strip is `app-frame-side-strip`'s box (the frame chrome's one copy),
 * the rail is `preset-miniature-rail`, and the frame is the scaled 1000x620
 * box both live in.
 */
const MINIATURE_PLACEMENT_PROBE = `(() => {
  const box = document.querySelector('[data-testid="preset-miniature"]');
  if (box === null) return { error: "no preset miniature rendered" };
  const frame = box.firstElementChild;
  const rail = box.querySelector('[data-testid="preset-miniature-rail"]');
  const strip = box.querySelector('[data-testid="app-frame-side-strip"]');
  if (frame === null || rail === null) return { error: "the miniature has no frame or no rail" };
  const rect = (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  return {
    error: null,
    frame: rect(frame),
    rail: rect(rail),
    strip: strip === null ? null : rect(strip),
    frameWidth: frame.offsetWidth,
    frameHeight: frame.offsetHeight,
  };
})()`;

async function runParityPlacementVariants(client, pageUrl, pageLoads) {
  const violations = [];
  const notes = [];
  for (const placement of MINIATURE_PLACEMENTS) {
    const label = `miniature tabs=${placement.tabs} sidebar=${placement.sidebar}`;
    const loadsAtStart = await openVariant(
      client,
      variantUrl(pageUrl, placement),
      label,
      "window.__layoutEditorProbe?.ready === true",
      pageLoads,
    );
    await flush(client);
    const drawn = await evaluate(client, MINIATURE_PLACEMENT_PROBE);
    if (drawn.error !== null) {
      violations.push(`${label}: ${drawn.error}`);
      continue;
    }
    if (drawn.frameWidth !== 1000 || drawn.frameHeight !== 620) {
      violations.push(
        `${label}: the frame measures ${String(drawn.frameWidth)}x${String(drawn.frameHeight)} untransformed, expected 1000x620`,
      );
    }
    const frameCentre = drawn.frame.x + drawn.frame.width / 2;
    const railCentre = drawn.rail.x + drawn.rail.width / 2;
    const railSide = railCentre < frameCentre ? "left" : "right";
    if (railSide !== placement.sidebar) {
      violations.push(
        `${label}: the rail is drawn on the ${railSide} (centre ${railCentre.toFixed(1)} in a frame centred at ${frameCentre.toFixed(1)}), stored side ${placement.sidebar}`,
      );
    }
    if (placement.tabs === "top") {
      if (drawn.strip !== null) {
        violations.push(
          `${label}: a side strip is drawn for the top placement`,
        );
      }
    } else if (drawn.strip === null) {
      violations.push(`${label}: no side strip in the miniature`);
    } else {
      const atEdge =
        placement.tabs === "left"
          ? Math.abs(drawn.strip.x - drawn.frame.x) <= 1
          : Math.abs(
              drawn.strip.x +
                drawn.strip.width -
                (drawn.frame.x + drawn.frame.width),
            ) <= 1;
      if (!atEdge) {
        violations.push(
          `${label}: the strip at ${boxText(drawn.strip)} is not on the frame's ${placement.tabs} edge (frame ${boxText(drawn.frame)})`,
        );
      }
      const railBeyondStrip =
        placement.tabs === "left"
          ? drawn.rail.x < drawn.strip.x + drawn.strip.width - 0.5
          : drawn.rail.x + drawn.rail.width > drawn.strip.x + 0.5;
      if (railBeyondStrip) {
        violations.push(
          `${label}: the rail at ${boxText(drawn.rail)} sits between the strip at ${boxText(drawn.strip)} and the window edge`,
        );
      }
    }
    notes.push(
      `${label}: strip ${drawn.strip === null ? "none" : boxText(drawn.strip)}, rail ${boxText(drawn.rail)}, frame ${boxText(drawn.frame)}`,
    );
    assertNoReloadSince(pageLoads, loadsAtStart, label, violations);
  }
  assert.deepEqual(
    violations,
    [],
    `The miniature's placements failed (${String(violations.length)}):\n${violations.map((line) => `  - ${line}`).join("\n")}\n\nmeasurements:\n${notes.map((line) => `  ${line}`).join("\n")}`,
  );
  for (const note of notes) console.log(`  ${note}`);
  console.log(
    `preset miniature placements passed: ${String(MINIATURE_PLACEMENTS.length)} stored placement/side pairs, each drawn on its stored edge and side`,
  );
}

// --- phase 2b: the side placements (A9 generalised, A11, A12, A13) ----------

/** The strip's own numbers (side-strip-tokens.ts, S-18, S-20), restated so a drift is a failure. */
const SIDE_STRIP_RAIL_WIDTH = 56;
const SIDE_STRIP_DEFAULT_WIDTH = 240;
/** `env(titlebar-area-x, 82px)`: the fallback the fixture's `.wco` stands on (6.4). */
const WCO_LEADING_INSET_FALLBACK = 82;
/** `min(env(titlebar-area-x, 82px), 0.75rem)` while the inspector docks left (S-33). */
const LEFT_DOCK_COLUMN_GUTTER = 12;
/** The band floor: `max(env(titlebar-area-height, 0px), 40px)` (6.3). */
const TITLE_BAND_HEIGHT = 40;
/** S-35 and S-17: the leading tile and the status badge on it. */
const SIDE_TAB_LEADING_TILE = 16;
const SIDE_TAB_BADGE = 10;
const SIDE_TAB_TILE = 32;
/**
 * How far apart a tile's pixel at the ring position and its own fill have to
 * be, as a WCAG contrast ratio, to count as a ring at all: a missing ring
 * samples the fill twice and reads 1.00. The inactive control must stay under
 * it, so the probe is seen to tell a ring from none.
 */
const RING_PRESENT_FLOOR = 1.2;
/** WCAG 1.4.11: what the active ring, a non-text state indicator, owes its fill in each theme. */
const NON_TEXT_CONTRAST = 3;
/** A pixel is the session fill when every channel is this close to the painted token. */
const SOLID_FILL_TOLERANCE = 12;

/**
 * The windows under test, each a fresh navigation of the canvas fixture.
 *
 * `session` opens a layout session, because the right-docked inspector, the
 * editing frame and the session row exist only inside one; the rail cases run
 * at rest so a real click can make a TINTED tile the active one.
 */
const SIDE_VARIANTS = [
  {
    label: "left",
    query: { tabs: "left", collapsed: 0, wco: "none", dock: "right" },
    session: true,
    checks: ["frame", "sessionRow", "hits", "band", "rowKit"],
  },
  {
    label: "right",
    query: { tabs: "right", collapsed: 0, wco: "none", dock: "right" },
    session: true,
    checks: ["frame", "sessionRow", "hits", "band", "besideInspector"],
  },
  {
    label: "left, macOS",
    query: { tabs: "left", collapsed: 0, wco: "mac", dock: "right" },
    session: true,
    checks: ["hits", "band"],
  },
  {
    label: "right, macOS",
    query: { tabs: "right", collapsed: 0, wco: "mac", dock: "right" },
    session: true,
    checks: ["hits", "band", "besideInspector"],
  },
  {
    label: "left, Windows",
    query: { tabs: "left", collapsed: 0, wco: "win", dock: "right" },
    session: true,
    checks: ["hits", "band"],
  },
  {
    label: "right, macOS fullscreen",
    query: {
      tabs: "right",
      collapsed: 0,
      wco: "mac-fullscreen",
      dock: "right",
    },
    session: true,
    checks: ["band"],
  },
  {
    label: "left, macOS, inspector docked left",
    query: { tabs: "left", collapsed: 0, wco: "mac", dock: "left" },
    session: true,
    checks: ["hits", "dockLeftInset"],
  },
  {
    label: "rail left",
    query: { tabs: "left", collapsed: 1, wco: "none", dock: "right" },
    session: false,
    checks: ["rail", "ringLegibility"],
  },
  {
    label: "rail left, macOS",
    query: { tabs: "left", collapsed: 1, wco: "mac", dock: "right" },
    session: false,
    checks: ["rail"],
  },
  {
    label: "rail right",
    query: { tabs: "right", collapsed: 1, wco: "none", dock: "right" },
    session: false,
    checks: ["rail"],
  },
];

/**
 * What the band does in a window, from the chrome it simulates (S-04, 6.2):
 * a macOS left strip owns the title bar and draws no band, a frameless window
 * otherwise draws one, and macOS fullscreen keeps it in the tree but hidden.
 */
function expectedBand(query) {
  if (query.wco === "none") return "absent";
  if (query.tabs === "left" && query.wco !== "win") return "absent";
  if (query.wco === "mac-fullscreen") return "hidden";
  return "shown";
}

async function runSidePlacementPhase(client, pageUrl, pageLoads) {
  const violations = [];
  const notes = [];
  for (const variant of SIDE_VARIANTS) {
    const label = `side ${variant.label}`;
    const step = { name: "open" };
    try {
      await runSideVariant(
        client,
        pageUrl,
        pageLoads,
        variant,
        label,
        step,
        violations,
        notes,
      );
    } catch (error) {
      violations.push(
        `${label}: stopped at "${step.name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`\n--- side placements ---`);
  for (const note of notes) console.log(`  ${note}`);
  assert.deepEqual(
    violations,
    [],
    `The side placements failed (${String(violations.length)}):\n${violations.map((line) => `  - ${line}`).join("\n")}`,
  );
  console.log(
    `side placements passed: ${String(SIDE_VARIANTS.length)} windows - the frame on four edges with no header, the session row's solid fill, every strip part hit at its centre, the band per platform, the rail, the row kit`,
  );
}

/** One window of the side phase; `step` names where it is, for a stall. */
async function runSideVariant(
  client,
  pageUrl,
  pageLoads,
  variant,
  label,
  step,
  violations,
  notes,
) {
  const loadsAtStart = await openVariant(
    client,
    variantUrl(pageUrl, variant.query),
    label,
    "window.__layoutCanvasProbe?.ready === true && document.querySelector('[data-testid=\"side-tab-strip\"]') !== null",
    pageLoads,
  );
  await evaluate(client, INSTALL_PIXEL_TOOLS);
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
  if (variant.session) {
    await evaluate(client, "window.__layoutCanvasProbe.beginSession()");
  }
  await moveTo(client, 1, 1);
  await flush(client);
  await delay(450);
  await flush(client);

  step.name = "base probe";
  const base = await evaluate(client, SIDE_VARIANT_PROBE);
  if (base.error !== null) {
    violations.push(`${label}: ${base.error}`);
    return;
  }
  notes.push(
    `${label}: column ${boxText(base.column)}, strip ${boxText(base.strip)} (data-edge=${String(base.edge)}), placement stamp ${String(base.placementStamp)}, band kind ${String(base.bandKind)}`,
  );
  // The strip is the stored edge's, flush with the column's edge, and the
  // specimen header is never used beside it.
  if (base.edge !== variant.query.tabs) {
    violations.push(
      `${label}: the strip carries data-edge=${String(base.edge)}, stored ${variant.query.tabs}`,
    );
  }
  const offEdge =
    variant.query.tabs === "left"
      ? Math.abs(base.strip.x - base.column.x)
      : Math.abs(
          base.strip.x + base.strip.width - (base.column.x + base.column.width),
        );
  if (offEdge > 0.5) {
    violations.push(
      `${label}: the strip at ${boxText(base.strip)} is not on the column's ${variant.query.tabs} edge ${boxText(base.column)}`,
    );
  }
  if (base.fixtureHeader) {
    violations.push(
      `${label}: the fixture's header specimen is mounted beside a side strip`,
    );
  }

  for (const check of variant.checks) {
    step.name = check;
    const result = await SIDE_CHECKS[check](client, variant, base);
    for (const line of result.violations)
      violations.push(`${label} ${check}: ${line}`);
    for (const line of result.notes) notes.push(`${label} ${check}: ${line}`);
  }
  if (variant.session) {
    await evaluate(client, "window.__layoutCanvasProbe.endSession()");
  }
  const errors = await evaluate(client, "window.__layoutCanvasErrors");
  if (errors.length > 0) {
    violations.push(
      `${label}: the fixture raised ${String(errors.length)} uncaught error(s):\n${errors.join("\n")}`,
    );
  }
  assertNoReloadSince(pageLoads, loadsAtStart, label, violations);
}

const SIDE_VARIANT_PROBE = `(() => {
  const column = document.querySelector("[data-layout-column]");
  const strip = document.querySelector('[data-testid="side-tab-strip"]');
  if (column === null || strip === null) return { error: "no app column or no side strip" };
  const rect = (node) => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  return {
    error: null,
    column: rect(column),
    strip: rect(strip),
    edge: strip.getAttribute("data-edge"),
    placementStamp: column.getAttribute("data-tab-strip-placement"),
    bandKind: column.getAttribute("data-app-title-band"),
    fixtureHeader: document.querySelector("[data-fixture-header]") !== null,
  };
})()`;

const SIDE_CHECKS = {
  frame: checkSideFrame,
  sessionRow: checkSessionRow,
  hits: checkStripHits,
  band: checkTitleBand,
  besideInspector: checkBesideInspector,
  dockLeftInset: checkDockLeftInset,
  rail: checkRail,
  ringLegibility: checkRingLegibility,
  rowKit: checkRowKit,
};

/**
 * A9 with the header absent: the editing frame is counted on all four edges of
 * the column, including the edge the strip now takes and the top edge that the
 * strip and the surface meet the window at.
 */
async function checkSideFrame(client, _variant, base) {
  const violations = [];
  const notes = [];
  const target = await sampleAmber(client);
  if (target === null) {
    return { violations: ["could not sample --warning-foreground"], notes };
  }
  const frame = await readFrameGeometry(client);
  if (
    frame.inset !== DESIGNED_FRAME_INSET ||
    frame.radius !== DESIGNED_FRAME_RADIUS
  ) {
    violations.push(
      `the frame is inset ${String(frame.inset)}px with a ${String(frame.radius)}px radius, expected ${String(DESIGNED_FRAME_INSET)}px and ${String(DESIGNED_FRAME_RADIUS)}px (L-137)`,
    );
  }
  const geometry = {
    inset: frame.inset ?? DESIGNED_FRAME_INSET,
    radius: frame.radius ?? DESIGNED_FRAME_RADIUS,
  };
  for (const edge of ["top", "bottom", "left", "right"]) {
    const count = await countEdge(client, base.column, edge, target, geometry);
    const ratio = count.along === 0 ? 0 : count.lit / count.along;
    const quarters = count.quarters.map((quarter) =>
      quarter.along === 0 ? 0 : quarter.lit / quarter.along,
    );
    notes.push(
      `${edge}: ${String(count.lit)}/${String(count.along)} lit (${(ratio * 100).toFixed(1)}%), quarters ${quarters.map((share) => `${(share * 100).toFixed(0)}%`).join(" ")}`,
    );
    if (ratio < FRAME_LIT_FLOOR || ratio > FRAME_LIT_CEILING) {
      violations.push(
        `${edge}: ${(ratio * 100).toFixed(1)}% of the straight run is amber, expected a dotted ${String(FRAME_LIT_FLOOR * 100)}-${String(FRAME_LIT_CEILING * 100)}%; column ${boxText(base.column)}`,
      );
    }
    for (const [index, share] of quarters.entries()) {
      if (share >= FRAME_QUARTER_LIT_FLOOR) continue;
      violations.push(
        `${edge}: quarter ${String(index + 1)} is ${(share * 100).toFixed(1)}% amber, so part of the edge is covered or missing; column ${boxText(base.column)}`,
      );
    }
  }
  return { violations, notes };
}

/**
 * The session row (L-163): the Customizing tab, active, is a SOLID
 * `--warning-foreground` object with `--background` text. Sampled in pixels
 * at three points of its fill clear of the label and the close button, so a
 * dim, a wash or a translucent fill all read as the defect they are.
 */
async function checkSessionRow(client) {
  const violations = [];
  const notes = [];
  const target = await sampleAmber(client);
  const row = await evaluate(
    client,
    `(() => {
      const marker = document.querySelector('[data-testid="side-tab-strip"] [data-layout-session-tab]');
      if (marker === null) return { error: "no session row in the strip" };
      const row = marker.closest("[data-side-tab]");
      if (row === null) return { error: "the session marker is outside a row" };
      const title = row.querySelector('[data-testid="side-tab-title"]');
      const probe = document.createElement("span");
      probe.style.display = "none";
      row.append(probe);
      const resolve = (value) => {
        probe.style.color = "";
        probe.style.color = value;
        return getComputedStyle(probe).color;
      };
      const background = resolve("var(--background)");
      probe.remove();
      const r = row.getBoundingClientRect();
      return {
        error: null,
        marker: marker.getAttribute("data-layout-session-tab"),
        active: row.getAttribute("data-active"),
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        titleColor: title === null ? null : getComputedStyle(title).color,
        background,
      };
    })()`,
  );
  if (row.error !== null) return { violations: [row.error], notes };
  if (row.marker !== "filled" || row.active !== "true") {
    violations.push(
      `the session row is ${String(row.marker)} / active=${String(row.active)}, expected the filled, active Customizing tab`,
    );
  }
  if (row.titleColor !== row.background) {
    violations.push(
      `the session row's label is ${String(row.titleColor)}, expected the --background colour ${String(row.background)}`,
    );
  }
  const points = [
    {
      name: "leading padding",
      x: row.rect.x + 3,
      y: row.rect.y + row.rect.height / 2,
    },
    {
      name: "top margin",
      x: row.rect.x + row.rect.width * 0.55,
      y: row.rect.y + 3,
    },
    {
      name: "bottom margin",
      x: row.rect.x + row.rect.width * 0.35,
      y: row.rect.y + row.rect.height - 4,
    },
  ];
  for (const point of points) {
    const pixel = await samplePixelAt(client, point.x, point.y);
    const off =
      target === null || pixel === null
        ? Number.POSITIVE_INFINITY
        : Math.max(
            ...pixel.map((channel, index) => Math.abs(channel - target[index])),
          );
    notes.push(
      `session row ${point.name} paints rgb(${String(pixel)}) against the token rgb(${String(target)})`,
    );
    if (off > SOLID_FILL_TOLERANCE) {
      violations.push(
        `the session row's ${point.name} at (${point.x.toFixed(0)}, ${point.y.toFixed(0)}) paints rgb(${String(pixel)}), not the solid --warning-foreground rgb(${String(target)}) (L-163)`,
      );
    }
  }
  return { violations, notes };
}

/**
 * A11: every strip part is the hit target at its own centre - the top block's
 * buttons, Home, a row, the active row's close, every foot control and the
 * resize handle - so nothing (a band, the inspector, the surface's corner, an
 * overlay) sits over the strip where it takes input. A natively disabled
 * button takes no pointer events by design; its tooltip wrapper of the same
 * box is then the target, which is what the product built it for.
 */
async function checkStripHits(client, variant) {
  const violations = [];
  const notes = [];
  // The arrows self-gate on the desktop's persistent history: a browser shell
  // has its own back button, so there they must be absent, not merely skipped.
  const desktop = variant.query.wco !== "none";
  const parts = await evaluate(
    client,
    `(() => {
      const strip = document.querySelector('[data-testid="side-tab-strip"]');
      const q = (selector) => strip.querySelector(selector);
      const arrows = ${String(desktop)}
        ? [
            ["back", q('[data-testid="history-nav-back"]')],
            ["forward", q('[data-testid="history-nav-forward"]')],
          ]
        : [];
      const strayArrows = ${String(desktop)} ? 0 : strip.querySelectorAll('[data-testid^="history-nav-"]').length;
      const named = [
        ...arrows,
        ["new task", q('[data-testid="tab-new"]')],
        ["collapse", q('[data-testid="side-tab-strip-collapse"]')],
        ["home", q('[data-testid="tab-home"]')],
        ["row", [...strip.querySelectorAll('[data-testid="header-tab-strip-scroll"] [data-side-tab]')].find((row) => row.getAttribute("data-active") !== "true") ?? null],
        ["close", q('[data-revealed="always"] [data-testid^="tab-close-"]')],
        ["handle", q('[data-testid="side-tab-strip-resize-handle"]')],
      ];
      const foot = q('[data-testid="side-strip-foot"]');
      const footControls = foot === null ? [] : [...foot.querySelectorAll("button, a[href], [role='button']")];
      footControls.forEach((node, index) => named.push(["foot " + (node.getAttribute("aria-label") ?? node.getAttribute("data-testid") ?? String(index)), node]));
      if (foot !== null && footControls.length === 0) named.push(["foot (no control)", null]);
      if (strayArrows > 0) named.push(["history arrows in a browser shell", strip.querySelector('[data-testid^="history-nav-"]'), "stray"]);
      return named.map(([name, node, stray]) => {
        if (stray === "stray") return { name, error: "drawn although the shell has no persistent history" };
        if (node === null) return { name, error: "not in the strip" };
        const r = node.getBoundingClientRect();
        const x = r.x + r.width / 2;
        const y = r.y + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        const own = hit !== null && (hit === node || node.contains(hit));
        const wrapper = node.parentElement;
        const w = wrapper === null ? null : wrapper.getBoundingClientRect();
        const disabledWrapper =
          node.disabled === true &&
          hit === wrapper &&
          w !== null &&
          Math.abs(w.width - r.width) < 1 &&
          Math.abs(w.height - r.height) < 1;
        return {
          name,
          error: null,
          width: r.width,
          height: r.height,
          x,
          y,
          ok: own || disabledWrapper,
          disabled: node.disabled === true,
          inStrip: hit !== null && strip.contains(hit),
          hit: hit === null ? null : hit.tagName + "." + String(hit.getAttribute("class") ?? "").slice(0, 70) + (hit.getAttribute("data-testid") ? "#" + hit.getAttribute("data-testid") : ""),
        };
      });
    })()`,
  );
  for (const part of parts) {
    if (part.error !== null) {
      violations.push(`${part.name}: ${part.error}`);
      continue;
    }
    if (part.width === 0 || part.height === 0) {
      violations.push(
        `${part.name}: its box is ${String(part.width)}x${String(part.height)}`,
      );
      continue;
    }
    if (!part.ok) {
      violations.push(
        `${part.name}: elementFromPoint(${part.x.toFixed(0)}, ${part.y.toFixed(0)}) is ${String(part.hit)} (inside the strip: ${String(part.inStrip)})`,
      );
    }
  }
  notes.push(
    `${String(parts.length)} parts hit-tested: ${parts.map((part) => part.name + (part.disabled ? " (disabled)" : "")).join(", ")}`,
  );
  return { violations, notes };
}

/**
 * A13 and the surface's tuck (S-04, 6.2, 6.3, review-09 M1): the band's
 * presence and height, the strip's top against the band's bottom, the 40px
 * title row where the strip owns the title bar, the -1px pull-up only while a
 * band is displayed, and where a dialog overlay starts under `.wco`.
 */
async function checkTitleBand(client, variant, base) {
  const violations = [];
  const notes = [];
  const expected = expectedBand(variant.query);
  const band = await evaluate(
    client,
    `(() => {
      const band = document.querySelector('[data-testid="app-title-band"]');
      const strip = document.querySelector('[data-testid="side-tab-strip"]');
      const titleRow = document.querySelector('[data-testid="side-strip-title-row"]');
      const surface = document.querySelector('[data-layout-column] main > div');
      const overlay = document.createElement("div");
      overlay.setAttribute("data-slot", "dialog-overlay");
      overlay.style.position = "fixed";
      overlay.style.pointerEvents = "none";
      document.body.append(overlay);
      const overlayTop = getComputedStyle(overlay).top;
      overlay.remove();
      const rect = (node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return {
        band: band === null ? null : { rect: rect(band), display: getComputedStyle(band).display },
        stripTop: strip.getBoundingClientRect().top,
        titleRow: titleRow === null ? null : { rect: rect(titleRow), paddingLeft: getComputedStyle(titleRow).paddingLeft },
        surfaceMarginTop: surface === null ? null : getComputedStyle(surface).marginTop,
        surfaceClass: surface === null ? null : surface.getAttribute("class"),
        overlayTop,
        wco: document.documentElement.classList.contains("wco"),
        bandVariable: getComputedStyle(document.documentElement).getPropertyValue("--app-title-band-height").trim(),
      };
    })()`,
  );
  const shown = band.band !== null && band.band.display !== "none";
  notes.push(
    `expected band ${expected}; band ${band.band === null ? "absent" : `${band.band.display} ${boxText(band.band.rect)}`}, strip top ${band.stripTop.toFixed(1)}, title row ${band.titleRow === null ? "none" : `${boxText(band.titleRow.rect)} pl=${band.titleRow.paddingLeft}`}, surface margin-top ${String(band.surfaceMarginTop)}, dialog overlay top ${band.overlayTop}, .wco=${String(band.wco)}`,
  );
  if (expected === "absent" && band.band !== null) {
    violations.push(
      `a title band is mounted (${band.band.display}) where the chrome draws none`,
    );
  }
  if (expected === "hidden") {
    if (band.band === null)
      violations.push("no title band in the tree for a frameless right strip");
    else if (shown)
      violations.push(
        `the band is displayed (${band.band.display}) with no window-controls overlay`,
      );
  }
  if (expected === "shown") {
    if (!shown) {
      violations.push(
        `the band is ${band.band === null ? "absent" : "hidden"} where the native controls need it`,
      );
    } else {
      if (Math.abs(band.band.rect.height - TITLE_BAND_HEIGHT) > 0.5) {
        violations.push(
          `the band is ${band.band.rect.height.toFixed(1)}px tall, expected the ${String(TITLE_BAND_HEIGHT)}px floor of --app-title-band-height`,
        );
      }
      const bandBottom = band.band.rect.y + band.band.rect.height;
      if (Math.abs(bandBottom - band.stripTop) > 0.5) {
        violations.push(
          `the band ends at y=${bandBottom.toFixed(1)} and the strip starts at y=${band.stripTop.toFixed(1)}; the strip must start where the band ends`,
        );
      }
    }
  }
  const pullUp = shown ? "-1px" : "0px";
  if (band.surfaceMarginTop !== pullUp) {
    violations.push(
      `the surface frame's margin-top is ${String(band.surfaceMarginTop)}, expected ${pullUp}: the 1px tuck applies only while a band is displayed (review-09 M1; class "${String(band.surfaceClass)}")`,
    );
  }
  if (variant.query.wco === "mac" && variant.query.tabs === "left") {
    if (band.titleRow === null) {
      violations.push(
        "the strip draws no title row where it owns the title bar",
      );
    } else {
      if (Math.abs(band.titleRow.rect.height - TITLE_BAND_HEIGHT) > 0.5) {
        violations.push(
          `the strip's title row is ${band.titleRow.rect.height.toFixed(1)}px tall, expected ${String(TITLE_BAND_HEIGHT)}px`,
        );
      }
      if (Math.abs(band.titleRow.rect.y - base.column.y) > 0.5) {
        violations.push(
          `the strip's title row starts at y=${band.titleRow.rect.y.toFixed(1)}, not at the window top`,
        );
      }
      if (
        band.titleRow.paddingLeft !== `${String(WCO_LEADING_INSET_FALLBACK)}px`
      ) {
        violations.push(
          `the title row pads ${band.titleRow.paddingLeft} at the leading edge, expected the ${String(WCO_LEADING_INSET_FALLBACK)}px traffic-light inset`,
        );
      }
    }
  } else if (band.titleRow !== null) {
    violations.push(
      "the strip draws a title row although it does not own the title bar",
    );
  }
  if (band.wco) {
    const overlayTop = shown ? `${String(TITLE_BAND_HEIGHT)}px` : "0px";
    if (band.overlayTop !== overlayTop) {
      violations.push(
        `a dialog overlay starts at top ${band.overlayTop}, expected ${overlayTop} (--app-title-band-height is "${band.bandVariable}")`,
      );
    }
  }
  return { violations, notes };
}

/** A right strip sits left of a right-docked inspector, never under it (6.1). */
async function checkBesideInspector(client, _variant, base) {
  const violations = [];
  const notes = [];
  const inspector = await rectOf(client, "[data-layout-inspector]");
  if (inspector === null)
    return { violations: ["no inspector in the session"], notes };
  notes.push(`inspector ${boxText(inspector)}, strip ${boxText(base.strip)}`);
  if (base.strip.x + base.strip.width > inspector.x + 0.5) {
    violations.push(
      `the strip ends at x=${(base.strip.x + base.strip.width).toFixed(1)}, past the inspector's left edge at x=${inspector.x.toFixed(1)}`,
    );
  }
  return { violations, notes };
}

/**
 * The traffic-light reserve belongs to whatever sits at the window's top-left
 * corner (S-28, S-33): with the inspector docked left its header keeps at
 * least the 82px inset, and the strip's title row beside it drops to 12px.
 */
async function checkDockLeftInset(client) {
  const violations = [];
  const notes = [];
  const read = await evaluate(
    client,
    `(() => {
      const header = document.querySelector("[data-layout-inspector-header]");
      const titleRow = document.querySelector('[data-testid="side-strip-title-row"]');
      const inspector = document.querySelector("[data-layout-inspector]");
      const column = document.querySelector("[data-layout-column]");
      return {
        headerPadding: header === null ? null : Number.parseFloat(getComputedStyle(header).paddingLeft),
        titleRowPadding: titleRow === null ? null : Number.parseFloat(getComputedStyle(titleRow).paddingLeft),
        inspectorLeft: inspector === null ? null : inspector.getBoundingClientRect().left,
        columnLeft: column === null ? null : column.getBoundingClientRect().left,
      };
    })()`,
  );
  notes.push(
    `inspector header pads ${String(read.headerPadding)}px, title row pads ${String(read.titleRowPadding)}px; inspector left ${String(read.inspectorLeft)}, column left ${String(read.columnLeft)}`,
  );
  if (
    read.inspectorLeft === null ||
    read.columnLeft === null ||
    read.inspectorLeft > read.columnLeft
  ) {
    violations.push(
      "the inspector is not docked at the window's left, so the reserve is untested",
    );
  }
  if (
    read.headerPadding === null ||
    read.headerPadding < WCO_LEADING_INSET_FALLBACK
  ) {
    violations.push(
      `the left-docked inspector's header pads ${String(read.headerPadding)}px, under the ${String(WCO_LEADING_INSET_FALLBACK)}px traffic-light inset`,
    );
  }
  if (read.titleRowPadding !== LEFT_DOCK_COLUMN_GUTTER) {
    violations.push(
      `the strip's title row pads ${String(read.titleRowPadding)}px beside a left-docked inspector, expected the ${String(LEFT_DOCK_COLUMN_GUTTER)}px gutter`,
    );
  }
  return { violations, notes };
}

/**
 * A12: the collapsed rail is 56px (never under the 82px inset on macOS with the
 * strip at the left), and each monogram tile is a centred 32px square with its
 * letters actually drawn: ink inside the tile that is not the tile's fill.
 */
async function checkRail(client, variant, base) {
  const violations = [];
  const notes = [];
  const floor =
    variant.query.wco === "mac" && variant.query.tabs === "left"
      ? Math.max(SIDE_STRIP_RAIL_WIDTH, WCO_LEADING_INSET_FALLBACK)
      : SIDE_STRIP_RAIL_WIDTH;
  const exact = floor === SIDE_STRIP_RAIL_WIDTH;
  notes.push(
    `rail ${base.strip.width.toFixed(1)}px wide (expected ${exact ? "" : "at least "}${String(floor)}px)`,
  );
  if (
    exact
      ? Math.abs(base.strip.width - floor) > 0.5
      : base.strip.width < floor - 0.5
  ) {
    violations.push(
      `the rail is ${base.strip.width.toFixed(1)}px wide, expected ${exact ? "" : "at least "}${String(floor)}px (S-18)`,
    );
  }
  const tiles = await evaluate(
    client,
    `(() => [...document.querySelectorAll('[data-testid="side-tab-strip"] [data-side-tab="collapsed"][data-tile-kind="monogram"]')].map((tile) => {
      const r = tile.getBoundingClientRect();
      return { text: (tile.textContent ?? "").trim(), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
    }))()`,
  );
  if (tiles.length === 0) violations.push("no monogram tile in the rail");
  const stripCentre = base.strip.x + base.strip.width / 2;
  for (const tile of tiles) {
    if (
      Math.abs(tile.rect.width - SIDE_TAB_TILE) > 0.5 ||
      Math.abs(tile.rect.height - SIDE_TAB_TILE) > 0.5
    ) {
      violations.push(
        `the "${tile.text}" tile is ${tile.rect.width.toFixed(1)}x${tile.rect.height.toFixed(1)}, expected ${String(SIDE_TAB_TILE)}px square (S-17)`,
      );
    }
    const tileCentre = tile.rect.x + tile.rect.width / 2;
    if (Math.abs(tileCentre - stripCentre) > 1) {
      violations.push(
        `the "${tile.text}" tile is centred at x=${tileCentre.toFixed(1)}, the rail at x=${stripCentre.toFixed(1)}`,
      );
    }
    if (tile.text.length === 0) {
      violations.push(
        `a monogram tile at ${boxText(tile.rect)} has no letters`,
      );
      continue;
    }
    // Ink: pixels in the tile's middle that differ from the fill beside them.
    const ink = await inkInside(client, tile.rect);
    if (ink < 4) {
      violations.push(
        `the "${tile.text}" monogram paints ${String(ink)} ink pixels, so its letters are not drawn`,
      );
    }
  }
  notes.push(
    `${String(tiles.length)} monogram tiles: ${tiles.map((tile) => tile.text).join(" ")}`,
  );
  return { violations, notes };
}

/**
 * The collapsed tile's active ring on TINTED tiles, in both themes (review-10
 * H1, S-36): the orange `Delta` tile is made the active one through the tabs
 * store (the fixture has no epic routes for a click's navigation to land on),
 * and the ring's pixel is compared with the same pixel before the tile was
 * active, which is what the tile paints there with no ring. An inactive tinted tile is sampled
 * the same way as the control, so the probe is seen to read 1.00 where no ring
 * is drawn.
 */
async function checkRingLegibility(client) {
  const violations = [];
  const notes = [];
  try {
    await measureRingLegibility(client, violations, notes);
  } finally {
    // The theme is persisted, so the next variant's document would boot in
    // the last one set here; every variant starts from the shipped "system".
    await evaluate(client, 'window.__layoutCanvasProbe.setTheme("system")');
  }
  return { violations, notes };
}

async function measureRingLegibility(client, violations, notes) {
  for (const theme of ["light", "dark"]) {
    await evaluate(
      client,
      `window.__layoutCanvasProbe.setTheme(${JSON.stringify(theme)})`,
    );
    await evaluate(client, "window.__layoutCanvasProbe.reset()");
    await evaluate(
      client,
      'window.__layoutCanvasProbe.activateEpicTab("fixture-epsilon")',
    );
    await flush(client);
    await delay(150);
    const tilesProbe = `(() => {
      const tiles = [...document.querySelectorAll('[data-testid="side-tab-strip"] [data-side-tab="collapsed"][data-tinted="true"]')];
      const pick = (text) => tiles.find((node) => (node.textContent ?? "").trim() === text) ?? null;
      const box = (node) => {
        if (node === null) return null;
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, active: node.getAttribute("data-active") };
      };
      return { delta: box(pick("DM")), alpha: box(pick("AR")) };
    })()`;
    // The ring's position on the tile's leading edge, halfway down, and the
    // same pixel with no ring: what the tile paints there while inactive.
    const edgeOf = (box) => ({ x: box.x + 1, y: box.y + box.height / 2 });
    const resting = await evaluate(client, tilesProbe);
    if (resting.delta === null || resting.alpha === null) {
      violations.push(
        `${theme}: the tinted Delta ("DM") and Alpha ("AR") tiles are not both in the rail`,
      );
      continue;
    }
    const deltaEdge = edgeOf(resting.delta);
    const withoutRing = await samplePixelAt(client, deltaEdge.x, deltaEdge.y);
    await evaluate(
      client,
      'window.__layoutCanvasProbe.activateEpicTab("fixture-delta")',
    );
    await moveTo(client, 1, 1);
    await flush(client);
    await delay(250);
    await flush(client);
    const tiles = await evaluate(client, tilesProbe);
    if (tiles.delta.active !== "true" || tiles.alpha.active === "true") {
      violations.push(
        `${theme}: Delta is data-active=${String(tiles.delta.active)} and Alpha data-active=${String(tiles.alpha.active)}, expected only Delta active`,
      );
      continue;
    }
    const ring = await samplePixelAt(client, deltaEdge.x, deltaEdge.y);
    const active = {
      ring,
      fill: withoutRing,
      ratio: contrastRatio(ring, withoutRing),
    };
    // The control: an inactive tinted tile's edge against its own interior.
    const alphaEdge = edgeOf(tiles.alpha);
    const alphaRim = await samplePixelAt(client, alphaEdge.x, alphaEdge.y);
    const alphaFill = await samplePixelAt(client, alphaEdge.x + 4, alphaEdge.y);
    const control = { ratio: contrastRatio(alphaRim, alphaFill) };
    notes.push(
      `${theme}: active tinted ring rgb(${String(active.ring)}) where the inactive tile paints rgb(${String(active.fill)}) = ${active.ratio.toFixed(2)}:1; inactive tinted tile edge ${control.ratio.toFixed(2)}:1`,
    );
    if (active.ratio < RING_PRESENT_FLOOR) {
      violations.push(
        `${theme}: the active ring on a tinted tile reads ${active.ratio.toFixed(2)}:1 against the tile's own fill, which is no ring (S-36)`,
      );
    } else if (active.ratio < NON_TEXT_CONTRAST) {
      violations.push(
        `${theme}: the active ring on a tinted tile is ${active.ratio.toFixed(2)}:1 against its fill, under the ${String(NON_TEXT_CONTRAST)}:1 a non-text indicator owes`,
      );
    }
    if (control.ratio >= RING_PRESENT_FLOOR) {
      violations.push(
        `${theme}: an INACTIVE tinted tile reads ${control.ratio.toFixed(2)}:1 at the ring position, so the probe cannot tell a ring from none`,
      );
    }
  }
}

/**
 * The row kit in the expanded strip, at rest (review-10): the 10px badge on a
 * 16px leading tile, drawn and not clipped; and the group line down the
 * group's inline-start edge as ONE continuous line across its members,
 * including the split pair's rows inside the pair's padding.
 */
async function checkRowKit(client) {
  const violations = [];
  const notes = [];
  await evaluate(client, "window.__layoutCanvasProbe.endSession()");
  await moveTo(client, 1, 1);
  await flush(client);
  await delay(300);
  const kit = await evaluate(
    client,
    `(() => {
      const strip = document.querySelector('[data-testid="side-tab-strip"]');
      const scroller = strip.querySelector('[data-testid="header-tab-strip-scroll"]');
      const rect = (node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const badge = strip.querySelector('[data-side-tab="expanded"] [data-testid="side-tab-leading"] [data-testid="side-tab-rail-badge"]');
      const tile = badge === null ? null : badge.closest('[data-testid="side-tab-leading"]').querySelector('[data-testid="side-tab-leading-tile"]');
      const lines = [...strip.querySelectorAll('[data-testid="side-tab-group-line"]')].map((line) => ({
        rect: rect(line),
        color: getComputedStyle(line).backgroundColor,
        inPair: line.closest("[data-side-split-pair]") !== null,
      }));
      return {
        scroller: scroller === null ? null : rect(scroller),
        badge: badge === null ? null : { rect: rect(badge), kind: badge.getAttribute("data-kind"), color: getComputedStyle(badge).backgroundColor },
        tile: tile === null ? null : rect(tile),
        lines,
      };
    })()`,
  );
  if (kit.badge === null || kit.tile === null) {
    violations.push(
      "no status badge on an expanded row's leading tile (the seeded failure on Delta)",
    );
  } else {
    notes.push(
      `badge ${String(kit.badge.kind)} ${boxText(kit.badge.rect)} on tile ${boxText(kit.tile)}`,
    );
    if (
      Math.abs(kit.tile.width - SIDE_TAB_LEADING_TILE) > 0.5 ||
      Math.abs(kit.tile.height - SIDE_TAB_LEADING_TILE) > 0.5
    ) {
      violations.push(
        `the leading tile is ${kit.tile.width.toFixed(1)}x${kit.tile.height.toFixed(1)}, expected ${String(SIDE_TAB_LEADING_TILE)}px square (S-35)`,
      );
    }
    if (
      Math.abs(kit.badge.rect.width - SIDE_TAB_BADGE) > 0.5 ||
      Math.abs(kit.badge.rect.height - SIDE_TAB_BADGE) > 0.5
    ) {
      violations.push(
        `the badge is ${kit.badge.rect.width.toFixed(1)}x${kit.badge.rect.height.toFixed(1)}, expected ${String(SIDE_TAB_BADGE)}px (S-17)`,
      );
    }
    const badgeCx = kit.badge.rect.x + kit.badge.rect.width / 2;
    const badgeCy = kit.badge.rect.y + kit.badge.rect.height / 2;
    const cornerX = kit.tile.x + kit.tile.width;
    const cornerY = kit.tile.y;
    if (
      Math.abs(badgeCx - cornerX) > SIDE_TAB_BADGE / 2 ||
      Math.abs(badgeCy - cornerY) > SIDE_TAB_BADGE / 2
    ) {
      violations.push(
        `the badge is centred at (${badgeCx.toFixed(1)}, ${badgeCy.toFixed(1)}), not at the tile's top-right corner (${cornerX.toFixed(1)}, ${cornerY.toFixed(1)})`,
      );
    }
    if (kit.scroller !== null && kit.badge.rect.y - 2 < kit.scroller.y - 0.5) {
      violations.push(
        `the badge's ring reaches y=${(kit.badge.rect.y - 2).toFixed(1)}, above the scroller's top at y=${kit.scroller.y.toFixed(1)}, so it is clipped`,
      );
    }
    const painted = await samplePixelAt(client, badgeCx, badgeCy);
    const expected = await resolveRgb(client, kit.badge.color);
    const off =
      painted === null || expected === null
        ? Number.POSITIVE_INFINITY
        : Math.max(
            ...painted.map((channel, index) =>
              Math.abs(channel - expected[index]),
            ),
          );
    notes.push(
      `badge centre paints rgb(${String(painted)}), its colour is rgb(${String(expected)})`,
    );
    if (off > SOLID_FILL_TOLERANCE) {
      violations.push(
        `the badge's centre paints rgb(${String(painted)}), not its own colour rgb(${String(expected)}), so something covers it`,
      );
    }
  }

  const lines = kit.lines;
  if (lines.length < 3) {
    violations.push(
      `${String(lines.length)} group line segments, expected one per member of the seeded group (Alpha and the Beta/Gamma pair)`,
    );
  } else {
    notes.push(
      `group line segments: ${lines.map((line) => `${boxText(line.rect)}${line.inPair ? " (in pair)" : ""}`).join(", ")}`,
    );
    const x0 = lines[0].rect.x;
    for (const line of lines) {
      if (Math.abs(line.rect.x - x0) > 0.5) {
        violations.push(
          `a group line segment${line.inPair ? " inside the split pair" : ""} sits at x=${line.rect.x.toFixed(1)}, the group's first at x=${x0.toFixed(1)}: the line steps sideways`,
        );
      }
    }
    for (let index = 1; index < lines.length; index += 1) {
      const above = lines[index - 1].rect;
      const below = lines[index].rect;
      const gap = below.y - (above.y + above.height);
      if (gap > 0.5) {
        violations.push(
          `the group line breaks for ${gap.toFixed(1)}px between y=${(above.y + above.height).toFixed(1)} and y=${below.y.toFixed(1)}`,
        );
      }
    }
    // The pixels, top to bottom down the first segment's centre column.
    const top = lines[0].rect.y;
    const bottom = lines.at(-1).rect.y + lines.at(-1).rect.height;
    const colour = await resolveRgb(client, lines[0].color);
    if (colour !== null) {
      await ensurePixelTools(client);
      const shot = await client.send("Page.captureScreenshot", {
        format: "png",
        clip: {
          x: x0 + lines[0].rect.width / 2 - 0.5,
          y: top,
          width: 1,
          height: Math.max(1, bottom - top),
          scale: 1,
        },
        captureBeyondViewport: false,
      });
      const count = await evaluate(
        client,
        `window.__countShot(${JSON.stringify(shot.data)}, false, ${JSON.stringify(colour)}, 60)`,
      );
      const share = count.along === 0 ? 0 : count.lit / count.along;
      notes.push(
        `group line pixels: ${String(count.lit)}/${String(count.along)} in the group colour rgb(${String(colour)}) from y=${top.toFixed(1)} to y=${bottom.toFixed(1)}`,
      );
      if (share < 0.97) {
        violations.push(
          `only ${(share * 100).toFixed(1)}% of the group line's run from y=${top.toFixed(1)} to y=${bottom.toFixed(1)} is painted in the group colour, so it is not one continuous line`,
        );
      }
    }
  }
  return { violations, notes };
}

// --- phase 2c: the live placement switch (A14) -----------------------------

async function runLiveSwitchPhase(client, pageUrl, pageLoads) {
  const violations = [];
  const notes = [];
  const label = "live switch";
  const loadsAtStart = await openVariant(
    client,
    variantUrl(pageUrl, {
      tabs: "top",
      collapsed: 0,
      wco: "none",
      dock: "right",
    }),
    label,
    "window.__layoutCanvasProbe?.ready === true",
    pageLoads,
  );
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
  await evaluate(client, "window.__layoutCanvasProbe.beginSession()");
  await moveTo(client, 1, 1);
  await flush(client);
  await delay(450);
  await flush(client);

  const radio = await evaluate(
    client,
    `(() => {
      const group = document.querySelector('[data-layout-inspector] [role="radiogroup"][aria-label="Tabs position"]');
      if (group === null) return null;
      const left = [...group.querySelectorAll('[role="radio"]')].find((node) => (node.textContent ?? "").trim() === "Left") ?? null;
      if (left === null) return null;
      left.scrollIntoView({ block: "center" });
      return true;
    })()`,
  );
  if (radio === null) {
    violations.push(
      "A14: the inspector index shows no Tabs position radio labelled Left",
    );
  } else {
    await flush(client);
    const left = await rectOf(
      client,
      '[data-layout-inspector] [role="radiogroup"][aria-label="Tabs position"] [role="radio"]:nth-child(2)',
    );
    const depthBefore = await evaluate(
      client,
      "window.__layoutCanvasProbe.historyDepth()",
    );
    await moveTo(client, left.cx, left.cy);
    await pressAndRelease(client, left.cx, left.cy, "left");
    // ONE frame after the click, not a settle: the strip is where it will stay.
    const first = await evaluate(
      client,
      `new Promise((resolve) => requestAnimationFrame(() => resolve(${STRIP_PLACEMENT_PROBE})))`,
    );
    await delay(500);
    await flush(client);
    const settled = await evaluate(client, STRIP_PLACEMENT_PROBE);
    const depthAfter = await evaluate(
      client,
      "window.__layoutCanvasProbe.historyDepth()",
    );
    notes.push(
      `one frame after the click: ${JSON.stringify(first)}; settled: ${JSON.stringify(settled)}; history ${String(depthBefore)} -> ${String(depthAfter)}`,
    );
    if (first.placement !== "left" || first.strip === null) {
      violations.push(
        `A14: one frame after a real click on Left the column is ${String(first.placement)} with ${first.strip === null ? "no strip" : "a strip"}`,
      );
    } else {
      if (Math.abs(first.strip.x - first.column.x) > 0.5) {
        violations.push(
          `A14: the strip is at ${boxText(first.strip)}, not on the column's left edge ${boxText(first.column)}`,
        );
      }
      if (
        settled.strip === null ||
        !sameBoxWithin(first.strip, settled.strip, 0.5)
      ) {
        violations.push(
          `A14: the strip kept moving after the first frame (${boxText(first.strip)} -> ${settled.strip === null ? "gone" : boxText(settled.strip)}), so the switch is animated rather than one frame`,
        );
      }
      if (first.header)
        violations.push(
          "A14: the header is still mounted beside the left strip",
        );
    }
    if (depthAfter !== depthBefore + 1) {
      violations.push(
        `A14: the click cost ${String(depthAfter - depthBefore)} history steps, expected one`,
      );
    }

    // The selection ring rides the moved node (L-90): select a rail icon beside
    // the strip, undo the switch, and read the ring one frame later.
    const icon = await rectOf(client, regionSelector("railBrowsers"));
    await pressAndRelease(client, icon.cx, icon.cy, "left");
    await delay(500);
    await flush(client);
    const ringBefore = await evaluate(client, ringProbe("railBrowsers"));
    const undo = await rectOf(
      client,
      '[data-layout-inspector] button[aria-label="Undo"]',
    );
    if (ringBefore.error !== null || undo === null) {
      violations.push(
        `A14: ${ringBefore.error ?? "no Undo button in the inspector"}`,
      );
    } else {
      await moveTo(client, undo.cx, undo.cy);
      await pressAndRelease(client, undo.cx, undo.cy, "left");
      const afterUndo = await evaluate(
        client,
        `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve({ placement: ${STRIP_PLACEMENT_PROBE}, ring: ${ringProbe("railBrowsers")} }))))`,
      );
      const depthUndone = await evaluate(
        client,
        "window.__layoutCanvasProbe.historyDepth()",
      );
      notes.push(
        `after one undo: ${JSON.stringify(afterUndo.placement)}; ring ${afterUndo.ring.error ?? `${boxText(afterUndo.ring.ring)} on ${boxText(afterUndo.ring.region)}`} (was on ${boxText(ringBefore.region)}); history ${String(depthUndone)}`,
      );
      if (
        afterUndo.placement.placement !== "top" ||
        afterUndo.placement.strip !== null ||
        !afterUndo.placement.header
      ) {
        violations.push(
          `A14: one undo left the column at ${String(afterUndo.placement.placement)} (strip ${afterUndo.placement.strip === null ? "gone" : "still mounted"}, header ${String(afterUndo.placement.header)})`,
        );
      }
      if (depthUndone !== depthBefore) {
        violations.push(
          `A14: after one undo the history is ${String(depthUndone)} deep, expected ${String(depthBefore)}`,
        );
      }
      if (afterUndo.ring.error !== null) {
        violations.push(`A14: after the undo ${afterUndo.ring.error}`);
      } else {
        // The ring springs from box to box by design (selection-ring.ts); what
        // L-90 forbids is a ring that keeps aiming at the OLD coordinates until
        // something re-tracks it. So: two frames after the undo it is already
        // travelling toward the moved icon, and with nothing else done it
        // lands on it.
        const ringBox = (region) => ({
          x: region.x - RING_PADDING,
          y: region.y - RING_PADDING,
          width: region.width + RING_PADDING * 2,
          height: region.height + RING_PADDING * 2,
        });
        const expected = ringBox(afterUndo.ring.region);
        if (Math.abs(afterUndo.ring.region.x - ringBefore.region.x) < 50) {
          violations.push(
            `A14: the undo did not move the selected icon (x ${ringBefore.region.x.toFixed(1)} -> ${afterUndo.ring.region.x.toFixed(1)}), so the ring's follow is untested`,
          );
        }
        const gapBefore = Math.abs(ringBefore.ring.x - expected.x);
        const gapAfter = Math.abs(afterUndo.ring.ring.x - expected.x);
        if (gapAfter > gapBefore - 5) {
          violations.push(
            `A14: two frames after the undo the ring is ${gapAfter.toFixed(1)}px from the moved icon, having been ${gapBefore.toFixed(1)}px away: it is not heading for the node (L-90)`,
          );
        }
        await delay(900);
        await flush(client);
        const landed = await evaluate(client, ringProbe("railBrowsers"));
        notes.push(
          `ring after it settles: ${landed.error ?? `${boxText(landed.ring)} on ${boxText(landed.region)}`}`,
        );
        if (landed.error !== null) {
          violations.push(`A14: once settled, ${landed.error}`);
        } else if (!sameBoxWithin(landed.ring, ringBox(landed.region), 1.5)) {
          violations.push(
            `A14: with nothing else done the ring settled at ${boxText(landed.ring)}, not on the moved icon's ring box ${boxText(ringBox(landed.region))} (L-90)`,
          );
        }
      }
    }
  }
  const errors = await evaluate(client, "window.__layoutCanvasErrors");
  if (errors.length > 0) {
    violations.push(
      `the fixture raised ${String(errors.length)} uncaught error(s):\n${errors.join("\n")}`,
    );
  }
  assertNoReloadSince(pageLoads, loadsAtStart, label, violations);
  console.log(`\n--- live placement switch ---`);
  for (const note of notes) console.log(`  ${note}`);
  assert.deepEqual(
    violations,
    [],
    `The live placement switch failed (${String(violations.length)}):\n${violations.map((line) => `  - ${line}`).join("\n")}`,
  );
  console.log(
    "live placement switch passed: a real click on Position Left moved the strip in one frame as one history step, and one undo restored the top, the selection ring heading for the moved node at once and landing on it with nothing re-tracked",
  );
}

const STRIP_PLACEMENT_PROBE = `(() => {
  const column = document.querySelector("[data-layout-column]");
  const strip = document.querySelector('[data-testid="side-tab-strip"]');
  const box = (node) => {
    if (node === null) return null;
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  return {
    placement: column === null ? null : column.getAttribute("data-tab-strip-placement"),
    column: box(column),
    strip: box(strip),
    header: document.querySelector("[data-fixture-header]") !== null,
  };
})()`;

// --- phase 3: the vertical strip's drag gesture (S-11) ----------------------

/** Past the tear-off threshold (24px) into the content, as the brief states it. */
const TEAR_OFF_PULL = 30;

async function runSideStripDragPhase(client, pageUrl, pageLoads) {
  const violations = [];
  const notes = [];
  for (const edge of ["left", "right"]) {
    const label = `strip drag ${edge}`;
    const loadsAtStart = await openVariant(
      client,
      variantUrl(pageUrl, { edge }),
      label,
      "window.__sideTabStripProbe?.ready === true && document.querySelectorAll('[data-strip-item-id]').length > 0",
      pageLoads,
    );
    const say = (line) => notes.push(`${edge}: ${line}`);
    const fail = (line) => violations.push(`${edge}: ${line}`);
    const initial = await evaluate(
      client,
      "window.__sideTabStripProbe.items()",
    );
    say(`seeded items ${JSON.stringify(initial)}`);

    // 1. Reorder along y: Epsilon up past Delta, with Delta stepping aside.
    await resetStrip(client);
    {
      const epsilon = await rowRect(client, "epic:fixture-epsilon");
      const delta = await rowRect(client, "epic:fixture-delta");
      const deltaFrame = await frameIdOf(client, "epic:fixture-delta");
      const target = { x: epsilon.cx, y: delta.cy - 8 };
      const mid = await dragRow(
        client,
        epsilon,
        target,
        `[data-strip-item-id="${deltaFrame}"]`,
      );
      const items = await evaluate(
        client,
        "window.__sideTabStripProbe.items()",
      );
      say(
        `reorder: mid-drag Delta frame transform "${String(mid.transform)}", overlay ${String(mid.overlay)}; items ${JSON.stringify(items)}`,
      );
      if (!mid.overlay)
        fail("reorder: no drag overlay while the row is in hand");
      if (translateY(mid.transform) <= 0) {
        fail(
          `reorder: Delta did not step aside mid-drag (its frame's transform is "${String(mid.transform)}")`,
        );
      }
      const order = items.map((keys) => keys.join("+"));
      if (
        order.indexOf("epic:fixture-epsilon") === -1 ||
        order.indexOf("epic:fixture-epsilon") >
          order.indexOf("epic:fixture-delta")
      ) {
        fail(
          `reorder: Epsilon is not before Delta after the drop: ${order.join(", ")}`,
        );
      }
    }

    // 2. A drop on a row's lower half pairs the two tabs into a split.
    await resetStrip(client);
    {
      const zeta = await rowRect(client, "epic:fixture-zeta");
      const epsilon = await rowRect(client, "epic:fixture-epsilon");
      const target = { x: zeta.cx, y: epsilon.cy + epsilon.height / 4 };
      const mid = await dragRow(client, zeta, target, null);
      const items = await evaluate(
        client,
        "window.__sideTabStripProbe.items()",
      );
      say(
        `pair: mid-drag preview ${String(mid.pairPreview)}; items ${JSON.stringify(items)}`,
      );
      if (mid.pairPreview === null)
        fail("pair: no pair preview on the hovered row's half mid-drag");
      const paired = items.some(
        (keys) =>
          keys.length === 2 &&
          keys.includes("epic:fixture-epsilon") &&
          keys.includes("epic:fixture-zeta"),
      );
      if (!paired)
        fail(
          `pair: dropping Zeta on Epsilon's lower half made no split of the two: ${JSON.stringify(items)}`,
        );
    }

    // 3. A split drags whole: the pair, grabbed by its top member, moves up
    // past Alpha as ONE item, and Alpha steps aside by the pair's extent. It
    // stays inside its group: a drop that would split a group is repaired
    // back by the layout (repairTabGroups), in both orientations.
    await resetStrip(client);
    {
      const beta = await rowRect(client, "epic:fixture-beta");
      const pair = await rectOf(client, '[data-strip-item-id="fixture-split"]');
      const alpha = await rowRect(client, "epic:fixture-alpha");
      const alphaFrame = await frameIdOf(client, "epic:fixture-alpha");
      const target = {
        x: beta.cx,
        y: beta.cy - (pair.y + pair.height / 2 - alpha.cy) - 10,
      };
      const mid = await dragRow(
        client,
        beta,
        target,
        `[data-strip-item-id="${alphaFrame}"]`,
      );
      const items = await evaluate(
        client,
        "window.__sideTabStripProbe.items()",
      );
      say(
        `split: pointer ${beta.cy.toFixed(0)} -> ${target.y.toFixed(0)}, overlay pair ${String(mid.overlayPair)}, Alpha frame "${String(mid.transform)}" (pair ${pair.height.toFixed(0)}px); items ${JSON.stringify(items)}`,
      );
      if (!mid.overlayPair) fail("split: the drag overlay is not the pair");
      const step = translateY(mid.transform);
      if (step < pair.height - 0.5) {
        fail(
          `split: Alpha stepped aside ${step.toFixed(1)}px mid-drag, less than the pair's ${pair.height.toFixed(1)}px, so the pair is not moving whole`,
        );
      }
      const order = items.map((keys) => keys.join("+"));
      if (
        order[0] !== "epic:fixture-beta+epic:fixture-gamma" ||
        order[1] !== "epic:fixture-alpha"
      ) {
        fail(
          `split: the pair did not land whole above Alpha: ${order.join(", ")}`,
        );
      }
    }

    // 4. Pulled sideways into the content: the preview, then a new window.
    await resetStrip(client);
    {
      const zeta = await rowRect(client, "epic:fixture-zeta");
      const strip = await rectOf(client, '[data-testid="side-tab-strip"]');
      const x =
        edge === "left"
          ? strip.x + strip.width + TEAR_OFF_PULL
          : strip.x - TEAR_OFF_PULL;
      const mid = await dragRow(client, zeta, { x, y: zeta.cy }, null);
      const requests = await evaluate(
        client,
        "window.__sideTabStripProbe.detachRequests()",
      );
      say(
        `tear-off into the content at x=${x.toFixed(0)}: preview ${String(mid.tearOff)}, requests ${JSON.stringify(requests)}`,
      );
      if (!mid.tearOff)
        fail(
          `tear-off: pulling ${String(TEAR_OFF_PULL)}px into the content showed no tear-off preview`,
        );
      if (!requests.includes("epic:fixture-zeta"))
        fail(
          "tear-off: releasing in the content requested no new window for Zeta",
        );
    }

    // 5. Pulled toward the window edge: nothing, until the pointer leaves the viewport.
    await resetStrip(client);
    {
      const zeta = await rowRect(client, "epic:fixture-zeta");
      const far = await rectOf(client, "[data-fixture-far-side]");
      const viewport = await evaluate(
        client,
        "({ width: window.innerWidth, height: window.innerHeight })",
      );
      const before = (
        await evaluate(client, "window.__sideTabStripProbe.detachRequests()")
      ).length;
      // As far toward the window edge as the viewport goes: 4px from it, which
      // is 44px past the band on the far side, beyond the 24px threshold.
      const farX = edge === "left" ? far.x + 4 : far.x + far.width - 4;
      const outsideX = edge === "left" ? -12 : viewport.width + 12;
      const trace = await dragRowVia(client, zeta, [
        { x: farX, y: zeta.cy },
        { x: outsideX, y: zeta.cy },
      ]);
      const requests = await evaluate(
        client,
        "window.__sideTabStripProbe.detachRequests()",
      );
      say(
        `toward the window edge: preview at the margin (x=${farX.toFixed(0)}) ${String(trace[0])}, outside the viewport (x=${String(outsideX)}) ${String(trace[1])}; requests ${JSON.stringify(requests.slice(before))}`,
      );
      if (trace[0])
        fail(
          "window edge: the pointer between the strip and the window edge already shows the tear-off preview",
        );
      if (!trace[1])
        fail(
          "window edge: the pointer outside the viewport shows no tear-off preview",
        );
      if (requests.length !== before + 1)
        fail(
          "window edge: releasing outside the viewport requested no new window",
        );
    }

    const errors = await evaluate(client, "window.__sideTabStripErrors");
    if (errors.length > 0)
      fail(
        `the fixture raised ${String(errors.length)} uncaught error(s):\n${errors.join("\n")}`,
      );
    assertNoReloadSince(pageLoads, loadsAtStart, label, violations);
  }
  console.log(`\n--- vertical strip drag ---`);
  for (const note of notes) console.log(`  ${note}`);
  assert.deepEqual(
    violations,
    [],
    `The vertical strip drag failed (${String(violations.length)}):\n${violations.map((line) => `  - ${line}`).join("\n")}`,
  );
  console.log(
    "vertical strip drag passed on both edges: y reorder with a neighbour stepping aside, a pair into a split, a split dragged whole, the tear-off into the content, and none toward the window edge until the pointer left the viewport",
  );
}

async function resetStrip(client) {
  await evaluate(client, "window.__sideTabStripProbe.reset()");
  await moveTo(client, 1, 1);
  await flush(client);
  await delay(250);
  await flush(client);
}

/** The row of one tab (`epic:<id>`), by its close button's test id. */
async function rowRect(client, key) {
  const [kind, id] = key.split(":");
  const box = await evaluate(
    client,
    `(() => {
      const close = document.querySelector('[data-testid="tab-close-${kind}-${id}"]');
      const row = close === null ? null : close.closest("[data-side-tab]");
      if (row === null) return null;
      const r = row.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    })()`,
  );
  if (box === null) throw new Error(`no row for ${key} in the strip`);
  return box;
}

async function frameIdOf(client, key) {
  const [kind, id] = key.split(":");
  return await evaluate(
    client,
    `document.querySelector('[data-testid="tab-close-${kind}-${id}"]')?.closest("[data-strip-item-id]")?.getAttribute("data-strip-item-id") ?? null`,
  );
}

const DRAG_STATE_PROBE = (siblingSelector) => `(() => {
  const sibling = ${siblingSelector === null ? "null" : `document.querySelector(${JSON.stringify(siblingSelector)})`};
  const overlay = document.querySelector('[data-testid="header-tab-drag-overlay"]');
  const preview = document.querySelector('[data-testid="side-tab-pair-preview"]');
  return {
    transform: sibling === null ? null : sibling.style.transform,
    overlay: overlay !== null,
    overlayPair: overlay !== null && overlay.querySelector('[data-testid^="split-tab-group-overlay-"]') !== null,
    pairPreview: preview === null ? null : preview.getAttribute("data-side"),
    tearOff: window.__sideTabStripProbe.tearOffPreview(),
  };
})()`;

async function dragRow(client, from, to, siblingSelector) {
  await pressAt(client, from.cx, from.cy);
  await moveInSteps(client, { x: from.cx, y: from.cy }, to);
  await delay(250);
  await flush(client);
  const mid = await evaluate(client, DRAG_STATE_PROBE(siblingSelector));
  await releaseAt(client, to.x, to.y);
  await delay(700);
  await flush(client);
  return mid;
}

/** A drag through several stops, reading the tear-off preview at each. */
async function dragRowVia(client, from, stops) {
  const seen = [];
  let at = { x: from.cx, y: from.cy };
  await pressAt(client, at.x, at.y);
  for (const stop of stops) {
    await moveInSteps(client, at, stop);
    at = stop;
    await delay(200);
    await flush(client);
    seen.push(
      await evaluate(client, "window.__sideTabStripProbe.tearOffPreview()"),
    );
  }
  await releaseAt(client, at.x, at.y);
  await delay(700);
  await flush(client);
  return seen;
}

async function pressAt(client, x, y) {
  await moveTo(client, x, y);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "mouse",
  });
}

async function moveInSteps(client, from, to) {
  const steps = 16;
  for (let step = 1; step <= steps; step += 1) {
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + ((to.x - from.x) * step) / steps,
      y: from.y + ((to.y - from.y) * step) / steps,
      button: "left",
      buttons: 1,
      clickCount: 0,
      pointerType: "mouse",
    });
  }
}

async function releaseAt(client, x, y) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "mouse",
  });
}

function translateY(transform) {
  if (typeof transform !== "string" || transform === "" || transform === "none")
    return 0;
  const match =
    /translateY\((-?[\d.]+)px\)|translate3d\([^,]+,\s*(-?[\d.]+)px/.exec(
      transform,
    );
  if (match === null) return 0;
  return Number(match[1] ?? match[2]);
}

// --- side placements: shared helpers ---------------------------------------

function selectedPhases() {
  const all = ["parity", "canvas", "sides", "switch", "strip"];
  const raw = process.env.LAYOUT_EDITOR_BROWSER_PHASES;
  if (raw === undefined || raw.trim() === "") return new Set(all);
  const picked = raw
    .split(",")
    .map((phase) => phase.trim())
    .filter((phase) => phase.length > 0);
  for (const phase of picked) {
    if (!all.includes(phase)) {
      throw new Error(
        `unknown phase "${phase}"; the phases are ${all.join(", ")}`,
      );
    }
  }
  return new Set(picked);
}

function variantUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value));
  return url.toString();
}

/**
 * A fresh navigation to one variant, and the load count it starts from: the
 * page-load guard re-baselines per variant, so a reload DURING a variant is
 * reported against that variant (critique G4).
 */
async function openVariant(client, url, label, readyExpression, pageLoads) {
  try {
    await navigateAndSettle(client, url, label, readyExpression, pageLoads);
  } catch (error) {
    // One renewed navigation, never more. The first load of "side rail left,
    // macOS" stops answering CDP (a 15s `Runtime.evaluate` timeout) whenever
    // the parity phase ran earlier in the same Chrome: reproduced with
    // `parity,sides` and the full run, never with `sides` or `canvas,sides`
    // alone, and the second navigation always settles and passes. So some
    // origin state the parity fixture leaves behind is read by that variant's
    // first boot; which state is the open question in tickets/12. The ring
    // check's persisted theme is restored and was ruled out. A page that hangs
    // because of what it renders hangs again here and still fails, and a
    // retry is never silent.
    if (
      !(error instanceof Error) ||
      !error.message.startsWith("Timed out sending CDP command")
    )
      throw error;
    console.error(
      `\n  WARNING ${label}: the page stopped answering CDP (${error.message}); navigating ONCE more. This is the open question in tickets/12; report it with this run's output.\n`,
    );
    await navigateAndSettle(client, url, label, readyExpression, pageLoads);
  }
  return pageLoads.count;
}

async function navigateAndSettle(
  client,
  url,
  label,
  readyExpression,
  pageLoads,
) {
  const loadsBefore = pageLoads.count;
  await client.send("Page.navigate", { url });
  // No evaluation until the new document has loaded, so no probe races the
  // navigation's commit.
  const deadline = Date.now() + 30_000;
  while (pageLoads.count === loadsBefore) {
    if (Date.now() > deadline)
      throw new Error(`${label} never fired its load event`);
    await delay(25);
  }
  await waitForStablePage(client, label, readyExpression, pageLoads);
}

function assertNoReloadSince(pageLoads, loadsAtStart, label, violations) {
  if (pageLoads.count === loadsAtStart) return;
  violations.push(
    `${label}: the page reloaded ${String(pageLoads.count - loadsAtStart)} time(s) during this variant, so its measurements describe a rebuilt document; re-run with the tree quiet`,
  );
}

async function readFrameGeometry(client) {
  const tokens = await evaluate(
    client,
    `(() => {
      const style = getComputedStyle(document.querySelector("[data-layout-column]"));
      return {
        inset: style.getPropertyValue("--layout-editor-frame-inset").trim(),
        radius: style.getPropertyValue("--layout-editor-frame-radius").trim(),
      };
    })()`,
  );
  return { inset: pxValue(tokens.inset), radius: pxValue(tokens.radius) };
}

/** One painted pixel, read off a 1x1 screenshot. */
async function samplePixelAt(client, x, y) {
  await ensurePixelTools(client);
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    clip: { x: Math.floor(x), y: Math.floor(y), width: 1, height: 1, scale: 1 },
    captureBeyondViewport: false,
  });
  return await evaluate(
    client,
    `window.__samplePixel(${JSON.stringify(shot.data)})`,
  );
}

/** A computed colour as the rgb triple the screenshot would paint it, through a swatch. */
async function resolveRgb(client, cssColor) {
  const spot = await evaluate(
    client,
    `(() => {
      const node = document.createElement("div");
      node.setAttribute("data-colour-swatch", "");
      Object.assign(node.style, { position: "fixed", left: "700px", top: "700px", width: "8px", height: "8px", zIndex: "2147483000", background: ${JSON.stringify(cssColor)} });
      document.body.append(node);
      return { left: 700, top: 700 };
    })()`,
  );
  const pixel = await samplePixelAt(client, spot.left + 4, spot.top + 4);
  await evaluate(
    client,
    `document.querySelector("[data-colour-swatch]")?.remove()`,
  );
  return pixel;
}

/** Pixels in a tile's middle half that differ clearly from the tile's own fill at its padding. */
async function inkInside(client, rect) {
  await ensurePixelTools(client);
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    clip: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      scale: 1,
    },
    captureBeyondViewport: false,
  });
  return await evaluate(
    client,
    `(async () => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve);
        image.addEventListener("error", () => reject(new Error("decode failed")));
        image.src = "data:image/png;base64,${shot.data}";
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const at = (x, y) => { const i = (y * width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
      const fill = at(4, Math.floor(height / 2));
      let ink = 0;
      for (let y = Math.floor(height / 4); y < Math.ceil((height * 3) / 4); y += 1) {
        for (let x = Math.floor(width / 4); x < Math.ceil((width * 3) / 4); x += 1) {
          const p = at(x, y);
          if (Math.abs(p[0] - fill[0]) + Math.abs(p[1] - fill[1]) + Math.abs(p[2] - fill[2]) > 90) ink += 1;
        }
      }
      return ink;
    })()`,
  );
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(left, right) {
  if (left === null || right === null) return 0;
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturePath = "/src/__tests__/browser/layout-editor-browser.html";
const canvasFixturePath = "/src/__tests__/browser/layout-editor-canvas.html";
const sideStripFixturePath = "/src/__tests__/browser/side-tab-strip.html";
const chromePath = await findChrome("the layout editor parity regression");
const vitePort = await freePort();
let chrome;
let chromeProfilePath;
let client;
let viteProcess;

try {
  const pageUrl = `http://127.0.0.1:${vitePort}${fixturePath}`;
  viteProcess = spawnVite(vitePort);
  let viteError = "";
  viteProcess.stderr.setEncoding("utf8");
  viteProcess.stderr.on("data", (chunk) => {
    viteError += chunk;
  });
  await waitForHttp(pageUrl, viteProcess, () => viteError, "Vite");

  const launched = await launchChromeWithDevTools(
    chromePath,
    "traycer-layout-editor-",
    [],
  );
  chrome = launched.chrome;
  chromeProfilePath = launched.profilePath;
  await waitForHttp(
    new URL("/json/version", launched.devtoolsHttpUrl),
    chrome,
    launched.readError,
    "Chrome DevTools",
  );
  const targetResponse = await fetch(
    new URL(
      `/json/new?${encodeURIComponent(pageUrl)}`,
      launched.devtoolsHttpUrl,
    ),
    { method: "PUT" },
  );
  if (!targetResponse.ok) {
    throw new Error(
      `Chrome could not open the fixture: ${targetResponse.status}`,
    );
  }
  const target = await targetResponse.json();
  if (typeof target.webSocketDebuggerUrl !== "string") {
    throw new Error("Chrome did not return a page debugger URL");
  }
  client = await connectCdp(target.webSocketDebuggerUrl);
  await client.send("Runtime.enable", undefined);
  await client.send("Page.enable", undefined);
  const pageLoads = { count: 0 };
  client.on("Page.loadEventFired", () => {
    pageLoads.count += 1;
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1500,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const origin = `http://127.0.0.1:${vitePort}`;
  const canvasUrl = `${origin}${canvasFixturePath}`;
  const phases = selectedPhases();
  // Every selected phase runs even after one fails: each navigates to its own
  // document, so a red phase says nothing about the next, and one run should
  // report every red rather than the first.
  const runs = [
    ["parity", () => runParityPhase(client, pageUrl, pageLoads)],
    ["parity", () => runParityPlacementVariants(client, pageUrl, pageLoads)],
    ["canvas", () => runCanvasPhase(client, canvasUrl, pageLoads)],
    ["sides", () => runSidePlacementPhase(client, canvasUrl, pageLoads)],
    ["switch", () => runLiveSwitchPhase(client, canvasUrl, pageLoads)],
    [
      "strip",
      () =>
        runSideStripDragPhase(
          client,
          `${origin}${sideStripFixturePath}`,
          pageLoads,
        ),
    ],
  ];
  const failures = [];
  for (const [phase, run] of runs) {
    if (!phases.has(phase)) continue;
    try {
      await run();
    } catch (error) {
      failures.push({ phase, error });
      console.error(
        `\n[${phase}] FAILED:\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  console.log(
    `\nphases run: ${[...phases].join(", ")}; failed: ${failures.length === 0 ? "none" : failures.map((failure) => failure.phase).join(", ")}`,
  );
  if (failures.length > 0) {
    throw new Error(
      `${String(failures.length)} phase run(s) failed: ${failures.map((failure) => failure.phase).join(", ")} (details above)`,
    );
  }
} finally {
  client?.close();
  if (chrome !== undefined) await terminateProcessTree(chrome);
  viteProcess?.kill("SIGTERM");
  if (chromeProfilePath !== undefined) {
    await rm(chromeProfilePath, {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
  }
}

// --- phase 1: the parity regression -----------------------------------------

async function runParityPhase(client, pageUrl, pageLoads) {
  await client.send("Page.navigate", { url: pageUrl });
  await waitForStablePage(
    client,
    "the layout editor fixture",
    "window.__layoutEditorProbe?.ready === true",
    pageLoads,
  );
  // One frame for the miniature's ResizeObserver to settle its scale.
  await evaluate(
    client,
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );

  const violations = [];

  const stylesheet = await evaluate(client, STYLESHEET_PROBE);
  if (!stylesheet.loaded) {
    violations.push(
      `layout-editor.css is not in effect (${JSON.stringify(stylesheet)}); every comparison below would pass vacuously`,
    );
  }

  const pictures = await evaluate(client, PICTURE_PROBE);
  for (const region of pictures) {
    if (!region.framed) {
      violations.push(`${region.regionId}: drew no depiction frame`);
    }
  }

  const live = await evaluate(client, LIVE_PROBE);
  if (live.length === 0) {
    violations.push("no live region mounted, so nothing was compared");
  }
  for (const entry of live) {
    if (entry.error !== null) {
      violations.push(`${entry.regionId} live: ${entry.error}`);
      continue;
    }
    for (const property of Object.keys(entry.live)) {
      if (property === "kind") continue;
      if (entry.live[property] !== entry.drawn[property]) {
        violations.push(
          `${entry.regionId} ${entry.live.kind} ${property}: live ${String(entry.live[property])}, picture ${String(entry.drawn[property])}`,
        );
      }
    }
  }

  // The coverage claim itself, stated by the fixture and checked against what
  // is really on the page: a region is either compared live or excused by
  // name, never quietly neither (G3-02, L-85).
  const coverage = await evaluate(client, COVERAGE_PROBE);
  const comparedLive = new Set(live.map((entry) => entry.regionId));
  const uncovered = coverage.regionIds.filter((id) => !comparedLive.has(id));
  for (const regionId of uncovered) {
    if (coverage.noLiveLeaf[regionId] === undefined) {
      // With the DOM beside it: "the element is there and unnamed" and "the
      // surface never rendered it" are different defects, and the message that
      // does not say which cost a whole run to tell apart.
      const trace = await evaluate(
        client,
        `(() => ({
          namedAnywhere: document.querySelectorAll('[data-layout-region="${regionId}"]').length,
          liveSurfaceRegions: [
            ...document.querySelectorAll("[data-live-surface] [data-layout-region]"),
          ].map((node) => node.getAttribute("data-layout-region")),
          toolbarItems: [
            ...document.querySelectorAll("[data-testid^='toolbar-item-']"),
          ].map((node) => node.getAttribute("data-testid")),
        }))()`,
      );
      violations.push(
        `${regionId} has no live node here and no stated reason: mount its real leaf or name it in the fixture's NO_LIVE_LEAF table (${JSON.stringify(trace)})`,
      );
    }
  }
  for (const regionId of Object.keys(coverage.noLiveLeaf)) {
    if (comparedLive.has(regionId)) {
      violations.push(
        `${regionId} is excused in NO_LIVE_LEAF and does have a live node: delete the excuse`,
      );
    }
  }

  // The clip fade on the one picture that can outgrow the inspector (LV2-14).
  // Eight usage providers in a 292px stage is more than fits, and both halves
  // of the answer are real layout that jsdom cannot decide: the MEASURED
  // `data-clipped` (scrollWidth against clientWidth) and the `CLIP_FADE` mask
  // the attribute turns on.
  const clipFade = await evaluate(client, CLIP_FADE_PROBE);
  if (clipFade.error !== null) {
    violations.push(`clip fade: ${clipFade.error}`);
  } else {
    if (clipFade.clipped !== "true") {
      violations.push(
        `clip fade: eight providers in a ${String(clipFade.frameWidth)}px stage measured data-clipped="${String(clipFade.clipped)}" (content ${String(clipFade.scrollWidth)}px in ${String(clipFade.clientWidth)}px)`,
      );
    }
    if (clipFade.mask === "none" || clipFade.mask === "") {
      violations.push(
        `clip fade: the clipped picture resolves no mask-image (got "${clipFade.mask}")`,
      );
    }
  }

  // The attached dock panels, one one-line row each, are the same height to
  // the pixel (L-171, L-172): the five members, plus the queue again with a
  // provenance chip on its row. Waited for rather than read straight off: two
  // of them boot a host runtime before they draw a row, so an unwaited read
  // would measure the runtime's fallback and call the nulls equal. The count
  // is read off the page rather than written down here, because a member is
  // exactly the thing this file should not be the register of.
  await waitFor(
    client,
    "the five attached dock panels to draw their one row each",
    `document.querySelectorAll("[data-dock-row-metric] [data-testid='chat-dock-attached-panel']").length === document.querySelectorAll("[data-dock-row-metric]").length && document.querySelectorAll("[data-dock-row-metric]").length > 0`,
  );
  const dockRows = await evaluate(client, DOCK_ROW_METRIC_PROBE);
  const dockRowReport = dockRows.rows
    .map((row) => `${row.section} ${String(row.height)}px/${String(row.rows)}`)
    .join(", ");
  const dockRowHeights = new Set(dockRows.rows.map((row) => row.height));
  if (dockRowHeights.size !== 1) {
    violations.push(
      `the attached dock panels do not share one row metric: ${dockRowReport}`,
    );
  }
  // Not vacuously: every panel drew the one row it was fed, and the shared
  // height is more than an empty list's inset.
  for (const row of dockRows.rows) {
    if (row.rows === 1) continue;
    violations.push(
      `${String(row.section)} drew ${String(row.rows)} rows, expected exactly 1: ${dockRowReport}`,
    );
  }
  for (const height of dockRowHeights) {
    if (height !== null && height > DOCK_ROW_METRIC_LIST_INSET) continue;
    violations.push(
      `the attached dock panels measured ${String(height)}px, which is no more than an empty list's ${String(DOCK_ROW_METRIC_LIST_INSET)}px inset: ${dockRowReport}`,
    );
  }

  const miniature = await evaluate(client, MINIATURE_PROBE);
  if (miniature.error !== null) {
    violations.push(`preset miniature: ${miniature.error}`);
  } else {
    if (miniature.frameWidth !== 1000 || miniature.frameHeight !== 620) {
      violations.push(
        `preset miniature frame: expected 1000x620 untransformed, got ${miniature.frameWidth}x${miniature.frameHeight}`,
      );
    }
    const expectedScale = miniature.boxWidth / 1000;
    if (Math.abs(miniature.scale - expectedScale) > 0.001) {
      violations.push(
        `preset miniature scale: expected ${expectedScale.toFixed(4)}, got ${miniature.scale.toFixed(4)}`,
      );
    }
    if (Math.abs(miniature.scaleX - miniature.scaleY) > 0.001) {
      violations.push(
        `preset miniature is not uniformly scaled: ${miniature.scaleX} x ${miniature.scaleY}`,
      );
    }
  }

  await evaluate(client, "window.__layoutEditorProbe.showChip()");
  await evaluate(
    client,
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  const chip = await evaluate(client, CHIP_PROBE);
  if (chip.error !== null) {
    violations.push(`hover chip: ${chip.error}`);
  } else {
    if (chip.anchored !== "1") {
      violations.push(
        `hover chip took the measured fallback (data-anchored=${chip.anchored}); this Chrome resolves no anchor positioning, so the painted position below proves nothing`,
      );
    }
    // Chrome serialises `block-start center` in its physical-agnostic short
    // form, so both spellings mean the rule in `layout-editor.css` took.
    if (!["block-start center", "start center"].includes(chip.positionArea)) {
      violations.push(
        `hover chip position-area: expected the block-start centre area, got "${chip.positionArea}"`,
      );
    }
    // Painted, not computed: where Chrome actually put the box relative to
    // the element it is anchored to.
    if (Math.abs(chip.gapBelow - chip.margin) > 1) {
      violations.push(
        `hover chip sits ${chip.gapBelow.toFixed(2)}px above its region, expected ${chip.margin}px`,
      );
    }
    if (Math.abs(chip.centreOffset) > 1) {
      violations.push(
        `hover chip is ${chip.centreOffset.toFixed(2)}px off its region's centre`,
      );
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Layout editor parity regression failed:\n${JSON.stringify(
      { violations, stylesheet, dockRows, miniature, chip },
      null,
      2,
    )}`,
  );
  console.log(
    `layout editor parity regression passed: ${String(pictures.length)} pictures, ${String(live.length)} compared against a live leaf (${live.map((entry) => `${entry.regionId}/${entry.live.kind}`).join(", ")})`,
  );
  console.log(
    `no live leaf in this fixture for ${String(uncovered.length)} region(s), each with a stated reason:\n${uncovered
      .map((regionId) => `  - ${regionId}: ${coverage.noLiveLeaf[regionId]}`)
      .join("\n")}`,
  );
}

// --- process plumbing -------------------------------------------------------

function spawnVite(port) {
  const requireFromHere = createRequire(import.meta.url);
  const viteManifestPath = requireFromHere.resolve("vite/package.json");
  const viteManifest = requireFromHere(viteManifestPath);
  const viteEntry = path.resolve(
    path.dirname(viteManifestPath),
    viteManifest.bin.vite,
  );
  return spawn(
    "node",
    [
      viteEntry,
      "--config",
      path.join(projectRoot, "vitest.config.ts"),
      "--host",
      "127.0.0.1",
      "--force",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: projectRoot, stdio: ["ignore", "ignore", "pipe"] },
  );
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createTcpServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a free Vite port"));
        return;
      }
      server.close();
      resolve(address.port);
    });
  });
}

async function waitForHttp(url, child, readError, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`${label} exited before ready:\n${readError()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local server has not opened its port yet.
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}:\n${readError()}`);
}

async function connectCdp(url) {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const eventHandlers = new Map();
    let nextId = 0;
    let connectTimer;
    const rejectPending = (error) => {
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    };
    const fail = (error) => {
      clearTimeout(connectTimer);
      reject(error);
      rejectPending(error);
    };
    connectTimer = setTimeout(() => {
      fail(new Error("Timed out connecting to the CDP socket"));
      socket.close();
    }, 15_000);
    socket.addEventListener("error", () =>
      fail(new Error("CDP socket failed")),
    );
    socket.addEventListener("close", () =>
      fail(new Error("CDP socket closed")),
    );
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") {
        // An event. Phase 2 listens for `Page.fileChooserOpened`, which is the
        // only proof that a click on the composer's attach button did NOT
        // reach the app - a swallowed click leaves no trace in the DOM.
        for (const handler of eventHandlers.get(message.method) ?? [])
          handler(message.params);
        return;
      }
      const request = pending.get(message.id);
      if (request === undefined) return;
      pending.delete(message.id);
      if (message.error === undefined) request.resolve(message.result);
      else request.reject(new Error(message.error.message));
    });
    socket.addEventListener("open", () => {
      clearTimeout(connectTimer);
      resolve({
        send(method, params) {
          return new Promise((requestResolve, requestReject) => {
            const id = ++nextId;
            const timer = setTimeout(() => {
              pending.delete(id);
              requestReject(
                new Error(`Timed out sending CDP command ${method}`),
              );
            }, 15_000);
            pending.set(id, {
              resolve(value) {
                clearTimeout(timer);
                requestResolve(value);
              },
              reject(error) {
                clearTimeout(timer);
                requestReject(error);
              },
            });
            try {
              socket.send(JSON.stringify({ id, method, params }));
            } catch (error) {
              pending.delete(id);
              clearTimeout(timer);
              requestReject(error);
            }
          });
        },
        on(method, handler) {
          const handlers = eventHandlers.get(method) ?? [];
          handlers.push(handler);
          eventHandlers.set(method, handlers);
        },
        close() {
          socket.close();
        },
      });
    });
  });
}

async function evaluate(targetClient, expression) {
  const response = await targetClient.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails !== undefined) {
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text ??
        "Browser evaluation failed",
    );
  }
  return response.result.value;
}

/**
 * Ready, and STILL ready once the page has had a moment to reload under us.
 *
 * Vite re-optimizes dependencies on a cold `--force` start and answers with a
 * full page reload, which can land after the fixture has already reported
 * ready. The probes then run against a document that is being torn down and
 * rebuilt, and whichever region has not re-registered yet reads as absent.
 * Measured: a run died twenty assertions in as
 * `window.__swatch is not a function`, because a save in another window had
 * reloaded the page and taken every injected helper with it. The load event
 * is the edge; waiting for a quiet window after it is the whole fix, and a
 * reload that lands mid-phase is reported rather than absorbed.
 */
async function waitForStablePage(targetClient, label, expression, pageLoads) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await waitFor(targetClient, label, expression);
    const seen = pageLoads.count;
    await delay(700);
    if (pageLoads.count === seen && (await evaluate(targetClient, expression)))
      return;
  }
  throw new Error(`${label} kept reloading and never settled`);
}

async function waitFor(targetClient, label, expression) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await evaluate(targetClient, expression)) return;
    await delay(50);
  }
  const state = await evaluate(
    targetClient,
    `({ body: document.body.innerHTML.slice(0, 4000), viteError: document.querySelector("vite-error-overlay")?.shadowRoot?.textContent ?? "" })`,
  );
  throw new Error(
    `Timed out waiting for ${label}:\n${JSON.stringify(state, null, 2)}`,
  );
}

// --- phase 2: the canvas interaction regression -----------------------------

async function runCanvasPhase(client, pageUrl, pageLoads) {
  const violations = [];
  const notes = [];
  const fileChoosers = [];
  client.on("Page.fileChooserOpened", (params) => {
    fileChoosers.push(params);
  });

  await client.send("Page.navigate", { url: pageUrl });
  await waitForStablePage(
    client,
    "the layout editor canvas fixture",
    "window.__layoutCanvasProbe?.ready === true",
    pageLoads,
  );
  await client.send("Page.setInterceptFileChooserDialog", { enabled: true });
  const loadsAtStart = pageLoads.count;
  await evaluate(client, INSTALL_PIXEL_TOOLS);
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
  await evaluate(client, "window.__layoutCanvasProbe.beginSession()");
  await flush(client);
  await delay(400);
  await flush(client);

  const coverage = await evaluate(
    client,
    `(() => ({
      regionIds: window.__layoutCanvasProbe.regionIds,
      noCanvasNode: window.__layoutCanvasProbe.noCanvasNode,
      names: window.__layoutCanvasProbe.names,
      errors: window.__layoutCanvasErrors,
    }))()`,
  );
  if (coverage.errors.length > 0) {
    violations.push(
      `the fixture raised ${String(coverage.errors.length)} uncaught error(s):\n${coverage.errors.join("\n")}`,
    );
  }
  for (const regionId of coverage.regionIds) {
    const drawn = CANVAS_REGIONS.includes(regionId);
    const excused = coverage.noCanvasNode[regionId] !== undefined;
    if (drawn === excused) {
      violations.push(
        `${regionId}: the driver says drawn=${String(drawn)} and the fixture says excused=${String(excused)}; one of them is wrong`,
      );
    }
  }
  const mountedRegions = CANVAS_REGIONS.filter((regionId) =>
    coverage.regionIds.includes(regionId),
  );
  for (const regionId of CANVAS_REGIONS) {
    if (!mountedRegions.includes(regionId))
      notes.push(
        `${regionId} is no longer a region in this build; not asserted`,
      );
  }

  // --- A1. Nothing on the canvas is inert (LV2-01, L-131) -------------------
  const inert = await evaluate(
    client,
    `(() => {
      const column = document.querySelector("[data-layout-column]");
      if (column === null) return { error: "no app column" };
      return {
        error: null,
        count: column.querySelectorAll("[inert]").length,
        tags: [...column.querySelectorAll("[inert]")]
          .slice(0, 6)
          .map((n) => n.tagName + "." + (n.getAttribute("class") ?? "")),
      };
    })()`,
  );
  if (inert.error !== null) violations.push(`A1: ${inert.error}`);
  else if (inert.count !== 0) {
    violations.push(
      `A1: ${String(inert.count)} inert subtree(s) inside the canvas column, so nothing under them can be pointed at: ${inert.tags.join(" | ")}`,
    );
  }

  // --- A2. Every region is the hit target at its own centre -----------------
  for (const regionId of mountedRegions) {
    const hit = await evaluate(client, hitProbe(regionId));
    if (hit.error !== null) {
      violations.push(`A2 ${regionId}: ${hit.error}`);
      continue;
    }
    if (hit.width === 0 || hit.height === 0) {
      violations.push(
        `A2 ${regionId}: the region's box is ${String(hit.width)}x${String(hit.height)}, so there is nothing to point at`,
      );
      continue;
    }
    if (hit.resolved !== regionId) {
      violations.push(
        `A2 ${regionId}: elementFromPoint(${String(hit.x)}, ${String(hit.y)}) resolved ${String(hit.resolved)} (hit ${String(hit.hitTag)}, inertAncestor=${String(hit.inert)})`,
      );
    }
  }

  // --- A3. A real mouseMoved hovers it and raises the chip ------------------
  for (const regionId of mountedRegions) {
    const box = await rectOf(client, regionSelector(regionId));
    if (box === null) {
      violations.push(`A3 ${regionId}: no node`);
      continue;
    }
    await moveTo(client, box.cx, box.cy);
    await flush(client);
    const hover = await evaluate(client, hoverProbe(regionId));
    if (hover.error !== null) {
      violations.push(`A3 ${regionId}: ${hover.error}`);
      continue;
    }
    if (hover.hover !== "1") {
      violations.push(
        `A3 ${regionId}: a real mouseMoved onto (${box.cx.toFixed(0)}, ${box.cy.toFixed(0)}) left data-hover=${String(hover.hover)}`,
      );
    }
    const name = coverage.names[regionId];
    if (hover.chipHidden || hover.chipRect === null) {
      violations.push(
        `A3 ${regionId}: no name chip on screen (hidden=${String(hover.chipHidden)})`,
      );
    } else {
      if (!String(hover.chipText).startsWith(`${name} · `)) {
        violations.push(
          `A3 ${regionId}: the chip reads "${String(hover.chipText)}", expected it to start with "${name} · "`,
        );
      }
      if (!near(hover.chipRect, hover.regionRect, 48)) {
        violations.push(
          `A3 ${regionId}: the chip at ${boxText(hover.chipRect)} is not beside the region at ${boxText(hover.regionRect)}`,
        );
      }
    }
  }
  await moveTo(client, 4, 4);
  await evaluate(client, "window.__layoutCanvasProbe.clearSelection()");
  await flush(client);

  // --- A4. A real click selects, and the app does not act -------------------
  for (const regionId of mountedRegions) {
    const box = await rectOf(client, regionSelector(regionId));
    if (box === null) {
      violations.push(`A4 ${regionId}: no node`);
      continue;
    }
    await moveTo(client, box.cx, box.cy);
    await flush(client);
    const before = await evaluate(client, APP_ACTED_PROBE);
    const choosersBefore = fileChoosers.length;
    await pressAndRelease(client, box.cx, box.cy, "left");
    await flush(client);
    await delay(60);
    const after = await evaluate(client, APP_ACTED_PROBE);
    const selected = await evaluate(client, selectionProbe(regionId));
    if (selected.selected !== "1") {
      violations.push(
        `A4 ${regionId}: a real click at (${box.cx.toFixed(0)}, ${box.cy.toFixed(0)}) left data-selected=${String(selected.selected)}`,
      );
    }
    if (selected.atIndex) {
      violations.push(
        `A4 ${regionId}: the inspector is still on its index, so the click opened no section`,
      );
    } else if (
      !String(selected.inspectorText).includes(coverage.names[regionId])
    ) {
      violations.push(
        `A4 ${regionId}: the inspector section does not name it; it reads "${String(selected.inspectorText).slice(0, 120)}"`,
      );
    }
    if (after.layers !== 0) {
      violations.push(
        `A4 ${regionId}: the click opened ${String(after.layers)} menu/dialog/popover layer(s) - the app acted`,
      );
    }
    if (after.expanded !== before.expanded || after.states !== before.states) {
      violations.push(
        `A4 ${regionId}: the click toggled an app control (aria-expanded "${before.expanded}" -> "${after.expanded}", data-state "${before.states}" -> "${after.states}")`,
      );
    }
    if (fileChoosers.length !== choosersBefore) {
      violations.push(
        `A4 ${regionId}: the click opened a file chooser (${JSON.stringify(fileChoosers.at(-1))})`,
      );
    }
  }

  // --- A5. Six real drags and one join, each one history step ---------------
  const baseline = await evaluate(
    client,
    "window.__layoutCanvasProbe.snapshot()",
  );
  const dragPlans = buildDragPlans(
    baseline.arrangement.toolbarLeft,
    baseline.arrangement.dock,
  );
  for (const plan of dragPlans) {
    const result = await runDrag(client, plan);
    violations.push(...result.violations);
    notes.push(...result.notes);
  }

  // --- A6. The mic chip, and its ghost --------------------------------------
  await resetSession(client);
  await evaluate(client, "window.__layoutCanvasProbe.setMicShown(true)");
  await flush(client);
  const micShown = await rectOf(client, regionSelector("mic"));
  if (micShown === null || micShown.width === 0 || micShown.height === 0) {
    violations.push(
      `A6: Microphone Shown drew no box on the sample composer (${JSON.stringify(micShown)})`,
    );
  }
  await evaluate(client, "window.__layoutCanvasProbe.setMicShown(false)");
  await flush(client);
  const micHidden = await rectOf(client, regionSelector("mic"));
  if (micHidden !== null) {
    violations.push(
      `A6: Microphone Hidden left the chip on the canvas at ${boxText(micHidden)}`,
    );
  }
  const micGhost = await hoverIndexRow(client, "mic");
  if (micGhost.error !== null) violations.push(`A6 ghost: ${micGhost.error}`);
  else {
    if (micGhost.ghost !== "1") {
      violations.push(
        `A6 ghost: a real hover on the Microphone index row left data-ghost=${String(micGhost.ghost)}`,
      );
    }
    if (micGhost.rect === null || micGhost.rect.width === 0) {
      violations.push(
        `A6 ghost: the materialised mic has no box (${JSON.stringify(micGhost.rect)})`,
      );
    }
  }

  // --- A7. A Hidden + Chip dock member ghosts as a PILL ---------------------
  await resetSession(client);
  await evaluate(client, "window.__layoutCanvasProbe.hideChangedFilesAsChip()");
  await flush(client);
  const pillGhost = await hoverIndexRow(client, "changedFiles");
  if (pillGhost.error !== null) violations.push(`A7: ${pillGhost.error}`);
  else {
    if (pillGhost.ghost !== "1") {
      violations.push(
        `A7: a real hover on the Changed files index row left data-ghost=${String(pillGhost.ghost)}`,
      );
    }
    if (!pillGhost.inCompactStrip) {
      violations.push(
        `A7: the ghost materialised outside the compact strip, so a Hidden + Chip member is being previewed as the row it never takes (cluster=${String(pillGhost.cluster)})`,
      );
    }
    if (pillGhost.rect !== null && pillGhost.rect.height > 40) {
      violations.push(
        `A7: the ghost is ${String(Math.round(pillGhost.rect.height))}px tall, which is a row rather than a pill`,
      );
    }
  }

  // --- A8. Quick verbs, in a session and at rest ----------------------------
  await resetSession(client);
  await evaluate(client, "window.__layoutCanvasProbe.setMicShown(true)");
  await flush(client);
  const micBox = await rectOf(client, regionSelector("mic"));
  if (micBox === null) violations.push("A8: no mic region to right-click");
  else {
    const inSession = await rightClickMenu(client, micBox.cx, micBox.cy);
    if (!inSession.open) {
      violations.push(
        "A8: a real right-click on the mic INSIDE a session opened no [role=menu]",
      );
    } else if (!inSession.text.includes(coverage.names.mic)) {
      violations.push(
        `A8: the in-session menu does not name Microphone; it reads "${inSession.text.slice(0, 120)}"`,
      );
    }
    await dismissLayers(client);

    const turn = await rectOf(client, "[data-sample-turn]");
    if (turn === null) violations.push("A8: no sample transcript turn found");
    else {
      const onProse = await rightClickMenu(client, turn.cx, turn.cy);
      if (onProse.open) {
        violations.push(
          `A8: a right-click on the sample transcript opened a menu ("${onProse.text.slice(0, 120)}"); the firewall should swallow it`,
        );
      }
      await dismissLayers(client);
    }

    await evaluate(client, "window.__layoutCanvasProbe.endSession()");
    await flush(client);
    await delay(200);
    // Not the named element's own rect: outside a session `ComposerMicSlot`
    // draws its wrapper `display: contents`, so the element that CARRIES the
    // region name has no box at all. That is the shipped shape (the box only
    // exists while the ring and the hover outline need one), and the product
    // still resolves the region because the menu walks `closest` up from the
    // real control - which is what this point has to be on.
    const atRestBox = await pointInside(client, regionSelector("mic"));
    if (atRestBox === null) {
      violations.push(
        "A8: the mic lost its region name when the session ended, so a right-click at rest can no longer resolve it (L-129)",
      );
    } else {
      notes.push(
        `at rest the mic's named element is ${atRestBox.boxless ? "box-less (display: contents), so the right-click lands on its control" : "a real box"}`,
      );
      const atRest = await rightClickMenu(client, atRestBox.x, atRestBox.y);
      if (!atRest.open) {
        violations.push(
          "A8: a real right-click on the mic AT REST opened no [role=menu] (L-19)",
        );
      }
      await dismissLayers(client);
    }
  }

  // Every region that can be pointed at offers its verbs (L-144).
  //
  // These three were the measurement that found the gap: `region-quick-verbs.tsx`
  // was rendered by five call sites only - the two composer toolbar clusters,
  // the header's usage chip, the tab strip's Home item and the status bar's
  // visibility menu - so the dock's pills and rows, the sample rail's icons
  // and the minimap had no trigger to open one, session or not. They now do:
  // one cluster menu for the pill strip, one for the dock's joined frame, the
  // real rail's own menu on the sample rail, and a region menu on the minimap.
  //
  // A session is restarted per region because dismissing a menu that never
  // opened is an Escape the EDITOR owns, which would end the session.
  for (const regionId of ["changedFiles", "railBrowsers", "minimap"]) {
    await resetSession(client);
    const box = await rectOf(client, regionSelector(regionId));
    if (box === null) {
      violations.push(`A8: no ${regionId} on the canvas to right-click`);
      continue;
    }
    const menu = await rightClickMenu(client, box.cx, box.cy);
    if (menu.open) notes.push(`quick-verb menu on ${regionId}: opens`);
    else
      violations.push(
        `A8: a real right-click on ${regionId} inside a session opened no [role=menu] (L-144)`,
      );
    await dismissLayers(client);
  }

  // --- A9. The editing frame, counted in pixels -----------------------------
  await resetSession(client);
  const target = await sampleAmber(client);
  if (target === null) {
    violations.push("A9: could not sample the --warning-foreground colour");
  } else {
    notes.push(`--warning-foreground paints as rgb(${target.join(", ")})`);
    // Where the stylesheet put the stroke, read off the column rather than
    // restated here (see `countEdge`). Read as the TOKENS were authored, and
    // parsed here: a custom property comes back verbatim, so `0.25rem` or
    // `calc(4px)` would silently become 0.25 and NaN, and a driver that
    // swallowed either would report a frame regression that did not happen.
    const tokens = await evaluate(
      client,
      `(() => {
        const column = document.querySelector("[data-layout-column]");
        if (column === null) return { inset: null, radius: null };
        const style = getComputedStyle(column);
        return {
          inset: style.getPropertyValue("--layout-editor-frame-inset").trim(),
          radius: style.getPropertyValue("--layout-editor-frame-radius").trim(),
        };
      })()`,
    );
    const frame = {
      inset: pxValue(tokens.inset),
      radius: pxValue(tokens.radius),
    };
    if (frame.inset === null || frame.radius === null) {
      violations.push(
        `A9: the frame's geometry is not a plain px value (inset ${String(tokens.inset)}, radius ${String(tokens.radius)}), so nothing below measured where the stroke actually is; the counts fall back to L-137's ${String(DESIGNED_FRAME_INSET)}px and ${String(DESIGNED_FRAME_RADIUS)}px`,
      );
      frame.inset = frame.inset ?? DESIGNED_FRAME_INSET;
      frame.radius = frame.radius ?? DESIGNED_FRAME_RADIUS;
    } else if (
      frame.inset !== DESIGNED_FRAME_INSET ||
      frame.radius !== DESIGNED_FRAME_RADIUS
    ) {
      violations.push(
        `A9: the frame is inset ${String(frame.inset)}px with a ${String(frame.radius)}px radius, expected ${String(DESIGNED_FRAME_INSET)}px and ${String(DESIGNED_FRAME_RADIUS)}px (L-137)`,
      );
    }
    notes.push(
      `editing frame is inset ${String(frame.inset)}px with a ${String(frame.radius)}px radius; each edge's straight run is counted at that inset`,
    );
    for (const mode of ["right", "left", "float"]) {
      await evaluate(
        client,
        `window.__layoutCanvasProbe.setDockMode(${JSON.stringify(mode)})`,
      );
      await flush(client);
      await delay(450);
      await flush(client);
      const column = await rectOf(client, "[data-layout-column]");
      if (column === null) {
        violations.push(`A9 ${mode}: no app column`);
        continue;
      }
      for (const edge of ["top", "bottom", "left", "right"]) {
        const count = await countEdge(client, column, edge, target, frame);
        const ratio = count.along === 0 ? 0 : count.lit / count.along;
        notes.push(
          `frame ${mode}/${edge}: ${String(count.lit)}/${String(count.along)} lit (${(ratio * 100).toFixed(1)}%)`,
        );
        if (ratio < FRAME_LIT_FLOOR || ratio > FRAME_LIT_CEILING) {
          violations.push(
            `A9 ${mode}/${edge}: ${String(count.lit)} of ${String(count.along)} positions along the straight run of that edge are amber (${(ratio * 100).toFixed(1)}%, expected a dotted ${String(FRAME_LIT_FLOOR * 100)}-${String(FRAME_LIT_CEILING * 100)}%); column ${boxText(column)}`,
          );
        }
        const quarters = count.quarters ?? [];
        notes.push(
          `frame ${mode}/${edge} quarters: ${quarters
            .map((quarter) =>
              quarter.along === 0
                ? "-"
                : `${((quarter.lit / quarter.along) * 100).toFixed(0)}%`,
            )
            .join(" ")}`,
        );
        for (const [index, quarter] of quarters.entries()) {
          if (quarter.along === 0) continue;
          const share = quarter.lit / quarter.along;
          if (share >= FRAME_QUARTER_LIT_FLOOR) continue;
          violations.push(
            `A9 ${mode}/${edge}: quarter ${String(index + 1)} of that edge's straight run is ${(share * 100).toFixed(1)}% amber (expected at least ${String(FRAME_QUARTER_LIT_FLOOR * 100)}%), so part of the edge is covered or missing; column ${boxText(column)}`,
          );
        }
      }
      // The four corners, which the edge counts above cut out by construction
      // (`countEdge` starts each run at `inset + radius`). Nothing in those
      // counts can tell a 12px arc from a square join, so this asks the one
      // question that can be asked of a pixel: is the corner of the frame's
      // own RECTANGLE dark, as only a rounded corner leaves it.
      for (const corner of [
        "top-left",
        "top-right",
        "bottom-left",
        "bottom-right",
      ]) {
        const cornerX = corner.endsWith("left")
          ? column.x + frame.inset
          : column.x + column.width - frame.inset;
        const cornerY = corner.startsWith("top")
          ? column.y + frame.inset
          : column.y + column.height - frame.inset;
        const ink = await countBox(
          client,
          {
            x: cornerX - FRAME_CORNER_PROBE / 2,
            y: cornerY - FRAME_CORNER_PROBE / 2,
            width: FRAME_CORNER_PROBE,
            height: FRAME_CORNER_PROBE,
          },
          target,
        );
        notes.push(
          `frame ${mode}/${corner} square-corner probe: ${String(ink.lit)}/${String(ink.along)} amber`,
        );
        if (ink.lit > 0) {
          violations.push(
            `A9 ${mode}/${corner}: amber ink at the frame's own rectangle corner (${String(ink.lit)} of ${String(ink.along)} columns), which a ${String(frame.radius)}px radius cannot produce (L-137); the box is 4px square at the corner and anything painted there will report, so read the pixels before reading the border-radius; column ${boxText(column)}`,
          );
        }
      }
    }
    await evaluate(client, 'window.__layoutCanvasProbe.setDockMode("right")');
    await flush(client);
    await delay(400);

    // The editor's own TAB, under that same stroke (L-138, L-163). Its top
    // edge and the frame's top run share a line - the header is `h-10` and the
    // tab `h-9`, so the tab starts 4px down and the frame's stroke sits at 4px
    // - and while the tab wore the colour on its SILHOUETTE the two met at its
    // shoulders and read as one broken line. What must hold is that the colour
    // is the tab's AREA and the ordinary border is its edge.
    //
    // Read, not counted. The fill IS the target colour now, so a pixel probe
    // would have to exclude the filled silhouette - an S-curve - to see a
    // stroke at all, and even the cap bands either side of the label carry
    // that fill inside the curve. A computed-style read asks the declarations
    // themselves, so nothing it reports depends on antialiasing, on the dot
    // phase, or on where the label happens to fall. Both sides of every
    // comparison are normalised through one element's `color`, so a theme that
    // spells a token with `light-dark()` compares as the colour it resolves to
    // rather than as the text it was written in.
    const chrome = await evaluate(
      client,
      `(() => {
        const tab = document.querySelector("[data-fixture-session-tab]");
        if (tab === null) return { error: "no session tab in the fixture header" };
        const probe = document.createElement("span");
        probe.style.display = "none";
        tab.append(probe);
        const resolve = (value) => {
          probe.style.color = "";
          probe.style.color = value;
          return getComputedStyle(probe).color;
        };
        const amber = resolve("var(--warning-foreground)");
        const edges = [...tab.querySelectorAll('[data-testid^="tab-cap-outline-"]')]
          .map((path) => ({
            name: path.getAttribute("data-testid"),
            paint: getComputedStyle(path).stroke,
          }));
        const centre = tab.querySelector('[data-testid="tab-chrome-center"]');
        if (centre !== null) {
          edges.push({
            name: "tab-chrome-center border-top",
            paint: getComputedStyle(centre).borderTopColor,
          });
        }
        const result = {
          error: null,
          amber,
          fill: centre === null ? null : resolve(getComputedStyle(centre).backgroundColor),
          edges: edges.map((edge) => ({
            name: edge.name,
            paint: edge.paint === "none" ? "none" : resolve(edge.paint),
          })),
        };
        probe.remove();
        return result;
      })()`,
    );
    if (chrome.error !== null) {
      violations.push(`A9 tab: ${chrome.error}`);
    } else {
      notes.push(
        `session tab fill ${String(chrome.fill)} against the editing colour ${String(chrome.amber)}; edges ${chrome.edges.map((edge) => `${String(edge.name)}=${String(edge.paint)}`).join(", ")}`,
      );
      if (chrome.fill !== chrome.amber) {
        violations.push(
          `A9 tab: the editor's own tab is filled ${String(chrome.fill)} rather than the editing colour ${String(chrome.amber)}, so the tab is not the solid object the frame is the outline of (L-163)`,
        );
      }
      for (const edge of chrome.edges) {
        if (edge.paint !== chrome.amber) continue;
        violations.push(
          `A9 tab: ${String(edge.name)} is painted in the editing colour ${String(chrome.amber)}, so the tab wears a ring of it - which traces the skirt below the header baseline and lands on the frame's own line at the tab's shoulders (L-163)`,
        );
      }
    }
  }

  // --- A10. The selection ring's painted box --------------------------------
  await resetSession(client);
  const midBox = await rectOf(client, regionSelector("railBrowsers"));
  if (midBox === null) violations.push("A10: no railBrowsers to select");
  else {
    await pressAndRelease(client, midBox.cx, midBox.cy, "left");
    await delay(600);
    await flush(client);
    const ring = await evaluate(client, ringProbe("railBrowsers"));
    if (ring.error !== null) violations.push(`A10: ${ring.error}`);
    else {
      const expected = {
        x: ring.region.x - RING_PADDING,
        y: ring.region.y - RING_PADDING,
        width: ring.region.width + RING_PADDING * 2,
        height: ring.region.height + RING_PADDING * 2,
      };
      if (!sameBoxWithin(ring.ring, expected, 1.5)) {
        violations.push(
          `A10: the ring is painted at ${boxText(ring.ring)}, expected the region's box plus ${String(RING_PADDING)}px at ${boxText(expected)}`,
        );
      }
      // The one thing a dock switch moves without resizing anything (L-90).
      await evaluate(client, 'window.__layoutCanvasProbe.setDockMode("left")');
      await flush(client);
      await delay(700);
      const moved = await evaluate(client, ringProbe("railBrowsers"));
      const movedExpected = {
        x: moved.region.x - RING_PADDING,
        y: moved.region.y - RING_PADDING,
        width: moved.region.width + RING_PADDING * 2,
        height: moved.region.height + RING_PADDING * 2,
      };
      if (Math.abs(moved.region.x - ring.region.x) < 50) {
        violations.push(
          `A10: the dock switch did not move the column (region x ${String(ring.region.x)} -> ${String(moved.region.x)}), so the ring's follow is untested`,
        );
      }
      if (!sameBoxWithin(moved.ring, movedExpected, 1.5)) {
        violations.push(
          `A10: after a dock switch the ring is at ${boxText(moved.ring)} and the region at ${boxText(moved.region)}`,
        );
      }
      await evaluate(client, 'window.__layoutCanvasProbe.setDockMode("right")');
      await flush(client);
      await delay(400);
    }

    // The bottom row: every band the ring paints has to be inside the window.
    const bottom = await evaluate(client, bottomRegionProbe());
    if (bottom === null) violations.push("A10: no bottom-row region found");
    else {
      await pressAndRelease(client, bottom.cx, bottom.cy, "left");
      await delay(600);
      await flush(client);
      const ringBottom = await evaluate(client, ringProbe(bottom.regionId));
      notes.push(
        `bottom-row region is ${bottom.regionId}, ${String(Math.round(ringBottom.innerHeight - (ringBottom.region.y + ringBottom.region.height)))}px clear of the window's bottom edge`,
      );
      const painted = ringBottom.ring.y + ringBottom.ring.height + RING_BLEED;
      if (painted > ringBottom.innerHeight + 0.5) {
        violations.push(
          `A10: on ${bottom.regionId} the ring's outermost band reaches y=${painted.toFixed(1)} in a ${String(ringBottom.innerHeight)}px window, so it is clipped (LV2-16)`,
        );
      }
      if (ringBottom.ring.x < RING_BLEED - 0.5) {
        violations.push(
          `A10: on ${bottom.regionId} the ring's left band reaches x=${(ringBottom.ring.x - RING_BLEED).toFixed(1)}`,
        );
      }
    }
  }

  // A document that was rebuilt under the probes is not the one these numbers
  // describe: Vite's dev client answers any source edit with a full reload,
  // and a reload resets the session, the layout store and the ghost state
  // every assertion above was standing on. Reported rather than tolerated.
  if (pageLoads.count !== loadsAtStart) {
    violations.push(
      `the page reloaded ${String(pageLoads.count - loadsAtStart)} time(s) DURING this phase (Vite answers a source edit with a full reload), so every measurement above describes a document that was rebuilt under it; re-run with the tree quiet`,
    );
  }

  console.log(`\n--- canvas interaction regression ---`);
  for (const note of notes) console.log(`  ${note}`);
  assert.deepEqual(
    violations,
    [],
    `Layout editor canvas interaction regression failed (${String(violations.length)}):\n${violations.map((line) => `  - ${line}`).join("\n")}\n\nmeasurements:\n${notes.map((line) => `  ${line}`).join("\n")}`,
  );
  console.log(
    `layout editor canvas interaction regression passed: ${String(mountedRegions.length)} regions pointed at, hovered and selected with real mouse input; ${String(dragPlans.length)} real drags; the editing frame counted on 12 column edges`,
  );
  console.log(
    `no node on this canvas for ${String(Object.keys(coverage.noCanvasNode).length)} region(s), each with a stated reason:\n${Object.entries(
      coverage.noCanvasNode,
    )
      .map(([regionId, reason]) => `  - ${regionId}: ${reason}`)
      .join("\n")}`,
  );
}

// --- phase 2: page-side probes ---------------------------------------------

function regionSelector(regionId) {
  return `[data-layout-region="${regionId}"]`;
}

function hitProbe(regionId) {
  return `(() => {
    const node = document.querySelector(${JSON.stringify(regionSelector(regionId))});
    if (node === null) return { error: "the region has no node on the canvas" };
    const rect = node.getBoundingClientRect();
    const x = Math.round(rect.x + rect.width / 2);
    const y = Math.round(rect.y + rect.height / 2);
    const hit = document.elementFromPoint(x, y);
    const region = hit === null ? null : hit.closest("[data-layout-region]");
    return {
      error: null,
      x,
      y,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hitTag:
        hit === null
          ? null
          : hit.tagName + "." + String(hit.getAttribute("class") ?? "").slice(0, 60),
      resolved: region === null ? null : region.getAttribute("data-layout-region"),
      inert: hit === null ? null : hit.closest("[inert]") !== null,
    };
  })()`;
}

function hoverProbe(regionId) {
  return `(() => {
    const node = document.querySelector(${JSON.stringify(regionSelector(regionId))});
    const chip = document.querySelector("[data-layout-hover-chip]");
    if (node === null) return { error: "the region has no node on the canvas" };
    const rect = node.getBoundingClientRect();
    const chipRect = chip === null || chip.hidden ? null : chip.getBoundingClientRect();
    return {
      error: null,
      hover: node.getAttribute("data-hover"),
      anchor: node.getAttribute("data-layout-anchor"),
      chipHidden: chip === null ? true : chip.hidden,
      chipText: chip === null ? null : chip.textContent,
      chipRect:
        chipRect === null
          ? null
          : { x: chipRect.x, y: chipRect.y, width: chipRect.width, height: chipRect.height },
      regionRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  })()`;
}

function selectionProbe(regionId) {
  return `(() => {
    const node = document.querySelector(${JSON.stringify(regionSelector(regionId))});
    const panel = document.querySelector("[data-layout-inspector]");
    return {
      selected: node === null ? null : node.getAttribute("data-selected"),
      atIndex: panel !== null && panel.querySelector("[data-region-id]") !== null,
      inspectorText: panel === null ? "" : (panel.textContent ?? "").slice(0, 400),
    };
  })()`;
}

function ringProbe(regionId) {
  return `(() => {
    const ring = document.querySelector("[data-layout-selection-ring]");
    const node = document.querySelector(${JSON.stringify(regionSelector(regionId))});
    if (ring === null) return { error: "no selection ring in the document" };
    if (node === null) return { error: "the selected region has no node" };
    if (ring.hidden) return { error: "the selection ring is hidden" };
    const ringRect = ring.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    return {
      error: null,
      on: ring.getAttribute("data-on"),
      ring: { x: ringRect.x, y: ringRect.y, width: ringRect.width, height: ringRect.height },
      region: { x: nodeRect.x, y: nodeRect.y, width: nodeRect.width, height: nodeRect.height },
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
  })()`;
}

function bottomRegionProbe() {
  return `(() => {
    let best = null;
    for (const node of document.querySelectorAll("[data-layout-region]")) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (best === null || rect.bottom > best.bottom)
        best = {
          regionId: node.getAttribute("data-layout-region"),
          bottom: rect.bottom,
          cx: rect.x + rect.width / 2,
          cy: rect.y + rect.height / 2,
        };
    }
    return best;
  })()`;
}

// --- phase 2: real input ----------------------------------------------------

async function moveTo(client, x, y) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none",
    buttons: 0,
    clickCount: 0,
    pointerType: "mouse",
  });
}

async function pressAndRelease(client, x, y, button) {
  const buttons = button === "right" ? 2 : 1;
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button,
    buttons,
    clickCount: 1,
    pointerType: "mouse",
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button,
    buttons: 0,
    clickCount: 1,
    pointerType: "mouse",
  });
}

/**
 * A press, sixteen moves, a beat, and a release, with the canvas read while
 * the member is still in hand.
 *
 * Sixteen rather than one, because `armLayoutDrag` only starts a drag once the
 * press has TRAVELLED (`dragStarted`, 6px Manhattan) and the reflow is driven
 * by the moves after that; a single jump would arm and drop in the same event.
 *
 * The canvas is read after the LAST move rather than partway through, and
 * after a beat: a sibling steps aside on its own spring
 * (`DRAG_SIBLING_SPRING`, 0.34s response), and the member only claims a new
 * slot once its centre has passed the neighbour's - which is the last few
 * pixels of the gesture, not the middle of it.
 */
async function dragPointer(client, from, to, siblingSelector) {
  const steps = 16;
  await moveTo(client, from.cx, from.cy);
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: from.cx,
    y: from.cy,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "mouse",
  });
  for (let step = 1; step <= steps; step += 1) {
    const x = from.cx + ((to.x - from.cx) * step) / steps;
    const y = from.cy + ((to.y - from.cy) * step) / steps;
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 0,
      pointerType: "mouse",
    });
  }
  await delay(220);
  await flush(client);
  const mid = await evaluate(client, midDragProbe(siblingSelector));
  mid.pointer = to;
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: to.x,
    y: to.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "mouse",
  });
  // The release is a spring, and the write happens only once it has settled.
  await delay(900);
  await flush(client);
  return mid;
}

function midDragProbe(siblingSelector) {
  const sibling =
    siblingSelector === null ? "null" : JSON.stringify(siblingSelector);
  return `(() => {
    const dragging = document.querySelector("[data-layout-dragging]");
    const siblingSelector = ${sibling};
    const sibling =
      siblingSelector === null ? null : document.querySelector(siblingSelector);
    const rect = sibling === null ? null : sibling.getBoundingClientRect();
    return {
      dragging:
        dragging === null
          ? null
          : (dragging.getAttribute("data-layout-member") ??
             dragging.getAttribute("data-layout-region")),
      transform: dragging === null ? null : dragging.style.transform,
      siblingRect: rect === null ? null : { x: rect.x, y: rect.y },
    };
  })()`;
}

// --- phase 2: drags ---------------------------------------------------------

/**
 * The seven drags, with the two toolbar ones built from the arrangement the
 * app actually holds.
 *
 * The toolbar's membership is not a constant this driver may restate: the
 * cluster had three members while this was being written and has two now, and
 * a hardcoded pair would read as "the drag is broken" the moment one of them
 * is retired.
 *
 * BOTH directions, because both are now performable (L-143). The leftward one
 * is the case this driver once had to reverse: a member claimed a slot only
 * when its CENTRE passed the neighbour's, and the clamp keeps it inside its
 * cluster, so a WIDE member pulled in front of a narrower one at the cluster's
 * leading edge could never get its centre far enough left. Measured on this
 * composer: `access` is 120px wide at x 274.5, `attachImage` is at x 242.5,
 * and the cluster ends at 394.5 - so the furthest left `access` could be
 * dropped put its centre at 302.5 while `attachImage`'s is 256.5, and the drop
 * was refused however hard the pointer pulled. The slot is claimed by the
 * LEADING EDGE now, which `access` gets past 256.5 at an offset of -18, well
 * inside the clamp's 32px of travel - so this is the gesture that has to stay
 * possible, and it is asserted rather than described.
 */
function buildDragPlans(toolbarLeft, dock) {
  const first = toolbarLeft.at(0);
  const last = toolbarLeft.at(-1);
  const dockLast = dock.at(-1);
  const dockBefore = dock.at(-2);
  const toolbarPlan =
    first === undefined || last === undefined || first === last
      ? []
      : [
          {
            id: "toolbar member within its cluster",
            setup: ["window.__layoutCanvasProbe.reset()"],
            memberId: first,
            memberSelector: regionSelector(first),
            siblingSelector: regionSelector(last),
            target: {
              kind: "member",
              selector: regionSelector(last),
              dx: DROP_OVERSHOOT,
              dy: 0,
            },
            expect: {
              kind: "order",
              group: "toolbarLeft",
              ids: placedBeside(toolbarLeft, first, last, true),
            },
          },
          {
            id: "toolbar member leftwards past the cluster's leading member",
            setup: ["window.__layoutCanvasProbe.reset()"],
            memberId: last,
            memberSelector: regionSelector(last),
            siblingSelector: regionSelector(first),
            target: {
              kind: "member",
              selector: regionSelector(first),
              dx: -DROP_OVERSHOOT,
              dy: 0,
            },
            expect: {
              kind: "order",
              group: "toolbarLeft",
              ids: placedBeside(toolbarLeft, last, first, false),
            },
          },
        ];
  return [
    {
      id: "compact pill past a sibling pill",
      setup: [
        "window.__layoutCanvasProbe.reset()",
        "window.__layoutCanvasProbe.foldDockPills()",
      ],
      memberId: "changedFiles",
      memberSelector: regionSelector("changedFiles"),
      siblingSelector: regionSelector("runningAgents"),
      target: {
        kind: "member",
        selector: regionSelector("runningAgents"),
        dx: DROP_OVERSHOOT,
        dy: 0,
      },
      expect: {
        kind: "order",
        group: "dock",
        ids: placedBeside(dock, "changedFiles", "runningAgents", true),
      },
    },
    {
      id: "full dock row past a sibling row",
      setup: [
        "window.__layoutCanvasProbe.reset()",
        "window.__layoutCanvasProbe.unfoldDockPills()",
      ],
      memberId: dockLast,
      memberSelector: regionSelector(dockLast),
      siblingSelector: regionSelector(dockBefore),
      target: {
        kind: "member",
        selector: regionSelector(dockBefore),
        dx: 0,
        dy: -DROP_OVERSHOOT,
      },
      expect: {
        kind: "order",
        group: "dock",
        ids: placedBeside(dock, dockLast, dockBefore, false),
      },
    },
    ...toolbarPlan,
    {
      id: "rail icon across a divider",
      setup: [
        "window.__layoutCanvasProbe.reset()",
        "window.__layoutCanvasProbe.addRailDivider()",
      ],
      memberId: "railTerminals",
      memberSelector: regionSelector("railTerminals"),
      siblingSelector: '[data-layout-member="divider:1"]',
      target: {
        kind: "member",
        selector: '[data-layout-member="divider:1"]',
        dx: 0,
        dy: -DROP_OVERSHOOT,
        // A 36px icon against an 8px divider: the overshoot has to be
        // measured on the edge that claims the slot, or the icon passes the
        // PANEL above the divider too (L-143).
        leadingEdge: true,
      },
      expect: { kind: "rail", ids: TERMINALS_ABOVE_THE_DIVIDER },
    },
    {
      id: "rail divider itself",
      setup: [
        "window.__layoutCanvasProbe.reset()",
        "window.__layoutCanvasProbe.addRailDivider()",
      ],
      memberId: "divider:1",
      memberSelector: '[data-layout-member="divider:1"]',
      siblingSelector: regionSelector("railTerminals"),
      target: {
        kind: "member",
        selector: regionSelector("railTerminals"),
        dx: 0,
        dy: DROP_OVERSHOOT,
      },
      expect: { kind: "rail", ids: TERMINALS_ABOVE_THE_DIVIDER },
    },
    {
      // The one gesture on this rail that is not a reorder (L-168). The join
      // is made through the product's own writer inside a recorded gesture,
      // because the canvas drag engine has no middle band - `armLayoutDrag`
      // resolves a SLOT, so a combine is the dnd-kit rail's gesture and the
      // jsdom rail suite is where the pointer half is pinned. What this plan
      // holds is the rest of it: the entry the writer adds, the one history
      // step it costs, and the capsule the rail draws for a pair.
      id: "stacking two rail icons draws one capsule",
      setup: [
        "window.__layoutCanvasProbe.reset()",
        "window.__layoutCanvasProbe.stackTerminalsWithBrowsers()",
      ],
      kind: "state",
      expect: { kind: "rail", ids: TERMINALS_STACKED_ABOVE_BROWSERS },
      historyDelta: 1,
      // Scoped to the app column, which is the rail the gesture acted on: the
      // editor beside it draws a preset miniature per preset, each a real rail
      // with real capsules and no registered icons, so a document-wide query
      // reports four rails' worth of capsules for one gesture.
      probe: `(() => {
        const column = document.querySelector("[data-layout-column]");
        const capsules = [...column.querySelectorAll("[data-rail-stack]")];
        return capsules.map((node) => ({
          id: node.getAttribute("data-rail-stack"),
          icons: node.querySelectorAll("[data-layout-region]").length,
        }));
      })()`,
      expectProbe: [
        { id: "stack:railAgents+railArtifacts", icons: 2 },
        { id: "stack:railTerminals+railBrowsers", icons: 2 },
      ],
    },
    {
      id: "the clamp: a rail icon pulled far outside the column",
      setup: ["window.__layoutCanvasProbe.reset()"],
      memberId: "railComments",
      memberSelector: regionSelector("railComments"),
      siblingSelector: null,
      target: { kind: "viewport", dx: -60, dy: 300 },
      expect: { kind: "none" },
    },
  ];
}

async function runDrag(client, plan) {
  const violations = [];
  const notes = [];
  const depthAtSetup = await evaluate(
    client,
    "window.__layoutCanvasProbe.historyDepth()",
  );
  for (const expression of plan.setup) await evaluate(client, expression);
  await flush(client);
  await delay(250);
  await flush(client);

  // A plan with no pointer gesture: the setup IS the write, and what is
  // asserted is the arrangement it produced, the history it cost and whatever
  // the rail drew for it.
  if (plan.kind === "state") {
    const state = await evaluate(
      client,
      "window.__layoutCanvasProbe.snapshot()",
    );
    const depth = await evaluate(
      client,
      "window.__layoutCanvasProbe.historyDepth()",
    );
    const railIds = state.arrangement.rail.map((entry) => entry.id);
    if (JSON.stringify(railIds) !== JSON.stringify(plan.expect.ids)) {
      violations.push(
        `A5 ${plan.id}: the layout store reads ${JSON.stringify(railIds)}, expected ${JSON.stringify(plan.expect.ids)}`,
      );
    }
    if (depth - depthAtSetup !== plan.historyDelta) {
      violations.push(
        `A5 ${plan.id}: history went ${String(depthAtSetup)} -> ${String(depth)}; expected +${String(plan.historyDelta)}`,
      );
    }
    const drawn = await evaluate(client, plan.probe);
    if (JSON.stringify(drawn) !== JSON.stringify(plan.expectProbe)) {
      violations.push(
        `A5 ${plan.id}: the rail drew ${JSON.stringify(drawn)}, expected ${JSON.stringify(plan.expectProbe)}`,
      );
    }
    notes.push(
      `state "${plan.id}": ${JSON.stringify(railIds)}, capsules ${JSON.stringify(drawn)}, history +${String(depth - depthAtSetup)}`,
    );
    return { violations, notes };
  }

  const member = await rectOf(client, plan.memberSelector);
  if (member === null) {
    violations.push(`A5 ${plan.id}: nothing matches ${plan.memberSelector}`);
    return { violations, notes };
  }
  let to;
  if (plan.target.kind === "member") {
    const anchor = await rectOf(client, plan.target.selector);
    if (anchor === null) {
      violations.push(`A5 ${plan.id}: no drop anchor ${plan.target.selector}`);
      return { violations, notes };
    }
    to = { x: anchor.cx + plan.target.dx, y: anchor.cy + plan.target.dy };
    if (plan.target.leadingEdge === true) {
      // `to` named where the member's LEADING EDGE should land (L-143); the
      // pointer is half a member behind it, on the axis the drag travels.
      to = {
        x:
          plan.target.dx === 0
            ? to.x
            : to.x - Math.sign(plan.target.dx) * (member.width / 2),
        y:
          plan.target.dy === 0
            ? to.y
            : to.y - Math.sign(plan.target.dy) * (member.height / 2),
      };
    }
  } else {
    const view = await evaluate(
      client,
      "({ width: window.innerWidth, height: window.innerHeight })",
    );
    to = { x: view.width + plan.target.dx, y: view.height + plan.target.dy };
  }

  const siblingBefore =
    plan.siblingSelector === null
      ? null
      : await rectOf(client, plan.siblingSelector);
  const before = await evaluate(
    client,
    "window.__layoutCanvasProbe.snapshot()",
  );
  const depthBefore = await evaluate(
    client,
    "window.__layoutCanvasProbe.historyDepth()",
  );

  const mid = await dragPointer(client, member, to, plan.siblingSelector);

  const after = await evaluate(client, "window.__layoutCanvasProbe.snapshot()");
  const depthAfter = await evaluate(
    client,
    "window.__layoutCanvasProbe.historyDepth()",
  );

  if (mid === null || mid.dragging === null) {
    violations.push(
      `A5 ${plan.id}: nothing carried [data-layout-dragging] mid-gesture, so the press never became a drag (from ${boxText(member)} to ${JSON.stringify(to)})`,
    );
  } else if (mid.dragging !== plan.memberId) {
    violations.push(
      `A5 ${plan.id}: the element in hand was ${String(mid.dragging)}, expected ${plan.memberId}`,
    );
  }

  if (plan.expect.kind === "none") {
    // The clamp: the member may travel, but not as far as the pointer did, and
    // it may not be dropped anywhere (L-29).
    const raw =
      Math.abs(to.y - member.cy) > Math.abs(to.x - member.cx)
        ? Math.abs(to.y - member.cy)
        : Math.abs(to.x - member.cx);
    const travelled = mid === null ? null : translationOf(mid.transform);
    notes.push(
      `clamp: pointer pulled ${raw.toFixed(0)}px to ${JSON.stringify(to)}, member travelled ${travelled === null ? "n/a" : travelled.toFixed(0)}px`,
    );
    if (travelled !== null && travelled >= raw) {
      violations.push(
        `A5 ${plan.id}: the member followed the pointer ${travelled.toFixed(0)}px of ${raw.toFixed(0)}px, so nothing clamped it to its cluster`,
      );
    }
    if (
      JSON.stringify(after.arrangement) !== JSON.stringify(before.arrangement)
    ) {
      violations.push(
        `A5 ${plan.id}: the arrangement was written although the member was pulled out of its cluster`,
      );
    }
    if (depthAfter !== depthBefore) {
      violations.push(
        `A5 ${plan.id}: history went ${String(depthBefore)} -> ${String(depthAfter)}; a clamped drag writes nothing`,
      );
    }
    return { violations, notes };
  }

  if (siblingBefore !== null) {
    if (mid === null || mid.siblingRect === null) {
      violations.push(`A5 ${plan.id}: could not measure the sibling mid-drag`);
    } else if (
      Math.abs(mid.siblingRect.x - siblingBefore.x) < 1 &&
      Math.abs(mid.siblingRect.y - siblingBefore.y) < 1
    ) {
      violations.push(
        `A5 ${plan.id}: the sibling did not reflow mid-drag (still at ${mid.siblingRect.x.toFixed(1)}, ${mid.siblingRect.y.toFixed(1)})`,
      );
    }
  }

  const actual =
    plan.expect.kind === "rail"
      ? after.arrangement.rail.map((entry) => entry.id)
      : after.arrangement[plan.expect.group];
  if (JSON.stringify(actual) !== JSON.stringify(plan.expect.ids)) {
    violations.push(
      `A5 ${plan.id}: the layout store reads ${JSON.stringify(actual)}, expected ${JSON.stringify(plan.expect.ids)} (dragged from ${boxText(member)} to ${JSON.stringify(to)})`,
    );
  }
  if (depthAfter - depthBefore !== 1) {
    violations.push(
      `A5 ${plan.id}: history went ${String(depthBefore)} -> ${String(depthAfter)}; one drag is exactly one step (L-18)`,
    );
  }
  notes.push(
    `drag "${plan.id}": ${JSON.stringify(actual)}, history +${String(depthAfter - depthBefore)}`,
  );
  return { violations, notes };
}

/**
 * `layout-arrangement.ts`'s `placedBeside`, restated for the EXPECTATION.
 *
 * The expected order is computed from the order the app is actually holding
 * rather than written out, so a cluster that gains a member - the dock is
 * about to gain Todo and Queue - changes what the drop should produce without
 * changing this driver. The arithmetic is the product's own: take the member
 * out, put it back beside the anchor.
 */
function placedBeside(order, moved, anchor, after) {
  const rest = order.filter((id) => id !== moved);
  const at = rest.indexOf(anchor);
  if (at < 0) return order;
  const insertAt = after ? at + 1 : at;
  return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
}

function translationOf(transform) {
  if (typeof transform !== "string") return null;
  const match = transform.match(/translate[XY]\((-?[\d.]+)px\)/);
  return match === null ? null : Math.abs(Number(match[1]));
}

// --- phase 2: small helpers -------------------------------------------------

async function flush(client) {
  await evaluate(
    client,
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
}

async function rectOf(client, selector) {
  return await evaluate(
    client,
    `(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (node === null) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        cx: rect.x + rect.width / 2,
        cy: rect.y + rect.height / 2,
      };
    })()`,
  );
}

/**
 * A point that is really INSIDE the region, for the surfaces whose named
 * element is `display: contents` outside an editor session: such an element
 * generates no box, so its `getBoundingClientRect()` is `0,0,0,0` and a click
 * aimed at its centre lands in the window's top-left corner.
 */
async function pointInside(client, selector) {
  return await evaluate(
    client,
    `(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (node === null) return null;
      const boxOf = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? rect : null;
      };
      const own = boxOf(node);
      const rect =
        own ??
        [...node.querySelectorAll("*")]
          .map(boxOf)
          .find((candidate) => candidate !== null) ??
        null;
      if (rect === null) return null;
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        boxless: own === null,
      };
    })()`,
  );
}

async function resetSession(client) {
  await evaluate(client, "window.__layoutCanvasProbe.endSession()");
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
  await evaluate(client, "window.__layoutCanvasProbe.beginSession()");
  await flush(client);
  await delay(300);
  await flush(client);
}

async function hoverIndexRow(client, regionId) {
  const selector = `[data-layout-inspector] [data-region-id="${regionId}"]`;
  const found = await evaluate(
    client,
    `(() => {
      const row = document.querySelector(${JSON.stringify(selector)});
      if (row === null) return false;
      row.scrollIntoView({ block: "center" });
      return true;
    })()`,
  );
  if (!found) {
    return {
      error: `the inspector index has no row for ${regionId}`,
      ghost: null,
      rect: null,
      cluster: null,
      inCompactStrip: false,
    };
  }
  await flush(client);
  const row = await rectOf(client, selector);
  await moveTo(client, row.cx, row.cy);
  await flush(client);
  await delay(200);
  await flush(client);
  return await evaluate(
    client,
    `(() => {
      const node = document.querySelector(${JSON.stringify(regionSelector(regionId))});
      if (node === null)
        return {
          error: "the hovered index row materialised nothing on the canvas",
          ghost: null,
          rect: null,
          cluster: null,
          inCompactStrip: false,
        };
      const rect = node.getBoundingClientRect();
      const cluster = node.closest("[data-layout-cluster]");
      const testId = cluster === null ? null : cluster.getAttribute("data-testid");
      return {
        error: null,
        ghost: node.getAttribute("data-ghost"),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        cluster: testId,
        inCompactStrip: testId === "chat-dock-compact-strip",
      };
    })()`,
  );
}

async function rightClickMenu(client, x, y) {
  await moveTo(client, x, y);
  await pressAndRelease(client, x, y, "right");
  await delay(300);
  await flush(client);
  return await evaluate(
    client,
    `(() => {
      const menu = document.querySelector('[role="menu"]');
      return { open: menu !== null, text: menu === null ? "" : (menu.textContent ?? "") };
    })()`,
  );
}

async function dismissLayers(client) {
  for (const type of ["keyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      type,
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
  }
  await delay(200);
  await flush(client);
}

/**
 * The page-side pixel tools, installed if this document has not got them.
 *
 * Vite's dev client answers a source edit with a FULL page reload, which takes
 * everything this driver injected with it. Re-installing on demand rather than
 * once is what keeps a measurement from dying as
 * `window.__swatch is not a function` twenty assertions in; whether a reload
 * happened at all is reported separately, because a document that was rebuilt
 * mid-run is not one these numbers describe.
 */
async function ensurePixelTools(client) {
  const installed = await evaluate(
    client,
    'typeof window.__swatch === "function"',
  );
  if (!installed) await evaluate(client, INSTALL_PIXEL_TOOLS);
}

async function sampleAmber(client) {
  await ensurePixelTools(client);
  const spot = await evaluate(client, "window.__swatch(true)");
  if (spot === null) return null;
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    clip: { x: spot.left + 4, y: spot.top + 4, width: 4, height: 4, scale: 1 },
    captureBeyondViewport: false,
  });
  const pixel = await evaluate(
    client,
    `window.__samplePixel(${JSON.stringify(shot.data)})`,
  );
  await evaluate(client, "window.__swatch(false)");
  return pixel;
}

/**
 * One edge's STRAIGHT run, counted at the frame's own inset.
 *
 * Both ends are cut by `inset + radius`, because the frame's corners are arcs
 * and an arc leaves the straight edge before the column's corner does: counted
 * to the corner, a deliberate 12px radius reads as an unlit stretch at each
 * end of every edge. What is left is the part of the edge that is supposed to
 * be a straight dotted line, which is the thing LV2-04 was about.
 */
async function countEdge(client, column, edge, target, frame) {
  await ensurePixelTools(client);
  const horizontal = edge === "top" || edge === "bottom";
  const cut = frame.inset + frame.radius;
  const near = Math.max(0, frame.inset - FRAME_BAND_BEFORE_INSET);
  const thickness = FRAME_BAND_BEFORE_INSET + FRAME_BAND_AFTER_INSET;
  const clip = horizontal
    ? {
        x: column.x + cut,
        y:
          edge === "top"
            ? column.y + near
            : column.y + column.height - near - thickness,
        width: Math.max(1, column.width - cut * 2),
        height: thickness,
      }
    : {
        x:
          edge === "left"
            ? column.x + near
            : column.x + column.width - near - thickness,
        y: column.y + cut,
        width: thickness,
        height: Math.max(1, column.height - cut * 2),
      };
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
    captureBeyondViewport: false,
  });
  return await evaluate(
    client,
    `window.__countShot(${JSON.stringify(shot.data)}, ${String(horizontal)}, ${JSON.stringify(target)}, 90)`,
  );
}

/**
 * A CSS length that is written in plain pixels, or `null`.
 *
 * `getPropertyValue` on a custom property returns the token as authored, so
 * `Number.parseFloat` is only meaningful once the unit has been checked: it
 * reads `0.25rem` as 0.25 and `calc(4px)` as NaN, and a caller that took
 * either would be measuring a number the stylesheet never expressed.
 */
function pxValue(token) {
  if (typeof token !== "string") return null;
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(token.trim());
  return match === null ? null : Number(match[1]);
}

/**
 * One arbitrary box, counted by COLUMN: how many of its `width` columns hold a
 * pixel within tolerance of the target colour.
 *
 * `countEdge` asks the same question of a band it computes from the column and
 * an edge; this one takes the box, because the frame's rectangle corner is a
 * box the caller knows and the edge geometry does not. It reads `lit === 0`
 * when the design is right, which is the direction a pixel count can be
 * trusted in: a dotted stroke's phase can hide ink, it cannot invent it.
 */
async function countBox(client, box, target) {
  await ensurePixelTools(client);
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
      scale: 1,
    },
    captureBeyondViewport: false,
  });
  return await evaluate(
    client,
    `window.__countShot(${JSON.stringify(shot.data)}, true, ${JSON.stringify(target)}, 90)`,
  );
}

/** Whether two boxes touch once the first is inflated by `slack` on every side. */
function near(left, right, slack) {
  return (
    left.x - slack < right.x + right.width &&
    left.x + left.width + slack > right.x &&
    left.y - slack < right.y + right.height &&
    left.y + left.height + slack > right.y
  );
}

function sameBoxWithin(left, right, tolerance) {
  return (
    Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.y - right.y) <= tolerance &&
    Math.abs(left.width - right.width) <= tolerance &&
    Math.abs(left.height - right.height) <= tolerance
  );
}

function boxText(box) {
  return `[${box.x.toFixed(1)}, ${box.y.toFixed(1)}, ${box.width.toFixed(1)}x${box.height.toFixed(1)}]`;
}
