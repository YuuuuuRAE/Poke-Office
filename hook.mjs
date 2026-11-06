#!/usr/bin/env node
// Claude Code 훅 → 포켓 오피스 서버.
// stdin으로 받은 훅 JSON을 OfficeEvent로 바꿔 POST합니다.
// 서버가 꺼져 있어도 조용히 끝나며(exit 0) Claude Code를 막지 않습니다.
import { openSync, readSync, fstatSync, closeSync } from 'node:fs';
const PORT = +(process.env.POKE_OFFICE_PORT || 4321);

const cut = (s, n = 40) => (s == null ? '' : String(s).replace(/\s+/g, ' ').slice(0, n));
const base = (f) => (f ? String(f).split(/[\\/]/).pop() : '');

function detail(tool, i = {}) {
  if (i.file_path || i.notebook_path) return base(i.file_path || i.notebook_path);
  if (i.command) return cut(i.command);
  if (i.pattern) return cut(i.pattern);
  if (i.url) return cut(i.url.replace(/^https?:\/\//, ''));
  if (i.query) return cut(i.query);
  if (i.description) return cut(i.description);
  if (Array.isArray(i.todos)) return `할 일 ${i.todos.length}개`;
  if (/^mcp__/.test(tool || '')) { const v = Object.values(i).find((x) => typeof x === 'string' && x.trim()); if (v) return cut(v); }
  return tool || '';
}

// 화면의 '더보기'에서 볼 원문 (너무 길면 끝만 자름)
const full = (s, n = 4000) => (s == null ? '' : String(s).slice(0, n));
function fullOf(i = {}) {
  return full(i.command || i.file_path || i.notebook_path || i.url || i.query || i.pattern || i.description || i.prompt || '', 2000);
}

// 대화 기록(transcript) 끝부분에서 마지막 프롬프트 이후 Claude가 쓴 말을 꺼냄
function claudeSaid(path) {
  if (!path) return [];
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size, len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    if (len < size) lines.shift(); // 잘린 첫 줄은 버림
    const out = [];
    for (const line of lines) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.isSidechain || e.isMeta) continue;
      const c = e.message?.content;
      if (e.type === 'user') {
        const isPrompt = typeof c === 'string' || (Array.isArray(c) && !c.some((b) => b.type === 'tool_result'));
        if (isPrompt) out.length = 0; // 새 프롬프트부터 다시 모음
      } else if (e.type === 'assistant' && Array.isArray(c)) {
        for (const b of c) if (b.type === 'text' && b.text?.trim()) out.push(full(b.text.trim(), 3000));
      }
    }
    return out.slice(-6);
  } catch { return []; } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
}

function failed(r) {
  if (!r || typeof r !== 'object') return false;
  return !!(r.is_error || r.error || r.interrupted || (typeof r.exit_code === 'number' && r.exit_code !== 0));
}

function toEvent(h) {
  const tool = h.tool_name;
  const common = { ts: Date.now(), session: h.session_id, cwd: h.cwd, agent: 'main', tool, id: h.tool_use_id };
  const isTask = tool === 'Task' || tool === 'Agent';
  switch (h.hook_event_name) {
    case 'SessionStart': return { ...common, kind: 'session_start' };
    case 'UserPromptSubmit': return { ...common, kind: 'prompt', detail: cut(h.prompt, 30), full: full(h.prompt) };
    case 'PreToolUse':
      return isTask
        ? { ...common, kind: 'subagent_start', detail: cut(h.tool_input?.description || h.tool_input?.subagent_type || '서브에이전트', 20), full: fullOf(h.tool_input) }
        : { ...common, kind: 'tool_start', detail: detail(tool, h.tool_input), full: fullOf(h.tool_input),
            ...(h.tool_input?.command ? { cmd: cut(h.tool_input.command, 300) } : {}),
            ...(Array.isArray(h.tool_input?.todos) ? { todos: h.tool_input.todos.map((t) => ({ text: cut(t.content || t.subject, 30), status: t.status })) } : {}) };
    case 'PostToolUse':
      return isTask ? null : { ...common, kind: 'tool_end', ok: !failed(h.tool_response), ...(h.tool_input?.command ? { cmd: cut(h.tool_input.command, 300) } : {}) };
    case 'PostToolUseFailure': // 거절·중단·오류로 끝난 툴
      return isTask ? null : { ...common, kind: 'tool_end', ok: false };
    case 'SubagentStop': return { ...common, kind: 'subagent_end' };
    case 'Notification': return { ...common, kind: 'notify', detail: cut(h.message, 40), full: full(h.message) };
    case 'Stop': return { ...common, kind: 'stop' };
    case 'SessionEnd': return { ...common, kind: 'session_end' };
    default: return null;
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', async () => {
  try {
    const h = JSON.parse(raw || '{}');
    const ev = toEvent(h);
    const post = (body) => fetch(`http://127.0.0.1:${PORT}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(800),
    });
    // 툴을 쓰기 전과 답변이 끝났을 때, Claude가 CLI에 쓴 말을 같이 보냄 (화면에서 중복은 걸러요)
    if (h.hook_event_name === 'PreToolUse' || h.hook_event_name === 'Stop') try {
      if (h.hook_event_name === 'Stop') await new Promise((r) => setTimeout(r, 200)); // 마지막 답변이 파일에 써질 시간
      const texts = claudeSaid(h.transcript_path);
      if (typeof h.last_assistant_message === 'string' && h.last_assistant_message.trim()) texts.push(full(h.last_assistant_message.trim(), 3000));
      if (texts.length) await post({ ts: Date.now(), session: h.session_id, cwd: h.cwd, agent: 'main', kind: 'say', texts });
    } catch { /* Claude 말 보내기가 늦어도 아래 이벤트는 보냄 */ }
    if (ev) await post(ev);
  } catch { /* 서버가 꺼져 있으면 무시 */ }
  process.exit(0);
});
