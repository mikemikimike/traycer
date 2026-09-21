import { createElement, lazy } from "react";
import { PanelsTopLeft } from "lucide-react";
import type { HeaderTab, TabKindModule } from "@/stores/tabs/types";
import { tabCommandCoordinator } from "@/stores/tabs/tab-command-coordinator";

const sampleWorkspaceSurface = lazy(() =>
  import("@/components/sample-workspace/sample-workspace-surface").then(
    (module) => ({ default: module.SampleWorkspaceSurface }),
  ),
);
const tab: Extract<HeaderTab, { kind: "sample-workspace" }> = {
  kind: "sample-workspace",
  id: "sample-workspace",
  route: "/sample-workspace",
  name: "Sample workspace",
  icon: PanelsTopLeft,
  canDuplicate: false,
  canOpenInNewWindow: false,
  // The one tab that is a MODE rather than a place: while it is open the user
  // is customizing the layout, and the amber cap says so in the app's own
  // status vocabulary (L-87). The `warning` role, because nothing is broken
  // and nothing is being destroyed - something is merely not ordinary. It
  // pairs with the dotted outline `layout-editor.css` draws around the app
  // column, which is the other half of "you are editing this screen" and uses
  // this same token.
  //
  // The pair's FOREGROUND rather than its tint: `--warning` measures 2.56:1 to
  // 2.95:1 against the surfaces this lands on in every light palette, under
  // the 3:1 a non-text indicator owes, exactly as `--ring` did for the
  // selection ring (L-78). Both halves are measured in
  // `layout-editor/__tests__/layout-editor-contrast.test.ts`.
  appearance: { color: "var(--warning-foreground)", icon: null },
};
export const sampleWorkspaceTabModule: TabKindModule<"sample-workspace", null> =
  {
    kind: "sample-workspace",
    build: () => tab,
    descriptor: {
      kind: "sample-workspace",
      surface: {
        render: (tab) =>
          createElement(sampleWorkspaceSurface, { tabId: tab.id }),
        canonicalRoute: (tab) => tab.route,
        splitEligibility: "ineligible",
        duplication: "forbidden",
        singleton: "per-window",
        newWindow: "none",
        readinessScope: "none",
        durableState: { owner: "none", eviction: "reconstruct" },
      },
      duplicate: () => null,
      resolveIntent: () => ({ kind: "sample-workspace" }),
      routeOptions: () => ({ to: "/sample-workspace" }),
      activate: () => undefined,
      requestClose: (tab) => {
        tabCommandCoordinator.closeRefAfterConfirmed({
          kind: tab.kind,
          id: tab.id,
        });
      },
      requiresCloseConfirm: () => false,
      openInNewWindow: () => undefined,
      matchesPath: (tab, pathname) => pathname === tab.route,
    },
  };
