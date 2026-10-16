import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import './../tools/bundle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const h5Dir = path.resolve(rootDir, '..', 'Ratio-h5');

// 构造极简 obsidian 桩以加载 main.js
const obsidianStub = {
  Plugin: class {},
  ItemView: class {},
  PluginSettingTab: class {},
  Setting: class {},
  Notice: class {},
  WorkspaceLeaf: class {},
  Editor: class {},
  MarkdownView: class {},
  normalizePath: (p) => p,
};

const mainCode = fs.readFileSync(path.join(rootDir, 'main.js'), 'utf8');
const mod = { exports: {} };
const sandbox = {
  module: mod,
  exports: mod.exports,
  require: (id) => {
    if (id === 'obsidian') return obsidianStub;
    throw new Error(`Unexpected require: ${id}`);
  },
  console,
  Math,
  Date,
  Object,
  Array,
  String,
  Number,
  Boolean,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
};
vm.runInNewContext(mainCode, sandbox);

const { RatioCalc: R } = mod.exports;

const fails = [];
function check(name, cond) {
  if (!cond) fails.push(name);
}

console.log('── 1. Ratio-obsidian 计算引擎单元测试 ──');

// 用例 1：等额本息 100万/360期/固定 3.1%
const p1 = R.schedule({
  amount: 1000000,
  term: 360,
  startY: 2023,
  startM: 1,
  method: 'installment',
  rates: [{ y: 2023, m: 1, rate: 3.1 }],
});
const sum1 = p1.rows.reduce((a, r) => a + r.principal, 0);
check('P1 本金守恒', Math.abs(sum1 - 1000000) < 0.01);
check('P1 期数', p1.rows.length === 360);
check('P1 末行本金剩余', p1.rows[359].remainPrincipal === 0);
check('P1 利息剩余首行=总利息', p1.rows[0].remainInterest === p1.totalInterest);
const r1 = 0.031 / 12;
const A1 = (1000000 * r1 * Math.pow(1 + r1, 360)) / (Math.pow(1 + r1, 360) - 1);
check('P1 月供公式', Math.abs(p1.rows[0].total - A1) < 0.05);
const t0 = p1.rows[0].total;
check(
  'P1 月供恒定',
  p1.rows.slice(1, 12).every((rr) => Math.abs(rr.total - t0) < 0.05)
);

// 用例 2：等额本金 60万/120期/固定 4%
const p2 = R.schedule({
  amount: 600000,
  term: 120,
  startY: 2023,
  startM: 1,
  method: 'principal',
  rates: [{ y: 2023, m: 1, rate: 4 }],
});
const sum2 = p2.rows.reduce((a, r) => a + r.principal, 0);
check('P2 本金守恒', Math.abs(sum2 - 600000) < 0.01);
check('P2 期数', p2.rows.length === 120);
check('P2 首期本金=5000', p2.rows[0].principal === 5000);
check('P2 首期利息=2000', p2.rows[0].interest === 2000);
let dec = true;
for (let i2 = 1; i2 < 120; i2++) {
  if (p2.rows[i2].interest > p2.rows[i2 - 1].interest) dec = false;
}
check('P2 利息递减', dec);

// 用例 3：分段利率（3.1% → 2.85% → 2.6%）等额本息
const rates3 = [
  { y: 2023, m: 1, rate: 3.1 },
  { y: 2025, m: 1, rate: 2.85 },
  { y: 2025, m: 6, rate: 2.6 },
];
check(
  'P3 段内利率3.1',
  Math.abs(R.rateAtMonth(R.ymIndex(2024, 1), rates3) - 3.1) < 1e-9
);
check(
  'P3 25-01利率2.85',
  Math.abs(R.rateAtMonth(R.ymIndex(2025, 1), rates3) - 2.85) < 1e-9
);
check(
  'P3 25-06利率2.6',
  Math.abs(R.rateAtMonth(R.ymIndex(2025, 6), rates3) - 2.6) < 1e-9
);
const p3 = R.schedule({
  amount: 1000000,
  term: 360,
  startY: 2023,
  startM: 1,
  method: 'installment',
  rates: rates3,
});
const sum3 = p3.rows.reduce((a, r) => a + r.principal, 0);
check('P3 本金守恒', Math.abs(sum3 - 1000000) < 0.01);
check('P3 期数', p3.rows.length === 360);
check('P3 末行清零', p3.rows[359].remainPrincipal === 0);
check(
  'P3 降息后月供下降',
  p3.rows[24].total < p3.rows[23].total && p3.rows[29].total < p3.rows[24].total
);
check('P3 降息后利息减少', p3.rows[24].interest < p3.rows[23].interest);

// 用例 4：提前还贷（reduce 减少月供）等额本息
const p4 = R.schedule({
  amount: 1000000,
  term: 360,
  startY: 2023,
  startM: 1,
  method: 'installment',
  rates: [{ y: 2023, m: 1, rate: 3.1 }],
  prepays: [{ y: 2025, m: 7, amount: 200000, mode: 'reduce' }],
});
const sum4 = p4.rows.reduce((a, r) => a + r.principal, 0);
check('P4 本金守恒', Math.abs(sum4 - 1000000) < 0.01);
check('P4 期数不变', p4.rows.length === 360);
check(
  'P4 提前还款当月总额含提前还款',
  p4.rows[30].total === 200000 + p4.rows[29].total
);
check('P4 提前还后月供下降', p4.rows[31].total < p4.rows[29].total - 500);
check('P4 总利息减少', p4.totalInterest < p1.totalInterest);

// 用例 5：提前还贷（shorten 缩短期限）等额本息
const p5 = R.schedule({
  amount: 1000000,
  term: 360,
  startY: 2023,
  startM: 1,
  method: 'installment',
  rates: [{ y: 2023, m: 1, rate: 3.1 }],
  prepays: [{ y: 2025, m: 7, amount: 200000, mode: 'shorten' }],
});
const sum5 = p5.rows.reduce((a, r) => a + r.principal, 0);
check('P5 本金守恒', Math.abs(sum5 - 1000000) < 0.01);
check('P5 期数缩短', p5.rows.length < 360 && p5.rows.length > 200);
check('P5 末行清零', p5.rows[p5.rows.length - 1].remainPrincipal === 0);
check(
  'P5 月供保持原水平',
  Math.abs(p5.rows[31].total - p1.rows[31].total) < 0.05
);

// 用例 6：提前还贷（reduce）等额本金
const p6 = R.schedule({
  amount: 600000,
  term: 120,
  startY: 2023,
  startM: 1,
  method: 'principal',
  rates: [{ y: 2023, m: 1, rate: 4 }],
  prepays: [{ y: 2024, m: 1, amount: 100000, mode: 'reduce' }],
});
const sum6 = p6.rows.reduce((a, r) => a + r.principal, 0);
check('P6 本金守恒', Math.abs(sum6 - 600000) < 0.01);
check('P6 期数不变', p6.rows.length === 120);
check(
  'P6 重算月本金',
  Math.abs(p6.rows[13].principal - p6.rows[12].remainPrincipal / 107) < 0.02
);

// 用例 7：多笔提前还款 + 分段利率
const p7 = R.schedule({
  amount: 800000,
  term: 240,
  startY: 2023,
  startM: 3,
  method: 'installment',
  rates: [
    { y: 2023, m: 3, rate: 3.1 },
    { y: 2025, m: 1, rate: 2.85 },
    { y: 2025, m: 6, rate: 2.6 },
  ],
  prepays: [
    { y: 2025, m: 1, amount: 50000, mode: 'shorten' },
    { y: 2027, m: 6, amount: 80000, mode: 'reduce' },
  ],
});
const sum7 = p7.rows.reduce((a, r) => a + r.principal, 0);
check('P7 本金守恒', Math.abs(sum7 - 800000) < 0.01);
check('P7 末行清零', p7.rows[p7.rows.length - 1].remainPrincipal === 0);

// 用例 8：等额本金 shorten 大幅提前还清
const p8 = R.schedule({
  amount: 600000,
  term: 120,
  startY: 2023,
  startM: 1,
  method: 'principal',
  rates: [{ y: 2023, m: 1, rate: 4 }],
  prepays: [{ y: 2023, m: 1, amount: 500000, mode: 'shorten' }],
});
const sum8 = p8.rows.reduce((a, r) => a + r.principal, 0);
check('P8 本金守恒', Math.abs(sum8 - 600000) < 0.01);
check('P8 期数缩短', p8.rows.length < 120);
check('P8 末行清零', p8.rows[p8.rows.length - 1].remainPrincipal === 0);

// 用例 9：combine 混合贷款合并
const c9 = R.combine([p1, p2]);
check(
  'C9 合计本金守恒',
  Math.abs(c9.rows.reduce((a, r) => a + r.principal, 0) - 1600000) < 0.02
);
check('C9 行数', c9.rows.length === 360);
check(
  'C9 剩余=两表之和',
  Math.abs(
    c9.rows[100].remainPrincipal -
      (p1.rows[100].remainPrincipal + p2.rows[100].remainPrincipal)
  ) < 0.02
);
check(
  'C9 合计利息=两表之和',
  Math.abs(c9.totalInterest - (p1.totalInterest + p2.totalInterest)) < 0.02
);

// 用例 10：边缘情况（零利率 / 超额提前还款 / 首期提前还款）
const p10 = R.schedule({
  amount: 120000,
  term: 12,
  startY: 2024,
  startM: 1,
  method: 'installment',
  rates: [{ y: 2024, m: 1, rate: 0 }],
});
const sum10 = p10.rows.reduce((a, r) => a + r.principal, 0);
check('P10 零利率守恒', Math.abs(sum10 - 120000) < 0.01);
check('P10 零利率月供=10000', p10.rows[0].total === 10000);
check('P10 零利率无利息', p10.totalInterest === 0);

const p11 = R.schedule({
  amount: 100000,
  term: 60,
  startY: 2024,
  startM: 1,
  method: 'installment',
  rates: [{ y: 2024, m: 1, rate: 3 }],
  prepays: [{ y: 2024, m: 1, amount: 999999, mode: 'shorten' }],
});
const sum11 = p11.rows.reduce((a, r) => a + r.principal, 0);
check('P11 超额提前还款守恒', Math.abs(sum11 - 100000) < 0.01);
check('P11 超额提前还款立即结清', p11.rows.length === 1);

const p12 = R.schedule({
  amount: 200000,
  term: 120,
  startY: 2024,
  startM: 1,
  method: 'principal',
  rates: [{ y: 2024, m: 1, rate: 3.5 }],
  prepays: [{ y: 2024, m: 1, amount: 50000, mode: 'reduce' }],
});
const sum12 = p12.rows.reduce((a, r) => a + r.principal, 0);
check('P12 首期提前还款守恒', Math.abs(sum12 - 200000) < 0.01);
check(
  'P12 首期提前还款计入当月',
  p12.rows[0].total ===
    50000 +
      Math.round(((200000 * 0.035) / 12) * 100) / 100 +
      Math.round((200000 / 120) * 100) / 100
);

// Markdown 导出验证
const md = R.generateMarkdownReport(
  {
    mode: 'mixed',
    method: 'installment',
    term: 360,
    startY: 2023,
    startM: 1,
    gjj: { amount: 600000, rates: [{ y: 2023, m: 1, rate: 3.1 }] },
    com: { amount: 400000, rates: [{ y: 2023, m: 1, rate: 4.0 }] },
    prepays: [{ y: 2024, m: 1, amount: 100000, mode: 'reduce', part: 'com' }],
  },
  true
);
check('MD 包含标题', md.includes('# 中国房贷计算报告'));
check('MD 包含节省利息', md.includes('节省利息'));
check('MD 包含 ★ 标记', md.includes('★'));

// ── 2. 验证网页版 (index.html) 与浏览器无 require 环境兼容性 ──
console.log('── 2. 网页版 (index.html) 与 Obsidian 双端共用代码验证 ──');
const indexHtmlPath = path.join(rootDir, 'index.html');
check('index.html 已生成', fs.existsSync(indexHtmlPath));
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
check('index.html 引入 styles.css', indexHtml.includes('styles.css'));
check('index.html 引入 main.js', indexHtml.includes('main.js'));
check('index.html 包含 #ratio-app 挂载节点', indexHtml.includes('id="ratio-app"'));

// 在无 require / module 的纯浏览器沙箱中运行 main.js
const browserWindow = {};
const browserSandbox = {
  window: browserWindow,
  console,
  Math,
  Date,
  Object,
  Array,
  String,
  Number,
  Boolean,
  JSON,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  setTimeout,
};
vm.runInNewContext(mainCode, browserSandbox);
check('浏览器环境挂载 window.RatioCalc', typeof browserWindow.RatioCalc?.schedule === 'function');
check('浏览器环境挂载 window.RatioCalculatorWidget', typeof browserWindow.RatioCalculatorWidget === 'function');
check('浏览器环境挂载 window.mountRatioWebApp', typeof browserWindow.mountRatioWebApp === 'function');

// ── 3. 与 Ratio-h5 Python 参考实现 100 组随机用例交叉对比 ──
console.log('── 3. 与 Ratio-h5 100 组随机用例交叉验证 ──');
const casesPath = path.join(h5Dir, 'tools/cases.json');
const expPath = path.join(h5Dir, 'tools/expected.json');
if (fs.existsSync(casesPath) && fs.existsSync(expPath)) {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const expected = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  let cellCount = 0;
  for (let i = 0; i < cases.length; i++) {
    const got = R.schedule(cases[i]).rows;
    const exp = expected[i];
    if (got.length !== exp.length) {
      fails.push(
        `Case ${i} length mismatch: ${got.length} vs ${exp.length}`
      );
      continue;
    }
    for (let r = 0; r < got.length; r++) {
      const gr = got[r];
      const er = exp[r];
      cellCount += 5;
      if (
        Math.abs(gr.principal - er.principal) > 0.005 ||
        Math.abs(gr.interest - er.interest) > 0.005 ||
        Math.abs(gr.total - er.total) > 0.005 ||
        Math.abs(gr.remainPrincipal - er.remainPrincipal) > 0.005 ||
        Math.abs(gr.remainInterest - er.remainInterest) > 0.005
      ) {
        fails.push(`Case ${i} row ${r} mismatch`);
        break;
      }
    }
  }
  console.log(`   已精确对比 ${cases.length} 组用例，共 ${cellCount} 个数据单元`);
}

if (fails.length) {
  console.error('FAIL:', fails.join(' | '));
  process.exit(1);
}
console.log('✅ 全部测试通过');
