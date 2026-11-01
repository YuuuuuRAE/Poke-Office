#!/usr/bin/env node
// 포켓몬 스프라이트를 이 PC에만 내려받습니다 (PokeAPI/sprites 저장소에서 필요한 PNG만 sparse checkout).
// 사용: npm run setup            → 없으면 받기
//       npm run setup -- --force → 다시 받기
//       (npm install 시 --auto 로 자동 실행. 실패해도 설치는 계속됩니다)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'vendor');
const SPR = join(VENDOR, 'sprites');
const DATA = join(VENDOR, 'pokeapi');
const NAMES = join(VENDOR, 'names.json');
const args = new Set(process.argv.slice(2));
const AUTO = args.has('--auto');
const FORCE = args.has('--force');

const say = (m) => console.log(`[poke-office] ${m}`);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: AUTO ? 'ignore' : 'inherit' });

function hasGit() {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function sparseClone(url, dest, patterns) {
  if (existsSync(dest)) {
    if (!FORCE) return false;
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  git(ROOT, 'clone', '--depth', '1', '--filter=blob:none', '--sparse', url, dest);
  git(dest, 'sparse-checkout', 'set', '--no-cone', ...patterns);
  return true;
}

function buildNames() {
  const csv = readFileSync(join(DATA, 'data/v2/csv/pokemon_species_names.csv'), 'utf8').split('\n').slice(1);
  const byId = new Map();
  for (const line of csv) {
    const [id, lang, name] = line.split(',');
    if (!id || !name) continue;
    const e = byId.get(+id) || { id: +id, ko: '', en: '' };
    if (lang === '3') e.ko = name;
    if (lang === '9') e.en = name;
    byId.set(+id, e);
  }
  const list = [...byId.values()].filter((e) => e.ko || e.en).sort((a, b) => a.id - b.id);
  writeFileSync(NAMES, JSON.stringify(list));
  return list.length;
}

function main() {
  if (!FORCE && existsSync(join(SPR, 'sprites/pokemon/25.png')) && existsSync(NAMES)) {
    if (!AUTO) say('스프라이트가 이미 있어요. 다시 받으려면 --force');
    return;
  }
  if (!hasGit()) {
    say('git이 없어 스프라이트를 받지 못했어요. git 설치 후 `npm run setup` 을 실행하세요.');
    return;
  }
  say('PokeAPI/sprites 에서 포켓몬 스프라이트를 받는 중… (약 10MB)');
  say('스프라이트 저작권은 Nintendo / Game Freak / The Pokémon Company에 있어요. 이 PC에서 개인용으로만 쓰세요.');
  sparseClone('https://github.com/PokeAPI/sprites.git', SPR, [
    '/sprites/pokemon/*.png',
    '/sprites/pokemon/shiny/*.png',
  ]);
  say('한국어/영어 이름 데이터를 받는 중…');
  sparseClone('https://github.com/PokeAPI/pokeapi.git', DATA, ['/data/v2/csv/pokemon_species_names.csv']);
  const n = buildNames();
  say(`완료: 포켓몬 ${n}종. \`npm start\` 후 화면 오른쪽 '포켓몬 팀' 탭에서 원하는 포켓몬으로 바꾸세요.`);
}

try { main(); }
catch (e) {
  say(`스프라이트 받기 실패: ${e.message}`);
  say('나중에 `npm run setup` 으로 다시 시도할 수 있어요.');
  if (!AUTO) process.exitCode = 1;
}
