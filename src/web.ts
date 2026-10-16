import {
  CalculatorState,
  createDefaultCalculatorState,
} from './types';
import { generateMarkdownReport } from './calc';
import { RatioCalculatorWidget } from './ui';

const WEB_STORAGE_KEY = 'ratio-calculator-state-v1';
const WEB_THEME_KEY = 'ratio-calculator-theme-v1';

/**
 * 在网页端显示轻量 Toast 提示（替代 Obsidian 的 Notice）
 */
export function showWebToast(message: string): void {
  if (typeof document === 'undefined') return;
  let container = document.getElementById('ratio-web-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ratio-web-toast-container';
    container.className = 'ratio-web-toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'ratio-web-toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('ratio-web-toast-hide');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 250);
  }, 2400);
}

/**
 * 复制文本到剪贴板（兼容 HTTPS / localhost 与本地 file:// 协议）
 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 回退到 textarea 复制
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 在浏览器端触发 Markdown 报告文件下载
 */
function downloadMarkdownFile(state: CalculatorState): void {
  if (typeof document === 'undefined') return;
  const md = generateMarkdownReport(state, true);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const fileName = `房贷计算报告-${stamp}.md`;

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showWebToast(`已导出 Markdown 文件：${fileName}`);
}

/**
 * 读取网页端本地缓存的计算器状态
 */
function loadWebSavedState(): Partial<CalculatorState> | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(WEB_STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as Partial<CalculatorState>;
  } catch {
    return undefined;
  }
}

/**
 * 保存网页端计算器状态到 localStorage
 */
function saveWebState(state: CalculatorState): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(WEB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 忽略隐私模式或配额限制错误
  }
}

/**
 * 初始化与切换网页端浅色/深色主题
 */
function initWebTheme(): void {
  if (typeof document === 'undefined') return;
  try {
    const saved =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(WEB_THEME_KEY)
        : null;
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;
    document.body.classList.toggle('theme-dark', isDark);
    document.body.classList.toggle('theme-light', !isDark);
  } catch {
    // ignore
  }
}

function toggleWebTheme(): void {
  if (typeof document === 'undefined') return;
  const isDark = !document.body.classList.contains('theme-dark');
  document.body.classList.toggle('theme-dark', isDark);
  document.body.classList.toggle('theme-light', !isDark);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WEB_THEME_KEY, isDark ? 'dark' : 'light');
    }
  } catch {
    // ignore
  }
  showWebToast(isDark ? '已切换为深色主题' : '已切换为浅色主题');
}

/**
 * 挂载独立网页版应用（当页面存在 #ratio-app 容器时自动运行，与 Obsidian 插件共用同一套 UI 与计算组件）
 */
export function mountRatioWebApp(
  target?: HTMLElement | null
): RatioCalculatorWidget | null {
  if (typeof document === 'undefined') return null;
  const container =
    target ||
    document.getElementById('ratio-app') ||
    (document.querySelector('[data-ratio-web-root]') as HTMLElement | null);
  if (!container) return null;

  initWebTheme();
  const initialState = loadWebSavedState() || createDefaultCalculatorState();

  const widget = new RatioCalculatorWidget(
    container,
    initialState,
    {
      exportButtonLabel: '导出 Markdown',
      exportButtonTitle: '将当前方案与还款计划下载为 Markdown (.md) 文件',
      showThemeToggle: true,
      onToggleTheme: () => {
        toggleWebTheme();
      },
      onStateChange: (state) => {
        saveWebState(state);
      },
      onCopyMarkdown: async (state) => {
        const md = generateMarkdownReport(state, true);
        const ok = await copyTextToClipboard(md);
        showWebToast(
          ok
            ? '已复制房贷计算报告 Markdown 到剪贴板'
            : '复制失败，请检查浏览器剪贴板权限'
        );
      },
      onExportNote: (state) => {
        downloadMarkdownFile(state);
      },
    },
    false
  );
  widget.mount();
  return widget;
}
