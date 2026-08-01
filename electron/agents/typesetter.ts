/**
 * ④ 排版 Agent — 排版设计
 * 模型: 轻量 AI (风格推荐) + Pandoc 模板引擎
 * 产出: EPUB / PDF / TXT 格式化文件
 */

import { generate } from '../shared/ai_provider';
import { messageBus } from '../shared/message_bus';
import * as KB from '../shared/knowledge_base';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 动态加载可选依赖
let JSZip: any = null;
let PDFDocument: any = null;

async function getJSZip(): Promise<any> {
  if (JSZip) return JSZip;
  try { JSZip = require('jszip'); return JSZip; }
  catch { return null; }
}

async function getPDFKit(): Promise<any> {
  if (PDFDocument) return PDFDocument;
  try {
    const pdfkit = require('pdfkit');
    PDFDocument = pdfkit.default || pdfkit;
    return PDFDocument;
  } catch { return null; }
}

export interface TypesetterConfig {
  model: string;
  outputFormat: 'epub' | 'pdf' | 'txt' | 'html';
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  titleStyle: 'classic' | 'modern' | 'minimal' | 'fantasy';
  addTOC: boolean;
  dropCap: boolean;
}

const DEFAULT_CONFIG: TypesetterConfig = {
  model: 'qwen2.5:7b',
  outputFormat: 'epub',
  fontFamily: '宋体',
  fontSize: 12,
  lineHeight: 1.8,
  titleStyle: 'classic',
  addTOC: true,
  dropCap: true,
};

let config: TypesetterConfig = { ...DEFAULT_CONFIG };

export function setTypesetterConfig(cfg: Partial<TypesetterConfig>): void {
  config = { ...config, ...cfg };
}

export function getTypesetterConfig(): TypesetterConfig {
  return { ...config };
}

/**
 * 排版主入口 — 将章节格式化为目标格式
 */
export async function typesetBook(
  projectId: number,
  outputDir?: string
): Promise<{ filePath: string; format: string }> {
  console.log('[Typesetter] 开始排版...');

  // 获取所有已审核通过的章节
  const chapters = KB.getAllChapters(projectId).filter(c => c.status === 'approved' || c.status === 'edited');
  const project = KB.getProject(projectId);

  if (!project) throw new Error('项目不存在');
  if (chapters.length === 0) throw new Error('没有可排版的章节');

  // Step 1: AI 推荐排版风格
  const styleRecommendation = await recommendStyle(project);

  // Step 2: 生成 Markdown 合集
  const markdown = buildMarkdown(project, chapters);

  // Step 3: 转换为目标格式
  if (!outputDir) {
    outputDir = path.join(os.homedir(), 'Documents', 'NovelAI-Workflow');
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const fileName = `${project.name}_v1.${config.outputFormat === 'txt' ? 'txt' : config.outputFormat}`;
  const filePath = path.join(outputDir, fileName);

  switch (config.outputFormat) {
    case 'epub':
      await convertToEpub(markdown, filePath, project);
      break;
    case 'pdf':
      await convertToPdf(markdown, filePath, project);
      break;
    case 'html':
      await convertToHtml(markdown, filePath, project);
      break;
    case 'txt':
    default:
      fs.writeFileSync(filePath, markdown, 'utf-8');
      break;
  }

  // 通知主编
  await messageBus.send({
    from: 'typesetter',
    to: 'chief_editor',
    type: 'status',
    title: '排版完成',
    content: `格式: ${config.outputFormat.toUpperCase()}\n样式: ${styleRecommendation}\n文件: ${filePath}`,
    projectId,
    priority: 'normal',
  });

  console.log('[Typesetter] 排版完成:', filePath);
  return { filePath, format: config.outputFormat };
}

/**
 * 排版单个章节（用于增量排版）
 */
export async function typesetChapter(
  projectId: number,
  chapterNumber: number
): Promise<string> {
  const chapter = KB.getChapter(projectId, chapterNumber);
  const project = KB.getProject(projectId);
  if (!chapter || !project) throw new Error('章节或项目不存在');

  const titleStyle = getTitleStyleMarkdown();
  return `${titleStyle}第${chapterNumber}章 ${chapter.title}\n\n${chapter.content}`;
}

// ===== 内部方法 =====

async function recommendStyle(project: KB.NovelProject): Promise<string> {
  const systemPrompt = '你是书籍排版设计师，根据小说类型推荐最佳排版方案。';
  const prompt = `小说类型: ${project.genre}
当前输出格式: ${config.outputFormat}

请推荐排版风格（50字以内），包含：字体选择理由、行距建议、标题样式建议。`;

  const recommendation = await generate({
    model: config.model,
    prompt,
    system: systemPrompt,
    temperature: 0.5,
    max_tokens: 256,
  });

  return recommendation;
}

function buildMarkdown(project: KB.NovelProject, chapters: KB.ChapterContent[]): string {
  const titleStyle = getTitleStyleMarkdown();
  let md = '';

  // 书籍元数据
  md += `---
title: ${project.name}
author: AI Novel Workflow
language: zh-CN
---

`;

  // 目录
  if (config.addTOC) {
    md += `# 目录\n\n`;
    for (const ch of chapters) {
      md += `- [第${ch.chapter_number}章 ${ch.title}](#chapter-${ch.chapter_number})\n`;
    }
    md += `\n---\n\n`;
  }

  // 正文
  for (const ch of chapters) {
    md += `\n\n${titleStyle}第${ch.chapter_number}章 ${ch.title}\n\n`;
    md += ch.content;
    md += `\n\n`;
  }

  return md;
}

function getTitleStyleMarkdown(): string {
  switch (config.titleStyle) {
    case 'classic': return '# ';
    case 'modern': return '## ';
    case 'minimal': return '### ';
    case 'fantasy': return '# ✦ ';
    default: return '# ';
  }
}

async function convertToEpub(markdown: string, outputPath: string, project: KB.NovelProject): Promise<void> {
  const JSZipClass = await getJSZip();
  if (!JSZipClass) {
    // 降级：尝试 Pandoc，再失败则 TXT
    try {
      await execAsync(`pandoc --version`);
      const tmpMd = path.join(os.tmpdir(), `novel-epub-${Date.now()}.md`);
      const cssPath = path.join(__dirname, '..', '..', 'templates', 'novel-epub.css');
      fs.writeFileSync(tmpMd, markdown, 'utf-8');
      await execAsync(`pandoc "${tmpMd}" -o "${outputPath}" --from markdown --to epub3 --css "${cssPath}" --metadata title="${project.name}"`);
      fs.unlinkSync(tmpMd);
      return;
    } catch {
      console.warn('[Typesetter] JSZip 和 Pandoc 均不可用，降级为 TXT');
      const txtPath = outputPath.replace('.epub', '.txt');
      fs.writeFileSync(txtPath, markdown, 'utf-8');
      throw new Error('EPUB 生成需要安装 jszip (npm install jszip) 或 Pandoc (https://pandoc.org)。已降级输出为 TXT。');
    }
  }

  // 纯 Node.js EPUB 生成 (JSZip)
  const zip = new JSZipClass();

  // mimetype 文件（必须第一个，不压缩）
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  // 解析 markdown 为 XHTML 章节
  const chapters = parseMarkdownChapters(markdown);
  const chapterFiles: string[] = [];
  const spineItems: string[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const fileName = `chapter_${String(i + 1).padStart(3, '0')}.xhtml`;
    chapterFiles.push(fileName);

    const dropCapStyle = config.dropCap && ch.content.trim()
      ? `<style>.first::first-letter { font-size: 3em; float: left; line-height: 1; margin-right: 0.1em; font-weight: bold; }</style>`
      : '';

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(ch.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
  ${dropCapStyle}
</head>
<body>
  <h1>${escapeXml(ch.title)}</h1>
  ${ch.content.split('\n\n').map((p, pi) =>
    `<p${pi === 0 && config.dropCap ? ' class="first"' : ''}>${escapeXml(p.trim())}</p>`
  ).join('\n')}
</body>
</html>`;
    zip.file(`OEBPS/${fileName}`, xhtml);
    spineItems.push(fileName);
  }

  // 如果没解析出章节，放入全部内容
  if (chapters.length === 0) {
    const fileName = 'content.xhtml';
    chapterFiles.push(fileName);
    spineItems.push(fileName);
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(project.name)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
  ${simpleMarkdownToHtml(markdown)}
</body>
</html>`;
    zip.file(`OEBPS/${fileName}`, xhtml);
  }

  // content.opf
  const now = new Date().toISOString();
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(project.name)}</dc:title>
    <dc:creator>一叶轻舟工作室</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:date>${now}</dc:date>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    <item id="style" href="style.css" media-type="text/css"/>
    ${chapterFiles.map((f, i) =>
      `<item id="ch${i}" href="${f}" media-type="application/xhtml+xml"/>`
    ).join('\n    ')}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    ${spineItems.map((_, i) => `<itemref idref="ch${i}"/>`).join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', opf);

  // toc.ncx
  let navPoints = '';
  for (let i = 0; i < chapters.length; i++) {
    navPoints += `
    <navPoint id="nav-${i}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(chapters[i].title)}</text></navLabel>
      <content src="${chapterFiles[i]}"/>
    </navPoint>`;
  }

  zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="book-${Date.now()}"/></head>
  <docTitle><text>${escapeXml(project.name)}</text></docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`);

  // CSS
  const cssContent = getEpubCSS(project);
  zip.file('OEBPS/style.css', cssContent);

  // 写入文件
  const epubBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(outputPath, epubBuffer as Buffer);
}

/** 解析 Markdown 为章节数组 */
function parseMarkdownChapters(md: string): { title: string; content: string }[] {
  const chapters: { title: string; content: string }[] = [];
  const lines = md.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];
  let inMetadata = true;

  for (const line of lines) {
    // 跳过头部的 YAML 元数据
    if (inMetadata) {
      if (line.trim() === '---') {
        if (currentContent.length === 0 && !currentTitle) continue;
        inMetadata = false;
        continue;
      }
      continue;
    }

    // 检测章节标题（# 或 ## 开头）
    const h1Match = line.match(/^(#|##|###)\s+(.+)/);
    if (h1Match) {
      // 跳过目录标题
      if (h1Match[2].includes('目录') || h1Match[2].includes('Table of Contents')) continue;
      // 保存上一章
      if (currentTitle || currentContent.length > 0) {
        chapters.push({ title: currentTitle || '正文', content: currentContent.join('\n').trim() });
      }
      currentTitle = h1Match[2];
      currentContent = [];
    } else if (currentTitle) {
      currentContent.push(line);
    }
  }
  // 保存最后一章
  if (currentTitle || currentContent.length > 0) {
    chapters.push({ title: currentTitle || '正文', content: currentContent.join('\n').trim() });
  }

  return chapters;
}

/** 简单的 Markdown→HTML（粗体、斜体、链接） */
function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/### (.+)/g, '<h3>$1</h3>')
    .replace(/## (.+)/g, '<h2>$1</h2>')
    .replace(/# (.+)/g, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
}

/** XML 转义 */
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 获取 EPUB CSS 内容 */
function getEpubCSS(project: KB.NovelProject): string {
  const fontFamily = config.fontFamily || '宋体';
  const fontSize = config.fontSize || 12;
  const lineHeight = config.lineHeight || 1.8;
  return `/* 一叶轻舟工作室 — EPUB 样式 */
body {
  font-family: "${fontFamily}", "SimSun", "Songti SC", serif;
  font-size: ${fontSize}pt;
  line-height: ${lineHeight};
  color: #333;
  margin: 1.5em;
}
h1 { text-align: center; font-size: 1.5em; margin: 1.5em 0 1em; font-family: "SimHei", "Heiti SC", sans-serif; }
h2 { text-align: center; font-size: 1.3em; margin: 1.2em 0 0.8em; }
h3 { font-size: 1.1em; margin: 1em 0 0.6em; }
p { text-indent: 2em; margin: 0.5em 0; }
p.first { text-indent: 0; }
${config.dropCap ? 'p.first::first-letter { font-size: 3em; float: left; line-height: 1; margin-right: 0.1em; font-weight: bold; }' : ''}
blockquote { margin: 1em 2em; padding: 0.5em 1em; border-left: 3px solid #ccc; font-style: italic; color: #666; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
td, th { border: 1px solid #ccc; padding: 0.5em; }
`;
}

async function convertToPdf(markdown: string, outputPath: string, project: KB.NovelProject): Promise<void> {
  const PdfDoc = await getPDFKit();
  if (!PdfDoc) {
    // 降级：尝试 Pandoc
    try {
      await execAsync(`pandoc --version`);
      const tmpMd = path.join(os.tmpdir(), `novel-pdf-${Date.now()}.md`);
      fs.writeFileSync(tmpMd, markdown, 'utf-8');
      await execAsync(`pandoc "${tmpMd}" -o "${outputPath}" --from markdown --pdf-engine=xelatex --metadata title="${project.name}"`);
      fs.unlinkSync(tmpMd);
      return;
    } catch {
      console.warn('[Typesetter] PDFKit 和 Pandoc 均不可用，降级为 TXT');
      const txtPath = outputPath.replace('.pdf', '.txt');
      fs.writeFileSync(txtPath, markdown, 'utf-8');
      throw new Error('PDF 生成需要安装 pdfkit (npm install pdfkit) 或 Pandoc+LaTeX。已降级输出为 TXT。');
    }
  }

  // 纯 Node.js PDF 生成 (PDFKit)
  const doc = new PdfDoc({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 60, right: 60 },
    info: {
      Title: project.name,
      Author: '一叶轻舟工作室',
      Creator: '一叶轻舟工作室',
    },
  });

  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  const fontFamily = config.fontFamily || '宋体';
  const fontSize = config.fontSize || 12;
  const lineGap = (config.lineHeight || 1.8) * fontSize - fontSize;

  // 尝试使用中文字体
  try {
    // Windows 中文字体路径
    const fontPaths: Record<string, string> = {
      '宋体': 'C:\\Windows\\Fonts\\simsun.ttc',
      '黑体': 'C:\\Windows\\Fonts\\simhei.ttf',
      '楷体': 'C:\\Windows\\Fonts\\simkai.ttf',
      '微软雅黑': 'C:\\Windows\\Fonts\\msyh.ttc',
      '仿宋': 'C:\\Windows\\Fonts\\simfang.ttf',
    };
    const fontPath = fontPaths[config.fontFamily];
    if (fontPath && fs.existsSync(fontPath)) {
      doc.font(fontPath);
      console.log(`[Typesetter] 使用字体: ${config.fontFamily}`);
    }
  } catch { /* 使用默认字体 */ }

  // 书名页
  doc.fontSize(24);
  doc.text(project.name, { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(14);
  doc.text('一叶轻舟工作室', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(10);
  doc.text(new Date().toLocaleDateString('zh-CN'), { align: 'center' });
  doc.addPage();

  // 正文
  const lines = markdown.split('\n');
  let inMetadata = false;
  let firstParagraph = true;

  for (const line of lines) {
    if (inMetadata) {
      if (line.trim() === '---') { inMetadata = false; }
      continue;
    }
    if (line.trim() === '---') { inMetadata = true; continue; }

    const h1Match = line.match(/^(#|##|###)\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    const h3Match = line.match(/^###\s+(.+)/);

    if (h1Match) {
      if (h1Match[2].includes('目录')) continue;
      doc.addPage();
      doc.fontSize(18);
      doc.text(h1Match[2], { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(fontSize);
      firstParagraph = true;
    } else if (h2Match) {
      doc.moveDown(1);
      doc.fontSize(15);
      doc.text(h2Match[1], { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(fontSize);
      firstParagraph = true;
    } else if (h3Match) {
      doc.moveDown(0.5);
      doc.fontSize(13);
      doc.text(h3Match[1], { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(fontSize);
      firstParagraph = true;
    } else if (line.trim()) {
      const cleanLine = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
      const options: any = {
        lineGap,
        indent: firstParagraph && config.dropCap ? 0 : fontSize * 2,
      };
      doc.text(cleanLine, options);
      doc.moveDown(0.3);
      firstParagraph = false;
    } else {
      doc.moveDown(0.5);
      firstParagraph = true;
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

async function convertToHtml(markdown: string, outputPath: string, project: KB.NovelProject): Promise<void> {
  const templatePath = path.join(__dirname, '..', '..', 'templates', 'novel-web.html');
  let template = '';
  try {
    template = fs.readFileSync(templatePath, 'utf-8');
  } catch {
    template = getDefaultHtmlTemplate();
  }

  // Markdown → HTML 转换
  let htmlContent = '';
  let inMetadata = false;
  const lines = markdown.split('\n');

  for (const line of lines) {
    if (inMetadata) {
      if (line.trim() === '---') { inMetadata = false; }
      continue;
    }
    if (line.trim() === '---') { inMetadata = true; continue; }

    if (/^###\s/.test(line)) {
      htmlContent += `<h3>${line.replace(/^###\s+/, '')}</h3>\n`;
    } else if (/^##\s/.test(line)) {
      htmlContent += `<h2>${line.replace(/^##\s+/, '')}</h2>\n`;
    } else if (/^#\s/.test(line)) {
      htmlContent += `<h1>${line.replace(/^#\s+/, '')}</h1>\n`;
    } else if (line.trim()) {
      const clean = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
      htmlContent += `<p>${clean.trim()}</p>\n`;
    } else {
      htmlContent += '\n';
    }
  }

  const dropCapCSS = config.dropCap
    ? 'article > p:first-of-type::first-letter { font-size: 3em; float: left; line-height: 1; margin-right: 0.1em; font-weight: bold; }'
    : '';

  const html = template
    .replace('{{title}}', project.name)
    .replace('{{fontFamily}}', config.fontFamily || '宋体')
    .replace('{{fontSize}}', String(config.fontSize || 12))
    .replace('{{lineHeight}}', String(config.lineHeight || 1.8))
    .replace('{{dropCapCSS}}', dropCapCSS)
    .replace('{{content}}', htmlContent);

  fs.writeFileSync(outputPath, html, 'utf-8');
}

function getDefaultHtmlTemplate(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{{title}}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "{{fontFamily}}", "SimSun", "Songti SC", serif;
    font-size: {{fontSize}}pt;
    line-height: {{lineHeight}};
    color: #333;
    max-width: 800px;
    margin: 0 auto;
    padding: 2em;
    background: #fafafa;
  }
  h1 { text-align: center; font-size: 1.8em; margin: 1.5em 0 0.8em; font-family: "SimHei", "Heiti SC", sans-serif; }
  h2 { font-size: 1.3em; margin: 1.2em 0 0.6em; }
  h3 { font-size: 1.1em; margin: 1em 0 0.5em; }
  p { text-indent: 2em; margin: 0.5em 0; text-align: justify; }
  {{dropCapCSS}}
</style>
</head>
<body>
<article>
{{content}}
</article>
</body>
</html>`;
}

export function initTypesetter(): void {
  messageBus.subscribe('typesetter', async (msg) => {
    if (msg.type === 'command' && msg.to === 'typesetter') {
      console.log('[Typesetter] 收到排版指令');
      await typesetBook(msg.projectId);
    }
  });
}
