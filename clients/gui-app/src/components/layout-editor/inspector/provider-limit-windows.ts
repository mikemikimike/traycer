import { useWatchHostScope } from "@/hooks/host-scope/use-watch-host-scope";
import { useRateLimitProfileSelection } from "@/hooks/rate-limits/use-rate-limit-profile-selection";
import {
  useStatusBarRateLimitSegments,
  useStatusBarWindowedProviders,
  type StatusBarRateLimitWindow,
} from "@/hooks/rate-limits/use-status-bar-rate-limit-segments";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/** One provider's limit windows, as the strip has them right now (L-96). */
export interface ProviderLimitWindows {
  /**
   * Every window the provider currently reports, in catalog order and once
   * each - a provider with two accounts on the strip contributes a segment
   * per account, and both describe the same windows.
   */
  readonly windows: ReadonlyArray<StatusBarRateLimitWindow>;
  /**
   * The windows the strip is drawing for this provider at this moment - the
   * stored selection already resolved against what is live. Under `Automatic`
   * that is the tightest window, which is what makes it the honest seed for a
   * switch to `Choose...`: the picture does not change under the user at the
   * instant they take control of it.
   */
  readonly drawnKeys: ReadonlyArray<string>;
}

const NO_WINDOWS: ProviderLimitWindows = { windows: [], drawnKeys: [] };

/**
 * The windows `Choose...` offers, read from the same place the status bar
 * segment reads them (L-96): no query of this level's own.
 *
 * `mode: "passive"` is the contract that makes that safe - a passive caller
 * gets the segments off the cache entries the strip already wrote, with every
 * observer disabled and no refresh handles, so opening a provider's level
 * cannot start a fetch, warm a cold provider, or report on a reading it
 * caused. `editing: true` for the same reason the strip passes it during a
 * session: a provider the user has hidden still has a level, and its limits
 * are still its own.
 *
 * An empty result is routine rather than an error - a provider that has not
 * been read yet has no windows to offer - and the level says so in a line
 * instead of offering an empty list.
 */
export function useProviderLimitWindows(
  providerId: RateLimitProviderId,
): ProviderLimitWindows {
  const providers = useStatusBarWindowedProviders();
  // The WATCHED host, which is the one the strip's own segments are keyed by
  // (`AppStatusBar`) - not the app-wide one. The accounts a window belongs to
  // are that host's, so reading it from anywhere else would offer a checklist
  // of limits the picture beside it is not drawing.
  const { scope } = useWatchHostScope();
  const profileSelection = useRateLimitProfileSelection(scope.hostId);
  const { cluster } = useStatusBarRateLimitSegments({
    providers,
    profileSelection,
    mode: "passive",
    editing: true,
  });

  if (cluster.kind !== "segments") return NO_WINDOWS;
  const windows = new Map<string, StatusBarRateLimitWindow>();
  const drawn = new Set<string>();
  for (const segment of cluster.segments) {
    if (segment.providerId !== providerId) continue;
    for (const window of segment.windows) {
      if (!windows.has(window.windowKey)) windows.set(window.windowKey, window);
    }
    for (const window of segment.shown) drawn.add(window.windowKey);
  }
  return { windows: [...windows.values()], drawnKeys: [...drawn] };
}
