import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';

export default function Typesetting() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setAgentStatus = useAppStore((s) => s.setAgentStatus);
  const addNotification = useAppStore((s) => s.addNotification);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    outputFormat: 'epub' as const,
    fontFamily: '宋体',
    fontSize: 12,
    lineHeight: 1.8,
    titleStyle: 'classic' as const,
    addTOC: true,
    dropCap: true,
  });

  async function handleBuild() {
    if (!currentProjectId) { addNotification('warning', '请先选择项目'); return; }
    setLoading(true);
    setAgentStatus('typesetter', 'running');
    try {
      await api.configTypesetter(config);
      const data = await api.buildBook(currentProjectId);
      setResult(data);
      setAgentStatus('typesetter', 'done');
      addNotification('success', `排版完成: ${data.format?.toUpperCase()}`);
    } catch (err: any) {
      addNotification('error', err.message);
      setAgentStatus('typesetter', 'error');
    }
    setLoading(false);
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">🎨 ④ 排版 — 排版设计</h2>
      <div className="agent-card space-y-3">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">输出格式</label>
            <select className="input-field" value={config.outputFormat} onChange={(e) => setConfig({ ...config, outputFormat: e.target.value as any })}>
              {['epub','pdf','txt','html'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">字体</label>
            <select className="input-field" value={config.fontFamily} onChange={(e) => setConfig({ ...config, fontFamily: e.target.value })}>
              {['宋体','黑体','楷体','微软雅黑','仿宋'].map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">字号</label>
            <input type="number" className="input-field" value={config.fontSize} onChange={(e) => setConfig({ ...config, fontSize: parseInt(e.target.value) || 12 })} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">行距</label>
            <select className="input-field" value={config.lineHeight} onChange={(e) => setConfig({ ...config, lineHeight: parseFloat(e.target.value) })}>
              {[1.5,1.6,1.8,2.0,2.5].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">标题风格</label>
            <select className="input-field" value={config.titleStyle} onChange={(e) => setConfig({ ...config, titleStyle: e.target.value as any })}>
              {['classic','modern','minimal','fantasy'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.addTOC} onChange={(e) => setConfig({ ...config, addTOC: e.target.checked })} /> 生成目录</label>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.dropCap} onChange={(e) => setConfig({ ...config, dropCap: e.target.checked })} /> 首字下沉</label>
          </div>
        </div>
        <button onClick={handleBuild} disabled={loading} className="btn-primary">
          {loading ? '⏳ 排版中...' : '📚 生成书籍'}
        </button>
      </div>
      {result && (
        <div className="agent-card">
          <h3 className="font-medium mb-2">✅ 排版完成</h3>
          <p className="text-sm">格式: {result.format?.toUpperCase()}</p>
          <p className="text-sm text-gray-400 mt-1 truncate">文件: {result.filePath}</p>
        </div>
      )}
    </div>
  );
}
