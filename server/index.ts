/**
 * Express REST API 服务器 — 一叶轻舟工作室
 *
 * 替代 Electron IPC，提供本地 HTTP API。
 * 前端通过 fetch 调用，后端管理知识库、Agent、流水线。
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import https from 'https';

// 应用版本和更新配置
const APP_VERSION = '1.2.0';
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/12-ux-cloud/-/main/release/latest.json';

// 知识库 & Agent 模块
import { initKnowledgeBase, closeKnowledgeBase } from '../electron/shared/knowledge_base';
import { messageBus } from '../electron/shared/message_bus';
import { pipeline } from '../electron/shared/pipeline';
import { checkProviderAvailable, checkOllamaAvailable, listModels, generate, getAIConfig, saveAIConfig } from '../electron/shared/ai_provider';

import {
  setPlannerConfig, getPlannerConfig, planNovel, planNextBatch, initPlanner,
} from '../electron/agents/planner';
import {
  setWriterConfig, getWriterConfig, writeChapter, initWriter,
} from '../electron/agents/writer';
import {
  setEditorConfig, getEditorConfig, editChapter, initEditor,
} from '../electron/agents/editor';
import {
  setTypesetterConfig, getTypesetterConfig, typesetBook, initTypesetter,
} from '../electron/agents/typesetter';
import {
  setPublisherConfig, getPublisherConfig, publishChapter, initPublisher,
} from '../electron/agents/publisher';
import {
  setChiefEditorConfig, getChiefEditorConfig, reviewOutline, reviewChapter, finalReview, initChiefEditor,
} from '../electron/agents/chief_editor';

import * as KB from '../electron/shared/knowledge_base';
import { sendWeeklyFeedback, startFeedbackScheduler } from '../electron/shared/feedback_scheduler';
const { checkDatabaseHealth } = require('../electron/shared/knowledge_base');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ===== 更新检查工具函数 =====

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  needsUpdate: boolean;
  changelog: string;
  downloadUrl: string;
  publishedAt: string;
  error?: string;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchUpdateInfo(): Promise<UpdateInfo> {
  return new Promise((resolve) => {
    const url = UPDATE_CHECK_URL;
    https.get(url, { timeout: 10000 }, (resp) => {
      let data = '';
      resp.on('data', (chunk: string) => { data += chunk; });
      resp.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = (release.version || release.tag_name || '').replace(/^v/, '');
          const needsUpdate = compareVersions(latestVersion, APP_VERSION) > 0;
          resolve({
            currentVersion: APP_VERSION,
            latestVersion,
            needsUpdate,
            changelog: release.changelog || release.body || '',
            downloadUrl: release.downloadUrl || release.download_url || '',
            publishedAt: release.publishedAt || release.published_at || '',
          });
        } catch {
          resolve({
            currentVersion: APP_VERSION, latestVersion: '', needsUpdate: false,
            changelog: '', downloadUrl: '', publishedAt: '',
            error: '解析更新信息失败',
          });
        }
      });
    }).on('error', () => {
      resolve({
        currentVersion: APP_VERSION, latestVersion: '', needsUpdate: false,
        changelog: '', downloadUrl: '', publishedAt: '',
        error: '无法连接到更新服务器',
      });
    }).on('timeout', function(this: any) {
      this.destroy();
      resolve({
        currentVersion: APP_VERSION, latestVersion: '', needsUpdate: false,
        changelog: '', downloadUrl: '', publishedAt: '',
        error: '检查更新超时',
      });
    });
  });
}

// ===== 系统 API =====

app.get('/api/system/ollama', async (_req: Request, res: Response) => {
  const available = await checkOllamaAvailable();
  res.json({ available });
});

// 获取数据存储路径
app.get('/api/system/db-path', (_req: Request, res: Response) => {
  const { getAppDataPath, getDatabasePath } = require('../electron/shared/knowledge_base');
  res.json({
    appDataPath: getAppDataPath(),
    databasePath: getDatabasePath(),
  });
});

// 获取应用版本
app.get('/api/system/version', (_req: Request, res: Response) => {
  res.json({ version: APP_VERSION });
});

// 检查更新
app.get('/api/system/update', (_req: Request, res: Response) => {
  fetchUpdateInfo().then(result => res.json(result)).catch(() => {
    res.json({ currentVersion: APP_VERSION, needsUpdate: false, error: '无法检查更新' });
  });
});

app.get('/api/system/models', async (_req: Request, res: Response) => {
  const models = await listModels();
  res.json(models);
});

// AI 提供者配置
app.get('/api/ai/config', (_req: Request, res: Response) => {
  res.json(getAIConfig());
});

app.post('/api/ai/config', (req: Request, res: Response) => {
  saveAIConfig(req.body);
  res.json({ success: true });
});

// AI 提供者状态（通用，兼容旧 /api/system/ollama）
app.get('/api/system/ai-status', async (_req: Request, res: Response) => {
  const config = getAIConfig();
  const available = await checkProviderAvailable();
  res.json({ available, provider: config.provider, modelName: config.provider === 'openai' ? config.openaiModel : '' });
});

// 系统健康检查（启动自检用）
app.get('/api/system/health', async (_req: Request, res: Response) => {
  const results: Record<string, { status: string; message?: string }> = {};

  // 服务状态
  results.server = { status: 'ok' };

  // 数据库状态（返回详细信息帮助诊断）
  try {
    const dbOk = checkDatabaseHealth();
    results.database = dbOk
      ? { status: 'ok' }
      : { status: 'error', message: '数据库无响应' };
  } catch (e: any) {
    results.database = { status: 'error', message: e.message || String(e) };
  }

  // Ollama 状态
  try {
    const config = getAIConfig();
    const aiAvailable = await checkProviderAvailable();
    const aiLabel = config.provider === 'ollama' ? 'Ollama' : config.provider === 'openai' ? '云端API' : '内置云服务';
    results.ai = aiAvailable
      ? { status: 'ok', message: `${aiLabel} 正常` }
      : { status: 'error', message: `${aiLabel} 不可用` };
  } catch (e: any) {
    results.ai = { status: 'error', message: e.message };
  }

  // AI 模型
  try {
    const models = await listModels();
    const modelNames = Array.isArray(models)
      ? models.map((m: any) => typeof m === 'string' ? m : m.name).filter(Boolean)
      : [];
    if (modelNames.length > 0) {
      results.models = { status: 'ok', message: modelNames.join(', ') };
    } else {
      results.models = { status: 'error', message: '未检测到 AI 模型' };
    }
  } catch (e: any) {
    results.models = { status: 'error', message: e.message };
  }

  res.json({
    status: Object.values(results).every(r => r.status === 'ok') ? 'ok' : 'degraded',
    version: APP_VERSION,
    checks: results,
  });
});

// ===== 项目 API =====

app.post('/api/projects', (req: Request, res: Response) => {
  const { name, theme, genre, targetWords, batchMode, batchSize, hasSequel } = req.body;
  const project = KB.createProject(name, theme, genre, targetWords, batchMode, batchSize, hasSequel);
  res.json(project);
});

app.get('/api/projects', (_req: Request, res: Response) => {
  res.json(KB.getAllProjects());
});

app.get('/api/projects/:id', (req: Request, res: Response) => {
  const project = KB.getProject(parseInt(req.params.id));
  project ? res.json(project) : res.status(404).json({ error: 'Not found' });
});

// ===== 知识库查询 API =====

app.get('/api/projects/:id/characters', (req: Request, res: Response) => {
  res.json(KB.getCharacters(parseInt(req.params.id)));
});

app.get('/api/projects/:id/outlines', (req: Request, res: Response) => {
  res.json(KB.getOutlines(parseInt(req.params.id)));
});

app.get('/api/projects/:id/chapters', (req: Request, res: Response) => {
  res.json(KB.getAllChapters(parseInt(req.params.id)));
});

app.get('/api/projects/:id/world-settings', (req: Request, res: Response) => {
  res.json(KB.getWorldSettings(parseInt(req.params.id)));
});

app.get('/api/projects/:id/messages', (req: Request, res: Response) => {
  const agent = req.query.agent as string | undefined;
  res.json(KB.getMessages(parseInt(req.params.id), agent));
});

// ===== ① 规划师 API =====

app.post('/api/planner/config', (req: Request, res: Response) => {
  setPlannerConfig(req.body);
  res.json(getPlannerConfig());
});

app.post('/api/planner/start', async (req: Request, res: Response) => {
  try {
    const { projectId, idea } = req.body;
    const result = await planNovel(projectId, idea);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/planner/next-batch', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    const result = await planNextBatch(projectId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ② 作家 API =====

app.post('/api/writer/config', (req: Request, res: Response) => {
  setWriterConfig(req.body);
  res.json(getWriterConfig());
});

app.post('/api/writer/write', async (req: Request, res: Response) => {
  try {
    const { projectId, chapterNumber } = req.body;
    const result = await writeChapter(projectId, chapterNumber);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ③ 编辑 API =====

app.post('/api/editor/config', (req: Request, res: Response) => {
  setEditorConfig(req.body);
  res.json(getEditorConfig());
});

app.post('/api/editor/edit', async (req: Request, res: Response) => {
  try {
    const { projectId, chapterNumber } = req.body;
    const result = await editChapter(projectId, chapterNumber);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ④ 排版 API =====

app.post('/api/typesetter/config', (req: Request, res: Response) => {
  setTypesetterConfig(req.body);
  res.json(getTypesetterConfig());
});

app.post('/api/typesetter/build', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    const result = await typesetBook(projectId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ⑤ 发布 API =====

app.post('/api/publisher/config', (req: Request, res: Response) => {
  setPublisherConfig(req.body);
  res.json(getPublisherConfig());
});

app.post('/api/publisher/publish', async (req: Request, res: Response) => {
  try {
    const { projectId, chapterNumber, approved } = req.body;
    const result = await publishChapter(projectId, chapterNumber, approved);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ⑥ 主编 API =====

app.post('/api/chief/config', (req: Request, res: Response) => {
  setChiefEditorConfig(req.body);
  res.json(getChiefEditorConfig());
});

app.post('/api/chief/review-outline', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    const result = await reviewOutline(projectId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chief/review-chapter', async (req: Request, res: Response) => {
  try {
    const { projectId, chapterNumber } = req.body;
    const result = await reviewChapter(projectId, chapterNumber);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chief/final-review', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    const result = await finalReview(projectId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ===== 统计数据 API =====

app.get('/api/stats/:projectId', (req: Request, res: Response) => {
  const projectId = parseInt(req.params.projectId);
  const chapters = KB.getAllChapters(projectId);
  const outlines = KB.getOutlines(projectId);
  const project = KB.getProject(projectId);

  if (!project) return res.status(404).json({ error: '项目不存在' });

  // 总字数
  const totalWords = chapters.reduce((sum, c) => sum + (c.word_count || 0), 0);
  const targetWords = project.target_words || 300000;

  // 章节完成率
  const totalOutlines = outlines.length;
  const writtenChapters = chapters.filter(c => c.status !== 'draft' || c.word_count > 0).length;
  const editedChapters = chapters.filter(c => c.status === 'edited' || c.status === 'approved' || c.status === 'published').length;
  const approvedChapters = chapters.filter(c => c.status === 'approved' || c.status === 'published').length;
  const publishedChapters = chapters.filter(c => c.status === 'published').length;

  // 完成率环
  const completionRate = totalOutlines > 0 ? Math.round((writtenChapters / totalOutlines) * 100) : 0;

  // 每日字数（按 updated_at 分组）
  const dailyWords: Record<string, number> = {};
  for (const ch of chapters) {
    if (ch.word_count > 0 && ch.updated_at) {
      const day = ch.updated_at.slice(0, 10);
      dailyWords[day] = (dailyWords[day] || 0) + ch.word_count;
    }
  }
  const dailyTrend = Object.entries(dailyWords)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, words]) => ({ date, words }));

  // Agent 工作效率（基于编辑报告评分）
  const avgScore = 87; // 默认值，实际可从 edit_reports 计算

  // 最近活动：取章节的更新时间线
  const recentActivity = chapters
    .filter(c => c.updated_at)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 5)
    .map(c => ({
      type: 'chapter',
      chapterNumber: c.chapter_number,
      title: c.title,
      status: c.status,
      time: c.updated_at,
    }));

  res.json({
    totalWords,
    targetWords,
    completionRate,
    chapterBreakdown: {
      total: totalOutlines,
      written: writtenChapters,
      edited: editedChapters,
      approved: approvedChapters,
      published: publishedChapters,
    },
    agentEfficiency: {
      planner: 95,
      writer: writtenChapters > 0 ? Math.min(95, Math.round((writtenChapters / Math.max(totalOutlines, 1)) * 100)) : 0,
      editor: editedChapters > 0 ? Math.min(90, Math.round((editedChapters / Math.max(writtenChapters, 1)) * 100)) : 0,
      publisher: publishedChapters > 0 ? Math.min(85, Math.round((publishedChapters / Math.max(approvedChapters, 1)) * 100)) : 0,
    },
    avgScore,
    dailyTrend,
    recentActivity,
  });
});

// ===== 流水线 API =====

app.post('/api/pipeline/start', async (req: Request, res: Response) => {
  const { projectId, totalChapters, mode } = req.body;
  pipeline.init(projectId, totalChapters);
  pipeline.setMode(mode);
  await pipeline.start();
  res.json(pipeline.getState());
});

app.post('/api/pipeline/pause', (req: Request, res: Response) => {
  pipeline.pause(req.body.reason);
  res.json(pipeline.getState());
});

app.post('/api/pipeline/resume', (_req: Request, res: Response) => {
  pipeline.resume();
  res.json(pipeline.getState());
});

app.get('/api/pipeline/state', (_req: Request, res: Response) => {
  res.json(pipeline.getState());
});

app.post('/api/pipeline/confirm', (req: Request, res: Response) => {
  pipeline.userConfirm(req.body.approved, req.body.feedback);
  res.json(pipeline.getState());
});

// ===== AI 聊天 API =====

app.post('/api/chat/send', async (req: Request, res: Response) => {
  const { agent, message, attachment } = req.body;
  if (!message) return res.status(400).json({ error: '消息不能为空' });

  const agentName = agent || '全体';

  // 保存用户消息
  KB.saveChatMessage(agentName, 'user', message, attachment || '');

  try {
    // 构建上下文（最近聊天历史）
    const history = KB.getChatHistory(agentName, 20);
    const contextLines = history.map(h =>
      `[${h.role === 'user' ? '用户' : h.agent_name}]: ${h.content}`
    ).join('\n');

    // 根据选择的 Agent 构建系统提示
    const systemPrompt = buildChatSystemPrompt(agentName);

    const fullPrompt = `以下是与用户的对话历史：
${contextLines}

用户最新消息: ${message}

请作为${agentName === '全体' ? '一叶轻舟工作室 AI 助手' : agentName}回复用户。保持角色一致，简洁有帮助。`;

    const aiConfig = getAIConfig();
    const chatModel = aiConfig.provider === 'ollama' ? 'qwen2.5:7b' : (aiConfig.openaiModel || 'deepseek-chat');
    const response = await generate({
      model: chatModel,
      prompt: fullPrompt,
      system: systemPrompt,
      temperature: aiConfig.temperature || 0.7,
      max_tokens: aiConfig.maxTokens || 2048,
    });

    // 保存 AI 回复
    KB.saveChatMessage(agentName, 'assistant', response);

    res.json({ agent: agentName, message: response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chat/history', (req: Request, res: Response) => {
  const agent = req.query.agent as string | undefined;
  const limit = parseInt(req.query.limit as string || '50');
  res.json(KB.getChatHistory(agent, limit));
});

app.post('/api/chat/clear', (req: Request, res: Response) => {
  const { agent } = req.body;
  KB.clearChatHistory(agent);
  res.json({ success: true });
});
function buildChatSystemPrompt(agentName: string): string {
  const prompts: Record<string, string> = {
    '全体': '你是"一叶轻舟工作室"的全能 AI 助手，精通小说创作的各个方面：规划、写作、编辑、排版、发布。你可以回答任何与小说创作相关的问题。',
    '规划师': '你是小说规划师 🗺️，擅长构思故事梗概、设计人物设定、构建世界观和章节大纲。用结构化的方式帮助作者规划作品。',
    '作家': '你是小说作家 ✍️，擅长将大纲转化为生动的文字。你可以帮助写作、提供文笔建议、讨论情节发展。',
    '编辑': '你是编辑 🔍，专注于文本质量：错别字、语法、逻辑一致性、文风把控。客观严谨地指出问题。',
    '排版师': '你是排版设计师 🎨，熟悉 EPUB/PDF/HTML 格式排版，可建议字体、行距、标题风格和书籍设计。',
    '发布师': '你是发布专员 🚀，了解起点、番茄、晋江等平台的发布流程和规则。',
    '主编': '你是主编 👑，把控全书质量，审核大纲和章节，做出最终发布决策。',
  };
  return prompts[agentName] || `你是"一叶轻舟工作室"的 ${agentName}，帮助用户进行小说创作。保持专业、有帮助、简洁。`;
}

// ===== 用户反馈 API =====

app.post('/api/feedback', (req: Request, res: Response) => {
  const { category, content, contact } = req.body;
  if (!content) return res.status(400).json({ error: '反馈内容不能为空' });
  const item = KB.saveFeedback(category || '建议', content, contact || '');
  res.json(item);
});

app.get('/api/feedback', (_req: Request, res: Response) => {
  res.json(KB.getUnsentFeedback());
});

app.post('/api/feedback/send', async (_req: Request, res: Response) => {
  const result = await sendWeeklyFeedback();
  res.json(result);
});

app.get('/api/feedback/config', (_req: Request, res: Response) => {
  res.json(KB.getFeedbackEmailConfig());
});

app.post('/api/feedback/config', (req: Request, res: Response) => {
  const { email, smtpHost, smtpPort, smtpUser, smtpPass } = req.body;
  KB.saveFeedbackEmailConfig({ email, smtpHost, smtpPort, smtpUser, smtpPass });
  res.json({ success: true });
});

// ===== 静态文件服务（生产模式） =====
// 在开发模式 (tsx 运行) 中 dist/ 在 ../dist，编译后 (dist-server/server/) 在 ../../dist
const distPath = [
  path.join(__dirname, '..', '..', 'dist'),
  path.join(__dirname, '..', 'dist'),
].find(p => fs.existsSync(path.join(p, 'index.html'))) || path.join(__dirname, '..', 'dist');

app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ===== 启动 =====

export async function startServer(): Promise<void> {
  await initKnowledgeBase();
  initPlanner();
  initWriter();
  initEditor();
  initTypesetter();
  initPublisher();
  initChiefEditor();

  const config = getAIConfig();
  const aiAvailable = await checkProviderAvailable();
  const aiLabel = config.provider === 'ollama' ? 'Ollama' : config.provider === 'openai' ? '云端API' : '内置云服务';
  console.log(`${aiLabel} ${aiAvailable ? '可用 ✅' : '未运行 ⚠️'}`);

  // 启动反馈定时器
  startFeedbackScheduler();

  app.listen(PORT, () => {
    console.log(`🚀 一叶轻舟工作室 服务已启动: http://localhost:${PORT}`);
  });
}

// 直接启动
if (require.main === module) {
  startServer().catch(console.error);
}

// 优雅关闭
process.on('SIGINT', () => {
  closeKnowledgeBase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeKnowledgeBase();
  process.exit(0);
});
