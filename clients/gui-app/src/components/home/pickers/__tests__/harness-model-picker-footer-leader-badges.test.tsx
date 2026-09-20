import {
  cleanup,
  render,
  screen,
  type RenderResult,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HarnessModelPickerModelSettingsFooter,
  type ReasoningFooterConfig,
  type ServiceTierFooterConfig,
} from "@/components/home/pickers/harness-model-picker-footers";
import type { ModelOption } from "@/components/home/data/landing-options";
import {
  LeaderHeldContext,
  type LeaderState,
} from "@/providers/keybinding-context";
import { LEADER_SCOPE_MODEL_PICKER } from "@/lib/keybindings/leader-scope";

// Renders the footer as if the picker's own `⌥`-hold state said so - the
// footer's badges read `LeaderHeldContext` directly (via
// `usePickerFastModeLeader` / `usePickerReasoningLeaderForIndex`), so a real
// alt-held hint needs this context rather than a raw keydown (no
// `KeybindingProvider` is mounted in this unit).
const ALT_HELD_BY_PICKER: LeaderState = {
  modHeld: false,
  altHeld: true,
  modShiftHeld: false,
  modOwnerScopeId: null,
  altOwnerScopeId: LEADER_SCOPE_MODEL_PICKER,
  modShiftOwnerScopeId: null,
  pathname: "/",
};

const ALT_NOT_HELD: LeaderState = {
  modHeld: false,
  altHeld: false,
  modShiftHeld: false,
  modOwnerScopeId: null,
  altOwnerScopeId: null,
  modShiftOwnerScopeId: null,
  pathname: "/",
};

function modelWithFastUpgrade(): ModelOption {
  return {
    harnessId: "codex",
    slug: "gpt-test",
    label: "GPT Test",
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    defaultReasoningEffort: null,
    supportedReasoningEfforts: [],
    defaultServiceTier: "standard",
    supportedServiceTiers: [
      { id: "standard", label: "Standard", description: null },
      { id: "fast", label: "Fast", description: null },
    ],
    deprecationNotice: null,
    metadata: {},
  };
}

function serviceTierConfig(): ServiceTierFooterConfig {
  return {
    selectedModel: modelWithFastUpgrade(),
    value: "",
    onChange: vi.fn(),
  };
}

function reasoningConfig(disabled: boolean): ReasoningFooterConfig {
  return {
    value: "low",
    options: [
      { id: "low", label: "Low", description: null },
      { id: "high", label: "High", description: null },
    ],
    disabled,
    onChange: vi.fn(),
  };
}

function renderFooter(
  config: ReasoningFooterConfig,
  leaderState: LeaderState,
): RenderResult {
  return render(
    <LeaderHeldContext.Provider value={leaderState}>
      <HarnessModelPickerModelSettingsFooter
        pickerOpen
        reasoning={config}
        serviceTier={serviceTierConfig()}
      />
    </LeaderHeldContext.Provider>,
  );
}

function renderUnderAltHold(config: ReasoningFooterConfig): void {
  renderFooter(config, ALT_HELD_BY_PICKER);
}

// The Fast button and its digit-0 badge sit in `ModelSettingsFooter` above
// (and independently of) the reasoning group. The reasoning footer is now
// always the list control (L-28), so the badge's placement is fixed too -
// there is no slider variant left to contrast it against.
describe("<HarnessModelPickerModelSettingsFooter /> Fast leader badge", () => {
  afterEach(cleanup);

  it("shows the Fast digit-0 badge on the rendered Fast button while ⌥ is held", () => {
    renderUnderAltHold(reasoningConfig(false));

    const badge = screen.getByTestId("model-fast-mode-digit-0");
    expect(badge.textContent).toBe("0");
    // The badge itself is `aria-hidden`; the spoken hint lives on the
    // button's own accessible name instead (`pickerLeaderControlLabel`).
    const fastButton = screen.getByRole("button", {
      name: "Fast mode. Press Alt+0 to toggle Fast mode",
    });
    expect(fastButton.contains(badge)).toBe(true);
  });

  it("drops the spoken hint from the Fast button's name once ⌥ is released", () => {
    renderFooter(reasoningConfig(false), ALT_NOT_HELD);

    expect(screen.getByRole("button", { name: "Fast mode" })).not.toBeNull();
    expect(
      screen.queryByRole("button", {
        name: "Fast mode. Press Alt+0 to toggle Fast mode",
      }),
    ).toBeNull();
  });

  it("keeps the Fast digit-0 badge lit even while the reasoning ladder is disabled", () => {
    renderUnderAltHold(reasoningConfig(true));

    expect(screen.getByTestId("model-fast-mode-digit-0")).not.toBeNull();
  });

  it("places the Fast badge trailing, beside its label", () => {
    renderUnderAltHold(reasoningConfig(false));

    const badge = screen.getByTestId("model-fast-mode-digit-0");
    expect(badge.className).toContain("left-full");
    expect(badge.className).not.toContain("bottom-full");
  });
});

// Digit badges on individual thinking-level pills (`model-reasoning-digit-N`,
// `ReasoningLevelButton`) - the only reasoning control there is now.
describe("<HarnessModelPickerModelSettingsFooter /> reasoning leader badges", () => {
  afterEach(cleanup);

  it("shows reasoning digit badges 1-9 alongside the Fast badge when levels are enabled", () => {
    renderUnderAltHold(reasoningConfig(false));

    expect(screen.getByTestId("model-fast-mode-digit-0")).not.toBeNull();
    expect(screen.getByTestId("model-reasoning-digit-1").textContent).toBe("1");
    expect(screen.getByTestId("model-reasoning-digit-2").textContent).toBe("2");
  });

  it("hides reasoning digit badges while the ladder is disabled, but keeps the Fast badge", () => {
    renderUnderAltHold(reasoningConfig(true));

    expect(screen.queryByTestId("model-reasoning-digit-1")).toBeNull();
    expect(screen.queryByTestId("model-reasoning-digit-2")).toBeNull();
    // Fast reserves ⌥0 unconditionally - a disabled reasoning ladder must not
    // hide it.
    expect(screen.getByTestId("model-fast-mode-digit-0")).not.toBeNull();
  });

  it("names the spoken hint on the pill's own accessible name, not the (aria-hidden) badge", () => {
    renderUnderAltHold(reasoningConfig(false));

    const lowPill = screen.getByRole("button", {
      name: "Low. Press Alt+1 to set Low",
    });
    expect(
      lowPill.contains(screen.getByTestId("model-reasoning-digit-1")),
    ).toBe(true);
    expect(
      screen.getByTestId("model-reasoning-digit-1").getAttribute("aria-hidden"),
    ).toBe("true");
  });

  it("leaves a disabled pill's accessible name unhinted even while ⌥ is held", () => {
    renderUnderAltHold(reasoningConfig(true));

    expect(screen.getByRole("button", { name: "Low" })).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Low. Press Alt+1 to set Low" }),
    ).toBeNull();
  });
});
