/**
 * A short native hold on the app after it is sent to the background, so the
 * renderer can learn whether the background LASTED
 * (`IRunnerHost.onSystemBackgroundLasted`).
 *
 * iOS suspends the WebView soon after the `pause` edge, and its timers stop
 * with it: a JS timer armed at that edge fires on the way back, when the
 * answer no longer matters and acting on it would land on a resume. So on iOS
 * the timer is native. `hold` starts a background task, and after `ms` answers
 * whether the app is still backgrounded; WebKit wakes the page to deliver that
 * answer, and the renderer does its work before the task ends. A return to the
 * foreground answers early with `backgrounded: false`.
 *
 * iOS only. Android keeps its WebView's timers running in the background
 * (Capacitor's `KeepRunning` default), and the dev browser does too, so both
 * use a plain timer.
 *
 * The native half lives in the app project, not an npm package:
 * `ios/App/App/BackgroundGracePlugin.swift`.
 */
import { registerPlugin } from "@capacitor/core";

export interface BackgroundGraceHoldResult {
  /** Whether the app was still in the background when the hold ended. */
  readonly backgrounded: boolean;
}

/** The native plugin's surface. Tests fake this boundary. */
export interface BackgroundGracePluginSlice {
  /**
   * Holds the app for `ms` under a background task. Resolves after `ms`, or
   * early with `backgrounded: false` once the app returns to the foreground.
   * Rejects where the plugin is not registered (the dev web entry).
   */
  hold(options: { readonly ms: number }): Promise<BackgroundGraceHoldResult>;
}

export const BackgroundGrace =
  registerPlugin<BackgroundGracePluginSlice>("BackgroundGrace");
