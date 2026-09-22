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

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturePath = "/src/__tests__/browser/layout-editor-browser.html";
const canvasFixturePath = "/src/__tests__/browser/layout-editor-canvas.html";
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

  await runCanvasPhase(
    client,
    `http://127.0.0.1:${vitePort}${canvasFixturePath}`,
    pageLoads,
  );
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
