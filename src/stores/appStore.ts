import { create } from 'zustand';

export type PipelineMode = 'full_auto' | 'semi_auto' | 'manual';
export type PipelineStatus = 'idle' | 'running' | 'paused' | 'waiting_review' | 'completed' | 'error';

interface AppState {
  // 当前项目
  currentProjectId: number | null;
  setCurrentProject: (id: number | null) => void;

  // AI Provider
  ollamaAvailable: boolean;
  setOllamaAvailable: (v: boolean) => void;
  aiProvider: string;
  setAIProvider: (v: string) => void;

  // 流水线
  pipelineStatus: PipelineStatus;
  pipelineMode: PipelineMode;
  pipelineStage: string;
  setPipelineState: (state: Partial<{ pipelineStatus: PipelineStatus; pipelineMode: PipelineMode; pipelineStage: string }>) => void;

  // Agent 状态
  agentStatuses: Record<string, 'idle' | 'running' | 'done' | 'error'>;
  setAgentStatus: (agent: string, status: 'idle' | 'running' | 'done' | 'error') => void;

  // 通知
  notifications: { id: string; type: 'info' | 'success' | 'warning' | 'error'; message: string }[];
  addNotification: (type: 'info' | 'success' | 'warning' | 'error', message: string) => void;
  removeNotification: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentProjectId: null,
  setCurrentProject: (id) => set({ currentProjectId: id }),

  ollamaAvailable: false,
  setOllamaAvailable: (v) => set({ ollamaAvailable: v }),

  aiProvider: 'ollama',
  setAIProvider: (v) => set({ aiProvider: v }),

  pipelineStatus: 'idle',
  pipelineMode: 'semi_auto',
  pipelineStage: '',
  setPipelineState: (state) => set(state),

  agentStatuses: {},
  setAgentStatus: (agent, status) =>
    set((s) => ({ agentStatuses: { ...s.agentStatuses, [agent]: status } })),

  notifications: [],
  addNotification: (type, message) =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        { id: Date.now().toString(36) + Math.random().toString(36).slice(2), type, message },
      ],
    })),
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}));
