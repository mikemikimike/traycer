// Temporary T02 proof lane — removed by T03. Not part of run-tests.ts.
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
  await findChrome("Base UI proofs"),
  "traycer-base-proofs-",
  ["--force-device-scale-factor=1"],
);
const report = { version: "1.8.0", cases: [] };
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
      "src/__tests__/browser/base-ui-proofs.html?" +
        query +
        "&sequence=" +
        ++sequence,
      origin,
    );
    await client.send("Page.navigate", { url: url.href });
    await wait(
      "fixture",
      `location.href===${JSON.stringify(url.href)} && !!window.baseProof && !!document.querySelector('[data-palette],[data-state-output],[data-trigger]')`,
    );
    await delay(150);
  }
  async function snapshot() {
    return evaluate(
      `({host:{...document.querySelector('[data-host-probe]')?.dataset},retained:document.querySelector('[data-retained-draft]')?.dataset.value,state:{...document.querySelector('[data-state-output]')?.dataset},events:window.baseProof.events,focus:window.baseProof.focus,blur:window.baseProof.blur,active:document.activeElement.outerHTML,painted:[...document.querySelectorAll('[data-popup],.backdrop')].filter(window.gatePainted).length,locks:window.gateLockStyles(),palettes:[...document.querySelectorAll('[data-palette]')].map(e=>({...e.dataset,rows:[...e.querySelectorAll('[data-row]')].map(r=>({row:r.dataset.row,id:r.id,highlight:r.hasAttribute('data-highlighted')})),input:e.querySelector('input').outerHTML}))})`,
    );
  }
  async function test(name, fn) {
    if (process.env.PROOF_CASE && !name.includes(process.env.PROOF_CASE))
      return;
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
  async function query(text) {
    await evaluate(
      `document.querySelector('[data-palette=one] input').focus();document.querySelector('[data-palette=one] input').select()`,
    );
    await client.send("Input.insertText", { text });
    await delay(40);
  }
  const command =
    !process.argv.includes("--lifecycle") && !process.argv.includes("--nested");
  if (command) {
    await test("A rejection: filtered-index DOM ids and disabled-row highlight", async () => {
      await load("mode=command&design=a");
      await clickSelector("[data-palette=one] input", "left", true);
      const before = await snapshot();
      await key("ArrowDown", 0);
      const disabled = await snapshot();
      assert.equal(disabled.palettes[0].active, "disabled");
      await query("Project");
      const ranked = await snapshot();
      assert.equal(ranked.palettes[0].rows[0].row, "exact");
      assert.notEqual(
        before.palettes[0].rows.find((r) => r.row === "exact").id,
        ranked.palettes[0].rows[0].id,
      );
      await key("PageDown", 0);
      const page = await snapshot();
      await key("Enter", 0);
      const enter = await snapshot();
      assert.equal(enter.palettes[0].selected, page.palettes[0].active);
      assert.equal(enter.palettes[0].query, "Project");
      return { before, disabled, ranked, page, enter };
    });
    await test("B ranking, ties, zero exclusion, stable ids, query retention and independent palettes", async () => {
      await load("mode=command");
      const before = await snapshot();
      await query("Project");
      const ranked = await snapshot();
      assert.equal(ranked.palettes[0].rows[0].row, "exact");
      assert.deepEqual(
        ranked.palettes[0].rows.map((r) => r.row),
        ["exact", ...Array.from({ length: 10 }, (_, i) => "r" + (i + 2))],
      );
      assert.equal(
        before.palettes[0].rows.find((r) => r.row === "exact").id,
        ranked.palettes[0].rows[0].id,
      );
      await key("Enter", 0);
      let current = await snapshot();
      assert.equal(current.palettes[0].selected, "exact");
      assert.equal(current.palettes[0].query, "Project");
      assert.equal(current.palettes[1].query, "");
      assert.equal(current.palettes[1].selected, "");
      await query("Duplicate");
      current = await snapshot();
      assert.deepEqual(
        current.palettes[0].rows.map((r) => r.row),
        ["r0", "r1"],
      );
      await key("ArrowDown", 0);
      await key("Enter", 0);
      assert.equal((await snapshot()).palettes[0].selected, "r1");
      await query("zzzz");
      await key("Enter", 0);
      current = await snapshot();
      assert.equal(current.palettes[0].active, "");
      assert.equal(current.palettes[0].rows.length, 0);
      assert.equal(current.palettes[0].selected, "r1");
      assert(
        await evaluate(
          `document.querySelector('[data-palette=one] [role=status]').textContent==='No matches'`,
        ),
      );
      return current;
    });
    await test("B page navigation, controlled highlight, disabled skip, tree and IME", async () => {
      await load("mode=command");
      await clickSelector("[data-palette=one] input", "left", true);
      await key("ArrowDown", 0);
      assert.equal((await snapshot()).palettes[0].active, "r0");
      await key("Home", 0);
      await key("ArrowRight", 0);
      let current = await snapshot();
      assert.equal(current.palettes[0].expanded, "true");
      assert.equal(current.palettes[1].expanded, "false");
      assert(current.palettes[0].rows.some((r) => r.row === "child"));
      await key("ArrowLeft", 0);
      assert(
        !(await snapshot()).palettes[0].rows.some((r) => r.row === "child"),
      );
      const pageSize = await evaluate(
        `(()=>{const l=document.querySelector('[data-palette=one] [role=listbox]');return Math.max(1,Math.floor(l.clientHeight/l.querySelector('[role=option]').offsetHeight)-1)})()`,
      );
      await key("PageDown", 0);
      current = await snapshot();
      assert.equal(
        current.palettes[0].active,
        current.palettes[0].rows.filter((r) => r.row !== "disabled")[pageSize]
          .row,
      );
      await key("PageUp", 0);
      assert.equal((await snapshot()).palettes[0].active, "tree");
      await evaluate(`window.baseProof.highlight.one('r1')`);
      await delay(20);
      assert(
        await evaluate(
          `(()=>{const i=document.querySelector('[data-palette=one] input');return document.getElementById(i.getAttribute('aria-activedescendant')).dataset.row==='r1'})()`,
        ),
      );
      await evaluate(
        `document.querySelector('[data-palette=one] input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))`,
      );
      assert.equal((await snapshot()).palettes[0].selected, "");
      await evaluate(
        `(()=>{const input=document.querySelector('[data-palette=one] input');input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:false,bubbles:true}));})()`,
      );
      assert.equal((await snapshot()).palettes[0].selected, "");
      await evaluate(
        `(()=>{const input=document.querySelector('[data-palette=one] input');input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:false,bubbles:true}));})()`,
      );
      assert.equal((await snapshot()).palettes[0].selected, "");
      await delay(75);
      await key("Enter", 0);
      assert.equal((await snapshot()).palettes[0].selected, "r1");
      return snapshot();
    });
    await test("B shouldFilter=false preserves caller order", async () => {
      await load("mode=command&filter=false");
      const before = await snapshot();
      await query("zzzz");
      const after = await snapshot();
      assert.deepEqual(after.palettes[0].rows, before.palettes[0].rows);
      return after;
    });
  }
  const nested =
    !process.argv.includes("--command") &&
    !process.argv.includes("--lifecycle");
  if (nested)
    for (const family of ["menu", "select"]) {
      async function openNested() {
        await load("mode=nested&family=" + family);
        await clickSelector("[data-trigger]", "left", true);
        await wait("frame", "window.gatePresented('[data-frame]')");
        await clickSelector("[data-nested-trigger]", "left", true);
        await wait("nested", "window.gatePresented('[data-nested-popup]')");
        await delay(50);
      }
      const frame = () =>
        evaluate("!!document.querySelector('[data-frame][data-open]')");
      const childOpen = () =>
        evaluate("window.gatePresented('[data-nested-popup][data-open]')");
      for (const gesture of ["backdrop", "body", "escape", "touch"]) {
        await test(`${family} nested ${gesture}`, async () => {
          await openNested();
          if (gesture === "touch") {
            await client.send("Emulation.setTouchEmulationEnabled", {
              enabled: true,
              maxTouchPoints: 1,
            });
            await tapAt(20, 20);
          } else if (gesture === "escape") await key("Escape", 0);
          else if (gesture === "body")
            await clickSelector("[data-body]", "left", false);
          else await clickAt(20, 20, "left");
          await delay(180);
          assert(await frame());
          assert(!(await childOpen()));
          if (gesture === "touch") await tapAt(20, 20);
          else if (gesture === "escape") await key("Escape", 0);
          else await clickAt(20, 20, "left");
          await delay(180);
          assert(!(await frame()));
          await client.send("Emulation.setTouchEmulationEnabled", {
            enabled: false,
          });
          return snapshot();
        });
      }
      await test(`${family} controlled concealment, rapid close, unmount and passive tooltip`, async () => {
        for (const operation of ["present(false)", "close()", "unmount()"]) {
          await openNested();
          await evaluate("window.baseProof." + operation);
          await wait(
            "child exit and backdrop hit target: " + operation,
            `![...document.querySelectorAll('[data-nested-popup]')].some(window.gatePainted) && document.elementFromPoint(20,20)?.hasAttribute('data-backdrop')`,
          );
          await clickAt(20, 20, "left");
          await delay(180);
          assert(!(await frame()));
        }
        await load("mode=nested&family=" + family);
        await clickSelector("[data-trigger]", "left", true);
        await evaluate("window.baseProof.tooltip()");
        await delay(80);
        assert(await evaluate("!!document.querySelector('[data-tooltip]')"));
        await clickAt(20, 20, "left");
        await delay(180);
        assert(!(await frame()));
        return snapshot();
      });
      await test(`${family} unrelated overlay is excluded from frame ownership`, async () => {
        await load("mode=nested&family=" + family);
        await clickSelector("[data-trigger]", "left", true);
        await evaluate("window.baseProof.unrelated()");
        await delay(100);
        assert(
          await evaluate(
            "!!document.querySelector('[data-unrelated][data-open]')",
          ),
        );
        await clickAt(20, 20, "left");
        await delay(180);
        assert(!(await frame()));
        return snapshot();
      });
      await test(`${family} pointerdown ownership survives synchronous child close`, async () => {
        await openNested();
        await evaluate("window.baseProof.race()");
        await evaluate(
          `document.querySelector('[data-backdrop]').dispatchEvent(new PointerEvent('pointerdown',{pointerId:88,bubbles:true}));document.querySelector('[data-backdrop]').dispatchEvent(new PointerEvent('click',{pointerId:88,detail:1,bubbles:true}))`,
        );
        await delay(180);
        assert(await frame());
        assert(!(await childOpen()));
        const first = await snapshot();
        assert(first.events.some((e) => e.includes("frame:click:true:true")));
        await clickAt(20, 20, "left");
        await delay(180);
        assert(!(await frame()));
        return { first, after: await snapshot() };
      });
      await test(`${family} virtual click without pointerdown while child is open`, async () => {
        await openNested();
        await evaluate("document.querySelector('[data-backdrop]').click()");
        await delay(180);
        assert(await frame());
        assert(await childOpen());
        const virtual = await snapshot();
        await key("Escape", 0);
        await delay(180);
        assert(await frame());
        assert(!(await childOpen()));
        await evaluate("document.querySelector('[data-backdrop]').click()");
        await delay(180);
        assert(!(await frame()));
        return { virtual, after: await snapshot() };
      });
      await test(`${family} cancelled close, pointercancel, virtual click`, async () => {
        await openNested();
        await evaluate("window.baseProof.cancel(true)");
        await clickAt(20, 20, "left");
        await delay(150);
        assert(await frame());
        assert(await childOpen());
        await evaluate(
          `document.querySelector('[data-backdrop]').dispatchEvent(new PointerEvent('pointerdown',{pointerId:77,bubbles:true}));document.querySelector('[data-backdrop]').dispatchEvent(new PointerEvent('pointercancel',{pointerId:77,bubbles:true}));window.baseProof.close()`,
        );
        await delay(180);
        await evaluate("document.querySelector('[data-backdrop]').click()");
        await delay(180);
        assert(!(await frame()));
        return snapshot();
      });
    }
  const lifecycle =
    !process.argv.includes("--command") && !process.argv.includes("--nested");
  const menuFamilies = ["menu", "context-menu", "select"];
  async function openTrigger(family, method) {
    if (method === "pointer")
      await clickSelector(
        "[data-trigger]",
        family === "context-menu" ? "right" : "left",
        true,
      );
    else {
      await evaluate("document.querySelector('[data-trigger]').focus()");
      if (family === "context-menu")
        await evaluate(
          `(()=>{const t=document.querySelector('[data-trigger]');const r=t.getBoundingClientRect();t.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,detail:0,button:0,clientX:r.x+r.width/2,clientY:r.y+r.height/2}))})()`,
        );
      else await key("ArrowDown", 0);
    }
    await wait("popup opens", "window.gatePresented('[data-popup]')");
    await delay(180);
    if (family === "context-menu" && method === "keyboard")
      await key("ArrowDown", 0);
  }
  if (lifecycle)
    for (const family of ["dialog", "popover", ...menuFamilies])
      for (const controlled of menuFamilies.includes(family)
        ? [true, false]
        : [true]) {
        const closes = menuFamilies.includes(family);
        const label = `${family} ${controlled ? "controlled" : "uncontrolled"}`;
        async function openLifecycle(extra) {
          await load(
            `mode=lifecycle&family=${family}&controlled=${controlled}${extra}`,
          );
          const locks = await evaluate("window.gateLockStyles()");
          await clickSelector("[data-retained-draft] input", "left", true);
          await client.send("Input.insertText", {
            text: "staged inside Activity",
          });
          await openTrigger(family, "pointer");
          return locks;
        }
        for (const loss of ["conceal", "blur", "activity"])
          await test(`${label} ${loss}: state, callbacks, focus, painting and locks`, async () => {
            const locks = await openLifecycle("&loss=" + loss);
            const before = await snapshot();
            await evaluate(
              `window.baseProof.focus=[];window.baseProof.blur=[];window.baseProof.present(false);document.querySelector('[data-outside]').focus()`,
            );
            const immediate = await snapshot();
            if (family === "select" && loss === "blur")
              assert(immediate.painted > 0);
            else assert.equal(immediate.painted, 0);
            await delay(180);
            const hidden = await snapshot();
            const expectedChanges = String(
              Number(before.state.changes) + (closes ? 1 : 0),
            );
            assert.equal(hidden.state.logical, String(!closes));
            assert.equal(hidden.state.changes, expectedChanges);
            assert.equal(hidden.state.finals, "0");
            assert.equal(hidden.state.draft, "staged");
            assert.equal(hidden.state.value, before.state.value);
            assert.equal(hidden.retained, "staged inside Activity");
            assert.deepEqual(hidden.locks, locks);
            assert.equal(hidden.painted, 0);
            assert.deepEqual(hidden.focus, immediate.focus);
            assert.deepEqual(hidden.blur, immediate.blur);
            assert(hidden.active.includes("data-outside"));
            assert.equal(
              hidden.events.filter((e) =>
                e.startsWith("owner:false:presentation-loss:"),
              ).length,
              closes ? 1 : 0,
            );
            if (closes)
              assert(
                hidden.events.includes(
                  `owner:false:presentation-loss:${loss === "blur" ? "pane-blur" : "concealment"}`,
                ),
              );
            else assert.equal(hidden.state.completes, before.state.completes);
            await evaluate("window.baseProof.present(false)");
            await key("Escape", 0);
            await clickSelector("[data-outside]", "left", true);
            await client.send("Input.dispatchMouseEvent", {
              type: "mouseWheel",
              x: 900,
              y: 600,
              deltaX: 0,
              deltaY: 250,
            });
            await delay(100);
            assert(await evaluate("scrollY>0"));
            await evaluate("scrollTo(0,0)");
            await evaluate(
              `window.baseProof.focus=[];window.baseProof.blur=[];window.baseProof.present(true)`,
            );
            await delay(200);
            const after = await snapshot();
            assert.equal(after.state.logical, String(!closes));
            assert.equal(after.retained, "staged inside Activity");
            assert.equal(after.state.changes, expectedChanges);
            assert.equal(after.state.value, before.state.value);
            assert.equal(
              after.state.completes,
              String(Number(before.state.completes) + (closes ? 1 : 0)),
            );
            assert.equal(after.focus.length, 0);
            assert.equal(after.blur.length, 0);
            assert(after.active.includes("data-outside"));
            assert.equal(after.painted > 0, !closes);
            if (loss === "activity") {
              assert.equal(hidden.host.hidden, "true");
              assert.equal(after.host.hidden, "false");
              assert(
                after.events.indexOf("boundary:commit:1:false:false") <
                  after.events.indexOf("boundary:commit:1:false:true"),
              );
              const closed = after.events.findIndex((e) =>
                e.startsWith("wrapper:closed:"),
              );
              for (const actor of [
                "owner",
                "wrapper",
                "owner-passive",
                "wrapper-passive",
              ]) {
                const disconnect = after.events.indexOf(actor + ":disconnect");
                assert(
                  disconnect > closed,
                  actor + " paused before closed effects",
                );
                assert.equal(
                  after.events.filter((e) => e === actor + ":connect").length,
                  2,
                );
                assert(
                  after.events.lastIndexOf(actor + ":connect") > disconnect,
                );
              }
              if (closes)
                assert(
                  after.events.findIndex((e) =>
                    e.startsWith("owner:false:presentation-loss:"),
                  ) < closed,
                );
            }
            return { before, immediate, hidden, after };
          });
        await test(`${label} rapid A-B-A during pending close`, async () => {
          await openLifecycle("");
          const before = await snapshot();
          await evaluate(
            `window.baseProof.focus=[];window.baseProof.blur=[];window.baseProof.present(false);document.querySelector('[data-outside]').focus()`,
          );
          await delay(25);
          if (!closes)
            assert(
              await evaluate(
                "document.querySelector('[data-popup]')?.getAnimations().some(a=>a.playState==='running')",
              ),
            );
          await evaluate("window.baseProof.present(true)");
          await delay(500);
          const after = await snapshot();
          assert.equal(after.state.logical, String(!closes));
          assert.equal(
            after.state.changes,
            String(Number(before.state.changes) + (closes ? 1 : 0)),
          );
          assert.equal(
            after.state.completes,
            String(Number(before.state.completes) + (closes ? 1 : 0)),
          );
          assert.equal(after.state.finals, "0");
          assert.equal(after.focus.length, 1);
          assert(after.active.includes("data-outside"));
          assert.equal(after.painted > 0, !closes);
          return { before, after };
        });
        if (!closes)
          for (const loss of ["blur", "conceal", "activity"])
            for (const rapid of [true, false])
              await test(`${label} ${loss} ${rapid ? "rapid" : "settled"} focused return restores popup focus`, async () => {
                await openLifecycle("&loss=" + loss);
                const before = await snapshot();
                await evaluate(
                  `window.baseProof.focus=[];window.baseProof.blur=[];window.baseProof.present(false);document.querySelector('[data-outside]').focus()`,
                );
                await delay(rapid ? 25 : 180);
                if (rapid && loss !== "activity")
                  assert(
                    await evaluate(
                      "document.querySelector('[data-popup]')?.getAnimations().some(a=>a.playState==='running')",
                    ),
                  );
                await evaluate("window.baseProof.returnFocused()");
                await delay(180);
                const returned = await snapshot();
                assert(
                  await evaluate(
                    "document.querySelector('[data-popup]').contains(document.activeElement)",
                  ),
                );
                assert.equal(returned.state.changes, before.state.changes);
                assert.equal(returned.state.completes, before.state.completes);
                assert.equal(
                  Number(returned.state.initials),
                  Number(before.state.initials) + (loss === "activity" ? 2 : 1),
                );
                assert.equal(returned.focus.length, 2);
                assert.equal(
                  returned.blur.filter((e) => e.includes("data-outside"))
                    .length,
                  1,
                );
                assert.equal(returned.state.finals, "0");
                assert.equal(returned.state.logical, "true");
                await delay(350);
                const after = await snapshot();
                assert.deepEqual(after.focus, returned.focus);
                assert.deepEqual(after.blur, returned.blur);
                assert.equal(after.active, returned.active);
                assert.equal(after.state.completes, returned.state.completes);
                return { before, returned, after };
              });
        if (family === "select")
          await test(`${label} pending pane-blur exit finishes once after rapid visibility return`, async () => {
            const locks = await openLifecycle("&loss=blur");
            await key("ArrowDown", 0);
            await key("Enter", 0);
            await delay(180);
            await openTrigger("select", "keyboard");
            await key("ArrowUp", 0);
            const before = await snapshot();
            assert.equal(before.state.value, "two");
            assert.equal(
              await evaluate("document.activeElement.textContent"),
              "One",
            );
            await evaluate(
              `window.baseProof.focus=[];window.baseProof.blur=[];window.baseProof.present(false);document.querySelector('[data-outside]').focus()`,
            );
            const pending = await evaluate(
              `(()=>{const popup=document.querySelector('[data-popup]');const animations=popup?.getAnimations()??[];const result={pending:animations.some(a=>a.playState!=='finished'&&Number(a.currentTime)<a.effect.getComputedTiming().endTime/2),painted:window.gatePainted(popup)};window.baseProof.present(true);return result;})()`,
            );
            assert.deepEqual(pending, { pending: true, painted: true });
            const returned = await snapshot();
            assert.equal(returned.focus.length, 1);
            assert.equal(
              returned.blur.filter((e) => e.includes("data-outside")).length,
              0,
            );
            await delay(500);
            const after = await snapshot();
            assert.equal(after.state.logical, "false");
            assert.equal(after.painted, 0);
            assert.equal(
              after.state.changes,
              String(Number(before.state.changes) + 1),
            );
            assert.equal(
              after.state.completes,
              String(Number(before.state.completes) + 1),
            );
            assert.equal(
              after.events.filter(
                (e) => e === "owner:false:presentation-loss:pane-blur",
              ).length,
              1,
            );
            assert.equal(after.state.finals, before.state.finals);
            assert.equal(after.state.value, before.state.value);
            assert.deepEqual(after.focus, returned.focus);
            assert.deepEqual(after.blur, returned.blur);
            assert(after.active.includes("data-outside"));
            assert.deepEqual(after.locks, locks);
            await openTrigger("select", "keyboard");
            assert.equal(
              await evaluate("document.activeElement.textContent"),
              "Two",
            );
            return {
              before,
              pending,
              returned,
              after,
              reopened: await snapshot(),
            };
          });
        if (!closes)
          await test(`${label} owner close while concealed never reopens`, async () => {
            const locks = await openLifecycle("");
            await evaluate(
              `window.baseProof.present(false);document.querySelector('[data-outside]').focus()`,
            );
            await delay(180);
            await evaluate(
              "window.baseProof.close();window.baseProof.present(true)",
            );
            await delay(500);
            const after = await snapshot();
            assert.equal(after.state.logical, "false");
            assert.equal(after.painted, 0);
            assert.deepEqual(after.locks, locks);
            assert(after.active.includes("data-outside"));
            return after;
          });
        await test(`${label} ordinary close completes and returns focus`, async () => {
          const locks = await openLifecycle("");
          await key("Escape", 0);
          await delay(200);
          const after = await snapshot();
          assert.equal(after.state.logical, "false");
          assert.equal(after.state.changes, "2");
          assert.equal(after.state.completes, "2");
          assert.equal(after.state.finals, "1");
          assert(after.active.includes("data-trigger"));
          assert.deepEqual(after.locks, locks);
          return after;
        });
      }
  if (lifecycle)
    for (const family of menuFamilies)
      for (const controlled of [true, false])
        for (const method of ["keyboard", "pointer"])
          for (const value of family === "select" ? ["one", "none"] : ["one"])
            await test(`${family} ${controlled ? "controlled" : "uncontrolled"} ${family === "context-menu" && method === "keyboard" ? "synthetic contextmenu + keyboard" : method} reopen after Activity preserves ordinary focus (${value})`, async () => {
              await load(
                `mode=lifecycle&family=${family}&controlled=${controlled}&loss=activity&value=${value}`,
              );
              await openTrigger(family, method);
              const active = () =>
                evaluate(
                  `({role:document.activeElement.getAttribute('role'),text:document.activeElement.textContent})`,
                );
              const before = await active();
              if (family === "context-menu" && method === "keyboard") {
                await key("Enter", 0);
                assert.equal((await snapshot()).state.actions, "1");
              }
              await key("ArrowDown", 0);
              await evaluate(
                `window.baseProof.present(false);document.querySelector('[data-outside]').focus()`,
              );
              await delay(180);
              await evaluate(
                `window.baseProof.focus=[];window.baseProof.blur=[];window.baseProof.present(true)`,
              );
              await delay(180);
              const returned = await snapshot();
              assert.equal(returned.painted, 0);
              assert.equal(returned.focus.length, 0);
              assert.equal(returned.blur.length, 0);
              await openTrigger(family, method);
              const after = await active();
              assert.deepEqual(after, before);
              if (method === "keyboard")
                assert.equal(
                  after.role,
                  family === "select" ? "option" : "menuitem",
                );
              if (family === "context-menu" && method === "keyboard") {
                await key("Enter", 0);
                assert.equal((await snapshot()).state.actions, "2");
              }
              return { before, returned, after };
            });
  if (lifecycle)
    for (const controlled of [true, false])
      await test(`Select ${controlled ? "controlled" : "uncontrolled"} retains selected value and discards stale highlight on Activity reopen`, async () => {
        await load(
          `mode=lifecycle&family=select&controlled=${controlled}&loss=activity`,
        );
        await openTrigger("select", "keyboard");
        await key("ArrowDown", 0);
        await key("Enter", 0);
        await delay(180);
        assert.equal((await snapshot()).state.value, "two");
        await openTrigger("select", "keyboard");
        await key("ArrowUp", 0);
        assert.equal(
          await evaluate("document.activeElement.textContent"),
          "One",
        );
        await evaluate(
          `window.baseProof.present(false);document.querySelector('[data-outside]').focus()`,
        );
        await delay(180);
        await evaluate("window.baseProof.present(true)");
        await delay(180);
        assert.equal((await snapshot()).state.value, "two");
        assert.equal((await snapshot()).painted, 0);
        await openTrigger("select", "keyboard");
        assert.equal(
          await evaluate("document.activeElement.textContent"),
          "Two",
        );
        return snapshot();
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
    process.env.PROOF_OUT ?? "/tmp/base-ui-proofs-result.json",
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
    ArrowDown: 40,
    ArrowUp: 38,
    ArrowLeft: 37,
    ArrowRight: 39,
    Home: 36,
    End: 35,
    PageDown: 34,
    PageUp: 33,
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
