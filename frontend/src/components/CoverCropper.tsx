import { useEffect, useRef, useState } from 'react';

/**
 * 用户裁剪上传的图片作为唱片封面。
 *
 * 输入：原图 File + 默认 shape（'circle' | 'square' | 'rect'）。
 * 输出（onConfirm）：裁剪参数，单位是原图像素 px。
 *
 * 交互：
 * - 鼠标拖拽框内 → 平移整框
 * - 鼠标拖拽框边/角 → 调整大小（按 alt 自由比例 / 默认约束在形状内）
 * - 切换形状会重置选区为整图中心正方形 / 整图
 * - 确认 / 取消
 */

export type CropShape = 'circle' | 'square' | 'rect';

export interface CropResult {
  shape: CropShape;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  imageWidth: number;
  imageHeight: number;
}

interface Props {
  file: File;
  /** 推荐默认值：唱片是圆的就传 'circle' */
  initialShape?: CropShape;
  onConfirm: (result: CropResult, file: File) => void;
  onCancel: () => void;
}

type Rect = { x: number; y: number; w: number; h: number };
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

const MIN_SIZE = 32; // px（CSS）

export function CoverCropper({ file, initialShape = 'circle', onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const naturalSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const [imgUrl, setImgUrl] = useState<string>('');
  const [shape, setShape] = useState<CropShape>(initialShape);
  // 渲染坐标系（CSS px），与 React state 同步；鼠标操作直接改 state
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; start: Rect } | null>(
    null
  );
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);

  // 把 File 变成可绘制 URL
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 图片加载完后初始化选区 + 绘制
  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;
    naturalSizeRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    drawImage();
    // 默认选区：原图中心方框（占短边 70%）
    const stageW = img.clientWidth;
    const stageH = img.clientHeight;
    const side = Math.min(stageW, stageH) * 0.7;
    setRect({
      x: (stageW - side) / 2,
      y: (stageH - side) / 2,
      w: side,
      h: side,
    });
  };

  // 把原图绘制到 canvas（用于拾色 / 显示原图作背景）
  const drawImage = () => {
    const cv = canvasRef.current;
    const img = imgRef.current;
    if (!cv || !img) return;
    const stageW = img.clientWidth;
    const stageH = img.clientHeight;
    cv.width = stageW;
    cv.height = stageH;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, stageW, stageH);
    ctx.drawImage(img, 0, 0, stageW, stageH);
  };

  /** 切换形状：rect 用整图；其他用最大内切正方形 */
  const applyShapeDefault = (nextShape: CropShape) => {
    const img = imgRef.current;
    if (!img) return;
    const stageW = img.clientWidth;
    const stageH = img.clientHeight;
    if (nextShape === 'rect') {
      setRect({ x: 0, y: 0, w: stageW, h: stageH });
    } else {
      const side = Math.min(stageW, stageH) * 0.7;
      setRect({
        x: (stageW - side) / 2,
        y: (stageH - side) / 2,
        w: side,
        h: side,
      });
    }
  };

  const handleShapeChange = (s: CropShape) => {
    setShape(s);
    applyShapeDefault(s);
  };

  /** move 专用：只夹 x/y，w/h 不变 */
  const clampMove = (r: Rect, stageW: number, stageH: number): Rect => {
    let { x, y, w, h } = r;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > stageW) x = stageW - w;
    if (y + h > stageH) y = stageH - h;
    return { x, y, w, h };
  };

  /** resize 专用：强制 w/h 约束，再夹边界 */
  const clampResize = (r: Rect, stageW: number, stageH: number, isSquare: boolean): Rect => {
    let { x, y, w, h } = r;
    if (isSquare) {
      const side = Math.max(MIN_SIZE, Math.abs(w));
      h = side;
      w = side;
    }
    w = Math.max(MIN_SIZE, w);
    h = Math.max(MIN_SIZE, h);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + w > stageW) x = stageW - w;
    if (y + h > stageH) y = stageH - h;
    return { x, y, w, h };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const mode = (target.dataset.handle as DragMode | undefined) ?? 'move';
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      start: { ...rect },
    };
    e.stopPropagation();
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const img = imgRef.current;
      if (!img) return;
      const stageW = img.clientWidth;
      const stageH = img.clientHeight;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      const s = drag.start;
      const isSquare = shape !== 'rect';
      let next: Rect = { ...s };

      const setSize = (nw: number, nh: number) => {
        if (isSquare) {
          // 强制等比
          const side = Math.max(MIN_SIZE, nw);
          next.w = side;
          next.h = side;
        } else {
          next.w = Math.max(MIN_SIZE, nw);
          next.h = Math.max(MIN_SIZE, nh);
        }
      };

      switch (drag.mode) {
        case 'move':
          next.x = s.x + dx;
          next.y = s.y + dy;
          break;
        case 'nw':
          setSize(s.w - dx, s.h - dy);
          next.x = s.x + (s.w - next.w);
          next.y = s.y + (s.h - next.h);
          break;
        case 'ne':
          setSize(s.w + dx, s.h - dy);
          next.y = s.y + (s.h - next.h);
          break;
        case 'sw':
          setSize(s.w - dx, s.h + dy);
          next.x = s.x + (s.w - next.w);
          break;
        case 'se':
          setSize(s.w + dx, s.h + dy);
          break;
        case 'n':
          next.h = Math.max(MIN_SIZE, s.h - dy);
          next.y = s.y + (s.h - next.h);
          break;
        case 's':
          next.h = Math.max(MIN_SIZE, s.h + dy);
          break;
        case 'w':
          next.w = Math.max(MIN_SIZE, s.w - dx);
          next.x = s.x + (s.w - next.w);
          break;
        case 'e':
          next.w = Math.max(MIN_SIZE, s.w + dx);
          break;
      }
      // move 只夹 x/y；resize 夹 w/h + 边界
      setRect(
        drag.mode === 'move'
          ? clampMove(next, stageW, stageH)
          : clampResize(next, stageW, stageH, isSquare)
      );
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [shape]);

  /** 计算提交：CSS 坐标 → 原图 px 坐标 */
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const stageW = img.clientWidth;
    const stageH = img.clientHeight;
    const nW = naturalSizeRef.current.w;
    const nH = naturalSizeRef.current.h;
    if (!stageW || !stageH || !nW || !nH) return;
    const scaleX = nW / stageW;
    const scaleY = nH / stageH;
    onConfirm(
      {
        shape,
        cropX: Math.round(rect.x * scaleX),
        cropY: Math.round(rect.y * scaleY),
        cropW: Math.round(rect.w * scaleX),
        cropH: Math.round(rect.h * scaleY),
        imageWidth: nW,
        imageHeight: nH,
      },
      file
    );
  };

  // 键盘快捷键：Enter = 应用，Esc = 放弃。mousemove / mouseup 不会触发应用。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, shape]);

  // 形状决定裁剪框视觉（边框圆角 / 蒙板形状）
  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    borderRadius: shape === 'circle' ? '50%' : shape === 'rect' ? 0 : 0,
    border: '2px solid #fff',
    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
    cursor: 'move',
  };

  return (
    <div className="cover-cropper">
      <div className="cover-cropper__banner" role="status">
        <span className="cover-cropper__banner-dot" aria-hidden />
        移动选框调整范围，确认满意后点【<strong>应用</strong>】保存；不点【<strong>放弃</strong>】不会影响原封面
      </div>

      <div className="cover-cropper__header">
        <div className="cover-cropper__shapes" role="tablist" aria-label="裁剪形状">
          {(['circle', 'square', 'rect'] as CropShape[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={shape === s}
              className={`cover-cropper__shape ${shape === s ? 'is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleShapeChange(s);
              }}
            >
              {s === 'circle' ? '圆形' : s === 'square' ? '方形' : '矩形'}
            </button>
          ))}
        </div>
        <div className="cover-cropper__hint">拖动框内移动，拖动边 / 角调整大小</div>
      </div>

      {/* stage 才是拖动范围：裁剪框内 / 手柄 / 空白都通过 pointerdown 进入拖动。
         关键修复：把 pointerdown 限定在 stage 容器，header/footer 的按钮不会被外层误捕获，
         避免「按下任何区域都可能被当作 move 起手」的隐式行为。 */}
      <div
        className="cover-cropper__stage"
        ref={canvasWrapRef}
        onPointerDown={onPointerDown}
      >
        {imgUrl && (
          <img
            src={imgUrl}
            alt="crop source"
            onLoad={handleImgLoad}
            className="cover-cropper__img"
            draggable={false}
          />
        )}
        <canvas ref={canvasRef} className="cover-cropper__canvas" aria-hidden />
        {/* 选区 + 蒙板 */}
        <div ref={overlayRef} style={overlayStyle} aria-hidden>
          {/* 8 个手柄 */}
          {(
            [
              ['nw', 'nwse-resize'],
              ['n', 'ns-resize'],
              ['ne', 'nesw-resize'],
              ['e', 'ew-resize'],
              ['se', 'nwse-resize'],
              ['s', 'ns-resize'],
              ['sw', 'nesw-resize'],
              ['w', 'ew-resize'],
            ] as Array<[DragMode, string]>
          ).map(([mode, cursor]) => (
            <span
              key={mode}
              data-handle={mode}
              className={`cover-cropper__handle cover-cropper__handle--${mode}`}
              style={{ cursor }}
            />
          ))}
        </div>
      </div>

      <div className="cover-cropper__footer">
        <button type="button" className="cover-cropper__btn" onClick={onCancel}>
          放弃
        </button>
        {/* handleConfirm 仅由这个按钮的 onClick / Enter 触发 ——
            移动选框或缩放不会自动应用，必须显式点击此处才上传保存。 */}
        <button type="button" className="cover-cropper__btn cover-cropper__btn--primary" onClick={handleConfirm}>
          应用
        </button>
      </div>
    </div>
  );
}