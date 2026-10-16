import { App, PluginSettingTab, Setting } from 'obsidian';
import type RatioPlugin from './main';
import { createDefaultCalculatorState } from './types';

export class RatioSettingTab extends PluginSettingTab {
  plugin: RatioPlugin;

  constructor(app: App, plugin: RatioPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Ratio 中国房贷计算器 — 插件设置' });

    new Setting(containerEl)
      .setName('默认打开位置')
      .setDesc('点击左侧功能区图标或执行命令时，房贷计算器面板打开的位置。')
      .addDropdown((drop) =>
        drop
          .addOption('main', '主编辑区标签页（推荐）')
          .addOption('right', '右侧边栏')
          .addOption('left', '左侧边栏')
          .setValue(this.plugin.settings.defaultOpenLocation)
          .onChange(async (value: 'main' | 'right' | 'left') => {
            this.plugin.settings.defaultOpenLocation = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('导出笔记包含完整逐期明细表')
      .setDesc(
        '开启后，「导出到笔记」与「复制 Markdown」将包含全部期数（如 360 期）的每月还款明细表；关闭则仅导出参数与汇总对比。'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.exportIncludeFullTable)
          .onChange(async (value) => {
            this.plugin.settings.exportIncludeFullTable = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('导出笔记存放目录')
      .setDesc(
        '导出房贷计算报告笔记的目标文件夹路径（留空则保存在仓库根目录，例如可填：房贷计算）。'
      )
      .addText((text) =>
        text
          .setPlaceholder('例如：房贷方案')
          .setValue(this.plugin.settings.exportFolder)
          .onChange(async (value) => {
            this.plugin.settings.exportFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('重置保存的计算参数')
      .setDesc('将当前自动保存的房贷计算器输入状态恢复为初始示例参数。')
      .addButton((btn) =>
        btn
          .setButtonText('恢复默认参数')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.savedState = createDefaultCalculatorState();
            await this.plugin.saveSettings();
          })
      );
  }
}
