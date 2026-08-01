import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';

export default function ChiefEditor() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const addNotification = useAppStore((s) => s.addNotification);

  const [outlineResult, setOutlineResult] = useState<any>(null);
  const [chapterReviewNum, setChapterReviewNum] = useState(1);
  const [chapterResult, setChapterResult] = useState<any>(null);
  const [finalResult, setFinalResult] = useState<any>(null);
  const [loading, setLoading] = useState('');
  const [config, setConfig] = useState({
    reviewThreshold: 70,
    autoApproveAbove: 85,
    maxRevisions: 3,
    consistencyCheckEnabled: true,
  });

  async function handleReviewOutline() {
    if (!currentProjectId) { addNotification('warning', '请先选择项目'); return; }
    setLoading('outline');
    setAgentStatus('chief_editor', 'running');
    try {
      await api.configChief(config);
      const data = await api.reviewOutline(currentProjectId);
      setOutlineResult(data);
      setAgentStatus('chief_editor', 'done');
      addNotification(data.approved ? 'success' : 'warning', data.approved ? '大纲审核通过' : '大纲需要修改');
    } catch (err: any) {
      addNotification('error', err.message);
    }
    setLoading('');
  }

  async function handleReviewChapter() {
    if (!currentProjectId) { addNotification('warning', '请先选择项目'); return; }
    setLoading('chapter');
    setAgentStatus('chief_editor', 'running');
    try {
      await api.configChief(config);
      const data = await api.reviewChapter(currentProjectId, chapterReviewNum);
      setChapterResult(data);
      setAgentStatus('chief_editor', 'done');
      addNotification(data.approved ? 'success' : 'warning', `第${chapterReviewNum}章: ${data.approved ? '通过' : '驳回'}`);
    } catch (err: any) {
      addNotification('error', err.message);
    }
    setLoading('');
  }

  async function handleFinalReview() {
    if (!currentProjectId) { addNotification('warning', '请先选择项目'); return; }
    setLoading('final');
    setAgentStatus('chief_editor', 'running');
    try {
      await api.configChief(config);
      const data = await api.finalReview(currentProjectId);
      setFinalResult(data);
      setAgentStatus('chief_editor', 'done');
      addNotification(data.approved ? 'success' : 'warning', data.approved ? '✅ 全书审核通过，允许发布！' : '尚有章节未通过');
    } catch (err: any) {
      addNotification('error', err.message);
    }
    setLoading('');
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold">👑 ⑥ 主编控制台</h2>
        <span className="text-xs text-gray-500 bg-surface-700 px-2 py-0.5 rounded">全局管控中心</span>
      </div>

      {/* 配置 */}
      <div className="agent-card space-y-3" style={{ borderLeftColor: '#f44336', borderLeftWidth: 3 }}>
        <h3 className="font-medium">⚙️ 审核配置</h3>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">质量门槛 (最低分)</label>
            <input type="number" className="input-field" value={config.reviewThreshold} onChange={(e) => setConfig({ ...config, reviewThreshold: parseInt(e.target.value) || 70 })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">自动通过分</label>
            <input type="number" className="input-field" value={config.autoApproveAbove} onChange={(e) => setConfig({ ...config, autoApproveAbove: parseInt(e.target.value) || 85 })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">最大驳回次数</label>
            <input type="number" className="input-field" value={config.maxRevisions} onChange={(e) => setConfig({ ...config, maxRevisions: parseInt(e.target.value) || 3 })} />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={config.consistencyCheckEnabled} onChange={(e) => setConfig({ ...config, consistencyCheckEnabled: e.target.checked })} />
              全书一致性检查
            </label>
          </div>
        </div>
      </div>

      {/* 审核操作 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="agent-card text-center space-y-3" style={{ borderLeftColor: '#ffc107', borderLeftWidth: 3 }}>
          <h3 className="font-medium">📋 审核大纲</h3>
          <p className="text-xs text-gray-500">规划师完成后，主编审核大纲</p>
          <button onClick={handleReviewOutline} disabled={loading === 'outline'} className="btn-primary w-full text-sm">
            {loading === 'outline' ? '⏳ 审核中' : '开始审核大纲'}
          </button>
          {outlineResult && (
            <div className={`text-sm p-2 rounded ${outlineResult.approved ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
              {outlineResult.approved ? '✅ 通过' : '❌ 驳回'} ({outlineResult.score}分)
            </div>
          )}
        </div>

        <div className="agent-card text-center space-y-3" style={{ borderLeftColor: '#4caf50', borderLeftWidth: 3 }}>
          <h3 className="font-medium">📄 审核章节</h3>
          <div className="flex gap-2 justify-center">
            <input type="number" className="input-field w-20 text-center" value={chapterReviewNum} onChange={(e) => setChapterReviewNum(parseInt(e.target.value) || 1)} />
          </div>
          <button onClick={handleReviewChapter} disabled={loading === 'chapter'} className="btn-primary w-full text-sm">
            {loading === 'chapter' ? '⏳ 审核中' : `审核第${chapterReviewNum}章`}
          </button>
          {chapterResult && (
            <div className={`text-sm p-2 rounded ${chapterResult.approved ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
              {chapterResult.approved ? '✅ 通过' : '❌ 驳回'} ({chapterResult.score}分)
            </div>
          )}
        </div>

        <div className="agent-card text-center space-y-3" style={{ borderLeftColor: '#2196f3', borderLeftWidth: 3 }}>
          <h3 className="font-medium">🏁 最终审核</h3>
          <p className="text-xs text-gray-500">全书完成后，发布前的最终审核</p>
          <button onClick={handleFinalReview} disabled={loading === 'final'} className="btn-primary w-full text-sm">
            {loading === 'final' ? '⏳ 审核中' : '全书终审'}
          </button>
          {finalResult && (
            <div className={`text-sm p-2 rounded ${finalResult.approved ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-red/10 text-accent-red'}`}>
              {finalResult.approved ? '✅ 允许发布' : '❌ ' + finalResult.feedback}
            </div>
          )}
        </div>
      </div>

      {/* 审核详情 */}
      {(outlineResult || chapterResult) && (
        <div className="agent-card">
          <h3 className="font-medium mb-2">📝 审核意见</h3>
          <div className="text-sm text-gray-300 whitespace-pre-wrap bg-surface-800 rounded p-3 max-h-48 overflow-auto">
            {outlineResult?.feedback || chapterResult?.feedback || '暂无'}
          </div>
        </div>
      )}
    </div>
  );
}
