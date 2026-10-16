import type { UrlScheme } from "@/lib/urls";

export type { UrlScheme };

export const TEMPLATE = {
  id: "covixy-supabase",
  version: "1.0.0",
  postgresMajor: 17,
  ramMb: 1536,
  containers: 9,
  notes:
    "Pins the images from the official self-hosted compose as of 2026-10-16. Postgres 17 is the current image, and the major version is stored on each project. Edge functions, the pooler, and analytics are left out so a stack stays near the 1–2 GB estimate. Studio is on its own hostname and is not behind Cloudflare Access yet.",
} as const;

export const RAM_STATUSES = ["queued", "provisioning", "starting", "running", "pausing", "resuming", "deleting"] as const;

export type ProjectStatus =
  | (typeof RAM_STATUSES)[number]
  | "paused"
  | "failed";

export type JobType = "provision" | "pause" | "resume" | "delete" | "sync-env";
export type JobStatus = "pending" | "running" | "done" | "failed";

export type Project = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  apiHost: string;
  studioHost: string;
  scheme: UrlScheme;
  customDomain: string | null;
  panelHost: string | null;
  templateId: string;
  templateVersion: string;
  postgresMajor: number;
  coolifyServiceUuid: string | null;
  keysLocal: boolean;
  volumeKey: string | null;
  bootAt: string | null;
  ramMb: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Job = {
  id: string;
  projectId: string | null;
  projectSlug: string;
  type: JobType;
  status: JobStatus;
  log: string;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type AuditEntry = {
  id: string;
  at: string;
  action: string;
  projectId: string | null;
  projectSlug: string;
  detail: string;
};
