#!/usr/bin/env node
// 포켓 오피스가 안 될 때 원인을 찾아주는 진단 (npm run doctor)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.POKE_OFFICE_PORT || 4321);
let bad = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const no = (m, fix) => { bad++; console.log(`  ❌ ${m}`); if (fix) console.log(`     → ${fix}`); };
const warn = (m, fix) => { console.log(`  ⚠️  ${m}`); if (fix) console.log(`     → ${fix}`); };

console.log('\n포켓 오피스 진단\n');

const [maj] = process.versions.node.split('.').map(Number);
maj >= 18 ? ok(`Node.js ${process.version}`) : no(`Node.js ${process.version} (18 이상 필요)`, 'https://nodejs.org 에서 LTS 설치');

try { ok(`git ${execFileSync('git', ['--version'], { encoding: 'utf8' }).trim().replace('git version ', '')}`); }
catch { no('git 없음', 'macOS: 터미널에서 xcode-select --install 실행 후 npm run setup'); }

const spr = join(ROOT, 'vendor/sprites/sprites/pokemon');
if (existsSync(join(spr, '25.png'))) {
  const n = readdirSync(spr).filter((f) => f.endsWith('.png')).length;
  ok(`스프라이트 ${n}장 (vendor/sprites)`);
} else no('스프라이트가 없음', 'npm run setup  (실패 메시지가 나오면 그대로 알려주세요)');
existsSync(join(ROOT, 'vendor/names.json')) ? ok('포켓몬 이름 데이터 (vendor/names.json)') : no('이름 데이터 없음', 'npm run setup');

try {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(1500) });
  const j = await r.json();
  ok(`서버 켜져 있음 → http://127.0.0.1:${PORT}`);
  j.sprites ? ok('서버가 스프라이트를 찾음') : no('서버가 스프라이트를 못 찾음', 'npm run setup 후 서버를 껐다 켜기 (Ctrl+C → npm start)');
} catch { warn(`서버가 꺼져 있음 (포트 ${PORT})`, '다른 터미널에서 npm start'); }

const cfgFile = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json');
try {
  const j = JSON.parse(readFileSync(cfgFile, 'utf8'));
  const cmds = Object.values(j.hooks || {}).flat().flatMap((g) => g.hooks || []).map((h) => h.command || '');
  const ours = cmds.filter((c) => /hook\.mjs/.test(c) && /poke-office/i.test(c));
  if (!ours.length) no('Claude Code 훅이 없음', 'npm run hooks');
  else {
    const p = (ours[0].match(/"([^"]+hook\.mjs)"|(\S+hook\.mjs)/) || [])[1] || (ours[0].match(/(\S+hook\.mjs)/) || [])[1];
    p && existsSync(p) ? ok(`Claude Code 훅 연결됨 (${ours.length}개)`) : no(`훅 경로가 없는 파일을 가리킴: ${p}`, '이 폴더에서 npm run hooks 다시 실행');
  }
} catch { no(`Claude Code 설정을 못 읽음 (${cfgFile})`, 'npm run hooks'); }

console.log('\n브라우저에서 확인할 것');
console.log(`  • 주소가 http://127.0.0.1:${PORT} 인지 (claude.ai 링크나 index.html 직접 열기는 데모 전용)`);
console.log('  • 오른쪽 "포켓몬 팀" 탭 맨 위 안내 문구');
console.log(bad ? `\n문제 ${bad}개를 찾았어요. 위 → 안내대로 고쳐 보세요.\n` : '\n문제가 없어요.\n');
