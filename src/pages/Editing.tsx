import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';

export default function Editing() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const addNotification = useAppStore((s) => s.addNotification);

  const [chapterNum, setChapterNum] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    strictness: 7,
    preserveStyle: 8,
    checkConsistency: true,
    autoFixMinor: true,
    sensitiveWords: '',
  });

  async function handleEdit() {
    if (!currentProjectId) { addNotification('warning', '请先选择项目'); return; }
    setLoading(true);
    setAgentStatus('editor', 'running');
    try {
      await api.configEditor({
        strictness: config.strictness,
        preserveStyle: config.preserveStyle,
        checkConsistency: config.checkConsistency,
        autoFixMinor: config.autoFixMinor,
        sensitiveWords: config.sensitiveWords.split(',').filter(Boolean),
      });
      const data = await api.startEditing(currentProjectId, chapterNum);
      setResult(data);
      setAgentStatus('editor', 'done');
      addNotification('success', `第${chapterNum}章校对完成 (${data.score}分)`);
    } catch (err: any) {
      addNotification('error', err.message);
      setAgentStatus('editor', 'error');
    }
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">🔍 ③ 编辑 — 编辑与校对</h2>

      <div className="agent-card space-y-3">
        <div className="grid grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">章节号</label>
            <input type="number" className="input-field" value={chapterNum} onChange={(e) => setChapterNum(parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">严格度 (1-10)</label>
            <input type="range" min={1} max={10} value={config.strictness} onChange={(e) => setConfig({ ...config, strictness: parseInt(e.target.value) })} className="w-full" />
            <span className="text-xs text-gray-500">{config.strictness}</span>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">保留风格 (1-10)</label>
            <input type="range" min={1} max={10} value={config.preserveStyle} onChange={(e) => setConfig({ ...config, preserveStyle: parseInt(e.target.value) })} className="w-full" />
            <span className="text-xs text-gray-500">{config.preserveStyle}</span>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={config.checkConsistency} onChange={(e) => setConfig({ ...config, checkConsistency: e.target.checked })} />
              一致性检查
            </label>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={config.autoFixMinor} onChange={(e) => setConfig({ ...config, autoFixMinor: e.target.checked })} />
              自动修小问题
            </label>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">敏感词（逗号分隔）</label>
          <input className="input-field" placeholder="需要避开的词汇" value={config.sensitiveWords} onChange={(e) => setConfig({ ...config, sensitiveWords: e.target.value })} />
        </div>
        <button onClick={handleEdit} disabled={loading} className="btn-primary">
          {loading ? '⏳ 校对中...' : `🔍 校对第 ${chapterNum} 章`}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="agent-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">📊 校对报告</h3>
              <span className={`text-lg font-bold ${result.score >= 80 ? 'text-accent-green' : result.score >= 60 ? 'text-primary-400' : 'text-accent-red'}`}>
                {result.score}/100
              </span>
            </div>
            <div className="text-sm text-gray-300 whitespace-pre-wrap bg-surface-800 rounded p-3 max-h-64 overflow-auto">
              {result.report}
            </div>
          </div>
          {result.fixedContent && result.fixedContent !== result.originalContent && (
            <div className="agent-card">
              <h3 className="font-medium mb-2">✅ 修正后内容</h3>
              <div className="bg-surface-800 rounded p-4 max-h-64 overflow-auto text-sm whitespace-pre-wrap">
                {result.fixedContent}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
