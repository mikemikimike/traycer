import { describe, expect, it } from "vitest";
import {
  isMobileFooterRowAvailable,
  type SettingsAvailabilityContext,
} from "@/lib/settings/settings-availability";

const DESKTOP: SettingsAvailabilityContext = {
  runnerHost: null,
  featureSettings: null,
  mobileApp: false,
};

const MOBILE_APP: SettingsAvailabilityContext = { ...DESKTOP, mobileApp: true };

/**
 * Layout's one shell-level gate (L-51). Every region section draws in every
 * shell, because a region the strip does not host is hosted by the header
 * instead; the only row with no answer outside the installed mobile app is the
 * one that decides whether that build draws the strip at all.
 */
describe("status bar availability", () => {
  it("withholds the small-screen switch from a build that always draws the strip", () => {
    expect(isMobileFooterRowAvailable(DESKTOP)).toBe(false);
  });

  it("offers it in the installed mobile app", () => {
    // It is the control that decides whether the strip exists there, so it is
    // available whichever way it is currently set - a predicate that went away
    // with the strip would leave no way back.
    expect(isMobileFooterRowAvailable(MOBILE_APP)).toBe(true);
  });
});
