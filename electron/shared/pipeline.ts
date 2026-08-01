/**
 * 全自动编排引擎 — 管理 6 个 Agent 的自动化流水线
 *
 * 支持三种模式：
 * - full_auto: 全自动，主编审核放行，一路绿灯
 * - semi_auto: 半自动，每个环节完成后暂停，需用户确认
 * - manual: 用户终审，主编只提建议，用户决策
 */

import { messageBus } from './message_bus';
import { EventEmitter } from 'events';

export type PipelineMode = 'full_auto' | 'semi_auto' | 'manual';
export type PipelineStage = 'planning' | 'writing' | 'editing' | 'typesetting' | 'publishing' | 'review';
export type PipelineStatus = 'idle' | 'running' | 'paused' | 'waiting_review' | 'completed' | 'error';

export interface PipelineState {
  mode: PipelineMode;
  status: PipelineStatus;
  currentStage: PipelineStage;
  currentChapter: number;
  totalChapters: number;
  projectId: number;
  errors: string[];
  stageHistory: { stage: PipelineStage; status: string; timestamp: string }[];
}

export class PipelineEngine extends EventEmitter {
  private state: PipelineState;
  private stageHandlers: Map<PipelineStage, (state: PipelineState) => Promise<boolean>> = new Map();

  constructor() {
    super();
    this.state = {
      mode: 'semi_auto',
      status: 'idle',
      currentStage: 'planning',
      currentChapter: 0,
      totalChapters: 0,
      projectId: 0,
      errors: [],
      stageHistory: [],
    };
  }

  /**
   * 注册阶段处理器 — 每个 Agent 注册自己的处理函数
   */
  registerStage(stage: PipelineStage, handler: (state: PipelineState) => Promise<boolean>): void {
    this.stageHandlers.set(stage, handler);
  }

  /**
   * 设置流水线模式
   */
  setMode(mode: PipelineMode): void {
    this.state.mode = mode;
    this.emit('mode_changed', mode);
  }

  /**
   * 初始化流水线
   */
  init(projectId: number, totalChapters: number): void {
    this.state.projectId = projectId;
    this.state.totalChapters = totalChapters;
    this.state.currentStage = 'planning';
    this.state.currentChapter = 0;
    this.state.status = 'idle';
    this.state.errors = [];
    this.state.stageHistory = [];
    this.emit('initialized', this.state);
  }

  /**
   * 启动全自动流水线
   */
  async start(): Promise<void> {
    if (this.state.status === 'running') {
      this.emit('warning', '流水线已在运行中');
      return;
    }

    this.state.status = 'running';
    this.emit('started', this.state);

    // 发送启动通知给主编
    await messageBus.send({
      from: 'system',
      to: 'chief_editor',
      type: 'status',
      title: '流水线已启动',
      content: `项目 ${this.state.projectId} 开始全自动运行，模式: ${this.state.mode}`,
      projectId: this.state.projectId,
      priority: 'normal',
    });

    try {
      await this.runStages();
    } catch (err: any) {
      this.state.status = 'error';
      this.state.errors.push(err.message);
      this.emit('error', err);
    }
  }

  /**
   * 暂停流水线
   */
  pause(reason: string): void {
    this.state.status = 'paused';
    this.emit('paused', reason);
    messageBus.send({
      from: 'system',
      to: 'all',
      type: 'status',
      title: '流水线已暂停',
      content: reason,
      projectId: this.state.projectId,
      priority: 'high',
    });
  }

  /**
   * 恢复流水线
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.emit('resumed', this.state);
      this.runStages();
    }
  }

  /**
   * 用户确认当前阶段（半自动模式）
   */
  userConfirm(approved: boolean, feedback?: string): void {
    if (this.state.status === 'waiting_review') {
      if (approved) {
        this.emit('review_approved', this.state.currentStage);
        this.state.status = 'running';
        this.advanceToNextStage();
      } else {
        this.emit('review_rejected', feedback);
        // 通知主编用户驳回
        messageBus.send({
          from: 'system',
          to: 'chief_editor',
          type: 'command',
          title: '用户驳回',
          content: feedback || '用户拒绝了当前阶段结果',
          projectId: this.state.projectId,
          priority: 'high',
        });
      }
    }
  }

  /**
   * 获取当前状态
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  // ===== 内部方法 =====

  private async runStages(): Promise<void> {
    const stages: PipelineStage[] = ['planning', 'writing', 'editing', 'typesetting', 'publishing'];

    for (const stage of stages) {
      if (this.state.status === 'paused') return;

      this.state.currentStage = stage;
      this.emit('stage_started', stage);

      const handler = this.stageHandlers.get(stage);
      if (!handler) {
        this.emit('warning', `阶段 ${stage} 未注册处理器`);
        continue;
      }

      const success = await handler(this.state);
      this.logStage(stage, success ? 'completed' : 'failed');

      if (!success) {
        this.state.errors.push(`阶段 ${stage} 执行失败`);
        if (this.state.mode === 'full_auto') {
          // 全自动模式：通知主编裁决
          await this.requestChiefReview(stage);
        } else {
          // 半自动/手动：等待用户确认
          this.state.status = 'waiting_review';
          this.emit('waiting_review', stage);
          return;
        }
      }

      this.emit('stage_completed', stage);
    }

    this.state.status = 'completed';
    this.emit('completed', this.state);
  }

  private async requestChiefReview(stage: PipelineStage): Promise<void> {
    await messageBus.sendUrgent(
      'system',
      'chief_editor',
      `阶段 "${stage}" 需要审核`,
      `阶段 ${stage} 执行完成，主编需要审核结果`,
      this.state.projectId
    );
  }

  private advanceToNextStage(): void {
    // 继续执行后续阶段
    this.runStages();
  }

  private logStage(stage: PipelineStage, status: string): void {
    this.state.stageHistory.push({
      stage,
      status,
      timestamp: new Date().toISOString(),
    });
  }
}

// 全局单例
export const pipeline = new PipelineEngine();
