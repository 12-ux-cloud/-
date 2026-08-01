import React from 'react';

interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  trend?: 'up' | 'down' | 'stable';
}

export default function StatCard({ icon, label, value, sub, color, trend }: StatCardProps) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';
  const trendColor = trend === 'up' ? 'text-accent-green' : trend === 'down' ? 'text-accent-red' : 'text-gray-500';

  return (
    <div className="bg-surface-800 rounded-xl p-4 border border-surface-500 hover:border-surface-400 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl" style={color ? { color } : undefined}>{icon}</span>
          <div>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
          </div>
        </div>
        {trend && <span className={`text-xs font-medium ${trendColor}`}>{trendIcon}</span>}
      </div>
      {sub && <p className="text-xs text-gray-500 mt-2">{sub}</p>}
    </div>
  );
}
