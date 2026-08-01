/**
 * ① 规划师 Agent — 构思与规划
 * 模型: DeepSeek-R1 (推理拆解) + Qwen2.5 (创意发散)
 * 产出: 故事梗概 → 章节大纲 → 人物设定卡 → 世界观
 */

import { generate, buildSystemPrompt } from '../shared/ai_provider';
import { messageBus } from '../shared/message_bus';
import * as KB from '../shared/knowledge_base';

export interface PlannerConfig {
  model: string;           // 默认 deepseek-r1:7b
  creativeModel: string;   // 创意发散用 qwen2.5:7b
  genre: string;           // 小说类型
  totalChapters: number;   // 总章节数
  wordsPerChapter: number; // 每章字数
  protagonistGender: string;
  protagonistPersonality: string;
  forbiddenTropes: string[];
  requiredElements: string[];
  /** 生成模式: 'full' = 一次全部, 'batch' = 分批 */
  batchMode: string;
  /** 每批生成章节数 */
  batchSize: number;
  /** 是否支持续集 */
  hasSequel: number;
  /** 当前批次起始章（用于分批生成） */
  batchStartChapter: number;
}

const DEFAULT_CONFIG: PlannerConfig = {
  model: 'deepseek-r1:7b',
  creativeModel: 'qwen2.5:7b',
  genre: '玄幻',
  totalChapters: 30,
  wordsPerChapter: 3000,
  protagonistGender: '男',
  protagonistPersonality: '',
  forbiddenTropes: [],
  requiredElements: [],
  batchMode: 'full',
  batchSize: 5,
  hasSequel: 0,
  batchStartChapter: 1,
};

let config: PlannerConfig = { ...DEFAULT_CONFIG };

export function setPlannerConfig(cfg: Partial<PlannerConfig>): void {
  config = { ...config, ...cfg };
}

export function getPlannerConfig(): PlannerConfig {
  return { ...config };
}

/**
 * 规划师主入口 — 根据用户创意生成完整规划
 */
export async function planNovel(projectId: number, userIdea: string): Promise<{
  synopsis: string;
  outlines: KB.ChapterOutline[];
  characters: KB.CharacterCard[];
  worldSettings: KB.WorldSetting[];
  batchInfo?: { batchNumber: number; startChapter: number; endChapter: number; hasMore: boolean };
}> {
  const project = KB.getProject(projectId);
  console.log(`[Planner] 开始规划小说... (模式: ${config.batchMode}, 续集: ${config.hasSequel ? '是' : '否'})`);

  // 同步配置到数据库
  if (project) {
    KB.updateProject(projectId, {
      batch_mode: config.batchMode,
      batch_size: config.batchSize,
      has_sequel: config.hasSequel,
      current_batch: 1,
    });
  }

  const isFirstBatch = true;

  // Step 1: 生成故事梗概（含续集伏笔提示）
  const synopsis = await generateSynopsis(projectId, userIdea, isFirstBatch);

  // Step 2: 生成世界观
  const worldSettings = await generateWorldSettings(projectId, userIdea, synopsis);

  // Step 3: 生成人物设定
  const characters = await generateCharacters(projectId, userIdea, synopsis);

  // Step 4: 生成章节大纲（分批模式只生成当前批次）
  const outlines = await generateOutlines(projectId, synopsis, characters);

  // Step 5: 通知主编审核
  const batchInfo = config.batchMode === 'batch' ? {
    batchNumber: 1,
    startChapter: config.batchStartChapter,
    endChapter: Math.min(config.batchStartChapter + config.batchSize - 1, config.totalChapters),
    hasMore: config.batchStartChapter + config.batchSize <= config.totalChapters,
  } : undefined;

  await messageBus.send({
    from: 'planner',
    to: 'chief_editor',
    type: 'status',
    title: '规划完成，等待审核',
    content: batchInfo
      ? `[分批模式] 第 ${batchInfo.batchNumber} 批 (第${batchInfo.startChapter}-${batchInfo.endChapter}章)，共 ${outlines.length} 章大纲、${characters.length} 个人物设定`
      : `已完成 ${outlines.length} 章大纲、${characters.length} 个人物设定`,
    projectId,
    priority: 'normal',
  });

  console.log(`[Planner] 规划完成 (第 ${config.batchStartChapter} 章起，${outlines.length} 章)`);
  return { synopsis, outlines, characters, worldSettings, batchInfo };
}

/**
 * 续集/分批 — 生成下一批章节大纲
 * 复用已有的梗概、人物、世界观，只生成新的章节大纲
 */
export async function planNextBatch(projectId: number): Promise<{
  outlines: KB.ChapterOutline[];
  batchInfo: { batchNumber: number; startChapter: number; endChapter: number; hasMore: boolean };
}> {
  const project = KB.getProject(projectId);
  if (!project) throw new Error('项目不存在');

  const nextBatch = (project.current_batch || 1) + 1;
  const startChapter = (nextBatch - 1) * config.batchSize + 1;
  const endChapter = Math.min(nextBatch * config.batchSize, config.totalChapters);
  const hasMore = endChapter < config.totalChapters;

  console.log(`[Planner] 生成第 ${nextBatch} 批大纲 (第${startChapter}-${endChapter}章)...`);

  // 读取已有上下文
  const existingOutlines = KB.getOutlines(projectId);
  const characters = KB.getCharacters(projectId);
  const synopsis = `已有 ${existingOutlines.length} 章大纲\n` +
    existingOutlines.slice(-3).map(o => `第${o.chapter_number}章 ${o.title}: ${o.summary}`).join('\n');

  // 生成新批次大纲
  config.batchStartChapter = startChapter;
  const prevTotal = config.totalChapters;
  config.totalChapters = endChapter; // 临时设置，只生成这个范围
  const outlines = await generateOutlines(projectId, synopsis, characters);
  config.totalChapters = prevTotal; // 恢复

  // 推进数据库批次
  KB.advanceBatch(projectId);

  // 通知主编
  await messageBus.send({
    from: 'planner',
    to: 'chief_editor',
    type: 'status',
    title: `第 ${nextBatch} 批大纲完成`,
    content: `第${startChapter}-${endChapter}章，共 ${outlines.length} 章`,
    projectId,
    priority: 'normal',
  });

  console.log(`[Planner] 第 ${nextBatch} 批完成`);
  return {
    outlines,
    batchInfo: { batchNumber: nextBatch, startChapter, endChapter, hasMore },
  };
}

/**
 * 生成故事梗概
 */
async function generateSynopsis(projectId: number, userIdea: string, isFirstBatch?: boolean): Promise<string> {
  const sequelHint = config.hasSequel
    ? `\n重要：本作品计划有续集。请在结尾留适当悬念和未解伏笔，为续集做铺垫。`
    : '';
  const batchHint = config.batchMode === 'batch' && isFirstBatch
    ? `\n分批模式：本次只规划第 ${config.batchStartChapter} 到第 ${Math.min(config.batchStartChapter + config.batchSize - 1, config.totalChapters)} 章（共 ${config.totalChapters} 章计划）。后续章节留白，待后续批次补充。`
    : '';

  const systemPrompt = buildSystemPrompt(
    '专业小说规划师',
    `你擅长将创意扩展为完整的故事梗概。
小说类型: ${config.genre}
主角性别: ${config.protagonistGender}
${config.protagonistPersonality ? `主角性格: ${config.protagonistPersonality}` : ''}
${config.forbiddenTropes.length ? `避免以下套路: ${config.forbiddenTropes.join('、')}` : ''}
${config.requiredElements.length ? `必须包含: ${config.requiredElements.join('、')}` : ''}
${sequelHint}${batchHint}

请输出 300-500 字的故事梗概，包含开头、发展、高潮、结局。`
  );

  const prompt = `请根据以下创意，生成一个完整的故事梗概：

${userIdea}

要求：
1. 明确故事的核心冲突和主题
2. 概述主要情节发展
3. 暗示结局方向
4. 300-500 字`;

  return await generate({
    model: config.creativeModel,
    prompt,
    system: systemPrompt,
    temperature: 0.8,
    max_tokens: 2048,
  });
}

/**
 * 生成世界观设定
 */
async function generateWorldSettings(projectId: number, idea: string, synopsis: string): Promise<KB.WorldSetting[]> {
  const categories = ['时代背景', '地理环境', '社会结构', '力量体系', '重要势力'];
  const results: KB.WorldSetting[] = [];

  for (const category of categories) {
    const systemPrompt = buildSystemPrompt(
      '世界观构建师',
      `你擅长为小说构建详细的世界观设定。小说类型: ${config.genre}`
    );

    const prompt = `基于以下故事信息，详细描述世界观中的「${category}」：

创意: ${idea}
梗概: ${synopsis}

请输出该类别下的详细设定（100-200字）`;

    const content = await generate({
      model: config.model,
      prompt,
      system: systemPrompt,
      temperature: 0.7,
      max_tokens: 1024,
    });

    KB.setWorldSetting(projectId, category, content);
    results.push({ id: 0, project_id: projectId, category, content, updated_at: '' });
  }

  return results;
}

/**
 * 生成人物设定卡
 */
async function generateCharacters(projectId: number, idea: string, synopsis: string): Promise<KB.CharacterCard[]> {
  const systemPrompt = buildSystemPrompt(
    '人物设计师',
    `你擅长设计丰富立体的小说人物。每个角色需要有完整的设定卡。
小说类型: ${config.genre}
主角性别: ${config.protagonistGender}
${config.protagonistPersonality ? `主角性格倾向: ${config.protagonistPersonality}` : ''}`
  );

  const prompt = `基于以下故事信息，设计 5-8 个核心人物：

创意: ${idea}
梗概: ${synopsis}

对每个人物，请严格按以下 JSON 格式输出（输出 JSON 数组）：
[
  {
    "name": "人物名",
    "role": "主角/反派/重要配角/配角",
    "gender": "性别",
    "age": "年龄",
    "personality": "性格特征（50字）",
    "appearance": "外貌描述（50字）",
    "background": "背景故事（100字）",
    "motivation": "核心动机（50字）",
    "arc": "成长弧（50字）",
    "relationships": "与其他人物关系"
  }
]`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.8,
    max_tokens: 4096,
  });

  // 解析 JSON
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const characters = JSON.parse(jsonMatch[0]);
      const result: KB.CharacterCard[] = [];
      for (const char of characters) {
        const saved = KB.saveCharacter({
          project_id: projectId,
          name: char.name,
          role: char.role,
          gender: char.gender,
          age: char.age,
          personality: char.personality,
          appearance: char.appearance,
          background: char.background,
          motivation: char.motivation,
          arc: char.arc,
          relationships: JSON.stringify(char.relationships || ''),
        });
        result.push(saved);
      }
      return result;
    }
  } catch (err) {
    console.error('[Planner] JSON parse error:', err);
  }

  return [];
}

/**
 * 生成章节大纲
 */
async function generateOutlines(projectId: number, synopsis: string, characters: KB.CharacterCard[]): Promise<KB.ChapterOutline[]> {
  const characterNames = characters.map(c => c.name).join('、');
  const systemPrompt = buildSystemPrompt(
    '小说大纲师',
    `你擅长将故事拆解为详细的章节大纲。
总章节数: ${config.totalChapters}
每章字数: ${config.wordsPerChapter}
主要人物: ${characterNames}`
  );

  const prompt = `基于以下故事梗概，生成第 ${config.batchStartChapter} 章到第 ${config.totalChapters} 章的详细大纲：

${synopsis}

对每一章，按以下格式输出（每章一行）：
第X章 | 章节标题 | 100字内容提要 | 关键事件 | 聚焦人物

要求：
1. 起始章为开局（引入世界观和冲突）
2. 每章要有明确的小目标和小冲突
3. 节奏有张有弛，避免平铺直叙
4. 章节间要有钩子和悬念
${config.hasSequel ? '5. 预留续集伏笔，在靠后的章节埋下未解之谜或未完成的冲突' : `5. 最后几章妥善收尾，完成主要冲突`}`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.7,
    max_tokens: 8192,
  });

  // 解析大纲
  const outlines: KB.ChapterOutline[] = [];
  const lines = response.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const match = line.match(/第(\d+)章\s*[|｜]\s*(.+?)\s*[|｜]\s*(.+)/);
    if (!match) {
      const parts = line.split(/[|｜]/);
      if (parts.length >= 3) {
        const chNum = parseInt(parts[0].replace(/[^\d]/g, '')) || outlines.length + 1;
        const saved = KB.saveOutline({
          project_id: projectId,
          chapter_number: chNum,
          title: parts[1].trim(),
          summary: parts[2].trim(),
          key_events: parts[3]?.trim() || '',
          character_focus: parts[4]?.trim() || '',
          status: 'pending',
        });
        outlines.push(saved);
      }
    } else {
      const saved = KB.saveOutline({
        project_id: projectId,
        chapter_number: parseInt(match[1]),
        title: match[2].trim(),
        summary: match[3].trim(),
        key_events: '',
        character_focus: '',
        status: 'pending',
      });
      outlines.push(saved);
    }
  }

  return outlines;
}

/**
 * 响应其他 Agent 的设定质疑
 */
export async function reviseOutline(projectId: number, feedback: string): Promise<void> {
  const outlines = KB.getOutlines(projectId);
  const systemPrompt = buildSystemPrompt('专业小说规划师', '你需要根据反馈修改大纲。');

  const prompt = `现有大纲：
${outlines.map(o => `第${o.chapter_number}章 ${o.title}: ${o.summary}`).join('\n')}

修改意见: ${feedback}

请重新输出修改后的大纲（格式同上）`;

  const response = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.6,
    max_tokens: 4096,
  });

  // TODO: 解析并更新大纲
  console.log('[Planner] 大纲修改建议:', response);
}

// 监听消息 — 接收其他 Agent 的设定质疑
export function initPlanner(): void {
  messageBus.subscribe('planner', async (msg) => {
    if (msg.type === 'issue' && msg.to === 'planner') {
      console.log('[Planner] 收到质疑:', msg.title);
      await reviseOutline(msg.projectId, msg.content);
      await messageBus.send({
        from: 'planner',
        to: msg.from,
        type: 'status',
        title: '已处理',
        content: '已根据建议更新大纲',
        projectId: msg.projectId,
        priority: 'normal',
      });
    }
  });
}
