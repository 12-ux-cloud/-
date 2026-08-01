/**
 * 发布自动化 — Playwright 脚本
 *
 * 支持起点中文网、番茄小说、晋江文学城的自动登录、发布、验证。
 * 依赖: playwright (npm install playwright)
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';

// ===== 配置 =====

export interface PublishTask {
  site: 'qidian' | 'fanqie' | 'jinjiang';
  username: string;
  password: string;
  title: string;
  content: string;
  volumeName?: string;
  tags?: string[];
  summary?: string;
}

export interface PublishResult {
  success: boolean;
  url?: string;
  error?: string;
  screenshot?: Buffer;
}

// ===== 网站配置 =====

const SITE_CONFIG = {
  qidian: {
    name: '起点中文网',
    loginUrl: 'https://www.qidian.com',
    publishUrl: 'https://writer.qidian.com',
    selectors: {
      loginBtn: 'a:has-text("登录")',
      username: 'input[name="username"], input[placeholder*="手机"], input[placeholder*="账号"]',
      password: 'input[type="password"]',
      submitBtn: 'button:has-text("登录"), input[type="submit"]',
      loginSuccess: '.user-info, .user-name, .avatar, [class*="user"]',
    },
  },
  fanqie: {
    name: '番茄小说',
    loginUrl: 'https://writer.fanqienovel.com',
    publishUrl: 'https://writer.fanqienovel.com',
    selectors: {
      loginBtn: 'a:has-text("登录"), button:has-text("登录")',
      username: 'input[name="mobile"], input[placeholder*="手机"]',
      password: 'input[type="password"]',
      submitBtn: 'button:has-text("登录")',
      loginSuccess: '.user-name, .avatar, [class*="user"]',
    },
  },
  jinjiang: {
    name: '晋江文学城',
    loginUrl: 'https://www.jjwxc.net',
    publishUrl: 'https://www.jjwxc.net/user',
    selectors: {
      loginBtn: 'a:has-text("登录")',
      username: 'input[name="loginname"], input[name="email"]',
      password: 'input[type="password"]',
      submitBtn: 'input[type="submit"], button:has-text("登录")',
      loginSuccess: '.username, .userinfo, [class*="user"]',
    },
  },
};

// ===== 浏览器管理 =====

let browser: Browser | null = null;
let context: BrowserContext | null = null;

async function getBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'zh-CN',
    });
  }
  return { browser, context: context! };
}

async function closeBrowser(): Promise<void> {
  if (context) { await context.close(); context = null; }
  if (browser) { await browser.close(); browser = null; }
}

// ===== 发布主入口 =====

/**
 * 执行发布任务
 */
export async function publishChapter(task: PublishTask): Promise<PublishResult> {
  console.log(`[Publisher] 开始发布到 ${SITE_CONFIG[task.site]?.name || task.site}...`);

  try {
    const { context } = await getBrowser();
    const page = await context.newPage();

    try {
      // Step 1: 登录
      const loginResult = await loginToSite(page, task.site, task.username, task.password);
      if (!loginResult.success) {
        return loginResult;
      }

      // Step 2: 导航到发布页
      await page.goto(SITE_CONFIG[task.site].publishUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Step 3: 填写并提交章节
      const publishResult = await submitChapter(page, task);
      return publishResult;
    } finally {
      await page.close();
    }
  } catch (err: any) {
    console.error('[Publisher] 发布失败:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * 验证发布结果
 */
export async function verifyPublished(url: string): Promise<boolean> {
  try {
    const { context } = await getBrowser();
    const page = await context.newPage();
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      return response !== null && response.status() === 200;
    } finally {
      await page.close();
    }
  } catch {
    return false;
  }
}

// ===== 网站登录 =====

async function loginToSite(
  page: Page,
  site: string,
  username: string,
  password: string
): Promise<PublishResult> {
  const config = SITE_CONFIG[site as keyof typeof SITE_CONFIG];
  if (!config) return { success: false, error: `不支持的网站: ${site}` };

  console.log(`[Publisher] 登录 ${config.name}...`);

  try {
    await page.goto(config.loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // 点击登录按钮（如果首页需要）
    const loginBtn = page.locator(config.selectors.loginBtn).first();
    if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginBtn.click();
      await page.waitForTimeout(2000);
    }

    // 等待登录表单出现
    await page.waitForTimeout(1000);

    // 填写用户名
    const usernameInput = page.locator(config.selectors.username).first();
    if (await usernameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await usernameInput.click();
      await usernameInput.fill(username);
    } else {
      // 尝试 iframe 中的表单
      const frames = page.frames();
      for (const frame of frames) {
        const input = frame.locator(config.selectors.username).first();
        if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
          await input.click();
          await input.fill(username);
          break;
        }
      }
    }

    // 填写密码
    const passwordInput = page.locator(config.selectors.password).first();
    if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passwordInput.click();
      await passwordInput.fill(password);
    }

    // 提交
    const submitBtn = page.locator(config.selectors.submitBtn).first();
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
    }

    // 等待登录完成
    await page.waitForTimeout(3000);

    // 检查是否登录成功
    const successEl = page.locator(config.selectors.loginSuccess).first();
    const loggedIn = await successEl.isVisible({ timeout: 5000 }).catch(() => false);

    if (loggedIn) {
      console.log(`[Publisher] ${config.name} 登录成功`);
      return { success: true };
    }

    // 如果没找到成功标记，检查是否还在登录页
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      return { success: false, error: `${config.name} 登录失败：请检查用户名和密码` };
    }

    // 不确定状态，但可能已登录
    console.log(`[Publisher] ${config.name} 登录状态不确定，尝试继续...`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: `登录 ${config.name} 失败: ${err.message}` };
  }
}

// ===== 章节提交 =====

async function submitChapter(page: Page, task: PublishTask): Promise<PublishResult> {
  console.log('[Publisher] 填写章节内容...');

  try {
    // 常见的章节发布表单选择器
    const titleSelectors = [
      'input[name="title"]',
      'input[name="chapterName"]',
      'input[placeholder*="章节标题"]',
      'input[placeholder*="标题"]',
      '#title',
      '#chapterTitle',
    ];

    const contentSelectors = [
      'textarea[name="content"]',
      'textarea[name="chapterContent"]',
      'div[contenteditable="true"]',
      '#content',
      '#chapterContent',
      '.editor-body',
      '.ql-editor',
    ];

    const submitSelectors = [
      'button:has-text("发布")',
      'button:has-text("提交")',
      'button:has-text("保存")',
      'input[type="submit"]',
      'button[type="submit"]',
    ];

    // 填写标题
    let titleFound = false;
    for (const sel of titleSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click();
        await el.fill(task.title);
        titleFound = true;
        break;
      }
    }

    if (!titleFound) {
      // 截图用于调试
      const screenshot = await page.screenshot({ type: 'png' });
      return {
        success: false,
        error: '找不到章节标题输入框，网站可能已更新',
        screenshot,
      };
    }

    // 填写内容
    let contentFound = false;
    for (const sel of contentSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click();
        // 分批次填入（避免超长内容导致卡顿）
        const chunkSize = 5000;
        for (let i = 0; i < task.content.length; i += chunkSize) {
          await el.type(task.content.slice(i, i + chunkSize), { delay: 1 });
        }
        contentFound = true;
        break;
      }
    }

    if (!contentFound) {
      const screenshot = await page.screenshot({ type: 'png' });
      return {
        success: false,
        error: '找不到章节内容输入框，网站可能已更新',
        screenshot,
      };
    }

    // 提交
    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        submitted = true;
        break;
      }
    }

    if (!submitted) {
      return { success: false, error: '找不到发布按钮' };
    }

    // 等待结果
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    console.log(`[Publisher] 发布完成，最终 URL: ${finalUrl}`);

    return {
      success: true,
      url: finalUrl,
    };
  } catch (err: any) {
    return { success: false, error: `发布失败: ${err.message}` };
  }
}

// ===== 导出清理 =====

export { closeBrowser };
