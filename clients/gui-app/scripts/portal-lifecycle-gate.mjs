// T06 production lifecycle gate — CDP driver for
// src/__tests__/browser/portal-lifecycle-gate.tsx. Runs in run-tests.ts
// alongside the primitive behavior gate, preserving T02's promoted cases.
// Run directly: `node scripts/portal-lifecycle-gate.mjs`.
// GATE_CASE narrows to matching test names, same convention as PROOF_CASE.
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";
import {
  findChrome,
  launchChromeWithDevTools,
  terminateProcessTree,
} from "./chrome-launcher.mjs";

const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const exceptions = [];
let client;
const server = await createServer({
  configFile: path.join(project, "vitest.config.ts"),
  server: { port: 0, host: "127.0.0.1" },
});
await server.listen();
const origin = server.resolvedUrls.local[0];
const chrome = await launchChromeWithDevTools(
  await findChrome("Portal lifecycle gate"),
  "traycer-portal-lifecycle-",
  ["--force-device-scale-factor=1"],
);
const report = { cases: [] };
try {
  const response = await fetch(
    new URL("/json/new?about:blank", chrome.devtoolsHttpUrl),
    { method: "PUT" },
  );
  client = await connect((await response.json()).webSocketDebuggerUrl);
  await client.send("Page.enable", {});
  await client.send("Runtime.enable", {});
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${installPresentationProbes.toString()})()`,
  });
  report.chrome = await client.send("Browser.getVersion", {});
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1000,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  let sequence = 0;
  async function load(query) {
    exceptions.length = 0;
    const url = new URL(
      "src/__tests__/browser/portal-lifecycle-gate.html?" +
        query +
        "&sequence=" +
        ++sequence,
      origin,
    );
    await client.send("Page.navigate", { url: url.href });
    await wait(
      "fixture",
      `location.href===${JSON.stringify(url.href)} && !!window.gate && !!document.querySelector('[data-gate-trigger]')`,
    );
    await delay(100);
  }
  async function snapshot() {
    return evaluate(
      `({state:{...document.querySelector('[data-gate-state]')?.dataset},popupPresented:window.gatePresented('[data-gate-popup]'),draft:document.querySelector('[data-gate-draft]')?.value,nestedDraft:document.querySelector('[data-gate-nested-draft]')?.value,events:window.gate.events,focusEvents:window.gate.focusEvents,active:document.activeElement?.outerHTML.slice(0,200)})`,
    );
  }
  async function test(name, fn) {
    if (process.env.GATE_CASE && !name.includes(process.env.GATE_CASE)) return;
    try {
      const evidence = await fn();
      if (exceptions.length) throw new Error(exceptions.join("\n"));
      report.cases.push({ name, pass: true, evidence });
      console.log("PASS", name);
    } catch (error) {
      report.cases.push({
        name,
        pass: false,
        error: String(error),
        snapshot: await snapshot(),
      });
      console.error("FAIL", name, String(error));
    }
  }

  for (const family of ["dialog", "popover"])
    for (const controlled of [true, false]) {
      const label = `${family} ${controlled ? "controlled" : "uncontrolled"}`;

      await test(`${label} retains logical state and draft across a concealment round-trip, no spurious change/complete`, async () => {
        await load(`family=${family}&controlled=${controlled}`);
        await clickSelector("[data-gate-trigger]", "left", true);
        await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
        await delay(180);
        const opened = await snapshot();
        assert.equal(opened.state.changes, "1");
        assert.equal(opened.state.completes, "1");
        await evaluate(
          `document.querySelector('[data-gate-draft]').focus();document.querySelector('[data-gate-draft]').select()`,
        );
        await client.send("Input.insertText", { text: "typed value" });
        const typed = await snapshot();
        assert.equal(typed.draft, "typed value");

        await evaluate("window.gate.conceal(true)");
        await delay(250);
        const concealed = await snapshot();
        assert.equal(concealed.popupPresented, false);
        assert.equal(concealed.state.changes, "1");
        assert.equal(concealed.state.completes, "1");
        assert.equal(concealed.state.finals, "0");

        await evaluate("window.gate.conceal(false)");
        await delay(250);
        const returned = await snapshot();
        assert.equal(returned.popupPresented, true);
        assert.equal(returned.draft, "typed value");
        assert.equal(returned.state.changes, "1");
        assert.equal(returned.state.completes, "1");
        assert.equal(returned.state.finals, "0");
        return { opened, typed, concealed, returned };
      });

      await test(`${label} Activity actually disconnects content while concealed and reconnects on return`, async () => {
        await load(`family=${family}&controlled=${controlled}`);
        await clickSelector("[data-gate-trigger]", "left", true);
        await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
        await delay(180);
        const before = await snapshot();
        assert(before.events.includes("content:connect"));
        assert(!before.events.includes("content:disconnect"));

        await evaluate("window.gate.conceal(true)");
        await wait(
          "content disconnects",
          "window.gate.events.includes('content:disconnect')",
        );
        const hidden = await snapshot();
        assert.equal(
          hidden.events.filter((e) => e === "content:connect").length,
          1,
        );
        assert.equal(
          hidden.events.filter((e) => e === "content:disconnect").length,
          1,
        );

        await evaluate("window.gate.conceal(false)");
        await delay(250);
        const returned = await snapshot();
        assert.equal(
          returned.events.filter((e) => e === "content:connect").length,
          2,
          "content reconnects once returned - Activity really remounted it, not just a CSS hide",
        );
        return { before, hidden, returned };
      });

      await test(`${label} a rapid conceal/reveal never leaves content disconnected, retains state through it`, async () => {
        await load(`family=${family}&controlled=${controlled}`);
        await clickSelector("[data-gate-trigger]", "left", true);
        await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
        await delay(180);
        const before = await snapshot();
        assert.equal(
          before.events.filter((e) => e === "content:connect").length,
          1,
        );

        // `rapidConcealReveal()` commits the first flip (flushSync) then
        // issues the second right after in the same turn, no delay - the
        // fastest interruption reachable from outside React. Measured:
        // `content:disconnect` fires anyway (React's own passive-effect
        // flush from the first commit wins the race either way), so this
        // asserts what is actually true - content ends up connected, never
        // left mid-teardown, and every counter is retained exactly as a
        // normal round-trip.
        await evaluate("window.gate.rapidConcealReveal()");
        await delay(250);
        const after = await snapshot();
        assert.equal(after.popupPresented, true);
        const connects = after.events.filter(
          (e) => e === "content:connect",
        ).length;
        const disconnects = after.events.filter(
          (e) => e === "content:disconnect",
        ).length;
        assert.equal(
          connects,
          disconnects + 1,
          "content must end up connected - never left mid-teardown",
        );
        assert.equal(after.state.changes, before.state.changes);
        assert.equal(after.state.completes, before.state.completes);
        assert.equal(after.state.finals, "0");
        return { before, after, connects, disconnects };
      });

      await test(`${label} an ordinary Escape close (not concealed) completes, calls finalFocus, and returns focus to the trigger`, async () => {
        await load(`family=${family}&controlled=${controlled}`);
        await clickSelector("[data-gate-trigger]", "left", true);
        await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
        await delay(180);
        await key("Escape", 0);
        await delay(250);
        const after = await snapshot();
        assert.equal(after.state.changes, "2");
        assert.equal(after.state.completes, "2");
        assert.equal(after.state.finals, "1");
        assert(after.active.includes("data-gate-trigger"));
        return after;
      });
    }

  for (const family of ["dialog", "popover"])
    for (const control of ["focus", "visible"]) {
      const label = `${family} pane-${control}`;
      await test(`${label} loss un-presents through the real SurfacePresentationBoundary (paneAware), retains, and returns focus to Pane B`, async () => {
        await load(`family=${family}&controlled=true`);
        await clickSelector("[data-gate-trigger]", "left", true);
        await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
        await delay(180);
        const before = await snapshot();
        assert.equal(before.state.changes, "1");
        assert.equal(before.state.completes, "1");

        const attribute = { focus: "focused", visible: "visible" }[control];
        await evaluate(`window.gate.${control}Pane(false)`);
        await wait(
          "pane state committed",
          `document.querySelector('[data-gate-pane-state]').dataset.${attribute}==='false'`,
        );
        await delay(250);
        const lost = await snapshot();
        // useOverlayPresentation's own `present = !concealed && (!paneAware
        // || paneFocused)` treats EITHER focus loss or visibility loss as a
        // presentation loss - Dialog/Popover are both `paneAware: true`, so
        // there is no case where the popup stays visually presented while
        // its pane is unfocused. It behaves exactly like concealment: the
        // popup un-presents, nothing counts as a real close, and the pane
        // switch moves focus straight to Pane B - never left dangling on a
        // now-hidden popup control.
        assert.equal(lost.popupPresented, false);
        assert.equal(lost.state.changes, "1");
        assert.equal(lost.state.completes, "1");
        assert.equal(lost.state.finals, "0");
        assert.deepEqual(lost.focusEvents, ["B"]);
        assert(lost.active.includes("data-gate-outside"));

        await evaluate(`window.gate.${control}Pane(true)`);
        // Rapid: focus must land in the popup quickly, not just eventually.
        await wait(
          "rapid focused return lands focus in the popup",
          "document.querySelector('[data-gate-popup]')?.contains(document.activeElement) === true",
        );
        await delay(250);
        const returned = await snapshot();
        assert.equal(returned.popupPresented, true);
        assert.equal(returned.state.changes, "1");
        assert.equal(returned.state.completes, "1");
        assert.equal(returned.state.finals, "0");
        // Settled: still true after the full round-trip has quiesced.
        assert(
          await evaluate(
            "document.querySelector('[data-gate-popup]').contains(document.activeElement)",
          ),
          "settled focused return must land focus inside the popup",
        );
        return { before, lost, returned };
      });
    }

  for (const family of ["dialog", "popover"])
    await test(`${family} a visibility-only return while still unfocused never refocuses the popup; focus returning after does`, async () => {
      await load(`family=${family}&controlled=true`);
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
      await delay(180);

      await evaluate("window.gate.focusPane(false)");
      await wait(
        "pane focus lost",
        "document.querySelector('[data-gate-pane-state]').dataset.focused==='false'",
      );
      await evaluate("window.gate.visiblePane(false)");
      await wait(
        "pane visibility lost",
        "document.querySelector('[data-gate-pane-state]').dataset.visible==='false'",
      );
      await delay(250);

      // `usePaneFocused()` is `focused && visible` - restoring visibility
      // ALONE, while focus is still lost, must not re-present or refocus
      // anything.
      await evaluate("window.gate.focusEvents.length = 0");
      await evaluate("window.gate.visiblePane(true)");
      await delay(250);
      const visibleOnly = await snapshot();
      assert.equal(visibleOnly.popupPresented, false);
      assert.deepEqual(visibleOnly.focusEvents, []);
      assert(visibleOnly.active.includes("data-gate-outside"));

      // Now restore focus too - this is the axis that actually re-presents.
      await evaluate("window.gate.focusPane(true)");
      await wait(
        "focused return lands focus in the popup",
        "document.querySelector('[data-gate-popup]')?.contains(document.activeElement) === true",
      );
      await delay(250);
      const focusedToo = await snapshot();
      assert.equal(focusedToo.popupPresented, true);
      assert(
        await evaluate(
          "document.querySelector('[data-gate-popup]').contains(document.activeElement)",
        ),
      );
      return { visibleOnly, focusedToo };
    });

  for (const family of ["dialog", "popover"])
    await test(`${family} controlled owner close while concealed never reopens`, async () => {
      await load(`family=${family}&controlled=true`);
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
      await delay(180);
      const before = await snapshot();

      await evaluate(
        "window.gate.conceal(true);document.querySelector('[data-gate-outside]').focus()",
      );
      await delay(180);
      // The owner's own close and the presentation return land in the same
      // synchronous turn - close must win regardless of order (T02's
      // `owner close while concealed never reopens`, promoted here).
      await evaluate("window.gate.closeOwner();window.gate.conceal(false)");
      await delay(500);
      const after = await snapshot();
      assert.equal(after.popupPresented, false);
      assert.equal(after.state.changes, before.state.changes);
      assert.equal(after.state.completes, before.state.completes);
      assert.equal(after.state.initials, before.state.initials);
      assert.equal(after.state.finals, before.state.finals);
      assert(after.active.includes("data-gate-outside"));
      return { before, after };
    });

  for (const family of ["dialog", "popover"])
    await test(`${family} R1: a genuine pane transfer during close must not be stolen back by the queued final-focus restore`, async () => {
      // Base resolves `finalFocus` during effect cleanup and performs the
      // actual `.focus()` in a LATER queued microtask - review R1's finding
      // was that a real focus move happening in that gap (a pane transfer
      // that lands the instant the popup's DOM node is removed) got
      // stomped by that stale queued restore. Race the two here: arm an
      // observer that fires `focusPane(false)` (the SAME real transfer the
      // pane-loss cases above use) the instant the popup disconnects, then
      // close for real (Escape, not a programmatic close) so the queued
      // restore is actually scheduled and racing it.
      await load(`family=${family}&controlled=true`);
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
      await delay(180);
      await evaluate("window.gate.focusEvents.length = 0");
      await evaluate(`
        window.__gateRace = new MutationObserver(() => {
          if (!document.querySelector('[data-gate-popup]')) {
            window.__gateRace.disconnect();
            window.gate.focusPane(false);
          }
        });
        window.__gateRace.observe(document.body, { childList: true, subtree: true });
      `);
      await key("Escape", 0);
      await delay(300);
      const after = await snapshot();
      // The full sequence, not just the final element: a late steal would
      // append a second entry (the trigger doesn't match `[data-gate-outside]`,
      // so it records as another "A"), even if a subsequent check only read
      // the final activeElement and happened to still see B by then.
      assert.deepEqual(
        after.focusEvents,
        ["B"],
        "a stale queued restore reactivated the unfocused pane after B already took focus",
      );
      assert(after.active.includes("data-gate-outside"));
      return after;
    });

  for (const family of ["dialog", "popover"])
    await test(`${family} R2: a genuine owner unmount of an open Root still restores the connected opener`, async () => {
      // The owner never flips `open` to `false` here - it removes the whole
      // Root while `open` stays a literal `true` (ThemeManager's real
      // pattern). `finalAllowed` must permit this via the mounted-ref path,
      // not just the ordinary `!cycle.open` path the other cases exercise.
      await load(`family=${family}&conditionalRoot=true`);
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
      await delay(180);
      const before = await snapshot();
      assert.equal(before.state.finals, "0");

      await evaluate("window.gate.closeOwner()");
      await wait(
        "the Root actually unmounts, not just closes",
        "!document.querySelector('[data-gate-popup]')",
      );
      await delay(300);
      const after = await snapshot();
      assert.equal(
        after.state.finals,
        "1",
        "finalFocus must still fire when the owner unmounts the open Root outright",
      );
      assert(
        after.active.includes("data-gate-trigger"),
        "focus must return to the connected opener, not be left on document.body",
      );
      return { before, after };
    });

  for (const mode of ["tab", "outside"])
    await test(`popover R4: a nonmodal dismissal (${mode}) lands the complete focus-event sequence on the real destination, not a restore to the trigger`, async () => {
      // Base suppresses restoration after focus-out, including Tab-out and
      // a click on another focusable control. Preserve the destination.
      await load("family=popover&controlled=true");
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
      await delay(180);
      if (mode === "tab")
        // Focus the popup's own last control first, so Tab is a genuine
        // Tab-out of the popup, not a Tab from wherever focus already was.
        await evaluate("document.querySelector('[data-gate-close]').focus()");
      // Only the gesture's own focus events matter here - clear right
      // before firing it, not after opening (which has its own initial-focus
      // transit into the popup that would otherwise contaminate the count).
      await evaluate("window.gate.focusEvents.length = 0");
      if (mode === "tab") await key("Tab", 0);
      else await clickSelector("[data-gate-outside]", "left", true);
      await wait(
        "the popup actually unmounts, not just loses focus",
        "!document.querySelector('[data-gate-popup]')",
      );
      await delay(300);
      const after = await snapshot();
      assert(
        after.active.includes("data-gate-outside"),
        `a nonmodal ${mode} dismissal must land focus on the actual destination ([data-gate-outside]), not be overridden by a return-focus restore to the trigger`,
      );
      // The fixture records native data-base-ui-focus-guard transits as G.
      // All application focus events must still be exactly one transition to B.
      assert.deepEqual(
        after.focusEvents.filter((event) => event !== "G"),
        ["B"],
        `the ${mode} dismissal's real (non-guard) focus-event sequence must be exactly one transition to B: ${JSON.stringify(after.focusEvents)}`,
      );
      return after;
    });

  await test(`popover R4 parity: an outside press on plain non-focusable background must land focus exactly where native Base does`, async () => {
    // Pin the measured Base 1.8 background-press contract as well as comparing
    // live native and production results, so a shared behavior change fails too.
    const RECORDED_NATIVE_BASE_1_8_LANDS_ON_TRIGGER = true;
    const RECORDED_NATIVE_BASE_1_8_LANDS_ON_BODY = false;

    await load("family=popover&native=true");
    await clickSelector("[data-gate-trigger]", "left", true);
    await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
    await delay(180);
    assert.equal(
      await evaluate(
        "document.elementFromPoint(500,600)?.matches('[data-gate-background]')",
      ),
      true,
      "background click point must actually be an uncovered, non-focusable background element (native)",
    );
    await clickAt(500, 600, "left");
    await wait(
      "the native popup actually unmounts, proving the press really closed it",
      "!document.querySelector('[data-gate-popup]')",
    );
    await delay(300);
    // Compare identity (which element), not the raw markup - production's
    // wrapper adds its own incidental attributes (e.g. `data-slot`) to the
    // same trigger node, which would make an outerHTML string compare fail
    // for a reason that has nothing to do with WHERE focus landed.
    const nativeIsTrigger = await evaluate(
      "document.activeElement?.matches('[data-gate-trigger]') ?? false",
    );
    const nativeIsBody = await evaluate(
      "document.activeElement === document.body",
    );
    assert.equal(
      nativeIsTrigger,
      RECORDED_NATIVE_BASE_1_8_LANDS_ON_TRIGGER,
      "native Base's own measured contract changed - re-verify this case and update the recorded constants before trusting the dynamic compare below",
    );
    assert.equal(nativeIsBody, RECORDED_NATIVE_BASE_1_8_LANDS_ON_BODY);

    await load("family=popover&controlled=true");
    await clickSelector("[data-gate-trigger]", "left", true);
    await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
    await delay(180);
    assert.equal(
      await evaluate(
        "document.elementFromPoint(500,600)?.matches('[data-gate-background]')",
      ),
      true,
      "background click point must actually be an uncovered, non-focusable background element (production)",
    );
    await clickAt(500, 600, "left");
    await wait(
      "the production popup actually unmounts, proving the press really closed it",
      "!document.querySelector('[data-gate-popup]')",
    );
    await delay(300);
    const after = await snapshot();
    const afterIsTrigger = after.active.includes("data-gate-trigger");
    const afterIsBody = after.active.startsWith("<body");

    assert.equal(
      afterIsTrigger,
      nativeIsTrigger,
      `production's outside press on plain background must match native Base's own measured behavior (native landed on trigger: ${nativeIsTrigger})`,
    );
    assert.equal(
      afterIsBody,
      nativeIsBody,
      `production's outside press on plain background must match native Base's own measured behavior (native landed on body: ${nativeIsBody})`,
    );
    return { nativeIsTrigger, nativeIsBody, after };
  });

  for (const family of ["dialog", "popover"])
    await test(`${family} R5: Escape restores the connected opener even when a child self-focused in its own mount effect`, async () => {
      // Child effects can focus inside before Base resolves initialFocus;
      // opener capture must already have happened.
      await load(`family=${family}&controlled=true&autofocus=true`);
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait(
        "the self-focusing child lands focus inside the popup",
        "document.querySelector('[data-gate-popup]')?.contains(document.activeElement)",
      );
      await delay(180);
      await key("Escape", 0);
      await delay(300);
      const after = await snapshot();
      assert(
        after.active.includes("data-gate-trigger"),
        "a child that self-focused before the deferred initialFocus resolver ran must not leave Escape with no return target",
      );
      return after;
    });

  for (const family of ["dialog", "popover"])
    await test(`${family} R5: a triggerless conditional root still captures the previous opener before a child self-focuses`, async () => {
      // No DialogTrigger/PopoverTrigger exists in conditionalRoot mode, so
      // the aria-controls lookup can never find a trigger - the capture must
      // fall back to "the previously active element", and must do so BEFORE
      // the child's mount-effect self-focus moves it.
      await load(`family=${family}&conditionalRoot=true&autofocus=true`);
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
      await wait(
        "the self-focusing child lands focus inside the popup",
        "document.querySelector('[data-gate-popup]')?.contains(document.activeElement)",
      );
      await delay(180);
      await evaluate("window.gate.closeOwner()");
      await wait(
        "the Root actually unmounts",
        "!document.querySelector('[data-gate-popup]')",
      );
      await delay(300);
      const after = await snapshot();
      assert(
        after.active.includes("data-gate-trigger"),
        "a triggerless conditional root's previous-opener capture must survive a child self-focusing before the deferred resolver runs",
      );
      return after;
    });

  for (const family of ["dialog", "popover"])
    await test(`${family} controlled a rapid open→close interrupts the enter before it ever completes, settles closed with no stale completion`, async () => {
      await load(`family=${family}&controlled=true`);
      const before = await snapshot();
      assert.equal(before.state.changes, "0");
      assert.equal(before.state.completes, "0");

      await evaluate("window.gate.rapidOpenClose()");
      await delay(500);
      const after = await snapshot();
      assert.equal(after.popupPresented, false);
      assert(
        !after.events.includes("complete:true"),
        "an interrupted enter must not leave a stale open-completion behind",
      );
      return { before, after };
    });

  for (const family of ["dialog", "popover"])
    await test(`${family} initialFocus re-fires on a presentation-loss return, Activity-conceal doubly so`, async () => {
      await load(`family=${family}&controlled=true`);
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
      await delay(180);
      const opened = await snapshot();
      assert.equal(opened.state.initials, "1");

      // Measured: `focusPane`/`visiblePane` loss-and-return is an ordinary
      // Base open/close toggle on the same mounted Popup, so `initialFocus`
      // re-fires once per return. `conceal` goes through Activity instead,
      // which detaches+re-runs the whole subtree's effects (including
      // FloatingFocusManager's setup) on the way back, firing it TWICE.
      // `finals` never moves either way (D13). This Activity+2/ordinary+1
      // asymmetry is already asserted by T02, not a new finding.
      //
      // `conceal`'s boolean is CONCEALED (true=hide), while `focusPane`/
      // `visiblePane`'s boolean is PRESENTED (true=show) - opposite
      // polarity, so each pair below is [hide-call, show-call] in its own
      // control's own terms.
      const roundTrips = {
        conceal: { calls: ["true", "false"], initialsPerReturn: 2 },
        focusPane: { calls: ["false", "true"], initialsPerReturn: 1 },
        visiblePane: { calls: ["false", "true"], initialsPerReturn: 1 },
      };
      let expectedInitials = 1;
      for (const [
        control,
        {
          calls: [hide, show],
          initialsPerReturn,
        },
      ] of Object.entries(roundTrips)) {
        await evaluate(`window.gate.${control}(${hide})`);
        await delay(250);
        await evaluate(`window.gate.${control}(${show})`);
        await delay(250);
        expectedInitials += initialsPerReturn;
        const after = await snapshot();
        assert.equal(
          after.state.initials,
          String(expectedInitials),
          `initialFocus after ${control} return`,
        );
        assert.equal(after.state.finals, "0");
      }
      return { opened };
    });

  for (const family of ["dialog", "popover"])
    await test(`${family} nested overlay (through useOverlayFrame) retains its own open state and content across the owner's concealment cycle`, async () => {
      await load(`family=${family}&controlled=true&nested=true`);
      await clickSelector("[data-gate-trigger]", "left", true);
      await wait("popup opens", "window.gatePresented('[data-gate-popup]')");
      await delay(180);
      await clickSelector("[data-gate-nested-trigger]", "left", true);
      await wait(
        "nested opens",
        "window.gatePresented('[data-gate-subpopup]')",
      );
      await delay(180);
      await evaluate(
        `document.querySelector('[data-gate-nested-draft]').focus();document.querySelector('[data-gate-nested-draft]').select()`,
      );
      await client.send("Input.insertText", { text: "nested typed" });
      const before = await snapshot();
      assert.equal(before.nestedDraft, "nested typed");

      await evaluate("window.gate.conceal(true)");
      await delay(250);
      const concealed = await snapshot();
      assert.equal(
        await evaluate("window.gatePresented('[data-gate-subpopup]')"),
        false,
      );

      await evaluate("window.gate.conceal(false)");
      await delay(250);
      const returned = await snapshot();
      assert.equal(
        await evaluate("window.gatePresented('[data-gate-subpopup]')"),
        true,
        "the nested overlay must still be open after the owner's concealment round-trip",
      );
      assert.equal(returned.nestedDraft, "nested typed");
      return { before, concealed, returned };
    });

  assert(
    report.cases.every((c) => c.pass),
    report.cases
      .filter((c) => !c.pass)
      .map((c) => c.name)
      .join("\n"),
  );
} finally {
  await writeFile(
    process.env.GATE_OUT ?? "/tmp/portal-lifecycle-gate-result.json",
    JSON.stringify(report, null, 2),
  );
  client?.close();
  await terminateProcessTree(chrome.chrome);
  await rm(chrome.profilePath, { recursive: true, force: true });
  await server.close();
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
async function center(selector) {
  return evaluate(
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();if(!r.width||!r.height)throw new Error('Not presented '+${JSON.stringify(selector)});return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
}
async function clickSelector(selector, button, hitTest) {
  const p = await center(selector);
  if (hitTest)
    assert(
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).contains(document.elementFromPoint(${p.x},${p.y}))`,
      ),
      `Hit target blocked: ${selector}`,
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
async function key(key, modifiers) {
  const codes = { Escape: 27 };
  await client.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    text: "",
    key,
    code: key,
    windowsVirtualKeyCode: codes[key],
    modifiers,
  });
  await client.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code: key,
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
}
