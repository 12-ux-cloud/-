import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';

export default function Writing() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const addNotification = useAppStore((s) => s.addNotification);

  const [chapterNum, setChapterNum] = useState(1);
  const [chapter, setChapter] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    style: '自然流畅',
    dialogueRatio: 40,
    wordsPerChapter: 3000,
    pov: '第三人称',
    forbiddenWords: '',
  });

  async function handleWrite() {
    if (!currentProjectId) { addNotification('warning', '请先选择项目'); return; }
    setLoading(true);
    setAgentStatus('writer', 'running');
    try {
      await api.configWriter({
        style: config.style,
        dialogueRatio: config.dialogueRatio,
        wordsPerChapter: config.wordsPerChapter,
        pov: config.pov,
        forbiddenWords: config.forbiddenWords.split(',').filter(Boolean),
      });
      const result = await api.startWriting(currentProjectId, chapterNum);
      setChapter(result);
      setAgentStatus('writer', 'done');
      addNotification('success', `第${chapterNum}章写作完成`);
    } catch (err: any) {
      addNotification('error', err.message);
      setAgentStatus('writer', 'error');
    }
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">✍️ ② 作家 — 写作初稿</h2>

      <div className="agent-card space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">章节号</label>
            <input type="number" className="input-field" value={chapterNum} onChange={(e) => setChapterNum(parseInt(e.target.value) || 1)} min={1} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">文风</label>
            <select className="input-field" value={config.style} onChange={(e) => setConfig({ ...config, style: e.target.value })}>
              {['自然流畅', '白描简洁', '华丽铺陈', '幽默轻松', '严肃厚重'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">对话比例 (%)</label>
            <input type="number" className="input-field" value={config.dialogueRatio} onChange={(e) => setConfig({ ...config, dialogueRatio: parseInt(e.target.value) || 40 })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">每章字数</label>
            <input type="number" className="input-field" value={config.wordsPerChapter} onChange={(e) => setConfig({ ...config, wordsPerChapter: parseInt(e.target.value) || 3000 })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">叙事视角</label>
            <select className="input-field" value={config.pov} onChange={(e) => setConfig({ ...config, pov: e.target.value })}>
              {['第一人称', '第三人称', '多视角', '上帝视角'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">禁用词汇（逗号分隔）</label>
            <input className="input-field" placeholder="例如：突然、忽然、非常" value={config.forbiddenWords} onChange={(e) => setConfig({ ...config, forbiddenWords: e.target.value })} />
          </div>
        </div>
        <button onClick={handleWrite} disabled={loading} className="btn-primary">
          {loading ? '⏳ 写作中...' : `✍️ 写第 ${chapterNum} 章`}
        </button>
      </div>

      {chapter && (
        <div className="agent-card">
          <h3 className="font-medium mb-2">📄 第{chapter.chapter_number}章 {chapter.title}</h3>
          <div className="text-xs text-gray-500 mb-3">字数: {chapter.word_count} | 状态: {chapter.status}</div>
          <div className="bg-surface-800 rounded p-4 max-h-96 overflow-auto">
            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{chapter.content}</div>
          </div>
        </div>
      )}
    </div>
  );
}
