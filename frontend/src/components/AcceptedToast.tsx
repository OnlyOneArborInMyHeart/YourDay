import { useEffect } from 'react';
import './AcceptedToast.css';

interface Props {
  title: string;
  detail?: string;
  visible: boolean;
  /** null 表示不自动消失（需要用户点击确认） */
  duration?: number | null;
  confirmText?: string;
  onDone: () => void;
}

/**
 * 居中弹出的"已完成"提示。
 * - duration === null：持续显示，需用户点击"确定"或遮罩关闭
 * - duration > 0：到时间后自动 onDone（默认 1500ms）
 * - 单例设计：同一时间只显示一个
 */
export function AcceptedToast({
  title,
  detail,
  visible,
  duration = null,
  confirmText = '确定',
  onDone,
}: Props) {
  useEffect(() => {
    if (!visible || duration === null) return;
    const t = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(t);
  }, [visible, duration, onDone]);

  if (!visible) return null;

  return (
    <div
      className="accepted-toast"
      role="dialog"
      aria-modal="true"
      aria-labelledby="accepted-toast-title"
    >
      <button
        type="button"
        className="accepted-toast__backdrop"
        aria-label="关闭"
        onClick={onDone}
      />
      <div className="accepted-toast__card">
        <span className="accepted-toast__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="36" height="36">
            <circle
              className="accepted-toast__ring"
              cx="12"
              cy="12"
              r="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
            />
            <path
              className="accepted-toast__tick"
              d="M7 12.5l3.4 3.4L17 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="accepted-toast__text">
          <div className="accepted-toast__title" id="accepted-toast-title">
            Accepted!
          </div>
          <div className="accepted-toast__subtitle">{title}</div>
          {detail && <div className="accepted-toast__detail">{detail}</div>}
        </div>
        <button
          type="button"
          className="accepted-toast__confirm"
          onClick={onDone}
          autoFocus
        >
          {confirmText}
        </button>
      </div>
    </div>
  );
}