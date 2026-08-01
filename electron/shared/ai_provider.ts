/**
 * AI 提供者抽象层 — 统一 Ollama / OpenAI 兼容 API / 远程服务器 的调用
 *
 * 替代直接使用 ollama.ts，所有 Agent 和聊天功能通过此模块调用 AI。
 * 根据用户配置自动选择后端，无需改动 Agent 代码。
 */

import * as Ollama from './ollama';
import * as KB from './knowledge_base';

// ===== 类型定义 =====

export interface AIRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
}

export interface AIProviderConfig {
  provider: 'ollama' | 'openai' | 'server';
  ollamaUrl: string;
  openaiUrl: string;
  openaiKey: string;
  openaiModel: string;
  temperature: number;
  maxTokens: number;
}

export interface ModelInfo {
  name: string;
  size?: number;
  modified_at?: string;
}

// ===== 适配器接口 =====

interface AIAdapter {
  generate(req: AIRequest): Promise<string>;
  generateStream(req: AIRequest, onToken: (token: string) => void): Promise<string>;
  checkAvailable(): Promise<boolean>;
  listModels(): Promise<ModelInfo[]>;
}

// ===== 默认配置 =====

const DEFAULT_CONFIG: AIProviderConfig = {
  provider: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  openaiUrl: 'https://api.deepseek.com/v1',
  openaiKey: '',
  openaiModel: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 4096,
};

let cachedConfig: AIProviderConfig | null = null;

/** 获取当前 AI 配置（带缓存，首次从数据库读取） */
export function getAIConfig(): AIProviderConfig {
  if (cachedConfig) return cachedConfig;
  try {
    const dbConfig = KB.getAIProviderConfig();
    cachedConfig = { ...DEFAULT_CONFIG, ...dbConfig };
  } catch {
    cachedConfig = { ...DEFAULT_CONFIG };
  }
  return cachedConfig;
}

/** 刷新配置缓存（保存配置后调用） */
export function refreshAIConfig(): void {
  cachedConfig = null;
}

/** 保存 AI 配置并刷新缓存 */
export function saveAIConfig(cfg: Partial<AIProviderConfig>): void {
  KB.saveAIProviderConfig(cfg);
  cachedConfig = null;
}

// ===== Ollama 适配器 =====

class OllamaAdapter implements AIAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async generate(req: AIRequest): Promise<string> {
    // 临时替换 OLLAMA_BASE，调用原有函数
    // 直接使用 fetch 实现，避免修改 ollama.ts
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        prompt: req.prompt,
        system: req.system || '',
        stream: false,
        options: {
          temperature: req.temperature ?? 0.7,
          num_predict: req.max_tokens ?? 4096,
          top_p: req.top_p ?? 0.9,
          top_k: req.top_k ?? 40,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}${errText ? ' - ' + errText.slice(0, 200) : ''}`);
    }

    const data = await response.json();
    return (data.response || '').trim();
  }

  async generateStream(req: AIRequest, onToken: (token: string) => void): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        prompt: req.prompt,
        system: req.system || '',
        stream: true,
        options: {
          temperature: req.temperature ?? 0.7,
          num_predict: req.max_tokens ?? 4096,
          top_p: req.top_p ?? 0.9,
          top_k: req.top_k ?? 40,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullText += data.response;
            onToken(data.response);
          }
        } catch { /* skip malformed JSON lines */ }
      }
    }

    return fullText.trim();
  }

  async checkAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      const data = await res.json();
      return (data.models || []).map((m: any) => ({
        name: m.name,
        size: m.size,
        modified_at: m.modified_at,
      }));
    } catch {
      return [];
    }
  }
}

// ===== OpenAI 兼容适配器 =====

class OpenAIAdapter implements AIAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // 确保 baseUrl 不以 / 结尾
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  async generate(req: AIRequest): Promise<string> {
    // 如果用户配置了 openaiModel，优先使用；否则使用 Agent 传入的 model
    // 但 Agent 传入的是 Ollama 模型名（如 qwen2.5:7b），不适合 OpenAI API
    const config = getAIConfig();
    const model = config.openaiModel || req.model;

    const messages: { role: string; content: string }[] = [];
    if (req.system) {
      messages.push({ role: 'system', content: req.system });
    }
    messages.push({ role: 'user', content: req.prompt });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.max_tokens ?? 4096,
        top_p: req.top_p ?? 0.9,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}${errText ? ' - ' + errText.slice(0, 300) : ''}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return content.trim();
  }

  async generateStream(req: AIRequest, onToken: (token: string) => void): Promise<string> {
    const config = getAIConfig();
    const model = config.openaiModel || req.model;

    const messages: { role: string; content: string }[] = [];
    if (req.system) {
      messages.push({ role: 'system', content: req.system });
    }
    messages.push({ role: 'user', content: req.prompt });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.max_tokens ?? 4096,
        top_p: req.top_p ?? 0.9,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const data = JSON.parse(jsonStr);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onToken(delta);
          }
        } catch { /* skip malformed */ }
      }
    }

    return fullText.trim();
  }

  async checkAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) return [];
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return (data.data || []).map((m: any) => ({
        name: m.id || m.name || '',
      }));
    } catch {
      return [];
    }
  }
}

// ===== 远程服务器适配器（预留） =====

class ServerAdapter implements AIAdapter {
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  async generate(_req: AIRequest): Promise<string> {
    throw new Error('远程服务器模式即将推出，敬请期待。');
  }

  async generateStream(_req: AIRequest, _onToken: (token: string) => void): Promise<string> {
    throw new Error('远程服务器模式即将推出，敬请期待。');
  }

  async checkAvailable(): Promise<boolean> {
    return false;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
}

// ===== 适配器工厂 =====

function getAdapter(): AIAdapter {
  const config = getAIConfig();
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter(config.openaiUrl, config.openaiKey);
    case 'server':
      return new ServerAdapter(''); // 预留
    case 'ollama':
    default:
      return new OllamaAdapter(config.ollamaUrl);
  }
}

// ===== 公开 API =====

export async function generate(req: AIRequest): Promise<string> {
  const adapter = getAdapter();
  return adapter.generate(req);
}

export async function generateStream(
  req: AIRequest,
  onToken: (token: string) => void
): Promise<string> {
  const adapter = getAdapter();
  return adapter.generateStream(req, onToken);
}

/** 检查当前 AI 提供者是否可用 */
export async function checkProviderAvailable(): Promise<boolean> {
  const adapter = getAdapter();
  return adapter.checkAvailable();
}

/** 获取当前提供者的模型列表 */
export async function listModels(): Promise<ModelInfo[]> {
  const adapter = getAdapter();
  return adapter.listModels();
}

/**
 * 构建系统提示词 — 为每个 Agent 定义角色
 * （此函数与 ollama.ts 中的完全相同，可直接替代）
 */
export function buildSystemPrompt(role: string, rules: string): string {
  return `你是${role}。${rules}

请始终保持角色一致，输出高质量的中文内容。
如果发现矛盾或问题，请明确指出。
回复格式：直接输出内容，不要添加多余的解释说明。`;
}

/** 兼容旧代码：等同于 checkProviderAvailable */
export const checkOllamaAvailable = checkProviderAvailable;
