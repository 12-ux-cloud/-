import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';

export default function Publishing() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const addNotification = useAppStore((s) => s.addNotification);
  const [chapterNum, setChapterNum] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    site: 'qidian',
    username: '',
    password: '',
    scheduleInterval: 24,
    autoReplyComments: false,
  });

  async function handlePublish() {
    if (!currentProjectId) { addNotification('warning', '请先选择项目'); return; }
    setLoading(true);
    setAgentStatus('publisher', 'running');
    try {
      await api.configPublisher(config);
      const data = await api.publishChapter(currentProjectId, chapterNum, true);
      setResult(data);
      setAgentStatus('publisher', 'done');
      addNotification(data.success ? 'success' : 'error', data.success ? '发布成功！' : data.error);
    } catch (err: any) {
      addNotification('error', err.message);
      setAgentStatus('publisher', 'error');
    }
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">🚀 ⑤ 发布 — 自动发布</h2>
      <div className="agent-card space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">目标网站</label>
            <select className="input-field" value={config.site} onChange={(e) => setConfig({ ...config, site: e.target.value })}>
              <option value="qidian">起点中文网</option>
              <option value="fanqie">番茄小说</option>
              <option value="jinjiang">晋江文学城</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">章节号</label>
            <input type="number" className="input-field" value={chapterNum} onChange={(e) => setChapterNum(parseInt(e.target.value) || 1)} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">发布间隔（小时）</label>
            <input type="number" className="input-field" value={config.scheduleInterval} onChange={(e) => setConfig({ ...config, scheduleInterval: parseInt(e.target.value) || 24 })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">用户名</label>
            <input className="input-field" placeholder="作者后台用户名" value={config.username} onChange={(e) => setConfig({ ...config, username: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">密码</label>
            <input type="password" className="input-field" placeholder="作者后台密码" value={config.password} onChange={(e) => setConfig({ ...config, password: e.target.value })} />
          </div>
        </div>
        <button onClick={handlePublish} disabled={loading} className="btn-primary">
          {loading ? '⏳ 发布中...' : '🚀 发布章节'}
        </button>
        <p className="text-xs text-gray-500">
          ⚠️ 发布前请确保章节已通过主编审核。密码仅存储在本地。
        </p>
      </div>
      {result && (
        <div className={`agent-card ${result.success ? 'border-accent-green/30' : 'border-accent-red/30'}`}>
          <h3 className="font-medium mb-1">{result.success ? '✅ 发布成功' : '❌ 发布失败'}</h3>
          {result.url && <p className="text-sm text-accent-blue truncate">{result.url}</p>}
          {result.error && <p className="text-sm text-accent-red">{result.error}</p>}
        </div>
      )}
    </div>
  );
}
