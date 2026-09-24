import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusGlyph } from "../status-glyph";
import {
  APPROVAL_TONE,
  DONE_TONE,
  FAILURE_TONE,
  FORK_TONE,
  INTERVIEW_TONE,
  NOTIFICATION_STATUS_TONES,
  type IndicatorTone,
} from "../notification-indicator-tones";

afterEach(() => cleanup());

const TONE_CASES: ReadonlyArray<readonly [string, IndicatorTone, string]> = [
  ["done", DONE_TONE, "lucide-message-square-check"],
  ["failure", FAILURE_TONE, "lucide-message-square-x"],
  ["fork", FORK_TONE, "lucide-git-fork"],
  ["interview", INTERVIEW_TONE, "lucide-message-square-question-mark"],
  ["approval", APPROVAL_TONE, "lucide-message-square-warning"],
  ["browser", NOTIFICATION_STATUS_TONES.browser, "lucide-globe-alert"],
];

describe("StatusGlyph", () => {
  it.each(TONE_CASES)(
    "renders the %s tone's own lucide icon and colour class",
    (_name, tone, lucideClass) => {
      render(
        <StatusGlyph
          status={tone}
          className="size-3"
          testId={undefined}
          label={null}
        />,
      );
      const glyph = document.querySelector(
        `[data-status-glyph="${tone.testId}"]`,
      );
      expect(glyph).not.toBeNull();
      expect(glyph?.classList.contains(lucideClass)).toBe(true);
      expect(glyph?.classList.contains(tone.className)).toBe(true);
    },
  );

  it.each(TONE_CASES)(
    "hides the %s tone from assistive tech when label is null",
    (_name, tone) => {
      render(
        <StatusGlyph
          status={tone}
          className="size-3"
          testId={undefined}
          label={null}
        />,
      );
      const glyph = document.querySelector(
        `[data-status-glyph="${tone.testId}"]`,
      );
      expect(glyph?.getAttribute("aria-hidden")).toBe("true");
      expect(glyph?.getAttribute("role")).toBeNull();
    },
  );

  it("exposes an accessible name for a tone when a label is given", () => {
    render(
      <StatusGlyph
        status={APPROVAL_TONE}
        className="size-3"
        testId={undefined}
        label="Needs approval"
      />,
    );
    const glyph = screen.getByRole("img", { name: "Needs approval" });
    expect(glyph.getAttribute("data-status-glyph")).toBe("approval");
  });

  it("carries a testId onto the tone icon", () => {
    render(
      <StatusGlyph
        status={FAILURE_TONE}
        className="size-3"
        testId="failure-glyph"
        label={null}
      />,
    );
    expect(screen.getByTestId("failure-glyph")).toBe(
      document.querySelector('[data-status-glyph="failure"]'),
    );
  });

  it("gives approval and interview distinct icons, not colour alone", () => {
    render(
      <StatusGlyph
        status={APPROVAL_TONE}
        className="size-3"
        testId={undefined}
        label={null}
      />,
    );
    render(
      <StatusGlyph
        status={INTERVIEW_TONE}
        className="size-3"
        testId={undefined}
        label={null}
      />,
    );
    const approvalGlyph = document.querySelector(
      '[data-status-glyph="approval"]',
    );
    const interviewGlyph = document.querySelector(
      '[data-status-glyph="interview"]',
    );
    expect(
      approvalGlyph?.classList.contains("lucide-message-square-warning"),
    ).toBe(true);
    expect(
      interviewGlyph?.classList.contains("lucide-message-square-question-mark"),
    ).toBe(true);
  });

  it("marks the running glyph on its wrapping span, with the spinner inside", () => {
    render(
      <StatusGlyph
        status="running"
        className="size-3"
        testId="running-spinner"
        label={null}
      />,
    );
    const glyph = document.querySelector('[data-status-glyph="running"]');
    expect(glyph).not.toBeNull();
    expect(glyph?.tagName).toBe("SPAN");
    expect(
      glyph?.querySelector('[data-testid="running-spinner"]'),
    ).not.toBeNull();
  });

  it("hides the running glyph from assistive tech when label is null", () => {
    render(
      <StatusGlyph
        status="running"
        className="size-3"
        testId={undefined}
        label={null}
      />,
    );
    const glyph = document.querySelector('[data-status-glyph="running"]');
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(glyph?.getAttribute("role")).toBeNull();
  });

  it("exposes an accessible name for the running glyph when a label is given", () => {
    render(
      <StatusGlyph
        status="running"
        className="size-3"
        testId={undefined}
        label="Agent in progress"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Agent in progress" }),
    ).not.toBeNull();
  });

  it("renders the background glyph as the muted message-square-clock icon", () => {
    render(
      <StatusGlyph
        status="background"
        className="size-3"
        testId="background-glyph"
        label={null}
      />,
    );
    const glyph = document.querySelector('[data-status-glyph="background"]');
    expect(glyph).not.toBeNull();
    expect(glyph?.classList.contains("lucide-message-square-clock")).toBe(true);
    expect(glyph?.classList.contains("text-muted-foreground")).toBe(true);
    expect(glyph).toBe(screen.getByTestId("background-glyph"));
  });

  it("hides the background glyph from assistive tech when label is null", () => {
    render(
      <StatusGlyph
        status="background"
        className="size-3"
        testId={undefined}
        label={null}
      />,
    );
    const glyph = document.querySelector('[data-status-glyph="background"]');
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");
    expect(glyph?.getAttribute("role")).toBeNull();
  });

  it("exposes an accessible name for the background glyph when a label is given", () => {
    render(
      <StatusGlyph
        status="background"
        className="size-3"
        testId={undefined}
        label="Background activity — agent idle"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Background activity — agent idle" }),
    ).not.toBeNull();
  });
});
