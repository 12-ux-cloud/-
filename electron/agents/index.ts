/**
 * Agent 统一导出和初始化
 */

export { setPlannerConfig, getPlannerConfig, planNovel, initPlanner } from './planner';
export { setWriterConfig, getWriterConfig, writeChapter, initWriter } from './writer';
export { setEditorConfig, getEditorConfig, editChapter, initEditor } from './editor';
export { setTypesetterConfig, getTypesetterConfig, typesetBook, initTypesetter } from './typesetter';
export { setPublisherConfig, getPublisherConfig, publishChapter, initPublisher } from './publisher';
export { setChiefEditorConfig, getChiefEditorConfig, reviewOutline, reviewChapter, finalReview, initChiefEditor } from './chief_editor';

import { initPlanner } from './planner';
import { initWriter } from './writer';
import { initEditor } from './editor';
import { initTypesetter } from './typesetter';
import { initPublisher } from './publisher';
import { initChiefEditor } from './chief_editor';

/**
 * 初始化所有 Agent
 */
export function initAllAgents(): void {
  initPlanner();
  initWriter();
  initEditor();
  initTypesetter();
  initPublisher();
  initChiefEditor();
  console.log('✅ All 6 agents initialized');
}
