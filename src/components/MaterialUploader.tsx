import React, { useRef, useState } from 'react';

interface Props {
  onAttach: (data: { type: 'text' | 'image' | 'url'; content: string; label: string }) => void;
}

export default function MaterialUploader({ onAttach }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleTextFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAttach({
        type: 'text',
        content: reader.result as string,
        label: `📄 ${file.name}`,
      });
      setShowMenu(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAttach({
        type: 'image',
        content: reader.result as string,
        label: `🖼️ ${file.name}`,
      });
      setShowMenu(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleUrlSubmit() {
    if (!urlInput.trim()) return;
    onAttach({
      type: 'url',
      content: urlInput.trim(),
      label: `🔗 ${urlInput.trim().slice(0, 40)}${urlInput.trim().length > 40 ? '...' : ''}`,
    });
    setUrlInput('');
    setShowUrlInput(false);
    setShowMenu(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-2 text-gray-500 hover:text-gray-300 transition-colors rounded-lg hover:bg-surface-700"
        title="附加素材"
      >
        📎
      </button>

      {showMenu && (
        <div className="absolute bottom-full mb-2 left-0 bg-surface-700 border border-surface-500 rounded-xl p-2 shadow-xl w-56 z-50">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.json,.csv"
            onChange={handleTextFile}
            className="hidden"
          />
          <input
            type="file"
            accept="image/*"
            onChange={handleImageFile}
            className="hidden"
            id="image-upload"
          />

          {showUrlInput ? (
            <div className="p-2 space-y-2">
              <input
                className="input-field text-sm"
                placeholder="输入网页链接..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                autoFocus
              />
              <div className="flex gap-1">
                <button onClick={handleUrlSubmit} className="text-xs btn-primary py-1 px-3">添加</button>
                <button onClick={() => setShowUrlInput(false)} className="text-xs btn-secondary py-1 px-3">取消</button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-600 rounded-lg flex items-center gap-2"
              >
                📄 上传文本文件 (.txt/.md)
              </button>
              <button
                onClick={() => (document.getElementById('image-upload') as HTMLInputElement)?.click()}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-600 rounded-lg flex items-center gap-2"
              >
                🖼️ 上传图片参考
              </button>
              <button
                onClick={() => setShowUrlInput(true)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-surface-600 rounded-lg flex items-center gap-2"
              >
                🔗 添加网页链接
              </button>
              <div className="border-t border-surface-500 pt-1 mt-1">
                <p className="text-xs text-gray-600 px-3 py-1">
                  上传素材后，AI 将参考这些内容进行学习和创作
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
