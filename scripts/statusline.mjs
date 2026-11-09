#!/usr/bin/env node
// Claude Code 상태줄(statusLine)용 스크립트.
// Claude Code가 상태줄에 넘겨주는 rate_limits(5시간 / 주간 사용량)를 ~/.claude/statusline-cache.json 에 저장해서
// Poke Office 오른쪽 위 HP 바가 읽을 수 있게 해요. 상태줄에는 모델 이름과 남은 사용량을 짧게 보여줘요.
//
//   상태줄로 바로 쓰기:        node /경로/poke-office/scripts/statusline.mjs
//   이미 쓰는 상태줄이 있을 때: 그 스크립트에서 받은 입력을 `node /경로/poke-office/scripts/statusline.mjs --save-only` 로 넘겨 주세요
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const FILE = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'statusline-cache.json');
const SAVE_ONLY = process.argv.includes('--save-only');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let j = {};
  try { j = JSON.parse(raw || '{}'); } catch {}
  const rl = j.rate_limits || {};
  let old = {};
  try { old = JSON.parse(readFileSync(FILE, 'utf8').replace(/^﻿/, '')); } catch {}
  // rate_limits 는 세션의 첫 응답 뒤에야 오고, 가끔 한쪽만 와요. 없는 쪽은 이전 값을 유지해요.
  const five = rl.five_hour || old.five_hour || null, week = rl.seven_day || old.seven_day || null;
  if (rl.five_hour || rl.seven_day) {
    try { mkdirSync(dirname(FILE), { recursive: true }); writeFileSync(FILE, JSON.stringify({ five_hour: five, seven_day: week })); } catch {}
  }
  if (SAVE_ONLY) return;
  const left = (w) => {
    if (!w || typeof w.used_percentage !== 'number') return '--';
    const r = typeof w.resets_at === 'number' ? w.resets_at * 1000 : Date.parse(w.resets_at);
    if (r && r <= Date.now()) return '100%';
    return `${Math.max(0, Math.round(100 - w.used_percentage))}%`;
  };
  const model = j.model?.display_name || 'Claude';
  process.stdout.write(`${model}  5시간 ${left(five)}  주간 ${left(week)}`);
});
