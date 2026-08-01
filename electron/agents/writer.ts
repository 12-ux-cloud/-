/**
 * ② 作家 Agent — 写作初稿
 * 模型: Qwen2.5 (中文长篇写作最优)
 * 产出: 逐章正文，保持人物一致性和伏笔
 */

import { generate, generateStream } from '../shared/ollama';
import { messageBus } from '../shared/message_bus';
import * as KB from '../shared/knowledge_base';

export interface WriterConfig {
  model: string;           // 默认 qwen2.5:14b
  style: string;           // 文风: 白描/华丽/幽默/严肃
  dialogueRatio: number;   // 对话比例 0-100
  wordsPerChapter: number; // 每章字数
  pov: string;             // 视角: 第一人称/第三人称/多视角
  forbiddenWords: string[];
}

const DEFAULT_CONFIG: WriterConfig = {
  model: 'qwen2.5:7b',
  style: '自然流畅',
  dialogueRatio: 40,
  wordsPerChapter: 3000,
  pov: '第三人称',
  forbiddenWords: [],
};

let config: WriterConfig = { ...DEFAULT_CONFIG };

export function setWriterConfig(cfg: Partial<WriterConfig>): void {
  config = { ...config, ...cfg };
}

export function getWriterConfig(): WriterConfig {
  return { ...config };
}

/**
 * 作家主入口 — 写一章
 */
export async function writeChapter(
  projectId: number,
  chapterNumber: number,
  onProgress?: (text: string) => void
): Promise<KB.ChapterContent | null> {
  console.log(`[Writer] 开始写第 ${chapterNumber} 章...`);

  // 读取上下文
  const outlines = KB.getOutlines(projectId);
  const outline = outlines.find(o => o.chapter_number === chapterNumber);
  const characters = KB.getCharacters(projectId);
  const worldSettings = KB.getWorldSettings(projectId);
  const prevChapter = chapterNumber > 1 ? (KB.getChapter(projectId, chapterNumber - 1) ?? null) : null;
  const unresolvedMessages = KB.getUnresolvedMessages(projectId).filter(m => m.to_agent === 'writer');

  if (!outline) {
    console.error(`[Writer] 第 ${chapterNumber} 章没有大纲`);
    return null;
  }

  // 构建写作上下文
  const contextStr = buildWritingContext(outline, characters, worldSettings, prevChapter, unresolvedMessages);

  // 生成章节
  const content = await generateChapter(contextStr, onProgress);
  const wordCount = content.length;

  // 保存章节
  const chapter = KB.saveChapter({
    project_id: projectId,
    chapter_number: chapterNumber,
    title: outline.title,
    content,
    word_count: wordCount,
    version: 1,
    status: 'draft',
  });

  // 更新大纲状态
  KB.updateOutlineStatus(outline.id, 'written');

  // 更新人物状态（如果章节中有变化）
  await updateCharacterStates(projectId, content, characters);

  // 通知编辑
  await messageBus.send({
    from: 'writer',
    to: 'editor',
    type: 'status',
    title: `第 ${chapterNumber} 章完成`,
    content: `字数: ${wordCount}，等待校对`,
    projectId,
    priority: 'normal',
  });

  console.log(`[Writer] 第 ${chapterNumber} 章完成 (${wordCount}字)`);
  return chapter;
}

/**
 * 根据编辑反馈修改章节
 */
export async function reviseChapter(
  projectId: number,
  chapterNumber: number,
  feedback: string
): Promise<KB.ChapterContent | null> {
  const chapter = KB.getChapter(projectId, chapterNumber);
  if (!chapter) return null;

  const systemPrompt = buildWriterSystemPrompt();
  const prompt = `请修改以下章节内容，根据编辑的反馈进行修正：

原始内容:
${chapter.content}

编辑反馈:
${feedback}

请输出修改后的完整章节内容。`;

  const newContent = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.7,
    max_tokens: 8192,
  });

  KB.updateChapterContent(chapter.id, newContent, newContent.length);
  KB.updateChapterStatus(chapter.id, 'draft');

  await messageBus.send({
    from: 'writer',
    to: 'editor',
    type: 'status',
    title: `第 ${chapterNumber} 章已修改`,
    content: '已根据反馈修改，请重新审核',
    projectId,
    priority: 'normal',
  });

  return { ...chapter, content: newContent, word_count: newContent.length };
}

// ===== 辅助函数 =====

function buildWritingContext(
  outline: KB.ChapterOutline,
  characters: KB.CharacterCard[],
  worldSettings: KB.WorldSetting[],
  prevChapter: KB.ChapterContent | null,
  messages: KB.AgentMessage[]
): string {
  let ctx = `## 本章大纲
第${outline.chapter_number}章 ${outline.title}
提要: ${outline.summary}
关键事件: ${outline.key_events}
聚焦人物: ${outline.character_focus}

## 人物设定
${characters.map(c => `- ${c.name}(${c.role}): ${c.personality}. ${c.background}`).join('\n')}

## 世界观
${worldSettings.map(w => `- ${w.category}: ${w.content}`).join('\n')}
`;

  if (prevChapter) {
    ctx += `
## 上一章结尾
${prevChapter.content.slice(-500)}`;
  }

  if (messages.length > 0) {
    ctx += `
## 待处理反馈
${messages.map(m => `- [${m.from_agent}] ${m.title}: ${m.content}`).join('\n')}`;
  }

  return ctx;
}

function buildWriterSystemPrompt(): string {
  return `你是一位专业的小说作家，擅长用中文创作引人入胜的故事。

写作要求：
- 文风: ${config.style}
- 对话占比约: ${config.dialogueRatio}%
- 每章字数: 约 ${config.wordsPerChapter} 字
- 叙事视角: ${config.pov}
${config.forbiddenWords.length ? `- 禁用词汇: ${config.forbiddenWords.join('、')}` : ''}

写作原则：
1. 保持人物性格和语言风格一致
2. 对话要自然，符合人物身份
3. 描写要有画面感，但不过度堆砌
4. 每章结尾留悬念或情感钩子
5. 注意伏笔的埋设和回收
6. 控制节奏：描写、对话、动作交替进行

请直接输出章节正文，不需要标题（标题已在大纲中定义）。`;
}

async function generateChapter(
  context: string,
  onProgress?: (text: string) => void
): Promise<string> {
  const systemPrompt = buildWriterSystemPrompt();
  const prompt = `${context}

请根据以上大纲和设定，写出本章完整内容。
字数要求: 约 ${config.wordsPerChapter} 字
直接输出正文（不要标题），以自然段落形式呈现。`;

  if (onProgress) {
    return await generateStream({
      model: config.model,
      prompt,
      system: systemPrompt,
      temperature: 0.85,
      max_tokens: 8192,
    }, onProgress);
  }

  return await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.85,
    max_tokens: 8192,
  });
}

async function updateCharacterStates(projectId: number, content: string, characters: KB.CharacterCard[]): Promise<void> {
  // 用轻量提示词检查人物状态变化
  const systemPrompt = '你是人物状态追踪器。分析章节内容，检查人物是否发生了重大变化。';
  const prompt = `分析以下章节中人物的状态变化：

人物: ${characters.map(c => c.name).join('、')}

章节内容:
${content.slice(0, 2000)}

如果人物有重大变化（如受伤、情感转变、获得新能力、死亡），请列出。没有则回复"无变化"。`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.3,
    max_tokens: 1024,
  });

  if (response.includes('无变化')) return;

  // 通知规划师可能的人物设定更新
  await messageBus.send({
    from: 'writer',
    to: 'planner',
    type: 'suggestion',
    title: '人物状态变化',
    content: response,
    projectId,
    priority: 'low',
  });
}

export function initWriter(): void {
  messageBus.subscribe('writer', async (msg) => {
    if (msg.type === 'command' && msg.to === 'writer') {
      console.log('[Writer] 收到指令:', msg.title);
      if (msg.title.includes('修改') || msg.title.includes('重写')) {
        const chNum = extractChapterNumber(msg.title);
        if (chNum) {
          await reviseChapter(msg.projectId, chNum, msg.content);
        }
      }
    }

    if (msg.type === 'issue' && msg.to === 'writer') {
      console.log('[Writer] 收到问题反馈:', msg.title);
      const chNum = extractChapterNumber(msg.title);
      if (chNum) {
        await reviseChapter(msg.projectId, chNum, msg.content);
      }
    }
  });
}

function extractChapterNumber(text: string): number | null {
  const match = text.match(/第(\d+)章/);
  return match ? parseInt(match[1]) : null;
}
