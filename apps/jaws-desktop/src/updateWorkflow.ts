export type UpdateCheckSource = "startup" | "manual";

export type UpdatePipelineEntry = {
  id: string;
  label: string;
  status: "ready" | "checking" | "ok" | "error" | "info";
  detail: string;
};

export type JawsReleaseIndex = {
  version: string;
  tag: string;
  repo: string;
  github: {
    releaseUrl: string;
    apiUrl: string;
    baseAssetUrl: string;
  };
  mirrors: Array<{
    id: string;
    label: string;
    pageUrl: string;
    routeBaseUrl: string;
  }>;
};

export type UpdateNotice = {
  title: string;
  detail: string;
  tone: "update";
};

export type UpdateSuccessWorkflow = {
  updateState: string;
  promptHidden: boolean;
  openNotificationTray: boolean;
  notice: UpdateNotice | null;
  pipeline: UpdatePipelineEntry[];
};

export type UpdateFailureWorkflow = {
  updateState: string;
  pipeline: UpdatePipelineEntry[];
};

export function createInitialUpdatePipeline(index: JawsReleaseIndex): UpdatePipelineEntry[] {
  return [
    {
      id: "runtime",
      label: "Tauri updater",
      status: "ready",
      detail: "Waiting for a signed update check from the native runtime."
    },
    ...index.mirrors.map((mirror) => ({
      id: mirror.id,
      label: `${mirror.label} mirror`,
      status: "ready" as const,
      detail: `${mirror.routeBaseUrl}/latest.json`
    })),
    {
      id: "github",
      label: "GitHub release",
      status: "ready",
      detail: `${index.tag} signed assets`
    }
  ];
}

export function createPreviewUpdatePipeline(index: JawsReleaseIndex): UpdatePipelineEntry[] {
  return [
    {
      id: "runtime",
      label: "Tauri updater",
      status: "error",
      detail: "The signed updater only runs inside the native JAWS desktop shell."
    },
    ...index.mirrors.map((mirror) => ({
      id: mirror.id,
      label: `${mirror.label} mirror`,
      status: "info" as const,
      detail: mirror.pageUrl
    })),
    {
      id: "github",
      label: "GitHub release",
      status: "info",
      detail: index.github.releaseUrl
    },
    {
      id: "manifest",
      label: "Signed manifest",
      status: "info",
      detail: `${index.github.baseAssetUrl}/latest.json`
    }
  ];
}

export function markUpdatePipelineChecking(entries: UpdatePipelineEntry[]): UpdatePipelineEntry[] {
  return entries.map((entry) => ({
    ...entry,
    status: "checking",
    detail:
      entry.id === "runtime"
        ? "Calling Tauri updater.check() against signed endpoints."
        : "Native runtime is probing the live release surface."
  }));
}

export function resolveUpdateSuccess(
  updateVersion: string | null,
  releaseEntries: UpdatePipelineEntry[]
): UpdateSuccessWorkflow {
  if (!updateVersion) {
    return {
      updateState: "Current release",
      promptHidden: false,
      openNotificationTray: false,
      notice: null,
      pipeline: [
        {
          id: "runtime",
          label: "Tauri updater",
          status: "ok",
          detail: "No newer signed release was offered by the updater."
        },
        ...releaseEntries
      ]
    };
  }

  return {
    updateState: `Update ${updateVersion} ready`,
    promptHidden: false,
    openNotificationTray: true,
    notice: {
      title: `JAWS ${updateVersion} ready`,
      detail: "A signed update is available. Choose Install Now or Later from the top bar or Settings.",
      tone: "update"
    },
    pipeline: [
      {
        id: "runtime",
        label: "Tauri updater",
        status: "ok",
        detail: `Signed update ${updateVersion} is ready.`
      },
      ...releaseEntries
    ]
  };
}

export function resolveUpdateFailure(error: unknown, releaseEntries: UpdatePipelineEntry[]): UpdateFailureWorkflow {
  const detail = String(error);
  return {
    updateState: detail,
    pipeline: [
      {
        id: "runtime",
        label: "Tauri updater",
        status: "error",
        detail
      },
      ...releaseEntries
    ]
  };
}

export function shouldResetDeferredPrompt(source: UpdateCheckSource): boolean {
  return source === "manual";
}

export function formatDeferredUpdateState(version: string): string {
  return `Update ${version} deferred for this session`;
}
