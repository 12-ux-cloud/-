import React from 'react';

interface Activity {
  type: string;
  chapterNumber?: number;
  title?: string;
  status?: string;
  time?: string;
  agent?: string;
  action?: string;
}

interface ActivityTimelineProps {
  activities: Activity[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: '初稿',
  edited: '已编辑',
  approved: '已审核',
  published: '已发布',
  writing: '写作中',
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#9e9e9e',
  edited: '#2196f3',
  approved: '#4caf50',
  published: '#ff9800',
  writing: '#ffb300',
};

function formatTime(t: string): string {
  if (!t) return '';
  const d = new Date(t + (t.endsWith('Z') ? '' : 'Z'));
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString('zh-CN');
}

export default function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (!activities || activities.length === 0) {
    return <p className="text-xs text-gray-600 text-center py-4">暂无活动记录</p>;
  }

  return (
    <div className="space-y-0">
      {activities.map((a, i) => (
        <div key={i} className="flex items-start gap-3 py-2 border-b border-surface-700 last:border-0">
          <div
            className="w-2 h-2 rounded-full mt-1.5 shrink-0"
            style={{ backgroundColor: STATUS_COLORS[a.status || ''] || '#555' }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-300 truncate">
              {a.chapterNumber ? `第${a.chapterNumber}章` : ''}
              {a.title ? ` ${a.title}` : ''}
              {a.action ? ` - ${a.action}` : ''}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {a.status && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{
                  color: STATUS_COLORS[a.status] || '#888',
                  backgroundColor: `${STATUS_COLORS[a.status] || '#555'}15`,
                }}>
                  {STATUS_LABELS[a.status] || a.status}
                </span>
              )}
              {a.time && <span className="text-xs text-gray-600">{formatTime(a.time)}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
