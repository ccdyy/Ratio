import {
  CalculatorState,
  createDefaultCalculatorState,
  GJJ_RATE_HISTORY,
  LoanMode,
  LoanPartKey,
  PrepayItem,
  PrepayMode,
  RateSegment,
  RepayMethod,
  ResultTabKey,
  SchedulePlan,
  ViewKey,
} from './types';
import {
  fmtMoney,
  rowsForView,
  totalAmountOf,
  ymIndex,
  ymToText,
} from './calc';

const YEAR_MIN = 1990;
const YEAR_MAX = 2100;
const MONTH_NAMES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export interface RatioWidgetCallbacks {
  onStateChange?: (state: CalculatorState) => void;
  onExportNote?: (state: CalculatorState) => void;
  onCopyMarkdown?: (state: CalculatorState) => void;
  exportButtonLabel?: string;
  exportButtonTitle?: string;
  showThemeToggle?: boolean;
  onToggleTheme?: () => void;
}

let instanceCounter = 0;

export class RatioCalculatorWidget {
  private container: HTMLElement;
  private root!: HTMLElement;
  private uid: string;
  private view: ViewKey = 'total';
  private resultTab: ResultTabKey = 'base';
  private initialState: CalculatorState;
  private callbacks: RatioWidgetCallbacks;
  private compact: boolean;
  private resizeObserver: ResizeObserver | null = null;

  // 关键 DOM 引用（容器内作用域，支持多实例共存）
  private elSettings!: HTMLElement;
  private elGjjCard!: HTMLElement;
  private elComCard!: HTMLElement;
  private elGjjAmount!: HTMLInputElement;
  private elComAmount!: HTMLInputElement;
  private elGjjRates!: HTMLElement;
  private elComRates!: HTMLElement;
  private elTermMonths!: HTMLInputElement;
  private elStartYear!: HTMLSelectElement;
  private elStartMonth!: HTMLSelectElement;
  private elPrepayList!: HTMLElement;
  private elPrepayCount!: HTMLElement;
  private elAddPrepay!: HTMLButtonElement;
  private elResultTabs!: HTMLElement;
  private elViewTabs!: HTMLElement;
  private elPaneBase!: HTMLElement;
  private elPanePrepay!: HTMLElement;
  private elSummaryBase!: HTMLElement;
  private elSummaryPrepay!: HTMLElement;
  private elTbodyBase!: HTMLElement;
  private elTbodyWith!: HTMLElement;

  constructor(
    container: HTMLElement,
    initialState?: Partial<CalculatorState>,
    callbacks: RatioWidgetCallbacks = {},
    compact = false
  ) {
    this.container = container;
    this.uid = `ratio-${++instanceCounter}`;
    this.callbacks = callbacks;
    this.compact = compact;
    const def = createDefaultCalculatorState();
    this.initialState = this.mergeState(def, initialState);
  }

  private mergeState(
    base: CalculatorState,
    patch?: Partial<CalculatorState>
  ): CalculatorState {
    if (!patch) return base;
    return {
      mode: patch.mode || base.mode,
      method: patch.method || base.method,
      term: typeof patch.term === 'number' ? patch.term : base.term,
      startY: typeof patch.startY === 'number' ? patch.startY : base.startY,
      startM: typeof patch.startM === 'number' ? patch.startM : base.startM,
      gjj: {
        amount:
          patch.gjj && typeof patch.gjj.amount === 'number'
            ? patch.gjj.amount
            : base.gjj.amount,
        rates:
          patch.gjj && Array.isArray(patch.gjj.rates) && patch.gjj.rates.length
            ? patch.gjj.rates.map((r) => ({ ...r }))
            : base.gjj.rates.map((r) => ({ ...r })),
      },
      com: {
        amount:
          patch.com && typeof patch.com.amount === 'number'
            ? patch.com.amount
            : base.com.amount,
        rates:
          patch.com && Array.isArray(patch.com.rates) && patch.com.rates.length
            ? patch.com.rates.map((r) => ({ ...r }))
            : base.com.rates.map((r) => ({ ...r })),
      },
      prepays: Array.isArray(patch.prepays)
        ? patch.prepays.map((p) => ({ ...p }))
        : base.prepays.map((p) => ({ ...p })),
    };
  }

  public mount(): void {
    this.container.innerHTML = '';
    this.root = document.createElement('div');
    this.root.className =
      'ratio-plugin-root' + (this.compact ? ' ratio-compact' : '');
    this.root.innerHTML = this.buildTemplate();
    this.container.appendChild(this.root);

    this.cacheElements();
    this.applyStateToDOM(this.initialState);
    this.bindEvents();
    this.setupResponsiveObserver();
    this.applyMode(false);
    this.refresh(false);
  }

  public destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private setupResponsiveObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const updateWidthClasses = (w: number) => {
      if (w <= 0) return;
      this.root.classList.toggle('ratio-is-narrow', w < 880);
      this.root.classList.toggle('ratio-is-xs', w < 520);
    };
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateWidthClasses(entry.contentRect.width);
      }
    });
    this.resizeObserver.observe(this.root);
    updateWidthClasses(this.root.clientWidth);
  }

  private buildTemplate(): string {
    const loanModeName = `${this.uid}-loanMode`;
    const repayMethodName = `${this.uid}-repayMethod`;
    const exportLabel = this.callbacks.exportButtonLabel || '导出到笔记';
    const exportTitle =
      this.callbacks.exportButtonTitle ||
      '将当前方案与还款计划导出为 Obsidian 笔记';
    const themeToggleHtml = this.callbacks.showThemeToggle
      ? '<button type="button" class="ratio-btn ratio-btn-ghost" data-action="toggle-theme" title="切换浅色 / 深色主题">主题</button>'
      : '';

    return `
      <!-- 顶部原生感工具栏 -->
      <header class="ratio-toolbar">
        <div class="ratio-toolbar-title">
          <span class="ratio-brand-badge">R</span>
          <div class="ratio-title-group">
            <span class="ratio-title-main">中国房贷计算器</span>
            <span class="ratio-title-sub">等额本息 / 等额本金 · 分段利率 · 混合贷 · 多次提前还款</span>
          </div>
        </div>
        <div class="ratio-toolbar-actions">
          <button type="button" class="ratio-btn" data-action="copy-md" title="复制 Markdown 报告到剪贴板">复制 Markdown</button>
          <button type="button" class="ratio-btn ratio-btn-primary" data-action="export-note" title="${exportTitle}">${exportLabel}</button>
          <button type="button" class="ratio-btn ratio-btn-ghost" data-action="reset" title="恢复默认示例参数">重置</button>
          ${themeToggleHtml}
        </div>
      </header>

      <div class="ratio-workspace">
        <!-- 左侧参数配置区 -->
        <aside class="ratio-sidebar" data-ref="settings">

          <!-- 卡片 1：基础方案 -->
          <section class="ratio-section">
            <div class="ratio-section-header">
              <span class="ratio-section-title">基础贷款设置</span>
            </div>

            <div class="ratio-form-group">
              <label class="ratio-label">贷款方式</label>
              <div class="ratio-seg-group" data-ref="loanMode">
                <label class="ratio-seg-item">
                  <input type="radio" name="${loanModeName}" value="gjj" checked>
                  <span>纯公积金</span>
                </label>
                <label class="ratio-seg-item">
                  <input type="radio" name="${loanModeName}" value="commercial">
                  <span>纯商贷</span>
                </label>
                <label class="ratio-seg-item">
                  <input type="radio" name="${loanModeName}" value="mixed">
                  <span>混合贷款</span>
                </label>
              </div>
            </div>

            <div class="ratio-form-group">
              <label class="ratio-label">还款方式</label>
              <div class="ratio-seg-group" data-ref="repayMethod">
                <label class="ratio-seg-item">
                  <input type="radio" name="${repayMethodName}" value="installment" checked>
                  <span>等额本息</span>
                </label>
                <label class="ratio-seg-item">
                  <input type="radio" name="${repayMethodName}" value="principal">
                  <span>等额本金</span>
                </label>
              </div>
            </div>

            <div class="ratio-form-row">
              <div class="ratio-form-group">
                <label class="ratio-label">贷款期限</label>
                <div class="ratio-input-affix">
                  <input type="number" data-ref="termMonths" value="360" min="1" max="1200">
                  <span class="ratio-suffix">个月</span>
                </div>
              </div>
              <div class="ratio-form-group">
                <label class="ratio-label">首次还贷年月</label>
                <div class="ratio-ym-inline">
                  <div class="ratio-select-affix">
                    <select data-ref="startYear"></select>
                    <span class="ratio-suffix">年</span>
                  </div>
                  <div class="ratio-select-affix ratio-select-month">
                    <select data-ref="startMonth"></select>
                    <span class="ratio-suffix">月</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="ratio-term-presets">
              <span class="ratio-preset-lbl">快捷期限：</span>
              <button type="button" class="ratio-chip" data-term-preset="120">10年(120期)</button>
              <button type="button" class="ratio-chip" data-term-preset="240">20年(240期)</button>
              <button type="button" class="ratio-chip" data-term-preset="300">25年(300期)</button>
              <button type="button" class="ratio-chip" data-term-preset="360">30年(360期)</button>
            </div>
          </section>

          <!-- 卡片 2：公积金贷款部分 -->
          <section class="ratio-section ratio-part-section" data-ref="gjjCard">
            <div class="ratio-section-header">
              <span class="ratio-section-title">
                <span class="ratio-dot ratio-dot-gjj"></span>公积金贷款
              </span>
              <button type="button" class="ratio-link-btn" data-action="toggle-gjj-history" title="查看央行历次公积金贷款基准利率并一键填入">
                历次利率参考 ▾
              </button>
            </div>
            <div class="ratio-form-group">
              <label class="ratio-label">贷款本金</label>
              <div class="ratio-input-affix">
                <input type="number" data-ref="gjjAmount" value="600000" min="0" step="10000">
                <span class="ratio-suffix">元</span>
              </div>
            </div>
            <div class="ratio-form-group">
              <div class="ratio-label-row">
                <label class="ratio-label">分段年利率（按生效年月自动重定价）</label>
              </div>
              <div class="ratio-rate-list" data-ref="gjjRates"></div>
              <button type="button" class="ratio-btn-dashed" data-add-rates="gjj">＋ 添加调息区间</button>

              <!-- 央行公积金历次利率参考面板 -->
              <div class="ratio-history-box" data-ref="gjjHistoryPanel" hidden>
                <div class="ratio-history-head">
                  <span class="ratio-history-title">央行历次个人住房公积金贷款基准利率（点击利率直接填入）</span>
                </div>
                <div class="ratio-history-presets">
                  <span class="ratio-preset-lbl">一键套用：</span>
                  <button type="button" class="ratio-chip" data-gjj-preset="first-over5-recent" title="自动填入 2023.01(3.1%) → 2025.01(2.85%) → 2026.01(2.6%)">首套 &gt;5年 近年调息轨迹</button>
                  <button type="button" class="ratio-chip" data-gjj-preset="first-over5-2015" title="自动填入 2015.08(3.25%) → 2023.01(3.1%) → 2025.01(2.85%) → 2026.01(2.6%)">2015~至今完整轨迹</button>
                  <button type="button" class="ratio-chip" data-gjj-preset="second-over5-recent" title="自动填入二套 >5年 3.575% → 3.325% → 3.075%">二套 &gt;5年 近年轨迹</button>
                </div>
                <div class="ratio-history-table-wrap">
                  <table class="ratio-history-table">
                    <thead>
                      <tr>
                        <th>调整日期</th>
                        <th class="num">首套 &le;5年</th>
                        <th class="num">首套 &gt;5年</th>
                        <th class="num">二套 &le;5年</th>
                        <th class="num">二套 &gt;5年</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${this.buildGjjHistoryRows()}
                    </tbody>
                  </table>
                </div>
                <p class="ratio-history-note">
                  💡 提示：点击表中任意利率胶囊，即可自动按对应调整年月追加/更新到上方分段利率列表中；存量公积金贷款通常在调整次年 1 月 1 日重定价。
                </p>
              </div>
            </div>
          </section>

          <!-- 卡片 3：商业贷款部分 -->
          <section class="ratio-section ratio-part-section" data-ref="comCard">
            <div class="ratio-section-header">
              <span class="ratio-section-title">
                <span class="ratio-dot ratio-dot-com"></span>商业贷款
              </span>
            </div>
            <div class="ratio-form-group">
              <label class="ratio-label">贷款本金</label>
              <div class="ratio-input-affix">
                <input type="number" data-ref="comAmount" value="400000" min="0" step="10000">
                <span class="ratio-suffix">元</span>
              </div>
            </div>
            <div class="ratio-form-group">
              <div class="ratio-label-row">
                <label class="ratio-label">分段年利率（按生效年月自动重定价）</label>
              </div>
              <div class="ratio-rate-list" data-ref="comRates"></div>
              <button type="button" class="ratio-btn-dashed" data-add-rates="com">＋ 添加调息区间</button>
            </div>
          </section>

          <!-- 卡片 4：提前还贷 -->
          <section class="ratio-section">
            <div class="ratio-section-header">
              <span class="ratio-section-title">提前还贷计划</span>
              <span class="ratio-badge" data-ref="prepayCount">0 笔</span>
            </div>
            <p class="ratio-hint">在对应月份常规扣款后冲抵本金，支持多笔叠加。</p>
            <div class="ratio-prepay-list" data-ref="prepayList"></div>
            <button type="button" class="ratio-btn-dashed" data-ref="addPrepay">＋ 添加一笔提前还贷</button>
          </section>
        </aside>

        <!-- 右侧结果展示区 -->
        <section class="ratio-main">
          <!-- 顶部导航栏：未提前还款 vs 提前还款 + 混合贷子视图切换 -->
          <div class="ratio-result-bar">
            <nav class="ratio-mode-tabs" data-ref="resultTabs" role="tablist" aria-label="还款计划对比">
              <button type="button" class="ratio-v-tab ratio-mode-tab active" data-result-tab="base" role="tab" aria-selected="true">
                <span class="ratio-tab-indicator ratio-ind-base"></span>
                <span>原定还款计划（未提前）</span>
              </button>
              <button type="button" class="ratio-v-tab ratio-mode-tab" data-result-tab="prepay" role="tab" aria-selected="false">
                <span class="ratio-tab-indicator ratio-ind-prepay"></span>
                <span>提前还贷后方案</span>
              </button>
            </nav>

            <div class="ratio-view-tabs" data-ref="viewTabs" hidden>
              <button type="button" class="ratio-tab active" data-view="total">合并合计</button>
              <button type="button" class="ratio-tab" data-view="gjj">仅看公积金</button>
              <button type="button" class="ratio-tab" data-view="com">仅看商贷</button>
            </div>
          </div>

          <!-- 面板 1：未提前还款 -->
          <div class="ratio-result-pane" data-ref="pane-base">
            <div class="ratio-summary-grid" data-ref="summaryBase"></div>
            <div class="ratio-table-section">
              <div class="ratio-table-header">
                <h3>每月还款明细（未提前还贷）</h3>
                <span class="ratio-table-sub">单位：元</span>
              </div>
              <div class="ratio-table-scroll">
                <table class="ratio-plan-table">
                  <thead>
                    <tr>
                      <th>期数</th>
                      <th>还款年月</th>
                      <th class="num">月还本金</th>
                      <th class="num">月还利息</th>
                      <th class="num">月供总额</th>
                      <th class="num">剩余本金</th>
                      <th class="num">剩余利息</th>
                    </tr>
                  </thead>
                  <tbody data-ref="tbodyBase"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- 面板 2：提前还款后 -->
          <div class="ratio-result-pane" data-ref="pane-prepay" hidden>
            <div class="ratio-summary-grid" data-ref="summaryPrepay"></div>
            <div class="ratio-table-section">
              <div class="ratio-table-header">
                <h3>提前还贷后的每月还款明细</h3>
                <span class="ratio-table-sub">★ 标记为发生提前还贷的月份</span>
              </div>
              <div class="ratio-table-scroll">
                <table class="ratio-plan-table">
                  <thead>
                    <tr>
                      <th>期数</th>
                      <th>还款年月</th>
                      <th class="num">月还本金(含提前)</th>
                      <th class="num">月还利息</th>
                      <th class="num">当月总额</th>
                      <th class="num">剩余本金</th>
                      <th class="num">剩余利息</th>
                    </tr>
                  </thead>
                  <tbody data-ref="tbodyWith"></tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  private buildGjjHistoryRows(): string {
    return GJJ_RATE_HISTORY.map((item) => {
      const { y, m } = item.effectiveYm;
      const cell = (rate: number, label: string) =>
        `<td class="num"><button type="button" class="ratio-hist-rate-btn" data-hist-y="${y}" data-hist-m="${m}" data-hist-rate="${rate}" title="点击将 ${y}年${m}月 ${label} ${rate}% 添加到公积金分段利率">${rate}%</button></td>`;
      return (
        `<tr title="${item.note}">` +
        `<td class="col-date"><span class="hist-date">${item.date}</span><span class="hist-note">${item.note}</span></td>` +
        cell(item.firstUnder5, '首套≤5年') +
        cell(item.firstOver5, '首套>5年') +
        cell(item.secondUnder5, '二套≤5年') +
        cell(item.secondOver5, '二套>5年') +
        `</tr>`
      );
    }).join('');
  }

  private applyGjjHistoryPreset(presetKey: string): void {
    let rates: RateSegment[] | null = null;
    if (presetKey === 'first-over5-recent') {
      rates = [
        { y: 2023, m: 1, rate: 3.1 },
        { y: 2025, m: 1, rate: 2.85 },
        { y: 2026, m: 1, rate: 2.6 },
      ];
    } else if (presetKey === 'first-over5-2015') {
      rates = [
        { y: 2015, m: 9, rate: 3.25 },
        { y: 2023, m: 1, rate: 3.1 },
        { y: 2025, m: 1, rate: 2.85 },
        { y: 2026, m: 1, rate: 2.6 },
      ];
    } else if (presetKey === 'second-over5-recent') {
      rates = [
        { y: 2023, m: 1, rate: 3.575 },
        { y: 2025, m: 1, rate: 3.325 },
        { y: 2026, m: 1, rate: 3.075 },
      ];
    }
    if (rates) {
      this.renderRates('gjj', rates);
      this.refresh(true);
    }
  }

  private insertOrUpdateGjjHistoryRate(y: number, m: number, rate: number): void {
    const rows = this.elGjjRates.querySelectorAll('.rate-row');
    // 若已存在同一年月的行，直接更新其利率；否则新增一行并按时间排序
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ry = parseInt((r.querySelector('.ry') as HTMLSelectElement).value, 10);
      const rm = parseInt((r.querySelector('.rm') as HTMLSelectElement).value, 10);
      if (ry === y && rm === m) {
        (r.querySelector('.rr') as HTMLInputElement).value = String(rate);
        this.refresh(true);
        return;
      }
    }
    const current = this.readInputs().gjj.rates;
    current.push({ y, m, rate });
    current.sort((a, b) => ymIndex(a.y, a.m) - ymIndex(b.y, b.m));
    this.renderRates('gjj', current);
    this.refresh(true);
  }

  private q<T extends HTMLElement>(ref: string): T {
    return this.root.querySelector(`[data-ref="${ref}"]`) as T;
  }

  private cacheElements(): void {
    this.elSettings = this.q('settings');
    this.elGjjCard = this.q('gjjCard');
    this.elComCard = this.q('comCard');
    this.elGjjAmount = this.q('gjjAmount');
    this.elComAmount = this.q('comAmount');
    this.elGjjRates = this.q('gjjRates');
    this.elComRates = this.q('comRates');
    this.elTermMonths = this.q('termMonths');
    this.elStartYear = this.q('startYear');
    this.elStartMonth = this.q('startMonth');
    this.elPrepayList = this.q('prepayList');
    this.elPrepayCount = this.q('prepayCount');
    this.elAddPrepay = this.q('addPrepay');
    this.elResultTabs = this.q('resultTabs');
    this.elViewTabs = this.q('viewTabs');
    this.elPaneBase = this.q('pane-base');
    this.elPanePrepay = this.q('pane-prepay');
    this.elSummaryBase = this.q('summaryBase');
    this.elSummaryPrepay = this.q('summaryPrepay');
    this.elTbodyBase = this.q('tbodyBase');
    this.elTbodyWith = this.q('tbodyWith');
  }

  private fillSelect(
    sel: HTMLSelectElement,
    min: number,
    max: number,
    selected: number,
    names?: string[]
  ): void {
    sel.innerHTML = '';
    for (let v = min; v <= max; v++) {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = names ? names[v - min] : String(v);
      sel.appendChild(o);
    }
    sel.value = String(selected);
  }

  private createRateRow(y: number, m: number, rate: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ratio-rate-row rate-row';
    row.innerHTML =
      '<div class="ratio-rate-ym">' +
      '<div class="ratio-select-affix"><select class="ry"></select><span class="ratio-suffix">年</span></div>' +
      '<div class="ratio-select-affix ratio-select-month"><select class="rm"></select><span class="ratio-suffix">月</span></div>' +
      '</div>' +
      '<div class="ratio-input-affix ratio-rate-val">' +
      '<input class="rr rate-input" type="number" step="0.01" min="0" max="30" placeholder="利率">' +
      '<span class="ratio-suffix">%</span>' +
      '</div>' +
      '<button type="button" class="btn-del" title="删除该区间">✕</button>';
    this.fillSelect(
      row.querySelector('.ry') as HTMLSelectElement,
      YEAR_MIN,
      YEAR_MAX,
      y
    );
    this.fillSelect(
      row.querySelector('.rm') as HTMLSelectElement,
      1,
      12,
      m,
      MONTH_NAMES
    );
    (row.querySelector('.rr') as HTMLInputElement).value = String(rate);
    return row;
  }

  private renderRates(part: LoanPartKey, initial: RateSegment[]): void {
    const list = part === 'gjj' ? this.elGjjRates : this.elComRates;
    list.innerHTML = '';
    initial.forEach((seg) => {
      list.appendChild(this.createRateRow(seg.y, seg.m, seg.rate));
    });
  }

  private createPrepayRow(item: PrepayItem, isMixed: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ratio-prepay-card prepay-row';
    row.innerHTML =
      '<div class="ratio-prepay-top">' +
      '<div class="ratio-prepay-ym">' +
      '<div class="ratio-select-affix"><select class="py"></select><span class="ratio-suffix">年</span></div>' +
      '<div class="ratio-select-affix ratio-select-month"><select class="pm"></select><span class="ratio-suffix">月</span></div>' +
      '</div>' +
      '<div class="ratio-input-affix ratio-prepay-amt">' +
      '<input class="pa prepay-amount" type="number" min="0" step="10000" placeholder="提前还款额">' +
      '<span class="ratio-suffix">元</span>' +
      '</div>' +
      '<button type="button" class="btn-del" title="删除该笔提前还贷">✕</button>' +
      '</div>' +
      '<div class="ratio-prepay-bottom">' +
      '<select class="pmode">' +
      '<option value="reduce">减少月供（期限不变）</option>' +
      '<option value="shorten">缩短期限（月供不变）</option>' +
      '</select>' +
      '<select class="ppart">' +
      '<option value="gjj">还公积金</option>' +
      '<option value="com">还商业贷</option>' +
      '</select>' +
      '</div>';
    this.fillSelect(
      row.querySelector('.py') as HTMLSelectElement,
      YEAR_MIN,
      YEAR_MAX,
      item.y
    );
    this.fillSelect(
      row.querySelector('.pm') as HTMLSelectElement,
      1,
      12,
      item.m,
      MONTH_NAMES
    );
    (row.querySelector('.pa') as HTMLInputElement).value = String(item.amount);
    (row.querySelector('.pmode') as HTMLSelectElement).value = item.mode;
    const ppart = row.querySelector('.ppart') as HTMLSelectElement;
    ppart.value = item.part || 'gjj';
    ppart.hidden = !isMixed;
    return row;
  }

  private applyStateToDOM(st: CalculatorState): void {
    // 填充开始年月
    this.fillSelect(this.elStartYear, YEAR_MIN, YEAR_MAX, st.startY);
    this.fillSelect(this.elStartMonth, 1, 12, st.startM, MONTH_NAMES);

    // 贷款方式与还款方式单选框
    const modeRadio = this.elSettings.querySelector(
      `input[value="${st.mode}"][name="${this.uid}-loanMode"]`
    ) as HTMLInputElement | null;
    if (modeRadio) modeRadio.checked = true;

    const methodRadio = this.elSettings.querySelector(
      `input[value="${st.method}"][name="${this.uid}-repayMethod"]`
    ) as HTMLInputElement | null;
    if (methodRadio) methodRadio.checked = true;

    this.elTermMonths.value = String(st.term);
    this.elGjjAmount.value = String(st.gjj.amount);
    this.elComAmount.value = String(st.com.amount);

    this.renderRates('gjj', st.gjj.rates);
    this.renderRates('com', st.com.rates);

    this.elPrepayList.innerHTML = '';
    const isMixed = st.mode === 'mixed';
    st.prepays.forEach((p) => {
      this.elPrepayList.appendChild(this.createPrepayRow(p, isMixed));
    });
  }

  private switchResultTab(tab: ResultTabKey): void {
    this.resultTab = tab;
    this.elPaneBase.hidden = tab !== 'base';
    this.elPanePrepay.hidden = tab !== 'prepay';
    const tabs = this.elResultTabs.querySelectorAll('.ratio-v-tab');
    for (let i = 0; i < tabs.length; i++) {
      const isCurrent = tabs[i].getAttribute('data-result-tab') === tab;
      tabs[i].classList.toggle('active', isCurrent);
      tabs[i].setAttribute('aria-selected', isCurrent ? 'true' : 'false');
    }
  }

  private addPrepayRow(): void {
    const sy = parseInt(this.elStartYear.value, 10) || 2024;
    const sm = parseInt(this.elStartMonth.value, 10) || 1;
    // 默认提前还贷日期：开始还贷 12 个月后（不超过年份上限）
    let idx = ymIndex(sy, sm) + 12;
    const maxIdx = ymIndex(YEAR_MAX, 12);
    if (idx > maxIdx) idx = maxIdx;
    const mode = this.getSelectedLoanMode();
    const row = this.createPrepayRow(
      {
        y: Math.floor(idx / 12),
        m: (idx % 12) + 1,
        amount: 100000,
        mode: 'reduce',
        part: mode === 'commercial' ? 'com' : 'gjj',
      },
      mode === 'mixed'
    );
    this.elPrepayList.appendChild(row);
    // 添加提前还贷时自动切换到「提前还贷后方案」面板，方便用户立即看到效果
    this.switchResultTab('prepay');
  }

  private addRateRow(part: LoanPartKey): void {
    const container = part === 'gjj' ? this.elGjjRates : this.elComRates;
    const rows = container.querySelectorAll('.rate-row');
    const last = rows[rows.length - 1] as HTMLElement | undefined;
    let y: number;
    let m: number;
    let rate: number;
    if (last) {
      y = parseInt((last.querySelector('.ry') as HTMLSelectElement).value, 10);
      m = parseInt((last.querySelector('.rm') as HTMLSelectElement).value, 10);
      rate =
        parseFloat((last.querySelector('.rr') as HTMLInputElement).value) || 0;
      let idx = ymIndex(y, m) + 12; // 默认一年后调整
      const maxIdx = ymIndex(YEAR_MAX, 12);
      if (idx > maxIdx) idx = maxIdx;
      y = Math.floor(idx / 12);
      m = (idx % 12) + 1;
    } else {
      y = parseInt(this.elStartYear.value, 10);
      m = parseInt(this.elStartMonth.value, 10);
      rate = 3.0;
    }
    container.appendChild(this.createRateRow(y, m, rate));
  }

  private getSelectedLoanMode(): LoanMode {
    const checked = this.elSettings.querySelector(
      `input[name="${this.uid}-loanMode"]:checked`
    ) as HTMLInputElement | null;
    return (checked ? checked.value : 'gjj') as LoanMode;
  }

  private getSelectedRepayMethod(): RepayMethod {
    const checked = this.elSettings.querySelector(
      `input[name="${this.uid}-repayMethod"]:checked`
    ) as HTMLInputElement | null;
    return (checked ? checked.value : 'installment') as RepayMethod;
  }

  public readInputs(): CalculatorState {
    const mode = this.getSelectedLoanMode();
    const method = this.getSelectedRepayMethod();
    let term = parseInt(this.elTermMonths.value, 10);
    if (!term || term < 1) term = 0;
    if (term > 1200) term = 1200; // 防超大值卡顿/溢出

    const startY = parseInt(this.elStartYear.value, 10) || 2023;
    const startM = parseInt(this.elStartMonth.value, 10) || 1;

    const readPart = (key: LoanPartKey) => {
      const amountEl = key === 'gjj' ? this.elGjjAmount : this.elComAmount;
      const ratesEl = key === 'gjj' ? this.elGjjRates : this.elComRates;
      let amount = parseFloat(amountEl.value);
      if (!amount || amount < 0) amount = 0;
      if (amount > 1e10) amount = 1e10; // 金额上限（100 亿）
      const rates: RateSegment[] = [];
      const rows = ratesEl.querySelectorAll('.rate-row');
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        let rate =
          parseFloat((r.querySelector('.rr') as HTMLInputElement).value) || 0;
        if (rate < 0) rate = 0;
        if (rate > 30) rate = 30; // 利率上限
        rates.push({
          y: parseInt((r.querySelector('.ry') as HTMLSelectElement).value, 10),
          m: parseInt((r.querySelector('.rm') as HTMLSelectElement).value, 10),
          rate,
        });
      }
      return { amount, rates };
    };

    const prepays: PrepayItem[] = [];
    const pRows = this.elPrepayList.querySelectorAll('.prepay-row');
    for (let j = 0; j < pRows.length; j++) {
      const pr = pRows[j];
      const pa = parseFloat(
        (pr.querySelector('.pa') as HTMLInputElement).value
      );
      if (!pa || pa <= 0) continue;
      const ppartEl = pr.querySelector('.ppart') as HTMLSelectElement;
      const part: LoanPartKey = ppartEl.hidden
        ? mode === 'commercial'
          ? 'com'
          : 'gjj'
        : (ppartEl.value as LoanPartKey);
      prepays.push({
        y: parseInt((pr.querySelector('.py') as HTMLSelectElement).value, 10),
        m: parseInt((pr.querySelector('.pm') as HTMLSelectElement).value, 10),
        amount: pa,
        mode: (pr.querySelector('.pmode') as HTMLSelectElement)
          .value as PrepayMode,
        part,
      });
    }

    return {
      mode,
      method,
      term,
      startY,
      startM,
      gjj: readPart('gjj'),
      com: readPart('com'),
      prepays,
    };
  }

  private renderSummaryCards(
    el: HTMLElement,
    cards: Array<{
      k: string;
      v: string | number;
      cls: string;
      unit: string;
      sub?: string;
    }>
  ): void {
    el.innerHTML = '';
    cards.forEach((c) => {
      const d = document.createElement('div');
      d.className = 'ratio-sum-item sum-item ' + c.cls;
      d.innerHTML =
        `<div class="k">${c.k}</div>` +
        `<div class="v">${c.v}${c.unit ? `<small>${c.unit}</small>` : ''}</div>` +
        (c.sub ? `<div class="s">${c.sub}</div>` : '');
      el.appendChild(d);
    });
  }

  private renderSummaryBase(
    inp: CalculatorState,
    basePlan: SchedulePlan | null
  ): void {
    const firstMonthTotal =
      basePlan && basePlan.rows.length ? fmtMoney(basePlan.rows[0].total) : '—';
    const yearsStr = (inp.term / 12).toFixed(1).replace(/\.0$/, '');
    const cards = [
      {
        k: '总贷款金额',
        v: fmtMoney(totalAmountOf(inp)),
        cls: '',
        unit: '元',
        sub: `首期月供 ${firstMonthTotal} 元`,
      },
      {
        k: '未提前还贷 · 总还款额',
        v: fmtMoney(basePlan ? basePlan.total : 0),
        cls: '',
        unit: '元',
        sub: '本金 + 全部利息',
      },
      {
        k: '未提前还贷 · 总利息',
        v: fmtMoney(basePlan ? basePlan.totalInterest : 0),
        cls: 'warn',
        unit: '元',
        sub:
          totalAmountOf(inp) > 0 && basePlan
            ? `利息占本金 ${((basePlan.totalInterest / totalAmountOf(inp)) * 100).toFixed(1)}%`
            : '',
      },
      {
        k: '贷款期限',
        v: inp.term + ' 期',
        cls: 'accent',
        unit: '',
        sub: `约 ${yearsStr} 年`,
      },
    ];
    this.renderSummaryCards(this.elSummaryBase, cards);
  }

  private renderSummaryPrepay(
    inp: CalculatorState,
    basePlan: SchedulePlan | null,
    withPlan: SchedulePlan | null,
    hasPrepay: boolean
  ): void {
    const totalPrepaid = inp.prepays.reduce((acc, p) => acc + p.amount, 0);
    const cards: Array<{
      k: string;
      v: string | number;
      cls: string;
      unit: string;
      sub?: string;
    }> = [
      {
        k: '总贷款金额',
        v: fmtMoney(totalAmountOf(inp)),
        cls: '',
        unit: '元',
        sub: hasPrepay ? `累计提前还 ${fmtMoney(totalPrepaid)} 元` : '尚未添加提前还款',
      },
    ];
    if (hasPrepay && withPlan && basePlan) {
      const savedInterest = Math.max(
        0,
        basePlan.totalInterest - withPlan.totalInterest
      );
      const savedTerms = Math.max(0, inp.term - withPlan.usedTerms);
      cards.push({
        k: '提前还贷后 · 总还款额',
        v: fmtMoney(withPlan.total),
        cls: 'green',
        unit: '元',
        sub: `原计划 ${fmtMoney(basePlan.total)} 元`,
      });
      cards.push({
        k: '提前还贷后 · 总利息',
        v: fmtMoney(withPlan.totalInterest),
        cls: 'green',
        unit: '元',
        sub: `原利息 ${fmtMoney(basePlan.totalInterest)} 元`,
      });
      cards.push({
        k: '提前还贷后 · 实际期数',
        v: withPlan.usedTerms,
        cls: 'accent',
        unit: '期',
        sub: savedTerms > 0 ? `缩短 ${savedTerms} 期` : '期限保持不变',
      });
      cards.push({
        k: '节省利息',
        v: fmtMoney(savedInterest),
        cls: 'red',
        unit: '元',
        sub:
          basePlan.totalInterest > 0
            ? `立省 ${((savedInterest / basePlan.totalInterest) * 100).toFixed(1)}% 利息`
            : '',
      });
    } else {
      cards.push({ k: '提前还贷后 · 总还款额', v: '—', cls: '', unit: '' });
      cards.push({ k: '提前还贷后 · 总利息', v: '—', cls: '', unit: '' });
      cards.push({ k: '提前还贷后 · 实际期数', v: '—', cls: '', unit: '' });
      cards.push({ k: '节省利息', v: '—', cls: '', unit: '' });
    }
    this.renderSummaryCards(this.elSummaryPrepay, cards);
  }

  private renderTable(
    tbody: HTMLElement,
    plan: SchedulePlan | null,
    prepayMonths: Record<string, boolean> | null,
    emptyText?: string
  ): void {
    tbody.innerHTML = '';
    if (!plan || !plan.rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td colspan="7" class="empty-tip">` +
        (emptyText || '暂无数据 — 请检查左侧设置（贷款金额、期限等）') +
        `</td>`;
      tbody.appendChild(tr);
      return;
    }
    const frag = document.createDocumentFragment();
    plan.rows.forEach((r) => {
      const tr = document.createElement('tr');
      const ym = ymToText(r.y, r.m);
      if (prepayMonths && prepayMonths[ym]) {
        tr.className = 'hl-row';
        tr.innerHTML =
          `<td class="col-idx">${r.i}<span class="prepay-flag" title="该月发生提前还贷"> ★</span></td>` +
          `<td class="col-ym">${ym}</td>` +
          `<td class="num principal-col">${fmtMoney(r.principal)}</td>` +
          `<td class="num interest-col">${fmtMoney(r.interest)}</td>` +
          `<td class="num total-col">${fmtMoney(r.total)}</td>` +
          `<td class="num remain">${fmtMoney(r.remainPrincipal)}</td>` +
          `<td class="num remain">${fmtMoney(r.remainInterest)}</td>`;
      } else {
        tr.innerHTML =
          `<td class="col-idx">${r.i}</td>` +
          `<td class="col-ym">${ym}</td>` +
          `<td class="num principal-col">${fmtMoney(r.principal)}</td>` +
          `<td class="num interest-col">${fmtMoney(r.interest)}</td>` +
          `<td class="num total-col">${fmtMoney(r.total)}</td>` +
          `<td class="num remain">${fmtMoney(r.remainPrincipal)}</td>` +
          `<td class="num remain">${fmtMoney(r.remainInterest)}</td>`;
      }
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  public refresh(emitChange = true): void {
    const inp = this.readInputs();

    // 更新提前还贷笔数角标与快捷期限高亮
    const totalPrepayRows = this.elPrepayList.querySelectorAll('.prepay-row').length;
    if (this.elPrepayCount) {
      this.elPrepayCount.textContent = `${totalPrepayRows} 笔`;
    }
    const presetBtns = this.elSettings.querySelectorAll('[data-term-preset]');
    for (let i = 0; i < presetBtns.length; i++) {
      const btn = presetBtns[i];
      btn.classList.toggle(
        'active',
        parseInt(btn.getAttribute('data-term-preset') || '0', 10) === inp.term
      );
    }

    // 汇总数据（按合计视图）
    const basePlan = rowsForView(inp, false, 'total');
    const withPlan = rowsForView(inp, true, 'total');
    const hasPrepay = inp.prepays.length > 0;

    // 提前还贷月份集合（当前视图）
    const prepayMonthsFor = (v: ViewKey): Record<string, boolean> | null => {
      const map: Record<string, boolean> = {};
      inp.prepays.forEach((p) => {
        if (v === 'total' || p.part === v) {
          map[ymToText(p.y, p.m)] = true;
        }
      });
      return Object.keys(map).length ? map : null;
    };

    // 视图有效性：非混合模式时强制 total
    const view: ViewKey = inp.mode === 'mixed' ? this.view : 'total';
    this.view = view;

    this.renderSummaryBase(inp, basePlan);
    this.renderSummaryPrepay(inp, basePlan, withPlan, hasPrepay);

    // 表格 1：未提前还贷
    this.renderTable(this.elTbodyBase, rowsForView(inp, false, view), null);

    // 表格 2：提前还贷后（无提前还贷时显示引导空态）
    this.renderTable(
      this.elTbodyWith,
      hasPrepay ? rowsForView(inp, true, view) : null,
      prepayMonthsFor(view),
      '尚未设置提前还贷 — 在左侧「提前还贷计划」中添加后，可在此查看还贷后的每月还款对比'
    );

    // 视图切换按钮
    this.elViewTabs.hidden = inp.mode !== 'mixed';
    const tabs = this.elViewTabs.querySelectorAll('.ratio-tab');
    for (let t = 0; t < tabs.length; t++) {
      tabs[t].classList.toggle(
        'active',
        tabs[t].getAttribute('data-view') === view
      );
    }

    if (emitChange && this.callbacks.onStateChange) {
      this.callbacks.onStateChange(inp);
    }
  }

  private applyMode(emitChange = true): void {
    const mode = this.getSelectedLoanMode();
    this.elGjjCard.hidden = mode === 'commercial';
    this.elComCard.hidden = mode === 'gjj';
    const pRows = this.elPrepayList.querySelectorAll('.prepay-row');
    for (let i = 0; i < pRows.length; i++) {
      const ppart = pRows[i].querySelector('.ppart') as HTMLElement | null;
      if (ppart) ppart.hidden = mode !== 'mixed';
    }
    this.refresh(emitChange);
  }

  private bindEvents(): void {
    // 贷款方式切换与所有输入变化
    this.elSettings.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement | null;
      if (target && target.name === `${this.uid}-loanMode`) {
        this.applyMode(true);
      } else {
        this.refresh(true);
      }
    });

    this.elSettings.addEventListener('input', () => {
      this.refresh(true);
    });

    // 快捷期限选择与公积金历史利率交互
    this.elSettings.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest) return;

      const chip = target.closest('[data-term-preset]') as HTMLElement | null;
      if (chip) {
        const preset = chip.getAttribute('data-term-preset');
        if (preset) {
          this.elTermMonths.value = preset;
          this.refresh(true);
        }
        return;
      }

      const gjjPresetBtn = target.closest('[data-gjj-preset]') as HTMLElement | null;
      if (gjjPresetBtn) {
        const presetKey = gjjPresetBtn.getAttribute('data-gjj-preset');
        if (presetKey) {
          this.applyGjjHistoryPreset(presetKey);
        }
        return;
      }

      const histRateBtn = target.closest('[data-hist-rate]') as HTMLElement | null;
      if (histRateBtn) {
        const y = parseInt(histRateBtn.getAttribute('data-hist-y') || '2025', 10);
        const m = parseInt(histRateBtn.getAttribute('data-hist-m') || '1', 10);
        const rate = parseFloat(histRateBtn.getAttribute('data-hist-rate') || '2.6');
        this.insertOrUpdateGjjHistoryRate(y, m, rate);
      }
    });

    // 视图切换（合计 / 公积金 / 商业）
    this.elViewTabs.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest
        ? (target.closest('.ratio-tab') as HTMLElement | null)
        : null;
      if (!btn) return;
      this.view = (btn.getAttribute('data-view') || 'total') as ViewKey;
      this.refresh(false);
    });

    // 结果 tab 切换（未提前还款 / 提前还款）
    this.elResultTabs.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest
        ? (target.closest('.ratio-v-tab') as HTMLElement | null)
        : null;
      if (!btn) return;
      const tab = (btn.getAttribute('data-result-tab') || 'base') as ResultTabKey;
      this.switchResultTab(tab);
    });

    // 删除动态行（委托）
    this.elSettings.addEventListener('click', (e) => {
      const btn = e.target as HTMLElement | null;
      if (!btn || !btn.classList || !btn.classList.contains('btn-del')) return;
      const row = btn.closest
        ? (btn.closest('.rate-row, .prepay-row') as HTMLElement | null)
        : null;
      if (!row || !row.parentNode) return;
      // 利率区间至少保留一个
      if (row.classList.contains('rate-row')) {
        const list = row.parentNode as HTMLElement;
        if (list.querySelectorAll('.rate-row').length <= 1) return;
      }
      row.parentNode.removeChild(row);
      this.refresh(true);
    });

    // 添加提前还贷按钮
    this.elAddPrepay.addEventListener('click', () => {
      this.addPrepayRow();
      this.refresh(true);
    });

    // 添加利率区间按钮
    const addBtns = this.elSettings.querySelectorAll('[data-add-rates]');
    for (let i = 0; i < addBtns.length; i++) {
      addBtns[i].addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        const part = btn.getAttribute('data-add-rates') as LoanPartKey;
        this.addRateRow(part);
        this.refresh(true);
      });
    }

    // 顶部操作栏按钮（导出到笔记 / 复制 Markdown / 重置）
    const actionBtns = this.root.querySelectorAll('[data-action]');
    for (let i = 0; i < actionBtns.length; i++) {
      actionBtns[i].addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        const action = btn.getAttribute('data-action');
        const current = this.readInputs();
        if (action === 'export-note' && this.callbacks.onExportNote) {
          this.callbacks.onExportNote(current);
        } else if (action === 'copy-md' && this.callbacks.onCopyMarkdown) {
          this.callbacks.onCopyMarkdown(current);
        } else if (action === 'toggle-theme' && this.callbacks.onToggleTheme) {
          this.callbacks.onToggleTheme();
        } else if (action === 'toggle-gjj-history') {
          const panel = this.q<HTMLElement>('gjjHistoryPanel');
          if (panel) {
            panel.hidden = !panel.hidden;
            btn.classList.toggle('active', !panel.hidden);
            btn.textContent = panel.hidden ? '历次利率参考 ▾' : '收起利率参考 ▴';
          }
        } else if (action === 'reset') {
          const def = createDefaultCalculatorState();
          this.applyStateToDOM(def);
          this.switchResultTab('base');
          this.applyMode(true);
        }
      });
    }
  }
}
