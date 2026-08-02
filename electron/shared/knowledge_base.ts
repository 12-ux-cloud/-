/**
 * 共享知识库 — 所有 Agent 的信息中枢 (sql.js 实现)
 *
 * 存储项目信息、世界观、人物设定、章节、校对报告、排版文件、
 * 发布状态、审核意见、AI 讨论记录等。所有 Agent 通过此库共享信息。
 *
 * 使用 sql.js (纯 WASM 实现，无需原生编译)
 */

import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

let db: SqlJsDatabase;
let SQL: SqlJsStatic;
let dbPath: string;

export interface NovelProject {
  id: number;
  name: string;
  theme: string;
  genre: string;
  target_words: number;
  created_at: string;
  updated_at: string;
  status: 'planning' | 'writing' | 'editing' | 'completed';
  /** 分批生成模式: 'full' = 一次全部, 'batch' = 分批生成 */
  batch_mode: string;
  /** 每批生成章节数（默认 5） */
  batch_size: number;
  /** 当前批次编号（从 1 开始） */
  current_batch: number;
  /** 是否支持续集：0/1 */
  has_sequel: number;
}

export interface CharacterCard {
  id: number;
  project_id: number;
  name: string;
  role: string;
  gender: string;
  age: string;
  personality: string;
  appearance: string;
  background: string;
  motivation: string;
  arc: string;
  relationships: string;
  updated_at: string;
}

export interface ChapterOutline {
  id: number;
  project_id: number;
  chapter_number: number;
  title: string;
  summary: string;
  key_events: string;
  character_focus: string;
  status: 'pending' | 'writing' | 'written' | 'edited' | 'approved';
}

export interface ChapterContent {
  id: number;
  project_id: number;
  chapter_number: number;
  title: string;
  content: string;
  word_count: number;
  version: number;
  status: 'draft' | 'edited' | 'approved' | 'published';
  created_at: string;
  updated_at: string;
}

export interface EditReport {
  id: number;
  chapter_id: number;
  issues: string;
  fixed_content: string;
  score: number;
  report: string;
  created_at: string;
}

export interface AgentMessage {
  id: number;
  project_id: number;
  from_agent: string;
  to_agent: string;
  type: 'issue' | 'suggestion' | 'status' | 'rule_update' | 'command';
  title: string;
  content: string;
  resolved: boolean;
  created_at: string;
}

export interface WorldSetting {
  id: number;
  project_id: number;
  category: string;
  content: string;
  updated_at: string;
}

// ===== 持久化辅助 =====

function saveDb(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// ===== 查询辅助函数 =====

function queryOne<T>(sql: string, params: any[] = []): T | undefined {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as T;
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  } catch (e) {
    console.error('queryOne error:', e, sql);
    return undefined;
  }
}

function queryAll<T>(sql: string, params: any[] = []): T[] {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as T);
    }
    stmt.free();
    return rows;
  } catch (e) {
    console.error('queryAll error:', e, sql);
    return [];
  }
}

function execute(sql: string, params: any[] = []): number {
  try {
    db.run(sql, params);
    // 返回 lastInsertRowId
    const result = db.exec('SELECT last_insert_rowid() as id');
    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number;
    }
    return 0;
  } catch (e) {
    console.error('execute error:', e, sql);
    throw e;
  }
}

function executeMany(sql: string): void {
  try {
    db.run(sql);
  } catch (e) {
    console.error('executeMany error:', e);
    throw e;
  }
}

// ===== 数据路径 =====

const APP_NAME = '一叶轻舟工作室';
const DB_FILENAME = 'studio.db';

/** 获取应用数据目录（Windows: %APPDATA%/一叶轻舟工作室） */
export function getAppDataPath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, APP_NAME);
  }
  return path.join(os.homedir(), '.yiyeqingzhou-studio');
}

/** 获取数据库文件完整路径 */
export function getDatabasePath(): string {
  return path.join(getAppDataPath(), 'data', DB_FILENAME);
}

// ===== 初始化 =====

export async function initKnowledgeBase(): Promise<void> {
  SQL = await initSqlJs();
  dbPath = getDatabasePath();

  // 确保数据目录存在
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 从磁盘加载已有数据库，或创建新库
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createTables();
  migrateDatabase();
  saveDb();
  console.log(`📁 数据库位置: ${dbPath}`);
}

/**
 * 数据库迁移 — 为旧版本数据库添加新列
 */
function migrateDatabase(): void {
  try {
    const cols = db.exec("PRAGMA table_info(projects)");
    if (cols.length > 0) {
      const columnNames = cols[0].values.map(v => v[1] as string);
      if (!columnNames.includes('batch_mode')) {
        db.run("ALTER TABLE projects ADD COLUMN batch_mode TEXT DEFAULT 'full'");
      }
      if (!columnNames.includes('batch_size')) {
        db.run('ALTER TABLE projects ADD COLUMN batch_size INTEGER DEFAULT 5');
      }
      if (!columnNames.includes('current_batch')) {
        db.run('ALTER TABLE projects ADD COLUMN current_batch INTEGER DEFAULT 1');
      }
      if (!columnNames.includes('has_sequel')) {
        db.run('ALTER TABLE projects ADD COLUMN has_sequel INTEGER DEFAULT 0');
      }
    }
  } catch (e) {
    console.error('[KB] Migration error:', e);
  }
}

function createTables(): void {
  executeMany(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      theme TEXT DEFAULT '',
      genre TEXT DEFAULT '玄幻',
      target_words INTEGER DEFAULT 300000,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      status TEXT DEFAULT 'planning',
      batch_mode TEXT DEFAULT 'full',
      batch_size INTEGER DEFAULT 5,
      current_batch INTEGER DEFAULT 1,
      has_sequel INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS world_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      content TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS character_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT '配角',
      gender TEXT DEFAULT '',
      age TEXT DEFAULT '',
      personality TEXT DEFAULT '',
      appearance TEXT DEFAULT '',
      background TEXT DEFAULT '',
      motivation TEXT DEFAULT '',
      arc TEXT DEFAULT '',
      relationships TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_outlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      chapter_number INTEGER NOT NULL,
      title TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      key_events TEXT DEFAULT '',
      character_focus TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapter_contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      chapter_number INTEGER NOT NULL,
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      word_count INTEGER DEFAULT 0,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS edit_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      issues TEXT DEFAULT '[]',
      fixed_content TEXT DEFAULT '',
      score INTEGER DEFAULT 100,
      report TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (chapter_id) REFERENCES chapter_contents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL DEFAULT '全体',
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attachment TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT DEFAULT '建议',
      content TEXT NOT NULL,
      contact TEXT DEFAULT '',
      sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      type TEXT DEFAULT 'status',
      title TEXT DEFAULT '',
      content TEXT DEFAULT '',
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);
  saveDb();
}

// ===== 项目操作 =====

export function createProject(name: string, theme: string, genre: string, targetWords: number, batchMode?: string, batchSize?: number, hasSequel?: number): NovelProject {
  const id = execute(
    'INSERT INTO projects (name, theme, genre, target_words, batch_mode, batch_size, has_sequel) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, theme, genre, targetWords, batchMode || 'full', batchSize || 5, hasSequel || 0]
  );
  saveDb();
  return getProject(id)!;
}

export function getProject(id: number): NovelProject | undefined {
  return queryOne<NovelProject>('SELECT * FROM projects WHERE id = ?', [id]);
}

export function getAllProjects(): NovelProject[] {
  return queryAll<NovelProject>('SELECT * FROM projects ORDER BY updated_at DESC');
}

export function updateProjectStatus(id: number, status: string): void {
  execute("UPDATE projects SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [status, id]);
  saveDb();
}

/** 更新项目配置（分批模式、续集等） */
export function updateProject(id: number, updates: Partial<NovelProject>): void {
  const fields = Object.keys(updates).filter(k =>
    k !== 'id' && k !== 'created_at' && k !== 'updated_at'
  );
  if (fields.length === 0) return;
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => (updates as any)[f]);
  execute(
    `UPDATE projects SET ${setClause}, updated_at = datetime('now', 'localtime') WHERE id = ?`,
    [...values, id]
  );
  saveDb();
}

/** 推进当前批次（用于分批模式） */
export function advanceBatch(projectId: number): NovelProject {
  execute(
    "UPDATE projects SET current_batch = current_batch + 1, updated_at = datetime('now', 'localtime') WHERE id = ?",
    [projectId]
  );
  saveDb();
  return getProject(projectId)!;
}

/** 获取项目当前批次的起止章节号 */
export function getBatchRange(project: NovelProject): { startChapter: number; endChapter: number } {
  if (project.batch_mode === 'full' || !project.batch_size) {
    return { startChapter: 1, endChapter: project.target_words > 0 ? 999 : 30 };
  }
  const startChapter = (project.current_batch - 1) * project.batch_size + 1;
  const endChapter = project.current_batch * project.batch_size;
  return { startChapter, endChapter };
}

// ===== 世界观操作 =====

export function setWorldSetting(projectId: number, category: string, content: string): void {
  const existing = queryOne<{ id: number }>(
    'SELECT id FROM world_settings WHERE project_id = ? AND category = ?',
    [projectId, category]
  );
  if (existing) {
    execute("UPDATE world_settings SET content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?",
      [content, existing.id]);
  } else {
    execute('INSERT INTO world_settings (project_id, category, content) VALUES (?, ?, ?)',
      [projectId, category, content]);
  }
  saveDb();
}

export function getWorldSettings(projectId: number): WorldSetting[] {
  return queryAll<WorldSetting>('SELECT * FROM world_settings WHERE project_id = ?', [projectId]);
}

// ===== 人物卡操作 =====

export function saveCharacter(character: Omit<CharacterCard, 'id' | 'updated_at'>): CharacterCard {
  const id = execute(
    `INSERT INTO character_cards (project_id, name, role, gender, age, personality, appearance, background, motivation, arc, relationships)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [character.project_id, character.name, character.role, character.gender,
      character.age, character.personality, character.appearance, character.background,
      character.motivation, character.arc, character.relationships]
  );
  saveDb();
  return queryOne<CharacterCard>('SELECT * FROM character_cards WHERE id = ?', [id])!;
}

export function updateCharacter(id: number, updates: Partial<CharacterCard>): void {
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'updated_at');
  if (fields.length === 0) return;
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => (updates as any)[f]);
  execute(`UPDATE character_cards SET ${setClause}, updated_at = datetime('now', 'localtime') WHERE id = ?`,
    [...values, id]);
  saveDb();
}

export function getCharacters(projectId: number): CharacterCard[] {
  return queryAll<CharacterCard>('SELECT * FROM character_cards WHERE project_id = ?', [projectId]);
}

// ===== 大纲操作 =====

export function saveOutline(outline: Omit<ChapterOutline, 'id'>): ChapterOutline {
  const id = execute(
    'INSERT INTO chapter_outlines (project_id, chapter_number, title, summary, key_events, character_focus, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [outline.project_id, outline.chapter_number, outline.title, outline.summary, outline.key_events, outline.character_focus, outline.status]
  );
  saveDb();
  return queryOne<ChapterOutline>('SELECT * FROM chapter_outlines WHERE id = ?', [id])!;
}

export function getOutlines(projectId: number): ChapterOutline[] {
  return queryAll<ChapterOutline>('SELECT * FROM chapter_outlines WHERE project_id = ? ORDER BY chapter_number', [projectId]);
}

export function updateOutlineStatus(id: number, status: string): void {
  execute('UPDATE chapter_outlines SET status = ? WHERE id = ?', [status, id]);
  saveDb();
}

// ===== 章节操作 =====

export function saveChapter(chapter: Omit<ChapterContent, 'id' | 'created_at' | 'updated_at'>): ChapterContent {
  const id = execute(
    'INSERT INTO chapter_contents (project_id, chapter_number, title, content, word_count, version, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [chapter.project_id, chapter.chapter_number, chapter.title, chapter.content, chapter.word_count, chapter.version, chapter.status]
  );
  saveDb();
  return queryOne<ChapterContent>('SELECT * FROM chapter_contents WHERE id = ?', [id])!;
}

export function updateChapterContent(id: number, content: string, wordCount: number): void {
  execute(
    "UPDATE chapter_contents SET content = ?, word_count = ?, version = version + 1, updated_at = datetime('now', 'localtime') WHERE id = ?",
    [content, wordCount, id]
  );
  saveDb();
}

export function updateChapterStatus(id: number, status: string): void {
  execute("UPDATE chapter_contents SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [status, id]);
  saveDb();
}

export function getChapter(projectId: number, chapterNumber: number): ChapterContent | undefined {
  return queryOne<ChapterContent>(
    'SELECT * FROM chapter_contents WHERE project_id = ? AND chapter_number = ?',
    [projectId, chapterNumber]
  );
}

export function getAllChapters(projectId: number): ChapterContent[] {
  return queryAll<ChapterContent>('SELECT * FROM chapter_contents WHERE project_id = ? ORDER BY chapter_number', [projectId]);
}

// ===== 校对报告 =====

export function saveEditReport(report: Omit<EditReport, 'id' | 'created_at'>): EditReport {
  const id = execute(
    'INSERT INTO edit_reports (chapter_id, issues, fixed_content, score, report) VALUES (?, ?, ?, ?, ?)',
    [report.chapter_id, report.issues, report.fixed_content, report.score, report.report]
  );
  saveDb();
  return queryOne<EditReport>('SELECT * FROM edit_reports WHERE id = ?', [id])!;
}

export function getEditReports(chapterId: number): EditReport[] {
  return queryAll<EditReport>('SELECT * FROM edit_reports WHERE chapter_id = ? ORDER BY created_at DESC', [chapterId]);
}

// ===== Agent 消息 =====

export function sendMessage(msg: Omit<AgentMessage, 'id' | 'created_at'>): AgentMessage {
  const id = execute(
    'INSERT INTO agent_messages (project_id, from_agent, to_agent, type, title, content, resolved) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [msg.project_id, msg.from_agent, msg.to_agent, msg.type, msg.title, msg.content, msg.resolved ? 1 : 0]
  );
  saveDb();
  return queryOne<AgentMessage>('SELECT * FROM agent_messages WHERE id = ?', [id])!;
}

export function getMessages(projectId: number, agentFilter?: string): AgentMessage[] {
  if (agentFilter) {
    return queryAll<AgentMessage>(
      'SELECT * FROM agent_messages WHERE project_id = ? AND (from_agent = ? OR to_agent = ?) ORDER BY created_at DESC',
      [projectId, agentFilter, agentFilter]
    );
  }
  return queryAll<AgentMessage>('SELECT * FROM agent_messages WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
}

export function resolveMessage(id: number): void {
  execute('UPDATE agent_messages SET resolved = 1 WHERE id = ?', [id]);
  saveDb();
}

export function getUnresolvedMessages(projectId: number): AgentMessage[] {
  return queryAll<AgentMessage>('SELECT * FROM agent_messages WHERE project_id = ? AND resolved = 0 ORDER BY created_at', [projectId]);
}

export function checkDatabaseHealth(): boolean {
  try {
    db.exec('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ===== 聊天历史 =====

export interface ChatMessageRecord {
  id: number;
  agent_name: string;
  role: 'user' | 'assistant';
  content: string;
  attachment: string;
  created_at: string;
}

export function saveChatMessage(agentName: string, role: string, content: string, attachment?: string): ChatMessageRecord {
  const id = execute(
    'INSERT INTO chat_history (agent_name, role, content, attachment) VALUES (?, ?, ?, ?)',
    [agentName, role, content, attachment || '']
  );
  saveDb();
  return queryOne<ChatMessageRecord>('SELECT * FROM chat_history WHERE id = ?', [id])!;
}

export function getChatHistory(agentName?: string, limit: number = 50): ChatMessageRecord[] {
  if (agentName && agentName !== '全体') {
    return queryAll<ChatMessageRecord>(
      'SELECT * FROM chat_history WHERE agent_name = ? OR agent_name = ? ORDER BY created_at ASC LIMIT ?',
      [agentName, '全体', limit]
    );
  }
  return queryAll<ChatMessageRecord>(
    'SELECT * FROM chat_history ORDER BY created_at ASC LIMIT ?',
    [limit]
  );
}

export function clearChatHistory(agentName?: string): void {
  if (agentName) {
    execute('DELETE FROM chat_history WHERE agent_name = ?', [agentName]);
  } else {
    execute('DELETE FROM chat_history');
  }
  saveDb();
}

// ===== 用户反馈 =====

export interface FeedbackItem {
  id: number;
  category: string;
  content: string;
  contact: string;
  sent: number;
  created_at: string;
}

export function saveFeedback(category: string, content: string, contact: string): FeedbackItem {
  const id = execute(
    'INSERT INTO feedback (category, content, contact) VALUES (?, ?, ?)',
    [category, content, contact]
  );
  saveDb();
  return queryOne<FeedbackItem>('SELECT * FROM feedback WHERE id = ?', [id])!;
}

export function getUnsentFeedback(): FeedbackItem[] {
  return queryAll<FeedbackItem>('SELECT * FROM feedback WHERE sent = 0 ORDER BY created_at');
}

export function markFeedbackSent(ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  execute(`UPDATE feedback SET sent = 1 WHERE id IN (${placeholders})`, ids);
  saveDb();
}

/** 获取反馈邮件配置 */
export function getFeedbackEmailConfig(): { email: string; smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string } {
  const row = queryOne<{ value: string }>(
    "SELECT value FROM sqlite_master WHERE type='table' AND name='app_config'"
  );
  // Use a simple key-value store in a config table
  const config: Record<string, string> = {};
  try {
    const configs = queryAll<{ key: string; value: string }>('SELECT key, value FROM app_config');
    for (const c of configs) {
      config[c.key] = c.value;
    }
  } catch { /* table may not exist yet */ }
  return {
    email: config['feedback_email'] || '',
    smtpHost: config['smtp_host'] || 'smtp.qq.com',
    smtpPort: parseInt(config['smtp_port'] || '465'),
    smtpUser: config['smtp_user'] || '',
    smtpPass: config['smtp_pass'] || '',
  };
}

/** 保存反馈邮件配置 */
export function saveFeedbackEmailConfig(cfg: { email: string; smtpHost: string; smtpPort: number; smtpUser: string; smtpPass: string }): void {
  // Ensure config table exists
  try {
    db.run('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)');
  } catch { /* ignore */ }
  const pairs: [string, string][] = [
    ['feedback_email', cfg.email],
    ['smtp_host', cfg.smtpHost],
    ['smtp_port', String(cfg.smtpPort)],
    ['smtp_user', cfg.smtpUser],
    ['smtp_pass', cfg.smtpPass],
  ];
  for (const [key, value] of pairs) {
    db.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', [key, value]);
  }
  saveDb();
}

// ===== AI 提供者配置 =====

export interface AIProviderConfig {
  provider: 'ollama' | 'openai' | 'server';
  ollamaUrl: string;
  openaiUrl: string;
  openaiKey: string;
  openaiModel: string;
  temperature: number;
  maxTokens: number;
}

export function getAIProviderConfig(): AIProviderConfig {
  const config: Record<string, string> = {};
  try {
    const configs = queryAll<{ key: string; value: string }>('SELECT key, value FROM app_config');
    for (const c of configs) {
      config[c.key] = c.value;
    }
  } catch { /* table may not exist yet */ }
  return {
    provider: (config['ai_provider'] as AIProviderConfig['provider']) || 'ollama',
    ollamaUrl: config['ai_ollama_url'] || 'http://localhost:11434',
    openaiUrl: config['ai_openai_url'] || 'https://api.deepseek.com/v1',
    openaiKey: config['ai_openai_key'] || '',
    openaiModel: config['ai_openai_model'] || 'deepseek-chat',
    temperature: parseFloat(config['ai_temperature'] || '0.7'),
    maxTokens: parseInt(config['ai_max_tokens'] || '4096', 10),
  };
}

export function saveAIProviderConfig(cfg: Partial<AIProviderConfig>): void {
  try {
    db.run('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT)');
  } catch { /* ignore */ }
  const pairs: [string, string][] = [];
  if (cfg.provider !== undefined) pairs.push(['ai_provider', cfg.provider]);
  if (cfg.ollamaUrl !== undefined) pairs.push(['ai_ollama_url', cfg.ollamaUrl]);
  if (cfg.openaiUrl !== undefined) pairs.push(['ai_openai_url', cfg.openaiUrl]);
  if (cfg.openaiKey !== undefined) pairs.push(['ai_openai_key', cfg.openaiKey]);
  if (cfg.openaiModel !== undefined) pairs.push(['ai_openai_model', cfg.openaiModel]);
  if (cfg.temperature !== undefined) pairs.push(['ai_temperature', String(cfg.temperature)]);
  if (cfg.maxTokens !== undefined) pairs.push(['ai_max_tokens', String(cfg.maxTokens)]);
  for (const [key, value] of pairs) {
    db.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', [key, value]);
  }
  saveDb();
}

export function closeKnowledgeBase(): void {
  if (db) {
    saveDb();
    db.close();
  }
}
