import { useEffect, useRef, useState } from 'react';
import {
  decomposeTask,
  formatDuration,
  daysBetweenInclusive,
  DEFAULT_DECAY,
  DEFAULT_START_HOUR,
  type DecomposeResult,
} from '../utils/decomposer';
import { toDateString } from '../utils/date';
import { eventsApi } from '../api/events';
import type { EventDraft } from '../types';
import './TaskDecomposerModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 批量创建成功后回调 */
  onCreated?: (count: number) => void;
}

type Phase = 'input' | 'preview' | 'creating';

export function TaskDecomposerModal({ open, onClose, onCreated }: Props) {
  const [phase, setPhase] = useState<Phase>('input');

  // 表单字段
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(() => {
    // 默认 DDL = 今天 + 7 天
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toDateString(d);
  });
  const [totalHours, setTotalHours] = useState('2');
  const [dailyStartHour, setDailyStartHour] = useState(String(DEFAULT_START_HOUR));
  const [decay, setDecay] = useState(String(DEFAULT_DECAY));

  // 计算结果
  const [result, setResult] = useState<DecomposeResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);

  // 重置
  useEffect(() => {
    if (!open) {
      setPhase('input');
      setResult(null);
      setCalcError(null);
      setCreateError(null);
    }
  }, [open]);

  // ESC 关闭（仅 input 阶段）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'input') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);

  const today = toDateString(new Date());
  const startDate = today;
  const days = daysBetweenInclusive(startDate, deadline);
  const hoursNum = parseFloat(totalHours) || 0;

  const handleCalc = () => {
    setCalcError(null);
    if (!title.trim()) { setCalcError('请填写任务名称'); return; }
    if (!deadline) { setCalcError('请选择截止日期'); return; }
    if (deadline < startDate) { setCalcError('截止日期不能早于今天'); return; }
    if (hoursNum <= 0) { setCalcError('请填写预估工时'); return; }
    try {
      const r = decomposeTask({
        startDate,
        deadline,
        totalHours: hoursNum,
        dailyStartHour: parseInt(dailyStartHour) || DEFAULT_START_HOUR,
        decay: parseFloat(decay) || DEFAULT_DECAY,
      });
      setResult(r);
      setPhase('preview');
    } catch (e) {
      setCalcError(e instanceof Error ? e.message : '计算失败');
    }
  };

  const handleCreate = async () => {
    if (!result) return;
    setPhase('creating');
    setCreateError(null);
    try {
      let created = 0;
      for (const slot of result.slots) {
        if (slot.minutes === 0) continue;
        const draft: EventDraft = {
          date: slot.date,
          title: title.trim(),
          start_time: slot.start_time,
          end_time: slot.end_time,
          priority: 2,
          note: `📊 任务拆解 · 第 ${result.slots.indexOf(slot) + 1}/${result.days} 天 · ${formatDuration(slot.minutes)}`,
        };
        await eventsApi.create(draft);
        created++;
      }
      onCreated?.(created);
      onClose();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '批量创建失败');
      setPhase('preview');
    }
  };

  if (!open) return null;

  const maxBar = result ? Math.max(...result.slots.map((s) => s.minutes), 1) : 1;

  return (
    <div className="modal-backdrop" onClick={phase === 'input' ? onClose : undefined}>
      <div
        className="modal modal--decomposer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="任务拆解"
      >
        {/* Header */}
        <div className="modal__header">
          <div className="decomposer-header">
            <span className="decomposer-icon" aria-hidden>⚡</span>
            <h2 className="modal__title">任务拆解</h2>
          </div>
          {phase !== 'creating' && (
            <button className="icon-btn" onClick={onClose} aria-label="关闭">×</button>
          )}
        </div>

        {/* ── Phase 1: Input ── */}
        {phase === 'input' && (
          <div className="modal__body decomposer-body">
            <p className="decomposer-desc">
              输入任务总工时，系统自动将工作量分配到每一天，<strong>前期略多、后期轻松</strong>。
            </p>

            <label className="field">
              <span className="field__label">任务名称</span>
              <input
                ref={titleRef}
                className="field__input"
                autoFocus
                maxLength={80}
                placeholder="例如：毕设论文、数据分析报告"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span className="field__label">截止日期</span>
                <input
                  className="field__input"
                  type="date"
                  min={today}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field__label">预估总工时（小时）</span>
                <input
                  className="field__input"
                  type="number"
                  min="0.5"
                  max="500"
                  step="0.5"
                  placeholder="例如：8"
                  value={totalHours}
                  onChange={(e) => setTotalHours(e.target.value)}
                />
              </label>
            </div>

            <div className="decomposer-advanced">
              <div className="decomposer-advanced__title">高级选项（可选）</div>
              <div className="field-row">
                <label className="field">
                  <span className="field__label">每天开始时间</span>
                  <input
                    className="field__input"
                    type="time"
                    value={`${dailyStartHour.padStart(2, '0')}:00`}
                    onChange={(e) => setDailyStartHour(e.target.value.split(':')[0])}
                  />
                </label>
                <label className="field">
                  <span className="field__label">递减强度（0=均匀，1=前重后轻）</span>
                  <div className="decomposer-slider-row">
                    <input
                      className="decomposer-slider"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={decay}
                      onChange={(e) => setDecay(e.target.value)}
                    />
                    <span className="decomposer-slider-val">{parseFloat(decay).toFixed(1)}</span>
                  </div>
                </label>
              </div>
            </div>

            {/* 预估摘要 */}
            {hoursNum > 0 && (
              <div className="decomposer-summary">
                <div className="decomposer-summary__item">
                  <span className="decomposer-summary__label">工作天数</span>
                  <span className="decomposer-summary__val">{days} 天</span>
                </div>
                <div className="decomposer-summary__item">
                  <span className="decomposer-summary__label">日均工时</span>
                  <span className="decomposer-summary__val">
                    {formatDuration(Math.round((hoursNum * 60) / Math.max(days, 1)))}
                  </span>
                </div>
                <div className="decomposer-summary__item">
                  <span className="decomposer-summary__label">预计首日</span>
                  <span className="decomposer-summary__val">{formatDuration(Math.round((hoursNum * 60) / Math.max(days, 1) * (1 + parseFloat(decay || '0.7') / 2)))}</span>
                </div>
              </div>
            )}

            {calcError && <div className="modal__error">{calcError}</div>}

            <div className="modal__footer">
              <button className="ghost-btn ghost-btn--lg" onClick={onClose}>取消</button>
              <button className="primary-btn" onClick={handleCalc}>
                生成分解方案 →
              </button>
            </div>
          </div>
        )}

        {/* ── Phase 2: Preview ── */}
        {phase === 'preview' && result && (
          <div className="modal__body decomposer-body">
            <div className="decomposer-preview-header">
              <div className="decomposer-preview-title">
                <strong>{title || '（未命名）'}</strong>
                <span className="decomposer-preview-meta">
                  {result.days} 天 · 共 {formatDuration(result.totalMinutes)} · 每天 {dailyStartHour}:00 开始
                </span>
              </div>
            </div>

            {result.warnings.length > 0 && (
              <div className="decomposer-warnings">
                {result.warnings.map((w, i) => (
                  <div key={i} className="decomposer-warning">
                    <span aria-hidden>⚠️</span> {w}
                  </div>
                ))}
              </div>
            )}

            <div className="decomposer-timeline">
              {result.slots.map((slot, idx) => {
                const pct = Math.max(2, Math.round((slot.minutes / maxBar) * 100));
                const isFirst = idx === 0;
                const isLast = idx === result.slots.length - 1;
                return (
                  <div
                    key={slot.date}
                    className={`decomposer-slot${slot.minutes === 0 ? ' decomposer-slot--zero' : ''}`}
                  >
                    <div className="decomposer-slot__date">
                      <span className="decomposer-slot__day-label">
                        {idx === 0 ? '第1天' : idx === result.slots.length - 1 ? '最后' : `第${idx + 1}天`}
                      </span>
                      <span className="decomposer-slot__date-str">{slot.date.slice(5)}</span>
                      {isFirst && <span className="decomposer-slot__badge decomposer-slot__badge--first">今天</span>}
                    </div>
                    <div className="decomposer-slot__bar-wrap">
                      <div
                        className={`decomposer-slot__bar${isFirst ? ' decomposer-slot__bar--first' : ''}${isLast ? ' decomposer-slot__bar--last' : ''}`}
                        style={{ width: `${pct}%` }}
                        aria-label={`${formatDuration(slot.minutes)}`}
                      />
                    </div>
                    <div className="decomposer-slot__time">
                      {slot.minutes === 0 ? (
                        <span className="decomposer-slot__zero-label">无需工作</span>
                      ) : (
                        <>
                          <span className="decomposer-slot__dur">{formatDuration(slot.minutes)}</span>
                          <span className="decomposer-slot__range">
                            {slot.start_time}–{slot.end_time}
                            {slot.overnight && (
                              <span className="decomposer-slot__overnight">次日</span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {createError && <div className="modal__error">{createError}</div>}

            <div className="modal__footer">
              <button className="ghost-btn ghost-btn--lg" onClick={() => setPhase('input')}>← 重新设置</button>
              <button className="primary-btn primary-btn--confirm" onClick={handleCreate}>
                ✅ 确认创建 {result.slots.filter((s) => s.minutes > 0).length} 个事项
              </button>
            </div>
          </div>
        )}

        {/* ── Phase 3: Creating ── */}
        {phase === 'creating' && (
          <div className="modal__body decomposer-body decomposer-creating">
            <div className="decomposer-spinner" aria-hidden>⏳</div>
            <p>正在批量创建事项…</p>
          </div>
        )}
      </div>
    </div>
  );
}
