import React from 'react';

interface Props {
  role: 'user' | 'assistant';
  agentName?: string;
  content: string;
  time?: string;
}

const AGENT_ICONS: Record<string, string> = {
  '全体': '🤖',
  '规划师': '🗺️',
  '作家': '✍️',
  '编辑': '🔍',
  '排版师': '🎨',
  '发布师': '🚀',
  '主编': '👑',
};

export default function ChatMessage({ role, agentName, content, time }: Props) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0
        ${isUser ? 'bg-primary-500' : 'bg-surface-600'}`}
      >
        {isUser ? '👤' : AGENT_ICONS[agentName || ''] || '🤖'}
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] ${isUser ? 'items-end' : ''}`}>
        {!isUser && agentName && (
          <p className="text-xs text-gray-500 mb-1 ml-1">{agentName}</p>
        )}
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? 'bg-primary-500 text-white rounded-tr-sm'
            : 'bg-surface-700 text-gray-200 border border-surface-500 rounded-tl-sm'
          }`}
        >
          {content}
        </div>
        {time && (
          <p className={`text-xs text-gray-600 mt-1 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>{time}</p>
        )}
      </div>
    </div>
  );
}
