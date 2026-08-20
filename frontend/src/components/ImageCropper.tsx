import { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import './ImageCropper.css';

interface Props {
  /** 待裁剪的图片 URL（一般是本地 File 的 object URL） */
  src: string;
  /** 用户点击"使用此截图"时回调，dataURL 已是裁剪后的最终结果 */
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
  /**
   * 初始裁剪框宽高比；0 或 undefined = 任意比例（自由裁剪）。
   * 设为 16:9 等可在 UI 中作为可切换预设的一部分，这里只暴露当前选中值。
   */
  aspectRatio?: number;
}

/**
 * 独立的"裁剪图片"弹层。
 * - 基于 Cropper.js，自由比例 + 拖拽 + 缩放 + 旋转
 * - 顶部比例预设：自由 / 1:1 / 4:3 / 16:9 / 3:4
 * - 确认后输出 PNG dataURL 给上层直接走 background_image 上传接口
 */
export function ImageCropper({ src, onConfirm, onCancel, aspectRatio = 0 }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const [ratio, setRatio] = useState<number>(aspectRatio);

  useEffect(() => {
    if (!imgRef.current) return;
    // 销毁旧的（如果 ratio 变化触发重创建）
    cropperRef.current?.destroy();
    const c = new Cropper(imgRef.current, {
      viewMode: 1,
      dragMode: 'move',
      background: false,
      autoCropArea: 0.9,
      responsive: true,
      restore: false,
      modal: true,
      guides: true,
      center: true,
      highlight: false,
      movable: true,
      rotatable: true,
      scalable: true,
      zoomable: true,
      zoomOnTouch: true,
      zoomOnWheel: true,
      wheelZoomRatio: 0.1,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      aspectRatio: ratio || NaN,
    });
    cropperRef.current = c;
    return () => {
      c.destroy();
      cropperRef.current = null;
    };
  }, [src, ratio]);

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleConfirm = () => {
    const c = cropperRef.current;
    if (!c) return;
    // 输出最大宽 1600 像素的 PNG，足够时间轴背景使用；过大反而浪费带宽
    const canvas = c.getCroppedCanvas({
      maxWidth: 1600,
      maxHeight: 1600,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onConfirm(dataUrl);
  };

  const handleRotate = (deg: number) => {
    cropperRef.current?.rotate(deg);
  };

  const handleFlip = (dir: 'x' | 'y') => {
    const c = cropperRef.current;
    if (!c) return;
    if (dir === 'x') {
      const cur = c.getData().scaleX ?? 1;
      c.scaleX(cur > 0 ? -1 : 1);
    } else {
      const cur = c.getData().scaleY ?? 1;
      c.scaleY(cur > 0 ? -1 : 1);
    }
  };

  const handleReset = () => {
    cropperRef.current?.reset();
  };

  const ratioOptions: { label: string; value: number }[] = [
    { label: '自由', value: 0 },
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4 / 3 },
    { label: '3:4', value: 3 / 4 },
    { label: '16:9', value: 16 / 9 },
  ];

  return (
    <div className="image-cropper" role="dialog" aria-modal="true" aria-label="裁剪图片">
      <div className="image-cropper__panel">
        <div className="image-cropper__stage">
          <img ref={imgRef} src={src} alt="待裁剪" className="image-cropper__img" />
        </div>

        <div className="image-cropper__toolbar">
          <div className="image-cropper__group">
            <span className="image-cropper__label">比例</span>
            {ratioOptions.map((o) => (
              <button
                key={o.label}
                type="button"
                className={`image-cropper__chip ${ratio === o.value ? 'is-active' : ''}`}
                onClick={() => setRatio(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="image-cropper__group">
            <button type="button" className="image-cropper__chip" onClick={() => handleRotate(-90)} title="逆时针旋转 90°">
              ⟲ 旋转
            </button>
            <button type="button" className="image-cropper__chip" onClick={() => handleFlip('x')} title="水平翻转">
              ⇄ 翻转
            </button>
            <button type="button" className="image-cropper__chip" onClick={handleReset} title="重置">
              ↺ 重置
            </button>
          </div>
        </div>
      </div>

      <div className="image-cropper__footer">
        <span className="image-cropper__hint">拖动图片移动 · 滚轮缩放 · 拖动边框调整裁剪范围</span>
        <div className="image-cropper__actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="primary-btn" onClick={handleConfirm}>
            使用此截图
          </button>
        </div>
      </div>
    </div>
  );
}
