import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';

export default function Planning() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const addNotification = useAppStore((s) => s.addNotification);

  const [idea, setIdea] = useState('');
  const [result, setResult] = useState<any>(null);
  const [batchInfo, setBatchInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [nextBatchLoading, setNextBatchLoading] = useState(false);
  const [config, setConfig] = useState({
    genre: '玄幻',
    totalChapters: 30,
    wordsPerChapter: 3000,
    protagonistGender: '男',
    protagonistPersonality: '',
    forbiddenTropes: '',
    requiredElements: '',
    batchMode: 'full' as 'full' | 'batch',
    batchSize: 5,
    hasSequel: false,
  });

  async function handleStart() {
    if (!currentProjectId) {
      addNotification('warning', '请先在总览页面选择项目');
      return;
    }
    if (!idea.trim()) {
      addNotification('warning', '请输入故事创意');
      return;
    }
    setLoading(true);
    setAgentStatus('planner', 'running');
    try {
      await api.configPlanner({
        genre: config.genre,
        totalChapters: config.totalChapters,
        wordsPerChapter: config.wordsPerChapter,
        protagonistGender: config.protagonistGender,
        protagonistPersonality: config.protagonistPersonality,
        forbiddenTropes: config.forbiddenTropes.split(',').filter(Boolean),
        requiredElements: config.requiredElements.split(',').filter(Boolean),
        batchMode: config.batchMode,
        batchSize: config.batchSize,
        hasSequel: config.hasSequel ? 1 : 0,
        batchStartChapter: 1,
      });
      const data = await api.startPlanning(currentProjectId, idea);
      setResult(data);
      setBatchInfo(data.batchInfo || null);
      setAgentStatus('planner', 'done');
      if (data.batchInfo) {
        addNotification('success', `第 ${data.batchInfo.batchNumber} 批规划完成！第${data.batchInfo.startChapter}-${data.batchInfo.endChapter}章`);
      } else {
        addNotification('success', '规划完成！大纲和人物设定已生成');
      }
    } catch (err: any) {
      addNotification('error', `规划失败: ${err.message}`);
      setAgentStatus('planner', 'error');
    }
    setLoading(false);
  }

  async function handleNextBatch() {
    if (!currentProjectId) return;
    setNextBatchLoading(true);
    setAgentStatus('planner', 'running');
    try {
      const data = await api.planNextBatch(currentProjectId);
      // 合并大纲
      setResult((prev: any) => ({
        ...prev,
        outlines: [...(prev?.outlines || []), ...data.outlines],
      }));
      setBatchInfo(data.batchInfo);
      setAgentStatus('planner', 'done');
      addNotification('success', `第 ${data.batchInfo.batchNumber} 批完成！第${data.batchInfo.startChapter}-${data.batchInfo.endChapter}章`);
    } catch (err: any) {
      addNotification('error', `生成下一批失败: ${err.message}`);
      setAgentStatus('planner', 'error');
    }
    setNextBatchLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">🗺️ ① 规划师 — 构思与规划</h2>

      {/* 创意输入 */}
      <div className="agent-card space-y-3">
        <h3 className="font-medium">📝 故事创意</h3>
        <textarea
          className="input-field h-32 resize-none"
          placeholder="描述你的故事创意、核心冲突和想要表达的主题..."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">类型</label>
            <select className="input-field" value={config.genre} onChange={(e) => setConfig({ ...config, genre: e.target.value })}>
              {['玄幻','都市','言情','悬疑','科幻','历史','武侠','仙侠'].map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">总章节</label>
            <input type="number" className="input-field" value={config.totalChapters} onChange={(e) => setConfig({ ...config, totalChapters: parseInt(e.target.value) || 30 })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">每章字数</label>
            <input type="number" className="input-field" value={config.wordsPerChapter} onChange={(e) => setConfig({ ...config, wordsPerChapter: parseInt(e.target.value) || 3000 })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">主角性别</label>
            <select className="input-field" value={config.protagonistGender} onChange={(e) => setConfig({ ...config, protagonistGender: e.target.value })}>
              <option value="男">男</option><option value="女">女</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">禁用套路（逗号分隔）</label>
            <input className="input-field" placeholder="例如：退婚流、穿越失忆" value={config.forbiddenTropes} onChange={(e) => setConfig({ ...config, forbiddenTropes: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">必须包含（逗号分隔）</label>
            <input className="input-field" placeholder="例如：双主角、反转结局" value={config.requiredElements} onChange={(e) => setConfig({ ...config, requiredElements: e.target.value })} />
          </div>
        </div>
        {/* 分批生成 & 续集选项 */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-surface-600">
          <div>
            <label className="text-xs text-gray-400 block mb-1">生成模式</label>
            <select className="input-field" value={config.batchMode} onChange={(e) => setConfig({ ...config, batchMode: e.target.value as 'full' | 'batch' })}>
              <option value="full">📚 一次全部生成</option>
              <option value="batch">📝 分批生成</option>
            </select>
          </div>
          {config.batchMode === 'batch' && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">每批章节数</label>
              <select className="input-field" value={config.batchSize} onChange={(e) => setConfig({ ...config, batchSize: parseInt(e.target.value) || 5 })}>
                {[3, 5, 10, 15, 20].map(n => <option key={n} value={n}>{n} 章/批</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={config.hasSequel} onChange={(e) => setConfig({ ...config, hasSequel: e.target.checked })} />
              📖 本作品将有续集
            </label>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleStart} disabled={loading} className="btn-primary">
            {loading ? '⏳ 规划中...' : config.batchMode === 'batch' ? '🚀 开始生成第一批' : '🚀 开始规划'}
          </button>
          {batchInfo?.hasMore && (
            <button onClick={handleNextBatch} disabled={nextBatchLoading} className="btn-secondary">
              {nextBatchLoading ? '⏳ 生成中...' : `📝 生成下一批 (第${batchInfo.endChapter + 1}章起)`}
            </button>
          )}
        </div>
      </div>

      {/* 分批信息 */}
      {batchInfo && (
        <div className="agent-card border-primary-400/30 bg-primary-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">📦</span>
              <div>
                <p className="text-sm font-medium">分批生成 · 第 {batchInfo.batchNumber} 批</p>
                <p className="text-xs text-gray-400">章节范围：第 {batchInfo.startChapter} 章 ~ 第 {batchInfo.endChapter} 章</p>
              </div>
            </div>
            {batchInfo.hasMore ? (
              <span className="text-xs text-primary-400 bg-primary-500/10 px-2 py-1 rounded">还有更多批次</span>
            ) : (
              <span className="text-xs text-accent-green bg-accent-green/10 px-2 py-1 rounded">✅ 全部完成</span>
            )}
          </div>
          {config.hasSequel && (
            <p className="text-xs text-gray-500 mt-2">🔮 续集模式已开启：结局将预留伏笔和悬念</p>
          )}
        </div>
      )}

      {/* 结果展示 */}
      {result && (
        <div className="space-y-4">
          {result.synopsis && (
            <div className="agent-card">
              <h3 className="font-medium mb-2">📖 故事梗概</h3>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{result.synopsis}</p>
            </div>
          )}
          {result.outlines?.length > 0 && (
            <div className="agent-card">
              <h3 className="font-medium mb-2">📋 章节大纲 ({result.outlines.length}章)</h3>
              <div className="max-h-64 overflow-auto space-y-1">
                {result.outlines.map((o: any) => (
                  <div key={o.chapter_number} className="flex gap-3 text-sm py-1 border-b border-surface-600">
                    <span className="text-primary-400 shrink-0">第{o.chapter_number}章</span>
                    <span className="font-medium">{o.title}</span>
                    <span className="text-gray-500 truncate">{o.summary}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.characters?.length > 0 && (
            <div className="agent-card">
              <h3 className="font-medium mb-2">👥 人物设定 ({result.characters.length}人)</h3>
              <div className="grid grid-cols-2 gap-3">
                {result.characters.map((c: any) => (
                  <div key={c.id} className="bg-surface-800 rounded p-3 text-sm">
                    <div className="font-medium">{c.name} <span className="text-xs text-gray-500">({c.role})</span></div>
                    <div className="text-gray-400 mt-1">性格: {c.personality}</div>
                    <div className="text-gray-400">动机: {c.motivation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
