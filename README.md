# Ratio 中国房贷计算器（Web 网页版 + Obsidian 插件双端同源）

一套 TypeScript 源码同时驱动 **独立网页版 (`index.html`)** 与 **Obsidian 插件 (`main.js` + `styles.css` + `manifest.json`)**。所有计算均在本地完成，支持独立网页打开、Obsidian 标签页视图、笔记内 ` ```ratio ` 代码块嵌入，以及一键复制/导出 Markdown 还款计划报告。

## 核心功能

- **基本设置**：总贷款金额（元）、总贷款时间（1～1200 个月）、开始还贷时间（精确到年月）
- **还款方式**：等额本金 / 等额本息
- **贷款方式**：纯公积金贷款 / 纯商业贷款 / 混合贷款（公积金 + 商业独立本金与分段利率）
- **分段利率（LPR / 公积金调息重定价）**：支持按年月设置多段年利率（如 2023年1月起 3.1% → 2025年1月起 2.85% → 2025年6月起 2.6%），可任意增删区间
- **多次提前还贷**：支持设置多笔提前还款，每笔可配置还款年月、金额、适用贷款部分（混合模式下可选公积金/商业）及后续处理方式：
  - **减少月供（期限不变）**
  - **缩短期限（月供不变）**
- **多维展示与对比**：
  - **未提前还款 / 提前还款** 双面板切换与汇总卡片对比（总贷款额、总还款额、总利息、实际期数、节省利息）
  - **混合贷款视图切换**：合计 / 公积金 / 商业
  - **逐期明细表**：展示每期还款本金、利息、总额、剩余本金、剩余利息，提前还贷月份自动以 `★` 高亮标记
- **Obsidian 深度集成**：
  - **左侧功能区图标（Ribbon）** 与 **命令面板**：一键呼出房贷计算器面板（可配置在主编辑区标签页或左/右侧边栏打开）
  - **状态自动持久化**：修改贷款参数后自动保存在插件数据中，下次打开无缝恢复
  - **导出到笔记 / 复制 Markdown**：一键将当前贷款方案、提前还贷对比汇总及逐期还款明细生成标准 Markdown 笔记
  - **代码块嵌入 (` ```ratio `)**：在任意笔记中使用 ` ```ratio ` 代码块即可嵌入可交互的房贷计算器

## 目录结构

```
Ratio/
├── index.html             # 编译生成的独立网页版入口（直接用浏览器打开即可使用）
├── main.js                # 编译后的双端通用脚本（同时兼容 Obsidian 插件与浏览器网页版）
├── styles.css             # 双端共用样式（自适应 Obsidian 主题变量与独立网页浅色/深色主题）
├── manifest.json          # Obsidian 插件清单
├── versions.json          # 版本兼容映射
├── package.json           # 构建与测试配置
├── tsconfig.json          # TypeScript 配置
├── esbuild.config.mjs     # esbuild 打包脚本
├── tools/
│   └── bundle.mjs         # 零依赖打包器（同时生成 main.js 与 index.html）
├── src/
│   ├── main.ts            # Obsidian 插件主类（命令、Ribbon、代码块处理器、导出笔记）
│   ├── web.ts             # 网页版宿主挂载器（localStorage 持久化、主题切换、下载 .md 报告）
│   ├── view.ts            # ItemView 独立视图封装
│   ├── ui.ts              # 双端共用交互式房贷计算器组件（容器级作用域，支持多实例）
│   ├── calc.ts            # 纯计算引擎与 Markdown 报告生成
│   ├── settings.ts        # PluginSettingTab 插件设置页
│   └── types.ts           # TypeScript 类型定义与默认状态
└── tests/
    └── run-tests.mjs      # 单元测试 + 双端兼容性验证 + 100 组随机用例交叉验证
```

## 安装与使用

### 方式一：作为网页版直接使用

构建后会生成 `index.html`，与 Obsidian 插件共用同一个 `styles.css` 和 `main.js`：

- 直接双击打开 `index.html`，或部署到任意静态服务器（如 GitHub Pages）即可使用。
- 网页版支持参数自动保存到 `localStorage`、浅色/深色主题一键切换、复制 Markdown 报告以及下载 `.md` 报告文件。

### 方式二：安装到 Obsidian 仓库

将项目根目录下的以下三个文件复制到你的 Obsidian 仓库插件目录 `<Vault>/.obsidian/plugins/ratio-mortgage-calculator/` 中：

- `manifest.json`
- `main.js`
- `styles.css`

随后在 Obsidian **设置 → 第三方插件** 中刷新并启用 **Ratio 中国房贷计算器**。

### 方式三：源码构建与测试

```bash
npm run build   # 从 src/ 同步生成 main.js 与 index.html
npm test        # 运行计算引擎测试与网页版/Obsidian 双端兼容验证
```

### 在笔记中嵌入代码块

可以在任意 Markdown 笔记中写入空的 ` ```ratio ` 代码块，或传入自定义初始 JSON 参数：

````markdown
```ratio
{
  "mode": "mixed",
  "method": "installment",
  "term": 360,
  "startY": 2023,
  "startM": 1,
  "gjj": {
    "amount": 600000,
    "rates": [
      { "y": 2023, "m": 1, "rate": 3.1 },
      { "y": 2025, "m": 1, "rate": 2.85 }
    ]
  },
  "com": {
    "amount": 400000,
    "rates": [
      { "y": 2023, "m": 1, "rate": 4.0 }
    ]
  },
  "prepays": [
    { "y": 2025, "m": 6, "amount": 100000, "mode": "shorten", "part": "com" }
  ]
}
```
````
