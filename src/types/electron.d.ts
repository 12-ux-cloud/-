/**
 * REST API 类型声明 — 前端 API 客户端接口
 */
export interface ApiClient {
  checkOllama: () => Promise<{ available: boolean }>;
  listModels: () => Promise<string[]>;

  createProject: (name: string, theme: string, genre: string, targetWords: number) => Promise<any>;
  listProjects: () => Promise<any[]>;
  getProject: (id: number) => Promise<any>;

  getCharacters: (projectId: number) => Promise<any[]>;
  getOutlines: (projectId: number) => Promise<any[]>;
  getChapters: (projectId: number) => Promise<any[]>;
  getWorldSettings: (projectId: number) => Promise<any[]>;
  getMessages: (projectId: number, agentFilter?: string) => Promise<any[]>;

  configPlanner: (cfg: any) => Promise<any>;
  startPlanning: (projectId: number, idea: string) => Promise<any>;

  configWriter: (cfg: any) => Promise<any>;
  startWriting: (projectId: number, chapterNumber: number) => Promise<any>;

  configEditor: (cfg: any) => Promise<any>;
  startEditing: (projectId: number, chapterNumber: number) => Promise<any>;

  configTypesetter: (cfg: any) => Promise<any>;
  buildBook: (projectId: number) => Promise<any>;

  configPublisher: (cfg: any) => Promise<any>;
  publishChapter: (projectId: number, chapterNumber: number, approved: boolean) => Promise<any>;

  configChief: (cfg: any) => Promise<any>;
  reviewOutline: (projectId: number) => Promise<any>;
  reviewChapter: (projectId: number, chapterNumber: number) => Promise<any>;
  finalReview: (projectId: number) => Promise<any>;

  startPipeline: (projectId: number, totalChapters: number, mode: string) => Promise<any>;
  pausePipeline: (reason: string) => Promise<any>;
  resumePipeline: () => Promise<any>;
  getPipelineState: () => Promise<any>;
  confirmStage: (approved: boolean, feedback?: string) => Promise<any>;
}
