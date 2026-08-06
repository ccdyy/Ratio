'use strict';

/**
 * Ratio 贷款利率计算器 — 纯计算引擎（无 DOM 依赖，可在浏览器与 jsc 中运行）
 *
 * 支持：
 *  - 等额本金 / 等额本息 两种还款方式
 *  - 时间轴上的分段年利率（每期使用当月生效的利率）
 *  - 多次提前还贷，每笔可选择「减少月供（期限不变）」或「缩短期限（月供不变）」
 *
 * 输出保证：每期本金、利息均按「分」取整；全局最后一期清零尾差，逐期本金之和与贷款本金误差控制在分内。
 */
(function (global) {
  'use strict';

  /** 年月 → 连续月份序号（用于比较/递增） */
  function ymIndex(y, m) {
    return y * 12 + (m - 1);
  }

  /** 某月序号生效的年利率（最后匹配的区间；无区间时返回 0） */
  function rateAtMonth(idx, rates) {
    var r = 0;
    if (rates && rates.length) {
      r = rates[0].rate;
      for (var i = 0; i < rates.length; i++) {
        if (ymIndex(rates[i].y, rates[i].m) <= idx) r = rates[i].rate;
      }
    }
    return r;
  }

  /** 金额取整到分 */
  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  /**
   * 等额本息：从月序号 cur 起、剩余本金 p、剩余期数 remain 的下一段还款参数。
   * 段内利率恒定、月供恒定；跨段后按新利率、新剩余本金重算（行业重定价口径）。
   * 返回 { amount, len } — len 为本段期数（到下一利率区间起点为止）。
   */
  function nextInstallmentSegment(p, remain, cur, rates) {
    var segLen = remain;
    for (var i = 0; i < rates.length; i++) {
      var si = ymIndex(rates[i].y, rates[i].m);
      if (si > cur) {
        segLen = Math.min(si - cur, remain);
        break;
      }
    }
    var r = rateAtMonth(cur, rates) / 100 / 12;
    var amount;
    if (r === 0) {
      amount = p / remain;
    } else {
      // A = P·r·(1+r)^n / ((1+r)^n − 1)
      amount = p * r * Math.pow(1 + r, remain) / (Math.pow(1 + r, remain) - 1);
    }
    return { amount: amount, len: segLen };
  }

  /**
   * 等额本息：原计划的月供序列（按期数索引）。
   * 段内月供恒定；跨段时按「段初剩余本金 + 剩余总期数 + 新利率」重算。
   * 用于 shorten（缩短期限）模式——保持原计划月供节奏。
   */
  function installmentAmountSeries(P, n, s, rates) {
    var out = [];
    var p = P;
    var remain = n;
    var cur = s;
    while (remain > 0) {
      var seg = nextInstallmentSegment(p, remain, cur, rates);
      for (var k = 0; k < seg.len; k++) out.push(seg.amount);
      var r = rateAtMonth(cur, rates) / 100 / 12;
      if (r === 0) {
        p -= seg.amount * seg.len;
      } else {
        p = p * Math.pow(1 + r, seg.len) - seg.amount * (Math.pow(1 + r, seg.len) - 1) / r;
      }
      remain -= seg.len;
      cur += seg.len;
    }
    return out;
  }

  /**
   * 生成一份贷款还款计划。
   * input: {
   *   amount: 贷款本金(元), term: 总期数(月),
   *   startY, startM: 开始还贷年月,
   *   method: 'installment'（等额本息）| 'principal'（等额本金）,
   *   rates: [{y, m, rate(年利率%)}]（可多段，自动按日期排序）,
   *   prepays: [{y, m, amount, mode: 'reduce'|'shorten'}]（可多笔）
   * }
   * returns: {
   *   rows: [{i, y, m, principal, interest, total, remainPrincipal, remainInterest}],
   *   totalInterest, total, usedTerms（实际期数）
   * }
   */
  function schedule(input) {
    var amount = input.amount;
    var term = input.term;
    var s = ymIndex(input.startY, input.startM);
    var rates = (input.rates || []).slice().sort(function (a, b) {
      return ymIndex(a.y, a.m) - ymIndex(b.y, b.m);
    });
    var prepayList = (input.prepays || []).map(function (p) {
      return { idx: ymIndex(p.y, p.m), amount: p.amount, mode: p.mode === 'shorten' ? 'shorten' : 'reduce' };
    }).sort(function (a, b) { return a.idx - b.idx; });

    // 同月多笔提前还贷按月份分组
    var prepayMap = {};
    prepayList.forEach(function (p) {
      (prepayMap[p.idx] = prepayMap[p.idx] || []).push(p);
    });

    var isInstallment = input.method === 'installment';
    var p = amount;
    var principalBase = amount / term; // 等额本金：固定月本金
    var seg = null;                    // 等额本息：当前段 {amount, len}
    var baseAmounts = isInstallment ? installmentAmountSeries(amount, term, s, rates) : null; // shorten 用：原计划月供序列
    var shortenMode = false;           // shorten 激活后月供锁定为原计划序列
    var rows = [];

    for (var i = 1; i <= term; i++) {
      if (p <= 0) break; // 已提前还清（缩短期限模式下可能提前结束）

      var curIdx = s + i - 1;                    // 当期月份序号
      var r = rateAtMonth(curIdx, rates) / 100 / 12;
      var interest = round2(p * r);
      var principal;
      if (isInstallment) {
        if (shortenMode) {
          // 缩短期限：月供保持原计划序列（跨利率段也不变），本金减少 → 提前还清
          principal = Math.min(round2(baseAmounts[i - 1] - interest), p);
        } else if (i === term) {
          principal = p; // 全局最后一期：清尾差，精确归零
        } else {
          if (!seg || seg.len <= 0) {
            seg = nextInstallmentSegment(p, term - i + 1, curIdx, rates);
          }
          var a = seg.amount;
          seg.len--;
          principal = Math.min(round2(a - interest), p);
        }
      } else {
        principal = (i === term) ? p : Math.min(round2(principalBase), p);
      }
      p = round2(p - principal);
      if (p < 0) p = 0;

      // 当期还款后发生提前还贷（提前还款额计入当月本金与总额）
      if (prepayMap[curIdx]) {
        for (var j = 0; j < prepayMap[curIdx].length; j++) {
          var pp = prepayMap[curIdx][j];
          var paid = Math.min(pp.amount, p); // 实际冲抵的本金（不超过剩余本金）
          p = round2(p - paid);
          if (p < 0) p = 0;
          principal = round2(principal + paid);
          if (pp.mode === 'reduce' && p > 0) {
            // 期限不变：从下一期起按剩余本金重新计算
            shortenMode = false;
            if (isInstallment) {
              seg = null; // 下期用新本金、新利率段重算
            } else {
              principalBase = (term - i > 0) ? p / (term - i) : 0;
            }
          } else if (pp.mode === 'shorten' && p > 0) {
            // 缩短期限：月供节奏锁定为原计划序列，仅本金减少 → 自然提前还清
            shortenMode = true;
          }
        }
      }

      rows.push({
        i: i,
        y: Math.floor(curIdx / 12),
        m: (curIdx % 12) + 1,
        principal: principal,
        interest: interest,
        total: round2(principal + interest),
        remainPrincipal: p
      });
    }

    // 总利息剩余：从末行向前累计
    var remainInterest = 0;
    for (var k = rows.length - 1; k >= 0; k--) {
      remainInterest = round2(remainInterest + rows[k].interest);
      rows[k].remainInterest = remainInterest;
    }

    var totalInterest = rows.length ? rows[0].remainInterest : 0;
    return {
      rows: rows,
      totalInterest: totalInterest,
      total: round2(amount + totalInterest),
      usedTerms: rows.length
    };
  }

  /**
   * 合并多份计划（混合贷款：公积金 + 商业）为一张表。
   * 按期号对齐；某部分提前结束的期次补零。
   */
  function combine(plans) {
    var maxTerms = 0;
    plans.forEach(function (pl) { if (pl.rows.length > maxTerms) maxTerms = pl.rows.length; });
    var rows = [];
    var total = 0;
    plans.forEach(function (pl) { total += pl.total; });
    for (var i = 0; i < maxTerms; i++) {
      var byPart = plans.map(function (pl) { return pl.rows[i] || null; });
      var row = {
        i: i + 1,
        y: 0, m: 0,
        principal: 0, interest: 0, total: 0,
        remainPrincipal: 0, remainInterest: 0,
        parts: byPart
      };
      byPart.forEach(function (rr) {
        if (rr) {
          row.y = rr.y; row.m = rr.m;
          row.principal = round2(row.principal + rr.principal);
          row.interest = round2(row.interest + rr.interest);
          row.total = round2(row.total + rr.total);
          row.remainPrincipal = round2(row.remainPrincipal + rr.remainPrincipal);
          row.remainInterest = round2(row.remainInterest + rr.remainInterest);
        }
      });
      rows.push(row);
    }
    var totalInterest = rows.length ? rows[0].remainInterest : 0;
    return { rows: rows, totalInterest: totalInterest, usedTerms: maxTerms, total: round2(total) };
  }

  global.RatioCalc = {
    ymIndex: ymIndex,
    rateAtMonth: rateAtMonth,
    schedule: schedule,
    combine: combine
  };
})(typeof window !== 'undefined' ? window : globalThis);
