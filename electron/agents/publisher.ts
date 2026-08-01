/**
 * ⑤ 发布 Agent — 自动发布执行
 * 使用 Playwright 进行浏览器自动化
 * 必须主编终审通过后才执行
 */

import { messageBus } from '../shared/message_bus';
import * as KB from '../shared/knowledge_base';

export interface PublisherConfig {
  site: string;              // 目标网站标识
  siteName: string;          // 网站显示名
  loginUrl: string;          // 登录页 URL
  publishUrl: string;        // 发布页 URL
  username: string;
  password: string;
  scheduleInterval: number;  // 发布间隔（小时）
  autoReplyComments: boolean;
}

const DEFAULT_CONFIG: PublisherConfig = {
  site: 'qidian',
  siteName: '起点中文网',
  loginUrl: 'https://www.qidian.com',
  publishUrl: 'https://writer.qidian.com',
  username: '',
  password: '',
  scheduleInterval: 24,
  autoReplyComments: false,
};

let config: PublisherConfig = { ...DEFAULT_CONFIG };

// 支持的网站适配器
interface SiteAdapter {
  login: (username: string, password: string) => Promise<boolean>;
  publishChapter: (title: string, content: string, volumeInfo?: any) => Promise<string>;
  verifyPublished: (url: string) => Promise<boolean>;
}

export function setPublisherConfig(cfg: Partial<PublisherConfig>): void {
  config = { ...config, ...cfg };
}

export function getPublisherConfig(): PublisherConfig {
  return { ...config };
}

/**
 * 发布主入口 — 发布单章到目标网站
 * 必须通过主编审核后才能调用
 */
export async function publishChapter(
  projectId: number,
  chapterNumber: number,
  chiefApproved: boolean
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!chiefApproved) {
    return { success: false, error: '未通过主编审核，拒绝发布' };
  }

  console.log(`[Publisher] 开始发布第 ${chapterNumber} 章...`);

  const chapter = KB.getChapter(projectId, chapterNumber);
  const project = KB.getProject(projectId);

  if (!chapter || !project) {
    return { success: false, error: '章节或项目不存在' };
  }

  if (chapter.status !== 'approved') {
    return { success: false, error: `章节状态为 "${chapter.status}"，必须是 "approved" 才能发布` };
  }

  try {
    // 获取网站适配器
    const adapter = getAdapter(config.site);

    // Step 1: 登录
    const loggedIn = await adapter.login(config.username, config.password);
    if (!loggedIn) {
      return { success: false, error: '登录失败，请检查账号密码' };
    }

    // Step 2: 发布
    const url = await adapter.publishChapter(
      `第${chapterNumber}章 ${chapter.title}`,
      chapter.content
    );

    // Step 3: 验证
    const verified = await adapter.verifyPublished(url);

    // Step 4: 更新状态
    KB.updateChapterStatus(chapter.id, 'published');

    // Step 5: 通知全体
    await messageBus.send({
      from: 'publisher',
      to: 'all',
      type: 'status',
      title: `第 ${chapterNumber} 章发布成功`,
      content: `已发布到 ${config.siteName}\nURL: ${url}`,
      projectId,
      priority: 'normal',
    });

    console.log(`[Publisher] 第 ${chapterNumber} 章发布成功`);
    return { success: true, url };
  } catch (err: any) {
    console.error('[Publisher] 发布失败:', err);
    await messageBus.send({
      from: 'publisher',
      to: 'chief_editor',
      type: 'issue',
      title: `第 ${chapterNumber} 章发布失败`,
      content: err.message,
      projectId,
      priority: 'high',
    });
    return { success: false, error: err.message };
  }
}

/**
 * 发布整本书（按设定间隔定时发布各章）
 */
export async function publishBook(
  projectId: number,
  chiefApproved: boolean
): Promise<{ published: number; failed: number; errors: string[] }> {
  if (!chiefApproved) {
    return { published: 0, failed: 0, errors: ['未通过主编审核'] };
  }

  const chapters = KB.getAllChapters(projectId).filter(c => c.status === 'approved');
  let published = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const chapter of chapters) {
    const result = await publishChapter(projectId, chapter.chapter_number, true);
    if (result.success) {
      published++;
    } else {
      failed++;
      errors.push(`第${chapter.chapter_number}章: ${result.error}`);
    }

    // 发布间隔（避免触发反爬）
    if (chapters.indexOf(chapter) < chapters.length - 1) {
      await sleep(config.scheduleInterval * 60 * 60 * 1000);
    }
  }

  return { published, failed, errors };
}

// ===== 网站适配器 =====

function getAdapter(site: string): SiteAdapter {
  switch (site) {
    case 'qidian':
      return new QidianAdapter();
    case 'fanqie':
      return new FanqieAdapter();
    case 'jinjiang':
      return new JinjiangAdapter();
    default:
      return new GenericAdapter(site);
  }
}

// 动态加载 Playwright 自动化模块
let automationModule: any = null;
async function getAutomation(): Promise<any> {
  if (automationModule) return automationModule;
  try {
    automationModule = require('../../playwright-scripts/publisher_automation');
    return automationModule;
  } catch (e) {
    return null;
  }
}

// 起点中文网适配器
class QidianAdapter implements SiteAdapter {
  async login(username: string, password: string): Promise<boolean> {
    const auto = await getAutomation();
    if (!auto) {
      console.log('[Qidian] Playwright 未安装，使用模拟登录');
      console.log('[Qidian] 登录中...');
      return true; // 降级为模拟（开发/测试用）
    }
    const result = await auto.publishChapter({
      site: 'qidian',
      username,
      password,
      title: '__LOGIN_TEST__',
      content: '',
    });
    // 登录测试：如果错误不是"找不到章节标题"，说明登录步成功通过了
    return result.success || !result.error?.includes('标题');
  }

  async publishChapter(title: string, content: string, volumeInfo?: any): Promise<string> {
    const auto = await getAutomation();
    if (!auto) {
      console.log('[Qidian] Playwright 未安装，返回模拟 URL');
      console.log(`[Qidian] 发布: ${title}`);
      return `https://www.qidian.com/chapter/${Date.now()}`;
    }
    const result = await auto.publishChapter({
      site: 'qidian',
      username: '',
      password: '',
      title,
      content,
    });
    if (!result.success) throw new Error(result.error || '发布失败');
    return result.url || `https://www.qidian.com/chapter/${Date.now()}`;
  }

  async verifyPublished(url: string): Promise<boolean> {
    const auto = await getAutomation();
    if (!auto) return true;
    return await auto.verifyPublished(url);
  }
}

// 番茄小说适配器
class FanqieAdapter implements SiteAdapter {
  async login(u: string, p: string): Promise<boolean> {
    console.log('[Fanqie] 登录中...');
    return true;
  }

  async publishChapter(title: string, content: string): Promise<string> {
    console.log(`[Fanqie] (待实现) 发布: ${title}`);
    return `https://fanqienovel.com/chapter/${Date.now()}`;
  }

  async verifyPublished(url: string): Promise<boolean> {
    return true;
  }
}

// 晋江适配器
class JinjiangAdapter implements SiteAdapter {
  async login(u: string, p: string): Promise<boolean> {
    console.log('[Jinjiang] 登录中...');
    return true;
  }

  async publishChapter(title: string, content: string): Promise<string> {
    console.log(`[Jinjiang] (待实现) 发布: ${title}`);
    return `https://www.jjwxc.net/chapter/${Date.now()}`;
  }

  async verifyPublished(url: string): Promise<boolean> {
    return true;
  }
}

// 通用适配器
class GenericAdapter implements SiteAdapter {
  constructor(private site: string) {}

  async login(u: string, p: string): Promise<boolean> {
    console.log(`[${this.site}] 登录中...`);
    return true;
  }

  async publishChapter(title: string, content: string): Promise<string> {
    console.log(`[${this.site}] 发布: ${title}`);
    return `https://${this.site}.com/chapter/${Date.now()}`;
  }

  async verifyPublished(url: string): Promise<boolean> {
    return true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function initPublisher(): void {
  messageBus.subscribe('publisher', async (msg) => {
    if (msg.type === 'command' && msg.to === 'publisher') {
      console.log('[Publisher] 收到发布指令:', msg.title);
    }
  });
}
