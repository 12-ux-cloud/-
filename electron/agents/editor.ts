/**
 * ③ 编辑 Agent — 编辑与校对
 * 模型: Qwen2.5 (精细编辑) + LanguageTool 规则引擎
 * 产出: 校对报告 + 修改后版本
 */

import { generate } from '../shared/ollama';
import { messageBus } from '../shared/message_bus';
import * as KB from '../shared/knowledge_base';

export interface EditorConfig {
  model: string;           // 默认 qwen2.5:7b
  strictness: number;      // 检查严格度 1-10
  preserveStyle: number;   // 保留风格程度 1-10
  sensitiveWords: string[];
  checkConsistency: boolean;  // 检查前后一致性
  autoFixMinor: boolean;      // 轻微问题自动修正
}

const DEFAULT_CONFIG: EditorConfig = {
  model: 'qwen2.5:7b',
  strictness: 7,
  preserveStyle: 8,
  sensitiveWords: [],
  checkConsistency: true,
  autoFixMinor: true,
};

let config: EditorConfig = { ...DEFAULT_CONFIG };

export function setEditorConfig(cfg: Partial<EditorConfig>): void {
  config = { ...config, ...cfg };
}

export function getEditorConfig(): EditorConfig {
  return { ...config };
}

export interface EditIssue {
  type: 'grammar' | 'logic' | 'consistency' | 'style' | 'repetition' | 'sensitive';
  severity: 'minor' | 'moderate' | 'major';
  location: string;      // 原文引用
  description: string;
  suggestion: string;
}

/**
 * 编辑主入口 — 校对一章
 */
export async function editChapter(
  projectId: number,
  chapterNumber: number
): Promise<{ fixedContent: string; report: string; issues: EditIssue[]; score: number }> {
  console.log(`[Editor] 开始校对第 ${chapterNumber} 章...`);

  const chapter = KB.getChapter(projectId, chapterNumber);
  if (!chapter) {
    throw new Error(`第 ${chapterNumber} 章不存在`);
  }

  // 获取上下文用于一致性检查
  const characters = KB.getCharacters(projectId);
  const prevChapters = KB.getAllChapters(projectId).filter(c => c.chapter_number < chapterNumber);
  const outlines = KB.getOutlines(projectId);
  const outline = outlines.find(o => o.chapter_number === chapterNumber);

  // Step 1: 基础校对（语法、错别字、标点）
  const basicIssues = await checkBasicErrors(chapter.content);

  // Step 2: 深度检查（逻辑、一致性、风格）
  const deepIssues = config.checkConsistency
    ? await checkDeepIssues(chapter.content, characters, prevChapters, outline)
    : [];

  // Step 3: 敏感词检查
  const sensitiveIssues = await checkSensitiveWords(chapter.content);

  const allIssues = [...basicIssues, ...deepIssues, ...sensitiveIssues];

  // Step 4: 生成修正后内容
  let fixedContent = chapter.content;
  if (allIssues.length > 0) {
    fixedContent = await generateFixedContent(chapter.content, allIssues);
  }

  // Step 5: 计算质量评分
  const score = calculateScore(allIssues, chapter.word_count);

  // Step 6: 生成报告
  const report = generateReport(allIssues, score);

  // 保存校对报告
  KB.saveEditReport({
    chapter_id: chapter.id,
    issues: JSON.stringify(allIssues),
    fixed_content: fixedContent,
    score,
    report,
  });

  // 通知对应 Agent
  if (allIssues.filter(i => i.severity === 'major').length > 0) {
    // 重大问题 → 通知主编
    await messageBus.send({
      from: 'editor',
      to: 'chief_editor',
      type: 'issue',
      title: `第 ${chapterNumber} 章发现 ${allIssues.filter(i => i.severity === 'major').length} 个重大问题`,
      content: report,
      projectId,
      priority: 'high',
    });
  }

  // 反馈给作家
  await messageBus.send({
    from: 'editor',
    to: 'writer',
    type: 'suggestion',
    title: `第 ${chapterNumber} 章校对完成`,
    content: report,
    projectId,
    priority: 'normal',
  });

  // 更新章节状态
  if (score >= 80 && allIssues.filter(i => i.severity === 'major').length === 0) {
    KB.updateChapterStatus(chapter.id, 'edited');
  }

  console.log(`[Editor] 第 ${chapterNumber} 章校对完成，评分: ${score}`);
  return { fixedContent, report, issues: allIssues, score };
}

/**
 * 快速检查 — 针对单个段落的快速校对
 */
export async function quickCheck(text: string): Promise<EditIssue[]> {
  return await checkBasicErrors(text);
}

// ===== 内部方法 =====

async function checkBasicErrors(content: string): Promise<EditIssue[]> {
  const systemPrompt = `你是一位专业的文字校对编辑，精通中文语法、用词和标点规范。
检查严格度: ${config.strictness}/10

请找出以下问题：
1. 错别字（形近字、同音字误用）
2. 语法错误（成分残缺、搭配不当）
3. 标点符号使用不当
4. "的得地"误用
5. 重复用词（一段内同一个词出现超过3次）

对每个问题，输出一行 JSON：
{"type":"grammar","severity":"minor|moderate|major","location":"原文引用","description":"问题描述","suggestion":"修改建议"}`;

  const prompt = `请检查以下文本：

${content.slice(0, 3000)}

输出发现的每个问题的 JSON（一行一个），如果没有问题输出"无问题"。`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.3,
    max_tokens: 4096,
  });

  return parseIssues(response);
}

async function checkDeepIssues(
  content: string,
  characters: KB.CharacterCard[],
  prevChapters: KB.ChapterContent[],
  outline: KB.ChapterOutline | undefined
): Promise<EditIssue[]> {
  const charContext = characters.map(c =>
    `- ${c.name}: 性格=${c.personality}, 动机=${c.motivation}`
  ).join('\n');

  const prevContext = prevChapters.slice(-3).map(c =>
    `第${c.chapter_number}章摘要: ${c.content.slice(0, 200)}...`
  ).join('\n');

  const systemPrompt = `你是一位资深内容编辑，擅长发现故事中的逻辑漏洞和一致性错误。

人物设定:
${charContext}

前情提要:
${prevContext}

${outline ? `本章大纲: ${outline.summary}` : ''}

请检查：
1. 人物行为是否与设定一致
2. 前后情节是否有矛盾
3. 时间线是否合理
4. 是否有设定漏洞
5. 对话是否符合人物性格

对每个问题输出一行 JSON（格式同上），无问题输出"无问题"。`;

  const prompt = `请检查以下章节内容：
${content.slice(0, 3000)}`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.3,
    max_tokens: 4096,
  });

  return parseIssues(response);
}

async function checkSensitiveWords(content: string): Promise<EditIssue[]> {
  if (!config.sensitiveWords.length) return [];

  const found: EditIssue[] = [];
  for (const word of config.sensitiveWords) {
    if (content.includes(word)) {
      found.push({
        type: 'sensitive',
        severity: 'major',
        location: `包含敏感词: ${word}`,
        description: `发现敏感词汇: ${word}`,
        suggestion: `建议替换或删除"${word}"`,
      });
    }
  }
  return found;
}

async function generateFixedContent(original: string, issues: EditIssue[]): Promise<string> {
  // 轻微问题自动修复
  if (config.autoFixMinor && issues.every(i => i.severity === 'minor')) {
    const systemPrompt = '你是一位文字校对编辑，请修正以下文本中的问题，保持原有风格。';
    const issuesStr = issues.map(i => `- ${i.location} → ${i.suggestion}`).join('\n');

    const prompt = `原文：
${original.slice(0, 4000)}

需要修正的问题：
${issuesStr}

请输出修正后的完整文本。`;

    return await generate({
      model: config.model,
      prompt,
      system: systemPrompt,
      temperature: 0.3,
      max_tokens: 8192,
    });
  }

  // 重大问题不自动修，返回原文
  return original;
}

function calculateScore(issues: EditIssue[], wordCount: number): number {
  let deductions = 0;
  for (const issue of issues) {
    switch (issue.severity) {
      case 'major': deductions += 15; break;
      case 'moderate': deductions += 5; break;
      case 'minor': deductions += 2; break;
    }
  }
  // 根据字数调整（长章节容错空间大一些）
  const base = 100;
  const adjustedDeductions = Math.min(deductions, 50);
  return Math.max(base - adjustedDeductions, 0);
}

function generateReport(issues: EditIssue[], score: number): string {
  const grouped: Record<string, EditIssue[]> = {
    grammar: [],
    logic: [],
    consistency: [],
    style: [],
    repetition: [],
    sensitive: [],
  };

  for (const issue of issues) {
    grouped[issue.type]?.push(issue);
  }

  let report = `## 校对报告\n\n**综合评分: ${score}/100**\n\n`;

  for (const [type, items] of Object.entries(grouped)) {
    if (items.length > 0) {
      const labels: Record<string, string> = {
        grammar: '语法/错字',
        logic: '逻辑问题',
        consistency: '一致性问题',
        style: '风格建议',
        repetition: '重复用词',
        sensitive: '敏感词',
      };
      report += `### ${labels[type] || type} (${items.length}处)\n`;
      for (const item of items) {
        report += `- ${item.severity === 'major' ? '🔴' : item.severity === 'moderate' ? '🟡' : '🟢'} ${item.description}\n`;
        report += `  位置: "${item.location}"\n`;
        report += `  建议: ${item.suggestion}\n`;
      }
      report += '\n';
    }
  }

  if (issues.length === 0) {
    report += '✅ 未发现问题，本章质量良好。';
  }

  return report;
}

function parseIssues(response: string): EditIssue[] {
  if (response.includes('无问题') || response.includes('未发现')) return [];

  const issues: EditIssue[] = [];
  const lines = response.split('\n').filter(l => l.trim().startsWith('{'));
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type && obj.description) {
        issues.push({
          type: obj.type as EditIssue['type'],
          severity: obj.severity || 'minor',
          location: obj.location || '',
          description: obj.description,
          suggestion: obj.suggestion || '',
        });
      }
    } catch {}
  }
  return issues;
}

export function initEditor(): void {
  messageBus.subscribe('editor', async (msg) => {
    if (msg.type === 'status' && msg.to === 'editor') {
      console.log('[Editor] 收到通知:', msg.title);
      // 收到作家完成章节通知 → 自动开始校对
      const chNum = extractChapterNumber(msg.title);
      if (chNum) {
        await editChapter(msg.projectId, chNum);
      }
    }

    if (msg.type === 'command' && msg.to === 'editor') {
      console.log('[Editor] 收到指令:', msg.title);
    }
  });
}

function extractChapterNumber(text: string): number | null {
  const match = text.match(/第(\d+)章/);
  return match ? parseInt(match[1]) : null;
}
