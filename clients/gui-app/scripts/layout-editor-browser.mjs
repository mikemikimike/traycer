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
//   1. Every region's two picture entry points - the registry face the
//      inspector's sections and Style examples draw through, and
//      `depictRegion`, which the ghosts and the preset miniatures draw
//      through - produce the SAME tree, at the same width, in the same stage:
//      same tags, same resolved `font-size`, `line-height`, `gap`, `height`,
//      `padding`, `color`, `background-color` and `border-radius`, and the
//      same rect relative to each picture's own frame. No class lists are
//      compared, which would couple this to Tailwind's emitted strings.
//   2. The nine rail regions have a LIVE node (the sample workspace's real
//      rail) to compare their picture against, glyph for glyph.
//   3. The preset miniature is a uniformly SCALED app frame, not a reflowed
//      one: its untransformed frame measures exactly 1000x620 with
//      `offsetWidth`/`offsetHeight`, and its scale is the box width over that
//      width. A reflowed card is any other size.
//   4. The hover chip is where the BROWSER painted it under CSS anchor
//      positioning, not where a measurement would have put it.
//
// A fifth, first: the shipped stylesheet is actually in effect. Everything
// else is a comparison of computed values, and comparisons of nothing agree.
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

/** The eight resolved properties L-53 names, plus the rect. */
const COMPARED = [
  "fontSize",
  "lineHeight",
  "gap",
  "height",
  "padding",
  "color",
  "backgroundColor",
  "borderRadius",
];

function comparePictures(violations, region) {
  const { regionId, registry, depict } = region;
  if (registry.length !== depict.length) {
    violations.push(
      `${regionId}: the two pictures have different node counts (${String(registry.length)} vs ${String(depict.length)})`,
    );
    return;
  }
  for (let index = 0; index < registry.length; index += 1) {
    const a = registry[index];
    const b = depict[index];
    if (a.tag !== b.tag) {
      violations.push(
        `${regionId} node ${String(index)}: tag ${a.tag} vs ${b.tag}`,
      );
      continue;
    }
    for (const property of COMPARED) {
      if (a.style[property] !== b.style[property]) {
        violations.push(
          `${regionId} ${a.tag}[${String(index)}] ${property}: "${a.style[property]}" vs "${b.style[property]}"`,
        );
      }
    }
    if (a.painted !== b.painted) {
      violations.push(
        `${regionId} ${a.tag}[${String(index)}]: one picture paints it and the other does not`,
      );
      continue;
    }
    if (!a.painted) continue;
    for (const side of ["x", "y", "width", "height"]) {
      if (Math.abs(a.rect[side] - b.rect[side]) > 0.5) {
        violations.push(
          `${regionId} ${a.tag}[${String(index)}] rect.${side}: ${String(a.rect[side])} vs ${String(b.rect[side])}`,
        );
      }
    }
  }
}

// --- page-side probes -------------------------------------------------------

const WALK = `
  const walk = (frame) => {
    const origin = frame.getBoundingClientRect();
    const nodes = [];
    const visit = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      nodes.push({
        tag: element.tagName,
        // An SVG <title> generates no box. It is still walked, so a picture
        // that loses its accessible name still fails on the node count, but
        // its "rect" is the viewport origin and says nothing about looks.
        painted: element.getClientRects().length > 0,
        style: {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          gap: style.gap,
          height: style.height,
          padding: style.padding,
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
        },
        rect: {
          x: Math.round((rect.x - origin.x) * 100) / 100,
          y: Math.round((rect.y - origin.y) * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        },
      });
      for (const child of element.children) visit(child);
    };
    visit(frame);
    return nodes;
  };
`;

const PICTURE_PROBE = `(() => {
  ${WALK}
  return [...document.querySelectorAll("[data-region-row]")].map((row) => {
    const regionId = row.getAttribute("data-region-row");
    const frames = ["via-registry", "via-depict"].map((which) =>
      row.querySelector('[data-picture="' + which + '"] [data-layout-depiction]'),
    );
    if (frames.some((frame) => frame === null)) {
      return { regionId, error: "a picture drew no depiction frame", registry: [], depict: [] };
    }
    return {
      regionId,
      error: null,
      registry: walk(frames[0]),
      depict: walk(frames[1]),
    };
  });
})()`;

const RAIL_PROBE = `(() => {
  const glyph = (node) => {
    const svg = node.querySelector("svg");
    if (svg === null) return null;
    const style = getComputedStyle(svg);
    const rect = svg.getBoundingClientRect();
    return {
      width: Math.round(rect.width * 100) / 100,
      height: Math.round(rect.height * 100) / 100,
      color: style.color,
    };
  };
  const rail = document.querySelector("#live-rail");
  if (rail === null) return [];
  return [...rail.querySelectorAll("[data-layout-region]")].map((node) => {
    const regionId = node.getAttribute("data-layout-region");
    const row = document.querySelector('[data-region-row="' + regionId + '"]');
    const picture = row === null
      ? null
      : row.querySelector('[data-picture="via-depict"] [data-layout-depiction]');
    const live = glyph(node);
    if (live === null || picture === null) {
      return { regionId, error: "no glyph to compare", live: null, picture: null };
    }
    const drawn = glyph(picture);
    if (drawn === null) {
      return { regionId, error: "the picture drew no glyph", live, picture: null };
    }
    return { regionId, error: null, live, picture: drawn };
  });
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

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixturePath = "/src/__tests__/browser/layout-editor-browser.html";
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
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1500,
    height: 1200,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(
    client,
    "the layout editor fixture",
    "window.__layoutEditorProbe?.ready === true",
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
    if (region.error !== null) {
      violations.push(`${region.regionId}: ${region.error}`);
      continue;
    }
    comparePictures(violations, region);
  }

  const rail = await evaluate(client, RAIL_PROBE);
  if (rail.length === 0) {
    violations.push("the live rail rendered no regions to compare against");
  }
  for (const entry of rail) {
    if (entry.error !== null) {
      violations.push(`${entry.regionId} live rail: ${entry.error}`);
      continue;
    }
    for (const property of ["width", "height", "color"]) {
      if (entry.live[property] !== entry.picture[property]) {
        violations.push(
          `${entry.regionId} rail glyph ${property}: live ${entry.live[property]}, picture ${entry.picture[property]}`,
        );
      }
    }
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
      { violations, stylesheet, miniature, chip },
      null,
      2,
    )}`,
  );
  console.log(
    `layout editor parity regression passed (${String(pictures.length)} regions, ${String(rail.length)} live rail comparisons)`,
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
      if (typeof message.id !== "number") return;
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
