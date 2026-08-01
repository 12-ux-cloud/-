/**
 * 反馈邮件定时器 — 每周自动汇总反馈并发送到用户邮箱
 *
 * 使用 node-schedule 或内置 setInterval 实现。
 * 默认每周一早上 9:00 发送。
 */

import * as KB from './knowledge_base';

let timer: ReturnType<typeof setInterval> | null = null;
let nodemailer: any = null;

/** 尝试动态加载 nodemailer */
async function getMailer(): Promise<any> {
  if (nodemailer) return nodemailer;
  try {
    nodemailer = require('nodemailer');
    return nodemailer;
  } catch {
    return null;
  }
}

/** 每周发送汇总邮件 */
export async function sendWeeklyFeedback(): Promise<{
  sent: boolean;
  count: number;
  error?: string;
}> {
  const items = KB.getUnsentFeedback();
  if (items.length === 0) {
    console.log('[FeedbackScheduler] 无待发送反馈');
    return { sent: true, count: 0 };
  }

  const config = KB.getFeedbackEmailConfig();
  if (!config.email) {
    return { sent: false, count: items.length, error: '未配置目标邮箱' };
  }

  // 构建邮件内容
  const lines = [`## 一叶轻舟工作室 — 用户反馈汇总`, '', `共 ${items.length} 条反馈：`, ''];
  for (const item of items) {
    lines.push(`---`);
    lines.push(`**分类**: ${item.category}`);
    lines.push(`**时间**: ${item.created_at}`);
    lines.push(`**内容**: ${item.content}`);
    if (item.contact) lines.push(`**联系方式**: ${item.contact}`);
    lines.push('');
  }

  const htmlBody = lines.join('<br/>\n').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 发送邮件
  const mailer = await getMailer();
  if (!mailer) {
    // No nodemailer — just mark as "sent" so feedback accumulates in the UI for manual export
    console.log('[FeedbackScheduler] nodemailer 未安装，反馈已保留在数据库');
    return { sent: false, count: items.length, error: 'nodemailer 未安装，请运行 npm install nodemailer' };
  }

  try {
    const transporter = mailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });

    await transporter.sendMail({
      from: config.smtpUser,
      to: config.email,
      subject: `【一叶轻舟工作室】用户反馈汇总 (${items.length}条) - ${new Date().toLocaleDateString('zh-CN')}`,
      html: htmlBody,
    });

    // 标记为已发送
    KB.markFeedbackSent(items.map(i => i.id));

    console.log(`[FeedbackScheduler] 已发送 ${items.length} 条反馈到 ${config.email}`);
    return { sent: true, count: items.length };
  } catch (err: any) {
    console.error('[FeedbackScheduler] 发送失败:', err.message);
    return { sent: false, count: items.length, error: err.message };
  }
}

/** 启动每周定时任务 */
export function startFeedbackScheduler(): void {
  if (timer) return;

  // 计算到下一个周一 9:00 的毫秒数
  const now = new Date();
  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7; // 0=Sunday → 7
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(9, 7, 0, 0); // 9:07 (offset to avoid :00 spike)

  const initialDelay = nextMonday.getTime() - now.getTime();

  console.log(`[FeedbackScheduler] 首次发送时间: ${nextMonday.toLocaleString('zh-CN')} (${Math.round(initialDelay / 3600000)}小时后)`);

  // 立即先跑一次（如果有未发送反馈，但可能还没配置邮箱）
  sendWeeklyFeedback().catch(() => {});

  // 7 天 = 604800000 毫秒
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // 先用 setTimeout 到第一个周一 9:00，之后每 7 天一次
  setTimeout(() => {
    sendWeeklyFeedback().catch(() => {});
    timer = setInterval(() => {
      sendWeeklyFeedback().catch(() => {});
    }, WEEK_MS);
  }, initialDelay);
}

/** 停止定时任务 */
export function stopFeedbackScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
