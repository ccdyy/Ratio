'use strict';

/**
 * Ratio 贷款利率计算器 — 界面交互层
 * 依赖 js/calc.js（RatioCalc）
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  var YEAR_MIN = 2000;
  var YEAR_MAX = 2060;
  var MONTH_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  // 当前视图：total（合计）/ gjj（公积金）/ com（商业）
  var state = { view: 'total' };

  /* ───────────────────────── 工具 ───────────────────────── */

  function fmtMoney(x) {
    if (x === null || x === undefined || isNaN(x) || !isFinite(x)) return '—';
    return x.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fillSelect(sel, min, max, selected, names) {
    sel.innerHTML = '';
    for (var v = min; v <= max; v++) {
      var o = document.createElement('option');
      o.value = String(v);
      o.textContent = names ? names[v - min] : String(v);
      sel.appendChild(o);
    }
    sel.value = String(selected);
  }

  function ymToText(y, m) {
    return y + '年' + m + '月';
  }

  /* ─────────────── 动态行创建（利率区间） ─────────────── */

  function createRateRow(y, m, rate) {
    var row = document.createElement('div');
    row.className = 'rate-row';
    row.innerHTML =
      '<select class="ry"></select><span class="lbl">年</span>' +
      '<select class="rm"></select><span class="lbl">月</span>' +
      '<input class="rr rate-input" type="number" step="0.01" min="0" max="30" placeholder="利率%">' +
      '<button type="button" class="btn-del" title="删除该区间">✕</button>';
    fillSelect(row.querySelector('.ry'), YEAR_MIN, YEAR_MAX, y);
    fillSelect(row.querySelector('.rm'), 1, 12, m, MONTH_NAMES);
    row.querySelector('.rr').value = rate;
    return row;
  }

  function renderRates(part, initial) {
    var list = $(part + 'Rates');
    list.innerHTML = '';
    initial.forEach(function (seg) {
      list.appendChild(createRateRow(seg.y, seg.m, seg.rate));
    });
  }

  /* ─────────────── 动态行创建（提前还贷） ─────────────── */

  function createPrepayRow(item) {
    var row = document.createElement('div');
    row.className = 'prepay-row';
    row.innerHTML =
      '<select class="py"></select><span class="lbl">年</span>' +
      '<select class="pm"></select><span class="lbl">月</span>' +
      '<input class="pa prepay-amount" type="number" min="0" step="1000" placeholder="金额(元)">' +
      '<select class="pmode"><option value="reduce">减少月供（期限不变）</option>' +
      '<option value="shorten">缩短期限（月供不变）</option></select>' +
      '<select class="ppart">' +
      '<option value="gjj">公积金</option><option value="com">商业</option></select>' +
      '<button type="button" class="btn-del" title="删除该笔提前还贷">✕</button>';
    fillSelect(row.querySelector('.py'), YEAR_MIN, YEAR_MAX, item.y);
    fillSelect(row.querySelector('.pm'), 1, 12, item.m, MONTH_NAMES);
    row.querySelector('.pa').value = item.amount;
    row.querySelector('.pmode').value = item.mode;
    row.querySelector('.ppart').value = item.part || 'gjj';
    return row;
  }

  function addPrepayRow() {
    var sy = parseInt($('startYear').value, 10) || 2024;
    var sm = parseInt($('startMonth').value, 10) || 1;
    // 默认提前还贷日期：开始还贷 12 个月后（不超过年份上限）
    var idx = RatioCalc.ymIndex(sy, sm) + 12;
    var maxIdx = RatioCalc.ymIndex(YEAR_MAX, 12);
    if (idx > maxIdx) idx = maxIdx;
    var row = createPrepayRow({
      y: Math.floor(idx / 12), m: (idx % 12) + 1,
      amount: 100000, mode: 'reduce', part: 'gjj'
    });
    // 按当前贷款方式同步「适用部分」选择器的可见性（混合贷款才显示）
    var mode = document.querySelector('input[name="loanMode"]:checked').value;
    row.querySelector('.ppart').hidden = mode !== 'mixed';
    $('prepayList').appendChild(row);
  }

  function addRateRow(part) {
    var rows = $(part + 'Rates').querySelectorAll('.rate-row');
    var last = rows[rows.length - 1];
    var y, m, rate;
    if (last) {
      y = parseInt(last.querySelector('.ry').value, 10);
      m = parseInt(last.querySelector('.rm').value, 10);
      rate = parseFloat(last.querySelector('.rr').value) || 0;
      var idx = RatioCalc.ymIndex(y, m) + 12; // 默认一年后调整
      var maxIdx = RatioCalc.ymIndex(YEAR_MAX, 12);
      if (idx > maxIdx) idx = maxIdx;
      y = Math.floor(idx / 12); m = (idx % 12) + 1;
    } else {
      y = parseInt($('startYear').value, 10);
      m = parseInt($('startMonth').value, 10);
      rate = 3.0;
    }
    $(part + 'Rates').appendChild(createRateRow(y, m, rate));
  }

  /* ─────────────── 读取输入 ─────────────── */

  function readInputs() {
    var mode = document.querySelector('input[name="loanMode"]:checked').value;
    var method = document.querySelector('input[name="repayMethod"]:checked').value;
    var term = parseInt($('termMonths').value, 10);
    if (!term || term < 1) term = 0;
    if (term > 1200) term = 1200; // 与 HTML max 一致，防超大值卡顿/溢出
    var startY = parseInt($('startYear').value, 10);
    var startM = parseInt($('startMonth').value, 10);

    function readPart(key) {
      var amount = parseFloat($(key + 'Amount').value);
      if (!amount || amount < 0) amount = 0;
      if (amount > 1e10) amount = 1e10; // 金额上限（100 亿），防溢出
      var rates = [];
      var rows = $(key + 'Rates').querySelectorAll('.rate-row');
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var rate = parseFloat(r.querySelector('.rr').value) || 0;
        if (rate < 0) rate = 0;
        if (rate > 30) rate = 30; // 利率上限，防 Math.pow 溢出
        rates.push({
          y: parseInt(r.querySelector('.ry').value, 10),
          m: parseInt(r.querySelector('.rm').value, 10),
          rate: rate
        });
      }
      return { amount: amount, rates: rates };
    }

    var prepays = [];
    var pRows = $('prepayList').querySelectorAll('.prepay-row');
    for (var j = 0; j < pRows.length; j++) {
      var pr = pRows[j];
      var pa = parseFloat(pr.querySelector('.pa').value);
      if (!pa || pa <= 0) continue;
      prepays.push({
        y: parseInt(pr.querySelector('.py').value, 10),
        m: parseInt(pr.querySelector('.pm').value, 10),
        amount: pa,
        mode: pr.querySelector('.pmode').value,
        part: pr.querySelector('.ppart').hidden ? (mode === 'commercial' ? 'com' : 'gjj') : pr.querySelector('.ppart').value
      });
    }

    return { mode: mode, method: method, term: term, startY: startY, startM: startM,
             gjj: readPart('gjj'), com: readPart('com'), prepays: prepays };
  }

  /* ─────────────── 计算 ─────────────── */

  function calcPart(inp, key, withPrepay) {
    var part = inp[key];
    if (!part.amount) return null;
    var prepays = [];
    if (withPrepay) {
      prepays = inp.prepays.filter(function (p) { return p.part === key; });
    }
    return RatioCalc.schedule({
      amount: part.amount, term: inp.term,
      startY: inp.startY, startM: inp.startM,
      method: inp.method, rates: part.rates, prepays: prepays
    });
  }

  /**
   * 按视图（合计/公积金/商业）取合并后的行数据。
   * returns { rows, totalInterest, usedTerms } 或 null
   */
  function rowsForView(inp, withPrepay, view) {
    var pl = calcPart(inp, 'gjj', withPrepay);
    var pc = calcPart(inp, 'com', withPrepay);
    var mode = inp.mode;

    if (view === 'gjj') return pl;
    if (view === 'com') return pc;
    // total：混合=合并；纯公积金=公积金；纯商业=商业
    if (mode === 'mixed') {
      var parts = [];
      if (pl) parts.push(pl);
      if (pc) parts.push(pc);
      if (!parts.length) return null;
      return parts.length === 1 ? parts[0] : RatioCalc.combine(parts);
    }
    return mode === 'commercial' ? pc : pl;
  }

  /* ─────────────── 渲染：汇总 ─────────────── */

  function renderSummary(inp, basePlan, withPlan, hasPrepay) {
    var el = $('summary');
    var totalAmount = (inp.mode === 'mixed') ? inp.gjj.amount + inp.com.amount
      : (inp.mode === 'commercial' ? inp.com.amount : inp.gjj.amount);

    var cards = [];
    cards.push({ k: '总贷款金额', v: fmtMoney(totalAmount), cls: '', unit: '元' });
    cards.push({ k: '未提前还贷 · 总利息', v: fmtMoney(basePlan ? basePlan.totalInterest : 0), cls: '', unit: '元' });
    cards.push({ k: '未提前还贷 · 总还款额', v: fmtMoney(basePlan ? basePlan.total : 0), cls: '', unit: '元' });

    if (hasPrepay && withPlan) {
      cards.push({ k: '提前还贷后 · 总利息', v: fmtMoney(withPlan.totalInterest), cls: 'green', unit: '元' });
      cards.push({ k: '提前还贷后 · 总还款额', v: fmtMoney(withPlan.total), cls: 'green', unit: '元' });
      cards.push({
        k: '提前还贷后 · 实际期数', v: withPlan.usedTerms, cls: 'accent', unit: '期'
      });
      cards.push({
        k: '节省利息', v: fmtMoney(Math.max(0, basePlan.totalInterest - withPlan.totalInterest)),
        cls: 'red', unit: '元'
      });
    } else {
      cards.push({ k: '提前还贷后 · 总利息', v: '—', cls: '', unit: '' });
      cards.push({ k: '提前还贷后 · 总还款额', v: '—', cls: '', unit: '' });
      cards.push({ k: '提前还贷后 · 实际期数', v: hasPrepay ? '—' : inp.term + ' 期', cls: 'accent', unit: '' });
      cards.push({ k: '节省利息', v: '0.00', cls: '', unit: '元' });
    }

    el.innerHTML = '';
    cards.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'sum-item ' + c.cls;
      d.innerHTML = '<div class="k">' + c.k + '</div><div class="v">' + c.v +
        (c.unit ? '<small>' + c.unit + '</small>' : '') + '</div>';
      el.appendChild(d);
    });
  }

  /* ─────────────── 渲染：表格 ─────────────── */

  function renderTable(tbody, plan, prepayMonths) {
    tbody.innerHTML = '';
    if (!plan || !plan.rows.length) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="7" class="empty-tip">暂无数据 — 请检查左侧设置（贷款金额、期限等）</td>';
      tbody.appendChild(tr);
      return;
    }
    var frag = document.createDocumentFragment();
    plan.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      if (prepayMonths && prepayMonths[ymToText(r.y, r.m)]) {
        tr.className = 'hl-row';
        tr.innerHTML =
          '<td>' + r.i + (prepayMonths[ymToText(r.y, r.m)] ? '<span class="prepay-flag" title="该月发生提前还贷"> ★</span>' : '') + '</td>' +
          '<td>' + ymToText(r.y, r.m) + '</td>' +
          '<td class="num principal-col">' + fmtMoney(r.principal) + '</td>' +
          '<td class="num interest-col">' + fmtMoney(r.interest) + '</td>' +
          '<td class="num total-col">' + fmtMoney(r.total) + '</td>' +
          '<td class="num remain">' + fmtMoney(r.remainPrincipal) + '</td>' +
          '<td class="num remain">' + fmtMoney(r.remainInterest) + '</td>';
      } else {
        tr.innerHTML =
          '<td>' + r.i + '</td>' +
          '<td>' + ymToText(r.y, r.m) + '</td>' +
          '<td class="num principal-col">' + fmtMoney(r.principal) + '</td>' +
          '<td class="num interest-col">' + fmtMoney(r.interest) + '</td>' +
          '<td class="num total-col">' + fmtMoney(r.total) + '</td>' +
          '<td class="num remain">' + fmtMoney(r.remainPrincipal) + '</td>' +
          '<td class="num remain">' + fmtMoney(r.remainInterest) + '</td>';
      }
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  /* ─────────────── 主流程 ─────────────── */

  function refresh() {
    var inp = readInputs();

    // 汇总数据（按合计视图）
    var basePlan = rowsForView(inp, false, 'total');
    var withPlan = rowsForView(inp, true, 'total');
    var hasPrepay = inp.prepays.length > 0;

    // 提前还贷月份集合（当前视图）
    function prepayMonthsFor(view) {
      var map = {};
      inp.prepays.forEach(function (p) {
        if (view === 'total' || p.part === view) map[ymToText(p.y, p.m)] = true;
      });
      return Object.keys(map).length ? map : null;
    }

    // 视图有效性：非混合模式时强制 total
    var view = inp.mode === 'mixed' ? state.view : 'total';
    state.view = view;

    renderSummary(inp, basePlan, withPlan, hasPrepay);

    // 表格 1：未提前还贷
    renderTable($('tbodyBase'), rowsForView(inp, false, view), null);

    // 表格 2：提前还贷后
    var prepayCard = $('prepayCard');
    if (hasPrepay) {
      prepayCard.hidden = false;
      renderTable($('tbodyWith'), rowsForView(inp, true, view), prepayMonthsFor(view));
    } else {
      prepayCard.hidden = true;
    }

    // 视图切换按钮
    $('viewTabs').hidden = inp.mode !== 'mixed';
    var tabs = $('viewTabs').querySelectorAll('.tab');
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].classList.toggle('active', tabs[t].getAttribute('data-view') === view);
    }
  }

  /* ─────────────── 贷款方式切换 ─────────────── */

  function applyMode() {
    var mode = document.querySelector('input[name="loanMode"]:checked').value;
    $('gjjCard').hidden = (mode === 'commercial');
    $('comCard').hidden = (mode === 'gjj');
    // 提前还贷行的"部分"选择只在混合模式显示
    var pRows = $('prepayList').querySelectorAll('.prepay-row');
    for (var i = 0; i < pRows.length; i++) {
      pRows[i].querySelector('.ppart').hidden = mode !== 'mixed';
    }
    refresh();
  }

  /* ─────────────── 事件绑定 ─────────────── */

  function bindEvents() {
    var settings = $('settings');

    // 贷款方式切换
    settings.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'loanMode') applyMode();
    });

    // 所有输入变化 → 重算（委托）
    settings.addEventListener('input', function () { refresh(); });
    settings.addEventListener('change', function () { refresh(); });

    // 视图切换
    $('viewTabs').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.tab') : null;
      if (!btn) return;
      state.view = btn.getAttribute('data-view');
      refresh();
    });

    // 删除动态行（委托）
    settings.addEventListener('click', function (e) {
      var btn = e.target;
      if (!btn.classList || !btn.classList.contains('btn-del')) return;
      var row = btn.closest ? btn.closest('.rate-row, .prepay-row') : null;
      if (!row) return;
      // 利率区间至少保留一个
      if (row.classList.contains('rate-row')) {
        var list = row.parentNode;
        if (list.querySelectorAll('.rate-row').length <= 1) return;
      }
      row.parentNode.removeChild(row);
      refresh();
    });

    // 添加按钮
    $('addPrepay').addEventListener('click', function () { addPrepayRow(); refresh(); });
    var addBtns = document.querySelectorAll('[data-add-rates]');
    for (var i = 0; i < addBtns.length; i++) {
      addBtns[i].addEventListener('click', function () {
        addRateRow(this.getAttribute('data-add-rates'));
        refresh();
      });
    }
  }

  /* ─────────────── 初始化 ─────────────── */

  function init() {
    fillSelect($('startYear'), YEAR_MIN, YEAR_MAX, 2023);
    fillSelect($('startMonth'), 1, 12, 1, MONTH_NAMES);

    // 默认利率区间：示例分段利率
    renderRates('gjj', [
      { y: 2023, m: 1, rate: 3.1 },
      { y: 2025, m: 1, rate: 2.85 },
      { y: 2025, m: 6, rate: 2.6 }
    ]);
    renderRates('com', [
      { y: 2023, m: 1, rate: 4.0 },
      { y: 2025, m: 1, rate: 3.7 }
    ]);

    bindEvents();
    applyMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
