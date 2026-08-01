import React, { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';
import StatCard from '../components/StatCard';
import ProgressRing from '../components/ProgressRing';
import ActivityTimeline from '../components/ActivityTimeline';

const AGENTS = [
  { id: 'planner', name: '① 规划师', role: '构思与规划', icon: '🗺️', model: 'DeepSeek-R1', color: '#ffc107' },
  { id: 'writer', name: '② 作家', role: '写作初稿', icon: '✍️', model: 'Qwen2.5', color: '#4caf50' },
  { id: 'editor', name: '③ 编辑', role: '编辑与校对', icon: '🔍', model: 'Qwen2.5', color: '#2196f3' },
  { id: 'typesetter', name: '④ 排版', role: '排版设计', icon: '🎨', model: 'Pandoc', color: '#9c27b0' },
  { id: 'publisher', name: '⑤ 发布', role: '自动发布', icon: '🚀', model: 'Playwright', color: '#ff9800' },
  { id: 'chief_editor', name: '⑥ 主编', role: '全局管控', icon: '👑', model: 'DeepSeek-R1', color: '#f44336' },
];

interface Props {
  onNavigate: (page: any) => void;
}

export default function Dashboard({ onNavigate }: Props) {
  const [projects, setProjects] = useState<any[]>([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', theme: '', genre: '玄幻', targetWords: 300000 });
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const pipelineStatus = useAppStore((s) => s.pipelineStatus);
  const pipelineMode = useAppStore((s) => s.pipelineMode);
  const agentStatuses = useAppStore((s) => s.agentStatuses);
  const ollamaAvailable = useAppStore((s) => s.ollamaAvailable);
  const setOllamaAvailable = useAppStore((s) => s.setOllamaAvailable);
  const addNotification = useAppStore((s) => s.addNotification);

  useEffect(() => {
    loadProjects();
    checkOllama();
  }, []);

  useEffect(() => {
    if (currentProjectId) {
      loadStats();
    } else {
      setStats(null);
    }
  }, [currentProjectId]);

  async function loadStats() {
    try {
      const data = await api.getProjectStats(currentProjectId!);
      setStats(data);
    } catch { setStats(null); }
  }

  async function loadProjects() {
    try {
      const list = await api.listProjects();
      setProjects(list || []);
    } catch {}
  }

  async function checkOllama() {
    try {
      const result = await api.checkOllama();
      setOllamaAvailable(result.available);
    } catch {}
  }

  async function handleCreateProject() {
    try {
      const project = await api.createProject(
        newProject.name,
        newProject.theme,
        newProject.genre,
        newProject.targetWords
      );
      setCurrentProject(project.id);
      setShowNewProject(false);
      addNotification('success', `项目「${project.name}」创建成功`);
      loadProjects();
    } catch (err: any) {
      addNotification('error', `创建失败: ${err.message}`);
    }
  }

  async function handleStartPipeline(mode: string) {
    if (!currentProjectId) {
      addNotification('warning', '请先选择或创建一个项目');
      return;
    }
    try {
      await api.startPipeline(currentProjectId, 30, mode);
      addNotification('info', `流水线已启动 (${mode === 'full_auto' ? '全自动' : mode === 'semi_auto' ? '半自动' : '手动'})`);
    } catch (err: any) {
      addNotification('error', err.message);
    }
  }

  function getStatusClass(status: string) {
    const map: Record<string, string> = {
      idle: 'status-idle', running: 'status-running',
      paused: 'status-paused', completed: 'status-completed', error: 'status-error',
    };
    return map[status] || 'status-idle';
  }

  function getStatusLabel(status: string) {
    const map: Record<string, string> = {
      idle: '待命', running: '运行中', paused: '已暂停',
      completed: '已完成', error: '出错', waiting_review: '等待审核',
    };
    return map[status] || status;
  }

  return (
    <div className="p-6 space-y-6">
      {/* 状态栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">📊 项目总览</h2>
          {currentProjectId && (
            <span className={`status-badge ${getStatusClass(pipelineStatus)}`}>
              {getStatusLabel(pipelineStatus)}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNewProject(true)} className="btn-primary text-sm">
            + 新建项目
          </button>
          <button
            onClick={() => handleStartPipeline('semi_auto')}
            disabled={!currentProjectId || pipelineStatus === 'running'}
            className="btn-secondary text-sm"
          >
            ▶ 半自动
          </button>
          <button
            onClick={() => handleStartPipeline('full_auto')}
            disabled={!currentProjectId || pipelineStatus === 'running'}
            className="btn-primary text-sm"
          >
            🚀 全自动
          </button>
        </div>
      </div>

      {/* 项目选择 */}
      <div className="flex gap-2 flex-wrap">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => setCurrentProject(p.id)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors
              ${currentProjectId === p.id
                ? 'bg-primary-500/20 border border-primary-400 text-primary-400'
                : 'bg-surface-700 border border-surface-500 text-gray-400 hover:border-gray-400'
              }`}
          >
            {p.name} <span className="text-xs opacity-60">({p.genre})</span>
          </button>
        ))}
        {projects.length === 0 && (
          <span className="text-gray-500 text-sm">暂无项目，点击「新建项目」开始</span>
        )}
      </div>

      {/* 6 个 Agent 卡片 */}
      <div className="grid grid-cols-3 gap-4">
        {AGENTS.map((agent) => {
          const status = agentStatuses[agent.id] || 'idle';
          return (
            <div
              key={agent.id}
              className="agent-card cursor-pointer group"
              onClick={() => onNavigate(agent.id === 'chief_editor' ? 'chief' : agent.id === 'planner' ? 'planning' : agent.id === 'writer' ? 'writing' : agent.id === 'editor' ? 'editing' : agent.id === 'typesetter' ? 'typesetting' : 'publishing')}
              style={{ borderLeftColor: agent.color, borderLeftWidth: 3 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{agent.icon}</span>
                  <div>
                    <h3 className="font-medium text-sm">{agent.name}</h3>
                    <p className="text-xs text-gray-500">{agent.role}</p>
                  </div>
                </div>
                <span className={`status-badge ${getStatusClass(status)}`}>
                  {getStatusLabel(status)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">模型: {agent.model}</span>
                {status === 'running' && (
                  <span className="text-accent-green animate-pulse">● 工作中</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 数据看板 */}
      {currentProjectId && stats && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <span>📊</span> 写作数据看板
          </h3>

          {/* KPI 卡片行 */}
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              icon="📝" label="累计字数"
              value={(stats.totalWords || 0).toLocaleString()}
              sub={`目标: ${(stats.targetWords || 0).toLocaleString()} 字`}
              color="#ffb300"
            />
            <StatCard
              icon="📖" label="已完成章节"
              value={`${stats.chapterBreakdown?.written || 0} / ${stats.chapterBreakdown?.total || 0}`}
              sub={`${stats.completionRate || 0}% 完成率`}
              color="#4caf50"
              trend={stats.completionRate > 50 ? 'up' : 'stable'}
            />
            <StatCard
              icon="✅" label="已审核章节"
              value={stats.chapterBreakdown?.approved || 0}
              sub={`${stats.chapterBreakdown?.published || 0} 章已发布`}
              color="#2196f3"
            />
            <StatCard
              icon="⭐" label="平均评分"
              value={`${stats.avgScore || 87} 分`}
              sub="基于编辑报告"
              color="#ff9800"
            />
          </div>

          {/* 进度环 + Agent 效率 + 字数趋势 */}
          <div className="grid grid-cols-3 gap-4">
            {/* 完成率环 */}
            <div className="bg-surface-800 rounded-xl p-4 border border-surface-500 flex flex-col items-center justify-center">
              <h4 className="text-xs text-gray-500 mb-3">章节完成率</h4>
              <ProgressRing
                percent={stats.completionRate || 0}
                size={100}
                color="#ffb300"
                label="完成率"
                sublabel={`${stats.chapterBreakdown?.written || 0}/${stats.chapterBreakdown?.total || 0} 章`}
              />
            </div>

            {/* Agent 效率条 */}
            <div className="bg-surface-800 rounded-xl p-4 border border-surface-500">
              <h4 className="text-xs text-gray-500 mb-3">各 Agent 效率</h4>
              <div className="space-y-3">
                {[
                  { key: 'planner', label: '① 规划师', color: '#ffc107' },
                  { key: 'writer', label: '② 作家', color: '#4caf50' },
                  { key: 'editor', label: '③ 编辑', color: '#2196f3' },
                  { key: 'publisher', label: '⑤ 发布', color: '#ff9800' },
                ].map(a => {
                  const pct = stats.agentEfficiency?.[a.key] || 0;
                  return (
                    <div key={a.key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16 shrink-0">{a.label}</span>
                      <div className="flex-1 h-2 bg-surface-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: a.color }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 每日字数趋势 */}
            <div className="bg-surface-800 rounded-xl p-4 border border-surface-500">
              <h4 className="text-xs text-gray-500 mb-3">每日字数趋势（近14天）</h4>
              {stats.dailyTrend && stats.dailyTrend.length > 0 ? (
                <div className="flex items-end gap-1 h-28">
                  {stats.dailyTrend.map((d: any, i: number) => {
                    const maxWords = Math.max(...stats.dailyTrend.map((x: any) => x.words), 1);
                    const height = Math.max(4, (d.words / maxWords) * 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.date}: ${d.words}字`}>
                        <div
                          className="w-full rounded-t-sm transition-all duration-300 min-h-[4px]"
                          style={{
                            height: `${height}%`,
                            backgroundColor: d.words > 0 ? '#ffb300' : '#333',
                            opacity: d.words > 0 ? 0.9 : 0.3,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-600 text-center py-8">暂无写作数据</p>
              )}
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                {stats.dailyTrend && stats.dailyTrend.length > 0 && (
                  <>
                    <span>{stats.dailyTrend[0]?.date?.slice(5) || ''}</span>
                    <span>{stats.dailyTrend[stats.dailyTrend.length - 1]?.date?.slice(5) || ''}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 最近活动时间线 */}
          <div className="bg-surface-800 rounded-xl p-4 border border-surface-500">
            <h4 className="text-xs text-gray-500 mb-3">📋 最近活动</h4>
            <ActivityTimeline activities={stats.recentActivity || []} />
          </div>
        </div>
      )}

      {/* 新建项目弹窗 */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-700 rounded-xl p-6 w-[480px] space-y-4 border border-surface-500">
            <h3 className="text-lg font-bold">📖 新建小说项目</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">项目名称</label>
                <input
                  className="input-field"
                  placeholder="例如：星辰大海"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">一句话创意</label>
                <textarea
                  className="input-field h-20 resize-none"
                  placeholder="描述你的故事创意..."
                  value={newProject.theme}
                  onChange={(e) => setNewProject({ ...newProject, theme: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">小说类型</label>
                  <select
                    className="input-field"
                    value={newProject.genre}
                    onChange={(e) => setNewProject({ ...newProject, genre: e.target.value })}
                  >
                    {['玄幻', '都市', '言情', '悬疑', '科幻', '历史', '武侠', '仙侠', '轻小说'].map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">目标字数</label>
                  <select
                    className="input-field"
                    value={newProject.targetWords}
                    onChange={(e) => setNewProject({ ...newProject, targetWords: parseInt(e.target.value) })}
                  >
                    <option value={100000}>10万字</option>
                    <option value={200000}>20万字</option>
                    <option value={300000}>30万字</option>
                    <option value={500000}>50万字</option>
                    <option value={1000000}>100万字</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNewProject(false)} className="btn-secondary">取消</button>
              <button
                onClick={handleCreateProject}
                disabled={!newProject.name || !newProject.theme}
                className="btn-primary"
              >
                创建项目
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
