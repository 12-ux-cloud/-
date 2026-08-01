import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Planning from './pages/Planning';
import Writing from './pages/Writing';
import Editing from './pages/Editing';
import Typesetting from './pages/Typesetting';
import Publishing from './pages/Publishing';
import ChiefEditor from './pages/ChiefEditor';
import { useAppStore } from './stores/appStore';
import api from './api';

type Page = 'dashboard' | 'planning' | 'writing' | 'editing' | 'typesetting' | 'publishing' | 'chief';

const NAV_ITEMS: { key: Page; label: string; icon: string }[] = [
  { key: 'dashboard', label: '总览', icon: '📊' },
  { key: 'planning', label: '① 规划', icon: '🗺️' },
  { key: 'writing', label: '② 写作', icon: '✍️' },
  { key: 'editing', label: '③ 编辑', icon: '🔍' },
  { key: 'typesetting', label: '④ 排版', icon: '🎨' },
  { key: 'publishing', label: '⑤ 发布', icon: '🚀' },
  { key: 'chief', label: '⑥ 主编', icon: '👑' },
];

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const notifications = useAppStore((s) => s.notifications);
  const removeNotification = useAppStore((s) => s.removeNotification);

  // 更新检查
  const [updateInfo, setUpdateInfo] = useState<{
    needsUpdate: boolean;
    latestVersion: string;
    currentVersion: string;
    changelog: string;
    downloadUrl: string;
    publishedAt: string;
    error?: string;
  } | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    api.checkUpdate().then((info) => {
      if (info.needsUpdate) {
        setUpdateInfo(info);
        setShowUpdateModal(true);
      }
    }).catch(() => {}); // 静默失败，更新检查不影响使用
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-surface-800 border-b border-surface-500 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📖</span>
          <h1 className="text-lg font-bold text-white">一叶轻舟工作室</h1>
          <span className="text-xs text-gray-500 bg-surface-700 px-2 py-0.5 rounded">v1.0</span>
        </div>
        <div className="flex items-center gap-4">
          <OllamaStatus />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-48 bg-surface-800 border-r border-surface-500 flex flex-col shrink-0">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left
                ${page === item.key
                  ? 'bg-primary-500/10 text-primary-400 border-r-2 border-primary-400'
                  : 'text-gray-400 hover:bg-surface-700 hover:text-white'
                }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-surface-900">
          {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
          {page === 'planning' && <Planning />}
          {page === 'writing' && <Writing />}
          {page === 'editing' && <Editing />}
          {page === 'typesetting' && <Typesetting />}
          {page === 'publishing' && <Publishing />}
          {page === 'chief' && <ChiefEditor />}
        </main>
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 flex flex-col gap-2 max-w-sm z-50">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3 rounded-lg shadow-lg text-sm cursor-pointer transition-all
                ${n.type === 'error' ? 'bg-accent-red/90 text-white' : ''}
                ${n.type === 'success' ? 'bg-accent-green/90 text-white' : ''}
                ${n.type === 'warning' ? 'bg-primary-400/90 text-black' : ''}
                ${n.type === 'info' ? 'bg-surface-600 text-white border border-surface-500' : ''}
              `}
              onClick={() => removeNotification(n.id)}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}

      {/* 更新公告弹窗 */}
      {showUpdateModal && updateInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-800 border border-surface-500 rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            {/* 头部 */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎉</span>
                <div>
                  <h2 className="text-xl font-bold text-white">发现新版本！</h2>
                  <p className="text-blue-100 text-sm">
                    {updateInfo.currentVersion} → <strong>{updateInfo.latestVersion}</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* 更新日志 */}
            <div className="px-6 py-4 max-h-64 overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">📋 更新内容</h3>
              {updateInfo.changelog ? (
                <div
                  className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: updateInfo.changelog.replace(/\n/g, '<br/>') }}
                />
              ) : (
                <p className="text-sm text-gray-500">性能优化和问题修复。</p>
              )}
              {updateInfo.publishedAt && (
                <p className="text-xs text-gray-600 mt-3">
                  发布于：{new Date(updateInfo.publishedAt).toLocaleDateString('zh-CN')}
                </p>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="px-6 py-4 bg-surface-700 flex gap-3 justify-end">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                稍后提醒
              </button>
              {updateInfo.downloadUrl && (
                <a
                  href={updateInfo.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium"
                  onClick={() => setShowUpdateModal(false)}
                >
                  下载更新
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OllamaStatus() {
  const available = useAppStore((s) => s.ollamaAvailable);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-2 h-2 rounded-full ${available ? 'bg-accent-green' : 'bg-accent-red'}`} />
      <span className="text-gray-400">
        Ollama {available ? '已连接' : '未连接'}
      </span>
    </div>
  );
}
