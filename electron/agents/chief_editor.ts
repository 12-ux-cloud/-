/**
 * ⑥ 主编 AI — 全局管控中心
 * 模型: DeepSeek-R1 (最强推理) 或云端 Claude/GPT-4
 *
 * 职责:
 * - 流程管控: 监控流水线进度，决定何时推进
 * - 质量审核: 每个环节完成后审核通过才放行
 * - 争议裁决: Agent 之间意见不一时拍板
 * - 驳回重做: 质量不达标直接驳回，附带修改意见
 * - 最终发布: 只有主编确认通过才能发布
 * - 紧急干预: 随时暂停流水线，调整方向
 * - 一致性把关: 确保全书风格、人物、情节前后一致
 */

import { generate } from '../shared/ai_provider';
import { messageBus } from '../shared/message_bus';
import { pipeline } from '../shared/pipeline';
import * as KB from '../shared/knowledge_base';

export interface ChiefEditorConfig {
  model: string;              // 默认 deepseek-r1:7b (或用云端更强大模型)
  reviewThreshold: number;    // 质量门槛 0-100
  autoApproveAbove: number;   // 高于此分数自动通过
  maxRevisions: number;       // 最大驳回次数
  consistencyCheckEnabled: boolean;
}

const DEFAULT_CONFIG: ChiefEditorConfig = {
  model: 'deepseek-r1:7b',
  reviewThreshold: 70,
  autoApproveAbove: 85,
  maxRevisions: 3,
  consistencyCheckEnabled: true,
};

let config: ChiefEditorConfig = { ...DEFAULT_CONFIG };

export function setChiefEditorConfig(cfg: Partial<ChiefEditorConfig>): void {
  config = { ...config, ...cfg };
}

export function getChiefEditorConfig(): ChiefEditorConfig {
  return { ...config };
}

/**
 * 审核大纲 — 规划师完成后调用
 */
export async function reviewOutline(
  projectId: number
): Promise<{ approved: boolean; feedback: string; score: number }> {
  console.log('[ChiefEditor] 审核大纲...');

  const outlines = KB.getOutlines(projectId);
  const characters = KB.getCharacters(projectId);
  const project = KB.getProject(projectId);

  if (!project) return { approved: false, feedback: '项目不存在', score: 0 };

  const systemPrompt = buildChiefSystemPrompt();
  const prompt = `请作为主编审核以下小说大纲：

## 项目信息
名称: ${project.name}
类型: ${project.genre}
目标字数: ${project.target_words}

## 章节大纲 (${outlines.length}章)
${outlines.map(o => `第${o.chapter_number}章 ${o.title}: ${o.summary}`).join('\n')}

## 人物设定 (${characters.length}人)
${characters.map(c => `- ${c.name}(${c.role}): 性格=${c.personality}, 动机=${c.motivation}`).join('\n')}

## 审核要点
1. 整体节奏是否合理（开头/发展/高潮/结局分布）
2. 是否有明显的逻辑漏洞
3. 人物是否有成长弧线
4. 是否有冗余或缺失的章节
5. 商业性评估（是否吸引读者）

请按以下格式输出：
评分: X/100
审核意见:（详细说明通过或驳回的理由，如果驳回，逐条列明修改要求）
结论: 通过 / 驳回修改`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.5,
    max_tokens: 2048,
  });

  const result = parseReviewResponse(response);
  console.log(`[ChiefEditor] 大纲审核完成: ${result.approved ? '通过' : '驳回'} (${result.score}分)`);

  // 记录审核意见到知识库
  await messageBus.send({
    from: 'chief_editor',
    to: result.approved ? 'writer' : 'planner',
    type: result.approved ? 'status' : 'command',
    title: result.approved ? '大纲审核通过' : '大纲需要修改',
    content: result.feedback,
    projectId,
    priority: result.approved ? 'normal' : 'high',
  });

  return result;
}

/**
 * 审核章节 — 编辑校对后、排版前调用
 */
export async function reviewChapter(
  projectId: number,
  chapterNumber: number
): Promise<{ approved: boolean; feedback: string; score: number }> {
  console.log(`[ChiefEditor] 审核第 ${chapterNumber} 章...`);

  const chapter = KB.getChapter(projectId, chapterNumber);
  const editReports = chapter ? KB.getEditReports(chapter.id) : [];
  const prevChapter = chapterNumber > 1 ? KB.getChapter(projectId, chapterNumber - 1) : null;
  const outline = KB.getOutlines(projectId).find(o => o.chapter_number === chapterNumber);

  if (!chapter) return { approved: false, feedback: '章节不存在', score: 0 };

  const latestReport = editReports[0];
  const editScore = latestReport?.score || 0;

  // 高分自动通过
  if (editScore >= config.autoApproveAbove) {
    KB.updateChapterStatus(chapter.id, 'approved');
    await messageBus.send({
      from: 'chief_editor',
      to: 'typesetter',
      type: 'status',
      title: `第 ${chapterNumber} 章自动通过 (${editScore}分)`,
      content: '编辑评分达标，自动通过审核',
      projectId,
      priority: 'normal',
    });
    return { approved: true, feedback: '编辑评分达标，自动通过', score: editScore };
  }

  // 需要人工审核
  const systemPrompt = buildChiefSystemPrompt();
  const prompt = `请作为主编审核第 ${chapterNumber} 章：

## 大纲
${outline ? `第${outline.chapter_number}章 ${outline.title}: ${outline.summary}` : '无大纲'}

## 章节内容（前2000字）
${chapter.content.slice(0, 2000)}...

## 编辑报告
评分: ${editScore}/100
${latestReport?.report || '无编辑报告'}

## 上一章（前500字）
${prevChapter ? prevChapter.content.slice(-500) : '无（这是第一章）'}

请按以下格式输出：
评分: X/100
审核意见:（优点+需要改进的地方）
结论: 通过 / 驳回修改`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.5,
    max_tokens: 2048,
  });

  const result = parseReviewResponse(response);

  if (result.approved) {
    KB.updateChapterStatus(chapter.id, 'approved');
    await messageBus.send({
      from: 'chief_editor',
      to: 'typesetter',
      type: 'status',
      title: `第 ${chapterNumber} 章审核通过`,
      content: result.feedback,
      projectId,
      priority: 'normal',
    });
  } else {
    // 驳回给作家修改
    await messageBus.send({
      from: 'chief_editor',
      to: 'writer',
      type: 'command',
      title: `第 ${chapterNumber} 章需要修改`,
      content: result.feedback,
      projectId,
      priority: 'high',
    });
  }

  console.log(`[ChiefEditor] 第${chapterNumber}章审核: ${result.approved ? '通过' : '驳回'}`);
  return result;
}

/**
 * 最终审核 — 发布前调用
 */
export async function finalReview(projectId: number): Promise<{ approved: boolean; feedback: string }> {
  console.log('[ChiefEditor] 最终审核...');

  const project = KB.getProject(projectId);
  const chapters = KB.getAllChapters(projectId);
  const unapprovedCount = chapters.filter(c => c.status !== 'approved').length;

  if (unapprovedCount > 0) {
    return { approved: false, feedback: `还有 ${unapprovedCount} 章未通过审核，不能发布` };
  }

  // 全书一致性终审
  if (config.consistencyCheckEnabled) {
    const consistencyIssues = await checkBookConsistency(projectId, chapters);
    if (consistencyIssues) {
      return { approved: false, feedback: consistencyIssues };
    }
  }

  // 通过 → 通知发布 Agent
  await messageBus.send({
    from: 'chief_editor',
    to: 'publisher',
    type: 'command',
    title: '最终审核通过，允许发布',
    content: `全书 ${chapters.length} 章已通过审核，可以发布`,
    projectId,
    priority: 'high',
  });

  KB.updateProjectStatus(projectId, 'completed');
  console.log('[ChiefEditor] 最终审核通过 ✅');
  return { approved: true, feedback: '全书审核通过，可以发布' };
}

/**
 * 争议裁决 — Agent 之间意见不一时
 */
export async function arbitrate(
  projectId: number,
  dispute: { agentA: string; opinionA: string; agentB: string; opinionB: string }
): Promise<string> {
  const systemPrompt = buildChiefSystemPrompt();
  const prompt = `请裁决以下分歧：

${dispute.agentA} 的意见: ${dispute.opinionA}

${dispute.agentB} 的意见: ${dispute.opinionB}

请给出裁决结果和理由。`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.3,
    max_tokens: 1024,
  });

  // 通知双方
  await messageBus.send({
    from: 'chief_editor',
    to: 'all',
    type: 'command',
    title: '主编裁决',
    content: response,
    projectId,
    priority: 'high',
  });

  return response;
}

/**
 * 紧急干预 — 发现重大问题时暂停流水线
 */
export async function emergencyIntervention(
  projectId: number,
  reason: string,
  affectedStage: string
): Promise<void> {
  pipeline.pause(`主编紧急干预: ${reason}`);

  await messageBus.send({
    from: 'chief_editor',
    to: 'all',
    type: 'command',
    title: '🚨 紧急暂停',
    content: `原因: ${reason}\n影响阶段: ${affectedStage}\n请等待主编进一步指示`,
    projectId,
    priority: 'urgent',
  });
}

// ===== 内部方法 =====

function buildChiefSystemPrompt(): string {
  return `你是一位资深的出版级主编，拥有20年小说编辑经验。你的职责是确保每一部作品都达到出版质量标准。

审核原则：
1. 质量优先，不妥协
2. 眼光敏锐，能发现深层问题
3. 反馈具体，给出可执行的修改建议
4. 推动作品达到最佳状态
5. 平衡创意与商业化

输出语言：中文`;
}

function parseReviewResponse(response: string): { approved: boolean; feedback: string; score: number } {
  const scoreMatch = response.match(/评分[：:]\s*(\d+)/);
  const score = scoreMatch ? parseInt(scoreMatch[1]) : 60;

  const approved = response.includes('通过') && !response.includes('驳回');

  // 提取反馈（去掉评分行）
  let feedback = response
    .replace(/评分[：:]\s*\d+.*/, '')
    .replace(/结论[：:].*/, '')
    .trim();

  if (!feedback || feedback.length < 10) {
    feedback = response;
  }

  return { approved, feedback, score };
}

async function checkBookConsistency(projectId: number, chapters: KB.ChapterContent[]): Promise<string | null> {
  // 抽样检查前后一致性
  if (chapters.length < 2) return null;

  const firstChapter = chapters[0];
  const lastChapter = chapters[chapters.length - 1];
  const characters = KB.getCharacters(projectId);

  const systemPrompt = buildChiefSystemPrompt();
  const prompt = `请检查以下小说的前后一致性：

人物: ${characters.map(c => c.name).join('、')}

第1章开头:
${firstChapter.content.slice(0, 500)}

最后一章结尾:
${lastChapter.content.slice(-500)}

请检查：
1. 人物性格是否一致
2. 情节是否有矛盾
3. 伏笔是否回收
4. 结尾是否合理

如果有严重问题请描述，没有则回复"一致性检查通过"。`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.3,
    max_tokens: 1024,
  });

  return response.includes('通过') ? null : response;
}

// ===== 初始化主编 =====

export function initChiefEditor(): void {
  // 订阅所有消息 — 主编需要了解一切
  messageBus.subscribe('chief_editor', async (msg) => {
    console.log(`[ChiefEditor] 收到消息: [${msg.from}→${msg.to}] ${msg.title}`);

    // 紧急消息 → 立即响应
    if (msg.priority === 'urgent') {
      console.warn(`[ChiefEditor] 🚨 紧急: ${msg.title}`);
      // 暂停流水线
      pipeline.pause(`紧急事件: ${msg.title}`);
    }

    // 问题汇报 → 评估是否需要干预
    if (msg.type === 'issue' && msg.priority === 'high') {
      console.log(`[ChiefEditor] 收到重要问题: ${msg.title}`);
      // 自动评估：如果是重大质量问题，驳回
      if (msg.content.includes('逻辑矛盾') || msg.content.includes('设定冲突')) {
        await emergencyIntervention(msg.projectId, msg.content, 'writing');
      }
    }

    // 规划师完成 → 自动审核大纲
    if (msg.from === 'planner' && msg.type === 'status' && msg.title.includes('规划完成')) {
      const result = await reviewOutline(msg.projectId);
      if (result.approved) {
        console.log('[ChiefEditor] 大纲通过，准备启动写作');
      }
    }

    // 编辑完成 → 自动审核章节
    if (msg.from === 'editor' && msg.type === 'suggestion') {
      const chNum = extractChapterNumber(msg.title);
      if (chNum) {
        await reviewChapter(msg.projectId, chNum);
      }
    }

    // 排版完成 → 准备最终审核
    if (msg.from === 'typesetter' && msg.type === 'status') {
      console.log('[ChiefEditor] 排版完成，准备最终审核');
    }
  });

  console.log('[ChiefEditor] 主编已就位 👑');
}

function extractChapterNumber(text: string): number | null {
  const match = text.match(/第(\d+)章/);
  return match ? parseInt(match[1]) : null;
}
