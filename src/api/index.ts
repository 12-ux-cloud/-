/**
 * REST API 客户端 — 替代 Electron IPC
 *
 * 所有前端页面通过此模块与后端通信。
 * API 基础地址默认为 localhost:3001。
 */

const API_BASE = 'http://localhost:3001';

async function request<T = any>(method: string, url: string, body?: any): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${url}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function get<T = any>(url: string): Promise<T> {
  return request('GET', url);
}

function post<T = any>(url: string, body?: any): Promise<T> {
  return request('POST', url, body);
}

// ===== 公共 API（与 preload.ts 接口一致） =====

const api = {
  // 系统
  checkOllama: () => get<{ available: boolean }>('/api/system/ollama'),
  listModels: () => get<string[]>('/api/system/models'),
  checkUpdate: () => get<{
    currentVersion: string;
    latestVersion: string;
    needsUpdate: boolean;
    changelog: string;
    downloadUrl: string;
    publishedAt: string;
    error?: string;
  }>('/api/system/update'),
  getDbPath: () => get<{ appDataPath: string; databasePath: string }>('/api/system/db-path'),

  // 项目
  createProject: (name: string, theme: string, genre: string, targetWords: number, batchMode?: string, batchSize?: number, hasSequel?: number) =>
    post('/api/projects', { name, theme, genre, targetWords, batchMode, batchSize, hasSequel }),
  listProjects: () => get('/api/projects'),
  getProject: (id: number) => get(`/api/projects/${id}`),

  // 知识库
  getCharacters: (projectId: number) => get(`/api/projects/${projectId}/characters`),
  getOutlines: (projectId: number) => get(`/api/projects/${projectId}/outlines`),
  getChapters: (projectId: number) => get(`/api/projects/${projectId}/chapters`),
  getWorldSettings: (projectId: number) => get(`/api/projects/${projectId}/world-settings`),
  getMessages: (projectId: number, agentFilter?: string) =>
    get(`/api/projects/${projectId}/messages${agentFilter ? `?agent=${agentFilter}` : ''}`),

  // ① 规划师
  configPlanner: (cfg: any) => post('/api/planner/config', cfg),
  startPlanning: (projectId: number, idea: string) =>
    post('/api/planner/start', { projectId, idea }),
  planNextBatch: (projectId: number) =>
    post('/api/planner/next-batch', { projectId }),

  // ② 作家
  configWriter: (cfg: any) => post('/api/writer/config', cfg),
  startWriting: (projectId: number, chapterNumber: number) =>
    post('/api/writer/write', { projectId, chapterNumber }),

  // ③ 编辑
  configEditor: (cfg: any) => post('/api/editor/config', cfg),
  startEditing: (projectId: number, chapterNumber: number) =>
    post('/api/editor/edit', { projectId, chapterNumber }),

  // ④ 排版
  configTypesetter: (cfg: any) => post('/api/typesetter/config', cfg),
  buildBook: (projectId: number) =>
    post('/api/typesetter/build', { projectId }),

  // ⑤ 发布
  configPublisher: (cfg: any) => post('/api/publisher/config', cfg),
  publishChapter: (projectId: number, chapterNumber: number, approved: boolean) =>
    post('/api/publisher/publish', { projectId, chapterNumber, approved }),

  // ⑥ 主编
  configChief: (cfg: any) => post('/api/chief/config', cfg),
  reviewOutline: (projectId: number) =>
    post('/api/chief/review-outline', { projectId }),
  reviewChapter: (projectId: number, chapterNumber: number) =>
    post('/api/chief/review-chapter', { projectId, chapterNumber }),
  finalReview: (projectId: number) =>
    post('/api/chief/final-review', { projectId }),

  // 流水线
  startPipeline: (projectId: number, totalChapters: number, mode: string) =>
    post('/api/pipeline/start', { projectId, totalChapters, mode }),
  pausePipeline: (reason: string) =>
    post('/api/pipeline/pause', { reason }),
  resumePipeline: () => post('/api/pipeline/resume'),
  getPipelineState: () => get('/api/pipeline/state'),
  confirmStage: (approved: boolean, feedback?: string) =>
    post('/api/pipeline/confirm', { approved, feedback }),

  // 统计数据
  getProjectStats: (projectId: number) => get(`/api/stats/${projectId}`),

  // 反馈
  submitFeedback: (category: string, content: string, contact: string) =>
    post('/api/feedback', { category, content, contact }),
  getFeedbackConfig: () => get('/api/feedback/config'),
  saveFeedbackConfig: (cfg: any) => post('/api/feedback/config', cfg),
  sendFeedbackNow: () => post('/api/feedback/send'),

  // 聊天
  sendChatMessage: (agent: string, message: string, attachment?: string) =>
    post('/api/chat/send', { agent, message, attachment }),
  getChatHistory: (agent?: string, limit?: number) =>
    get(`/api/chat/history?agent=${encodeURIComponent(agent || '全体')}&limit=${limit || 50}`),
  clearChatHistory: (agent?: string) =>
    post('/api/chat/clear', { agent }),

  // AI 提供者配置
  getAIConfig: () => get<{
    provider: string;
    ollamaUrl: string;
    openaiUrl: string;
    openaiKey: string;
    openaiModel: string;
    temperature: number;
    maxTokens: number;
  }>('/api/ai/config'),
  saveAIConfig: (cfg: any) => post('/api/ai/config', cfg),
  checkAIStatus: () => get<{ available: boolean; provider: string; modelName: string }>('/api/system/ai-status'),
};

export default api;
