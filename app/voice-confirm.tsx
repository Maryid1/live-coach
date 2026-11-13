import { useEffect, useId, useRef } from 'react';

export default function VoiceConfirm({ title, text, onConfirm, onCancel }: { title: string; text: string; onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const el = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    el.showModal(); document.body.style.overflow = 'hidden';
    return () => { el.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="voice-confirm" aria-labelledby={id} aria-describedby={`${id}-body`} onCancel={e => { e.preventDefault(); onCancel(); }}>
    <h2 id={id}>{title}</h2>
    <div className="voice-confirm-body" id={`${id}-body`}>{text}</div>
    <footer><button autoFocus className="button secondary" onClick={onCancel}>取消</button><button className="button primary" onClick={onConfirm}>同意并继续</button></footer>
  </dialog>;
}
