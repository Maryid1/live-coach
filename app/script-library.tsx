import { useEffect, useState } from 'react';
import { z } from 'zod';

type Draft = { id: string; title: string; text: string; revision: string; updatedAt: string };
export default function ScriptLibrary({ selfHosted, seed, onRead }: { selfHosted: boolean; seed: { title: string; text: string } | null; onRead: (title: string, text: string) => void }) {
  const [items, setItems] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [title, setTitle] = useState(seed?.title || '');
  const [text, setText] = useState(seed?.text || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  async function request(method = 'GET', body?: object) {
    const response = await fetch('/api/scripts', { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw new Error(z.object({ error: z.string().optional() }).parse(data).error || '稿件操作失败。');
    const parsed = z.object({ scripts: z.array(z.object({ id: z.string(), title: z.string(), text: z.string(), revision: z.string(), updatedAt: z.string() })) }).parse(data);
    setItems(parsed.scripts);
  }
  async function refresh() { setBusy(true); try { await request(); setMessage('列表已刷新，电脑和手机共用此账号的服务器稿件。'); } catch (e) { setMessage(e instanceof Error ? e.message : '加载失败'); } finally { setBusy(false); } }
  useEffect(() => { if (selfHosted) void refresh(); }, []);
  useEffect(() => { if (seed) { setEditing(null); setTitle(seed.title); setText(seed.text); } }, [seed]);
  const discard = () => !(title || text) || window.confirm('放弃编辑区尚未保存的内容？');
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (title || text) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [title, text]);
  async function save() {
    if (!title.trim() || !text.trim()) { setMessage('请填写标题和正文。'); return; }
    setBusy(true);
    try { await request(editing ? 'PUT' : 'POST', { ...editing, title, text }); setMessage('已保存到服务器。手机打开稿件库后点击刷新即可看到。'); setEditing(null); setTitle(''); setText(''); }
    catch (e) { setMessage(e instanceof Error ? e.message : '保存失败，内容保留'); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!discard()) return;
    if (file.size > 2 * 1024 * 1024) { setMessage('文件最大 2 MB，请删除图片或改为粘贴正文。'); return; }
    setBusy(true);
    try {
      let content: string;
      if (/\.docx$/i.test(file.name)) {
        const mammoth = await import('mammoth');
        content = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
      } else if (/\.(txt|md)$/i.test(file.name)) content = await file.text();
      else throw new Error('支持 .docx、UTF-8 .txt、.md；旧版 .doc 请另存为 .docx。');
      if (!content.trim() || content.length > 50000) throw new Error('正文为空或超过 50000 字，请拆成多份稿件。');
      setEditing(null); setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 100)); setText(content); setMessage('已提取纯文字，请预览后点击保存。图片与排版不会导入；尚未上传到服务器。');
    } catch (e) { setMessage(e instanceof Error ? e.message : '导入失败，请粘贴文字。'); }
    finally { setBusy(false); }
  }
  function download(item: Draft) {
    const url = URL.createObjectURL(new Blob([item.text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = item.title.replace(/[\\/:*?"<>|]/g, '_') + '.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="library-layout">
    <div className="panel wide-panel"><h2>我的口播稿</h2><p className="muted">完整稿件存服务器，电脑上传、手机选读。最多 100 份，每份 50000 字。收藏片段仍只保存在当前浏览器。</p>
      {!selfHosted && <p className="warning-box">服务器稿件库仅支持自部署版；暖场与本机收藏仍可使用。</p>}
      <label className="field">搜索稿件<input value={query} onChange={e => setQuery(e.target.value)} placeholder="输入稿件名称"/></label>
      <button className="button secondary" disabled={busy || !selfHosted} onClick={refresh}>刷新稿件列表</button>
      {!items.length && <p className="muted">还没有服务器稿件，从上传或粘贴一份口播稿开始。</p>}
      {items.filter(item => item.title.includes(query)).map(item => <article className="saved-script" key={item.id}><h3>{item.title}</h3><p>{item.text.length} 字 · {new Date(item.updatedAt).toLocaleString()}<br/>{item.text.slice(0, 90)}…</p><div className="library-actions">
        <button className="button primary" disabled={busy} onClick={() => { if (discard()) onRead(item.title, item.text); }}>开始提词</button>
        <button className="button secondary" disabled={busy} onClick={() => { if (discard()) { setEditing(item); setTitle(item.title); setText(item.text); } }}>编辑</button>
        <button className="text-button" onClick={() => download(item)}>导出 TXT</button>
        <button className="text-button" disabled={busy} onClick={async () => { if (!window.confirm(`删除“${item.title}”？此操作会影响其他设备。`)) return; setBusy(true); try { await request('DELETE', { id: item.id, revision: item.revision }); setMessage('已删除服务器稿件。'); } catch (e) { setMessage(e instanceof Error ? e.message : '删除失败'); } finally { setBusy(false); } }}>删除</button>
      </div></article>)}
    </div>
    <div className="panel wide-panel"><h2>{editing ? '编辑稿件' : '新建 / 粘贴口播稿'}</h2>
      <p className="tiny">稿件不是录音，不会自动直播。导入与保存不调用 AI，也不消耗模型额度。</p>
      <label className="field">上传稿件（Word / TXT / Markdown）<input type="file" accept=".docx,.txt,.md" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }}/></label>
      <label className="field">稿件名称<input aria-label="稿件名称" maxLength={100} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="如：首次开播 · 亲切版"/></label>
      <label className="field">稿件正文<textarea aria-label="稿件正文" className="library-editor" maxLength={50000} value={text} disabled={busy} onChange={e => setText(e.target.value)} placeholder="粘贴完整口播稿；空行可分段。"/></label>
      <p className="tiny">{text.length}/50000 字 · 保存前请核对导入文字是否完整。</p>
      <div className="library-actions"><button className="button primary" disabled={busy || !selfHosted} onClick={save}>{busy ? '处理中…' : '保存到服务器'}</button><button className="button secondary" disabled={busy} onClick={() => { if (discard()) { setEditing(null); setTitle(''); setText(''); } }}>新建 / 清空</button></div>
      {message && <p className="notice" role="status">{message}</p>}
    </div>
  </section>;
}
