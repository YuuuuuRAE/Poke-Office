#!/usr/bin/env node
// Claude Code 포켓 오피스 로컬 서버 (의존성 없음, Node 18+)
//   GET  /              → 오피스 화면
//   GET  /sprites/...   → vendor/sprites/sprites/pokemon/... (이 PC에 받은 스프라이트)
//   GET  /api/health    → { sprites, names }
//   GET  /api/names     → [{ id, ko, en }]
//   POST /events        → hook.mjs 가 보내는 OfficeEvent
//   GET  /stream        → 화면이 구독하는 Server-Sent Events
import { createServer } from 'node:http';
import { existsSync, readFileSync, createReadStream } from 'node:fs';
import { dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.POKE_OFFICE_PORT || 4321);
const HOST = '127.0.0.1'; // 외부에 열지 않음. 원격 접속은 코드서버 로그인 뒤 프록시로.
const SPR_DIR = join(ROOT, 'vendor/sprites/sprites/pokemon');
const NAMES = join(ROOT, 'vendor/names.json');
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.js': 'text/javascript' };

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
  console.log(`  훅 연결: README의 settings.json 예시를 ~/.claude/settings.json 에 넣으세요.\n`);
});
