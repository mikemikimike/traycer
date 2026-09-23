import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusGlyph } from "../status-glyph";
import { STATUS_GLYPH_LABEL, type StatusGlyphKind } from "../status-glyph-kind";

afterEach(() => cleanup());

const NON_RUNNING_KINDS: ReadonlyArray<Exclude<StatusGlyphKind, "running">> = [
  "approval",
  "reply",
  "failed",
  "unread",
  "background",
];

describe("StatusGlyph", () => {
  it.each(NON_RUNNING_KINDS)(
    "marks the %s glyph with its own data-status-glyph",
    (kind) => {
      render(<StatusGlyph kind={kind} className="size-3" label={null} />);
      const glyph = document.querySelector(`[data-status-glyph="${kind}"]`);
      expect(glyph).not.toBeNull();
      expect(glyph?.tagName).toBe("svg");
    },
  );

  it("marks the running glyph with its own data-status-glyph, on the spinner span", () => {
    render(<StatusGlyph kind="running" className="size-3" label={null} />);
    const glyph = document.querySelector('[data-status-glyph="running"]');
    expect(glyph).not.toBeNull();
    expect(glyph?.tagName).toBe("SPAN");
  });

  it.each([
    "approval",
    "reply",
    "failed",
    "unread",
    "running",
    "background",
  ] as const)("hides %s from assistive tech when label is null", (kind) => {
    render(<StatusGlyph kind={kind} className="size-3" label={null} />);
    const glyph = document.querySelector(`[data-status-glyph="${kind}"]`);
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(glyph?.getAttribute("role")).toBeNull();
  });

  it("exposes an accessible name when a label is given", () => {
    render(
      <StatusGlyph kind="approval" className="size-3" label="Needs approval" />,
    );
    const glyph = screen.getByRole("img", { name: "Needs approval" });
    expect(glyph.getAttribute("data-status-glyph")).toBe("approval");
  });

  it("gives approval and reply distinct shapes, not colour alone", () => {
    render(<StatusGlyph kind="approval" className="size-3" label={null} />);
    render(<StatusGlyph kind="reply" className="size-3" label={null} />);
    const approvalPath = document
      .querySelector('[data-status-glyph="approval"]')
      ?.querySelector("path")
      ?.getAttribute("d");
    const replyPath = document
      .querySelector('[data-status-glyph="reply"]')
      ?.querySelector("path")
      ?.getAttribute("d");
    expect(approvalPath).not.toBe(replyPath);
    expect(approvalPath).toBeTruthy();
    expect(replyPath).toBeTruthy();
  });

  it("carries the STATUS_GLYPH_LABEL text as the running glyph's label too", () => {
    render(
      <StatusGlyph
        kind="running"
        className="size-3"
        label={STATUS_GLYPH_LABEL.running}
      />,
    );
    expect(screen.getByRole("img", { name: "Running" })).not.toBeNull();
  });
});
