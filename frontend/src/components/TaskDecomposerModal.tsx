import { useEffect, useMemo, useRef, useState } from 'react';
import {
  decomposeTask,
  decomposeTaskByQuantity,
  formatDuration,
  daysBetweenInclusive,
  parseQuantitySentence,
  renderQuantityTodoTitle,
  DEFAULT_DECAY,
  DEFAULT_START_HOUR,
  type DecomposeResult,
  type DecomposeQuantityResult,
  type ParsedQuantityTask,
  type ParseResult,
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
  /** 默认 Tab：'time'（带时间）或 'quantity'（无时间） */
  defaultMode?: DecomposeMode;
}

type DecomposeMode = 'time' | 'quantity';
type Phase = 'input' | 'preview' | 'creating';

export function TaskDecomposerModal({
  open,
  onClose,
  onCreated,
  defaultMode = 'time',
}: Props) {
  const [mode, setMode] = useState<DecomposeMode>(defaultMode);
  const [phase, setPhase] = useState<Phase>('input');

  /* ───── 时间型字段 ───── */
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toDateString(d);
  });
  const [totalHours, setTotalHours] = useState('2');
  const [dailyStartHour, setDailyStartHour] = useState(String(DEFAULT_START_HOUR));
  const [decay, setDecay] = useState(String(DEFAULT_DECAY));
  const [resultTime, setResultTime] = useState<DecomposeResult | null>(null);

  /* ───── 数量型字段 ───── */
  const [quantityInput, setQuantityInput] = useState('');
  const [parsed, setParsed] = useState<ParsedQuantityTask | null>(null);
  const [parseHint, setParseHint] = useState<string | null>(null);
  const [resultQuantity, setResultQuantity] = useState<DecomposeQuantityResult | null>(null);

  /* ───── 通用 ───── */
  const [calcError, setCalcError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  /* 重置：每次开/关弹窗都回到干净状态 */
  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setPhase('input');
      setResultTime(null);
      setResultQuantity(null);
      setCalcError(null);
      setCreateError(null);
      setQuantityInput('');
      setParsed(null);
      setParseHint(null);
    }
  }, [open, defaultMode]);

  /* ESC 关闭（仅 input 阶段） */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase === 'input') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);

  /* 数量型输入：实时解析 + 提示 */
  useEffect(() => {
    if (!open || mode !== 'quantity') return;
    const text = quantityInput.trim();
    if (!text) {
      setParsed(null);
      setParseHint(null);
      return;
    }
    const r: ParseResult = parseQuantitySentence(text);
    if (r.ok) {
      setParsed(r.parsed);
      setParseHint(formatParsePreview(r.parsed));
    } else {
      setParsed(null);
      setParseHint(`⚠️ ${r.reason}`);
    }
  }, [quantityInput, open, mode]);

  const today = toDateString(new Date());
  const startDate = today;
  const days = useMemo(() => daysBetweenInclusive(startDate, deadline), [deadline]);
  const hoursNum = parseFloat(totalHours) || 0;

  /* ───── 时间型：计算 ───── */
  const handleCalcTime = () => {
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
      setResultTime(r);
      setPhase('preview');
    } catch (e) {
      setCalcError(e instanceof Error ? e.message : '计算失败');
    }
  };

  /* ───── 数量型：计算 ───── */
  const handleCalcQuantity = () => {
    setCalcError(null);
    if (!parsed) {
      setCalcError('请输入有效的"动词+数字+量词+名词"任务描述');
      return;
    }
    if (!deadline) { setCalcError('请选择截止日期'); return; }
    if (deadline < startDate) { setCalcError('截止日期不能早于今天'); return; }
    try {
      const r = decomposeTaskByQuantity({
        startDate,
        deadline,
        totalAmount: parsed.amount,
        decay: parseFloat(decay) || DEFAULT_DECAY,
        minPerDay: 1,
      });
      setResultQuantity(r);
      setPhase('preview');
    } catch (e) {
      setCalcError(e instanceof Error ? e.message : '计算失败');
    }
  };

  /* ───── 时间型：创建 ───── */
  const handleCreateTime = async () => {
    if (!resultTime) return;
    setPhase('creating');
    setCreateError(null);
    try {
      let created = 0;
      for (let i = 0; i < resultTime.slots.length; i++) {
        const slot = resultTime.slots[i];
        if (slot.minutes === 0) continue;
        const draft: EventDraft = {
          date: slot.date,
          title: title.trim(),
          start_time: slot.start_time,
          end_time: slot.end_time,
          priority: 2,
          isTodo: false,
          note: `📊 任务拆解 · 第 ${i + 1}/${resultTime.days} 天 · ${formatDuration(slot.minutes)}`,
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

  /* ───── 数量型：创建 —— 每天一个无时间 To-do（is_todo=1） ───── */
  const handleCreateQuantity = async () => {
    if (!resultQuantity || !parsed) return;
    setPhase('creating');
    setCreateError(null);
    try {
      let created = 0;
      const taskTotal = parsed.amount;
      let sumSoFar = 0;
      for (let i = 0; i < resultQuantity.slots.length; i++) {
        const slot = resultQuantity.slots[i];
        if (slot.amount <= 0) continue;
        sumSoFar += slot.amount;
        const isFinalDay = sumSoFar >= taskTotal;
        const todoTitle = renderQuantityTodoTitle(parsed, slot.amount);
        if (!todoTitle) continue;
        const dayIndex = i + 1;
        const noteText = isFinalDay
          ? `📋 无时间任务拆解 · 第 ${dayIndex}/${resultQuantity.days} 天（收官）· 共 ${parsed.amount} ${parsed.unit}`
          : `📋 无时间任务拆解 · 第 ${dayIndex}/${resultQuantity.days} 天`;
        const draft: EventDraft = {
          date: slot.date,
          title: todoTitle,
          start_time: '',
          end_time: '',
          priority: 2,
          isTodo: true,
          note: noteText,
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

        {/* Tab 切换（仅 input 阶段） */}
        {phase === 'input' && (
          <div className="decomposer-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'time'}
              className={`decomposer-tab${mode === 'time' ? ' decomposer-tab--active' : ''}`}
              onClick={() => setMode('time')}
            >
              <span aria-hidden>⏱️</span> 按工时拆
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'quantity'}
              className={`decomposer-tab${mode === 'quantity' ? ' decomposer-tab--active' : ''}`}
              onClick={() => setMode('quantity')}
            >
              <span aria-hidden>📚</span> 按数量拆（无时间任务）
            </button>
          </div>
        )}

        {/* ── Input 阶段 ── */}
        {phase === 'input' && mode === 'time' && (
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
              <button className="primary-btn" onClick={handleCalcTime}>
                生成分解方案 →
              </button>
            </div>
          </div>
        )}

        {phase === 'input' && mode === 'quantity' && (
          <div className="modal__body decomposer-body">
            <p className="decomposer-desc">
              用一句话描述你的无时间任务（例：<strong>读 50 页 书</strong>、<strong>背 30 个 单词</strong>），
              系统按"<strong>前重后轻</strong>"的方式，拆成每天一条 To-do。
            </p>

            <label className="field">
              <span className="field__label">任务描述（动词 + 数字 + 量词 + 名词）</span>
              <input
                ref={quantityRef}
                className="field__input"
                autoFocus
                maxLength={120}
                placeholder="例：读 50 页 书 / 背 30 个 单词 / 看完 12 章 教材"
                value={quantityInput}
                onChange={(e) => setQuantityInput(e.target.value)}
              />
              {parseHint && (
                <div className={`decomposer-parse-hint${parsed ? ' decomposer-parse-hint--ok' : ''}`}>
                  {parseHint}
                </div>
              )}
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

{parsed && (
      <div className="decomposer-summary">
        <div className="decomposer-summary__item decomposer-summary__item--verb">
          <span className="decomposer-summary__label">动词</span>
          <span className="decomposer-summary__val">{parsed.verb}</span>
        </div>
        <div className="decomposer-summary__item decomposer-summary__item--total">
          <span className="decomposer-summary__label">总数</span>
          <span className="decomposer-summary__val">
            {parsed.amount} {parsed.unit}{parsed.noun}
          </span>
        </div>
        <div className="decomposer-summary__item decomposer-summary__item--days">
          <span className="decomposer-summary__label">工作天数</span>
          <span className="decomposer-summary__val">
            {days} 天 · 日均约 {Math.round(parsed.amount / Math.max(days, 1))} {parsed.unit}
          </span>
        </div>
      </div>
    )}

            {calcError && <div className="modal__error">{calcError}</div>}

            <div className="modal__footer">
              <button className="ghost-btn ghost-btn--lg" onClick={onClose}>取消</button>
              <button
                className="primary-btn"
                onClick={handleCalcQuantity}
                disabled={!parsed}
              >
                生成分解方案 →
              </button>
            </div>
          </div>
        )}

        {/* ── Preview 阶段（时间型） ── */}
        {phase === 'preview' && mode === 'time' && resultTime && (
          <div className="modal__body decomposer-body">
            <div className="decomposer-preview-header">
              <div className="decomposer-preview-title">
                <strong>{title || '（未命名）'}</strong>
                <span className="decomposer-preview-meta">
                  {resultTime.days} 天 · 共 {formatDuration(resultTime.totalMinutes)} · 每天 {dailyStartHour}:00 开始
                </span>
              </div>
            </div>

            {resultTime.warnings.length > 0 && (
              <div className="decomposer-warnings">
                {resultTime.warnings.map((w, i) => (
                  <div key={i} className="decomposer-warning">
                    <span aria-hidden>⚠️</span> {w}
                  </div>
                ))}
              </div>
            )}

            <div className="decomposer-timeline">
              {resultTime.slots.map((slot, idx) => {
                const pct = Math.max(2, Math.round((slot.minutes / Math.max(1, Math.max(...resultTime.slots.map((s) => s.minutes)))) * 100));
                const isFirst = idx === 0;
                const isLast = idx === resultTime.slots.length - 1;
                return (
                  <div
                    key={slot.date}
                    className={`decomposer-slot${slot.minutes === 0 ? ' decomposer-slot--zero' : ''}`}
                  >
                    <div className="decomposer-slot__date">
                      <span className="decomposer-slot__day-label">
                        {idx === 0 ? '第1天' : idx === resultTime.slots.length - 1 ? '最后' : `第${idx + 1}天`}
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
              <button className="primary-btn primary-btn--confirm" onClick={handleCreateTime}>
                ✅ 确认创建 {resultTime.slots.filter((s) => s.minutes > 0).length} 个事项
              </button>
            </div>
          </div>
        )}

        {/* ── Preview 阶段（数量型） ── */}
        {phase === 'preview' && mode === 'quantity' && resultQuantity && parsed && (
          <div className="modal__body decomposer-body">
            <div className="decomposer-preview-header">
              <div className="decomposer-preview-title">
                <strong>
                  {parsed.verb} 共 {parsed.amount} {parsed.unit}{parsed.noun ? ' ' + parsed.noun : ''}
                </strong>
                <span className="decomposer-preview-meta">
                  {resultQuantity.days} 天 · 每天 {parsed.unit}数 ≈ {renderTodoTitle(parsed, resultQuantity)}
                </span>
              </div>
            </div>

            {resultQuantity.warnings.length > 0 && (
              <div className="decomposer-warnings">
                {resultQuantity.warnings.map((w, i) => (
                  <div key={i} className="decomposer-warning">
                    <span aria-hidden>⚠️</span> {w}
                  </div>
                ))}
              </div>
            )}

            <div className="decomposer-qlist">
              {resultQuantity.slots.map((slot, idx) => {
                const maxBar = Math.max(1, Math.max(...resultQuantity.slots.map((s) => s.amount)));
                const pct = Math.max(2, Math.round((slot.amount / maxBar) * 100));
                const isFirst = idx === 0;
                const isLast = idx === resultQuantity.slots.length - 1;
                const todoTitle = renderQuantityTodoTitle(parsed, slot.amount);
                return (
                  <div
                    key={slot.date}
                    className={`decomposer-qslot${slot.amount === 0 ? ' decomposer-qslot--zero' : ''}`}
                  >
                    <div className="decomposer-qslot__date">
                      <span className="decomposer-qslot__day-label">
                        {isFirst ? '第1天' : isLast ? '最后' : `第${idx + 1}天`}
                      </span>
                      <span className="decomposer-qslot__date-str">{slot.date.slice(5)}</span>
                      {isFirst && <span className="decomposer-qslot__badge decomposer-qslot__badge--first">今天</span>}
                    </div>
                    <div className="decomposer-qslot__bar-wrap">
                      <div
                        className={`decomposer-qslot__bar${isFirst ? ' decomposer-qslot__bar--first' : ''}${isLast ? ' decomposer-qslot__bar--last' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="decomposer-qslot__todo">
                      {todoTitle || <span className="decomposer-qslot__zero-label">无任务</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="decomposer-preview-foot">
              创建后会以「无时间任务 To-do」的形式出现在每天的 To-do 列表里。
            </div>

            {createError && <div className="modal__error">{createError}</div>}

            <div className="modal__footer">
              <button className="ghost-btn ghost-btn--lg" onClick={() => setPhase('input')}>← 重新设置</button>
              <button
                className="primary-btn primary-btn--confirm"
                onClick={handleCreateQuantity}
              >
                ✅ 确认创建 {resultQuantity.slots.filter((s) => s.amount > 0).length} 个 To-do
              </button>
            </div>
          </div>
        )}

        {/* ── Creating 阶段 ── */}
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

function formatParsePreview(p: ParsedQuantityTask): string {
  return `已识别：${p.verb} · 总数 ${p.amount} ${p.unit}${p.noun ? ' ' + p.noun : ''}`;
}

/** 预览页副标题里显示一段示例。 */
function renderTodoTitle(p: ParsedQuantityTask, r: DecomposeQuantityResult): string {
  const sample = r.slots[0]?.amount ?? 0;
  return `${sample} ${p.unit}`;
}