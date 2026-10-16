import {
  CalculatorState,
  LoanPartKey,
  PrepayItem,
  RateSegment,
  ScheduleInput,
  SchedulePlan,
  ScheduleRow,
  ViewKey,
} from './types';

/**
 * Ratio 贷款利率计算器 — 纯计算引擎（无 DOM 依赖，与 Ratio-h5 保持 100% 算法与精度一致）
 *
 * 支持：
 *  - 等额本金 / 等额本息 两种还款方式
 *  - 时间轴上的分段年利率（每期使用当月生效的利率）
 *  - 多次提前还贷，每笔可选择「减少月供（期限不变）」或「缩短期限（月供不变）」
 *
 * 输出保证：每期本金、利息均按「分」取整；全局最后一期清零尾差，逐期本金之和与贷款本金误差控制在分内。
 */

/** 年月 → 连续月份序号（用于比较/递增） */
export function ymIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

/** 某月序号生效的年利率（最后匹配的区间；无区间时返回 0） */
export function rateAtMonth(idx: number, rates: RateSegment[]): number {
  let r = 0;
  if (rates && rates.length) {
    r = rates[0].rate;
    for (let i = 0; i < rates.length; i++) {
      if (ymIndex(rates[i].y, rates[i].m) <= idx) {
        r = rates[i].rate;
      }
    }
  }
  return r;
}

/** 金额取整到分 */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * 等额本息：从月序号 cur 起、剩余本金 p、剩余期数 remain 的下一段还款参数。
 * 段内利率恒定、月供恒定；跨段后按新利率、新剩余本金重算（行业重定价口径）。
 * 返回 { amount, len } — len 为本段期数（到下一利率区间起点为止）。
 */
function nextInstallmentSegment(
  p: number,
  remain: number,
  cur: number,
  rates: RateSegment[]
): { amount: number; len: number } {
  let segLen = remain;
  for (let i = 0; i < rates.length; i++) {
    const si = ymIndex(rates[i].y, rates[i].m);
    if (si > cur) {
      segLen = Math.min(si - cur, remain);
      break;
    }
  }
  const r = rateAtMonth(cur, rates) / 100 / 12;
  let amount: number;
  if (r === 0) {
    amount = p / remain;
  } else {
    // A = P·r·(1+r)^n / ((1+r)^n − 1)
    amount = (p * r * Math.pow(1 + r, remain)) / (Math.pow(1 + r, remain) - 1);
  }
  return { amount, len: segLen };
}

/**
 * 等额本息：原计划的月供序列（按期数索引）。
 * 段内月供恒定；跨段时按「段初剩余本金 + 剩余总期数 + 新利率」重算。
 * 用于 shorten（缩短期限）模式——保持原计划月供节奏。
 */
function installmentAmountSeries(
  P: number,
  n: number,
  s: number,
  rates: RateSegment[]
): number[] {
  const out: number[] = [];
  let p = P;
  let remain = n;
  let cur = s;
  while (remain > 0) {
    const seg = nextInstallmentSegment(p, remain, cur, rates);
    for (let k = 0; k < seg.len; k++) out.push(seg.amount);
    const r = rateAtMonth(cur, rates) / 100 / 12;
    if (r === 0) {
      p -= seg.amount * seg.len;
    } else {
      p =
        p * Math.pow(1 + r, seg.len) -
        (seg.amount * (Math.pow(1 + r, seg.len) - 1)) / r;
    }
    remain -= seg.len;
    cur += seg.len;
  }
  return out;
}

/**
 * 生成一份贷款还款计划。
 */
export function schedule(input: ScheduleInput): SchedulePlan {
  const amount = input.amount;
  const term = input.term;
  const s = ymIndex(input.startY, input.startM);
  const rates = (input.rates || [])
    .slice()
    .sort((a, b) => ymIndex(a.y, a.m) - ymIndex(b.y, b.m));
  const prepayList = (input.prepays || [])
    .map((p) => ({
      idx: ymIndex(p.y, p.m),
      amount: p.amount,
      mode: p.mode === 'shorten' ? ('shorten' as const) : ('reduce' as const),
    }))
    .sort((a, b) => a.idx - b.idx);

  // 同月多笔提前还贷按月份分组
  const prepayMap: Record<number, typeof prepayList> = {};
  prepayList.forEach((p) => {
    (prepayMap[p.idx] = prepayMap[p.idx] || []).push(p);
  });

  const isInstallment = input.method === 'installment';
  let p = amount;
  let principalBase = amount / term; // 等额本金：固定月本金
  let seg: { amount: number; len: number } | null = null; // 等额本息：当前段
  const baseAmounts = isInstallment
    ? installmentAmountSeries(amount, term, s, rates)
    : null; // shorten 用：原计划月供序列
  let shortenMode = false; // shorten 激活后月供锁定为原计划序列
  const rows: ScheduleRow[] = [];

  for (let i = 1; i <= term; i++) {
    if (p <= 0) break; // 已提前还清（缩短期限模式下可能提前结束）

    const curIdx = s + i - 1; // 当期月份序号
    const r = rateAtMonth(curIdx, rates) / 100 / 12;
    const interest = round2(p * r);
    let principal: number;
    if (isInstallment) {
      if (shortenMode && baseAmounts) {
        // 缩短期限：月供保持原计划序列（跨利率段也不变），本金减少 → 提前还清
        principal = Math.min(round2(baseAmounts[i - 1] - interest), p);
      } else if (i === term) {
        principal = p; // 全局最后一期：清尾差，精确归零
      } else {
        if (!seg || seg.len <= 0) {
          seg = nextInstallmentSegment(p, term - i + 1, curIdx, rates);
        }
        const a = seg.amount;
        seg.len--;
        principal = Math.min(round2(a - interest), p);
      }
    } else {
      principal = i === term ? p : Math.min(round2(principalBase), p);
    }
    p = round2(p - principal);
    if (p < 0) p = 0;

    // 当期还款后发生提前还贷（提前还款额计入当月本金与总额）
    if (prepayMap[curIdx]) {
      for (let j = 0; j < prepayMap[curIdx].length; j++) {
        const pp = prepayMap[curIdx][j];
        const paid = Math.min(pp.amount, p); // 实际冲抵的本金（不超过剩余本金）
        p = round2(p - paid);
        if (p < 0) p = 0;
        principal = round2(principal + paid);
        if (pp.mode === 'reduce' && p > 0) {
          // 期限不变：从下一期起按剩余本金重新计算
          shortenMode = false;
          if (isInstallment) {
            seg = null; // 下期用新本金、新利率段重算
          } else {
            principalBase = term - i > 0 ? p / (term - i) : 0;
          }
        } else if (pp.mode === 'shorten' && p > 0) {
          // 缩短期限：月供节奏锁定为原计划序列，仅本金减少 → 自然提前还清
          shortenMode = true;
        }
      }
    }

    rows.push({
      i,
      y: Math.floor(curIdx / 12),
      m: (curIdx % 12) + 1,
      principal,
      interest,
      total: round2(principal + interest),
      remainPrincipal: p,
      remainInterest: 0,
    });
  }

  // 总利息剩余：从末行向前累计
  let remainInterest = 0;
  for (let k = rows.length - 1; k >= 0; k--) {
    remainInterest = round2(remainInterest + rows[k].interest);
    rows[k].remainInterest = remainInterest;
  }

  const totalInterest = rows.length ? rows[0].remainInterest : 0;
  return {
    rows,
    totalInterest,
    total: round2(amount + totalInterest),
    usedTerms: rows.length,
  };
}

/**
 * 合并多份计划（混合贷款：公积金 + 商业）为一张表。
 * 按期号对齐；某部分提前结束的期次补零。
 */
export function combine(plans: SchedulePlan[]): SchedulePlan {
  let maxTerms = 0;
  plans.forEach((pl) => {
    if (pl.rows.length > maxTerms) maxTerms = pl.rows.length;
  });
  const rows: ScheduleRow[] = [];
  let total = 0;
  plans.forEach((pl) => {
    total += pl.total;
  });
  for (let i = 0; i < maxTerms; i++) {
    const byPart = plans.map((pl) => pl.rows[i] || null);
    const row: ScheduleRow = {
      i: i + 1,
      y: 0,
      m: 0,
      principal: 0,
      interest: 0,
      total: 0,
      remainPrincipal: 0,
      remainInterest: 0,
      parts: byPart,
    };
    byPart.forEach((rr) => {
      if (rr) {
        row.y = rr.y;
        row.m = rr.m;
        row.principal = round2(row.principal + rr.principal);
        row.interest = round2(row.interest + rr.interest);
        row.total = round2(row.total + rr.total);
        row.remainPrincipal = round2(row.remainPrincipal + rr.remainPrincipal);
        row.remainInterest = round2(row.remainInterest + rr.remainInterest);
      }
    });
    rows.push(row);
  }
  const totalInterest = rows.length ? rows[0].remainInterest : 0;
  return {
    rows,
    totalInterest,
    usedTerms: maxTerms,
    total: round2(total),
  };
}

/** 格式化金额为千分位两位小数 */
export function fmtMoney(x: number | null | undefined): string {
  if (x === null || x === undefined || isNaN(x) || !isFinite(x)) return '—';
  return x.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 年月转中文文本 */
export function ymToText(y: number, m: number): string {
  return `${y}年${m}月`;
}

/** 计算单部分（公积金或商业）计划 */
export function calcPart(
  inp: CalculatorState,
  key: LoanPartKey,
  withPrepay: boolean
): SchedulePlan | null {
  const part = inp[key];
  if (!part.amount || inp.term < 1) return null;
  let prepays: PrepayItem[] = [];
  if (withPrepay) {
    prepays = inp.prepays.filter((p) => p.part === key);
  }
  return schedule({
    amount: part.amount,
    term: inp.term,
    startY: inp.startY,
    startM: inp.startM,
    method: inp.method,
    rates: part.rates,
    prepays,
  });
}

/** 按视图（合计/公积金/商业）获取合并后的计划 */
export function rowsForView(
  inp: CalculatorState,
  withPrepay: boolean,
  view: ViewKey
): SchedulePlan | null {
  const pl = calcPart(inp, 'gjj', withPrepay);
  const pc = calcPart(inp, 'com', withPrepay);
  const mode = inp.mode;

  if (view === 'gjj') return pl;
  if (view === 'com') return pc;
  // total：混合=合并；纯公积金=公积金；纯商业=商业
  if (mode === 'mixed') {
    const parts: SchedulePlan[] = [];
    if (pl) parts.push(pl);
    if (pc) parts.push(pc);
    if (!parts.length) return null;
    return parts.length === 1 ? parts[0] : combine(parts);
  }
  return mode === 'commercial' ? pc : pl;
}

/** 计算当前贷款方式下的总贷款本金 */
export function totalAmountOf(inp: CalculatorState): number {
  return inp.mode === 'mixed'
    ? inp.gjj.amount + inp.com.amount
    : inp.mode === 'commercial'
    ? inp.com.amount
    : inp.gjj.amount;
}

/** 生成 Markdown 报告（用于导出到笔记或复制） */
export function generateMarkdownReport(
  inp: CalculatorState,
  includeFullTable = true
): string {
  const modeLabel =
    inp.mode === 'mixed'
      ? '混合贷款（公积金 + 商业）'
      : inp.mode === 'commercial'
      ? '纯商业贷款'
      : '纯公积金贷款';
  const methodLabel = inp.method === 'installment' ? '等额本息' : '等额本金';
  const basePlan = rowsForView(inp, false, 'total');
  const withPlan = rowsForView(inp, true, 'total');
  const hasPrepay = inp.prepays.length > 0;
  const totalAmt = totalAmountOf(inp);

  const lines: string[] = [];
  lines.push(`# 中国房贷计算报告`);
  lines.push('');
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push('');
  lines.push(`## 一、基本参数`);
  lines.push('');
  lines.push(`| 参数项 | 数值 |`);
  lines.push(`| :--- | :--- |`);
  lines.push(`| **贷款方式** | ${modeLabel} |`);
  lines.push(`| **还款方式** | ${methodLabel} |`);
  lines.push(`| **总贷款金额** | ${fmtMoney(totalAmt)} 元 |`);
  if (inp.mode === 'gjj' || inp.mode === 'mixed') {
    const ratesStr = inp.gjj.rates
      .map((r) => `${ymToText(r.y, r.m)}起 ${r.rate}%`)
      .join(' → ');
    lines.push(
      `| **公积金贷款** | ${fmtMoney(inp.gjj.amount)} 元（利率：${ratesStr}） |`
    );
  }
  if (inp.mode === 'commercial' || inp.mode === 'mixed') {
    const ratesStr = inp.com.rates
      .map((r) => `${ymToText(r.y, r.m)}起 ${r.rate}%`)
      .join(' → ');
    lines.push(
      `| **商业贷款** | ${fmtMoney(inp.com.amount)} 元（利率：${ratesStr}） |`
    );
  }
  lines.push(`| **贷款期限** | ${inp.term} 期（${(inp.term / 12).toFixed(1)} 年） |`);
  lines.push(`| **开始还贷时间** | ${ymToText(inp.startY, inp.startM)} |`);

  if (hasPrepay) {
    lines.push('');
    lines.push(`### 提前还贷设置`);
    lines.push('');
    lines.push(`| 序号 | 还款年月 | 提前还款金额 (元) | 后续方式 | 适用部分 |`);
    lines.push(`| :---: | :---: | ---: | :---: | :---: |`);
    inp.prepays.forEach((p, idx) => {
      const mText =
        p.mode === 'shorten' ? '缩短期限（月供不变）' : '减少月供（期限不变）';
      const pText = p.part === 'com' ? '商业贷款' : '公积金贷款';
      lines.push(
        `| ${idx + 1} | ${ymToText(p.y, p.m)} | ${fmtMoney(p.amount)} | ${mText} | ${pText} |`
      );
    });
  }

  lines.push('');
  lines.push(`## 二、汇总对比`);
  lines.push('');
  lines.push(`| 指标 | 未提前还贷 | 提前还贷后 |`);
  lines.push(`| :--- | ---: | ---: |`);
  lines.push(
    `| **总贷款本金** | ${fmtMoney(totalAmt)} 元 | ${fmtMoney(totalAmt)} 元 |`
  );
  lines.push(
    `| **总还款额** | ${fmtMoney(basePlan ? basePlan.total : 0)} 元 | ${
      hasPrepay && withPlan ? fmtMoney(withPlan.total) + ' 元' : '—'
    } |`
  );
  lines.push(
    `| **总支付利息** | ${fmtMoney(basePlan ? basePlan.totalInterest : 0)} 元 | ${
      hasPrepay && withPlan ? fmtMoney(withPlan.totalInterest) + ' 元' : '—'
    } |`
  );
  lines.push(
    `| **实际还款期数** | ${inp.term} 期 | ${
      hasPrepay && withPlan ? withPlan.usedTerms + ' 期' : '—'
    } |`
  );
  if (hasPrepay && basePlan && withPlan) {
    const saved = Math.max(0, round2(basePlan.totalInterest - withPlan.totalInterest));
    lines.push(`| **节省利息** | — | **${fmtMoney(saved)} 元** |`);
  }

  if (includeFullTable) {
    const activePlan = hasPrepay && withPlan ? withPlan : basePlan;
    const tableTitle =
      hasPrepay && withPlan
        ? '## 三、每月还款计划（提前还贷后）'
        : '## 三、每月还款计划（未提前还贷）';
    const prepaySet: Record<string, boolean> = {};
    if (hasPrepay) {
      inp.prepays.forEach((p) => {
        prepaySet[ymToText(p.y, p.m)] = true;
      });
    }
    if (activePlan && activePlan.rows.length > 0) {
      lines.push('');
      lines.push(tableTitle);
      lines.push('');
      lines.push(
        `| 期数 | 还款日期 | 月还款本金 | 月还款利息 | 月还款总额 | 总本金剩余 | 总利息剩余 |`
      );
      lines.push(`| :---: | :---: | ---: | ---: | ---: | ---: | ---: |`);
      activePlan.rows.forEach((r) => {
        const dt = ymToText(r.y, r.m);
        const flag = prepaySet[dt] ? ' ★' : '';
        lines.push(
          `| ${r.i}${flag} | ${dt} | ${fmtMoney(r.principal)} | ${fmtMoney(
            r.interest
          )} | ${fmtMoney(r.total)} | ${fmtMoney(r.remainPrincipal)} | ${fmtMoney(
            r.remainInterest
          )} |`
        );
      });
    }
  }

  lines.push('');
  return lines.join('\n');
}

export const RatioCalc = {
  ymIndex,
  rateAtMonth,
  round2,
  schedule,
  combine,
  fmtMoney,
  ymToText,
  calcPart,
  rowsForView,
  totalAmountOf,
  generateMarkdownReport,
};
