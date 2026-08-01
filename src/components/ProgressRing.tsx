import React from 'react';

interface ProgressRingProps {
  /** 0-100 */
  percent: number;
  /** 像素大小 */
  size?: number;
  /** 环宽度 */
  strokeWidth?: number;
  color?: string;
  label: string;
  sublabel?: string;
}

export default function ProgressRing({
  percent,
  size = 100,
  strokeWidth = 8,
  color = '#ffb300',
  label,
  sublabel,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="text-center" style={{ marginTop: -size / 2 - 8 }}>
        <span className="text-lg font-bold text-white">{percent}%</span>
      </div>
      <p className="text-xs text-gray-400 text-center">{label}</p>
      {sublabel && <p className="text-xs text-gray-600 text-center">{sublabel}</p>}
    </div>
  );
}
