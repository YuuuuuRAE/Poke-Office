#!/usr/bin/env node
// Claude Code 설정(~/.claude/settings.json)에 포켓 오피스 훅을 넣거나 뺍니다.
//   npm run hooks           → 훅 추가 (기존 설정은 그대로 두고 합침, 백업 생성)
//   npm run hooks:remove    → 포켓 오피스 훅만 제거
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(ROOT, 'hook.mjs').replace(/\\/g, '/');
const COMMAND = `node "${HOOK}"`;
const DIR = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'));
const FILE = join(DIR, 'settings.json');
const REMOVE = process.argv.includes('--remove');
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Notification', 'SubagentStop', 'Stop', 'SessionEnd'];
const WITH_MATCHER = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);

const say = (m) => console.log(`[poke-office] ${m}`);
const isOurs = (h) => h && typeof h.command === 'string' && (/poke-office/i.test(h.command)||h.command.includes(HOOK)) && /hook\.mjs/.test(h.command);

function load() {
  if (!existsSync(FILE)) return {};
  const raw = readFileSync(FILE, 'utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch (e) {
    say(`${FILE} 을 읽을 수 없어요 (JSON 형식 오류: ${e.message}).`);
    say('파일을 고친 뒤 다시 실행하거나, README의 수동 설정을 따라 주세요. 아무것도 바꾸지 않았어요.');
    process.exit(1);
  }
}

// 기존 그룹에서 우리 훅을 걸러내고, 비게 된 그룹은 정리
function strip(groups) {
  return (Array.isArray(groups) ? groups : [])
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
    .filter((g) => g.hooks.length);
}

function main() {
  const settings = load();
  const hooks = settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {};

  for (const ev of EVENTS) {
    const kept = strip(hooks[ev]);
    if (!REMOVE) {
      const group = { hooks: [{ type: 'command', command: COMMAND }] };
      if (WITH_MATCHER.has(ev)) group.matcher = '';
      kept.push(group);
    }
    if (kept.length) hooks[ev] = kept; else delete hooks[ev];
  }
  if (Object.keys(hooks).length) settings.hooks = hooks; else delete settings.hooks;

  mkdirSync(DIR, { recursive: true });
  if (existsSync(FILE)) {
    const bak = `${FILE}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    copyFileSync(FILE, bak);
    say(`기존 설정을 백업했어요: ${bak}`);
  }
  writeFileSync(FILE, JSON.stringify(settings, null, 2) + '\n');

  if (REMOVE) {
    say('포켓 오피스 훅을 제거했어요. 다른 설정은 그대로예요.');
  } else {
    say(`훅 ${EVENTS.length}개를 연결했어요 → ${FILE}`);
    say(`훅 명령: ${COMMAND}`);
    say('다음 단계: 1) npm start 로 서버 켜기  2) Claude Code를 새로 실행  3) 브라우저 http://127.0.0.1:4321 이 LIVE 로 바뀌는지 확인');
    say('폴더를 옮기면 이 명령을 다시 실행하세요. 빼려면: npm run hooks:remove');
  }
}

main();
