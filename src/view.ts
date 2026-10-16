import { ItemView, WorkspaceLeaf } from 'obsidian';
import type RatioPlugin from './main';
import { RatioCalculatorWidget } from './ui';
import { CalculatorState } from './types';

export const VIEW_TYPE_RATIO = 'ratio-mortgage-calculator-view';

export class RatioCalculatorView extends ItemView {
  plugin: RatioPlugin;
  widget: RatioCalculatorWidget | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: RatioPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_RATIO;
  }

  getDisplayText(): string {
    return 'Ratio 中国房贷计算器';
  }

  getIcon(): string {
    return 'calculator';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('ratio-view-container');

    this.widget = new RatioCalculatorWidget(
      container,
      this.plugin.settings.savedState,
      {
        onStateChange: async (state: CalculatorState) => {
          this.plugin.settings.savedState = state;
          await this.plugin.saveSettings();
        },
        onExportNote: async (state: CalculatorState) => {
          await this.plugin.exportStateToNote(state);
        },
        onCopyMarkdown: async (state: CalculatorState) => {
          await this.plugin.copyStateAsMarkdown(state);
        },
      },
      false
    );
    this.widget.mount();
  }

  async onClose(): Promise<void> {
    if (this.widget) {
      this.widget.destroy();
      this.widget = null;
    }
  }
}
