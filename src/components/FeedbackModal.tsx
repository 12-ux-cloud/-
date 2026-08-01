import React, { useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../api';

const CATEGORIES = ['建议', 'Bug反馈', '功能需求', '使用体验', '其他'];

interface Props {
  onClose: () => void;
}

export default function FeedbackModal({ onClose }: Props) {
  const addNotification = useAppStore((s) => s.addNotification);
  const [category, setCategory] = useState('建议');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!content.trim()) {
      addNotification('warning', '请输入反馈内容');
      return;
    }
    setSubmitting(true);
    try {
      await api.submitFeedback(category, content.trim(), contact.trim());
      addNotification('success', '感谢你的反馈！我们会认真处理。');
      onClose();
    } catch (err: any) {
      addNotification('error', `提交失败: ${err.message}`);
    }
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-surface-700 rounded-xl p-6 w-[520px] max-w-[95vw] space-y-4 border border-surface-500 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">💬 提交反馈</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-3">
          {/* 分类 */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">反馈类型</label>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-full text-xs transition-colors
                    ${category === c
                      ? 'bg-primary-500 text-black font-medium'
                      : 'bg-surface-800 text-gray-400 hover:text-white border border-surface-500'
                    }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* 内容 */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">反馈内容</label>
            <textarea
              className="input-field h-32 resize-none"
              placeholder="请详细描述你的建议、遇到的问题或想要的功能..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-gray-600 mt-1 text-right">{content.length}/2000</p>
          </div>

          {/* 联系方式 */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">联系方式（可选）</label>
            <input
              className="input-field"
              placeholder="邮箱或微信，方便我们反馈处理结果"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">取消</button>
          <button onClick={handleSubmit} disabled={submitting || !content.trim()} className="btn-primary">
            {submitting ? '⏳ 提交中...' : '📤 提交反馈'}
          </button>
        </div>
      </div>
    </div>
  );
}
