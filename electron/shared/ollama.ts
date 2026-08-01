/**
 * Ollama 客户端 — 封装对本地 Ollama API 的调用
 *
 * Ollama 默认运行在 http://localhost:11434
 * 支持所有通过 ollama pull 下载的模型
 */

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  top_k?: number;
}

export interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

const OLLAMA_BASE = 'http://localhost:11434';

/**
 * 检查 Ollama 是否可用
 */
export async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 获取已安装的模型列表
 */
export async function listModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

/**
 * 使用指定模型生成文本（非流式）
 */
export async function generate(req: OllamaGenerateRequest): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
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
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data: OllamaGenerateResponse = await response.json();
  return data.response.trim();
}

/**
 * 使用指定模型生成文本（流式，通过回调输出）
 */
export async function generateStream(
  req: OllamaGenerateRequest,
  onToken: (token: string) => void
): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
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
      } catch {}
    }
  }

  return fullText.trim();
}

/**
 * 构建系统提示词 — 为每个 Agent 定义角色
 */
export function buildSystemPrompt(role: string, rules: string): string {
  return `你是${role}。${rules}

请始终保持角色一致，输出高质量的中文内容。
如果发现矛盾或问题，请明确指出。
回复格式：直接输出内容，不要添加多余的解释说明。`;
}
