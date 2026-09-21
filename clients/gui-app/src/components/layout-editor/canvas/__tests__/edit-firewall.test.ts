import { afterEach, describe, expect, it } from "vitest";
import {
  FIREWALLED_EVENT_TYPES,
  installEditFirewall,
} from "@/components/layout-editor/canvas/edit-firewall";

/**
 * The firewall is asserted through the app's OWN handlers (4.4): a listener on
 * a control inside the column, exactly where the composer's `onDrop` and the
 * header's `onClick` live. Asserting that `preventDefault` was called would
 * restate the implementation; asserting that the app never heard the gesture
 * is the outcome the rule exists for.
 */

let teardown: (() => void) | null = null;

interface Column {
  readonly column: HTMLElement;
  readonly control: HTMLButtonElement;
  readonly inspector: HTMLElement;
  readonly heard: Array<string>;
}

function mountColumn(): Column {
  const column = document.createElement("div");
  const control = document.createElement("button");
  const inspector = document.createElement("div");
  inspector.tabIndex = -1;
  column.append(control);
  document.body.append(column, inspector);

  const heard: Array<string> = [];
  // `contextmenu` is no longer on the swallowed list (L-129) but is still a
  // gesture this suite listens for, because whether the app hears it is now
  // the question rather than a given.
  for (const type of [...FIREWALLED_EVENT_TYPES, "contextmenu", "wheel"]) {
    control.addEventListener(type, () => {
      heard.push(type);
    });
    column.addEventListener(type, () => {
      heard.push(`column:${type}`);
    });
  }
  teardown = installEditFirewall({
    column,
    focusTarget: () => inspector,
  });
  return { column, control, inspector, heard };
}

afterEach(() => {
  teardown?.();
  teardown = null;
  document.body.replaceChildren();
});

describe("the edit firewall (4.4)", () => {
  it("swallows every listed gesture before the app hears it", () => {
    const { control, heard } = mountColumn();

    for (const type of FIREWALLED_EVENT_TYPES) {
      control.dispatchEvent(
        new Event(type, { bubbles: true, cancelable: true }),
      );
    }

    expect(heard).toEqual([]);
  });

  it("covers the drag-and-drop and paste set the composer really handles (C-16)", () => {
    // Named rather than derived from the export: the point of the list is
    // that these five are on it, and a test that reads the same array cannot
    // notice one leaving.
    for (const type of [
      "dragenter",
      "dragover",
      "dragleave",
      "drop",
      "paste",
    ]) {
      expect(FIREWALLED_EVENT_TYPES).toContain(type);
    }
  });

  /**
   * L-129. `contextmenu` used to be on the swallowed list, which made quick
   * verbs - the mode-less half of the model (L-19) - unreachable from inside a
   * session: the menu's own trigger never saw the event. The rule is now the
   * region test, so these two are the halves of it.
   */
  it("lets a right-click on a named region reach its menu (L-129)", () => {
    const { control, heard } = mountColumn();
    control.setAttribute("data-layout-region", "mic");
    // The deepest node under the pointer is usually the control's own glyph,
    // not the named element itself, so the test is `closest` rather than the
    // target's own attribute - and the menu's trigger is an ancestor besides.
    const glyph = document.createElement("span");
    control.append(glyph);

    glyph.dispatchEvent(
      new Event("contextmenu", { bubbles: true, cancelable: true }),
    );

    expect(heard).toEqual(["contextmenu", "column:contextmenu"]);
  });

  it("still swallows a right-click that is not on a region", () => {
    // A chat message, a transcript, a text field: the app's own menu over the
    // user's own content, which is what the firewall is for.
    const { control, heard } = mountColumn();

    control.dispatchEvent(
      new Event("contextmenu", { bubbles: true, cancelable: true }),
    );

    expect(heard).toEqual([]);
  });

  it("lets the wheel through, so the app keeps scrolling (L-17)", () => {
    const { control, heard } = mountColumn();

    control.dispatchEvent(
      new Event("wheel", { bubbles: true, cancelable: true }),
    );

    expect(heard).toEqual(["wheel", "column:wheel"]);
  });

  it("returns focus to the inspector when the column takes it", () => {
    const { control, inspector } = mountColumn();

    control.focus();
    control.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(document.activeElement).toBe(inspector);
  });

  it("bounces focus that was already inside the column when it installed", () => {
    const column = document.createElement("div");
    const control = document.createElement("button");
    const inspector = document.createElement("div");
    inspector.tabIndex = -1;
    column.append(control);
    document.body.append(column, inspector);
    control.focus();
    expect(document.activeElement).toBe(control);

    teardown = installEditFirewall({ column, focusTarget: () => inspector });

    expect(document.activeElement).toBe(inspector);
  });

  it("hides the column from assistive technology only while it is installed", () => {
    const { column } = mountColumn();
    expect(column.getAttribute("aria-hidden")).toBe("true");

    teardown?.();
    teardown = null;

    expect(column.hasAttribute("aria-hidden")).toBe(false);
  });

  it("leaves a sibling inspector's own gestures alone", () => {
    const { inspector, heard } = mountColumn();
    const button = document.createElement("button");
    button.addEventListener("click", () => {
      heard.push("inspector:click");
    });
    inspector.append(button);

    button.dispatchEvent(
      new Event("click", { bubbles: true, cancelable: true }),
    );

    expect(heard).toEqual(["inspector:click"]);
  });
});
