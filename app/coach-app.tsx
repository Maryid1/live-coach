'use client';

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Activity, ArrowRight, AudioLines, BookOpen, Check, CheckCheck, ChevronRight, CircleHelp, Clipboard, Clock3, Expand, FileText, Globe2, LayoutDashboard, Mic, Pause, Play, Plus, Radio, RefreshCw, Settings2, ShieldCheck, Sparkles, Square, Volume2, X } from 'lucide-react';
import { checkItems, emptyStudio, offlineAnswer, platforms, quickQuestions, reminders, safeUrl, scanRisk, topics, warmup, type Platform, type Result, type Studio } from '../lib/coach';

type Tab = 'desk' | 'scripts' | 'rules' | 'settings';
type Speech = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void; onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
type Saved = { studio: Studio; selected: string[]; custom: Platform[]; words: string; minutes: number };
const storageKey = 'zaichang-settings-v1';
const initial = offlineAnswer(quickQuestions[0], emptyStudio);
const resultSchema = z.object({ answers: z.array(z.object({ title: z.string(), text: z.string() })).length(3), sources: z.array(z.object({ title: z.string(), url: z.string() })), mode: z.string(), question: z.string(), platformIds: z.array(z.string()) });

function loadSettings(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!v || !v.studio || !Object.keys(emptyStudio).every(k => typeof v.studio[k] === 'string')) return null;
    const custom = Array.isArray(v.custom) ? v.custom.filter((p: Platform) => p && typeof p.id === 'string' && p.id.startsWith('custom-') && typeof p.name === 'string' && typeof p.note === 'string' && safeUrl(p.url)).slice(0, 9) : [];
    const ids = [...platforms, ...custom].map(p => p.id);
    const selected = Array.isArray(v.selected) ? v.selected.filter((id: string) => ids.includes(id)) : ['red'];
    return { studio: v.studio, custom, selected: selected.length ? selected : ['red'], words: typeof v.words === 'string' ? v.words.slice(0, 1000) : '', minutes: [1, 3, 5, 10].includes(v.minutes) ? v.minutes : 3 };
  } catch { return null; }
}

export default function CoachApp({ selfHosted = false }: { selfHosted?: boolean }) {
  const [tab, setTab] = useState<Tab>('desk');
  const [studio, setStudio] = useState<Studio>(emptyStudio);
  const [custom, setCustom] = useState<Platform[]>([]);
  const [selected, setSelected] = useState(['red']);
  const [words, setWords] = useState('');
  const [minutes, setMinutes] = useState(3);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<Result>(initial);
  const [activeAnswer, setActiveAnswer] = useState(0);
  const [script, setScript] = useState(initial.answers[0].text);
  const [scriptLabel, setScriptLabel] = useState('示例 · 简短接话');
  const [draftKind, setDraftKind] = useState<'answer' | 'warmup' | 'edited'>('answer');
  const [topic, setTopic] = useState(topics[0]);
  const [long, setLong] = useState(false);
  const [variant, setVariant] = useState(0);
  const [fontSize, setFontSize] = useState(32);
  const [speed, setSpeed] = useState(25);
  const [scrolling, setScrolling] = useState(false);
  const [focus, setFocus] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reminder, setReminder] = useState(0);
  const [checklist, setChecklist] = useState<boolean[]>(checkItems.map(() => false));
  const [checkOpen, setCheckOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [provider, setProvider] = useState("bailian");
  const [searchEnabled, setSearchEnabled] = useState(true);
  const [serviceChecked, setServiceChecked] = useState(false);
  const [online, setOnline] = useState(false);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState('');
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [secureContext, setSecureContext] = useState(true);
  const [history, setHistory] = useState<Result[]>([]);
  const [savedScripts, setSavedScripts] = useState<{ title: string; text: string }[]>([]);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newNote, setNewNote] = useState('');
  const prompter = useRef<HTMLDivElement>(null);
  const recognition = useRef<Speech | null>(null);
  const request = useRef<AbortController | null>(null);
  const sessionStart = useRef(0);
  const lastReminder = useRef(0);
  const allPlatforms = [...platforms, ...custom];
  const activePlatforms = allPlatforms.filter(p => selected.includes(p.id));
  const risks = scanRisk(script, words.split(/[\n,，]/).map(w => w.trim()));

  useEffect(() => {
    const saved = loadSettings();
    if (saved) { setStudio(saved.studio); setSelected(saved.selected); setCustom(saved.custom); setWords(saved.words); setMinutes(saved.minutes); }
    try { setSavedScripts(z.array(z.object({ title: z.string().max(100), text: z.string().max(6000) })).max(20).parse(JSON.parse(localStorage.getItem('zaichang-scripts-v1') || '[]'))); } catch { /* Invalid local drafts do not prevent startup. */ }
    const w = window as unknown as { SpeechRecognition?: new () => Speech; webkitSpeechRecognition?: new () => Speech };
    setSecureContext(window.isSecureContext);
    setSpeechSupported(window.isSecureContext && !!(w.SpeechRecognition || w.webkitSpeechRecognition));
    fetch('/api/assist').then(r => r.json()).then(v => { const status = z.object({ configured: z.boolean(), provider: z.string().optional(), search: z.boolean().optional() }).parse(v); setConfigured(status.configured); setProvider(status.provider || "bailian"); setSearchEnabled(status.search !== false); setServiceChecked(true); }).catch(() => { setConfigured(false); setServiceChecked(true); });
    return () => { recognition.current?.abort(); request.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - sessionStart.current) / 1000);
      setElapsed(seconds);
      const step = Math.floor(seconds / (minutes * 60));
      if (step > lastReminder.current) { lastReminder.current = step; setReminder(n => (n + 1) % reminders.length); }
    }, 1000);
    return () => clearInterval(timer);
  }, [running, minutes]);
  useEffect(() => {
    if (!scrolling) return;
    let frame = 0; let previous = 0; let position = prompter.current?.scrollTop || 0;
    const step = (now: number) => {
      const el = prompter.current;
      if (!el) { setScrolling(false); return; }
      if (previous) { position += (Math.min(now - previous, 100) / 1000) * speed; el.scrollTop = position; }
      previous = now;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) { setScrolling(false); return; }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [scrolling, speed, focus]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setFocus(false); setCheckOpen(false); setScrolling(false); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  useEffect(() => { setScrolling(false); if (prompter.current) prompter.current.scrollTop = 0; }, [script]);
  useEffect(() => { if (!running) setChecklist(checkItems.map(() => false)); }, [running]);
  useEffect(() => {
    if (!checkOpen && !focus) return;
    const before = document.activeElement as HTMLElement | null;
    const container = document.querySelector<HTMLElement>(checkOpen ? '.check-modal' : '.prompter-wrap');
    const controls = () => Array.from(container?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,[tabindex="0"]') || []);
    controls()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = controls(); const first = items[0]; const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); before?.focus(); };
  }, [checkOpen, focus]);

  function saveSettings(next?: Saved) {
    try { localStorage.setItem(storageKey, JSON.stringify(next || { studio, selected, custom, words, minutes })); setNotice('设置已保存到当前浏览器。不会上传密钥、录音或聊天历史。'); } catch { setNotice('浏览器未允许保存设置；当前页面仍可使用，刷新后可能丢失。'); }
  }
  function togglePlatform(id: string) { if (busy) return; setSelected(ids => ids.includes(id) ? (ids.length > 1 ? ids.filter(v => v !== id) : ids) : [...ids, id]); }
  function showAnswer(r: Result, index = 0) { setResult(r); setActiveAnswer(index); setScript(r.answers[index].text); setScriptLabel(r.answers[index].title); setDraftKind('answer'); }
  async function generate() {
    if (!question.trim()) { setNotice('先输入问题，或点击一条常见问题。'); return; }
    setNotice('');
    if (!online) {
      const r = { ...offlineAnswer(question.trim(), studio), platformIds: [...selected] };
      showAnswer(r); setHistory(h => [r, ...h].slice(0, 10)); return;
    }
    if (!consent) { setNotice('请先勾选发送确认；仅问题、所选平台和工作室资料会发送给 AI 服务。'); return; }
    setBusy(true); request.current = new AbortController();
    const timeout = setTimeout(() => request.current?.abort(), 65000);
    try {
      const response = await fetch('/api/assist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, platforms: activePlatforms.map(p => p.name), studio }), signal: request.current.signal });
      const r = await response.json();
      if (!response.ok) throw new Error(z.object({ error: z.string() }).parse(r).error || '暂时无法获得答案。');
      const parsed = resultSchema.parse(r);
      showAnswer(parsed); setHistory(h => [parsed, ...h].slice(0, 10));
    } catch (e) { setNotice(e instanceof Error && e.name !== 'AbortError' ? e.message : '请求已取消或超时，当前读稿保留。'); }
    finally { clearTimeout(timeout); setBusy(false); }
  }
  function speak() {
    if (!speechSupported) { setNotice('当前环境不能开启网页语音，请使用文字或手机输入法的语音输入。'); return; }
    if (listening) { recognition.current?.stop(); return; }
    if (!window.confirm('语音识别可能由浏览器的在线服务处理声音。请勿读出客户姓名、电话或病历。是否开启本次识别？')) return;
    const w = window as unknown as { SpeechRecognition?: new () => Speech; webkitSpeechRecognition?: new () => Speech };
    const API = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!API) { setNotice('当前浏览器不支持语音识别，请直接输入问题。'); return; }
    const rec = new API(); recognition.current = rec; rec.lang = 'zh-CN'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = e => { setQuestion(e.results[0][0].transcript.slice(0, 1500)); setNotice('已转成文字，请确认问题后再生成回答。'); };
    rec.onerror = () => { setListening(false); setNotice('语音识别未成功，请检查麦克风权限、浏览器支持与网络，或手动输入。'); };
    rec.onend = () => setListening(false);
    try { rec.start(); setListening(true); } catch { setNotice('无法启动麦克风，请手动输入。'); }
  }
  function makeScript() { setScript(warmup(topic, studio, long, variant)); setVariant(v => v + 1); setScriptLabel(`暖场 · ${topic}`); setDraftKind('warmup'); setTab('desk'); setNotice('已载入内置暖场稿，可直接编辑。未调用 AI；不是无人直播或自动播放录音。'); }
  function storeScripts(next: { title: string; text: string }[]) {
    try { localStorage.setItem('zaichang-scripts-v1', JSON.stringify(next)); setSavedScripts(next); setNotice('稿件库已更新，仅保存在此浏览器，不会同步到其他手机。'); } catch { setNotice('保存失败，请先复制稿件备份。'); }
  }
  function saveScript() {
    if (savedScripts.some(s => s.text === script)) { setNotice('这段稿件已收藏。'); return; }
    if (savedScripts.length >= 20) { setNotice('最多收藏 20 段，请在暖场话术库删除不需要的稿件。'); return; }
    storeScripts([{ title: scriptLabel.slice(0, 100), text: script }, ...savedScripts]);
  }
  function start() { sessionStart.current = Date.now(); lastReminder.current = 0; setElapsed(0); setRunning(true); setCheckOpen(false); setNotice('助播计时已开始。请在直播平台自行开播；本工具没有推流或读取弹幕。'); }
  function addPlatform() {
    if (!newName.trim() || !safeUrl(newUrl)) { setNotice('请填写平台名称和有效的 HTTPS 规则链接。'); return; }
    if (allPlatforms.some(p => p.name === newName.trim())) { setNotice('该平台名称已经存在。'); return; }
    if (custom.length >= 9) { setNotice('最多可添加 9 个自定义平台。'); return; }
    const item: Platform = { id: `custom-${Date.now()}`, name: newName.trim(), short: newName.trim().slice(0, 1), color: '#558477', url: newUrl, note: newNote.trim() || '请核对该平台当前官方直播规则。', status: '用户添加 · 规则待核对' };
    const next = [...custom, item]; setCustom(next); setNewName(''); setNewUrl(''); setNewNote(''); saveSettings({ studio, selected, custom: next, words, minutes });
  }
  async function copy() { try { await navigator.clipboard.writeText(script); setNotice('当前读稿已复制。'); } catch { setNotice('浏览器不允许复制，可选中文字手动复制。'); } }
  const clock = `${Math.floor(elapsed / 3600).toString().padStart(2, '0')}:${Math.floor(elapsed / 60 % 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

  return <div className={`app-shell ${focus ? 'focus-mode' : ''}`}>
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="在场首页"><span className="brand-mark"><AudioLines size={24}/></span><span>在场<small>LIVE COMPANION</small></span></a>
      <div className="workspace-label">我的助播空间 <span>个人版</span></div>
      <nav aria-label="主要导航">{([{ id: 'desk', label: '直播工作台', icon: LayoutDashboard }, { id: 'scripts', label: '暖场话术库', icon: BookOpen }, { id: 'rules', label: '平台与风险', icon: ShieldCheck }, { id: 'settings', label: '工作室设置', icon: Settings2 }] as const).map(item => <button key={item.id} className={tab === item.id ? 'nav-item selected' : 'nav-item'} onClick={() => { setTab(item.id); setScrolling(false); }}><item.icon size={19}/>{item.label}{tab === item.id && <span className="nav-dot"/>}</button>)}</nav>
      <div className="sidebar-note"><div className="little-orbit"><Activity size={26}/></div><h3>你负责真诚表达，<br/>我陪你从容在场。</h3><p>不是替你直播，<br/>而是让你更有底气。</p></div>
      <button className="sidebar-bottom" onClick={() => setTab('settings')}><span className="avatar">{studio.coach?.slice(0, 1) || '你'}</span><span>{studio.name || '我的健身工作室'}<small>本机资料 · 私人助播</small></span><Settings2 size={16}/></button>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">工作空间 <ChevronRight size={14}/><strong>{{ desk: '直播工作台', scripts: '暖场话术库', rules: '平台与风险', settings: '工作室设置' }[tab]}</strong></div><div className="top-actions"><span className="service-dot"/>{serviceChecked ? configured ? 'AI 服务已配置' : '内置话术模式' : '检查服务中'}<span className="divider"/><button className="plain-button" onClick={() => setCheckOpen(true)}><CheckCheck size={17}/>开播检查</button></div></header>
      <main>
        <section className="page-heading"><div><div className="eyebrow">YOUR VOICE. A LITTLE MORE CONFIDENCE.</div><h1>{{ desk: '从容开口，每一刻都在场。', scripts: '没话题？从一个好问题开始。', rules: '把边界弄清楚，说话更安心。', settings: '让助播真正了解你的工作室。' }[tab]}</h1><p>不必句句完美，先和屏幕另一端的人，好好聊一聊。</p></div><div className="session"><span className={`session-time ${running ? 'on' : ''}`}><i/>{clock}</span><button className={running ? 'button secondary' : 'button primary'} onClick={() => running ? setRunning(false) : setCheckOpen(true)}>{running ? <Square size={14}/> : <Radio size={17}/>} {running ? '结束助播' : '开始助播'}</button></div></section>
        <section className="platform-bar"><div className="platform-title"><Globe2 size={17}/>本场平台<small>可多选</small></div><div className="platform-options">{allPlatforms.map(p => <button disabled={busy} key={p.id} aria-pressed={selected.includes(p.id)} className={`platform-chip ${selected.includes(p.id) ? 'active' : ''}`} onClick={() => togglePlatform(p.id)}><span style={{ background: p.color }}>{p.short}</span>{p.name}{selected.includes(p.id) && <Check size={13}/>}</button>)}<button className="add-platform" onClick={() => setTab('rules')}><Plus size={15}/>扩展平台</button></div><span className="platform-hint">独立助播 · 不连接直播账号</span></section>
        {notice && <div className="notice" role="status"><CircleHelp size={18}/><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><X size={16}/></button></div>}
        {selfHosted && <div className="service-status"><strong>自部署测试版 · v4</strong><span>{!serviceChecked ? '正在检查配置…' : configured ? `${provider === 'zswing' ? 'ZSwing-Plus Responses（未联网）' : provider === 'deepseek' ? 'DeepSeek（未联网）' : '百炼（联网）'}配置已填写，首次生成后才能验证连接和额度。` : '免费内置话术可用；AI 问答等待服务端配置。'}{!secureContext && ' 当前是 HTTP 地址，网页麦克风不可用；可尝试手机输入法自带的语音输入。'}</span><button onClick={() => setTab('settings')}>查看服务说明</button></div>}

        {tab === 'desk' && <div className="desk-grid">
          <section className="question-column">
            <div className="panel ask-panel"><div className="panel-title"><span className="icon-square"><Mic size={18}/></span><h2>接住每一个问题</h2></div><p className="muted">读出观众的问题，或者直接输入。</p><label className="sr-only" htmlFor="question">观众的问题</label><textarea id="question" className="question-input" placeholder="比如：第一次去健身工作室，会不会跟不上？" value={question} maxLength={1500} onChange={e => setQuestion(e.target.value)} disabled={busy}/><div className="input-footer"><button disabled={!speechSupported || busy} className={`mic-button ${listening ? 'recording' : ''}`} onClick={speak}><Mic size={15}/>{listening ? '结束识别' : '点击说问题'}</button><small>{question.length}/1500</small></div>{!speechSupported && <p className="tiny">{secureContext ? '此浏览器未提供可用的语音识别，可使用文字或手机输入法语音输入。' : 'HTTP 网页无法启用麦克风。可尝试手机键盘上的语音输入，确认文字后再生成。'}</p>}
              <label className="toggle-row"><span><Globe2 size={15}/>{searchEnabled ? "联网查证" : (provider === "zswing" ? "ZSwing-Plus AI · 未联网" : "DeepSeek AI · 未联网")} <small>{configured ? '需人工核对' : '待配置'}</small></span><input type="checkbox" checked={online} onChange={e => setOnline(e.target.checked)} disabled={!configured || busy}/></label>
              {online && <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>同意将问题、平台和门店资料发送给 AI 服务；不含录音。</label>}
              <button disabled={busy || listening} className="button primary full" onClick={generate}><Sparkles size={17}/>{busy ? '正在生成和整理…' : online ? (searchEnabled ? '联网生成 3 种答法' : 'AI 生成 3 种答法（未联网）') : '获取 3 种内置答法'}{!busy && <ArrowRight size={16}/>}</button>{busy && <button className="text-button" onClick={() => request.current?.abort()}>取消本次请求</button>}
              <div className="quick-title">试试这些常见问题</div><div className="quick-questions">{quickQuestions.map(q => <button key={q} disabled={busy} onClick={() => setQuestion(q)}>{q}<ChevronRight size={13}/></button>)}</div>
            </div>
            <div className="warm-card"><span className="warm-icon"><AudioLines size={19}/></span><h3>安静的时候，也有话聊</h3><p>一段自然开场，给新进来的朋友<br/>一个留下来的理由。</p><button onClick={() => setTab('scripts')}>找一段暖场稿 <ArrowRight size={16}/></button><span className="warm-decoration" aria-hidden="true">“</span></div>
          </section>

          <section className="answer-column"><div className="panel answers-panel"><div className="answers-top"><div><span className="eyebrow">{draftKind === 'warmup' ? 'WARM-UP SCRIPT' : 'ANSWER ASSIST'}</span><h2>{draftKind === 'warmup' ? '慢慢讲，总会有人听见' : '选一种你舒服的表达'}</h2></div><span className="subtle-badge">{draftKind === 'edited' ? '手动编辑' : draftKind === 'warmup' ? '内置暖场' : result.mode.startsWith('AI') ? 'AI 草稿' : '内置参考'}</span></div><p className="current-question">{draftKind === 'warmup' ? scriptLabel : `“${result.question}”`}</p>{draftKind === 'answer' ? <div className="answer-tabs" role="tablist" aria-label="回答风格">{result.answers.map((a, i) => <button role="tab" aria-selected={activeAnswer === i} key={i} onClick={() => showAnswer(result, i)} className={activeAnswer === i ? 'active' : ''}><span>0{i + 1}</span>{a.title}</button>)}</div> : <button className="text-button" onClick={() => showAnswer(result)}>返回上次问答（会替换当前稿件）</button>}
              <div className="prompter-wrap"><div className="prompter-toolbar"><span><span className="green-dot"/>提词区 <small>{scriptLabel}</small></span><div><button aria-label="减小字号" onClick={() => setFontSize(s => Math.max(22, s - 2))}>A−</button><button aria-label="增大字号" onClick={() => setFontSize(s => Math.min(60, s + 2))}>A+</button><button title={focus ? '退出专注模式' : '专注提词模式'} aria-label={focus ? '退出专注模式' : '专注提词模式'} onClick={() => setFocus(f => !f)}>{focus ? <X size={17}/> : <Expand size={17}/>}</button></div></div><div ref={prompter} className="prompter" style={{ fontSize }}><p>{script}</p><span className="end-marker">— 放慢一点，等一等回应 —</span></div><div className="prompter-controls"><button className="play-control" onClick={() => { if (!scrolling && prompter.current && prompter.current.scrollTop + prompter.current.clientHeight >= prompter.current.scrollHeight - 1) prompter.current.scrollTop = 0; setScrolling(s => !s); }}>{scrolling ? <Pause size={15}/> : <Play size={15}/>} {scrolling ? '暂停滚动' : '自动滚动'}</button><label className="speed-control">慢 <input aria-label="提词滚动速度" type="range" min="10" max="60" value={speed} onChange={e => setSpeed(+e.target.value)}/> 快</label><button className="plain-button" onClick={copy} aria-label="复制当前读稿"><Clipboard size={15}/></button></div></div>
              <button className="text-button" onClick={saveScript}><BookOpen size={15}/>收藏当前稿件</button><div className="answer-caption"><ShieldCheck size={15}/><span>{draftKind === 'warmup' ? '内置暖场模板 · 未联网生成' : draftKind === 'edited' ? '已手动修改 · 原答案引用不代表为编辑内容背书' : result.mode}。不是个体训练处方。</span></div>
              {draftKind === 'answer' && result.sources.length > 0 && <details className="sources"><summary>查看参考来源（{result.sources.length}）</summary>{result.sources.map((s, i) => safeUrl(s.url) && <a key={i} href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a>)}</details>}
              <details className="edit-script"><summary>按自己的习惯调整读稿</summary><textarea aria-label="编辑当前读稿" value={script} maxLength={6000} onChange={e => { setScript(e.target.value); setScriptLabel('已手动编辑'); setDraftKind('edited'); }}/></details>
            </div><div className="recent-strip"><Clock3 size={16}/><span>本场记录</span><small>{history.length ? `${history.length} 条 · 仅当前会话` : '还没有提问，先试着接住第一个问题'}</small></div>{history.length > 0 && <div className="history">{history.map((r, i) => <button key={i} onClick={() => { showAnswer(r); setQuestion(r.question); }}>{r.question}<ChevronRight size={14}/></button>)}</div>}
          </section>

          <aside className="support-column"><section className="panel presence-panel"><div className="section-line"><h2><Activity size={17}/>在场状态</h2><span className="subtle-badge">定时提醒</span></div><div className="presence-visual" aria-hidden="true"><div className="presence-head"/><div className="presence-body"/><span className="frame-corner tl"/><span className="frame-corner tr"/><span className="frame-corner bl"/><span className="frame-corner br"/><div className="eye-line"/><span className="eye-note">视线靠近镜头</span></div><div className="presence-message" aria-live="polite"><strong>{reminders[reminder]}</strong><p>{running ? `每 ${minutes} 分钟轻提醒一次` : '开始助播后启用定时提醒'}</p></div><button className="text-button" onClick={() => setReminder(n => (n + 1) % reminders.length)}><RefreshCw size={13}/>换个提醒</button><div className="privacy-note">示意图 · 未开启摄像头或自动形象分析</div></section>
            <section className="panel risk-panel"><div className="section-line"><h2><ShieldCheck size={18}/>口播风险提醒</h2><span className={risks.length ? 'risk-count' : 'subtle-badge'}>{risks.length ? `${risks.length} 处` : '本地自查'}</span></div>{risks.length ? risks.slice(0, 3).map((r, i) => <div className="risk-item" key={i}><strong>“{r.phrase}”</strong><p>{r.reason}</p><small>{r.suggestion}</small></div>) : <div className="risk-empty"><Check size={17}/><p>当前读稿未命中内置关注词。<small>不代表已通过平台审核。</small></p></div>}<div className="risk-footer">只检查当前读稿，不监听实际口播。<br/>规则需人工核对，不是官方禁词库。</div><button className="text-button" onClick={() => setTab('rules')}>查看平台规则与自定义词 <ArrowRight size={13}/></button></section>
            <details className="panel platform-reminders"><summary>本场平台提示 · {activePlatforms.length} 个平台</summary>{activePlatforms.map(p => <div key={p.id}><strong>{p.name} · 待核对</strong><p>{p.note}</p><a href={p.url} target="_blank" rel="noreferrer">核对规则原文 ↗</a></div>)}</details>
            <div className="gentle-note"><Volume2 size={16}/><span>别急着推课，先回答问题。<br/><strong>被理解，比被说服更重要。</strong></span></div>
          </aside>
        </div>}

        {tab === 'scripts' && <section className="subpage-grid"><div className="panel wide-panel"><div className="panel-title"><BookOpen size={20}/><h2>暖场话题</h2><span className="subtle-badge">内置模板 · 可编辑</span></div><p className="muted">没有观众互动，不等于主播离场。选一个话题，自然地讲下去。</p><div className="topic-grid">{topics.map((t, i) => <button className={`topic-card ${topic === t ? 'active' : ''}`} key={t} onClick={() => setTopic(t)}><span>0{i + 1}</span><h3>{t}</h3><p>{['缓解陌生感，聊聊起点', '从可坚持的节奏说起', '用真实资料介绍自己', '先了解，再安排训练', '不编价格，不虚构优惠', '不催促，留下一点温度'][i]}</p>{topic === t && <Check size={18}/>}</button>)}</div><div className="script-length"><span>内容长度</span><button className={!long ? 'active' : ''} onClick={() => setLong(false)}>短稿</button><button className={long ? 'active' : ''} onClick={() => setLong(true)}>展开聊聊</button></div><button className="button primary" onClick={makeScript}><FileText size={17}/>放进提词区<ArrowRight size={16}/></button></div><div className="panel wide-panel"><div className="eyebrow">SCRIPT PREVIEW</div><h2>{topic}</h2><div className="script-preview">{warmup(topic, studio, long, variant)}</div><p className="tiny">模板根据已填写资料拼接；未填写的价格、教练资质和案例不会凭空补充。</p>{configured && <><label className="field">自定义暖场话题<input aria-label="自定义暖场话题" value={topic} maxLength={200} onChange={e => setTopic(e.target.value)}/></label><button className="button secondary" onClick={() => { setQuestion(`请为健身工作室真人直播写三种不同角度的${long ? "展开" : "简短"}暖场口播稿，话题：${topic}`); setOnline(true); setTab("desk"); setNotice("话题已放进问题框，请确认发送内容后点击 AI 生成。尚未调用 AI。"); }}>用这个话题准备 AI 暖场</button></>}</div></section>}{tab === 'scripts' && <section className="panel wide-panel saved-scripts"><h2>我的稿件收藏 · {savedScripts.length}/20</h2><p className="muted">仅此浏览器保存；换手机或清除浏览器数据不会保留。</p>{!savedScripts.length && <p>在提词区点击“收藏当前稿件”，把顺口的表达留下来。</p>}{savedScripts.map((item, i) => <div className="saved-script" key={i}><strong>{item.title}</strong><p>{item.text.slice(0, 100)}…</p><button className="button secondary" onClick={() => { setScript(item.text); setScriptLabel(item.title); setDraftKind("edited"); setTab("desk"); }}>载入提词区</button><button className="text-button" onClick={() => { if (window.confirm("删除这段收藏稿件？")) storeScripts(savedScripts.filter((_, n) => n !== i)); }}>删除收藏</button></div>)}</section>}

        {tab === 'rules' && <section className="rules-layout"><div className="panel wide-panel"><div className="panel-title"><ShieldCheck size={20}/><h2>平台规则工作区</h2></div><div className="warning-box">这里提供规则入口和人工核对提醒，不提供“保证过审”的禁词表。多平台选择不会自动验证各平台全部规则。</div>{allPlatforms.map(p => <div className="platform-rule" key={p.id}><div className="section-line"><h3><span className="platform-square" style={{ background: p.color }}>{p.short}</span>{p.name}</h3><span className="subtle-badge">待核对</span></div><p>{p.note}</p><small>{p.status}</small><a href={p.url} target="_blank" rel="noreferrer">打开规则来源 ↗</a></div>)}<p className="tiny">规则入口整理于 2026-11-04；部分官方正文不可直接读取。请以开播当日后台规则和账号权限为准。</p></div><div><div className="panel wide-panel"><h2>扩展一个平台</h2><p className="muted">共用问答和提词，独立维护平台信息。</p><label className="field">平台名称<input value={newName} maxLength={20} placeholder="如：哔哩哔哩" onChange={e => setNewName(e.target.value)}/></label><label className="field">官方规则链接<input type="url" value={newUrl} placeholder="https://…" maxLength={1000} onChange={e => setNewUrl(e.target.value)}/></label><label className="field">额外提醒<textarea value={newNote} maxLength={500} placeholder="需要开播前核对的注意事项" onChange={e => setNewNote(e.target.value)}/></label><button className="button primary" onClick={addPlatform}><Plus size={16}/>添加并保存平台</button></div><div className="panel wide-panel words-panel"><h2>自定义关注词</h2><p className="muted">一行一个或逗号分隔。仅作为提醒，不等于官方禁词。</p><textarea aria-label="自定义关注词" value={words} maxLength={1000} placeholder={'例如：\n保证见效\n限时最低价'} onChange={e => setWords(e.target.value)}/><button className="button secondary" onClick={() => saveSettings()}>保存关注词</button></div></div></section>}

        {tab === 'settings' && <section className="subpage-grid"><div className="panel wide-panel"><h2>工作室资料</h2><p className="muted">只填真实、已确认的信息。不填写也能使用助播。</p>{([{ key: 'name', label: '工作室名称', placeholder: '你的健身工作室名称', max: 100 }, { key: 'coach', label: '教练称呼', placeholder: '观众怎么称呼你？', max: 100 }, { key: 'city', label: '所在城市 / 区域', placeholder: '不必填写详细私人地址', max: 100 }, { key: 'audience', label: '主要服务人群', placeholder: '如：希望养成运动习惯的新手', max: 300 }] as const).map(f => <label className="field" key={f.key}>{f.label}<input value={studio[f.key]} maxLength={f.max} placeholder={f.placeholder} onChange={e => setStudio(s => ({ ...s, [f.key]: e.target.value }))}/></label>)}<label className="field">已确认的课程信息<textarea maxLength={1000} value={studio.offer} placeholder="实际课程内容、价格、时长、条件；不要填客户隐私。" onChange={e => setStudio(s => ({ ...s, offer: e.target.value }))}/></label><button className="button primary" onClick={() => saveSettings()}><Check size={16}/>保存工作室资料</button></div><div><div className="panel wide-panel"><h2>助播偏好</h2><label className="field">状态提醒间隔<select value={minutes} onChange={e => { setMinutes(+e.target.value); lastReminder.current = Math.floor(elapsed / (+e.target.value * 60)); }}>{[1, 3, 5, 10].map(n => <option value={n} key={n}>{n} 分钟</option>)}</select></label><button className="button secondary" onClick={() => saveSettings()}>保存偏好与所选平台</button></div><div className="panel wide-panel words-panel"><div className="section-line"><h2>AI 服务</h2><span className="subtle-badge">{configured ? '已配置' : '待接入'}</span></div><p className="muted">配置后可生成三种答法。百炼适配器支持搜索；本版 DeepSeek 和 ZSwing-Plus Responses 仅生成草稿，未接入搜索。当前内置模板不等于 AI。</p><p className="tiny">{selfHosted ? "在服务器 .env 中设置 AI_PROVIDER=deepseek，填写 DEEPSEEK_API_KEY、DEEPSEEK_MODEL；或设置 AI_PROVIDER=bailian，填写 DASHSCOPE_API_KEY、DASHSCOPE_BASE_URL、DASHSCOPE_MODEL。第三方设置 AI_PROVIDER=zswing，填写 ZSWING_API_KEY、ZSWING_MODEL，固定使用 ZSwing-Plus Responses 地址。配置需传入容器后生效，不会自动切换服务商。" : "管理员需在服务端配置 OPENAI_API_KEY 和支持 Web Search 的 OPENAI_MODEL。"}不要把密钥粘贴进问题、工作室资料或网页源码。模型和搜索调用可能产生费用；配置状态不代表连接测试成功。</p><p className="tiny">没有配置时，服务不会伪造联网结果。AI 返回内容仍需人工核对；涉及身体不适时优先提示专业评估。</p></div><div className="privacy-card"><ShieldCheck size={20}/><h3>隐私与能力边界</h3><p>资料与主动收藏的稿件只保存在当前浏览器；问题历史刷新即清除。清除浏览器数据会删除收藏。语音由浏览器服务处理，需单次授权。当前不读取弹幕、不推流、不录音、不调用摄像头、不自动判断衣着或表情。</p></div></div></section>}
        <footer className="footer"><span>在场 · 给真人主播的一点底气</span><span>辅助参考，不替代平台审核与专业评估</span></footer>
      </main>
    </div>
    {checkOpen && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setCheckOpen(false); }}><section className="check-modal" role="dialog" aria-modal="true" aria-labelledby="check-title"><button className="modal-close" aria-label="关闭开播检查" onClick={() => setCheckOpen(false)}><X size={20}/></button><span className="icon-square"><CheckCheck size={24}/></span><h2 id="check-title">开播前，给自己一分钟。</h2><p className="muted">本次平台：{activePlatforms.map(p => p.name).join('、')}</p>{checkItems.map((item, i) => <label className="check-item" key={item}><input type="checkbox" checked={checklist[i]} onChange={e => setChecklist(c => c.map((v, n) => n === i ? e.target.checked : v))}/><span>{item}</span></label>)}<p className="tiny">此处仅启动助播计时，不会开启平台直播。每次重新开始都会重新计时。</p><button className="button primary full" disabled={!checklist.every(Boolean)} onClick={start}><Radio size={17}/>检查完成，开始助播</button></section></div>}
  </div>;
}
