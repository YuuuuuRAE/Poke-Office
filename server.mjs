#!/usr/bin/env node
// Claude Code 포켓 오피스 로컬 서버 (의존성 없음, Node 18+)
//   GET  /              → 오피스 화면
//   GET  /sprites/...   → vendor/sprites/sprites/pokemon/... (이 PC에 받은 스프라이트)
//   GET  /api/health    → { sprites, names }
//   GET  /api/names     → [{ id, ko, en }]
//   GET  /api/sessions  → 최근에 쓰인 Claude Code 세션 (대화 기록 폴더에서 찾음)
//   GET  /api/tokens?session=ID → 그 세션에서 토큰이 어디에 쓰였는지 분석 (tokens.mjs)
//   GET  /api/limits    → 5시간·주간 사용 한도 (상태줄이 저장한 ~/.claude/statusline-cache.json 이 있을 때만)
//   POST /events        → hook.mjs 가 보내는 OfficeEvent
//   GET  /stream        → 화면이 구독하는 Server-Sent Events (대화 기록에서 찾은 recap · 중단도 여기로)
import { createServer } from 'node:http';
import { existsSync, readFileSync, createReadStream, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { analyzeSession } from './tokens.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.POKE_OFFICE_PORT || 4321);
const HOST = '127.0.0.1'; // 외부에 열지 않음. 원격 접속은 코드서버 로그인 뒤 프록시로.
const SPR_DIR = join(ROOT, 'vendor/sprites/sprites/pokemon');
const NAMES = join(ROOT, 'vendor/names.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.js': 'text/javascript' };

// 스프라이트가 없으면 시작할 때 한 번 받아 둠 (npm install 단계에서 실패했을 때 대비)
if (!existsSync(join(SPR_DIR, '25.png')) && !process.env.POKE_OFFICE_NO_SETUP) {
  console.log('[poke-office] 스프라이트가 없어서 지금 받아요…');
  spawnSync(process.execPath, [join(ROOT, 'scripts/setup-sprites.mjs')], { stdio: 'inherit' });
}

// ── 세션 찾기: ~/.claude/projects/*/<세션ID>.jsonl 중 최근에 바뀐 파일을 읽어 작업 폴더와 마지막 프롬프트를 꺼냄
const PROJECTS = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
function tailText(file, max = 256 * 1024) {
  const fd = openSync(file, 'r');
  try {
    const size = statSync(file).size, len = Math.min(size, max), buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    if (len < size) lines.shift();
    return lines;
  } finally { closeSync(fd); }
}
function promptText(e) {
  if (e.type !== 'user' || e.isMeta || e.isSidechain) return '';
  const c = e.message?.content;
  const t = typeof c === 'string' ? c
    : Array.isArray(c) && !c.some((b) => b.type === 'tool_result') ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
  return t && !t.trim().startsWith('<') ? t.trim() : ''; // <command-name> 같은 내부 메시지는 제외
}
function findSessions(minutes = 60) {
  const out = [], since = Date.now() - minutes * 60e3;
  let dirs = [];
  try { dirs = readdirSync(PROJECTS); } catch { return out; }
  for (const d of dirs) {
    let files = [];
    try { files = readdirSync(join(PROJECTS, d)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const file = join(PROJECTS, d, f);
      let st; try { st = statSync(file); } catch { continue; }
      if (st.mtimeMs < since) continue;
      let cwd = '', prompt = '';
      try {
        for (const line of tailText(file)) {
          let e; try { e = JSON.parse(line); } catch { continue; }
          if (e.cwd) cwd = e.cwd;
          const t = promptText(e); if (t) prompt = t;
        }
      } catch { continue; }
      if (cwd) out.push({ session: f.replace(/\.jsonl$/, ''), cwd, prompt: prompt.slice(0, 4000), updated: st.mtimeMs });
    }
  }
  return out.sort((a, b) => b.updated - a.updated).slice(0, 12);
}

// ── 사용 한도: Claude Code가 상태줄에 넘겨준 rate_limits 를 상태줄 스크립트가 저장해 둔 파일을 읽기만 함
const LIMITS = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'statusline-cache.json');
// \uC0C1\uD0DC\uC904\uC740 \uAC00\uB054 \uD55C\uCABD \uAC12\uB9CC \uBC1B\uC544 \uD30C\uC77C\uC744 \uB36E\uC5B4\uC4F0\uAC70\uB098 \uC4F0\uB294 \uB3C4\uC911\uC77C \uC218 \uC788\uC5B4\uC11C, \uB9C8\uC9C0\uB9C9\uC73C\uB85C \uBCF8 \uAC12\uC744 \uAE30\uC5B5\uD574 \uB460
const lastLimits = { fiveHour: null, sevenDay: null, updated: 0 };
function readLimits() {
  const pick = (w) => (w && typeof w.used_percentage === 'number' ? { used: w.used_percentage, resetsAt: w.resets_at ?? null } : null);
  try {
    const j = JSON.parse(readFileSync(LIMITS, 'utf8').replace(/^\uFEFF/, ''));
    const five = pick(j.five_hour), week = pick(j.seven_day);
    if (five) lastLimits.fiveHour = five;
    if (week) lastLimits.sevenDay = week;
    if (five || week) lastLimits.updated = statSync(LIMITS).mtimeMs;
  } catch { /* \uBABB \uC77D\uC73C\uBA74 \uB9C8\uC9C0\uB9C9 \uAC12 \uC0AC\uC6A9 */ }
  const { fiveHour, sevenDay, updated } = lastLimits;
  return fiveHour || sevenDay ? { available: true, fiveHour, sevenDay, updated } : { available: false };
}

// ── 대화 기록 지켜보기: 훅이 없는 순간을 메워요 (3초마다 새로 붙은 줄만 읽음)
//   recap(자리 비운 동안의 요약) → recap,  Esc 중단 · 턴 종료 → stop,  응답마다 토큰 → usage (화면에 이미 있는 트레이너에게만 적용)
const tails = new Map(); // 파일 → 읽은 위치
const seenMsg = new Set(); // 한 응답이 여러 줄로 남아서 응답 ID로 한 번만 셈
function watchTranscripts() {
  const since = Date.now() - 30 * 60e3;
  let dirs = [];
  try { dirs = readdirSync(PROJECTS); } catch { return; }
  for (const d of dirs) {
    let files = [];
    try { files = readdirSync(join(PROJECTS, d)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const file = join(PROJECTS, d, f);
      let st; try { st = statSync(file); } catch { continue; }
      if (st.mtimeMs < since) continue;
      const from = tails.get(file);
      if (from === undefined || st.size < from) { tails.set(file, st.size); continue; } // 처음 본 파일은 끝에서부터
      if (st.size === from) continue;
      let text = '';
      const fd = openSync(file, 'r');
      try {
        const len = Math.min(st.size - from, 4 * 1024 * 1024), buf = Buffer.alloc(len);
        readSync(fd, buf, 0, len, from);
        text = buf.toString('utf8');
      } finally { closeSync(fd); }
      const end = text.lastIndexOf('\n');
      if (end < 0) continue; // 아직 줄이 다 안 써짐
      tails.set(file, from + Buffer.byteLength(text.slice(0, end + 1)));
      for (const line of text.slice(0, end).split('\n')) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.isSidechain || !e.sessionId) continue;
        const base = { ts: Date.now(), soft: true, session: e.sessionId, cwd: e.cwd, agent: 'main', at: Date.parse(e.timestamp) || Date.now() };
        if (e.type === 'system' && e.subtype === 'away_summary' && typeof e.content === 'string') {
          broadcast({ ...base, kind: 'recap', text: e.content.replace(/\s*\(disable recaps in \/config\)\s*$/, '').slice(0, 4000) });
        } else if (e.type === 'assistant' && e.message?.usage && e.message.id) {
          if (seenMsg.has(e.message.id)) continue;
          if (seenMsg.size > 20000) seenMsg.clear();
          seenMsg.add(e.message.id);
          const u = e.message.usage;
          broadcast({ ...base, kind: 'usage', model: e.message.model, input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 });
        } else if (e.type === 'system' && e.subtype === 'turn_duration') {
          broadcast({ ...base, kind: 'stop', why: 'turn' });
        } else if (e.type === 'user') {
          const c = e.message?.content;
          const t = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b.type === 'text' ? b.text : '')).join('') : '';
          if (/^\[Request interrupted by user/.test(t.trim())) broadcast({ ...base, kind: 'stop', why: 'interrupt' });
        }
      }
    }
  }
}
setInterval(() => { try { watchTranscripts(); } catch {} }, 3000);
watchTranscripts();

const clients = new Set();
const recent = []; // 새로 접속한 화면에 최근 이벤트 몇 개를 다시 보내지는 않음(상태 꼬임 방지). 로그용.

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function broadcast(ev) {
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) c.write(line);
  recent.push(ev); if (recent.length > 200) recent.shift();
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    return send(res, 200, readFileSync(join(ROOT, 'index.html')), MIME['.html']);
  }
  if (req.method === 'GET' && p === '/api/health') {
    return send(res, 200, { ok: true, sprites: existsSync(join(SPR_DIR, '25.png')), names: existsSync(NAMES) });
  }
  if (req.method === 'GET' && p === '/api/tokens') {
    try { return send(res, 200, analyzeSession(PROJECTS, url.searchParams.get('session'))); } catch (e) { return send(res, 500, { error: e.message }); }
  }
  if (req.method === 'GET' && p === '/api/limits') return send(res, 200, readLimits());
  if (req.method === 'GET' && p === '/api/sessions') {
    return send(res, 200, findSessions(Math.min(24 * 60, +(url.searchParams.get('minutes') || 60))));
  }
  if (req.method === 'GET' && p === '/api/names') {
    return existsSync(NAMES) ? send(res, 200, readFileSync(NAMES)) : send(res, 404, { error: 'npm run setup 먼저' });
  }
  if (req.method === 'GET' && p.startsWith('/sprites/')) {
    const rel = normalize(p.slice('/sprites/'.length)).replace(/^([.][.][/\\])+/, '');
    const file = join(SPR_DIR, rel);
    if (!file.startsWith(SPR_DIR) || !existsSync(file)) return send(res, 404, 'not found', 'text/plain');
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=86400' });
    return createReadStream(file).pipe(res);
  }
  if (req.method === 'GET' && p === '/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': connected\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (req.method === 'POST' && p === '/events') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 64e3) req.destroy(); });
    req.on('end', () => {
      try {
        const ev = JSON.parse(body);
        if (!ev || typeof ev.kind !== 'string') throw new Error('kind 없음');
        ev.ts = ev.ts || Date.now();
        broadcast(ev);
        send(res, 204, '');
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  send(res, 404, 'not found', 'text/plain');
});

server.listen(PORT, HOST, () => {
  const spr = existsSync(join(SPR_DIR, '25.png'));
  console.log(`\n  포켓 오피스: http://${HOST}:${PORT}`);
  console.log(`  스프라이트: ${spr ? '준비됨' : '없음 — npm run setup'}`);
  console.log(`  Claude Code 연결: npm run hooks   ·   안 될 때: npm run doctor\n`);
});
