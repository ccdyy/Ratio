export type LoanMode = 'gjj' | 'commercial' | 'mixed';
export type RepayMethod = 'installment' | 'principal';
export type PrepayMode = 'reduce' | 'shorten';
export type LoanPartKey = 'gjj' | 'com';
export type ViewKey = 'total' | 'gjj' | 'com';
export type ResultTabKey = 'base' | 'prepay';

export interface RateSegment {
  y: number;
  m: number;
  rate: number;
}

export interface PrepayItem {
  y: number;
  m: number;
  amount: number;
  mode: PrepayMode;
  part?: LoanPartKey;
}

export interface LoanPartInput {
  amount: number;
  rates: RateSegment[];
}

export interface CalculatorState {
  mode: LoanMode;
  method: RepayMethod;
  term: number;
  startY: number;
  startM: number;
  gjj: LoanPartInput;
  com: LoanPartInput;
  prepays: PrepayItem[];
}

export interface ScheduleInput {
  amount: number;
  term: number;
  startY: number;
  startM: number;
  method: RepayMethod;
  rates: RateSegment[];
  prepays?: PrepayItem[];
}

export interface ScheduleRow {
  i: number;
  y: number;
  m: number;
  principal: number;
  interest: number;
  total: number;
  remainPrincipal: number;
  remainInterest: number;
  parts?: (ScheduleRow | null)[];
}

export interface SchedulePlan {
  rows: ScheduleRow[];
  totalInterest: number;
  total: number;
  usedTerms: number;
}

export interface RatioPluginSettings {
  defaultOpenLocation: 'main' | 'right' | 'left';
  exportIncludeFullTable: boolean;
  exportFolder: string;
  savedState: CalculatorState;
}

export interface GjjHistoryRateItem {
  date: string;
  effectiveYm: { y: number; m: number };
  existingEffectiveYm: { y: number; m: number };
  firstUnder5: number;
  firstOver5: number;
  secondUnder5: number;
  secondOver5: number;
  note: string;
}

/**
 * 中国人民银行历次个人住房公积金贷款基准利率调整表（2011 年至今）
 * 注：新发放贷款一般自公布当月/当日执行；存量贷款通常自次年 1 月 1 日起执行（2025.05 政策明确存量自 2026.01 起执行，部分地区/阶段支持更快重定价）。
 */
export const GJJ_RATE_HISTORY: GjjHistoryRateItem[] = [
  {
    date: '2025-05-08',
    effectiveYm: { y: 2025, m: 5 },
    existingEffectiveYm: { y: 2026, m: 1 },
    firstUnder5: 2.1,
    firstOver5: 2.6,
    secondUnder5: 2.525,
    secondOver5: 3.075,
    note: '央行下调 0.25 个百分点（现行最新标准）',
  },
  {
    date: '2024-05-18',
    effectiveYm: { y: 2024, m: 5 },
    existingEffectiveYm: { y: 2025, m: 1 },
    firstUnder5: 2.35,
    firstOver5: 2.85,
    secondUnder5: 2.775,
    secondOver5: 3.325,
    note: '央行下调 0.25 个百分点（存量 2025年1月起调为 2.85%）',
  },
  {
    date: '2022-10-01',
    effectiveYm: { y: 2022, m: 10 },
    existingEffectiveYm: { y: 2023, m: 1 },
    firstUnder5: 2.6,
    firstOver5: 3.1,
    secondUnder5: 3.025,
    secondOver5: 3.575,
    note: '首套下调 0.15 个百分点，二套维持不变',
  },
  {
    date: '2015-08-26',
    effectiveYm: { y: 2015, m: 8 },
    existingEffectiveYm: { y: 2016, m: 1 },
    firstUnder5: 2.75,
    firstOver5: 3.25,
    secondUnder5: 3.025,
    secondOver5: 3.575,
    note: '2015 年第 4 次降息（维持长达 7 年的 3.25% 基准）',
  },
  {
    date: '2015-06-28',
    effectiveYm: { y: 2015, m: 6 },
    existingEffectiveYm: { y: 2016, m: 1 },
    firstUnder5: 3.0,
    firstOver5: 3.5,
    secondUnder5: 3.3,
    secondOver5: 3.85,
    note: '2015 年第 3 次降息',
  },
  {
    date: '2015-05-11',
    effectiveYm: { y: 2015, m: 5 },
    existingEffectiveYm: { y: 2016, m: 1 },
    firstUnder5: 3.25,
    firstOver5: 3.75,
    secondUnder5: 3.575,
    secondOver5: 4.125,
    note: '2015 年第 2 次降息',
  },
  {
    date: '2015-03-01',
    effectiveYm: { y: 2015, m: 3 },
    existingEffectiveYm: { y: 2016, m: 1 },
    firstUnder5: 3.5,
    firstOver5: 4.0,
    secondUnder5: 3.85,
    secondOver5: 4.4,
    note: '2015 年第 1 次降息',
  },
  {
    date: '2014-11-22',
    effectiveYm: { y: 2014, m: 11 },
    existingEffectiveYm: { y: 2015, m: 1 },
    firstUnder5: 3.75,
    firstOver5: 4.25,
    secondUnder5: 4.125,
    secondOver5: 4.675,
    note: '2014 年降息',
  },
  {
    date: '2012-07-06',
    effectiveYm: { y: 2012, m: 7 },
    existingEffectiveYm: { y: 2013, m: 1 },
    firstUnder5: 4.0,
    firstOver5: 4.5,
    secondUnder5: 4.4,
    secondOver5: 4.95,
    note: '2012 年第 2 次降息',
  },
  {
    date: '2012-06-08',
    effectiveYm: { y: 2012, m: 6 },
    existingEffectiveYm: { y: 2013, m: 1 },
    firstUnder5: 4.2,
    firstOver5: 4.7,
    secondUnder5: 4.62,
    secondOver5: 5.17,
    note: '2012 年第 1 次降息',
  },
  {
    date: '2011-07-07',
    effectiveYm: { y: 2011, m: 7 },
    existingEffectiveYm: { y: 2012, m: 1 },
    firstUnder5: 4.45,
    firstOver5: 4.9,
    secondUnder5: 4.895,
    secondOver5: 5.39,
    note: '2011 年第 3 次加息（历史高位）',
  },
];

export function createDefaultCalculatorState(): CalculatorState {
  return {
    mode: 'gjj',
    method: 'installment',
    term: 360,
    startY: 2023,
    startM: 1,
    gjj: {
      amount: 600000,
      rates: [
        { y: 2023, m: 1, rate: 3.1 },
        { y: 2025, m: 1, rate: 2.85 },
        { y: 2025, m: 6, rate: 2.6 },
      ],
    },
    com: {
      amount: 400000,
      rates: [
        { y: 2023, m: 1, rate: 4.0 },
        { y: 2025, m: 1, rate: 3.7 },
      ],
    },
    prepays: [],
  };
}

export const DEFAULT_SETTINGS: RatioPluginSettings = {
  defaultOpenLocation: 'main',
  exportIncludeFullTable: true,
  exportFolder: '',
  savedState: createDefaultCalculatorState(),
};
