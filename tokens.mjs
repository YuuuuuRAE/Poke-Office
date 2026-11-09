// 토큰 분석: Claude Code 대화 기록(.jsonl)을 읽어 "어디서 토큰이 많이 드는지" 계산해요.
//
// 원리
// - 응답(API 호출)마다 기록된 컨텍스트 크기(input + cache_read + cache_creation)의 증가량을
//   직전 응답 뒤에 들어온 것들(툴 결과 · 프롬프트 · 주입된 내용 · Claude 출력)에 글자 수 비율로 나눠 붙여요.
// - 첫 응답의 컨텍스트는 "기본 컨텍스트"예요. 시스템 프롬프트 · 툴 정의(api-request-shape) · 처음 주입된 내용으로 나눠요.
// - 한 번 들어온 내용은 이후 응답마다 다시 읽혀요(캐시 읽기). 그래서 크기 × 이후 응답 수 = "누적 재읽기"가 실제 비용에 가까워요.
// - 값은 근사치예요. 어느 작업이 컨텍스트를 키웠는지 찾는 용도로 쓰세요.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_ATTACH = new Set(['deferred_tools_record', 'prompt_snapshot', 'credential_org', 'remote_session_change', 'thinking_drop', 'model', 'auto_mode', 'environment']);
const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).slice(-2).join('/');
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

function targetOf(name, i = {}) {
  if (i.file_path || i.notebook_path) return base(i.file_path || i.notebook_path);
  if (i.command) return clip(i.command, 60);
  if (i.pattern) return clip(i.pattern, 50) + (i.path ? ` in ${base(i.path)}` : '');
  if (i.url) return clip(i.url.replace(/^https?:\/\//, ''), 60);
  if (i.query) return clip(i.query, 50);
  if (i.skill) return i.skill;
  if (i.description) return clip(i.description, 50);
  if (/^mcp__/.test(name || '')) { const v = Object.values(i).find((x) => typeof x === 'string' && x.trim()); if (v) return clip(v, 50); }
  return '';
}
function charsOf(c) {
  if (typeof c === 'string') return c.length;
  if (!Array.isArray(c)) return c ? JSON.stringify(c).length : 0;
  let n = 0;
  for (const b of c) {
    if (b.type === 'text') n += (b.text || '').length;
    else if (b.type === 'image') n += 6000; // 이미지는 대략 1.5k 토큰
    else if (b.type === 'tool_result') n += charsOf(b.content);
    else n += JSON.stringify(b).length;
  }
  return n;
}
const mcpServer = (name) => (/^mcp__/.test(name) ? name.split('__')[1] : null);

function readLines(file) {
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) { if (!line) continue; try { out.push(JSON.parse(line)); } catch {} }
  return out;
}

// 서브에이전트: 세션 폴더/subagents/*.jsonl 마다 응답 수와 토큰 합계
function subagents(dir) {
  const out = [];
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { return out; }
  for (const f of files) {
    const seen = new Set(); let calls = 0, outT = 0, fresh = 0, read = 0, label = '', ts = null;
    for (const e of readLines(join(dir, f))) {
      if (!label && e.type === 'user') { const c = e.message?.content; label = clip(typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join(' ') : '', 70); ts = Date.parse(e.timestamp) || null; }
      const u = e.type === 'assistant' && e.message?.usage; if (!u || seen.has(e.message.id)) continue;
      seen.add(e.message.id); calls++; outT += u.output_tokens || 0; fresh += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0); read += u.cache_read_input_tokens || 0;
    }
    if (calls) out.push({ label: label || f.replace(/\.jsonl$/, ''), calls, out: outT, fresh, cacheRead: read, ts });
  }
  return out.sort((a, b) => b.out + b.fresh - (a.out + a.fresh));
}

export function analyze(file) {
  const L = readLines(file);
  const toolUse = new Map(); // tool_use id → { name, input }
  const shapes = new Map(); let firstShape = null, lastShape = null, lastReqShape = null;
  const calls = []; const seen = new Set();
  let pending = [], items = [], shrinks = [], cacheMisses = [];
  let prev = null, baseline = null, compactTokens = 0;
  let out = 0, thinking = 0, fresh = 0, cacheRead = 0;

  for (const e of L) {
    if (e.type === 'api-request-shape' && e.shape) { shapes.set(e.shapeHash, e.shape); lastShape = e.shape; continue; }
    if (e.type === 'api-request' && e.querySource === 'repl_main_thread') { lastReqShape = shapes.get(e.shapeHash) || lastReqShape; continue; }
    if (e.isSidechain) continue;
    const ts = Date.parse(e.timestamp) || null;
    if (e.type === 'attachment') {
      const t = e.attachment?.type; if (!t || SKIP_ATTACH.has(t)) continue;
      pending.push({ cat: 'inject', label: `주입: ${t}`, target: '', chars: JSON.stringify(e.attachment).length, ts });
      continue;
    }
    if (e.type === 'user') {
      const c = e.message?.content;
      if (Array.isArray(c) && c.some((b) => b.type === 'tool_result')) {
        for (const b of c) {
          if (b.type !== 'tool_result') { pending.push({ cat: 'inject', label: '주입: 리마인더', target: '', chars: charsOf([b]), ts }); continue; }
          const tu = toolUse.get(b.tool_use_id) || { name: '툴', input: {} };
          pending.push({ cat: 'tool', tool: tu.name, label: tu.name, target: targetOf(tu.name, tu.input), key: tu.name + JSON.stringify(tu.input).slice(0, 600), chars: charsOf(b.content), ts });
        }
      } else {
        const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
        const injected = e.isMeta || /^\s*<(system-reminder|command-|local-command)/.test(text);
        if (e.isCompactSummary) pending.push({ cat: 'compact', label: '압축 요약', target: '', chars: charsOf(c), ts });
        else pending.push({ cat: injected ? 'inject' : 'prompt', label: injected ? '주입: 리마인더 / 명령' : '프롬프트', target: injected ? '' : clip(text, 60), chars: charsOf(c), ts });
      }
      continue;
    }
    if (e.type !== 'assistant' || !e.message) continue;
    const m = e.message, u = m.usage;
    for (const b of m.content || []) if (b.type === 'tool_use') toolUse.set(b.id, { name: b.name, input: b.input || {} });
    const fresh1 = !seen.has(m.id);
    if (fresh1 && u) {
      seen.add(m.id);
      const ctx = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      const call = { i: calls.length, ts, ctx, out: u.output_tokens || 0, cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0 };
      calls.push(call);
      out += call.out; thinking += u.output_tokens_details?.thinking_tokens || 0; fresh += (u.input_tokens || 0) + call.cw; cacheRead += call.cr;
      if (!prev) {
        baseline = { tokens: ctx, shape: lastReqShape || lastShape, init: pending };
        firstShape = baseline.shape;
      } else {
        const delta = ctx - prev.ctx;
        if (delta < -2000) { shrinks.push({ ts, from: prev.ctx, to: ctx }); items.forEach((x) => { if (x.dropAt == null) x.dropAt = call.i; }); compactTokens = Math.max(0, ctx - (baseline?.tokens || 0)); }
        else if (delta > 0) {
          const total = pending.reduce((n, x) => n + x.chars, 0);
          if (total > 0) pending.forEach((x) => { x.tokens = Math.round(delta * x.chars / total); x.at = call.i; items.push(x); });
          else items.push({ cat: 'other', label: '알 수 없음', target: '', tokens: delta, at: call.i, ts });
        }
        if (delta >= -2000 && call.cw > 20000 && call.cr < prev.ctx * 0.5) cacheMisses.push({ ts, tokens: call.cw, gapMin: prev.ts && ts ? Math.round((ts - prev.ts) / 60000) : null });
      }
      prev = call; pending = [];
    }
    // 이 응답에서 Claude가 쓴 내용은 다음 응답의 컨텍스트가 돼요
    for (const b of m.content || []) {
      if (b.type === 'thinking') pending.push({ cat: 'claude', label: 'Claude 생각', target: '', chars: (b.thinking || '').length, ts });
      else if (b.type === 'text') pending.push({ cat: 'claude', label: 'Claude 답변', target: '', chars: (b.text || '').length, ts });
      else if (b.type === 'tool_use') pending.push({ cat: 'claude', label: 'Claude 툴 호출', target: b.name, chars: JSON.stringify(b.input || {}).length, ts });
    }
  }
  const N = calls.length;
  items.forEach((x) => { const last = x.dropAt ?? N; x.rereads = Math.max(0, last - x.at - 1); x.reread = x.tokens * x.rereads; });

  // 기본 컨텍스트 나누기 (글자 수 비율)
  const baseParts = [], toolDefs = [];
  if (baseline) {
    const sh = baseline.shape || {}; const sys = (sh.system || []).reduce((n, b) => n + (b.text || '').length, 0);
    const defs = (sh.tools || []).map((t) => ({ name: t.name || t.type, chars: JSON.stringify(t).length }));
    const init = baseline.init.reduce((n, x) => n + x.chars, 0);
    const all = sys + defs.reduce((n, d) => n + d.chars, 0) + init || 1, k = baseline.tokens / all;
    const builtin = defs.filter((d) => !mcpServer(d.name)), mcp = {};
    defs.filter((d) => mcpServer(d.name)).forEach((d) => { const s = mcpServer(d.name); mcp[s] = (mcp[s] || 0) + d.chars; });
    baseParts.push({ label: '시스템 프롬프트', tokens: Math.round(sys * k) });
    baseParts.push({ label: `기본 툴 정의 (${builtin.length}개)`, tokens: Math.round(builtin.reduce((n, d) => n + d.chars, 0) * k) });
    Object.entries(mcp).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => baseParts.push({ label: `MCP 툴 정의: ${s} (${defs.filter((d) => mcpServer(d.name) === s).length}개)`, tokens: Math.round(c * k) }));
    if (init) baseParts.push({ label: '처음 주입된 내용 (CLAUDE.md / 메모리 / 환경 / 첫 프롬프트)', tokens: Math.round(init * k) });
    // 지금 쓰는 툴 정의 크기 (마지막 shape 기준)
    const now = lastShape || sh; (now.tools || []).forEach((t) => toolDefs.push({ name: t.name || t.type, tokens: Math.round(JSON.stringify(t).length * k) }));
    toolDefs.sort((a, b) => b.tokens - a.tokens);
  }

  // 지금 컨텍스트 구성 (압축 이후 남은 것만)
  const live = items.filter((x) => x.dropAt == null), byCat = {};
  live.forEach((x) => { const key = x.cat === 'tool' ? `툴 결과: ${x.tool}` : x.cat === 'claude' ? x.label : x.cat === 'prompt' ? '프롬프트' : x.cat === 'compact' ? '압축 요약' : x.cat === 'inject' ? '주입된 내용 (리마인더 / 훅 / 첨부)' : '그 밖'; byCat[key] = (byCat[key] || 0) + x.tokens; });
  const nowParts = [...(baseline ? [{ label: '기본 컨텍스트', tokens: baseline.tokens }] : []), ...(compactTokens ? [{ label: '압축된 이전 대화', tokens: compactTokens }] : []),
    ...Object.entries(byCat).map(([label, tokens]) => ({ label, tokens })).sort((a, b) => b.tokens - a.tokens)];

  // 반복된 툴 작업 (같은 툴 + 똑같은 입력)
  const rep = new Map();
  items.filter((x) => x.cat === 'tool' && x.target).forEach((x) => { const k = x.key; const r = rep.get(k) || { label: `${x.tool} ${x.target}`, count: 0, tokens: 0, reread: 0 }; r.count++; r.tokens += x.tokens; r.reread += x.reread; rep.set(k, r); });

  const sid = file.split(/[\\/]/).pop().replace(/\.jsonl$/, '');
  const subDir = join(file.replace(/\.jsonl$/, ''), 'subagents');
  const top = items.filter((x) => x.cat !== 'claude' || x.tokens > 0).sort((a, b) => b.reread + b.tokens - (a.reread + a.tokens)).slice(0, 15)
    .map(({ cat, label, target, tokens, reread, rereads, ts }) => ({ cat, label, target, tokens, reread, rereads, ts }));
  return {
    session: sid, calls: N, out, thinking, fresh, cacheRead, ctxNow: prev ? prev.ctx : 0,
    baseline: baseline ? { tokens: baseline.tokens, parts: baseParts } : null,
    now: nowParts, top,
    repeats: [...rep.values()].filter((r) => r.count > 1).sort((a, b) => b.reread + b.tokens - (a.reread + a.tokens)).slice(0, 10),
    cacheMisses, shrinks, toolDefs: toolDefs.slice(0, 40),
    subagents: existsSync(subDir) ? subagents(subDir) : [],
    items: items.filter((x) => x.tokens > 0).map(({ cat, label, target, tokens, reread, ts }) => ({ cat, label, target, tokens, reread, ts })).slice(-3000),
  };
}

// 세션 ID로 기록 파일 찾기 + 파일이 안 바뀌었으면 결과 재사용
const cache = new Map();
export function analyzeSession(projectsDir, session) {
  if (!/^[\w-]{6,80}$/.test(session || '')) return { error: '세션 ID 형식이 아니에요' };
  let file = null;
  try { for (const d of readdirSync(projectsDir)) { const f = join(projectsDir, d, session + '.jsonl'); if (existsSync(f)) { file = f; break; } } } catch {}
  if (!file) return { error: '이 세션의 대화 기록을 찾지 못했어요' };
  const st = statSync(file), key = `${st.size}:${st.mtimeMs}`, hit = cache.get(file);
  if (hit && hit.key === key) return hit.data;
  const data = analyze(file); cache.set(file, { key, data }); if (cache.size > 20) cache.delete(cache.keys().next().value);
  return data;
}
