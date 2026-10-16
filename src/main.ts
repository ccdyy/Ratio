import {
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  WorkspaceLeaf,
  normalizePath,
} from 'obsidian';
import {
  CalculatorState,
  DEFAULT_SETTINGS,
  RatioPluginSettings,
  createDefaultCalculatorState,
} from './types';
import { generateMarkdownReport, RatioCalc } from './calc';
import { RatioCalculatorView, VIEW_TYPE_RATIO } from './view';
import { RatioSettingTab } from './settings';
import { RatioCalculatorWidget } from './ui';
import { mountRatioWebApp } from './web';

export {
  RatioCalc,
  RatioCalculatorWidget,
  RatioCalculatorView,
  VIEW_TYPE_RATIO,
  mountRatioWebApp,
};

export default class RatioPlugin extends Plugin {
  settings!: RatioPluginSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // 注册自定义房贷计算器视图
    this.registerView(
      VIEW_TYPE_RATIO,
      (leaf) => new RatioCalculatorView(leaf, this)
    );

    // 左侧 Ribbon 图标
    this.addRibbonIcon('calculator', '打开 Ratio 中国房贷计算器', () => {
      this.activateView();
    });

    // 命令 1：打开房贷计算器面板
    this.addCommand({
      id: 'open-ratio-calculator',
      name: '打开中国房贷计算器面板',
      callback: () => {
        this.activateView();
      },
    });

    // 命令 2：将当前房贷计算结果导出为新笔记
    this.addCommand({
      id: 'export-ratio-report-note',
      name: '将当前房贷方案导出为 Markdown 笔记',
      callback: async () => {
        await this.exportStateToNote(this.settings.savedState);
      },
    });

    // 命令 3：在当前光标处插入嵌入式房贷计算器代码块
    this.addCommand({
      id: 'insert-ratio-codeblock',
      name: '插入交互式房贷计算器代码块 (```ratio)',
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        const stateJson = JSON.stringify(this.settings.savedState, null, 2);
        editor.replaceSelection(`\`\`\`ratio\n${stateJson}\n\`\`\`\n`);
      },
    });

    // 注册 ```ratio 代码块处理器，支持在笔记内直接嵌入交互式房贷计算器
    this.registerMarkdownCodeBlockProcessor('ratio', (source, el) => {
      let initial: Partial<CalculatorState> | undefined;
      const trimmed = source.trim();
      if (trimmed) {
        try {
          initial = JSON.parse(trimmed);
        } catch {
          // 若非 JSON，回退使用默认配置
          initial = undefined;
        }
      } else {
        initial = this.settings.savedState;
      }

      const host = el.createDiv({ cls: 'ratio-codeblock-host' });
      const widget = new RatioCalculatorWidget(
        host,
        initial,
        {
          onExportNote: async (state) => {
            await this.exportStateToNote(state);
          },
          onCopyMarkdown: async (state) => {
            await this.copyStateAsMarkdown(state);
          },
        },
        true
      );
      widget.mount();
    });

    // 注册插件设置页
    this.addSettingTab(new RatioSettingTab(this.app, this));
  }

  onunload(): void {
    // 卸载时无需强制关闭用户已打开的叶节点（遵循 Obsidian 官方插件规范）
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_RATIO);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      const loc = this.settings.defaultOpenLocation;
      if (loc === 'right') {
        leaf = workspace.getRightLeaf(false);
      } else if (loc === 'left') {
        leaf = workspace.getLeftLeaf(false);
      } else {
        leaf = workspace.getLeaf('tab');
      }
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_RATIO, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async copyStateAsMarkdown(state: CalculatorState): Promise<void> {
    const md = generateMarkdownReport(
      state,
      this.settings.exportIncludeFullTable
    );
    try {
      await navigator.clipboard.writeText(md);
      new Notice('已复制房贷计算报告 Markdown 到剪贴板');
    } catch {
      new Notice('复制失败，请检查剪贴板权限');
    }
  }

  async exportStateToNote(state: CalculatorState): Promise<void> {
    const md = generateMarkdownReport(
      state,
      this.settings.exportIncludeFullTable
    );
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
      now.getDate()
    )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `房贷计算报告-${stamp}.md`;

    const folder = this.settings.exportFolder.trim();
    let fullPath = fileName;
    if (folder) {
      const normFolder = normalizePath(folder);
      const existing = this.app.vault.getAbstractFileByPath(normFolder);
      if (!existing) {
        await this.app.vault.createFolder(normFolder);
      }
      fullPath = normalizePath(`${normFolder}/${fileName}`);
    }

    const file = await this.app.vault.create(fullPath, md);
    new Notice(`已导出房贷报告：${file.path}`);
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file);
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    if (!this.settings.savedState) {
      this.settings.savedState = createDefaultCalculatorState();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
