import {
  ModImportRequestSchema,
  ModImportResultSchema,
  ModRecommendationBundleSchema,
  ModSearchResponseSchema,
  ProjectActionSchema,
  ProjectConfigUpdateSchema,
  ProjectCreateSchema,
  ProjectDetailSchema,
  ProjectModsDetailSchema,
  ProjectModsUpdateSchema,
  ProjectSummarySchema,
  TargetTestRequestSchema,
  TargetTestResponseSchema,
  type ModImportRequest,
  type ModImportResult,
  type ModRecommendationBundle,
  type ModSearchResponse,
  type ProjectAction,
  type ProjectConfigUpdateInput,
  type ProjectCreateInput,
  type ProjectDetail,
  type ProjectModsDetail,
  type ProjectModsUpdateInput,
  type ProjectSummary,
  type TargetTestRequest,
  type TargetTestResponse,
} from '../schemas/project';

export class DstLauncherApiClient {
  constructor(private readonly baseUrl: string) {}

  async getProjects(): Promise<ProjectSummary[]> {
    const response = await request(`${this.baseUrl}/projects`);
    return ProjectSummarySchema.array().parse(response);
  }

  async createProject(input: ProjectCreateInput): Promise<ProjectDetail> {
    const response = await request(`${this.baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ProjectCreateSchema.parse(input)),
    });
    return ProjectDetailSchema.parse(response);
  }

  async getProject(projectId: string): Promise<ProjectDetail> {
    const response = await request(`${this.baseUrl}/projects/${projectId}`);
    return ProjectDetailSchema.parse(response);
  }

  async updateProject(projectId: string, input: ProjectConfigUpdateInput): Promise<ProjectDetail> {
    const response = await request(`${this.baseUrl}/projects/${projectId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ProjectConfigUpdateSchema.parse(input)),
    });
    return ProjectDetailSchema.parse(response);
  }

  async runAction(projectId: string, action: ProjectAction): Promise<{ ok: true }> {
    ProjectActionSchema.parse(action);
    const response = await request(`${this.baseUrl}/projects/${projectId}/actions/${action}`, {
      method: 'POST',
    });
    return response as { ok: true };
  }

  async testTarget(input: TargetTestRequest): Promise<TargetTestResponse> {
    const response = await request(`${this.baseUrl}/targets/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(TargetTestRequestSchema.parse(input)),
    });
    return TargetTestResponseSchema.parse(response);
  }

  async searchMods(query: string, page = 1): Promise<ModSearchResponse> {
    const url = new URL(`${this.baseUrl}/mods/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('page', String(page));
    const response = await request(url.toString());
    return ModSearchResponseSchema.parse(response);
  }

  async getModRecommendations(): Promise<ModRecommendationBundle[]> {
    const response = await request(`${this.baseUrl}/mods/recommendations`);
    return ModRecommendationBundleSchema.array().parse(response);
  }

  async importMods(input: ModImportRequest): Promise<ModImportResult> {
    const response = await request(`${this.baseUrl}/mods/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ModImportRequestSchema.parse(input)),
    });
    return ModImportResultSchema.parse(response);
  }

  async getProjectMods(projectId: string): Promise<ProjectModsDetail> {
    const response = await request(`${this.baseUrl}/projects/${projectId}/mods`);
    return ProjectModsDetailSchema.parse(response);
  }

  async updateProjectMods(projectId: string, input: ProjectModsUpdateInput): Promise<ProjectModsDetail> {
    const response = await request(`${this.baseUrl}/projects/${projectId}/mods`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ProjectModsUpdateSchema.parse(input)),
    });
    return ProjectModsDetailSchema.parse(response);
  }
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const message = extractErrorMessage(payload) || `请求失败: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }

  return null;
}
