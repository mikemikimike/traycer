// SETTINGS ▸ LAYOUT, IN REAL CHROME (G6, G7).
//
// Run it from `clients/gui-app`:
//
//     node scripts/layout-settings-browser.mjs [--out DIR]
//
// It serves `src/__tests__/browser/layout-editor-canvas.html?settings=1`,
// which mounts the REAL Settings ▸ Layout panel beside the live app column
// (the real header with its tab strip and readings, the sample workspace's
// rail, transcript, dock and composer, and the real status bar), and checks
// four things jsdom cannot decide:
//
//   1. Tabs: the bar is pinned to the top of the pane while the pane scrolls,
//      and each tab shows its own group and no other.
//   2. Disclosures: every row that draws a chevron opens something with
//      content, and every row that opens nothing draws no chevron.
//   3. Every setting does something: each option of each segmented control,
//      each switch, each checkbox and each ordered list is operated in turn,
//      from the shipped layout, and the app column (never the panel) must
//      render differently afterwards. A setting nothing reads is exactly a
//      setting whose operation leaves the product unchanged.
//   4. G7: the resource monitor and the agent rows' readings are two
//      switches, and each changes only its own surface.
//
// `--out DIR` writes a screenshot per tab and per G7 step into DIR.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
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

const VIEWPORT = { width: 1920, height: 1080 };
const FIXTURE_PATH = "/src/__tests__/browser/layout-editor-canvas.html";
// Readings in the tab strip, so the Usage limits and Resource monitor
// settings are read there (G6), and signed in, so they have data.
const VARIANTS = [
  {
    key: "sample",
    query:
      "settings=1&surface=sample&header=app&readings=both&account=1&hosts=1",
  },
  {
    key: "epic",
    query: "settings=1&surface=epic&header=app&readings=both&account=1&hosts=1",
  },
];
const TABS = [
  { label: "Presets", testIds: ["layout-presets-group", "layout-reset-group"] },
  { label: "Tabs", testIds: ["layout-surface-topBar"] },
  { label: "Sidebar", testIds: ["layout-surface-sidebar"] },
  { label: "Chat", testIds: ["layout-surface-chat"] },
  { label: "Composer", testIds: ["layout-surface-composer"] },
  { label: "Status bar", testIds: ["layout-surface-statusBar"] },
];
/**
 * Controls that only take effect once another is on, and the switch that
 * turns it on first - the setup a person would do, named by its label.
 */
const PREREQUISITES = [
  {
    control: /^contextUsage (check |Compact button)/,
    first: "contextUsage Pin the breakdown",
  },
];
/**
 * Setups that reveal or enable controls the shipped layout does not offer:
 * the side strip's View, and a provider's window checkboxes under Choose.
 * Each setup is operated first, and every control it reveals is then swept
 * from that state, one at a time, exactly as the base controls are.
 */
const SETUPS = [
  { tab: "Tabs", steps: ["- Tabs position: Left"] },
  { tab: "Status bar", steps: ["codex Limits: Choose..."] },
  { tab: "Status bar", steps: ["claude-code Limits: Choose..."] },
];
/**
 * Operations that change a setting and, by design, nothing on screen, each
 * with the ruling that says so. Anything else that changes nothing fails.
 */
const EXPECTED_SILENT = [
  {
    control: /: Choose/,
    why: "Choose seeds its picks with what Automatic draws, so the picture does not move until a pick changes",
  },
  {
    control: /Limits: Automatic/,
    why: "back from Choose..., whose picks were seeded with the window Automatic draws, so the picture is the same",
  },
  {
    control:
      /^(openrouter|kilocode|grok|huggingface|opencode|cursor) .* display: Hidden$/,
    why: "the fixture signs in Codex and Claude Code only, so this provider draws no reading to hide",
  },
  {
    control: /^(railPullRequests|railComments) /,
    why: "their Auto rule finds no pull requests or comments in the fixture, so the panel is not drawn either way",
  },
];

const PANEL = `document.querySelector('[data-fixture-settings-pane] [role="tabpanel"]:not([hidden])')`;

/**
 * Every operable control in the visible tab, keyed by what a person would
 * call it - the row it sits in, its group's name and its own - so the key
 * survives a reset re-rendering the tab and a prerequisite adding rows above
 * it. The unchecked options of each radio group, each switch, each checkbox,
 * each stack link, and the first movable row of each ordered list (moved
 * down one).
 */
const CONTROLS = `(() => {
  const panel = ${PANEL};
  const rowOf = (node) => node.closest('[data-sortable-id]')?.getAttribute('data-sortable-id') ?? '-';
  const nameOf = (node) => (node.getAttribute('aria-label') ?? node.closest('label')?.textContent ?? node.textContent).trim();
  const out = [];
  for (const group of panel.querySelectorAll('[role="radiogroup"]')) {
    for (const option of group.querySelectorAll('[role="radio"]')) {
      if (option.getAttribute('aria-checked') === 'true') continue;
      out.push({ key: rowOf(group) + ' ' + group.getAttribute('aria-label') + ': ' + nameOf(option), node: option });
    }
  }
  for (const node of panel.querySelectorAll('[role="switch"]')) {
    out.push({ key: rowOf(node) + ' ' + nameOf(node), node });
  }
  for (const node of panel.querySelectorAll('[role="checkbox"]')) {
    const text = node.closest('label')?.textContent ?? document.querySelector('label[for="' + node.id + '"]')?.textContent ?? '';
    out.push({ key: rowOf(node) + ' check ' + text.trim(), node });
  }
  for (const node of panel.querySelectorAll('[data-stack-slot] button')) {
    out.push({ key: rowOf(node) + ' ' + nameOf(node), node });
  }
  // The first movable row of each list moved down one, and the second moved up
  // one: the two drawn rows trade places whatever the list's length, and one
  // of them can meet a boundary the list refuses without hiding the setting.
  for (const list of panel.querySelectorAll('[role="group"][aria-label]')) {
    const rows = [...list.querySelectorAll('[data-sortable-id]')].filter(
      (candidate) => candidate.closest('[role="group"]') === list && candidate.querySelector(':scope > [data-row-line] [data-row-grip]') !== null,
    );
    rows.slice(0, 2).forEach((row, index) => {
      out.push({ key: 'order ' + list.getAttribute('aria-label') + ': ' + row.getAttribute('data-sortable-id') + (index === 0 ? ' down' : ' up'), node: row.querySelector(':scope > [data-row-line] [role="button"]'), order: index === 0 ? 'ArrowDown' : 'ArrowUp' });
    });
  }
  return out.filter((entry) => entry.node !== null && !entry.node.disabled && !entry.node.hasAttribute('data-disabled') && entry.node.closest('[inert]') === null);
})()`;

const STORED = "JSON.stringify(window.__layoutCanvasProbe.snapshot())";

/**
 * The header's geometry: every visible control outside it, the tab strip's
 * width, and each reading shown whole or cut - cut meaning outside its line,
 * or overflowing its own box or a descendant's.
 */
const HEADER_FIT_PROBE = `(() => {
  const header = document.querySelector('[data-testid="app-header"]');
  if (header === null) return null;
  const h = header.getBoundingClientRect();
  const visible = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const label = (node) => (node.getAttribute('aria-label') ?? node.getAttribute('data-testid') ?? node.textContent).trim().slice(0, 60);
  // The tab strip scrolls its own tabs, so it is judged by its own box and
  // the tabs inside it are not.
  const outside = [...header.querySelectorAll('button, [role="tablist"]')]
    .filter((node) => node.matches('[role="tablist"]') || node.closest('[role="tablist"]') === null)
    .filter(visible)
    .filter((node) => { const r = node.getBoundingClientRect(); return r.right > h.right + 0.5 || r.left < h.left - 0.5; })
    .map(label);
  const tablist = header.querySelector('[role="tablist"]');
  // A box drawn narrower than its content: the reading or any laid-out
  // descendant (an inline box has no clientWidth to compare).
  const overflows = (node) => [node, ...node.querySelectorAll('*')].some(
    (part) => part.clientWidth > 0 && getComputedStyle(part).display !== 'inline' && part.scrollWidth > part.clientWidth + 0.5,
  );
  const cut = [];
  const shown = [];
  for (const reading of header.querySelectorAll('[data-testid^="status-bar-provider-segment-"], [data-testid^="status-bar-resource-metric-"]')) {
    if (!visible(reading)) continue;
    const line = reading.parentElement.getBoundingClientRect();
    const r = reading.getBoundingClientRect();
    const inside = r.left >= line.left - 0.5 && r.right <= line.right + 0.5 && r.top >= line.top - 0.5 && r.bottom <= line.bottom + 0.5;
    const outsideLine = r.top >= line.bottom - 0.5 || r.right <= line.left + 0.5 || r.left >= line.right - 0.5;
    if (outsideLine) continue;
    if (!inside || overflows(reading)) cut.push(reading.textContent.trim());
    else shown.push(reading.textContent.trim());
  }
  // Text a control draws cut to an ellipsis. The tab strip's own tab titles
  // are exempt: a tab shortens its title by design, like any browser's.
  const ellipsized = [...header.querySelectorAll('*')]
    .filter((node) => node.closest('[role="tablist"]') === null && visible(node))
    .filter((node) => getComputedStyle(node).textOverflow === 'ellipsis' && node.scrollWidth > node.clientWidth + 0.5)
    .map((node) => node.textContent.trim().slice(0, 60));
  return { header: Math.round(h.width), tabs: tablist === null ? null : Math.round(tablist.getBoundingClientRect().width), outside, cut, shown, ellipsized };
})()`;

/**
 * `LAYOUT_SETTINGS_ONLY=header,tabswitch,choose,sweep,g7` runs only the named
 * checks - for a mutation run, where the full sweep is minutes of waiting on a
 * check that is not the one being proved.
 */
const ONLY = process.env.LAYOUT_SETTINGS_ONLY?.split(",") ?? null;
const runs = (check) => ONLY === null || ONLY.includes(check);

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = outIndex === -1 ? null : path.resolve(args[outIndex + 1]);

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const chromePath = await findChrome("the Settings ▸ Layout regression");
const vitePort = await freePort();
let chrome;
let chromeProfilePath;
let client;
let viteProcess;
const failures = [];
/** Uncaught exceptions and error-level log entries, for a page that never renders. */
const pageExceptions = [];

try {
  if (outDir !== null) await mkdir(outDir, { recursive: true });
  const origin = `http://127.0.0.1:${vitePort}`;
  viteProcess = spawnVite(vitePort);
  let viteError = "";
  viteProcess.stderr.setEncoding("utf8");
  viteProcess.stderr.on("data", (chunk) => {
    viteError += chunk;
  });
  await waitForHttp(
    `${origin}${FIXTURE_PATH}`,
    viteProcess,
    () => viteError,
    "Vite",
  );

  const launched = await launchChromeWithDevTools(
    chromePath,
    "traycer-layout-settings-",
    [],
  );
  chrome = launched.chrome;
  chromeProfilePath = launched.profilePath;
  const devtoolsUrl = launched.devtoolsHttpUrl;
  await waitForHttp(
    new URL("/json/version", devtoolsUrl).href,
    chrome,
    launched.readError,
    "Chrome DevTools",
  );
  const targetResponse = await fetch(
    new URL("/json/new?about:blank", devtoolsUrl),
    {
      method: "PUT",
    },
  );
  const target = await targetResponse.json();
  client = await connectCdp(target.webSocketDebuggerUrl);
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Log.enable");
  // No HMR: the tree is shared with other agents, and their edits would
  // reload the page under the sweep. The page keeps what it loaded.
  await client.send("Network.enable");
  await client.send("Network.setBlockedURLs", {
    urls: [`ws://127.0.0.1:${vitePort}/*`],
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    ...VIEWPORT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Which operations changed the app, across both windows: a sidebar-side
  // pick changes the task window and not the sample one, and a setting passes
  // when it changes the product ANYWHERE.
  const effects = new Map();
  for (const variant of VARIANTS) {
    await loadFixture(client, `${origin}${FIXTURE_PATH}?${variant.query}`);
    await settle(client);
    await checkErrors(client, variant.key);
    if (variant.key === "sample") {
      if (runs("tabs")) {
        await checkTabs(client);
        await checkDisclosures(client);
      }
      if (runs("choose")) await checkChooseSeedsSelection(client);
      if (runs("tabswitch")) await checkTabSwitchScroll(client);
      if (runs("header")) await checkHeaderFit(client);
    }
    if (runs("sweep")) {
      for (const [name, changed, stored] of await operateEverySetting(client)) {
        const seen = effects.get(name) ?? { changed: false, stored: false };
        effects.set(name, {
          changed: seen.changed || changed,
          stored: seen.stored || stored,
        });
      }
    }
    if (variant.key === "epic" && runs("g7")) await checkAgentRows(client);
    await checkErrors(client, variant.key);
  }

  const silent = [...effects].filter(([, effect]) => !effect.changed);
  console.log(
    `settings operated: ${effects.size}, changed the app: ${effects.size - silent.length}`,
  );
  for (const [name, effect] of silent) {
    // Matched against the operated control alone, never a setup step before it.
    const expected = EXPECTED_SILENT.find((entry) =>
      entry.control.test(name.split(" ▸ ").at(-1)),
    );
    if (expected !== undefined) {
      console.log(`  silent by design: ${name} (${expected.why})`);
    } else {
      failures.push(
        `no visible effect: ${name}${effect.stored ? "" : " (and nothing was stored)"}`,
      );
    }
  }
  if (runs("sweep"))
    assert.ok(
      effects.size > 60,
      `only ${effects.size} settings were found to operate`,
    );

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} failure(s):\n- ${failures.join("\n- ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log("layout settings browser regression: OK");
  }
} finally {
  client?.close();
  viteProcess?.kill("SIGTERM");
  if (chrome !== undefined) {
    try {
      await terminateProcessTree(chrome);
    } catch (error) {
      console.error("Chrome termination failed:", error);
      process.exitCode = 1;
    }
  }
  if (chromeProfilePath !== undefined) {
    await rm(chromeProfilePath, {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
  }
}

/**
 * Loads the fixture, reloading when Vite's dependency optimizer re-ran under
 * the load (a 504 "Outdated Optimize Dep"): another driver's `--force` server
 * rewrites the shared cache, and the page it half-loaded never recovers.
 */
async function loadFixture(client, url) {
  for (let attempt = 1; ; attempt += 1) {
    pageExceptions.length = 0;
    await navigate(client, url);
    try {
      await waitFor(
        client,
        "the fixture probe",
        "window.__layoutCanvasProbe?.ready === true && document.querySelector('[data-fixture-settings-pane] [role=tablist]') !== null",
      );
      return;
    } catch (error) {
      const outdated = pageExceptions.some((text) =>
        text.includes("Outdated Optimize Dep"),
      );
      if (!outdated || attempt === 3) throw error;
      console.log(
        `reloading: Vite re-optimized its dependencies (attempt ${attempt})`,
      );
    }
  }
}

// --- checks -----------------------------------------------------------------

/** Each tab shows its own group and no other, under a bar pinned to the pane. */
async function checkTabs(client) {
  const allIds = TABS.flatMap((tab) => tab.testIds);
  for (const tab of TABS) {
    await clickTab(client, tab.label);
    const shown = await evaluate(
      client,
      `${JSON.stringify(allIds)}.filter((id) => {
         const node = document.querySelector('[data-fixture-settings-pane] [data-testid="' + id + '"]');
         return node !== null && node.getClientRects().length > 0;
       })`,
    );
    const expected = [...tab.testIds].sort();
    if (JSON.stringify([...shown].sort()) !== JSON.stringify(expected)) {
      failures.push(
        `tab ${tab.label} shows ${JSON.stringify(shown)}, expected ${JSON.stringify(expected)}`,
      );
    }
    await screenshotPane(client, `tab-${slug(tab.label)}`);
  }
  // Pinned: scrolled to the bottom of the longest tab, the bar's top is the
  // pane's top.
  await clickTab(client, "Status bar");
  await openAllDisclosures(client);
  const pinned = await evaluate(
    client,
    `(() => {
       const pane = document.querySelector('[data-fixture-settings-pane]');
       pane.scrollTop = pane.scrollHeight;
       const band = pane.querySelector('[data-testid="layout-tab-band"]');
       return {
         scrolled: pane.scrollTop,
         delta: Math.abs(band.getBoundingClientRect().top - pane.getBoundingClientRect().top),
       };
     })()`,
  );
  await settle(client);
  if (pinned.scrolled === 0 || pinned.delta > 1) {
    failures.push(`tab bar not pinned: ${JSON.stringify(pinned)}`);
  }
  await screenshotPane(client, "tab-bar-pinned");
  // A tab switch from a scrolled pane starts the new tab at its top.
  await clickTab(client, "Chat");
  const top = await evaluate(
    client,
    `(() => {
       const pane = document.querySelector('[data-fixture-settings-pane]');
       const band = pane.querySelector('[data-testid="layout-tab-band"]');
       const panel = pane.querySelector('[role="tabpanel"]:not([hidden])');
       return panel.getBoundingClientRect().top - band.getBoundingClientRect().bottom;
     })()`,
  );
  if (top < 0) failures.push(`Chat opened scrolled into its body (${top}px)`);
  await evaluate(
    client,
    `document.querySelector('[data-fixture-settings-pane]').scrollTop = 0`,
  );
}

/**
 * Every chevron opens something with content; a row that opens nothing has
 * no chevron (the G6 empty collapsibles).
 */
async function checkDisclosures(client) {
  for (const tab of TABS.slice(1)) {
    await clickTab(client, tab.label);
    const rows = await evaluate(
      client,
      `[...document.querySelectorAll('[data-fixture-settings-pane] [role="tabpanel"]:not([hidden]) [data-sortable-id]')].map((row) => ({
         id: row.getAttribute('data-sortable-id'),
         discloses: row.querySelector(':scope > [data-row-line] [aria-expanded]') !== null,
       }))`,
    );
    for (const row of rows) {
      if (!row.discloses) continue;
      const detail = await evaluate(
        client,
        `(async () => {
           const row = document.querySelector('[data-fixture-settings-pane] [data-sortable-id="${row.id}"]');
           const grab = row.querySelector(':scope > [data-row-line] [aria-expanded]');
           if (grab.getAttribute('aria-expanded') !== 'true') grab.click();
           await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
           const detail = row.querySelector(':scope > [data-sortable-detail]');
           const text = detail === null ? '' : detail.innerText.trim();
           grab.click();
           return text;
         })()`,
      );
      if (detail.length === 0) {
        failures.push(
          `${tab.label}: row ${row.id} has a chevron that opens nothing`,
        );
      }
    }
    console.log(
      `${tab.label}: ${rows.filter((row) => row.discloses).length} of ${rows.length} rows disclose`,
    );
  }
}

/**
 * Operates every control on every tab, one at a time from the shipped layout,
 * and reports for each whether the app column rendered differently after it.
 */
async function operateEverySetting(client) {
  const results = [];
  const plans = [];
  for (const tab of TABS) {
    await resetTo(client, tab.label, []);
    for (const control of await listControls(client))
      plans.push({ tab: tab.label, steps: [], control });
  }
  for (const setup of SETUPS) {
    await resetTo(client, setup.tab, []);
    const base = new Set(await listControls(client));
    await resetTo(client, setup.tab, setup.steps);
    const revealed = (await listControls(client)).filter(
      (control) => !base.has(control),
    );
    if (revealed.length === 0)
      failures.push(`setup ${setup.steps.join(" + ")} revealed no control`);
    for (const control of revealed)
      plans.push({ tab: setup.tab, steps: setup.steps, control });
  }
  for (const plan of plans) {
    await resetTo(client, plan.tab, plan.steps);
    const prerequisite = PREREQUISITES.find((entry) =>
      entry.control.test(plan.control),
    );
    if (prerequisite !== undefined)
      await operateAndWait(client, prerequisite.first);
    const before = await stableSignature(client);
    const operated = await operateAndWait(client, plan.control);
    const name = `${plan.tab} ▸ ${[...plan.steps, plan.control].join(" ▸ ")}`;
    if (operated === null) {
      failures.push(`planned control could not be operated: ${name}`);
      continue;
    }
    const after = await stableSignature(client);
    results.push([name, before !== after, operated]);
  }
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
  await settle(client);
  return results;
}

/** Back to the shipped layout on `tab`, every row open, then `steps` operated. */
async function resetTo(client, tabLabel, steps) {
  if (!(await evaluate(client, "window.__layoutCanvasProbe !== undefined"))) {
    throw new Error(`the fixture unloaded before ${tabLabel}`);
  }
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
  await settle(client);
  await clickTab(client, tabLabel);
  await openAllDisclosures(client);
  for (const step of steps) {
    if ((await operateAndWait(client, step)) === null)
      failures.push(`setup step could not be operated: ${step}`);
    await openAllDisclosures(client);
  }
}

/**
 * Operates `name` and waits for what it writes to land: the stored layout
 * changing, then the page holding still. Answers whether anything was stored,
 * or `null` when the control is not on the page.
 */
async function operateAndWait(client, name) {
  const storedBefore = await evaluate(client, STORED);
  if (!(await operate(client, name))) return null;
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if ((await evaluate(client, STORED)) !== storedBefore) break;
    await settle(client);
  }
  await stableSignature(client);
  return (await evaluate(client, STORED)) !== storedBefore;
}

/**
 * Choose... starts from what Automatic draws: for each provider the fixture
 * signs in, the stored picks are exactly the window its reading drew.
 */
async function checkChooseSeedsSelection(client) {
  for (const providerId of ["codex", "claude-code"]) {
    await resetTo(client, "Status bar", []);
    const drawn = await evaluate(
      client,
      `[...document.querySelectorAll('[data-testid="status-bar-provider-segment-${providerId}"] [data-window-key]')]
         .filter((node) => node.closest('[data-fixture-settings-pane]') === null)
         .map((node) => node.getAttribute('data-window-key'))`,
    );
    if (drawn.length === 0) {
      failures.push(`Choose: ${providerId} draws no window to seed from`);
      continue;
    }
    if (
      (await operateAndWait(client, `${providerId} Limits: Choose...`)) === null
    ) {
      failures.push(`Choose: ${providerId} has no Choose... option`);
      continue;
    }
    const stored = await evaluate(
      client,
      `window.__layoutCanvasProbe.snapshot().arrangement.providerLimits[${JSON.stringify(providerId)}]?.limitKeys ?? null`,
    );
    if (JSON.stringify(stored) !== JSON.stringify([drawn[0]])) {
      failures.push(
        `Choose: ${providerId} stored ${JSON.stringify(stored)}, expected the drawn ${JSON.stringify([drawn[0]])}`,
      );
    }
  }
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
}

/**
 * A new tab starts at its top even when the one left was scrolled far down:
 * at a short window, Status bar scrolled to its end, then Sidebar, whose
 * body must begin right under the pinned tab bar.
 */
async function checkTabSwitchScroll(client) {
  await setViewport(client, { width: 1200, height: 700 });
  await resetTo(client, "Status bar", []);
  await evaluate(
    client,
    `(() => { const pane = document.querySelector('[data-fixture-settings-pane]'); pane.scrollTop = pane.scrollHeight; })()`,
  );
  await settle(client);
  await clickTab(client, "Sidebar");
  await settle(client);
  const m = await evaluate(
    client,
    `(() => {
       const pane = document.querySelector('[data-fixture-settings-pane]');
       const band = pane.querySelector('[data-testid="layout-tab-band"]');
       const panel = pane.querySelector('[role="tabpanel"]:not([hidden])');
       return {
         overflows: pane.scrollHeight > pane.clientHeight + 1,
         scrollTop: pane.scrollTop,
         gap: panel.getBoundingClientRect().top - band.getBoundingClientRect().bottom,
       };
     })()`,
  );
  if (!m.overflows)
    failures.push(
      `tab switch: Sidebar does not overflow at 1200x700, so the case proves nothing`,
    );
  if (Math.abs(m.gap) > 1)
    failures.push(
      `tab switch: Sidebar's body starts ${m.gap.toFixed(1)}px from the tab bar (scrollTop ${m.scrollTop})`,
    );
  await screenshotPane(client, "tab-switch-short-window");
  await setViewport(client, VIEWPORT);
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
}

/**
 * Header readings take a bounded share of the header and never push its
 * controls out: a 900px app column, both readings in the header, and Codex
 * and Claude Code each drawing both their windows. The tabs and every header
 * control stay inside the header, the tabs keep real room, and no reading or
 * label is drawn cut.
 */
async function checkHeaderFit(client) {
  // Both readings where the fixture puts them (usage left, resources right),
  // then both on the right, where they share the cluster beside the header's
  // own controls.
  for (const [label, sides] of [
    ["split", []],
    ["both right", ["usageLimits Usage limits side: Right"]],
  ]) {
    // The settings pane is 36rem, so this leaves the app column 900px wide.
    await setViewport(client, { width: 1476, height: 900 });
    await resetTo(client, "Status bar", [
      ...sides,
      "codex Limits: Choose...",
      "claude-code Limits: Choose...",
    ]);
    // One box a pass: a click re-renders the row it sits in.
    for (let pass = 0; pass < 8; pass += 1) {
      const clicked = await evaluate(
        client,
        `(() => {
           for (const id of ["codex", "claude-code"]) {
             const row = document.querySelector('[data-fixture-settings-pane] [data-sortable-id="' + id + '"]');
             const box = row?.querySelector('[role="checkbox"][aria-checked="false"]');
             if (box) { box.click(); return true; }
           }
           return false;
         })()`,
      );
      if (!clicked) break;
      await settle(client);
    }
    await stableSignature(client);
    const windows = await evaluate(
      client,
      `Object.values(window.__layoutCanvasProbe.snapshot().arrangement.providerLimits).reduce((sum, entry) => sum + entry.limitKeys.length, 0)`,
    );
    if (windows < 4)
      failures.push(`header fit (${label}): only ${windows} windows selected`);
    const m = await evaluate(client, HEADER_FIT_PROBE);
    if (m === null) {
      failures.push(`header fit (${label}): no app header`);
    } else {
      for (const node of m.outside)
        failures.push(`header fit (${label}): ${node} leaves the header`);
      if (m.tabs === null || m.tabs < m.header * 0.25) {
        failures.push(
          `header fit (${label}): the tab strip keeps ${m.tabs}px of a ${m.header}px header`,
        );
      }
      for (const reading of m.cut)
        failures.push(`header fit (${label}): a reading is cut: ${reading}`);
      for (const text of m.ellipsized)
        failures.push(
          `header fit (${label}): a control draws ellipsized text: ${text}`,
        );
      console.log(
        `header fit (${label}): tabs ${m.tabs}px of ${m.header}px; readings shown ${JSON.stringify(m.shown)}`,
      );
    }
    await screenshotPage(client, `header-fit-900-${slug(label)}`);
  }
  await setViewport(client, VIEWPORT);
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
}

async function setViewport(client, size) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    ...size,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await settle(client);
}

/**
 * G7: the monitor's Shown drives the tab strip's resource reading and nothing
 * else; "Readings on agent rows" drives the agent row's chip and nothing else.
 */
async function checkAgentRows(client) {
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
  await clickTab(client, "Status bar");
  await openAllDisclosures(client);
  await settle(client);
  const read = () =>
    evaluate(
      client,
      `({
         row: document.querySelector('[data-fixture-agent-row]')?.innerText.replace(/\\s+/g, ' ').trim() ?? null,
         monitor: [...document.querySelectorAll('[data-layout-region="resourceMonitor"]')].some(
           (node) => node.closest('[data-fixture-settings-pane]') === null && [node, ...node.children].some((part) => part.getClientRects().length > 0),
         ),
       })`,
    );
  const start = await read();
  if (start.row === null || !/472/.test(start.row)) {
    failures.push(
      `G7: agent row has no reading at rest: ${JSON.stringify(start)}`,
    );
  }
  if (!start.monitor)
    failures.push(`G7: no resource monitor at rest: ${JSON.stringify(start)}`);
  await screenshotPage(client, "g7-1-both-on");

  await mustOperate(client, "resourceMonitor Resource monitor display: Hidden");
  await settle(client);
  const monitorOff = await read();
  if (monitorOff.monitor)
    failures.push("G7: hiding the monitor left it in the tab strip");
  if (monitorOff.row !== start.row) {
    failures.push(
      `G7: hiding the monitor changed the agent row: ${JSON.stringify(monitorOff)}`,
    );
  }
  await screenshotPage(client, "g7-2-monitor-off-rows-on");

  await mustOperate(client, "resourceMonitor Readings on agent rows");
  await settle(client);
  const bothOff = await read();
  if (bothOff.row === null || /472/.test(bothOff.row)) {
    failures.push(
      `G7: the agent rows switch did not remove the row reading: ${JSON.stringify(bothOff)}`,
    );
  }
  await screenshotPage(client, "g7-3-both-off");

  await mustOperate(client, "resourceMonitor Resource monitor display: Shown");
  await settle(client);
  const monitorOn = await read();
  if (!monitorOn.monitor)
    failures.push("G7: showing the monitor did not bring it back");
  if (monitorOn.row !== bothOff.row) {
    failures.push(
      `G7: showing the monitor brought the row reading back: ${JSON.stringify(monitorOn)}`,
    );
  }
  await screenshotPage(client, "g7-4-monitor-on-rows-off");
  await evaluate(client, "window.__layoutCanvasProbe.reset()");
}

async function checkErrors(client, label) {
  const errors = await evaluate(client, "window.__layoutCanvasErrors ?? []");
  for (const error of errors)
    failures.push(`${label}: page error: ${error.split("\n")[0]}`);
  await evaluate(
    client,
    "window.__layoutCanvasErrors && (window.__layoutCanvasErrors.length = 0)",
  );
}

// --- the panel --------------------------------------------------------------

async function clickTab(client, label) {
  const found = await evaluate(
    client,
    `(() => {
       const tab = [...document.querySelectorAll('[data-fixture-settings-pane] [role="tab"]')]
         .find((node) => node.textContent.trim() === ${JSON.stringify(label)});
       if (tab === undefined) return false;
       tab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
       tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
       tab.click();
       return tab.getAttribute('aria-selected');
     })()`,
  );
  await settle(client);
  const selected = await evaluate(
    client,
    `[...document.querySelectorAll('[data-fixture-settings-pane] [role="tab"]')].find((node) => node.textContent.trim() === ${JSON.stringify(label)})?.getAttribute('aria-selected')`,
  );
  if (found === false || selected !== "true")
    failures.push(`tab ${label} could not be selected`);
}

async function openAllDisclosures(client) {
  await evaluate(
    client,
    `${PANEL}.querySelectorAll('[data-sortable-id] > [data-row-line] [aria-expanded="false"]').forEach((grab) => grab.click())`,
  );
  await settle(client);
}

async function listControls(client) {
  return evaluate(client, `${CONTROLS}.map((entry) => entry.key)`);
}

async function mustOperate(client, name) {
  if (!(await operate(client, name)))
    failures.push(`control not found: ${name}`);
}

/** Operates the control named `name`; false when the tab no longer has it. */
async function operate(client, name) {
  const kind = await evaluate(
    client,
    `(() => {
       const entry = ${CONTROLS}.find((candidate) => candidate.key === ${JSON.stringify(name)});
       if (entry === undefined) return null;
       if (entry.order) {
         entry.node.focus();
         return document.activeElement === entry.node ? entry.order : null;
       }
       entry.node.click();
       return 'click';
     })()`,
  );
  if (kind === "ArrowDown" || kind === "ArrowUp") await key(client, kind, 1);
  return kind !== null;
}

/** Alt+<key>: the sortable list's nudge, which commits at once (L-31). */
async function key(client, name, modifiers) {
  const code = name;
  for (const type of ["rawKeyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      type,
      key: name,
      code,
      windowsVirtualKeyCode: name === "ArrowDown" ? 40 : 38,
      modifiers,
    });
  }
}

// --- the app column ---------------------------------------------------------

/**
 * What the app column renders, as one string: every sibling of the settings
 * pane, with the attributes that move on their own (motion styles, ids React
 * mints) left out, so the only thing that can change it is a setting.
 */
function appSignature(client) {
  return evaluate(
    client,
    `(() => {
       const pane = document.querySelector('[data-fixture-settings-pane]');
       const root = pane.parentElement.closest('#root') ?? document.body;
       const clone = root.cloneNode(true);
       clone.querySelector('[data-fixture-settings-pane]')?.remove();
       for (const node of clone.querySelectorAll('*')) {
         for (const name of ['id', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'style', 'data-state']) {
           node.removeAttribute(name);
         }
       }
       return clone.innerHTML;
     })()`,
  );
}

/** A signature that holds still across two frames: nothing mid-transition. */
async function stableSignature(client) {
  let previous = await appSignature(client);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(60);
    const next = await appSignature(client);
    if (next === previous) return next;
    previous = next;
  }
  return previous;
}

// --- evidence ---------------------------------------------------------------

async function screenshotPane(client, name) {
  if (outDir === null) return;
  const clip = await evaluate(
    client,
    `(() => {
       const box = document.querySelector('[data-fixture-settings-pane]').getBoundingClientRect();
       return { x: box.left, y: box.top, width: box.width, height: box.height };
     })()`,
  );
  const shot = await client.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
  });
  await writeFile(
    path.join(outDir, `${name}.png`),
    Buffer.from(shot.data, "base64"),
  );
}

async function screenshotPage(client, name) {
  if (outDir === null) return;
  const shot = await client.send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    path.join(outDir, `${name}.png`),
    Buffer.from(shot.data, "base64"),
  );
}

function slug(label) {
  return label.toLowerCase().replace(/\W+/g, "-");
}

// --- plumbing ---------------------------------------------------------------

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
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: projectRoot, stdio: ["ignore", "ignore", "pipe"] },
  );
}

async function navigate(client, url) {
  try {
    await evaluate(client, "window.__probeStaleDocument = true");
  } catch (error) {
    if (!isNavigationContextError(error)) throw error;
  }
  await client.send("Page.navigate", { url });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const ready = await evaluate(
        client,
        `window.__probeStaleDocument !== true && document.readyState === "complete"`,
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

function settle(client) {
  return evaluate(
    client,
    `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50))))`,
  );
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createTcpServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, child, readError, label) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited early: ${readError()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await delay(150);
  }
  throw new Error(`${label} did not become reachable: ${readError()}`);
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 0;
    const connectTimer = setTimeout(
      () => reject(new Error("CDP connect timed out")),
      15_000,
    );
    const failAll = (reason) => {
      for (const [id, request] of pending) {
        pending.delete(id);
        request.reject(reason);
      }
    };
    socket.addEventListener("error", (event) => {
      const error = new Error(`CDP socket error: ${String(event)}`);
      reject(error);
      failAll(error);
    });
    socket.addEventListener("close", (event) => {
      failAll(new Error(`CDP socket closed (${event.code})`));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails;
        pageExceptions.push(details.exception?.description ?? details.text);
      } else if (
        message.method === "Log.entryAdded" &&
        message.params.entry.level === "error"
      ) {
        pageExceptions.push(message.params.entry.text);
      }
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
        send(method, params = {}) {
          if (socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(
              new Error(`CDP socket not open for ${method}`),
            );
          }
          return new Promise((requestResolve, requestReject) => {
            const id = ++nextId;
            pending.set(id, { resolve: requestResolve, reject: requestReject });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
      });
    });
  });
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
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

async function waitFor(client, label, expression) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(100);
  }
  const pageState = await evaluate(
    client,
    `({ errors: window.__layoutCanvasErrors ?? [], text: document.body.innerText.slice(0, 2000) })`,
  );
  pageState.exceptions = pageExceptions.slice(-10);
  throw new Error(
    `Timed out waiting for ${label}:\n${JSON.stringify(pageState, null, 2)}`,
  );
}
