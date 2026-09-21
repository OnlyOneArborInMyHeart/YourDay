import { useEffect, useState } from 'react';

interface Props {
  visible: boolean;
  title: string;
  detail?: string;
  onDone: () => void;
}

export default function AcceptedToast({ visible, title, detail, onDone }: Props) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setShow(true);
    const t = setTimeout(() => { setShow(false); onDone(); }, 1800);
    return () => clearTimeout(t);
  }, [visible, onDone]);

  if (!show) return null;

  return (
    <div className="toast" onClick={() => { setShow(false); onDone(); }}>
      <span className="toast__icon">✓</span>
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {detail && <div style={{ fontSize: 11, opacity: 0.85 }}>{detail}</div>}
      </div>
    </div>
  );
}