// Browser-only migration gate. Pixel baselines live outside git.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rm,
  realpath,
  mkdtemp,
  symlink,
  rename,
} from "node:fs/promises";
import { platform, arch, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer as createTcpServer } from "node:net";
import {
  findChrome,
  launchChromeWithDevTools,
  terminateProcessTree,
} from "./chrome-launcher.mjs";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  assert(
    args[i + 1] && !args[i + 1].startsWith("--"),
    `${name} requires a value`,
  );
  return args[i + 1];
};
if (args.includes("--help")) {
  console.log(`bun scripts/primitive-gate-browser.mjs --behavior [--only toast|conceal|nested]
bun scripts/primitive-gate-browser.mjs --capture DIR [--filter family/state] [--viewport desktop|portrait|landscape]
bun scripts/primitive-gate-browser.mjs --compare BASELINE --out DIR [--filter family/state]
bun scripts/primitive-gate-browser.mjs --known-defects
bun scripts/primitive-gate-browser.mjs --motion --out DIR
bun scripts/primitive-gate-browser.mjs --self-check-paths
Subset options: --theme light|dark, --smoke (first state per family), --from-family NAME.
Optional --motion-reference DIR selects revised motion measurements while preserving the original pixel manifest.
Capture includes separate motion measurements. Compare checks browser/platform/DPR, exact pixels and motion. --filter matches a substring of family/state. Omitted runs all 990 images.`);
  process.exit(0);
}
if (args.includes("--self-check-paths")) {
  const root = await mkdtemp(path.join(tmpdir(), "primitive-gate-path-check-"));
  try {
    const reference = path.join(root, "reference");
    await mkdir(reference);
    const sentinel = path.join(reference, "manifest.json");
    await writeFile(sentinel, "immutable reference");
    await symlink(reference, path.join(root, "alias"));
    for (const output of [
      reference,
      path.join(reference, "..", "reference"),
      path.join(root, "alias"),
      path.join(reference, "new", "child"),
      root,
    ]) {
      let rejected = false;
      try {
        execFileSync(
          process.execPath,
          [
            fileURLToPath(import.meta.url),
            "--compare",
            reference,
            "--out",
            output,
          ],
          { stdio: "pipe" },
        );
      } catch (error) {
        rejected = String(error.stderr).includes("must not overlap");
      }
      assert(rejected, `Overlapping output was not rejected: ${output}`);
      assert.equal(await readFile(sentinel, "utf8"), "immutable reference");
    }
    console.log("PASS 5 canonical-path rejection cases; reference unchanged");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  process.exit(0);
}
const capture = flag("--capture"),
  baseline = flag("--compare"),
  motionReference = flag("--motion-reference"),
  out = capture ?? flag("--out"),
  behavior = args.includes("--behavior"),
  knownDefects = args.includes("--known-defects");
assert(!(capture && baseline), "Capture and compare are exclusive");
assert(
  behavior || knownDefects || out,
  "Choose --behavior, --capture DIR, --compare BASELINE --out DIR or --motion --out DIR",
);
// Resolve existing ancestors as well, so a not-yet-created output under a
// symlink cannot alias the reference. Reject before starting Vite/Chrome.
async function canonicalDirectory(directory) {
  const absolute = path.resolve(directory);
  try {
    return await realpath(absolute);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return path.join(
      await canonicalDirectory(path.dirname(absolute)),
      path.basename(absolute),
    );
  }
}
for (const referenceDirectory of [baseline, motionReference].filter(Boolean)) {
  assert(out, "--compare requires --out");
  const reference = await canonicalDirectory(referenceDirectory);
  const candidate = await canonicalDirectory(out);
  const contains = (parent, child) =>
    child === parent ||
    child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
  assert(
    !contains(reference, candidate) && !contains(candidate, reference),
    "Reference and output directories must not overlap (including symlinks)",
  );
}
const inventory = JSON.parse(
  await readFile(
    path.join(project, "scripts/primitive-gate-cases.json"),
    "utf8",
  ),
);
const views = [
  {
    name: "desktop",
    width: 1280,
    height: 800,
    mobile: false,
    insets: [0, 0, 0, 0],
  },
  {
    name: "portrait",
    width: 393,
    height: 852,
    mobile: true,
    insets: [47, 0, 34, 0],
  },
  {
    name: "landscape",
    width: 852,
    height: 393,
    mobile: true,
    insets: [0, 47, 21, 0],
  },
];
let server,
  chrome,
  client,
  chromeVersion,
  current = "startup",
  documentSequence = 0;
const exceptions = [];
const report = { parameters: {}, images: {}, motion: {}, behavior: [] };
// Pixel/motion diffs are collected here rather than thrown immediately, so one
// residual raster difference doesn't abort the run before the rest of the
// ~990 images (or the 7 motion cases) are even captured. Everything else
// (behavior assertions, the baseline-manifest guard, `check`/`wait`) keeps
// failing fast - only this comparison is deferred.
const diffFailures = [];
// Shared by `launchBrowserAndTarget` (both the original launch and a
// restart), so a restart's browser gets exactly the same one-time page
// bootstrap as the first.
const BOOTSTRAP_SCRIPT_SOURCE = `Math.random = () => 0.5; (${installPresentationProbes.toString()})(); (${installMotionProbe.toString()})();`;
// Same reasoning: identical flags for the original launch and every restart.
const CHROME_LAUNCH_FLAGS = [
  "--force-device-scale-factor=1",
  "--force-color-profile=srgb",
  "--font-render-hinting=none",
  // Avoid run-dependent edge pixels from partial raster/Skia fast paths.
  // See GoogleChrome/chrome-launcher docs/chrome-flags-for-tools.md.
  "--disable-partial-raster",
  "--disable-skia-runtime-opts",
  "--hide-scrollbars",
  "--disable-features=Translate,BackForwardCache",
];
let cleaning;
function cleanup() {
  if (!cleaning)
    cleaning = (async () => {
      client?.close();
      if (chrome) {
        await terminateProcessTree(chrome.chrome);
        await rm(chrome.profilePath, {
          recursive: true,
          force: true,
          maxRetries: 3,
        });
      }
      if (server) await terminateProcessTree(server);
    })();
  return cleaning;
}
process.once("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});
process.once("SIGTERM", async () => {
  await cleanup();
  process.exit(143);
});
const previous = baseline
  ? JSON.parse(await readFile(path.join(baseline, "manifest.json"), "utf8"))
  : null;
const previousMotion = motionReference
  ? JSON.parse(
      await readFile(path.join(motionReference, "manifest.json"), "utf8"),
    )
  : previous;
try {
  const port = await new Promise((resolve, reject) => {
    const s = createTcpServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      assert(a && typeof a === "object");
      s.close(() => resolve(a.port));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const require = createRequire(import.meta.url),
    manifestPath = require.resolve("vite/package.json");
  const vite = path.resolve(
    path.dirname(manifestPath),
    require(manifestPath).bin.vite,
  );
  server = spawn(
    "node",
    [
      vite,
      "--config",
      path.join(project, "vitest.config.ts"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: project, stdio: ["ignore", "ignore", "pipe"], detached: true },
  );
  let serverError = "";
  server.stderr.on("data", (chunk) => {
    serverError += String(chunk);
  });
  server.on("error", (error) => {
    serverError += String(error);
  });
  const deadline = Date.now() + 60000;
  while (true) {
    try {
      if (
        (await fetch(origin + "/src/__tests__/browser/primitive-gate.html")).ok
      )
        break;
    } catch {}
    if (Date.now() > deadline || server.exitCode !== null)
      throw new Error("Vite failed: " + serverError);
    await delay(100);
  }
  chromeVersion = await launchBrowserAndTarget();
  const version = chromeVersion;
  report.parameters = {
    chrome: version.product,
    revision: version.revision,
    platform: platform(),
    arch: arch(),
    dpr: 1,
    fonts: "Figtree Variable (bundled), 400/500/600/700",
    colorProfile: "srgb",
    fontRenderHinting: "none",
    partialRaster: false,
    skiaRuntimeOptimizations: false,
    viewports: views,
    randomSeed: 0.5,
    caseInventorySha256: createHash("sha256")
      .update(JSON.stringify(inventory))
      .digest("hex"),
  };
  for (const reference of [previous, previousMotion].filter(Boolean))
    assert.deepEqual(
      report.parameters,
      reference.parameters,
      "Baseline environment differs; use pinned browser/platform",
    );
  report.harnessSha256 = Object.fromEntries(
    await Promise.all(
      [
        "scripts/primitive-gate-browser.mjs",
        "src/__tests__/browser/primitive-gate.tsx",
        "src/__tests__/browser/primitive-gate.html",
      ].map(async (file) => [
        file,
        createHash("sha256")
          .update(await readFile(path.join(project, file)))
          .digest("hex"),
      ]),
    ),
  );
  report.source = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: project,
    encoding: "utf8",
  }).trim();
  if (out) await mkdir(out, { recursive: true });
  async function load(family, state, mode, view, theme) {
    current = `${mode}/${family}/${state}/${theme}/${view.name}`;
    exceptions.length = 0;
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: view.width,
      height: view.height,
      deviceScaleFactor: 1,
      mobile: view.mobile,
    });
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1,
      y: 1,
    });
    await client.send("Emulation.setTouchEmulationEnabled", {
      enabled: view.mobile,
      maxTouchPoints: 1,
    });
    await client.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: theme },
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });
    const url = new URL("/src/__tests__/browser/primitive-gate.html", origin);
    for (const [k, v] of Object.entries({ family, state, mode, theme }))
      url.searchParams.set(k, v);
    url.searchParams.set("document", String(++documentSequence));
    await client.send("Page.navigate", { url: url.href });
    await wait(
      "fixture",
      `location.href===${JSON.stringify(url.href)} && !!window.primitiveGate && !!document.querySelector('[data-gate-state]')`,
    );
    await evaluate(`(async()=>{
   const insets=${JSON.stringify(view.insets)};['top','right','bottom','left'].forEach((edge,i)=>document.documentElement.style.setProperty('--safe-area-inset-'+edge,insets[i]+'px'));window.dispatchEvent(new Event('resize'));
   await Promise.all([400,500,600,700].map(w=>document.fonts.load(w+' 14px "Figtree Variable"','Project settings')));await document.fonts.ready;
   if(![...document.fonts].some(f=>f.family.includes('Figtree')&&f.status==='loaded')||!document.fonts.check('400 14px "Figtree Variable"'))throw new Error('Bundled app font not loaded');
   if(devicePixelRatio!==1)throw new Error('DPR changed');
   if(matchMedia('(pointer: coarse)').matches!==${view.mobile}||(navigator.maxTouchPoints>0)!==${view.mobile})throw new Error('Touch/pointer emulation mismatch');
   if(document.documentElement.classList.contains('dark')!==${theme === "dark"})throw new Error('Theme mismatch');
  })()`);
    await settle();
  }
  async function open(family, state, view) {
    if (family === "sidebar") {
      if (view.width < 768) {
        await clickSelector("[data-gate-trigger]", "left", true);
        await wait(
          "mobile sidebar",
          "window.gatePresented('[data-slot=sidebar][data-mobile=true]')",
        );
      }
      return;
    }
    if (
      ![
        "dialog",
        "frame",
        "sheet",
        "drawer",
        "popover",
        "dropdown-menu",
        "context-menu",
        "menubar",
        "select",
        "nested",
        "tooltip",
        "hover-card",
      ].includes(family) ||
      (family === "select" && state === "disabled")
    )
      return;
    if (family === "tooltip" || family === "hover-card")
      await hoverSelector("[data-gate-trigger]");
    else
      await clickSelector(
        "[data-gate-trigger]",
        family === "context-menu" ? "right" : "left",
        true,
      );
    await wait("opened popup", "window.gatePresented('[data-gate-popup]')");
    if (family === "nested") {
      await settle();
      if (state === "tooltip-in-popover")
        await hoverSelector('[data-gate-trigger="tooltip"]');
      else await clickSelector('[data-gate-trigger="nested"]', "left", true);
      await wait(
        "nested popup",
        "window.gatePresented('[data-gate-popup=nested], [data-gate-popup=tooltip]') && [...document.querySelectorAll('[data-gate-popup]')].filter(window.gatePainted).length === 2",
      );
    }
    if (state.startsWith("submenu")) {
      await settle();
      await openSubmenuTrigger(view);
    }
  }
  // Shared by `open()`'s submenu states and `motionChecks()`'s submenu cases -
  // the latter needs the parent menu already open and settled BEFORE it opens
  // (and starts recording) just the submenu, so it can't go through `open()`
  // as one call the way every other motion case does.
  async function openSubmenuTrigger(view) {
    await evaluate(
      "document.querySelector('[data-gate-subtrigger]').scrollIntoView({block:'nearest'})",
    );
    if (view.mobile) {
      const point = await center("[data-gate-subtrigger]");
      await tapAt(point.x, point.y);
    } else await hoverSelector("[data-gate-subtrigger]");
    await wait("submenu", "window.gatePresented('[data-gate-subpopup]')");
  }
  async function visual(family, state, view, theme) {
    await load(family, state, "visual", view, theme);
    await open(family, state, view);
    if (family === "avatar" && state === "image")
      await wait(
        "avatar image decoded",
        "!!document.querySelector('[data-slot=avatar-image]') && document.querySelector('[data-slot=avatar-image]').complete",
      );
    if (state === "hover") await hoverSelector("[data-gate-control]");
    else if (state === "focus") {
      await key(family === "dropdown-menu" ? "ArrowDown" : "Tab", 0);
      await evaluate(
        "document.querySelector('[data-gate-control], [data-gate-item]')?.focus()",
      );
      assert(
        await evaluate(
          "document.activeElement.matches('[data-gate-control], [data-gate-item]')",
        ),
        "Focus state not exercised",
      );
    }
    if (family === "drawer" && state === "input") {
      await settle();
      await clickSelector("[data-gate-input]", "left", true);
      await client.send("Input.insertText", { text: " ready" });
    }
    await settle();
    assert.equal(exceptions.length, 0, exceptions.join("\n"));
    const name = `${family}--${state}--${theme}--${view.name}.png`;
    const bytes = Buffer.from(
      (
        await client.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        })
      ).data,
      "base64",
    );
    const referenceBytes = baseline
      ? await readFile(path.join(baseline, name))
      : null;
    await writeCandidate(path.join(out, name), bytes);
    report.images[name] = {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      width: view.width,
      height: view.height,
    };
    if (baseline) {
      const diff = await canvasDiff(referenceBytes, bytes);
      if (diff.pixels !== 0) {
        await writeCandidate(
          path.join(out, name.replace(".png", ".diff.png")),
          Buffer.from(diff.image.split(",")[1], "base64"),
        );
        const message = `${name}: ${diff.pixels} changed pixels (max delta ${diff.maxDelta})`;
        console.error(`DIFF ${message}`);
        diffFailures.push(message);
      }
    }
  }
  async function canvasDiff(a, b) {
    return evaluate(`(async()=>{
  const load=async data=>{const image=new Image();image.src=data;await image.decode();return image;};const [a,b]=await Promise.all([load('data:image/png;base64,${a.toString("base64")}'),load('data:image/png;base64,${b.toString("base64")}')]);
  if(a.width!==b.width||a.height!==b.height)throw new Error('Image dimensions changed');const canvas=document.createElement('canvas');canvas.width=a.width;canvas.height=a.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(a,0,0);const x=ctx.getImageData(0,0,a.width,a.height);ctx.clearRect(0,0,a.width,a.height);ctx.drawImage(b,0,0);const y=ctx.getImageData(0,0,b.width,b.height);let pixels=0,maxDelta=0;
  for(let i=0;i<x.data.length;i+=4){let changed=false;for(let c=0;c<4;c++){const d=Math.abs(x.data[i+c]-y.data[i+c]);maxDelta=Math.max(maxDelta,d);changed ||= d!==0;}if(changed)pixels++;x.data.set(changed?[255,0,80,255]:[0,0,0,0],i);}ctx.putImageData(x,0,0);return {pixels,maxDelta,image:canvas.toDataURL()};})()`);
  }
  async function toastChecks() {
    for (const [family, state] of [
      ["dialog", "default"],
      ["popover", "default"],
      ["frame", "default"],
      ["frame", "nonmodal"],
    ]) {
      await load(family, state, "toast", views[0], "light");
      await open(family, state, views[0]);
      await evaluate("window.primitiveGate.toast()");
      await wait(
        "toast",
        "!!document.querySelector('[data-gate-toast-action]')",
      );
      await delay(400);
      await settle();
      if (family !== "popover" && state !== "nonmodal") {
        const p = await center("[data-gate-toast-action]");
        await check(
          "current modal toast hit lands on backdrop",
          `document.elementFromPoint(${p.x},${p.y}).matches('[data-slot=dialog-overlay]')`,
        );
        await clickAt(p.x, p.y, "left");
        await check(
          "current modal toast press does not activate action",
          "document.querySelector('[data-gate-state]').dataset.actions === '0'",
        );
        await wait(
          "current modal toast press dismisses modal through backdrop",
          "document.querySelector('[data-gate-state]').dataset.open === 'false'",
        );
        console.log(
          `KNOWN DEFECT ${family}: toast action is blocked; press dismisses the modal (desired: action fires and modal remains)`,
        );
        report.behavior.push(`toast/${family}/current-modal-blocking`);
        // Reopen to prove normal backdrop dismissal independently of the defect.
        await settle();
        await wait(
          "modal exit completes",
          "!window.gatePresented('[data-gate-popup]')",
        );
        await open(family, state, views[0]);
        await settle();
        await clickAt(8, 8, "left");
        await wait(
          "ordinary backdrop dismisses",
          "document.querySelector('[data-gate-state]').dataset.open === 'false'",
        );
        continue;
      }
      await clickSelector("[data-gate-toast-action]", "left", true);
      await check(
        "toast action once, overlay retained",
        "document.querySelector('[data-gate-state]').dataset.actions === '1' && document.querySelector('[data-gate-state]').dataset.open === 'true'",
      );
      await hoverSelector("[data-sonner-toast]");
      await settle();
      await clickSelector(
        "[data-sonner-toast] [data-close-button]",
        "left",
        true,
      );
      await wait(
        "toast removed",
        "!document.querySelector('[data-sonner-toast]')",
      );
      await check(
        "toast close retains overlay",
        "document.querySelector('[data-gate-state]').dataset.open === 'true'",
      );
      await clickAt(8, 8, "left");
      if (family === "frame" && state === "nonmodal") {
        await check(
          "nonmodal frame deliberately ignores outside press",
          "document.querySelector('[data-gate-state]').dataset.open === 'true'",
        );
        await clickSelector("[data-testid=close]", "left", true);
      }
      await wait(
        "ordinary close path",
        "document.querySelector('[data-gate-state]').dataset.open === 'false'",
      );
      report.behavior.push(`toast/${family}/${state}/pointer`);
    }
    await load("popover", "default", "toast", views[0], "light");
    await open("popover", "default", views[0]);
    await evaluate("window.primitiveGate.toast()");
    await wait("toast", "!!document.querySelector('[data-gate-toast-action]')");
    // Sonner's real keyboard shortcut enters the toaster; Tab reaches its action.
    await key("t", 1);
    await wait(
      "keyboard focus in toaster",
      "!!document.activeElement.closest('[data-sonner-toaster]')",
    );
    for (
      let i = 0;
      i < 6 &&
      !(await evaluate(
        "document.activeElement.matches('[data-gate-toast-action]')",
      ));
      i++
    )
      await key("Tab", 0);
    await check(
      "popup → toast action retains popup",
      "document.activeElement.matches('[data-gate-toast-action]') && document.querySelector('[data-gate-state]').dataset.open === 'true'",
    );
    await key("Enter", 0);
    await wait(
      "keyboard action once",
      "document.querySelector('[data-gate-state]').dataset.actions === '1'",
    );
    // Sonner 2.0.8 restores the element that had focus before Alt+T when
    // focus leaves its list. Today Tab cannot proceed to an ordinary control.
    await key("Tab", 0);
    await settle();
    await check(
      "current toaster exit restores popup focus",
      "!!document.activeElement.closest('[data-gate-popup]') && document.querySelector('[data-gate-state]').dataset.open === 'true'",
    );
    console.log(
      "KNOWN DEFECT popover keyboard: leaving toaster restores popup focus; desired next ordinary control is not reachable by that Tab",
    );
    await clickSelector("[data-gate-outside]", "left", true);
    await wait(
      "ordinary outside control closes popup",
      "document.querySelector('[data-gate-state]').dataset.open === 'false'",
    );
    report.behavior.push("toast/popover/keyboard-restores-popup");
  }
  async function knownDefectChecks() {
    for (const family of ["dialog", "frame"]) {
      await load(family, "default", "toast", views[0], "light");
      await open(family, "default", views[0]);
      await evaluate("window.primitiveGate.toast()");
      await wait(
        "toast",
        "!!document.querySelector('[data-gate-toast-action]')",
      );
      await delay(400);
      await settle();
      await clickSelector("[data-gate-toast-action]", "left", false);
      await settle();
      const observed = await evaluate(
        "({actions:Number(document.querySelector('[data-gate-state]').dataset.actions),open:document.querySelector('[data-gate-state]').dataset.open==='true'})",
      );
      console.log(
        `KNOWN-DEFECT lane (non-gating) ${family}: ${JSON.stringify(observed)}; desired actions=1, open=true; ${observed.actions === 1 && observed.open ? "RESOLVED" : "PRESENT"}`,
      );
    }
    await load("popover", "default", "toast", views[0], "light");
    await open("popover", "default", views[0]);
    await evaluate("window.primitiveGate.toast()");
    await wait("toast", "!!document.querySelector('[data-gate-toast-action]')");
    await key("t", 1);
    for (
      let i = 0;
      i < 6 &&
      !(await evaluate(
        "document.activeElement.matches('[data-gate-toast-action]')",
      ));
      i++
    )
      await key("Tab", 0);
    await key("Enter", 0);
    await key("Tab", 0);
    await settle();
    const keyboard = await evaluate(
      "({outside:document.activeElement.matches('[data-gate-outside]'),open:document.querySelector('[data-gate-state]').dataset.open==='true'})",
    );
    console.log(
      `KNOWN-DEFECT lane (non-gating) popover keyboard: ${JSON.stringify(keyboard)}; desired outside=true, open=false; ${keyboard.outside && !keyboard.open ? "RESOLVED" : "PRESENT"}`,
    );
    for (const state of ["menu", "select"])
      for (const scenario of ["backdrop", "rapid", "virtual"]) {
        await load("frame", state, "nested", views[0], "light");
        await open("frame", state, views[0]);
        await settle();
        await clickSelector("[data-gate-trigger=nested]", "left", true);
        await wait(
          "nested opens",
          "window.gatePresented('[data-gate-popup=nested]')",
        );
        await settle();
        if (scenario === "virtual") {
          await evaluate(
            "document.querySelector('[data-slot=dialog-overlay]').click()",
          );
          await key("Escape", 0);
        } else await clickAt(8, 8, "left");
        await settle();
        if (scenario === "rapid") {
          await clickSelector("[data-gate-trigger=nested]", "left", true);
          await wait(
            "nested reopens",
            "window.gatePresented('[data-gate-popup=nested]')",
          );
          await key("Escape", 0);
          await settle();
        }
        await clickAt(8, 8, "left");
        await settle();
        const closed = await evaluate(
          "document.querySelector('[data-gate-state]').dataset.open==='false'",
        );
        console.log(
          `KNOWN-DEFECT lane (non-gating) nested ${state}/${scenario}: second gesture closed=${closed}; ${closed ? "RESOLVED" : "PRESENT"}`,
        );
      }
  }
  async function comparatorCheck() {
    const images = await evaluate(
      `(()=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle='black';x.fillRect(0,0,1,1);const a=c.toDataURL().split(',')[1];x.fillStyle='white';x.fillRect(0,0,1,1);return [a,c.toDataURL().split(',')[1]];})()`,
    );
    const [a, b] = images.map((v) => Buffer.from(v, "base64"));
    assert.equal(
      (await canvasDiff(a, a)).pixels,
      0,
      "Comparator rejects identical images",
    );
    assert.equal(
      (await canvasDiff(a, b)).pixels,
      1,
      "Comparator misses a changed pixel",
    );
  }
  async function concealChecks() {
    const guarded = [
      ["dialog", "default"],
      ["popover", "default"],
      ["dropdown-menu", "default"],
      ["select", "controlled"],
      ["select", "uncontrolled"],
    ];
    // Positive controls: each callback we assert must fire on an ordinary close.
    for (const [family, state] of guarded) {
      await load(family, state, "conceal", views[0], "light");
      await open(family, state, views[0]);
      await settle();
      if (["dialog", "popover"].includes(family))
        await check(
          "open autofocus probe connected",
          "document.querySelector('[data-gate-state]').dataset.openFocus==='1'",
        );
      await key("Escape", 0);
      await settle();
      await wait(
        "ordinary close callback connected",
        "document.querySelector('[data-gate-state]').dataset.closeFocus==='1'",
      );
      await check(
        "ordinary close restores trigger",
        "document.activeElement.matches('[data-gate-trigger]')",
      );
      report.behavior.push(`focus-control/${family}/${state}`);
    }
    for (const control of ["focus", "visible", "conceal"]) {
      const families =
        control === "conceal"
          ? [
              ...guarded,
              ["sheet", "right"],
              ["tooltip", "default"],
              ["hover-card", "default"],
            ]
          : guarded;
      for (const [family, state] of families) {
        await load(family, state, "conceal", views[0], "light");
        current += `/${control}`;
        await clickSelector("[data-gate-owner-input]", "left", true);
        await client.send("Input.insertText", { text: " retained" });
        const unlocked = await evaluate("window.gateLockStyles()");
        await open(family, state, views[0]);
        await settle();
        // Guards the CSS promise (#466) with a real hit-test rather than a DOM
        // structure match: a label-only tooltip must stay transparent to the
        // pointer, while a hover-card preview - real controls inside it - must
        // not.
        if (family === "tooltip" || family === "hover-card") {
          const popupSelector =
            family === "tooltip"
              ? '[data-gate-popup="tooltip"]'
              : '[data-gate-popup="hover"]';
          const positionerSlot =
            family === "tooltip"
              ? "tooltip-positioner"
              : "hover-card-positioner";
          const p = await center(popupSelector);
          const hitsPositioner = await evaluate(
            `!!document.elementFromPoint(${p.x},${p.y})?.closest('[data-slot="${positionerSlot}"]')`,
          );
          assert.equal(
            hitsPositioner,
            family === "hover-card",
            `${family}: popup center hit-test ${family === "tooltip" ? "must stay transparent to the pointer" : "must remain interactive"}`,
          );
        }
        const before = await evaluate(
          "({...document.querySelector('[data-gate-state]').dataset})",
        );
        const hide = `window.primitiveGate.${control}(${control === "conceal"})`;
        const show = `window.primitiveGate.${control}(${control !== "conceal"})`;
        await evaluate(hide);
        const attribute = {
          focus: "focused",
          visible: "visible",
          conceal: "concealed",
        }[control];
        await wait(
          "independent presentation control committed",
          `document.querySelector('[data-gate-state]').dataset.${attribute}==='${control === "conceal"}'`,
        );
        if (family === "select" && control !== "conceal") await settle(); // Pane activity forces a genuine Select close, including its normal exit.
        await check(
          "no painted popup, backdrop or positioner after commit",
          "window.gateSurfacesHidden()",
        );
        await delay(150); // Observe deferred Radix FocusScope cleanup, not just React's commit.
        await settle();
        if (control !== "conceal") {
          assert.deepEqual(
            await evaluate("window.primitiveGate.focusEvents"),
            ["B"],
            "Focus returned to A during/after the host switch",
          );
          await check(
            "focus remains in B without repair",
            "document.activeElement.matches('[data-gate-outside]')",
          );
        }
        assert.deepEqual(
          await evaluate("window.gateLockStyles()"),
          unlocked,
          "Document/body lock styles were not released",
        );
        // Real document scroll, outside the independently scrollable pane child.
        await client.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: 1100,
          y: 600,
          deltaX: 0,
          deltaY: 100,
        });
        await wait(
          "document scroll released",
          "document.scrollingElement.scrollTop > 0",
        );
        await evaluate("window.scrollTo(0,0)");
        const p = await center("[data-gate-scroll]");
        await client.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          ...p,
          deltaX: 0,
          deltaY: 60,
        });
        await wait(
          "pane inner scroll released",
          "document.querySelector('[data-gate-scroll]').scrollTop > 0",
        );
        await key("Escape", 0);
        await clickSelector("[data-gate-outside]", "left", true);
        await check(
          "hidden owners untouched",
          `document.querySelector('[data-gate-state]').dataset.changes===${JSON.stringify(before.changes)} && document.querySelector('[data-gate-state]').dataset.draft===${JSON.stringify(before.draft)}`,
        );
        const hidden = await evaluate(
          "({...document.querySelector('[data-gate-state]').dataset})",
        );
        if (guarded.some(([f, s]) => f === family && s === state))
          assert.equal(
            Number(hidden.closeFocus) - Number(before.closeFocus),
            control === "focus" ? 0 : 1,
            `${family}: current close-focus sequence on ${control}`,
          );
        await evaluate(show);
        await wait(
          "presentation restored",
          `document.querySelector('[data-gate-state]').dataset.${attribute}==='${control !== "conceal"}'`,
        );
        const retained = !(
          family === "select" &&
          state === "uncontrolled" &&
          control !== "conceal"
        );
        if (!retained)
          await check(
            "uncontrolled select closes on pane blur but keeps its value",
            "!window.gatePresented('[data-gate-popup]') && document.querySelector('[data-gate-trigger]').textContent.includes('First view')",
          );
        else if (["tooltip", "hover-card"].includes(family)) {
          await hoverSelector("[data-gate-trigger]");
          await wait(
            "hover reopens",
            "window.gatePresented('[data-gate-popup]')",
          );
        } else
          await wait(
            "logical open re-presents",
            "window.gatePresented('[data-gate-popup]')",
          );
        await settle();
        await check(
          "draft and logical callback count preserved",
          `document.querySelector('[data-gate-state]').dataset.changes===${JSON.stringify(before.changes)} && document.querySelector('[data-gate-state]').dataset.draft===${JSON.stringify(before.draft)}`,
        );
        // Each owner-controlled family gets a quick A→B→A cycle and a distinct
        // close-while-concealed commit. Completion API probes belong to T02.
        if (
          retained &&
          !["tooltip", "hover-card"].includes(family) &&
          state !== "uncontrolled"
        ) {
          const beforeRapid = await evaluate(
            "({...document.querySelector('[data-gate-state]').dataset})",
          );
          const interruptedSelect =
            family === "select" && control !== "conceal";
          await evaluate(hide);
          await wait(
            "quick control commit",
            `document.querySelector('[data-gate-state]').dataset.${attribute}==='${control === "conceal"}'`,
          );
          if (interruptedSelect) {
            // Inspect and re-show in one browser task: never wait out the exit.
            const pending = await evaluate(`(() => {
              const popup = document.querySelector('[data-gate-popup]');
              const animations = document.getAnimations().filter(a => a.effect?.target instanceof Element && (a.effect.target === popup || a.effect.target.contains(popup)));
              const pending = animations.some(a => a.playState !== 'finished' && Number(a.currentTime) < a.effect.getComputedTiming().endTime / 2);
              const painted = window.gatePainted(popup);
              ${show};
              return {pending, painted};
            })()`);
            assert.deepEqual(
              pending,
              { pending: true, painted: true },
              "Rapid Select cycle did not interrupt a pending visible close",
            );
            console.log(
              `PASS interrupted Select ${control} close before halfway`,
            );
          } else await evaluate(show);
          await wait(
            "quick re-present",
            "window.gatePresented('[data-gate-popup]')",
          );
          await settle();
          if (interruptedSelect) {
            // Re-presentation must preserve the focus deliberately transferred
            // to B; an interrupted Select close never remounts its FocusScope.
            await check(
              "interrupted Select preserves focus in B",
              "document.activeElement.matches('[data-gate-outside]')",
            );
            assert.deepEqual(
              await evaluate("window.primitiveGate.focusEvents"),
              ["B"],
              "Interrupted Select transiently stole focus",
            );
            assert.equal(
              await evaluate(
                "document.querySelector('[data-gate-state]').dataset.closeFocus",
              ),
              beforeRapid.closeFocus,
              "Interrupted close fired a stale close-focus callback",
            );
          } else
            await check(
              "re-presented popup owns focus",
              "document.querySelector('[data-gate-popup]').contains(document.activeElement)",
            );
          await check(
            "rapid cycle retains logical owner state",
            `document.querySelector('[data-gate-state]').dataset.open===${JSON.stringify(before.open)} && document.querySelector('[data-gate-state]').dataset.changes===${JSON.stringify(before.changes)} && document.querySelector('[data-gate-state]').dataset.draft===${JSON.stringify(before.draft)}`,
          );
          const focusHistory = await evaluate(
            "window.primitiveGate.focusEvents.slice()",
          );
          const cycle = await evaluate(
            "({...document.querySelector('[data-gate-state]').dataset})",
          );
          const active = await evaluate("document.activeElement?.outerHTML");
          await delay(500);
          assert.deepEqual(
            await evaluate(
              "({...document.querySelector('[data-gate-state]').dataset})",
            ),
            cycle,
            "Old cycle mutated owner/callback state after re-presentation",
          );
          assert.deepEqual(
            await evaluate("window.primitiveGate.focusEvents"),
            focusHistory,
            "Old cycle caused a transient focus move",
          );
          assert.equal(
            await evaluate("document.activeElement?.outerHTML"),
            active,
            "Old cycle stole focus after re-presentation",
          );
          await evaluate(hide);
          await wait(
            "hidden before owner close",
            "window.gateSurfacesHidden()",
          );
          await evaluate("window.primitiveGate.ownerClose()");
          await wait(
            "closed owner committed while unpresented",
            `document.querySelector('[data-gate-state]').dataset.open==='false' && document.querySelector('[data-gate-state]').dataset.${attribute}==='${control === "conceal"}'`,
          );
          await settle();
          const closed = await evaluate(
            "({...document.querySelector('[data-gate-state]').dataset})",
          );
          await delay(500);
          assert.deepEqual(
            await evaluate(
              "({...document.querySelector('[data-gate-state]').dataset})",
            ),
            closed,
            "Delayed hidden close mutated owner/callback state",
          );
          await evaluate(show);
          await settle();
          await check(
            "closed owner does not reopen on presentation",
            "!window.gatePresented('[data-gate-popup]') && document.querySelector('[data-gate-state]').dataset.open==='false'",
          );
          await check(
            "closed owner preserves staged draft",
            `document.querySelector('[data-gate-state]').dataset.draft===${JSON.stringify(before.draft)}`,
          );
        }
        report.behavior.push(`${control}/${family}/${state}`);
      }
    }
    // Negative control for the real-wheel proof: a document lock must stop it.
    await load("button", "default", "conceal", views[0], "light");
    await evaluate(
      "document.documentElement.style.overflow='hidden'; document.body.style.overflow='hidden'",
    );
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 1100,
      y: 600,
      deltaX: 0,
      deltaY: 100,
    });
    await delay(150);
    assert.equal(
      await evaluate("document.scrollingElement.scrollTop"),
      0,
      "Scroll negative control is ineffective",
    );
    await evaluate(
      "document.documentElement.style.overflow=''; document.body.style.overflow=''",
    );
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 1100,
      y: 600,
      deltaX: 0,
      deltaY: 100,
    });
    await wait(
      "scroll positive control",
      "document.scrollingElement.scrollTop > 0",
    );
  }
  async function nestedChecks() {
    for (const state of ["menu", "select"])
      for (const gesture of [
        "backdrop",
        "body",
        "escape",
        "touch",
        "cancel",
        "virtual",
        "rapid",
      ]) {
        const view = gesture === "touch" ? views[1] : views[0];
        await load("frame", state, "nested", view, "light");
        current += `/${gesture}`;
        await open("frame", state, view);
        await settle();
        await clickSelector('[data-gate-trigger="nested"]', "left", true);
        await wait(
          "nested opens",
          "window.gatePresented('[data-gate-popup=nested]')",
        );
        await settle();
        if (gesture === "escape") await key("Escape", 0);
        else if (gesture === "touch") await tapAt(8, 8);
        else if (gesture === "body")
          await clickSelector("[data-gate-body]", "left", false);
        else if (gesture === "cancel") {
          await client.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: 8, y: 8 }],
          });
          await client.send("Input.dispatchTouchEvent", {
            type: "touchCancel",
            touchPoints: [],
          });
        } else if (gesture === "virtual")
          await evaluate(
            "document.querySelector('[data-slot=dialog-overlay]').click()",
          );
        else await clickAt(8, 8, "left");
        await settle();
        await check(
          "first gesture preserves frame",
          "document.querySelector('[data-gate-state]').dataset.open === 'true'",
        );
        if (["cancel", "virtual"].includes(gesture)) {
          if (
            await evaluate("window.gatePresented('[data-gate-popup=nested]')")
          )
            await key("Escape", 0);
        } else
          await wait(
            "first gesture closes inner",
            "!window.gatePresented('[data-gate-popup=nested]')",
          );
        if (gesture === "rapid") {
          await clickSelector('[data-gate-trigger="nested"]', "left", true);
          await wait(
            "reopened",
            "window.gatePresented('[data-gate-popup=nested]')",
          );
          await key("Escape", 0);
        }
        await settle();
        let presses = 1;
        if (gesture === "escape") await key("Escape", 0);
        else if (gesture === "touch") await tapAt(8, 8);
        else await clickAt(8, 8, "left");
        await settle();
        const secondClosed = await evaluate(
          "document.querySelector('[data-gate-state]').dataset.open === 'false'",
        );
        if (
          gesture === "escape" ||
          (state === "select" && !["rapid", "virtual"].includes(gesture))
        )
          assert(secondClosed, "Frame must close on second gesture");
        if (!secondClosed) {
          presses++;
          if (gesture === "touch") await tapAt(8, 8);
          else await clickAt(8, 8, "left");
        }
        await wait(
          "frame closes within three gestures",
          "document.querySelector('[data-gate-state]').dataset.open === 'false'",
        );
        console.log(
          `nested ${state}/${gesture}: frame closes on gesture ${presses + 1}${secondClosed ? "" : " (known extra press)"}`,
        );
        report.behavior.push(`nested/${state}/${gesture}`);
      }
    for (const state of ["menu", "select"]) {
      await load("frame", state, "nested", views[0], "light");
      await open("frame", state, views[0]);
      await settle();
      await clickSelector("[data-gate-trigger=nested]", "left", true);
      await wait(
        "nested opens",
        "window.gatePresented('[data-gate-popup=nested]')",
      );
      await evaluate("window.primitiveGate.focus(false)");
      await wait(
        "nested concealed",
        "!window.gatePresented('[data-gate-popup=nested]')",
      );
      await settle();
      await check(
        "frame remains open",
        "document.querySelector('[data-gate-state]').dataset.open==='true'",
      );
      await clickAt(8, 8, "left");
      await settle();
      if (
        await evaluate(
          "document.querySelector('[data-gate-state]').dataset.open==='true'",
        )
      )
        await clickAt(8, 8, "left");
      await wait(
        "concealed nested layer cannot indefinitely own backdrop",
        "document.querySelector('[data-gate-state]').dataset.open==='false'",
      );
      report.behavior.push(`nested/${state}/concealed`);
    }
    await load("frame", "tooltip", "nested", views[0], "light");
    await open("frame", "tooltip", views[0]);
    await settle();
    await hoverSelector('[data-gate-trigger="tooltip"]');
    await wait(
      "tooltip opens",
      "window.gatePresented('[data-gate-popup=tooltip]')",
    );
    await clickAt(8, 8, "left");
    await wait(
      "passive tooltip does not own backdrop",
      "document.querySelector('[data-gate-state]').dataset.open === 'false'",
    );
    report.behavior.push("nested/passive-tooltip");
  }
  async function probeChecks() {
    await load("button", "default", "visual", views[0], "light");
    const result = await evaluate(`(() => {
      const parent = document.createElement('div');
      parent.style.cssText='position:fixed;left:10px;top:10px;z-index:99999;width:40px;height:40px';
      const popup = document.createElement('button');
      popup.dataset.probe=''; popup.style.cssText='width:40px;height:40px;background:red';
      parent.append(popup); document.body.append(parent);
      const presentation = [window.gatePresented('[data-probe]')];
      for (const attribute of ['hidden','inert','aria-hidden']) {
        parent.setAttribute(attribute, 'true'); presentation.push(window.gatePresented('[data-probe]')); parent.removeAttribute(attribute);
      }
      parent.style.opacity='0'; presentation.push(window.gatePresented('[data-probe]')); parent.style.opacity='1';
      parent.dataset.slot='gate-positioner'; parent.style.pointerEvents='none'; popup.style.pointerEvents='auto'; popup.dataset.gatePopup='probe';
      popup.hidden=true; const hiddenMounted=window.gateSurfacesHidden();
      parent.style.backgroundColor='red'; const paintedPositioner=window.gateSurfacesHidden();
      parent.style.backgroundColor='transparent'; popup.hidden=false;
      const timing = {duration:100,delay:20,endDelay:30,iterations:2,fill:'both'};
      const measure = animations => {const result=window.gateMeasureMotion(popup,animations,animations.map(() => 0)); animations.forEach(a=>a.cancel());return result;};
      const combined = measure([popup.animate([{transform:'translateX(0px)',opacity:0},{transform:'translateX(10px)',opacity:1}],timing)]);
      const split = measure([popup.animate([{transform:'translateX(0px)'},{transform:'translateX(10px)'}],timing),popup.animate([{opacity:0},{opacity:1}],timing)]);
      const ancestor = measure([parent.animate([{transform:'translateX(0px)'},{transform:'translateX(10px)'}],timing),popup.animate([{opacity:0},{opacity:1}],timing)]);
      const prolonged = measure([popup.animate([{transform:'translateX(0px)',opacity:0},{transform:'translateX(10px)',opacity:1}],{...timing,endDelay:80})]);
      parent.remove(); return {presentation,hiddenMounted,paintedPositioner,combined,split,ancestor,prolonged};
    })()`);
    assert.equal(
      result.hiddenMounted,
      true,
      "Hidden retained popup/transparent positioner rejected",
    );
    assert.equal(
      result.paintedPositioner,
      false,
      "Painted positioner leak missed",
    );
    assert.deepEqual(
      result.presentation,
      [true, false, false, false, false],
      "Presentation predicate positive/negative controls",
    );
    assert.deepEqual(
      result.combined,
      result.split,
      "Equivalent combined/split motion differs",
    );
    assert.deepEqual(
      result.combined,
      result.ancestor,
      "Equivalent positioner motion differs",
    );
    assert.equal(
      result.combined.to.rect[0] - result.combined.from.rect[0],
      10,
      "Motion misses rendered translation",
    );
    assert.deepEqual(
      [result.combined.from.opacity, result.combined.to.opacity],
      [0, 1],
    );
    assert.equal(
      result.combined.totalDuration,
      250,
      "Motion ignores delay/iterations/endDelay",
    );
    assert.equal(result.prolonged.totalDuration, 300);
    assert.notDeepEqual(
      result.combined,
      result.prolonged,
      "Prolonged completion was missed",
    );
    const live = await evaluate(`(async () => {
      const popup = document.createElement('div');
      popup.dataset.gatePopup='collector-probe';
      popup.style.cssText='position:fixed;left:10px;top:10px;width:40px;height:40px;background:red';
      document.body.append(popup);
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const run = async replay => {
        window.gateStartMotion('[data-gate-popup]');
        const effects = [];
        for (let i=0; i<(replay ? 2 : 1); i++) {
          const a = popup.animate([{transform:'translateX(0px)',opacity:0},{transform:'translateX(10px)',opacity:1}], {duration:100,fill:'both'});
          effects.push(a);
          while (a.playState !== 'finished') await frame();
        }
        await frame();
        window.gateMotionRunning=false;
        const result=window.gateMotion;
        effects.forEach(a=>a.cancel());
        return result;
      };
      const single=await run(false), replay=await run(true);
      popup.remove(); return {single,replay};
    })()`);
    assert.equal(
      live.single.totalDuration,
      100,
      "Live collector single-enter control",
    );
    assert.deepEqual(live.single.from, live.replay.from);
    assert.deepEqual(live.single.to, live.replay.to);
    assert(
      live.replay.totalDuration >= 200,
      "Live collector lost the sequential second enter",
    );
    assert.throws(
      () => assert.deepEqual(live.single, live.replay),
      { name: "AssertionError" },
      "Motion comparator accepted a doubled enter",
    );
    console.log(
      `PASS live phase collector: single=${live.single.totalDuration}ms; sequential replay=${live.replay.totalDuration}ms rejected`,
    );
    console.log(
      "PASS presentation and aggregate-motion positive/negative controls",
    );
  }
  // Shared by both motion loops below: stores the measurement, diffs it
  // against `previousMotion` the same way every other accumulated diff in
  // this script is handled (logged and collected, never thrown - one
  // residual motion difference must not hide the rest), and logs it.
  function recordMotion(family, state, enter, exit) {
    assert(enter !== null, `${family} has no enter motion`);
    report.motion[`${family}/${state}`] = { enter, exit };
    if (previousMotion) {
      try {
        assert.deepEqual(
          report.motion[`${family}/${state}`],
          previousMotion.motion[`${family}/${state}`],
          `${family}/${state}: motion changed`,
        );
      } catch {
        const message = `${family}/${state}: motion changed - ${JSON.stringify({
          was: previousMotion.motion[`${family}/${state}`],
          now: report.motion[`${family}/${state}`],
        })}`;
        console.error(`DIFF ${message}`);
        diffFailures.push(message);
      }
    }
    console.log(
      `motion ${family}/${state}: ${JSON.stringify({ enter, exit })}`,
    );
  }
  async function motionChecks() {
    assert(
      !previousMotion ||
        previousMotion.motion?.["dialog/padded"]?.enter?.timeline === "phase",
      "Legacy motion format: pass --motion-reference DIR with a phase-timeline capture; keep the original pixel reference unchanged",
    );
    for (const [family, state] of [
      ["dialog", "padded"],
      ["sheet", "top"],
      ["sheet", "right"],
      ["sheet", "bottom"],
      ["sheet", "left"],
      ["drawer", "bottom"],
      ["tooltip", "default"],
      // Newly measured overlay families - same open()/close() shape as the
      // seven above, so they run through the identical single-phase loop.
      // "default" here is each family's behavior-probe state (also used by
      // concealChecks' `guarded`/hover-card-tooltip conceal list), not
      // necessarily its pixel-inventory state name in
      // primitive-gate-cases.json.
      ["hover-card", "default"],
      ["popover", "default"],
      ["dropdown-menu", "default"],
      ["context-menu", "default"],
      ["select", "default"],
    ]) {
      await load(family, state, "motion", views[0], "light");
      await evaluate("window.gateStartMotion('[data-gate-popup]')");
      await open(family, state, views[0]);
      await settle();
      const enter = await evaluate(
        "window.gateMotionRunning=false; window.gateMotion",
      );
      await evaluate("window.gateStartMotion('[data-gate-popup]')");
      // hover-card, like tooltip, is a hover-only interaction with no Escape
      // binding - it closes on pointer-away, same as open() opens it via
      // hoverSelector rather than a click.
      if (family === "tooltip" || family === "hover-card")
        await client.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: 1,
          y: 1,
        });
      else await key("Escape", 0);
      await delay(500);
      await settle();
      const exit = await evaluate(
        "window.gateMotionRunning=false; window.gateMotion",
      );
      recordMotion(family, state, enter, exit);
    }
    // Submenu motion is measured in its own two-phase pass, not folded into
    // the loop above: `open()`'s submenu handling opens the PARENT menu and
    // the submenu in one call, and the loop above starts recording before
    // calling `open()` - so measuring a submenu state that way would fold
    // the parent's own (already-proven, unrelated) entrance animation into
    // the submenu's numbers. Here the parent is opened and settled with the
    // probe off, then the probe starts and only the submenu itself is
    // opened/closed. The probe is pointed at `[data-gate-subpopup]`
    // specifically (gateStartMotion's selector argument) - `[data-gate-popup]`
    // would keep tracking the PARENT popup the whole time, since that
    // selector still matches while the submenu is open too.
    // ArrowLeft, not Escape, closes just the submenu: Escape is the
    // whole-menu-tree dismiss key in this Menu primitive (same as every
    // standard ARIA menu pattern), so it would take the parent down with it
    // and the "independent" measurement would really be the whole tree's
    // exit. ArrowLeft is the standard collapse-submenu-only key, and the
    // assertion below hard-fails the case (rather than silently recording
    // whatever happened) if that assumption doesn't hold for this primitive.
    // "submenu-panel" is a pixel/content variant of the same submenu
    // animation, not a distinct one, so it's not measured separately.
    for (const [family, state] of [
      ["dropdown-menu", "submenu"],
      ["context-menu", "submenu"],
    ]) {
      await load(family, state, "motion", views[0], "light");
      await clickSelector(
        "[data-gate-trigger]",
        family === "context-menu" ? "right" : "left",
        true,
      );
      await wait("opened popup", "window.gatePresented('[data-gate-popup]')");
      await settle();
      await evaluate("window.gateStartMotion('[data-gate-subpopup]')");
      await openSubmenuTrigger(views[0]);
      await settle();
      const enter = await evaluate(
        "window.gateMotionRunning=false; window.gateMotion",
      );
      // openSubmenuTrigger opens the submenu by hovering it - hover moves the
      // menu's roving highlight to the subtrigger item, but never moves real
      // keyboard focus INTO the submenu itself. Radix/Base's submenu
      // ArrowLeft handler only reacts when focus is already inside the
      // submenu, so ArrowLeft alone here would silently no-op. ArrowRight
      // from the (hover-highlighted) subtrigger is the standard key to move
      // focus into an already-open submenu's first item; assert it actually
      // landed there before trusting ArrowLeft to close it.
      await key("ArrowRight", 0);
      assert(
        await evaluate(
          "!!document.activeElement?.closest('[data-gate-subpopup]')",
        ),
        `${family}/${state}: ArrowRight must move focus into the submenu before ArrowLeft can close it`,
      );
      await evaluate("window.gateStartMotion('[data-gate-subpopup]')");
      await key("ArrowLeft", 0);
      await delay(500);
      await settle();
      assert(
        await evaluate(
          "!document.querySelector('[data-gate-subpopup]') && !!document.querySelector('[data-gate-popup]')",
        ),
        `${family}/${state}: ArrowLeft must close only the submenu, leaving the parent menu open`,
      );
      const exit = await evaluate(
        "window.gateMotionRunning=false; window.gateMotion",
      );
      recordMotion(family, state, enter, exit);
    }
  }
  await comparatorCheck();
  await probeChecks();
  if (knownDefects) {
    await knownDefectChecks();
  } else if (behavior) {
    const only = flag("--only");
    assert(
      !only || ["toast", "conceal", "nested"].includes(only),
      "Unknown behavior lane",
    );
    if (!only || only === "toast") await toastChecks();
    if (!only || only === "conceal") await concealChecks();
    if (!only || only === "nested") await nestedChecks();
    console.log(`PASS ${report.behavior.length} behavior cases`);
  } else {
    if (!args.includes("--motion")) {
      let count = 0;
      for (const [family, states] of Object.entries(inventory))
        for (const state of states) {
          if (
            flag("--from-family") &&
            Object.keys(inventory).indexOf(family) <
              Object.keys(inventory).indexOf(flag("--from-family"))
          )
            continue;
          if (args.includes("--smoke") && state !== states[0]) continue;
          if (
            flag("--filter") &&
            !`${family}/${state}`.includes(flag("--filter"))
          )
            continue;
          for (const theme of ["light", "dark"])
            for (const view of views) {
              if (flag("--theme") && theme !== flag("--theme")) continue;
              if (flag("--viewport") && view.name !== flag("--viewport"))
                continue;
              try {
                await visual(family, state, view, theme);
              } catch (error) {
                // Only a wedged renderer gets a second chance, and only once -
                // a real pixel/motion diff already returned normally (it's
                // accumulated in `diffFailures`, not thrown), and every other
                // failure (a `check`/`wait`/`assert` mismatch, a genuine CDP
                // socket error) still fails this case immediately.
                if (!isCdpTimeout(error)) throw error;
                console.error(
                  `RETRY ${current}: ${error.message} - restarting the browser and retrying once`,
                );
                await restartBrowser();
                await visual(family, state, view, theme);
              }
              count++;
              if (count % 30 === 0)
                console.log(`Checked ${count} images; ${current}`);
            }
        }
      assert(count > 0, "No matching cases");
      console.log(
        `Checked ${count} images${baseline ? `, ${diffFailures.length} pixel difference(s)` : " captured"}`,
      );
    }
    if (!flag("--filter")) await motionChecks();
  }
  if (out)
    await writeCandidate(
      path.join(out, "manifest.json"),
      JSON.stringify(report, null, 2) + "\n",
    );
  // Every accumulated pixel/motion diff, from either a full or a `--filter`
  // run: reported together and gated here rather than at the point each one
  // was found, so one residual raster difference never hides the rest.
  if (diffFailures.length) {
    console.error(
      `FAIL ${diffFailures.length} pixel/motion diff(s):\n${diffFailures.join("\n")}`,
    );
    if (out)
      await writeCandidate(
        path.join(out, "diff-failures.json"),
        JSON.stringify(diffFailures, null, 2) + "\n",
      );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`FAIL ${current}:`, error);
  if (out) {
    await mkdir(out, { recursive: true });
    await writeCandidate(
      path.join(out, "failure.json"),
      JSON.stringify(
        { case: current, error: String(error), exceptions, report },
        null,
        2,
      ),
    );
  }
  process.exitCode = 1;
} finally {
  await cleanup();
}
// Replacing a candidate atomically also avoids following an existing output
// file symlink or modifying a hard-linked reference PNG in place.
async function writeCandidate(file, bytes) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  try {
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function evaluate(expression) {
  const r = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description ?? r.exceptionDetails.text,
    );
  return r.result.value;
}
async function wait(label, expression) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (exceptions.length) throw new Error(exceptions.join("\n"));
    if (await evaluate(expression)) return;
    await delay(20);
  }
  throw new Error(
    `Timed out: ${label}; ${await evaluate("document.body.innerText.slice(0,2000)")}`,
  );
}
async function check(label, expression) {
  assert(
    await evaluate(expression),
    `${label}: ${await evaluate("JSON.stringify({...document.querySelector('[data-gate-state]').dataset,focus:document.activeElement.outerHTML})")}`,
  );
}
async function settle() {
  await evaluate(
    `(async()=>{for(let round=0;round<5;round++){await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const all=document.getAnimations().filter(a=>a.playState==='running');for(const a of all)if(a.effect?.getTiming().iterations===Infinity){a.pause();a.currentTime=0;}const finite=all.filter(a=>a.effect?.getTiming().iterations!==Infinity);if(!finite.length)return;await Promise.race([Promise.all(finite.map(a=>a.finished.catch(()=>undefined))),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Animations did not settle')),3000))]);}throw new Error('Animation queue did not settle');})()`,
  );
}
async function center(selector) {
  return evaluate(
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();if(!r.width||!r.height)throw new Error('Not presented '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
}
async function hoverSelector(selector) {
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...(await center(selector)),
  });
}
async function clickSelector(selector, button, hitTest) {
  const p = await center(selector);
  if (hitTest)
    assert(
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).contains(document.elementFromPoint(${p.x},${p.y}))`,
      ),
      `Hit target blocked: ${selector}; ${await evaluate("JSON.stringify({hit:document.elementFromPoint(" + p.x + "," + p.y + ")?.outerHTML, target:document.querySelector(" + JSON.stringify(selector) + ")?.outerHTML, bodyPointer:getComputedStyle(document.body).pointerEvents})")}`,
    );
  await clickAt(p.x, p.y, button);
}
async function clickAt(x, y, button) {
  await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button,
    buttons: button === "right" ? 2 : 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button,
    buttons: 0,
    clickCount: 1,
  });
}
async function tapAt(x, y) {
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}
async function key(key, modifiers) {
  const codes = {
    Tab: 9,
    Enter: 13,
    Escape: 27,
    ArrowLeft: 37,
    ArrowRight: 39,
    ArrowDown: 40,
    t: 84,
  };
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: key === "Enter" ? "\r" : "",
    key,
    code: key === "t" ? "KeyT" : key,
    windowsVirtualKeyCode: codes[key],
    modifiers,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key === "t" ? "KeyT" : key,
    windowsVirtualKeyCode: codes[key],
    modifiers,
  });
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url),
      pending = new Map();
    let next = 0;
    const timer = setTimeout(
      () => reject(new Error("CDP connection timed out")),
      15000,
    );
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
    };
    socket.addEventListener("error", () => fail(new Error("CDP socket error")));
    socket.addEventListener("close", () =>
      fail(new Error("CDP socket closed")),
    );
    socket.addEventListener("message", (event) => {
      const m = JSON.parse(String(event.data));
      if (m.method === "Runtime.exceptionThrown")
        exceptions.push(
          m.params.exceptionDetails.exception?.description ??
            m.params.exceptionDetails.text,
        );
      const item = pending.get(m.id);
      if (!item) return;
      pending.delete(m.id);
      clearTimeout(item.timer);
      if (m.error) item.reject(new Error(m.error.message));
      else item.resolve(m.result);
    });
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve({
        send(method, params) {
          return new Promise((resolve, reject) => {
            const id = ++next;
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error(`CDP timeout: ${method}`));
            }, 45000);
            pending.set(id, { resolve, reject, timer });
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

/**
 * `Runtime.evaluate` past `connect()`'s own 45s per-call timeout - not just
 * one slow call, but a wedged renderer (an infinite loop, accumulated memory,
 * a hung microtask queue in the page under test) that a fresh page in the
 * SAME process would inherit. Deliberately exact, not any CDP method: a
 * `Page.navigate` or `Input.dispatchMouseEvent` timing out is a different,
 * probably-infrastructure problem this retry isn't built for. Distinct from
 * every other failure mode this script has, too - a pixel/motion diff, a
 * `check`/`wait`/`assert` mismatch, or an actual CDP socket error all mean
 * something real to report, and must keep failing immediately.
 */
function isCdpTimeout(error) {
  return (
    error instanceof Error && error.message === "CDP timeout: Runtime.evaluate"
  );
}

/**
 * Launches Chrome, opens one target and connects a CDP client to it, and
 * registers the page bootstrap script - the exact sequence the original
 * startup and `restartBrowser` both need, so a restart can't drift from the
 * first launch. Assigns the module-level `chrome`/`client` the moment each is
 * acquired, before any step that can still fail (the target fetch, the
 * connect, `Page.enable`) - so a failure here always leaves the globals
 * pointing at whatever process/socket was actually opened, and `cleanup()`
 * (the top-level `finally`, and the SIGINT handler) tears down the real
 * thing instead of leaking a spawned Chrome that no reference survived to.
 */
async function launchBrowserAndTarget() {
  chrome = await launchChromeWithDevTools(
    await findChrome("the primitive gate"),
    "traycer-primitive-gate-",
    CHROME_LAUNCH_FLAGS,
  );
  const response = await fetch(
    new URL("/json/new?about:blank", chrome.devtoolsHttpUrl),
    { method: "PUT" },
  );
  assert(response.ok);
  const target = await response.json();
  client = await connect(target.webSocketDebuggerUrl);
  await client.send("Page.enable", {});
  await client.send("Runtime.enable", {});
  const version = await client.send("Browser.getVersion", {});
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: BOOTSTRAP_SCRIPT_SOURCE,
  });
  return version;
}

/**
 * Recovers from a wedged renderer with a FULL Chrome restart - terminating
 * the old process tree and removing its profile before relaunching, so
 * accumulated renderer memory and any hung process state actually reset
 * rather than carrying over into a same-process fresh tab. Captures the old
 * `chrome`/`client` in locals first, because `launchBrowserAndTarget` reuses
 * those same module-level names for the replacement the instant it acquires
 * one. Verifies the relaunch is still the identical pinned binary
 * (`Browser.getVersion` must agree with the original); a mismatch throws
 * AFTER the globals already point at the new process, so the top-level
 * cleanup tears down the mismatched new Chrome rather than the one already
 * terminated above.
 */
async function restartBrowser() {
  const oldChrome = chrome;
  const oldClient = client;
  oldClient?.close();
  await terminateProcessTree(oldChrome.chrome);
  await rm(oldChrome.profilePath, {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
  const version = await launchBrowserAndTarget();
  assert.equal(
    version.product,
    chromeVersion.product,
    `Restarted Chrome product differs from the original (${version.product} vs ${chromeVersion.product})`,
  );
  assert.equal(
    version.revision,
    chromeVersion.revision,
    `Restarted Chrome revision differs from the original (${version.revision} vs ${chromeVersion.revision})`,
  );
}

// Installed in each fresh document; selectors are app-owned, not library markers.
function installPresentationProbes() {
  window.gatePainted = (el) => {
    if (!(el instanceof Element) || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (
      !r.width ||
      !r.height ||
      r.bottom <= 0 ||
      r.right <= 0 ||
      r.top >= innerHeight ||
      r.left >= innerWidth
    )
      return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (
        node.hidden ||
        style.display === "none" ||
        style.visibility !== "visible" ||
        Number(style.opacity) === 0
      )
        return false;
    }
    return true;
  };
  window.gatePresented = (selector) =>
    [...document.querySelectorAll(selector)].some((el) => {
      if (
        !window.gatePainted(el) ||
        el.closest('[inert], [aria-hidden="true"]')
      )
        return false;
      // Passive tooltip/preview surfaces need not receive pointer events.
      if (getComputedStyle(el).pointerEvents === "none")
        return el.matches(
          "[data-slot=tooltip-content], [data-slot=hover-card-content]",
        );
      const r = el.getBoundingClientRect();
      return [
        [0.5, 0.5],
        [0.1, 0.1],
        [0.9, 0.9],
      ].some(([x, y]) => {
        const hit = document.elementFromPoint(
          Math.max(0, Math.min(innerWidth - 1, r.x + r.width * x)),
          Math.max(0, Math.min(innerHeight - 1, r.y + r.height * y)),
        );
        return hit && el.contains(hit);
      });
    });
  window.gateSurfacesHidden = () => {
    if (
      [
        ...document.querySelectorAll(
          "[data-gate-popup], [data-gate-subpopup], [data-slot=dialog-overlay], [data-slot=sheet-overlay]",
        ),
      ].some(window.gatePainted)
    )
      return false;
    return ![
      ...document.querySelectorAll(
        '[data-gate-positioner], [data-slot$="-positioner"]',
      ),
    ].some((el) => {
      if (!window.gatePainted(el)) return false;
      const s = getComputedStyle(el),
        r = el.getBoundingClientRect();
      // A transparent, pointer-inert positioner around hidden retained content
      // has geometry but paints nothing. A backdrop or an intercepting box does.
      const colorVisible = (color) =>
        color !== "transparent" &&
        !(color.startsWith("rgba(") && color.endsWith(", 0)"));
      const paints =
        colorVisible(s.backgroundColor) ||
        s.backgroundImage !== "none" ||
        s.boxShadow !== "none" ||
        ["Top", "Right", "Bottom", "Left"].some(
          (side) =>
            parseFloat(s["border" + side + "Width"]) > 0 &&
            colorVisible(s["border" + side + "Color"]),
        );
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return paints || (hit && el.contains(hit));
    });
  };
  window.gateLockStyles = () =>
    [document.documentElement, document.body].map((el) => {
      const s = getComputedStyle(el);
      return [
        s.overflowX,
        s.overflowY,
        s.position,
        s.touchAction,
        s.pointerEvents,
      ];
    });
}
// Rendered motion, independent of animation count, CSS animation vs transition,
// and whether the movement belongs to the popup or an ancestor positioner.
function installMotionProbe() {
  window.gateMeasureMotion = (popup, animations, offsets) => {
    const tracks = animations.map((animation, index) => ({
      animation,
      offset: offsets[index],
      startTime: animation.startTime,
      effect: animation.effect,
      time: animation.currentTime,
      state: animation.playState,
      timing: animation.effect.getTiming(),
      computed: animation.effect.getComputedTiming(),
    }));
    if (!tracks.length) return null;
    const round = (value) => Math.round(value * 100) / 100;
    const duration = Math.max(
      ...tracks.map(
        (t) => t.offset + t.computed.endTime / t.animation.playbackRate,
      ),
    );
    const start = Math.min(
      ...tracks.map(
        (t) => t.offset + t.timing.delay / t.animation.playbackRate,
      ),
    );
    const end = Math.max(
      ...tracks.map(
        (t) =>
          t.offset +
          (t.timing.delay + t.computed.activeDuration) /
            t.animation.playbackRate,
      ),
    );
    for (const t of tracks) {
      t.animation.pause();
      t.effect.updateTiming({ fill: "both" });
    }
    const sample = (time) => {
      for (const t of tracks)
        t.animation.currentTime = (time - t.offset) * t.animation.playbackRate;
      const r = popup.getBoundingClientRect();
      let opacity = 1;
      for (let el = popup; el; el = el.parentElement)
        opacity *= Number(getComputedStyle(el).opacity);
      return {
        rect: [r.x, r.y, r.width, r.height].map(round),
        opacity: round(opacity),
      };
    };
    const from = sample(start),
      to = sample(end);
    for (const t of tracks) {
      t.effect.updateTiming({ fill: t.timing.fill });
      t.animation.currentTime = t.time;
      if (t.state === "running") {
        t.animation.play();
        if (t.startTime !== null) t.animation.startTime = t.startTime;
      }
    }
    return {
      totalDuration: round(duration),
      activeStart: round(start),
      activeEnd: round(end),
      from,
      to,
    };
  };
  window.gateStartMotion = (selector) => {
    cancelAnimationFrame(window.gateMotionFrame);
    window.gateMotion = null;
    window.gateMotionRunning = true;
    const seen = new WeakMap();
    const timeline = [];
    const round = (value) => Math.round(value * 100) / 100;
    const tick = () => {
      if (!window.gateMotionRunning) return;
      const popup = document.querySelector(selector);
      if (popup) {
        const animations = document
          .getAnimations()
          .filter(
            (a) =>
              a.effect?.target instanceof Element &&
              (a.effect.target === popup || a.effect.target.contains(popup)) &&
              a.effect.getComputedTiming().iterations !== Infinity &&
              a.playState !== "finished" &&
              a.startTime !== null,
          );
        let changed = false;
        for (const animation of animations) {
          // Retain earlier effects and replayed incarnations after they finish.
          // startTime is a document-timeline timestamp, not an effect-local time.
          const start = Number(animation.startTime);
          if (seen.get(animation) === start) continue;
          seen.set(animation, start);
          const timing = animation.effect.getComputedTiming();
          timeline.push({
            start,
            activeStart: start + timing.delay / animation.playbackRate,
            activeEnd:
              start +
              (timing.delay + timing.activeDuration) / animation.playbackRate,
            end: start + timing.endTime / animation.playbackRate,
          });
          changed = true;
        }
        if (changed) {
          const origin = Math.min(...timeline.map((t) => t.start));
          const sampled = window.gateMeasureMotion(
            popup,
            animations,
            animations.map((a) => Number(a.startTime) - origin),
          );
          const first = window.gateMotion;
          window.gateMotion = {
            timeline: "phase",
            totalDuration: round(
              Math.max(...timeline.map((t) => t.end)) - origin,
            ),
            activeStart: round(
              Math.min(...timeline.map((t) => t.activeStart)) - origin,
            ),
            activeEnd: round(
              Math.max(...timeline.map((t) => t.activeEnd)) - origin,
            ),
            from: first ? first.from : sampled.from,
            to: sampled.to,
          };
        }
      }
      window.gateMotionFrame = requestAnimationFrame(tick);
    };
    window.gateMotionFrame = requestAnimationFrame(tick);
  };
}
