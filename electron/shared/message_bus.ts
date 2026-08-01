/**
 * Agent 通信总线 — 所有 Agent 互相通信的中枢
 *
 * 提供消息发送、接收、订阅机制。支持：
 * - Agent 之间点对点消息
 * - 广播给所有 Agent
 * - 消息优先级（紧急消息立即处理）
 * - 消息回调机制
 */

import { sendMessage, getUnresolvedMessages, resolveMessage } from './knowledge_base';

export type MessageType = 'issue' | 'suggestion' | 'status' | 'rule_update' | 'command';
export type AgentRole = 'chief_editor' | 'planner' | 'writer' | 'editor' | 'typesetter' | 'publisher' | 'system';

export interface BusMessage {
  from: AgentRole;
  to: AgentRole | 'all';
  type: MessageType;
  title: string;
  content: string;
  projectId: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

type MessageHandler = (msg: BusMessage) => void | Promise<void>;

class MessageBus {
  private handlers: Map<AgentRole, MessageHandler[]> = new Map();
  private messageLog: BusMessage[] = [];

  /**
   * 注册消息处理器 — Agent 启动时调用
   */
  subscribe(agent: AgentRole, handler: MessageHandler): void {
    if (!this.handlers.has(agent)) {
      this.handlers.set(agent, []);
    }
    this.handlers.get(agent)!.push(handler);
  }

  /**
   * 发送消息到指定 Agent 或广播
   */
  async send(msg: BusMessage): Promise<void> {
    this.messageLog.push(msg);

    // 持久化到知识库
    try {
      sendMessage({
        project_id: msg.projectId,
        from_agent: msg.from,
        to_agent: msg.to,
        type: msg.type,
        title: msg.title,
        content: msg.content,
        resolved: false,
      });
    } catch (_) {
      // 知识库可能尚未初始化
    }

    // 路由消息
    if (msg.to === 'all') {
      // 广播：发送给所有 Agent（除了发送者）
      for (const [agent, handlers] of this.handlers) {
        if (agent !== msg.from) {
          for (const handler of handlers) {
            await this.dispatch(handler, msg);
          }
        }
      }
    } else {
      // 点对点
      const handlers = this.handlers.get(msg.to);
      if (handlers) {
        for (const handler of handlers) {
          await this.dispatch(handler, msg);
        }
      }
    }
  }

  /**
   * 发送紧急消息 — 高优先级，优先处理
   */
  async sendUrgent(
    from: AgentRole,
    to: AgentRole,
    title: string,
    content: string,
    projectId: number
  ): Promise<void> {
    await this.send({
      from, to,
      type: 'issue',
      title: `🚨 ${title}`,
      content,
      projectId,
      priority: 'urgent',
    });
  }

  /**
   * 获取指定 Agent 的未读消息
   */
  getPendingMessages(agent: AgentRole, projectId: number): BusMessage[] {
    return this.messageLog.filter(
      m => (m.to === agent || m.to === 'all') && m.projectId === projectId
    );
  }

  /**
   * 从知识库同步未解决的消息
   */
  syncFromKnowledgeBase(projectId: number, agent: AgentRole): void {
    try {
      const unresolved = getUnresolvedMessages(projectId);
      for (const msg of unresolved) {
        if ((msg.to_agent === agent || msg.to_agent === 'all') && msg.from_agent !== agent) {
          this.messageLog.push({
            from: msg.from_agent as AgentRole,
            to: msg.to_agent as AgentRole,
            type: msg.type as MessageType,
            title: msg.title,
            content: msg.content,
            projectId: msg.project_id,
            priority: msg.type === 'issue' ? 'high' : 'normal',
          });
        }
      }
    } catch (_) {}
  }

  /**
   * 标记消息为已处理
   */
  resolveMessage(id: number): void {
    try {
      resolveMessage(id);
    } catch (_) {}
  }

  /**
   * 获取通信历史
   */
  getHistory(): BusMessage[] {
    return [...this.messageLog];
  }

  /**
   * 清空日志（保留持久化数据）
   */
  clearLog(): void {
    this.messageLog = [];
  }

  private async dispatch(handler: MessageHandler, msg: BusMessage): Promise<void> {
    try {
      await handler(msg);
    } catch (err) {
      console.error(`[MessageBus] Handler error for ${msg.to}:`, err);
    }
  }
}

// 全局单例
export const messageBus = new MessageBus();
