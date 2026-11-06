#!/usr/bin/env node
// 바탕화면에 "Poke Office" 실행 아이콘을 만들거나 지웁니다.
//   npm run shortcut          → 아이콘 만들기 (누르면 업데이트 확인 → 서버 시작 → 브라우저 열기)
//   npm run shortcut:remove   → 아이콘 지우기
import { existsSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REMOVE = process.argv.includes('--remove');
const say = (m) => console.log(`[poke-office] ${m}`);

function desktop() {
  if (process.platform === 'win32') {
    // OneDrive로 옮겨진 바탕화면도 찾기 위해 Windows에 직접 물어봐요
    try {
      const p = execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).trim();
      if (p) return p;
    } catch {}
  }
  return join(homedir(), 'Desktop');
}

function windows(dir) {
  const lnk = join(dir, 'Poke Office.lnk');
  if (REMOVE) { rmSync(lnk, { force: true }); return say(`아이콘을 지웠어요: ${lnk}`); }
  const q = (s) => s.replace(/'/g, "''");
  const ps = [
    '$s=(New-Object -ComObject WScript.Shell).CreateShortcut(\'' + q(lnk) + '\')',
    '$s.TargetPath=\'' + q(join(ROOT, 'scripts', 'start.cmd')) + '\'',
    '$s.WorkingDirectory=\'' + q(ROOT) + '\'',
    "$s.IconLocation='C:\\Windows\\System32\\shell32.dll,13'",
    "$s.Description='Poke Office'",
    '$s.Save()',
  ].join(';');
  execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  say(`바탕화면에 아이콘을 만들었어요: ${lnk}`);
}

function mac(dir) {
  const file = join(dir, 'Poke Office.command');
  if (REMOVE) { rmSync(file, { force: true }); return say(`아이콘을 지웠어요: ${file}`); }
  const url = 'http://127.0.0.1:4321';
  writeFileSync(file, `#!/bin/bash
cd "${ROOT.replace(/"/g, '\\"')}" || exit 1
if curl -s -o /dev/null "${url}"; then open "${url}"; exit 0; fi
echo "[Poke Office] 업데이트 확인 중..."
OLD=$(git rev-parse HEAD)
git pull --ff-only --quiet || echo "[Poke Office] 업데이트를 건너뛰었어요."
if [ ! -d vendor ] || [ -n "$(git diff --name-only "$OLD" HEAD -- package.json)" ]; then npm install; fi
echo "[Poke Office] 서버 시작 - 이 창을 닫으면 꺼져요."
(sleep 2; open "${url}") &
npm start
`);
  chmodSync(file, 0o755);
  say(`바탕화면에 실행 파일을 만들었어요: ${file}`);
}

const dir = desktop();
if (!existsSync(dir)) { say(`바탕화면 폴더를 찾지 못했어요 (${dir}). 건너뛸게요.`); process.exit(0); }
if (process.platform === 'win32') windows(dir);
else if (process.platform === 'darwin') mac(dir);
else say('이 OS에서는 바탕화면 아이콘을 만들지 않아요. npm start 로 실행하세요.');
if (!REMOVE) say('폴더를 옮기면 이 명령을 다시 실행하세요. 지우려면: npm run shortcut:remove');
