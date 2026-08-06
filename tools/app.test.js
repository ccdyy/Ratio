'use strict';

/**
 * Ratio UI 端到端测试（jsc + DOM 桩）：
 *   jsc tools/app.test.js
 * 加载 tools/dom_stub.js → js/calc.js → js/app.js，驱动完整交互流程并断言渲染结果。
 */
load('tools/dom_stub.js');
var D = globalThis.__dom;
var doc = globalThis.document;

var fails = [];
function check(name, cond) { if (!cond) fails.push(name); }

// ── 预置：radio 与视图切换按钮 ───────────────────────────────
function radio(name, value, checked) {
  var r = D.makeEl('input', { name: name, value: value });
  r.checked = checked;
  doc._all.push(r);
  return r;
}
var rGjj = radio('loanMode', 'gjj', true);
var rCom = radio('loanMode', 'commercial', false);
var rMixed = radio('loanMode', 'mixed', false);
var rPrincipal = radio('repayMethod', 'principal', false);
var rInstallment = radio('repayMethod', 'installment', true);

var viewTabs = doc.getElementById('viewTabs');
[['total', '合计'], ['gjj', '公积金'], ['com', '商业']].forEach(function (t) {
  var btn = D.makeEl('button', { 'data-view': t[0] });
  btn.className = 'tab';
  btn.classList.add('tab');
  btn.textContent = t[1];
  viewTabs.appendChild(btn);
});

// 预置输入框初始值（模拟 index.html 中的 value 属性）
function preset(id, value) {
  doc.getElementById(id)._value = String(value);
}
preset('gjjAmount', 600000);
preset('comAmount', 400000);
preset('termMonths', 360);

// ── 加载应用 ─────────────────────────────────────────────────
load('js/calc.js');
load('js/app.js');

var settings = doc.getElementById('settings');
var tbodyBase = doc.getElementById('tbodyBase');
var tbodyWith = doc.getElementById('tbodyWith');

function firstRowTds(tbody) {
  var tr = D.find(tbody, 'tr');
  if (!tr) return [];
  return tr.children.filter(function (c) { return c.tagName === 'td'; });
}

function collectText(el) {
  var t = el.textContent || '';
  for (var i = 0; i < el.children.length; i++) t += collectText(el.children[i]);
  return t;
}

function summaryText() {
  return collectText(doc.getElementById('summary'));
}

/** 结构化断言：按标签 k 精确取汇总卡片的值文本（避免子串误匹配） */
function summaryCard(k) {
  var items = doc.getElementById('summary').querySelectorAll('.sum-item');
  for (var i = 0; i < items.length; i++) {
    var kEl = items[i].querySelector('.k');
    if (kEl && kEl.textContent === k) {
      var vEl = items[i].querySelector('.v');
      return vEl ? vEl.textContent : null;
    }
  }
  return null;
}

function setLoanMode(radioEl) {
  rGjj.checked = (radioEl === rGjj);
  rCom.checked = (radioEl === rCom);
  rMixed.checked = (radioEl === rMixed);
  settings.dispatch('change', radioEl);
}

function setRepayMethod(radioEl) {
  rPrincipal.checked = (radioEl === rPrincipal);
  rInstallment.checked = (radioEl === rInstallment);
  settings.dispatch('change', radioEl);
}

// ── 1. 默认渲染（公积金 60万 / 360期 / 等额本息 / 3 段利率）──
check('初始行数 360', D.countRows(tbodyBase) === 360);
var st = summaryText();
check('汇总含总贷款金额', summaryCard('总贷款金额') !== null);
check('汇总含 600,000.00', (function () { var v = summaryCard('总贷款金额'); return v !== null && v.indexOf('600,000.00') >= 0; })());
check('无提前还贷时表格2隐藏', doc.getElementById('prepayCard').hidden === true);

// 首行与直接调用 calc 一致
var exp = RatioCalc.schedule({
  amount: 600000, term: 360, startY: 2023, startM: 1, method: 'installment',
  rates: [{ y: 2023, m: 1, rate: 3.1 }, { y: 2025, m: 1, rate: 2.85 }, { y: 2025, m: 6, rate: 2.6 }]
});
var tds = firstRowTds(tbodyBase);
check('首行期数=1', tds[0].textContent === '1');
check('首行日期=2023年1月', tds[1].textContent === '2023年1月');
check('首行本金', tds[2].textContent === exp.rows[0].principal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
check('首行利息', tds[3].textContent === exp.rows[0].interest.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
check('首行总额', tds[4].textContent === exp.rows[0].total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
check('末行本金剩余=0', (function () {
  var trs = tbodyBase.querySelectorAll('tr');
  var last = trs[trs.length - 1];
  var ltds = last.children.filter(function (c) { return c.tagName === 'td'; });
  return ltds[5].textContent === '0.00';
})());

// ── 2. 添加提前还贷 → 表格 2 出现 ────────────────────────────
doc.getElementById('addPrepay').dispatch('click');
check('有提前还贷时表格2显示', doc.getElementById('prepayCard').hidden === false);
check('表格2行数 360（reduce 期限不变）', D.countRows(tbodyWith) === 360);
check('提前还贷行高亮标记', (function () {
  var trs = tbodyWith.querySelectorAll('tr');
  var hl = false;
  for (var i = 0; i < trs.length; i++) {
    if (trs[i].classList.contains('hl-row')) hl = true;
  }
  return hl;
})());
// 提前还贷默认日期 = 开始还贷 + 12 个月 = 2024-01（第 13 期）
check('提前还贷月为第13期', (function () {
  var trs = tbodyWith.querySelectorAll('tr');
  return trs[12] && trs[12].classList.contains('hl-row');
})());
// 非混合模式：ppart 选择隐藏
var firstPrepay = doc.getElementById('prepayList').querySelector('.prepay-row');
check('非混合时部分选择隐藏', firstPrepay.querySelector('.ppart').hidden === true);

// ── 3. 切换等额本金 ──────────────────────────────────────────
setRepayMethod(rPrincipal);
tds = firstRowTds(tbodyBase);
check('等额本金首期本金=1,666.67', tds[2].textContent === '1,666.67');
setRepayMethod(rInstallment);
tds = firstRowTds(tbodyBase);
check('切回等额本息首期本金', tds[2].textContent === exp.rows[0].principal.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// ── 4. 切换贷款方式 ──────────────────────────────────────────
setLoanMode(rCom);
check('纯商业：公积金卡隐藏', doc.getElementById('gjjCard').hidden === true);
check('纯商业：商业卡显示', doc.getElementById('comCard').hidden === false);
check('纯商业：视图切换隐藏', doc.getElementById('viewTabs').hidden === true);
check('纯商业汇总 400,000.00', (function () { var v = summaryCard('总贷款金额'); return v !== null && v.indexOf('400,000.00') >= 0; })());
check('纯商业行数 360', D.countRows(tbodyBase) === 360);
// 商业利率 4.0% 首期利息 = 400000*0.04/12 = 1,333.33
tds = firstRowTds(tbodyBase);
check('商业首期利息=1,333.33', tds[3].textContent === '1,333.33');

// ── 5. 混合贷款 ──────────────────────────────────────────────
setLoanMode(rMixed);
check('混合：两卡都显示', doc.getElementById('gjjCard').hidden === false && doc.getElementById('comCard').hidden === false);
check('混合：视图切换显示', doc.getElementById('viewTabs').hidden === false);
check('混合汇总 1,000,000.00', (function () { var v = summaryCard('总贷款金额'); return v !== null && v.indexOf('1,000,000.00') >= 0; })());
check('混合行数 360', D.countRows(tbodyBase) === 360);
// 混合总还款额卡片不应为 '—'（回归：combine 缺 total 字段）；与引擎同口径取整后精确匹配
(function () {
  var gPlan = RatioCalc.schedule({
    amount: 600000, term: 360, startY: 2023, startM: 1, method: 'installment',
    rates: [{ y: 2023, m: 1, rate: 3.1 }, { y: 2025, m: 1, rate: 2.85 }, { y: 2025, m: 6, rate: 2.6 }]
  });
  var cPlan = RatioCalc.schedule({
    amount: 400000, term: 360, startY: 2023, startM: 1, method: 'installment',
    rates: [{ y: 2023, m: 1, rate: 4.0 }, { y: 2025, m: 1, rate: 3.7 }]
  });
  var expectTotal = RatioCalc.combine([gPlan, cPlan]).total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var vBase = summaryCard('未提前还贷 · 总还款额');
  var vWith = summaryCard('提前还贷后 · 总还款额');
  check('混合总还款额卡片显示数值', vBase !== null && vBase.indexOf(expectTotal) >= 0);
  check('混合总还款额卡片无 —', vBase !== null && vWith !== null && vBase.indexOf('—') < 0 && vWith.indexOf('—') < 0);
})();
// 合计首期利息 = 600000*3.1%/12 + 400000*4%/12 = 1550 + 1333.33 = 2,883.33
tds = firstRowTds(tbodyBase);
check('混合首期利息=2,883.33', tds[3].textContent === '2,883.33');
check('混合时部分选择显示', firstPrepay.querySelector('.ppart').hidden === false);

// 混合模式下新增提前还贷 → 部分选择器应显示（回归：曾被静默计为公积金）
doc.getElementById('addPrepay').dispatch('click');
var prepayRowsAll = doc.getElementById('prepayList').querySelectorAll('.prepay-row');
var newRow = prepayRowsAll[prepayRowsAll.length - 1];
check('混合新增行部分选择显示', newRow.querySelector('.ppart').hidden === false);
// 新行归属商业并设金额 → 表格 2 仍 360 行（reduce 期限不变）
newRow.querySelector('.ppart').value = 'com';
newRow.querySelector('.pa').value = '50000';
settings.dispatch('input', newRow.querySelector('.pa'));
check('混合新增商业提前还贷后表格2仍360行', D.countRows(tbodyWith) === 360);
// 删除新行恢复状态
settings.dispatch('click', newRow.querySelector('.btn-del'));
check('删除新行后剩 1 行', doc.getElementById('prepayList').querySelectorAll('.prepay-row').length === 1);

// 切换到"商业"视图
var comTab = D.find(viewTabs, '[data-view="com"]');
viewTabs.dispatch('click', comTab);
tds = firstRowTds(tbodyBase);
check('商业视图首期利息=1,333.33', tds[3].textContent === '1,333.33');
// 切回合计
viewTabs.dispatch('click', D.find(viewTabs, '[data-view="total"]'));
tds = firstRowTds(tbodyBase);
check('切回合计视图首期利息=2,883.33', tds[3].textContent === '2,883.33');

// ── 6. 提前还贷：改成缩短期限 → 表格 2 期数缩短（纯公积金模式）─
setLoanMode(rGjj);
var modeSel = firstPrepay.querySelector('.pmode');
modeSel.value = 'shorten';
settings.dispatch('input', modeSel);
var n = D.countRows(tbodyWith);
check('缩短期限后期数 < 360', n < 360 && n > 200);
check('缩短期限后表格2末行清零', (function () {
  var trs = tbodyWith.querySelectorAll('tr');
  var last = trs[trs.length - 1];
  var ltds = last.children.filter(function (c) { return c.tagName === 'td'; });
  return ltds[5].textContent === '0.00';
})());
check('缩短期限后汇总显示实际期数', summaryText().indexOf('期') >= 0);

// ── 7. 删除利率区间至只剩一个仍可删除保护 ────────────────────
var delBtns = doc.getElementById('gjjRates').querySelectorAll('.btn-del');
check('默认公积金利率区间 3 个', doc.getElementById('gjjRates').querySelectorAll('.rate-row').length === 3);
// 删除 2 个，剩 1 个；再删应被阻止
settings.dispatch('click', delBtns[0]);
var rowsNow = doc.getElementById('gjjRates').querySelectorAll('.rate-row');
check('删除后剩 2 个', rowsNow.length === 2);
settings.dispatch('click', rowsNow[0].querySelector('.btn-del'));
var rowsNow2 = doc.getElementById('gjjRates').querySelectorAll('.rate-row');
check('再删后剩 1 个', rowsNow2.length === 1);
settings.dispatch('click', rowsNow2[0].querySelector('.btn-del'));
check('只剩 1 个时删除被阻止', doc.getElementById('gjjRates').querySelectorAll('.rate-row').length === 1);

// ── 8. 修改贷款金额 → 实时重算（当前为纯公积金模式） ────────
var amountInput = doc.getElementById('gjjAmount');
amountInput.value = '100000';
settings.dispatch('input', amountInput);
check('改金额后汇总 100,000.00（纯公积金）', (function () { var v = summaryCard('总贷款金额'); return v !== null && v.indexOf('100,000.00') >= 0; })());
var sumP = 0;
(function () {
  var trs = tbodyBase.querySelectorAll('tr');
  for (var i = 0; i < trs.length; i++) {
    var ltds = trs[i].children.filter(function (c) { return c.tagName === 'td'; });
    sumP += parseFloat(ltds[2].textContent.replace(/,/g, ''));
  }
})();
check('表格本金合计=100,000.00（界面守恒）', Math.abs(sumP - 100000) < 0.01);

// ── 9. 日期越界 clamp：开始还贷 2060-12 时新增提前还贷不越界 ──
doc.getElementById('startYear').value = '2060';
doc.getElementById('startMonth').value = '12';
doc.getElementById('addPrepay').dispatch('click');
var pRows9 = doc.getElementById('prepayList').querySelectorAll('.prepay-row');
var lastRow9 = pRows9[pRows9.length - 1];
check('越界日期被 clamp 到 2060-12', lastRow9.querySelector('.py').value === '2060' && lastRow9.querySelector('.pm').value === '12');
settings.dispatch('click', lastRow9.querySelector('.btn-del'));
check('clamp 测试后清理完成', doc.getElementById('prepayList').querySelectorAll('.prepay-row').length === 1);

// ── 10. 输入上限 clamp（security_review 修复回归）──
doc.getElementById('termMonths').value = '9999999';
settings.dispatch('input', doc.getElementById('termMonths'));
check('term clamp 到 1200 行', D.countRows(tbodyBase) === 1200);
doc.getElementById('termMonths').value = '360';
settings.dispatch('input', doc.getElementById('termMonths'));
check('恢复 360 行', D.countRows(tbodyBase) === 360);
// 超大利率被 clamp → 不产生 '—'/NaN
var rr = doc.getElementById('gjjRates').querySelector('.rate-row').querySelector('.rr');
rr.value = '9999';
settings.dispatch('input', rr);
var tds10 = firstRowTds(tbodyBase);
check('超大利率被 clamp 不显示 —', tds10[4].textContent.indexOf('—') < 0);
rr.value = '3.1';
settings.dispatch('input', rr);
// 超大金额被 clamp 到 100 亿
doc.getElementById('gjjAmount').value = '1000000000000000';
settings.dispatch('input', doc.getElementById('gjjAmount'));
check('金额 clamp 到 10,000,000,000.00', (function () { var v = summaryCard('总贷款金额'); return v !== null && v.indexOf('10,000,000,000.00') >= 0; })());
doc.getElementById('gjjAmount').value = '100000';
settings.dispatch('input', doc.getElementById('gjjAmount'));
check('金额恢复后汇总 100,000.00', (function () { var v = summaryCard('总贷款金额'); return v !== null && v.indexOf('100,000.00') >= 0; })());

if (fails.length) {
  print('APP TEST FAIL: ' + fails.join(' | '));
  quit(1);
}
print('ALL APP TESTS PASSED');
