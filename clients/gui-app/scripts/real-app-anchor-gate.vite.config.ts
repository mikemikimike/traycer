import { readFileSync } from "node:fs";
import path from "node:path";
import base from "../vitest.config";

const tooltipWrapperPath = path.resolve(
  __dirname,
  "..",
  "src/components/ui/tooltip-wrapper.tsx",
);

// Run a saved pre-fix control without changing the production source file.
const tooltipWrapperOverridePlugin = {
  name: "anchor-gate-tooltip-wrapper-override",
  load(id: string): string | null {
    const envPath = process.env.ANCHOR_GATE_TOOLTIP_SOURCE;
    if (envPath === undefined || id !== tooltipWrapperPath) return null;
    return readFileSync(envPath, "utf8");
  },
};

export default {
  ...base,
  plugins: [...base.plugins, tooltipWrapperOverridePlugin],
  resolve: {
    ...base.resolve,
    alias: [
      {
        find: "@/components/layout/tabs/tab-strip",
        replacement: path.resolve(
          __dirname,
          "..",
          "src/__tests__/browser/stubs/tab-strip-stub.tsx",
        ),
      },
      ...(base.resolve?.alias ?? []),
    ],
  },
};
