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
const APP_VERSION = '1.0.1';
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/12-ux-cloud/-/main/release/latest.json';

// 知识库 & Agent 模块
import { initKnowledgeBase, closeKnowledgeBase } from '../electron/shared/knowledge_base';
import { messageBus } from '../electron/shared/message_bus';
import { pipeline } from '../electron/shared/pipeline';
import { checkOllamaAvailable, listModels } from '../electron/shared/ollama';

import {
  setPlannerConfig, getPlannerConfig, planNovel, initPlanner,
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
    const ollamaAvailable = await checkOllamaAvailable();
    results.ollama = ollamaAvailable
      ? { status: 'ok' }
      : { status: 'error', message: 'Ollama 未运行' };
  } catch (e: any) {
    results.ollama = { status: 'error', message: e.message };
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
  const { name, theme, genre, targetWords } = req.body;
  const project = KB.createProject(name, theme, genre, targetWords);
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

  const ollamaAvailable = await checkOllamaAvailable();
  console.log(`Ollama ${ollamaAvailable ? '可用 ✅' : '未运行 ⚠️'}`);

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
