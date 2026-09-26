import { apiRequest } from "./client";
import type {
  CreateProjectRequest,
  CreateTaskRequest,
  Project,
  Task,
  UpdateProjectRequest,
  UpdateTaskRequest,
} from "./types";

// --- Projects ---------------------------------------------------------------

export async function listProjects(
  params: {
    status?: Project["status"];
    query?: string;
    include_deleted?: boolean;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.query) query.set("query", params.query);
  if (params.include_deleted) query.set("include_deleted", "true");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<{ projects: Project[] }>(`/api/app/projects${suffix}`);
}

export async function createProject(input: CreateProjectRequest) {
  return apiRequest<{ project: Project }>("/api/app/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProject(id: string, input: UpdateProjectRequest) {
  return apiRequest<{ project: Project }>(
    `/api/app/projects/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function archiveProject(id: string, archived: boolean) {
  return apiRequest<{ project: Project }>(
    `/api/app/projects/${encodeURIComponent(id)}/${
      archived ? "archive" : "unarchive"
    }`,
    { method: "POST" },
  );
}

export async function deleteProject(id: string) {
  return apiRequest<{ ok: true }>(
    `/api/app/projects/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

// DELETE is a soft delete; this pulls a binned project — and the tasks that
// went with it — back out of the recycle bin.
export async function restoreProject(id: string) {
  return apiRequest<{ project: Project }>(
    `/api/app/projects/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}

// --- Tasks ------------------------------------------------------------------

export async function listTasks(
  params: {
    project_id?: string;
    status?: Task["status"];
    priority?: Task["priority"];
    due_from?: string;
    due_to?: string;
    include_deleted?: boolean;
    page_size?: number;
    page_token?: string;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.project_id) query.set("project_id", params.project_id);
  if (params.status) query.set("status", params.status);
  if (params.priority) query.set("priority", params.priority);
  if (params.due_from) query.set("due_from", params.due_from);
  if (params.due_to) query.set("due_to", params.due_to);
  if (params.include_deleted) query.set("include_deleted", "true");
  if (params.page_size) query.set("page_size", String(params.page_size));
  if (params.page_token) query.set("page_token", params.page_token);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<{ tasks: Task[]; next_page_token?: string }>(
    `/api/app/tasks${suffix}`,
  );
}

// A project-scoped sort: assigns `sort_order` = list index to every id given.
export async function reorderTasks(projectId: string, taskIds: string[]) {
  return apiRequest<{ tasks: Task[] }>("/api/app/tasks/reorder", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, task_ids: taskIds }),
  });
}

export async function createTask(input: CreateTaskRequest) {
  return apiRequest<{ task: Task }>("/api/app/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateTask(id: string, input: UpdateTaskRequest) {
  return apiRequest<{ task: Task }>(
    `/api/app/tasks/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function deleteTask(id: string) {
  return apiRequest<{ ok: true }>(`/api/app/tasks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// DELETE is a soft delete; this pulls a binned task back out of the bin.
export async function restoreTask(id: string) {
  return apiRequest<{ task: Task }>(
    `/api/app/tasks/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}
