import type { IpcHostController } from "../ipc/runner-ipc-bridge";
import {
  HOST_NOT_SERVICE_RUN_MESSAGE,
  HOST_REMOVED_BY_USER_MESSAGE,
} from "../host/host-controller-types";

export class HostRecoveryDeferredError extends Error {
  constructor() {
    super("Host recovery deferred while another Traycer process owns the lock");
  }
}

/**
 * The recovery's restart was refused because the running host is a person's
 * `traycer host start` in a terminal (`E_HOST_NOT_SERVICE_RUN`): present, and
 * not this app's. Nothing was touched, and nothing this app does will change
 * that until the terminal run ends, so the monitor stops asking.
 */
export class HostRecoveryNotServiceRunError extends Error {
  constructor() {
    super("Host recovery refused: a host started in a terminal is running");
  }
}

// Bridges `HostController.recoverIfDown()` (the health monitor's automatic
// recovery intent) to `startHostHealthMonitor`'s `respawn: () => Promise<void>`
// contract. Kept in its own Electron-free module (like `host-wake-recovery.ts`)
// so this classification is directly unit-testable through the same function
// the monitor calls, rather than only reachable by driving the whole Electron
// boot sequence.
//
// Fixup B3 (lock-contention terminal contract, automatic-intent class):
// `recoverIfDown` resolves "deferred" for lock-contention (`E_CLI_LOCK_BUSY`)
// and for a removed-by-user host. The latter is terminal for automatic
// recovery; the former must re-arm the monitor after its snapshot was
// demoted. A distinct error lets the monitor preserve that retry ownership
// without logging expected lock contention as a generic recovery failure.
//
// It also resolves "deferred" when the host is a terminal's `traycer host
// start` (`HOST_NOT_SERVICE_RUN_MESSAGE`). That one is neither terminal nor
// retryable: the monitor leaves the run alone until it is gone, so it gets its
// own error.
export async function respawnIfDown(
  hostController: IpcHostController,
): Promise<void> {
  const outcome = await hostController.recoverIfDown();
  if (outcome.kind === "ok") {
    return;
  }
  // A caller cannot infer that an arbitrary in-flight mutation will reload
  // the lifecycle (register-service, for example, does not). Keep monitor
  // ownership until its own reload observes a reachable snapshot.
  if (outcome.kind === "suppressed") {
    throw new HostRecoveryDeferredError();
  }
  if (outcome.kind === "deferred") {
    if (outcome.message === HOST_REMOVED_BY_USER_MESSAGE) return;
    if (outcome.message === HOST_NOT_SERVICE_RUN_MESSAGE) {
      throw new HostRecoveryNotServiceRunError();
    }
    throw new HostRecoveryDeferredError();
  }
  throw new Error(outcome.message);
}
