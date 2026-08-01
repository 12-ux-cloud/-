import React from 'react';

interface Agent {
  key: string;
  name: string;
  icon: string;
  role: string;
  color: string;
}

const AGENTS: Agent[] = [
  { key: '全体', name: '全体 AI', icon: '🤖', role: '综合助手', color: '#888' },
  { key: '规划师', name: '规划师', icon: '🗺️', role: '构思与规划', color: '#ffc107' },
  { key: '作家', name: '作家', icon: '✍️', role: '写作指导', color: '#4caf50' },
  { key: '编辑', name: '编辑', icon: '🔍', role: '校对建议', color: '#2196f3' },
  { key: '排版师', name: '排版师', icon: '🎨', role: '排版设计', color: '#9c27b0' },
  { key: '发布师', name: '发布师', icon: '🚀', role: '发布指导', color: '#ff9800' },
  { key: '主编', name: '主编', icon: '👑', role: '全局把控', color: '#f44336' },
];

interface Props {
  selected: string;
  onSelect: (key: string) => void;
}

export default function AgentSelector({ selected, onSelect }: Props) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 px-2 mb-2">选择 AI 助手</p>
      {AGENTS.map(a => (
        <button
          key={a.key}
          onClick={() => onSelect(a.key)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors
            ${selected === a.key
              ? 'bg-surface-700 border border-surface-400'
              : 'hover:bg-surface-800 border border-transparent'
            }`}
        >
          <span className="text-lg">{a.icon}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm ${selected === a.key ? 'text-white' : 'text-gray-300'}`}>{a.name}</p>
            <p className="text-xs text-gray-500">{a.role}</p>
          </div>
          {selected === a.key && (
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
          )}
        </button>
      ))}
    </div>
  );
}
