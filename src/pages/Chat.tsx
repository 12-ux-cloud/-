import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';
import AgentSelector from '../components/AgentSelector';
import ChatMessage from '../components/ChatMessage';
import MaterialUploader from '../components/MaterialUploader';

interface Attachment {
  type: 'text' | 'image' | 'url';
  content: string;
  label: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  agentName: string;
  content: string;
  time: string;
}

export default function Chat() {
  const [agent, setAgent] = useState('全体');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const addNotification = useAppStore((s) => s.addNotification);

  // 加载历史
  useEffect(() => {
    loadHistory();
  }, [agent]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadHistory() {
    try {
      const history = await api.getChatHistory(agent);
      setMessages(history.map((h: any) => ({
        id: String(h.id),
        role: h.role,
        agentName: h.agent_name,
        content: h.content,
        time: formatTime(h.created_at),
      })));
    } catch {
      setMessages([]);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text && attachments.length === 0) return;

    // 构建消息内容（含附件）
    let fullContent = text;
    if (attachments.length > 0) {
      const attachDesc = attachments.map(a => `[${a.label}]\n${a.content.slice(0, 1000)}`).join('\n\n');
      fullContent = text
        ? `【参考素材】\n${attachDesc}\n\n【用户消息】\n${text}`
        : `【参考素材】\n${attachDesc}\n\n请根据以上素材进行学习和分析。`;
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      agentName: agent,
      content: text || (attachments.length > 0 ? `📎 发送了 ${attachments.length} 个素材` : ''),
      time: '刚刚',
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachments([]);
    setLoading(true);

    try {
      const data = await api.sendChatMessage(agent, fullContent, attachments.length > 0 ? JSON.stringify(attachments.map(a => a.label)) : undefined);
      const aiMsg: Message = {
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        agentName: data.agent || agent,
        content: data.message,
        time: '刚刚',
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err: any) {
      addNotification('error', `AI 回复失败: ${err.message}`);
    }
    setLoading(false);
  }

  async function handleClear() {
    try {
      await api.clearChatHistory(agent);
      setMessages([]);
      addNotification('success', '聊天记录已清除');
    } catch {}
  }

  function handleAttach(a: Attachment) {
    setAttachments(prev => [...prev, a]);
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="flex h-full">
      {/* 左侧 Agent 选择 */}
      <div className="w-52 bg-surface-800 border-r border-surface-500 p-3 flex flex-col shrink-0">
        <AgentSelector selected={agent} onSelect={setAgent} />
        <div className="mt-auto pt-3 border-t border-surface-600">
          <button
            onClick={handleClear}
            className="w-full text-xs text-gray-500 hover:text-accent-red py-2 transition-colors"
          >
            🗑️ 清除聊天记录
          </button>
        </div>
      </div>

      {/* 右侧聊天区 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部标题 */}
        <div className="px-4 py-3 border-b border-surface-500 bg-surface-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h2 className="font-bold">AI 学习与交流</h2>
            <span className="text-xs text-gray-500 bg-surface-700 px-2 py-0.5 rounded">
              当前: {agent}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            与 AI 助手交流写作想法、上传参考素材、获取创作建议
          </p>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-600">
              <span className="text-4xl mb-3">🤖</span>
              <p className="text-sm">开始与 AI 交流吧</p>
              <p className="text-xs mt-1">可以发送文字、上传参考素材、粘贴网页链接</p>
            </div>
          )}
          {messages.map(m => (
            <ChatMessage
              key={m.id}
              role={m.role}
              agentName={m.agentName}
              content={m.content}
              time={m.time}
            />
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-surface-600 flex items-center justify-center">🤖</div>
              <div className="px-4 py-2.5 rounded-2xl bg-surface-700 border border-surface-500">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 附件预览 */}
        {attachments.length > 0 && (
          <div className="px-4 py-2 bg-surface-800 border-t border-surface-500 flex gap-2 flex-wrap">
            {attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs bg-surface-700 px-2 py-1 rounded-lg border border-surface-500">
                {a.label}
                <button onClick={() => removeAttachment(i)} className="text-gray-500 hover:text-accent-red ml-1">&times;</button>
              </span>
            ))}
          </div>
        )}

        {/* 输入区 */}
        <div className="px-4 py-3 border-t border-surface-500 bg-surface-800 shrink-0">
          <div className="flex items-end gap-2">
            <MaterialUploader onAttach={handleAttach} />
            <textarea
              className="input-field flex-1 resize-none h-10 max-h-32"
              placeholder={`向${agent === '全体' ? 'AI 助手' : agent}提问或提供素材...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && attachments.length === 0)}
              className="btn-primary px-4 py-2 shrink-0"
            >
              {loading ? '⏳' : '发送'}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Enter 发送 · Shift+Enter 换行 · 可附加 📎 文本/图片/链接作为学习参考
          </p>
        </div>
      </div>
    </div>
  );
}

function formatTime(t: string): string {
  if (!t) return '';
  const d = new Date(t + (t.endsWith('Z') ? '' : 'Z'));
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
