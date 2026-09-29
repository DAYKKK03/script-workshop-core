"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Flame, Grid3X3, LoaderCircle, RefreshCw, Sparkles, Store, Target, TriangleAlert } from "lucide-react";
import { dangerMessageClassName, inputClassName, Panel } from "@/components/ui";
import { TopicDetailDrawer } from "./topic-detail-drawer";
import { formatTopPickForCopy } from "./topic-copy";
import { viralElementNames, type TopicIdea, type TopPick, type TopicObjective } from "./topic-types";

type Project = { id: string; projectName: string; updatedAtLabel?: string };
type ApiResult<T> = { success: true; data: T } | { success: false; error: { code?: string; message: string } };
type Analysis = { track: string; keywords: string[]; audienceScenes: string[]; projectUpdatedAt: string };
type Generated = { ideas: TopicIdea[]; topPicks: TopPick[] };
type GenerationJobCreated = { id: string; status: "queued" | "processing" };
type ActiveGenerationJob = GenerationJobCreated & { createdAt: string; runDeadlineAt: string; projectId: string; analyzedProjectUpdatedAt: string; track: string; keywords: string[]; audienceScenes: string[] };
type GenerationJob =
  | { status: "queued" | "processing" }
  | ({ status: "succeeded" } & Generated)
  | { status: "failed" | "canceled"; message?: string };
const objectives: Record<TopicObjective, string> = { traffic: "引流优先", trust: "信任优先", conversion: "转化优先" };
const difficulties = { low: "低", medium: "中", high: "高" } as const;
const orangeButton = "focus-ring orange-gradient inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#343740] disabled:text-[#9ca3af] disabled:shadow-none";
const generationPollIntervalMs = 2_000;
const generationPollTimeoutMs = 5 * 60_000;

export function TopicIdeasWorkbench({ projects, defaultProjectId }: { projects: Project[]; defaultProjectId: string }) {
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [track, setTrack] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [scenes, setScenes] = useState<string[]>([]);
  const [analyzedAt, setAnalyzedAt] = useState("");
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [selected, setSelected] = useState<TopicIdea | null>(null);
  const [busy, setBusy] = useState<"analyze" | "generate" | null>(null);
  const [error, setError] = useState("");
  const [copyKey, setCopyKey] = useState("");
  const [activeJob, setActiveJob] = useState<{ id: string; status: "queued" | "processing"; createdAt: string } | null>(null);
  const [canceling, setCanceling] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const pollControllerRef = useRef<AbortController | null>(null);
  const generationRunRef = useRef(0);
  const pollTimedOutRef = useRef(false);
  const pendingClientRequestIdRef = useRef("");
  const selectedProject = projects.find((item) => item.id === projectId);
  const validation = validateDimensions(track, keywords, scenes);

  useEffect(() => {
    let mounted = true;
    requestJson<ApiResult<ActiveGenerationJob | null>>("/api/topics/generate/active")
      .then((response) => {
        if (!mounted || !response.success || !response.data) return;
        const job = response.data;
        setProjectId(job.projectId); setTrack(job.track); setKeywords(job.keywords); setScenes(job.audienceScenes); setAnalyzedAt(job.analyzedProjectUpdatedAt);
        resumeJob(job);
      })
      .catch((cause) => { if (mounted) setError(messageOf(cause, "任务恢复失败，请刷新页面重试")); });
    return () => { mounted = false; pollControllerRef.current?.abort(); };
  }, []);

  function resetAnalysis(nextProjectId?: string) {
    if (nextProjectId) setProjectId(nextProjectId);
    setTrack(""); setKeywords([]); setScenes([]); setAnalyzedAt(""); setGenerated(null); setError("");
  }
  function changeDimension(group: "keyword" | "scene", index: number, value: string) {
    const setter = group === "keyword" ? setKeywords : setScenes;
    setter((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
    setGenerated(null); setError("");
  }
  async function analyze() {
    if (busy) return;
    setBusy("analyze"); setError(""); setGenerated(null);
    try {
      const result = await post<ApiResult<Analysis>>("/api/topics/analyze", { projectId });
      if (!result.success) throw new Error(result.error.message);
      if (!result.data.track || result.data.keywords.length !== 5 || result.data.audienceScenes.length !== 5) throw new Error("暂时无法分析商家资料，请稍后重试");
      setTrack(result.data.track); setKeywords(result.data.keywords); setScenes(result.data.audienceScenes); setAnalyzedAt(result.data.projectUpdatedAt);
    } catch (cause) { setError(messageOf(cause, "暂时无法分析商家资料，请稍后重试")); }
    finally { setBusy(null); }
  }
  async function generate() {
    if (busy || validation) { if (validation) setError(validation); return; }
    setBusy("generate"); setError(""); setGenerated(null);
    const runId = ++generationRunRef.current;
    try {
      const clientRequestId = pendingClientRequestIdRef.current || crypto.randomUUID();
      pendingClientRequestIdRef.current = clientRequestId;
      const createdResponse = await requestJson<ApiResult<GenerationJobCreated>>("/api/topics/generate", { method: "POST", body: { clientRequestId, projectId, analyzedProjectUpdatedAt: analyzedAt, track: track.trim(), keywords: keywords.map((x) => x.trim()), audienceScenes: scenes.map((x) => x.trim()) }, timeoutMs: 12_000, stage: "create" });
      if (!createdResponse.success) throw new ApiRequestError(createdResponse.error.message, createdResponse.error.code);
      const created = createdResponse.data;
      if (!created.id || !["queued", "processing"].includes(created.status)) throw new Error("生成任务创建失败，请稍后重试");
      const createdAt = new Date().toISOString();
      setActiveJob({ id: created.id, status: created.status, createdAt });
      pendingClientRequestIdRef.current = "";
      const controller = new AbortController(); pollControllerRef.current = controller;
      pollTimedOutRef.current = false;
      const result = await pollGenerationJob(created.id, createdAt, (status) => setActiveJob((current) => current ? { ...current, status } : current), controller.signal);
      if (!isComplete(result)) throw new Error("选题生成失败，请稍后重试");
      setGenerated(result);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === "PROJECT_PROFILE_CHANGED") resetAnalysis();
      const message = cause instanceof ApiRequestError && cause.stage === "poll"
        ? "状态查询超时，任务可能仍在处理中；请稍后继续查看，不会重复创建任务"
        : cause instanceof ApiRequestError && cause.stage === "create"
        ? "创建选题任务超时，请点击生成重试；系统会沿用本次请求，不会重复创建任务"
        : messageOf(cause, "选题任务创建失败，请稍后重试");
      setError(message);
      if (cause instanceof ApiRequestError && cause.stage === "poll") pollTimedOutRef.current = true;
    }
    finally { if (generationRunRef.current === runId) { setBusy(null); if (!pollTimedOutRef.current) setActiveJob(null); pollControllerRef.current = null; } }
  }
  function resumeJob(job: ActiveGenerationJob) {
    const runId = ++generationRunRef.current;
    setBusy("generate"); setError(""); setActiveJob({ id: job.id, status: job.status, createdAt: job.createdAt });
    const controller = new AbortController(); pollControllerRef.current = controller;
    pollTimedOutRef.current = false;
    pollGenerationJob(job.id, job.createdAt, (status) => setActiveJob((current) => current ? { ...current, status } : current), controller.signal)
      .then((result) => { if (!isComplete(result)) throw new Error("选题生成失败，请稍后重试"); setGenerated(result); requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })); })
      .catch((cause) => { if (!controller.signal.aborted) { if (cause instanceof ApiRequestError && cause.stage === "poll") pollTimedOutRef.current = true; setError(cause instanceof ApiRequestError && cause.stage === "poll" ? "状态查询超时，任务可能仍在处理中；请稍后继续查看，不会重复创建任务" : messageOf(cause, "选题生成失败，请稍后重试")); } })
      .finally(() => { if (generationRunRef.current === runId) { setBusy(null); if (!pollTimedOutRef.current) setActiveJob(null); pollControllerRef.current = null; } });
  }
  async function cancelCurrentJob() {
    if (!activeJob || canceling) return;
    const canceledId = activeJob.id;
    setCanceling(true);
    setError("");
    try {
      await requestJson<ApiResult<{ id: string; status: string }>>(`/api/topics/generate/${encodeURIComponent(canceledId)}`, { method: "DELETE" });
      generationRunRef.current += 1;
      pollControllerRef.current?.abort();
      pollControllerRef.current = null;
      pollTimedOutRef.current = false;
      setActiveJob(null); setBusy(null); setError("");
    } catch (cause) {
      if (!(cause instanceof ApiRequestError && cause.code === "TOPIC_JOB_ALREADY_COMPLETED")) {
        setError("任务取消失败，当前任务仍在处理中");
      }
    } finally { setCanceling(false); }
  }
  const closeDrawer = useCallback(() => { setSelected(null); requestAnimationFrame(() => openerRef.current?.focus()); }, []);
  function openIdea(idea: TopicIdea, event: React.MouseEvent<HTMLButtonElement>) { openerRef.current = event.currentTarget; setSelected(idea); }
  async function copyTopPick(idea: TopicIdea, pick: TopPick, key: string) { if (!selectedProject) { setError("商家项目不存在，请刷新页面重试"); return; } try { await navigator.clipboard.writeText(formatTopPickForCopy(idea, pick, selectedProject)); setCopyKey(key); setTimeout(() => setCopyKey(""), 2000); } catch { setError("复制失败，请重试"); } }

  const analyzed = Boolean(analyzedAt);
  return <div className="space-y-5">
    <Panel>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_auto] lg:items-end">
        <label><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Store size={17} className="text-[#ffb14a]"/>商家项目</span><select className={inputClassName} value={projectId} disabled={Boolean(busy)} onChange={(e) => resetAnalysis(e.target.value)}>{projects.map((p) => <option className="bg-[#11131a]" value={p.id} key={p.id}>{p.projectName}</option>)}</select></label>
        <label><span className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><Target size={17} className="text-[#ffb14a]"/>AI识别赛道</span><input className={inputClassName} value={track} maxLength={80} disabled={!analyzed || Boolean(busy)} placeholder="分析后显示识别结果" onChange={(e) => { setTrack(e.target.value); setGenerated(null); }}/></label>
        <button type="button" onClick={analyze} disabled={Boolean(busy)} className={orangeButton}>{busy === "analyze" ? <LoaderCircle size={17} className="animate-spin"/> : analyzed ? <RefreshCw size={17}/> : <Sparkles size={17}/>} {busy === "analyze" ? "分析中..." : analyzed ? "重新分析" : "分析商家资料"}</button>
      </div>
      <p className="mt-4 text-xs text-[#94a3b8]">将使用“{selectedProject?.projectName}”最新保存的资料进行分析{selectedProject?.updatedAtLabel ? `，项目更新时间 ${selectedProject.updatedAtLabel}` : ""}</p>
    </Panel>
    <StepStatus analyzed={analyzed} generated={Boolean(generated)} busy={busy}/>
    {activeJob ? <div role="status" className="flex flex-col gap-3 rounded-lg border border-[#ffb14a]/30 bg-[#ff7a1a]/10 px-4 py-3 text-sm text-[#ffd4ad] sm:flex-row sm:items-center sm:justify-between"><span><LoaderCircle className="mr-2 inline animate-spin" size={16}/>{activeJob.status === "queued" ? "任务正在排队，请稍候" : "正在生成25个选题，请稍候"}</span><button type="button" onClick={cancelCurrentJob} disabled={canceling} className="focus-ring min-h-11 rounded-md border border-[#ffb14a]/40 px-4 font-semibold hover:bg-[#ff7a1a]/15 disabled:cursor-not-allowed disabled:opacity-60">{canceling ? "取消中..." : "取消当前任务"}</button></div> : null}
    {error ? <div role="alert" className={dangerMessageClassName}><TriangleAlert className="mr-2 inline" size={16}/>{error}</div> : null}
    {analyzed ? <Panel><div className="grid gap-6 lg:grid-cols-2"><DimensionEditor title="行业关键词" help="围绕卖点、痛点、误区或消费决策提炼。" values={keywords} group="keyword" onChange={changeDimension}/><DimensionEditor title="消费对象 / 消费场景" help="越具体，生成的选题越贴近真实消费画面。" values={scenes} group="scene" onChange={changeDimension}/></div><div className="mt-6 flex flex-col items-end gap-2"><button type="button" aria-disabled={Boolean(validation || busy)} disabled={Boolean(validation || busy)} onClick={() => void generate()} className={`${orangeButton} w-full sm:w-auto`}>{busy === "generate" ? <LoaderCircle size={17} className="animate-spin"/> : <Grid3X3 size={17}/>} {busy === "generate" ? "生成中..." : "生成25个选题"}</button>{validation ? <p role="alert" className="text-xs text-[#ff9b92]">{validation}</p> : null}</div></Panel> : null}
    {generated ? <section ref={resultRef} className="scroll-mt-20 space-y-5"><TopPicks data={generated} copyKey={copyKey} onOpen={openIdea} onCopy={copyTopPick}/><TopicResults data={generated} keywords={keywords} scenes={scenes} onOpen={openIdea}/></section> : <Panel><div className="py-12 text-center"><Flame className="mx-auto text-[#64748b]"/><p className="mt-4 text-sm text-[#94a3b8]">分析商家资料后，可生成专属的25宫格选题。</p></div></Panel>}
    <TopicDetailDrawer idea={selected} project={selectedProject ?? null} onClose={closeDrawer}/>
  </div>;
}

function DimensionEditor({ title, help, values, group, onChange }: { title: string; help: string; values: string[]; group: "keyword" | "scene"; onChange: (g: "keyword" | "scene", i: number, v: string) => void }) { return <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold text-white">{title}</h2><span className="text-xs font-semibold text-[#ffb14a]">{values.filter((x) => x.trim()).length}/5</span></div><div className="grid gap-3 sm:grid-cols-2">{values.map((value, index) => <label key={index}><span className="sr-only">{title}{index + 1}</span><input value={value} maxLength={30} onChange={(e) => onChange(group, index, e.target.value)} className={inputClassName}/></label>)}</div><p className="mt-3 text-xs text-[#94a3b8]">{help}</p></section>; }
function StepStatus({ analyzed, generated, busy }: { analyzed: boolean; generated: boolean; busy: "analyze" | "generate" | null }) { const steps = [{name:"识别商家赛道",done:analyzed,active:!analyzed},{name:"确认关键词与场景",done:generated||busy==="generate",active:analyzed&&!generated&&busy!=="generate"},{name:"生成25个选题",done:generated,active:busy==="generate"}]; return <Panel><div className="grid gap-3 md:grid-cols-3">{steps.map((s,i)=><div key={s.name} className={`rounded-lg border p-4 ${s.active?"border-[#ff7a1a]/50 bg-[#ff7a1a]/10":"border-white/10 bg-white/[0.03]"}`}><div className="flex items-center gap-3">{s.done?<Check size={18} className="text-[#43d18b]"/>:s.active&&busy?<LoaderCircle size={18} className="animate-spin text-[#ffb14a]"/>:<span className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-xs">{i+1}</span>}<div><p className="text-sm font-semibold text-white">{s.name}</p><p className="text-xs text-[#94a3b8]">{s.done?"已完成":s.active&&busy?"处理中...":s.active?"当前步骤":"等待中"}</p></div></div></div>)}</div></Panel>; }

function TopPicks({ data, copyKey, onOpen, onCopy }: { data: Generated; copyKey: string; onOpen: (idea: TopicIdea, e: React.MouseEvent<HTMLButtonElement>) => void; onCopy: (idea: TopicIdea, pick: TopPick, key: string) => void }) {
  return <Panel><div className="mb-4"><h2 className="text-xl font-bold text-white">Top 3 优先拍</h2><p className="mt-1 text-sm text-[#94a3b8]">从25个方向中，分别为引流、信任和转化挑选优先选题。</p></div><div className="grid gap-4 xl:grid-cols-3">{data.topPicks.map((pick) => { const idea = findIdea(data.ideas,pick); const key=pick.objective; return <article key={key} className="flex flex-col rounded-lg border border-[#ffb14a]/20 bg-[linear-gradient(145deg,rgba(255,122,26,.12),rgba(255,255,255,.03))] p-5"><div className="flex items-center justify-between"><span className="rounded-full bg-[#ff7a1a]/20 px-3 py-1 text-xs font-bold text-[#ffd4ad]">{objectives[pick.objective]}</span><span className="text-xs text-[#cbd5e1]">拍摄难度：{difficulties[pick.shootingDifficulty]}</span></div><h3 className="mt-4 text-lg font-bold leading-7 text-white">{idea.title}</h3><p className="mt-2 text-xs text-[#94a3b8]">{idea.keyword} · {idea.audienceScene}</p><div className="mt-3 flex flex-wrap gap-1.5">{idea.viralElements.map(v=><span key={v} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-[#cbd5e1]">{v}</span>)}</div><dl className="mt-4 space-y-3 text-sm leading-6"><Row label="推荐理由" value={pick.reason}/><Row label="准备素材" value={pick.requiredMaterials.join("、")}/><Row label="拍摄场景" value={pick.suggestedScene}/><Row label="风险提醒" value={pick.riskNote}/></dl><div className="mt-auto grid grid-cols-2 gap-2 pt-5"><button className="focus-ring min-h-11 rounded-md border border-white/15 text-sm font-semibold text-white hover:bg-white/8" onClick={(e)=>onOpen(idea,e)}>查看详情</button><button className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#ffb14a]/30 bg-[#ff7a1a]/10 text-sm font-semibold text-[#ffd4ad]" onClick={()=>onCopy(idea,pick,key)}>{copyKey===key?<Check size={15}/>:<Copy size={15}/>} {copyKey===key?"已复制":"复制方案"}</button></div></article>; })}</div></Panel>;
}
function Row({label,value}:{label:string;value:string}) { return <div><dt className="font-semibold text-[#ffb14a]">{label}</dt><dd className="text-[#cbd5e1]">{value}</dd></div>; }
function TopicResults({ data, keywords, scenes, onOpen }: { data: Generated; keywords:string[]; scenes:string[]; onOpen:(idea:TopicIdea,e:React.MouseEvent<HTMLButtonElement>)=>void }) {
  return <Panel className="glass-readable"><div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="text-xl font-bold text-white">25宫格选题</h2><p className="mt-1 text-sm text-[#94a3b8]">点击任一选题查看完整方案</p></div><span className="text-xs font-semibold text-[#ffb14a]">共25个</span></div>
    <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1050px] border-separate border-spacing-2"><thead><tr><th scope="col" className="w-40 p-3 text-left text-xs text-[#94a3b8]">场景 × 关键词</th>{keywords.map(k=><th scope="col" key={k} className="rounded-md border border-[#ffb14a]/20 bg-[#ff7a1a]/10 p-3 text-left text-sm text-[#ffd4ad]">{k}</th>)}</tr></thead><tbody>{scenes.map((scene,row)=><tr key={scene}><th scope="row" className="rounded-md border border-white/10 bg-white/5 p-3 text-left text-sm text-[#cbd5e1]">{scene}</th>{keywords.map((_,col)=>{const idea=findIdea(data.ideas,{keywordIndex:col,audienceSceneIndex:row});return <td key={col}><button type="button" title={idea.title} aria-label={`${scene}，${keywords[col]}：${idea.title}`} onClick={(e)=>onOpen(idea,e)} className="focus-ring min-h-24 w-full rounded-md border border-white/10 bg-white/[0.035] p-3 text-left text-sm leading-6 text-white transition hover:border-[#ff7a1a]/50 hover:bg-[#ff7a1a]/8"><span className="line-clamp-3">{idea.title}</span><span className="mt-2 flex flex-wrap gap-1">{idea.viralElements.map(v=><span key={v} className="text-[11px] text-[#ffb14a]">#{v}</span>)}</span></button></td>})}</tr>)}</tbody></table></div>
    <div className="space-y-6 lg:hidden">{scenes.map((scene,row)=><section key={scene}><h3 className="mb-3 border-l-2 border-[#ff7a1a] pl-3 text-base font-bold text-white">{scene}</h3><div className="space-y-3">{keywords.map((keyword,col)=>{const idea=findIdea(data.ideas,{keywordIndex:col,audienceSceneIndex:row});return <button key={keyword} onClick={(e)=>onOpen(idea,e)} className="focus-ring min-h-11 w-full rounded-lg border border-white/10 bg-white/[0.035] p-4 text-left"><span className="text-xs text-[#ffb14a]">{keyword}</span><span className="mt-1 block text-sm leading-6 text-white">{idea.title}</span><span className="mt-2 flex gap-2">{idea.viralElements.map(v=><span key={v} className="text-xs text-[#94a3b8]">#{v}</span>)}</span></button>})}</div></section>)}</div>
  </Panel>;
}
function validateDimensions(track:string,keywords:string[],scenes:string[]) { if(!track.trim()) return "请先确认行业赛道"; if(keywords.length!==5||keywords.some(x=>!x.trim())) return "请填写完整的5个行业关键词"; if(scenes.length!==5||scenes.some(x=>!x.trim())) return "请填写完整的5个消费对象或场景"; if(new Set(keywords.map(x=>x.trim())).size!==5||new Set(scenes.map(x=>x.trim())).size!==5) return "内容不能重复，请调整后再生成"; return ""; }
function findIdea(ideas:TopicIdea[],point:{keywordIndex:number;audienceSceneIndex:number}) { return ideas.find(x=>x.keywordIndex===point.keywordIndex&&x.audienceSceneIndex===point.audienceSceneIndex)!; }
function isComplete(data:Generated) { if(data.ideas.length!==25||data.topPicks.length!==3) return false; const coords=new Set(data.ideas.map(x=>`${x.keywordIndex}:${x.audienceSceneIndex}`)); if(coords.size!==25||[...Array(5)].some((_,r)=>[...Array(5)].some((__,c)=>!coords.has(`${c}:${r}`)))) return false; const allowed=new Set<string>(viralElementNames); if(data.ideas.some(x=>!x.title||!x.opening||!x.hook||!x.viralElementReason||x.viralElements.length<1||x.viralElements.length>2||x.viralElements.some(v=>!allowed.has(v)))) return false; const objectivesSet=new Set(data.topPicks.map(x=>x.objective)); const picks=new Set(data.topPicks.map(x=>`${x.keywordIndex}:${x.audienceSceneIndex}`)); return objectivesSet.size===3&&objectivesSet.has("traffic")&&objectivesSet.has("trust")&&objectivesSet.has("conversion")&&picks.size===3&&[...picks].every(x=>coords.has(x)); }
async function post<T>(url:string,body:unknown):Promise<T> { return requestJson<T>(url, { method: "POST", body }); }
function messageOf(error:unknown,fallback:string){return error instanceof Error&&error.message?error.message:fallback;}

class ApiRequestError extends Error {
  constructor(message: string, readonly code?: string, readonly stage?: "create" | "poll") { super(message); this.name = "ApiRequestError"; }
}

async function requestJson<T>(url: string, options?: { method?: "GET" | "POST" | "DELETE"; body?: unknown; timeoutMs?: number; signal?: AbortSignal; stage?: "create" | "poll" }): Promise<T> {
  let response: Response;
  const controller = options?.timeoutMs || options?.signal ? new AbortController() : null;
  const forwardAbort = () => controller?.abort();
  options?.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = controller && options?.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
  try {
    response = await fetch(url, {
      method: options?.method ?? "GET",
      headers: options?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options?.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller?.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw new ApiRequestError("服务响应超时，请稍后重试", undefined, options?.stage);
    throw new ApiRequestError("网络连接失败，请检查网络后重试", undefined, options?.stage);
  } finally {
    if (timeout) clearTimeout(timeout);
    options?.signal?.removeEventListener("abort", forwardAbort);
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiRequestError("服务响应异常，请稍后重试");
  }
  if (!payload || typeof payload !== "object") throw new ApiRequestError("服务响应异常，请稍后重试");

  const error = "error" in payload && payload.error && typeof payload.error === "object" ? payload.error : null;
  if (!response.ok || error) {
    const message = error && "message" in error && typeof error.message === "string" ? error.message : "请求失败，请稍后重试";
    const code = error && "code" in error && typeof error.code === "string" ? error.code : undefined;
    throw new ApiRequestError(message, code);
  }
  return payload as T;
}

async function pollGenerationJob(jobId: string, createdAt: string, onStatus: (status: "queued" | "processing") => void, signal?: AbortSignal): Promise<Generated> {
  const deadline = Math.max(Date.now() + generationPollIntervalMs, new Date(createdAt).getTime() + generationPollTimeoutMs);
  while (Date.now() < deadline) {
    const response = await requestJson<ApiResult<GenerationJob>>(`/api/topics/generate/${encodeURIComponent(jobId)}`, { timeoutMs: Math.min(15_000, deadline - Date.now()), signal, stage: "poll" });
    if (!response.success) throw new ApiRequestError(response.error.message, response.error.code);
    const job = response.data;
    if (job.status === "succeeded") return { ideas: job.ideas, topPicks: job.topPicks };
    if (job.status === "failed") throw new ApiRequestError(job.message || "选题生成失败，请稍后重试");
    if (job.status === "canceled") throw new ApiRequestError("当前选题任务已取消");
    if (job.status !== "queued" && job.status !== "processing") throw new ApiRequestError("服务响应异常，请稍后重试");
    onStatus(job.status);
    await new Promise((resolve) => setTimeout(resolve, generationPollIntervalMs));
  }
  throw new ApiRequestError("选题生成时间较长，请稍后重新生成");
}
