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
      label: "Update check",
      status: "ready",
      detail: "Ready to check for a safe JAWS update."
    },
    ...index.mirrors.map((mirror) => ({
      id: mirror.id,
      label: `${mirror.label} mirror`,
      status: "ready" as const,
      detail: `${mirror.routeBaseUrl}/latest.json`
    })),
    {
      id: "github",
      label: "GitHub download",
      status: "ready",
      detail: `${index.tag} downloads`
    }
  ];
}

export function createPreviewUpdatePipeline(index: JawsReleaseIndex): UpdatePipelineEntry[] {
  return [
    {
      id: "runtime",
      label: "Update check",
      status: "error",
      detail: "Open the JAWS desktop app to check for updates."
    },
    ...index.mirrors.map((mirror) => ({
      id: mirror.id,
      label: `${mirror.label} mirror`,
      status: "info" as const,
      detail: mirror.pageUrl
    })),
    {
      id: "github",
      label: "GitHub download",
      status: "info",
      detail: index.github.releaseUrl
    },
    {
      id: "manifest",
      label: "Update file",
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
        ? "Checking for a safe update."
        : "Checking this download source."
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
          label: "Update check",
          status: "ok",
          detail: "You are already on the newest JAWS release."
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
        label: "Update check",
        status: "ok",
        detail: `JAWS ${updateVersion} is ready to install.`
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
        label: "Update check",
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
