import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const csvPath = resolve(process.cwd(), 'docs', '交付物-异常边界系统化自测用例.xlsx.csv');
const content = readFileSync(csvPath, 'utf-8').trim();
const lines = content.split(/\r?\n/);

if (lines.length <= 1) {
  throw new Error('No test cases found in delivery CSV.');
}

const headers = lines[0].split(',');
const idx = {
  level1: headers.indexOf('一级分类'),
  level2: headers.indexOf('二级分类'),
  id: headers.indexOf('用例ID'),
  priority: headers.indexOf('优先级'),
};

for (const [key, value] of Object.entries(idx)) {
  if (value < 0) {
    throw new Error(`CSV header missing: ${key}`);
  }
}

const categoryCounts = new Map();
const p0Counts = new Map();
const required = ['业务边界', '幂等边界', '并发边界', 'MQ异常', '档案边界'];
const requiredSub = {
  '业务边界': ['零里程', '零运费', '负数补贴', '空运单', '超限货物'],
  '幂等边界': ['重复签收', '重复回单上传'],
  '并发边界': ['并发开单', '并发修改同车'],
  'MQ异常': ['消息丢失', '重复消息', '死信消息'],
  '档案边界': ['证件过期', '证件空白', '非法日期'],
};
const subHit = new Map();
for (const key of Object.keys(requiredSub)) {
  subHit.set(key, new Set());
}

for (let i = 1; i < lines.length; i += 1) {
  const cols = lines[i].split(',');
  const c1 = (cols[idx.level1] ?? '').trim();
  const c2 = (cols[idx.level2] ?? '').trim();
  const priority = (cols[idx.priority] ?? '').trim();

  categoryCounts.set(c1, (categoryCounts.get(c1) ?? 0) + 1);
  if (priority === 'P0') {
    p0Counts.set(c1, (p0Counts.get(c1) ?? 0) + 1);
  }

  if (subHit.has(c1)) {
    const targets = requiredSub[c1];
    for (const target of targets) {
      if (c2.includes(target)) {
        subHit.get(c1).add(target);
      }
    }
  }
}

const missingTop = required.filter((name) => (categoryCounts.get(name) ?? 0) === 0);
const missingP0 = required.filter((name) => (p0Counts.get(name) ?? 0) === 0);
const missingSub = [];
for (const [name, targets] of Object.entries(requiredSub)) {
  for (const target of targets) {
    if (!subHit.get(name).has(target)) {
      missingSub.push(`${name}/${target}`);
    }
  }
}

const summary = {
  totalCases: lines.length - 1,
  categoryCounts: Object.fromEntries(categoryCounts.entries()),
  p0Counts: Object.fromEntries(p0Counts.entries()),
  missingTop,
  missingP0,
  missingSub,
  pass: missingTop.length === 0 && missingP0.length === 0 && missingSub.length === 0,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.pass) {
  process.exitCode = 1;
}
