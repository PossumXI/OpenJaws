import { describe, expect, test } from "bun:test";
import {
  createInitialUpdatePipeline,
  createPreviewUpdatePipeline,
  formatDeferredUpdateState,
  markUpdatePipelineChecking,
  resolveUpdateFailure,
  resolveUpdateSuccess,
  shouldResetDeferredPrompt,
  type JawsReleaseIndex,
  type UpdatePipelineEntry
} from "./updateWorkflow";

const releaseIndex: JawsReleaseIndex = {
  version: "0.1.5",
  tag: "jaws-v0.1.5",
  repo: "PossumXI/OpenJaws",
  github: {
    releaseUrl: "https://github.com/PossumXI/OpenJaws/releases/tag/jaws-v0.1.5",
    apiUrl: "https://api.github.com/repos/PossumXI/OpenJaws/releases/tags/jaws-v0.1.5",
    baseAssetUrl: "https://github.com/PossumXI/OpenJaws/releases/download/jaws-v0.1.5"
  },
  mirrors: [
    {
      id: "qline",
      label: "qline.site",
      pageUrl: "https://qline.site/downloads/jaws",
      routeBaseUrl: "https://qline.site/downloads/jaws"
    },
    {
      id: "iorch",
      label: "iorch.net",
      pageUrl: "https://iorch.net/downloads/jaws",
      routeBaseUrl: "https://iorch.net/downloads/jaws"
    }
  ]
};

const probeEntries: UpdatePipelineEntry[] = [
  {
    id: "qline",
    label: "qline.site mirror",
    status: "ok",
    detail: "qline updater endpoint reachable"
  }
];

describe("JAWS update workflow", () => {
  test("builds release-index-backed initial and preview diagnostics", () => {
    expect(createInitialUpdatePipeline(releaseIndex)).toEqual([
      expect.objectContaining({ id: "runtime", status: "ready" }),
      expect.objectContaining({ id: "qline", detail: "https://qline.site/downloads/jaws/latest.json" }),
      expect.objectContaining({ id: "iorch", detail: "https://iorch.net/downloads/jaws/latest.json" }),
      expect.objectContaining({ id: "github", detail: "jaws-v0.1.5 downloads" })
    ]);

    expect(createPreviewUpdatePipeline(releaseIndex)).toContainEqual(
      expect.objectContaining({
        id: "manifest",
        status: "info",
        detail: "https://github.com/PossumXI/OpenJaws/releases/download/jaws-v0.1.5/latest.json"
      })
    );
  });

  test("shows install now/later prompt when startup finds a signed update", () => {
    const workflow = resolveUpdateSuccess("0.1.5", probeEntries);

    expect(workflow.updateState).toBe("Update 0.1.5 ready");
    expect(workflow.promptHidden).toBe(false);
    expect(workflow.openNotificationTray).toBe(true);
    expect(workflow.notice).toEqual({
      title: "JAWS 0.1.5 ready",
      detail: "A signed update is available. Choose Install Now or Later from the top bar or Settings.",
      tone: "update"
    });
    expect(workflow.pipeline[0]).toEqual({
      id: "runtime",
      label: "Update check",
      status: "ok",
      detail: "JAWS 0.1.5 is ready to install."
    });
  });

  test("keeps current installs quiet while preserving mirror probe results", () => {
    const workflow = resolveUpdateSuccess(null, probeEntries);

    expect(workflow.updateState).toBe("Current release");
    expect(workflow.openNotificationTray).toBe(false);
    expect(workflow.notice).toBeNull();
    expect(workflow.pipeline).toContainEqual(probeEntries[0]);
  });

  test("keeps manual check, failure, and later-deferral semantics explicit", () => {
    expect(shouldResetDeferredPrompt("startup")).toBe(false);
    expect(shouldResetDeferredPrompt("manual")).toBe(true);
    expect(formatDeferredUpdateState("0.1.5")).toBe("Update 0.1.5 deferred for this session");

    expect(markUpdatePipelineChecking(probeEntries)[0]).toMatchObject({
      status: "checking",
      detail: "Checking this download source."
    });

    expect(resolveUpdateFailure(new Error("network down"), probeEntries)).toMatchObject({
      updateState: "Error: network down",
      pipeline: [
        {
          id: "runtime",
          label: "Update check",
          status: "error",
          detail: "Error: network down"
        },
        probeEntries[0]
      ]
    });
  });
});
