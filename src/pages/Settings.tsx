import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';

type ProviderMode = 'ollama' | 'openai' | 'server';

interface AIConfig {
  provider: ProviderMode;
  ollamaUrl: string;
  openaiUrl: string;
  openaiKey: string;
  openaiModel: string;
  temperature: number;
  maxTokens: number;
}

export default function Settings() {
  const [config, setConfig] = useState<AIConfig>({
    provider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    openaiUrl: 'https://api.deepseek.com/v1',
    openaiKey: '',
    openaiModel: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 4096,
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [ollamaTutorialOpen, setOllamaTutorialOpen] = useState(false);
  const [apiTutorialOpen, setApiTutorialOpen] = useState(false);
  const addNotification = useAppStore((s) => s.addNotification);
  const setAIProvider = useAppStore((s) => s.setAIProvider);
  const setOllamaAvailable = useAppStore((s) => s.setOllamaAvailable);

  // 加载已保存的配置
  useEffect(() => {
    api.getAIConfig().then((cfg) => {
      setConfig({
        provider: (cfg.provider as ProviderMode) || 'ollama',
        ollamaUrl: cfg.ollamaUrl || 'http://localhost:11434',
        openaiUrl: cfg.openaiUrl || 'https://api.deepseek.com/v1',
        openaiKey: cfg.openaiKey || '',
        openaiModel: cfg.openaiModel || 'deepseek-chat',
        temperature: cfg.temperature ?? 0.7,
        maxTokens: cfg.maxTokens || 4096,
      });
      setAIProvider(cfg.provider || 'ollama');
    }).catch(() => {});
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const status = await api.checkAIStatus();
      setOllamaAvailable(status.available);
    } catch { /* ignore */ }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveAIConfig(config);
      setAIProvider(config.provider);
      await checkStatus();
      addNotification('success', '设置已保存');
    } catch (err: any) {
      addNotification('error', `保存失败: ${err.message}`);
    }
    setSaving(false);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const status = await api.checkAIStatus();
      if (status.available) {
        const providerLabel = config.provider === 'ollama' ? 'Ollama' : '云端 API';
        setTestResult({ ok: true, message: `✅ ${providerLabel} 连接正常！${status.modelName ? ` 模型: ${status.modelName}` : ''}` });
        setOllamaAvailable(true);
      } else {
        setTestResult({ ok: false, message: '❌ 连接失败，请检查配置是否正确。' });
        setOllamaAvailable(false);
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: `❌ 连接失败: ${err.message}` });
      setOllamaAvailable(false);
    }
    setTesting(false);
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-2xl">⚙️</span>
        <h2 className="text-xl font-bold">设置</h2>
      </div>

      {/* ===== AI 服务提供方式 ===== */}
      <div className="agent-card space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          🤖 AI 服务
        </h3>
        <p className="text-sm text-gray-400">
          选择 AI 服务的提供方式。切换后点击「保存设置」生效。
        </p>

        {/* 模式选择 */}
        <div className="grid grid-cols-3 gap-3">
          <ProviderCard
            icon="🏠"
            title="本地 Ollama"
            desc="在自己的电脑上运行 AI，隐私安全，需要安装 Ollama 并下载模型"
            selected={config.provider === 'ollama'}
            onClick={() => setConfig({ ...config, provider: 'ollama' })}
          />
          <ProviderCard
            icon="☁️"
            title="云端 API"
            desc="使用 DeepSeek、通义千问等在线服务，无需安装，注册即可使用"
            selected={config.provider === 'openai'}
            onClick={() => setConfig({ ...config, provider: 'openai' })}
          />
          <ProviderCard
            icon="🔒"
            title="内置云服务"
            desc="即将推出 — 开箱即用，无需任何配置"
            selected={config.provider === 'server'}
            onClick={() => {}} // 预留，暂不可选
            disabled
          />
        </div>

        {/* Ollama 配置 */}
        {config.provider === 'ollama' && (
          <div className="space-y-4 pt-2 border-t border-surface-500">
            <h4 className="font-medium text-sm text-gray-300">🏠 本地 Ollama 设置</h4>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Ollama 服务地址</label>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  placeholder="http://localhost:11434"
                  value={config.ollamaUrl}
                  onChange={(e) => setConfig({ ...config, ollamaUrl: e.target.value })}
                />
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="btn-secondary text-sm shrink-0"
                >
                  {testing ? '⏳ 测试中...' : '🔍 测试连接'}
                </button>
              </div>
            </div>

            {testResult && (
              <div className={`text-sm px-3 py-2 rounded-lg ${testResult.ok ? 'bg-accent-green/10 text-accent-green border border-accent-green/30' : 'bg-accent-red/10 text-accent-red border border-accent-red/30'}`}>
                {testResult.message}
              </div>
            )}

            {/* Ollama 教程 */}
            <div>
              <button
                onClick={() => setOllamaTutorialOpen(!ollamaTutorialOpen)}
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                📘 {ollamaTutorialOpen ? '收起教程' : '如何安装 Ollama？'}
                <span className="text-xs">{ollamaTutorialOpen ? '▲' : '▼'}</span>
              </button>
              {ollamaTutorialOpen && (
                <div className="mt-3 bg-surface-800 rounded-xl p-4 space-y-3 text-sm text-gray-300 border border-surface-500">
                  <div className="space-y-2">
                    <h5 className="font-medium text-white">📥 步骤 1：下载安装 Ollama</h5>
                    <p>访问 <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-primary-400 underline">ollama.com/download</a>，选择你的操作系统（Windows / macOS / Linux），下载并安装。</p>
                    <p className="text-xs text-gray-500">安装包约 500MB，安装过程自动完成。</p>
                  </div>

                  <div className="border-t border-surface-600"></div>

                  <div className="space-y-2">
                    <h5 className="font-medium text-white">📦 步骤 2：下载 AI 模型</h5>
                    <p>安装完成后，打开终端（命令提示符或 PowerShell），运行以下命令下载推荐模型：</p>
                    <div className="bg-surface-900 rounded-lg p-3 font-mono text-xs space-y-1">
                      <div className="text-gray-400"># 通用写作模型（推荐，约 4.5GB）</div>
                      <div className="text-accent-green">ollama pull qwen2.5:7b</div>
                      <div className="text-gray-400 mt-2"># 推理/审核模型（约 4.7GB）</div>
                      <div className="text-accent-green">ollama pull deepseek-r1:7b</div>
                    </div>
                    <p className="text-xs text-gray-500">
                      💡 下载速度取决于网络，7B 模型约 4-5GB，请耐心等待。<br />
                      💡 这两个模型是本程序各个 AI 助手的默认模型，建议都下载。
                    </p>
                  </div>

                  <div className="border-t border-surface-600"></div>

                  <div className="space-y-2">
                    <h5 className="font-medium text-white">🚀 步骤 3：启动 Ollama 服务</h5>
                    <p>Windows/Mac 安装后 Ollama 会自动在后台运行。你也可以在终端手动启动：</p>
                    <div className="bg-surface-900 rounded-lg p-3 font-mono text-xs text-accent-green">ollama serve</div>
                    <p className="text-xs text-gray-500">默认地址为 http://localhost:11434，如果修改了端口，请在上方地址栏中更新。</p>
                  </div>

                  <div className="border-t border-surface-600"></div>

                  <div className="space-y-2">
                    <h5 className="font-medium text-white">✅ 步骤 4：测试连接</h5>
                    <p>回到此页面，点击上方的「🔍 测试连接」按钮。如果显示连接正常，说明一切就绪！</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 云端 API 配置 */}
        {config.provider === 'openai' && (
          <div className="space-y-4 pt-2 border-t border-surface-500">
            <h4 className="font-medium text-sm text-gray-300">☁️ 云端 API 设置</h4>

            <div>
              <label className="text-xs text-gray-400 block mb-1">API 接口地址</label>
              <input
                className="input-field w-full"
                placeholder="https://api.deepseek.com/v1"
                value={config.openaiUrl}
                onChange={(e) => setConfig({ ...config, openaiUrl: e.target.value })}
              />
              <p className="text-xs text-gray-600 mt-1">
                需包含 /v1 后缀。DeepSeek: https://api.deepseek.com/v1 · 通义千问: https://dashscope.aliyuncs.com/compatible-mode/v1
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">API Key</label>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={config.openaiKey}
                  onChange={(e) => setConfig({ ...config, openaiKey: e.target.value })}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="btn-secondary text-sm shrink-0"
                  title={showKey ? '隐藏' : '显示'}
                >
                  {showKey ? '🙈' : '👁️'}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                🔒 API Key 保存在本地数据库，不会上传到任何第三方服务器。
              </p>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">模型名称</label>
              <input
                className="input-field w-full"
                placeholder="deepseek-chat"
                value={config.openaiModel}
                onChange={(e) => setConfig({ ...config, openaiModel: e.target.value })}
              />
              <p className="text-xs text-gray-600 mt-1">
                DeepSeek: deepseek-chat · 通义千问: qwen-plus · Moonshot: moonshot-v1-8k · OpenAI: gpt-4o
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="btn-secondary text-sm"
              >
                {testing ? '⏳ 测试中...' : '🔍 测试连接'}
              </button>
            </div>

            {testResult && (
              <div className={`text-sm px-3 py-2 rounded-lg ${testResult.ok ? 'bg-accent-green/10 text-accent-green border border-accent-green/30' : 'bg-accent-red/10 text-accent-red border border-accent-red/30'}`}>
                {testResult.message}
              </div>
            )}

            {/* API 教程 */}
            <div>
              <button
                onClick={() => setApiTutorialOpen(!apiTutorialOpen)}
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                📘 {apiTutorialOpen ? '收起教程' : '如何获取 API Key？'}
                <span className="text-xs">{apiTutorialOpen ? '▲' : '▼'}</span>
              </button>
              {apiTutorialOpen && (
                <div className="mt-3 bg-surface-800 rounded-xl p-4 space-y-3 text-sm text-gray-300 border border-surface-500">
                  {/* DeepSeek */}
                  <div className="space-y-2">
                    <h5 className="font-medium text-white">🥇 方案 A：DeepSeek（推荐，中文写作能力优秀）</h5>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400">
                      <li>访问 <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer" className="text-primary-400 underline">platform.deepseek.com</a> 注册账号</li>
                      <li>登录后进入「API Keys」页面</li>
                      <li>点击「创建 API Key」，复制生成的 Key</li>
                      <li>将 Key 粘贴到上方的输入框中</li>
                      <li>模型名填：<code className="bg-surface-900 px-1.5 py-0.5 rounded text-accent-green">deepseek-chat</code></li>
                    </ol>
                    <p className="text-xs text-gray-500">
                      💰 注册即送 500 万 token 免费额度（约等于 250 万字小说的写作量）<br />
                      💰 付费价格：¥1 / 百万 token（约 50 万字）
                    </p>
                  </div>

                  <div className="border-t border-surface-600"></div>

                  {/* 通义千问 */}
                  <div className="space-y-2">
                    <h5 className="font-medium text-white">🥈 方案 B：通义千问（阿里云）</h5>
                    <ol className="list-decimal list-inside space-y-1 text-gray-400">
                      <li>访问 <a href="https://dashscope.console.aliyun.com" target="_blank" rel="noreferrer" className="text-primary-400 underline">dashscope.console.aliyun.com</a> 注册阿里云账号</li>
                      <li>进入「模型服务」→「API Key 管理」</li>
                      <li>创建 API Key 并复制</li>
                      <li>API 地址填：<code className="bg-surface-900 px-1.5 py-0.5 rounded text-accent-green">https://dashscope.aliyuncs.com/compatible-mode/v1</code></li>
                      <li>模型名填：<code className="bg-surface-900 px-1.5 py-0.5 rounded text-accent-green">qwen-plus</code> 或 <code className="bg-surface-900 px-1.5 py-0.5 rounded text-accent-green">qwen-max</code></li>
                    </ol>
                    <p className="text-xs text-gray-500">
                      💰 新用户有免费额度 · 付费价格：¥0.5-4 / 百万 token
                    </p>
                  </div>

                  <div className="border-t border-surface-600"></div>

                  {/* 其他 */}
                  <div className="space-y-2">
                    <h5 className="font-medium text-white">🥉 方案 C：其他兼容服务</h5>
                    <p className="text-gray-400">以下服务也兼容 OpenAI API 格式，填入对应地址和 Key 即可：</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between text-gray-400">
                        <span>🌙 Moonshot（月之暗面）</span>
                        <span className="text-gray-500">platform.moonshot.cn</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>🧠 智谱 GLM</span>
                        <span className="text-gray-500">open.bigmodel.cn</span>
                      </div>
                      <div className="flex justify-between text-gray-400">
                        <span>🤖 OpenAI</span>
                        <span className="text-gray-500">platform.openai.com</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-surface-600"></div>

                  <div className="text-xs text-gray-500">
                    💡 <strong>注意：</strong>在云端 API 模式下，所有 AI 助手共用同一个模型。每个助手使用不同模型的特性仅在本地 Ollama 模式下可用。
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 内置云服务占位 */}
        {config.provider === 'server' && (
          <div className="space-y-4 pt-2 border-t border-surface-500">
            <div className="bg-surface-800 rounded-xl p-6 text-center border border-surface-500">
              <span className="text-4xl">🔒</span>
              <h4 className="font-medium text-gray-300 mt-2">内置云服务 — 即将推出</h4>
              <p className="text-sm text-gray-500 mt-1">
                此模式下程序将连接我们提供的云端 AI 服务，用户无需任何配置即可使用。<br />
                敬请期待后续版本更新。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ===== 通用设置 ===== */}
      <div className="agent-card space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          🎛️ 通用参数
        </h3>
        <p className="text-sm text-gray-400">
          这些参数影响 AI 生成内容的质量和风格。
        </p>

        {/* 温度 */}
        <div>
          <label className="text-xs text-gray-400 block mb-1">
            默认温度（Temperature）: <span className="text-white font-medium">{config.temperature.toFixed(1)}</span>
          </label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-8 text-right">精确</span>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="flex-1 accent-primary-400"
            />
            <span className="text-xs text-gray-600 w-8">创意</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            较低温度（0.1-0.5）：输出更稳定、一致 · 较高温度（0.8-2.0）：更有创造性、变化多
          </p>
        </div>

        {/* 最大 Token */}
        <div>
          <label className="text-xs text-gray-400 block mb-1">
            默认最大 Token: <span className="text-white font-medium">{config.maxTokens}</span>
          </label>
          <input
            type="number"
            min={256}
            max={32768}
            step={256}
            value={config.maxTokens}
            onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) || 4096 })}
            className="input-field w-40"
          />
          <p className="text-xs text-gray-600 mt-1">
            Token 约等于 1-2 个中文字。单次 AI 回复的最大长度。4096 约可生成 2000-4000 字。
          </p>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-8 py-2.5 text-base"
        >
          {saving ? '⏳ 保存中...' : '💾 保存设置'}
        </button>
      </div>
    </div>
  );
}

/** 提供者选择卡片 */
function ProviderCard({
  icon,
  title,
  desc,
  selected,
  onClick,
  disabled,
}: {
  icon: string;
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left p-4 rounded-xl border-2 transition-all ${
        selected
          ? 'border-primary-400 bg-primary-400/5'
          : disabled
          ? 'border-surface-500 bg-surface-800/50 opacity-50 cursor-not-allowed'
          : 'border-surface-500 hover:border-surface-400 hover:bg-surface-700'
      }`}
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-medium text-sm text-white">
        {title}
        {disabled && <span className="ml-1 text-xs text-gray-500">即将推出</span>}
      </div>
      <div className="text-xs text-gray-500 mt-1 leading-relaxed">{desc}</div>
    </button>
  );
}
