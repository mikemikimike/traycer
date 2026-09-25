// Browser regression: the "sheet join" arcs (the concave corners that stitch
// a joined tab - a side strip's active row/tile/split pair, or the top
// header's active tab - onto its task's sheet) land at the bridge's true
// inner edge, not 1px short of it.
//
// `src/index.css`'s `:has([data-sheet-joined=...]) > [data-sheet-join-bridge=...]`
// rules position each arc's `::before`/`::after` pseudo-element with a plain
// percentage offset. The bridge itself carries a 1px border
// (`border-block`/`border-inline`), and an absolutely positioned pseudo's
// containing block is its host's PADDING box - so an offset of
// `calc(100% - 1px)` (the bug) lands the arc's edge 1 CSS px inside the
// bridge, short of the padding box's true edge; the fix is a plain `100%`.
// jsdom has no anchor positioning, no real border resolution and no pseudo
// geometry, so this renders the real fixture in headless Chrome and reads
// `getComputedStyle(bridge, "::before"/"::after")`'s resolved offsets - which
// Chrome reports as used-value px, not the raw `calc()`/`%` - against the
// bridge's own measured padding box.
//
// Usage: node scripts/sheet-join-geometry-browser.mjs [--port <n>] [--corners]
//   --port <n>  the already-running Vite dev server to connect to for
//               `clients/gui-app` (default 5393). This script does not spawn
//               or manage a dev server of its own - point it at one that is
//               already serving this workspace.
//   --corners   run the corners suite instead (arcs must stay past the
//               joined sheet's own corner radius, plus the desktop-vs-browser
//               header edge-reserve scoping check) - see `runCorners`.
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  findChrome,
  launchChromeWithDevTools,
  terminateProcessTree,
} from "./chrome-launcher.mjs";

// The bug is a full 1px error; this tolerance cleanly separates broken from
// fixed while allowing for legitimate sub-pixel layout rounding across DPRs.
const EPSILON = 0.025;
/** Full preset x theme x DPR cross product. */
const COMBOS = ["traycer-green", "amoled"].flatMap((preset) =>
  ["light", "dark"].flatMap((theme) =>
    [1, 1.5, 2].map((dpr) => ({ preset, theme, dpr })),
  ),
);

/**
 * The join variants to cover. `kind` picks which pair of invariants applies
 * (top: ::before's right / ::after's left, against the bridge's padding-box
 * WIDTH; side: ::before's bottom / ::after's top, against its HEIGHT).
 * `bridge` is both the `[data-sheet-join-bridge=...]` and
 * `[data-sheet-joined=...]` attribute value to match. Every side query
 * carries `header=app&surface=epic` explicitly - without it the joined pane
 * this fixture activates does not exist. Strip/panel collapse state is always
 * set explicitly through the probe (`setCollapsed`/`setPanelCollapsed`)
 * rather than left to a query-param default, for every variant below.
 */
function sideVariants(tabSide, panelSide) {
  const sameSide = panelSide === tabSide;
  const query = `tabs=${tabSide}&sidebar=${panelSide}&header=app&surface=epic`;
  const label = `tabs=${tabSide} sidebar=${panelSide} (${sameSide ? "same" : "far"})`;
  return [
    {
      label: `${label}, strip expanded`,
      query,
      kind: "side",
      bridge: tabSide,
      activate: activateEpsilon,
      extra: (client) => setCollapsed(client, false),
    },
    {
      label: `${label}, strip collapsed`,
      query: `${query}&collapsed=1`,
      kind: "side",
      bridge: tabSide,
      activate: activateEpsilon,
      extra: (client) => setCollapsed(client, true),
    },
    // Same-side panel, collapsed to its rail, crossed with both strip states.
    ...(sameSide
      ? [
          {
            label: `${label}, strip expanded, panel collapsed`,
            query,
            kind: "side",
            bridge: tabSide,
            activate: activateEpsilon,
            extra: async (client) => {
              await setCollapsed(client, false);
              await setPanelCollapsed(client, true);
            },
          },
          {
            label: `${label}, strip collapsed, panel collapsed`,
            query: `${query}&collapsed=1`,
            kind: "side",
            bridge: tabSide,
            activate: activateEpsilon,
            extra: async (client) => {
              await setCollapsed(client, true);
              await setPanelCollapsed(client, true);
            },
          },
        ]
      : []),
    {
      label: `${label}, split pair, strip expanded`,
      query,
      kind: "side",
      bridge: tabSide,
      activate: activateSplit,
      extra: (client) => setCollapsed(client, false),
    },
    {
      label: `${label}, split pair, strip collapsed`,
      query: `${query}&collapsed=1`,
      kind: "side",
      bridge: tabSide,
      activate: activateSplit,
      extra: (client) => setCollapsed(client, true),
    },
  ];
}

const VARIANTS = [
  ...sideVariants("left", "left"),
  ...sideVariants("left", "right"),
  ...sideVariants("right", "left"),
  ...sideVariants("right", "right"),
  {
    label: "top normal",
    query: "tabs=top&header=app&surface=epic",
    kind: "top",
    bridge: "top",
    activate: activateEpsilon,
  },
  {
    label: "top home",
    query: "tabs=top&header=app&surface=epic",
    kind: "top",
    bridge: "top",
    activate: activateHome,
  },
  {
    label: "top split",
    query: "tabs=top&header=app&surface=epic",
    kind: "top",
    bridge: "top",
    activate: activateSplit,
  },
];

/** [corners mode] One representative case per bridge; see `runCorners`. */
const CORNER_VARIANTS = [
  {
    label: "top single",
    query: "tabs=top&header=app&surface=epic",
    bridge: "top",
    activate: activateFirstSingle,
  },
  {
    label: "top split",
    query: "tabs=top&header=app&surface=epic",
    bridge: "top",
    activate: activateFirstSplit,
  },
  {
    label: "top home",
    query: "tabs=top&header=app&surface=epic",
    bridge: "top",
    activate: activateHome,
  },
  {
    label: "left single",
    query: "tabs=left&sidebar=left&header=app&surface=epic",
    bridge: "left",
    activate: activateFirstSingle,
  },
  {
    label: "left split",
    query: "tabs=left&sidebar=left&header=app&surface=epic",
    bridge: "left",
    activate: activateFirstSplit,
  },
  {
    label: "right single",
    query: "tabs=right&sidebar=right&header=app&surface=epic",
    bridge: "right",
    activate: activateFirstSingle,
  },
  {
    label: "right split",
    query: "tabs=right&sidebar=right&header=app&surface=epic",
    bridge: "right",
    activate: activateFirstSplit,
  },
];
const CORNER_DPRS = [1, 1.5, 2];
const DESKTOP_WCO_VALUES = ["mac", "mac-fullscreen", "win"];
const TOKEN_OVERRIDE_CSS =
  ":root { --shell-gap: 10px; --radius-xl: 16px; --radius-lg: 12px; }";

async function activateEpsilon(client) {
  await evaluate(
    client,
    `window.__layoutCanvasProbe.activateEpicTab('fixture-epsilon')`,
  );
}

async function activateSplit(client) {
  await evaluate(
    client,
    `window.__layoutCanvasProbe.activateStripItem('fixture-split')`,
  );
}

async function activateHome(client) {
  // Home is hidden by default in this fixture; a naive geometry check would
  // then find no `[data-sheet-joined]`/`[data-sheet-join-bridge]` pair at
  // all and could silently no-op instead of asserting anything.
  await evaluate(
    client,
    `import('/src/stores/layout/layout-store.ts').then(m => m.useLayoutStore.getState().setRegionValues('homeTab', { shown: 'shown' }))`,
  );
  await evaluate(client, `window.__layoutCanvasProbe.activateStripItem(null)`);
}

async function setHomeShown(client, shown) {
  await evaluate(
    client,
    `import('/src/stores/layout/layout-store.ts').then((m) => m.useLayoutStore.getState().setRegionValues('homeTab', { shown: ${JSON.stringify(shown ? "shown" : "hidden")} }))`,
  );
}

async function moveItemFirst(client, itemId) {
  await evaluate(
    client,
    `import('/src/stores/tabs/store.ts').then((m) => {
      m.useTabsStore.setState((state) => {
        const idx = state.items.findIndex((item) => item.id === ${JSON.stringify(itemId)});
        if (idx <= 0) return {};
        const item = state.items[idx];
        const without = state.items.filter((_entry, i) => i !== idx);
        return { items: [item, ...without], groups: {}, customizations: {} };
      });
    })`,
  );
}

async function activateFirstSingle(client) {
  await setHomeShown(client, false);
  await moveItemFirst(client, "tab:epic:fixture-alpha");
  await evaluate(
    client,
    `window.__layoutCanvasProbe.activateEpicTab('fixture-alpha')`,
  );
}

async function activateFirstSplit(client) {
  await setHomeShown(client, false);
  await moveItemFirst(client, "fixture-split");
  await activateSplit(client);
}

async function setCollapsed(client, collapsed) {
  await evaluate(
    client,
    `window.__layoutCanvasProbe.setCollapsed(${JSON.stringify(collapsed)})`,
  );
}

async function setPanelCollapsed(client, collapsed) {
  await evaluate(
    client,
    `window.__layoutCanvasProbe.setPanelCollapsed(${JSON.stringify(collapsed)})`,
  );
}

async function setThemePreset(client, preset) {
  await evaluate(
    client,
    `import('/src/stores/settings/settings-store.ts').then(m => m.useSettingsStore.getState().setThemePreset(${JSON.stringify(preset)}))`,
  );
}

async function setThemeMode(client, theme) {
  await evaluate(
    client,
    `window.__layoutCanvasProbe.setTheme(${JSON.stringify(theme)})`,
  );
}

const TOKEN_OVERRIDE_STYLE_ID = "sheet-join-corner-token-override";

async function injectStyle(client, css) {
  await evaluate(
    client,
    `{
      const el = document.createElement("style");
      el.id = ${JSON.stringify(TOKEN_OVERRIDE_STYLE_ID)};
      el.textContent = ${JSON.stringify(css)};
      document.head.append(el);
    }`,
  );
}

async function removeInjectedStyle(client) {
  await evaluate(
    client,
    `document.getElementById(${JSON.stringify(TOKEN_OVERRIDE_STYLE_ID)})?.remove()`,
  );
}

// Structural, not class-based: the reserve class is CONDITIONALLY ABSENT on
// desktop (the thing under test), so a class-name selector can never find
// this element there. Walk from the tab-strip scroller up to header's direct
// child, then back one real (non-`aria-hidden`) sibling.
const LEADING_CLUSTER_RECT_EXPRESSION = `(() => {
  const header = document.querySelector('[data-testid="app-header"]');
  const scroller = header?.querySelector('[data-strip-axis="x"]');
  let stripChild = scroller ?? null;
  while (stripChild !== null && stripChild.parentElement !== header) stripChild = stripChild.parentElement;
  if (header === null || stripChild === null) return null;
  let cluster = stripChild.previousElementSibling;
  while (cluster !== null && cluster.hasAttribute("aria-hidden")) cluster = cluster.previousElementSibling;
  if (cluster === null) return null;
  const r = cluster.getBoundingClientRect();
  return { left: r.left, width: r.width };
})()`;

/**
 * Shared by `measureExpression` and `cornerMeasureExpression`: `bridge`/
 * `bridgeBox` must already be in scope. Computes the bridge's own padding
 * box (an absolutely positioned pseudo's containing block) and its
 * `::before`/`::after` computed styles, plus `resolveAxis`, which turns a
 * pseudo's resolved offset(s) (Chrome reports these as used-value px, never
 * the raw `calc()`/`%`, for a positioned pseudo) into that pseudo's actual
 * page-space start/end edge along one axis. Declared before the top-level
 * `try` below (not beside its own builder functions further down) because
 * this script runs top-level `await`s in file order - a `const` declared
 * after `try` would still be in its temporal dead zone when a function
 * invoked from inside `try` first reads it.
 */
const AXIS_HELPERS = `
    const bridgeStyle = getComputedStyle(bridge);
    const borders = {
      top: parseFloat(bridgeStyle.borderTopWidth),
      right: parseFloat(bridgeStyle.borderRightWidth),
      bottom: parseFloat(bridgeStyle.borderBottomWidth),
      left: parseFloat(bridgeStyle.borderLeftWidth),
    };
    const paddingBox = {
      left: bridgeBox.left + borders.left,
      top: bridgeBox.top + borders.top,
      right: bridgeBox.right - borders.right,
      bottom: bridgeBox.bottom - borders.bottom,
    };
    const parseOffset = (raw) => {
      if (raw === "auto") return null;
      const value = parseFloat(raw);
      return Number.isFinite(value) ? value : null;
    };
    const resolveAxis = (startRaw, endRaw, size, cbStart, cbEnd) => {
      const start = parseOffset(startRaw);
      const end = parseOffset(endRaw);
      if (start !== null && end !== null) return { start: cbStart + start, end: cbEnd - end };
      if (start !== null) return { start: cbStart + start, end: cbStart + start + size };
      if (end !== null) return { start: cbEnd - end - size, end: cbEnd - end };
      return { start: cbStart, end: cbStart + size };
    };
    const before = getComputedStyle(bridge, "::before");
    const after = getComputedStyle(bridge, "::after");
`;

/** [corners mode] Which of `[data-shell-sheet]`'s corners each bridge's arcs face. */
const CORNER_RADIUS_PROPS = {
  top: { before: "borderTopLeftRadius", after: "borderTopRightRadius" },
  left: { before: "borderTopLeftRadius", after: "borderBottomLeftRadius" },
  right: { before: "borderTopRightRadius", after: "borderBottomRightRadius" },
};

const CORNERS_MODE = process.argv.includes("--corners");
const portArgIndex = process.argv.indexOf("--port");
const devServerPort =
  portArgIndex === -1 ? 5393 : Number(process.argv[portArgIndex + 1]);
if (!Number.isInteger(devServerPort) || devServerPort <= 0) {
  throw new Error(`--port must be a positive integer, got ${devServerPort}`);
}
const fixturePath = "/src/__tests__/browser/layout-editor-canvas.html";
const chromePath = await findChrome("the sheet join geometry regression");
let chrome;
let chromeProfilePath;
let client;

try {
  const baseUrl = `http://127.0.0.1:${devServerPort}${fixturePath}`;
  await waitForHttp(
    baseUrl,
    `the dev server on port ${devServerPort} (pass --port to point at a different one)`,
  );

  const launched = await launchChromeWithDevTools(
    chromePath,
    "traycer-sheet-join-",
    [],
  );
  chrome = launched.chrome;
  chromeProfilePath = launched.profilePath;
  await waitForHttp(
    new URL("/json/version", launched.devtoolsHttpUrl),
    "Chrome DevTools",
  );
  const targetResponse = await fetch(
    new URL(`/json/new?about:blank`, launched.devtoolsHttpUrl),
    { method: "PUT" },
  );
  if (!targetResponse.ok) {
    throw new Error(`Chrome could not open a page: ${targetResponse.status}`);
  }
  const target = await targetResponse.json();
  if (typeof target.webSocketDebuggerUrl !== "string") {
    throw new Error("Chrome did not return a page debugger URL");
  }
  client = await connectCdp(target.webSocketDebuggerUrl);
  await client.send("Runtime.enable", undefined);
  await client.send("Page.enable", undefined);

  if (CORNERS_MODE) await runCorners(client, baseUrl);
  else await runOffsets(client, baseUrl);
} finally {
  client?.close();
  if (chrome !== undefined) await terminateProcessTree(chrome);
  if (chromeProfilePath !== undefined) {
    await rm(chromeProfilePath, {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
  }
}

/** [offsets mode] The bug this file was written for: arcs 1px short of the bridge's true inner edge. */
async function runOffsets(client, baseUrl) {
  const violations = [];
  let combinations = 0;

  for (const variant of VARIANTS) {
    await openFixture(client, `${baseUrl}?${variant.query}`, variant.label);
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1400,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await variant.activate(client);
    if (variant.extra !== undefined) await variant.extra(client);
    await settle(client);

    const bridgeSelector = `[data-sheet-join-bridge="${variant.bridge}"]`;
    const joinedSelector = `[data-sheet-joined="${variant.bridge}"]`;
    // Every variant, Home included, must find a matching joined element and
    // bridge with real size before geometry is asserted on it - otherwise a
    // variant whose join never rendered would silently contribute zero
    // assertions and read as passing.
    await waitFor(
      client,
      `the ${variant.label} join to render`,
      joinPresenceExpression(bridgeSelector, joinedSelector),
    );

    for (const combo of COMBOS) {
      await setThemePreset(client, combo.preset);
      await setThemeMode(client, combo.theme);
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: 1400,
        height: 860,
        deviceScaleFactor: combo.dpr,
        mobile: false,
      });
      await settle(client);
      combinations += 1;
      const where = `${variant.label} / ${combo.preset} / ${combo.theme} / dpr=${combo.dpr}`;
      const result = await evaluate(
        client,
        measureExpression(bridgeSelector, joinedSelector, variant.kind),
      );
      if (!result.present) {
        violations.push(`${where}: no matching join rendered`);
        continue;
      }
      for (const violation of result.violations) {
        violations.push(`${where}: ${violation}`);
      }
    }
  }

  console.log(
    `${VARIANTS.length} variants x ${COMBOS.length} preset/theme/DPR combos = ${combinations} combinations measured`,
  );
  assert.deepEqual(
    violations,
    [],
    `Sheet join geometry regression failed:\n${violations.join("\n")}`,
  );
  console.log("sheet join geometry regression passed");
}

/**
 * [corners mode] A visible arc's OUTER edge must land past the joined sheet's
 * (`[data-shell-sheet]`, `task-surface-frame`'s child - both top and side
 * bridges anchor to it) own corner radius, never inside it. Re-run with
 * `--shell-gap`/`--radius-xl`/`--radius-lg` enlarged to prove the bound tracks
 * the sheet's actual computed radius, not a hardcoded number. Also checks that
 * the browser-only header edge reserve leaves desktop's leading controls
 * alone, and that a partially clipped active top tab unjoins and rejoins.
 */
async function runCorners(client, baseUrl) {
  const violations = [];
  const measure = (bridgeSelector, joinedSelector, bridge) =>
    evaluate(
      client,
      cornerMeasureExpression(bridgeSelector, joinedSelector, bridge),
    );
  const record = (where, result) => {
    if (!result.present) {
      violations.push(`${where}: no matching join rendered`);
      return;
    }
    for (const violation of result.violations)
      violations.push(`${where}: ${violation}`);
  };

  for (const variant of CORNER_VARIANTS) {
    await openFixture(client, `${baseUrl}?${variant.query}`, variant.label);
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1400,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await variant.activate(client);
    await settle(client);

    const bridgeSelector = `[data-sheet-join-bridge="${variant.bridge}"]`;
    const joinedSelector = `[data-sheet-joined="${variant.bridge}"]`;
    await waitFor(
      client,
      `the ${variant.label} join to render`,
      joinPresenceExpression(bridgeSelector, joinedSelector),
    );

    for (const dpr of CORNER_DPRS) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: 1400,
        height: 860,
        deviceScaleFactor: dpr,
        mobile: false,
      });
      await settle(client);
      record(
        `${variant.label} dpr=${dpr}`,
        await measure(bridgeSelector, joinedSelector, variant.bridge),
      );
    }

    await injectStyle(client, TOKEN_OVERRIDE_CSS);
    for (const dpr of CORNER_DPRS) {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: 1400,
        height: 860,
        deviceScaleFactor: dpr,
        mobile: false,
      });
      await settle(client);
      record(
        `${variant.label} (enlarged tokens) dpr=${dpr}`,
        await measure(bridgeSelector, joinedSelector, variant.bridge),
      );
    }
    await removeInjectedStyle(client);
  }
  console.log(
    `${CORNER_VARIANTS.length} corner variants x 2 (default + enlarged tokens) x ${CORNER_DPRS.length} DPRs measured`,
  );

  for (const wco of DESKTOP_WCO_VALUES) {
    await openFixture(
      client,
      `${baseUrl}?tabs=top&header=app&surface=epic&wco=${wco}`,
      `wco=${wco}`,
    );
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1400,
      height: 860,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await settle(client);
    const before = await evaluate(client, LEADING_CLUSTER_RECT_EXPRESSION);
    if (before === null) {
      violations.push(`wco=${wco}: leading control cluster not found`);
      continue;
    }
    await injectStyle(client, TOKEN_OVERRIDE_CSS);
    await settle(client);
    const after = await evaluate(client, LEADING_CLUSTER_RECT_EXPRESSION);
    await removeInjectedStyle(client);
    if (after === null) {
      violations.push(
        `wco=${wco}: leading control cluster disappeared after the token override`,
      );
      continue;
    }
    if (
      Math.abs(after.left - before.left) > EPSILON ||
      Math.abs(after.width - before.width) > EPSILON
    ) {
      violations.push(
        `wco=${wco}: leading control cluster moved (left ${before.left}->${after.left}, width ${before.width}->${after.width}px) when --shell-gap/--radius-xl/--radius-lg grew - the browser-only edge reserve must not reach desktop`,
      );
    }
  }
  console.log(
    `${DESKTOP_WCO_VALUES.length} desktop wco leading-control checks measured`,
  );

  await runTopClipRejoinCheck(client, baseUrl, violations);
  await runSideEdgeExtremesCheck(client, baseUrl, violations);

  assert.deepEqual(
    violations,
    [],
    `Sheet join corner regression failed:\n${violations.join("\n")}`,
  );
  console.log("sheet join corner regression passed");
}

async function runTopClipRejoinCheck(client, baseUrl, violations) {
  const label = "top overflow/clip";
  await openFixture(
    client,
    `${baseUrl}?tabs=top&header=app&surface=epic`,
    label,
  );
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 900,
    height: 860,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await setHomeShown(client, false);
  await evaluate(
    client,
    `window.__layoutCanvasProbe.activateEpicTab('fixture-alpha')`,
  );
  await settle(client);
  await waitFor(
    client,
    `the ${label} baseline join`,
    joinPresenceExpression(
      '[data-sheet-join-bridge="top"]',
      '[data-sheet-joined="top"]',
    ),
  );

  const scrolled = await evaluate(
    client,
    `(() => {
      const tab = document.querySelector('[data-header-tab-key="epic:fixture-alpha"]');
      const scroller = document.querySelector('[data-strip-axis="x"]');
      if (tab === null || scroller === null) return false;
      const tabRect = tab.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      scroller.scrollLeft += tabRect.left - scrollerRect.left + 10;
      return true;
    })()`,
  );
  if (!scrolled) {
    violations.push(`${label}: tab or scroller not found`);
    return;
  }
  await settle(client);

  const clipped = await evaluate(
    client,
    `(() => {
      const tab = document.querySelector('[data-header-tab-key="epic:fixture-alpha"]');
      const scroller = document.querySelector('[data-strip-axis="x"]');
      const joined = document.querySelector('[data-sheet-joined]');
      const bridge = document.querySelector('[data-sheet-join-bridge]');
      const tabRect = tab?.getBoundingClientRect();
      const scrollerRect = scroller?.getBoundingClientRect();
      return {
        tabLeft: tabRect?.left ?? null,
        tabRight: tabRect?.right ?? null,
        scrollerLeft: scrollerRect?.left ?? null,
        joinedPresent: joined !== null,
        bridgeVisible: bridge !== null && bridge.getBoundingClientRect().width > 0,
      };
    })()`,
  );
  if (
    clipped.tabLeft === null ||
    clipped.scrollerLeft === null ||
    !(
      clipped.tabLeft < clipped.scrollerLeft &&
      clipped.tabRight > clipped.scrollerLeft
    )
  ) {
    violations.push(
      `${label}: tab is not actually straddling the scroller's clip edge after scrolling (tab ${clipped.tabLeft}..${clipped.tabRight}, scroller starts ${clipped.scrollerLeft}) - this doesn't prove a genuine partial clip`,
    );
    return;
  }
  if (clipped.joinedPresent) {
    violations.push(
      `${label}: [data-sheet-joined] still present while the active tab is partially clipped`,
    );
  }
  if (clipped.bridgeVisible) {
    violations.push(
      `${label}: the join bridge is still visible while the active tab is partially clipped`,
    );
  }

  await evaluate(
    client,
    `document.querySelector('[data-header-tab-key="epic:fixture-alpha"]')?.scrollIntoView({ block: "nearest", inline: "nearest" })`,
  );
  await settle(client);
  const rejoined = await evaluate(
    client,
    `(() => {
      const joined = document.querySelector('[data-sheet-joined]');
      const bridge = document.querySelector('[data-sheet-join-bridge]');
      return (
        joined !== null &&
        joined.getBoundingClientRect().width > 0 &&
        bridge !== null &&
        bridge.getBoundingClientRect().width > 0
      );
    })()`,
  );
  if (!rejoined) {
    violations.push(
      `${label}: did not rejoin (joined element and visible bridge) after scrolling the tab back into view`,
    );
  }

  const bridgeSelector = '[data-sheet-join-bridge="top"]';
  const joinedSelector = '[data-sheet-joined="top"]';
  await evaluate(
    client,
    `{ window.__layoutCanvasProbe.activateEpicTab('fixture-zeta'); document.querySelector('[data-strip-axis="x"]').scrollLeft = 99999; }`,
  );
  await settle(client);
  await waitFor(
    client,
    `the ${label} last-tab join`,
    joinPresenceExpression(bridgeSelector, joinedSelector),
  );
  const last = await evaluate(
    client,
    cornerMeasureExpression(bridgeSelector, joinedSelector, "top"),
  );
  if (!last.present)
    violations.push(`${label} last tab: no matching join rendered`);
  for (const v of last.violations) violations.push(`${label} last tab: ${v}`);
}

async function runSideEdgeExtremesCheck(client, baseUrl, violations) {
  for (const edge of ["left", "right"]) {
    const label = `side ${edge} extremes`;
    await openFixture(
      client,
      `${baseUrl}?tabs=${edge}&sidebar=${edge}&header=app&surface=epic`,
      label,
    );
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 900,
      height: 420,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const bridgeSelector = `[data-sheet-join-bridge="${edge}"]`;
    const joinedSelector = `[data-sheet-joined="${edge}"]`;
    const measureRow = () =>
      evaluate(
        client,
        cornerMeasureExpression(bridgeSelector, joinedSelector, edge),
      );
    const recordRow = (row, result) => {
      if (!result.present) {
        violations.push(`${label} ${row}: no matching join rendered`);
        return;
      }
      for (const v of result.violations)
        violations.push(`${label} ${row}: ${v}`);
    };

    await evaluate(
      client,
      `window.__layoutCanvasProbe.activateEpicTab('fixture-alpha')`,
    );
    await settle(client);
    await waitFor(
      client,
      `the ${label} first-row join`,
      joinPresenceExpression(bridgeSelector, joinedSelector),
    );
    recordRow("first", await measureRow());

    await evaluate(
      client,
      `{ window.__layoutCanvasProbe.activateEpicTab('fixture-zeta'); document.querySelector('[data-strip-axis="y"]').scrollTop = 99999; }`,
    );
    await settle(client);
    await waitFor(
      client,
      `the ${label} last-row join`,
      joinPresenceExpression(bridgeSelector, joinedSelector),
    );
    recordRow("last", await measureRow());
  }
}

function joinPresenceExpression(bridgeSelector, joinedSelector) {
  return `(() => {
    const bridge = document.querySelector(${JSON.stringify(bridgeSelector)});
    const joined = document.querySelector(${JSON.stringify(joinedSelector)});
    if (bridge === null || joined === null) return false;
    const bridgeBox = bridge.getBoundingClientRect();
    const joinedBox = joined.getBoundingClientRect();
    return (
      bridgeBox.width > 0 &&
      bridgeBox.height > 0 &&
      joinedBox.width > 0 &&
      joinedBox.height > 0
    );
  })()`;
}

/**
 * [offsets mode] Builds the in-page expression that measures one bridge's arc
 * geometry and returns `{ present, violations }`. Done in-page (real floats,
 * no CDP-side rounding) rather than shipping raw rects over CDP and
 * reimplementing padding-box math in Node. The four invariants compare each
 * pseudo's resolved inner edge against the padding-box edge it should
 * coincide with.
 */
function measureExpression(bridgeSelector, joinedSelector, kind) {
  return `(() => {
    const bridge = document.querySelector(${JSON.stringify(bridgeSelector)});
    const joined = document.querySelector(${JSON.stringify(joinedSelector)});
    if (bridge === null || joined === null) return { present: false, violations: [] };
    const bridgeBox = bridge.getBoundingClientRect();
    const joinedBox = joined.getBoundingClientRect();
    if (
      bridgeBox.width === 0 ||
      bridgeBox.height === 0 ||
      joinedBox.width === 0 ||
      joinedBox.height === 0
    ) {
      return { present: false, violations: [] };
    }
    ${AXIS_HELPERS}
    const EPS = ${EPSILON};
    const violations = [];
    if (${JSON.stringify(kind)} === "top") {
      const beforeAxis = resolveAxis(
        before.left,
        before.right,
        parseFloat(before.width),
        paddingBox.left,
        paddingBox.right,
      );
      const beforeDelta = beforeAxis.end - paddingBox.left;
      if (Math.abs(beforeDelta) > EPS) {
        violations.push(
          "::before's right edge is " + beforeDelta.toFixed(3) + "px off the bridge's inner left edge (bridge.left + borderLeftWidth)",
        );
      }
      const afterAxis = resolveAxis(
        after.left,
        after.right,
        parseFloat(after.width),
        paddingBox.left,
        paddingBox.right,
      );
      const afterDelta = afterAxis.start - paddingBox.right;
      if (Math.abs(afterDelta) > EPS) {
        violations.push(
          "::after's left edge is " + afterDelta.toFixed(3) + "px off the bridge's inner right edge (bridge.right - borderRightWidth)",
        );
      }
    } else {
      const beforeAxis = resolveAxis(
        before.top,
        before.bottom,
        parseFloat(before.height),
        paddingBox.top,
        paddingBox.bottom,
      );
      const beforeDelta = beforeAxis.end - paddingBox.top;
      if (Math.abs(beforeDelta) > EPS) {
        violations.push(
          "::before's bottom edge is " + beforeDelta.toFixed(3) + "px off the bridge's inner top edge (bridge.top + borderTopWidth)",
        );
      }
      const afterAxis = resolveAxis(
        after.top,
        after.bottom,
        parseFloat(after.height),
        paddingBox.top,
        paddingBox.bottom,
      );
      const afterDelta = afterAxis.start - paddingBox.bottom;
      if (Math.abs(afterDelta) > EPS) {
        violations.push(
          "::after's top edge is " + afterDelta.toFixed(3) + "px off the bridge's inner bottom edge (bridge.bottom - borderBottomWidth)",
        );
      }
    }
    return { present: true, violations };
  })()`;
}

/**
 * [corners mode] Builds the in-page expression asserting a bridge's arcs stay
 * past `[data-shell-sheet]`'s own corner radius on the corner they face, never
 * inside it. Both top and side bridges anchor to this one sheet element
 * (`--task-frame`). Reuses `AXIS_HELPERS`' padding-box axis math, but reads
 * each pseudo's OUTER edge (the end away from the bridge) instead of its
 * inner one, and compares it to the sheet's rect + that corner's radius
 * instead of the bridge's own padding box.
 */
function cornerMeasureExpression(bridgeSelector, joinedSelector, bridgeSide) {
  const corners = CORNER_RADIUS_PROPS[bridgeSide];
  return `(() => {
    const bridge = document.querySelector(${JSON.stringify(bridgeSelector)});
    const joined = document.querySelector(${JSON.stringify(joinedSelector)});
    const sheet = document.querySelector('[data-shell-sheet]');
    if (bridge === null || joined === null || sheet === null) return { present: false, violations: [] };
    const bridgeBox = bridge.getBoundingClientRect();
    const joinedBox = joined.getBoundingClientRect();
    const sheetBox = sheet.getBoundingClientRect();
    if (
      bridgeBox.width === 0 ||
      bridgeBox.height === 0 ||
      joinedBox.width === 0 ||
      joinedBox.height === 0 ||
      sheetBox.width === 0 ||
      sheetBox.height === 0
    ) {
      return { present: false, violations: [] };
    }
    ${AXIS_HELPERS}
    const sheetStyle = getComputedStyle(sheet);
    const beforeRadius = parseFloat(sheetStyle.${corners.before});
    const afterRadius = parseFloat(sheetStyle.${corners.after});
    const EPS = ${EPSILON};
    const violations = [];
    if (${JSON.stringify(bridgeSide)} === "top") {
      const beforeAxis = resolveAxis(before.left, before.right, parseFloat(before.width), paddingBox.left, paddingBox.right);
      const beforeMin = sheetBox.left + beforeRadius;
      if (beforeAxis.start < beforeMin - EPS) {
        violations.push(
          "left arc's outer edge is " + (beforeMin - beforeAxis.start).toFixed(3) + "px inside the sheet's top-left corner radius",
        );
      }
      const afterAxis = resolveAxis(after.left, after.right, parseFloat(after.width), paddingBox.left, paddingBox.right);
      const afterMax = sheetBox.right - afterRadius;
      if (afterAxis.end > afterMax + EPS) {
        violations.push(
          "right arc's outer edge is " + (afterAxis.end - afterMax).toFixed(3) + "px inside the sheet's top-right corner radius",
        );
      }
    } else {
      const beforeAxis = resolveAxis(before.top, before.bottom, parseFloat(before.height), paddingBox.top, paddingBox.bottom);
      const beforeMin = sheetBox.top + beforeRadius;
      if (beforeAxis.start < beforeMin - EPS) {
        violations.push(
          "top arc's outer edge is " + (beforeMin - beforeAxis.start).toFixed(3) + "px inside the sheet's " + ${JSON.stringify(bridgeSide)} + "-top corner radius",
        );
      }
      const afterAxis = resolveAxis(after.top, after.bottom, parseFloat(after.height), paddingBox.top, paddingBox.bottom);
      const afterMax = sheetBox.bottom - afterRadius;
      if (afterAxis.end > afterMax + EPS) {
        violations.push(
          "bottom arc's outer edge is " + (afterAxis.end - afterMax).toFixed(3) + "px inside the sheet's " + ${JSON.stringify(bridgeSide)} + "-bottom corner radius",
        );
      }
    }
    return { present: true, violations };
  })()`;
}

function settle(targetClient) {
  return evaluate(
    targetClient,
    `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))`,
  );
}

/**
 * Navigates and returns once the NEW document is the one being evaluated. The
 * old document carries a marker the new one cannot have, and a context
 * destroyed by the navigation is retried.
 */
async function navigate(targetClient, url) {
  try {
    await evaluate(targetClient, "window.__sheetJoinStaleDocument = true");
  } catch (error) {
    if (!isNavigationContextError(error)) throw error;
  }
  await targetClient.send("Page.navigate", { url });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate(
        targetClient,
        `window.__sheetJoinStaleDocument !== true && document.readyState === "complete"`,
      );
      if (ready) return;
    } catch (error) {
      if (!isNavigationContextError(error)) throw error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for the navigation to ${url}`);
}

function isNavigationContextError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /context was destroyed|Cannot find context|Inspected target navigated/i.test(
    message,
  );
}

/**
 * Navigates and waits for the fixture probe to be ready, with one bounded
 * retry for a known cold-boot flake (module graph never ran: `#root` still
 * empty, no Vite error overlay, at the readiness deadline) - same policy as
 * `scripts/layout-editor-browser.mjs`'s `openVariant`/`stalledBoot`. Never
 * retries anything past this readiness wait (join presence, geometry).
 */
async function openFixture(client, url, label) {
  const ready = `window.__layoutCanvasProbe?.ready === true`;
  await navigate(client, url);
  try {
    await waitFor(client, `the ${label} fixture probe`, ready);
  } catch (error) {
    if (!(error instanceof Error) || !isColdBootFlake(error.message))
      throw error;
    console.error(
      `\n  WARNING ${label}: cold-boot flake (#root empty, no overlay); navigating once more.\n`,
    );
    await navigate(client, url);
    await waitFor(client, `the ${label} fixture probe`, ready);
  }
}

function isColdBootFlake(message) {
  return (
    message.startsWith("Timed out waiting for") &&
    message.includes('<div id=\\"root\\"></div>') &&
    message.includes('"viteError": ""')
  );
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${label} answered with ${response.status}`);
    } catch (error) {
      // The dev server has not opened its port yet, or isn't running.
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(
    `Timed out waiting for ${label} at ${url}:\n${lastError?.message ?? "no response"}`,
  );
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
  const deadline = Date.now() + 20_000;
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
