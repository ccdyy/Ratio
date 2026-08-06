#!/usr/bin/env bash
# Ratio 全部测试：单元测试 + Python 交叉验证 + UI 端到端
set -euo pipefail
cd "$(dirname "$0")/.."

JSC="/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc"

echo "── 1. 计算引擎单元测试 ──"
"$JSC" tools/calc.test.js

echo "── 2. 与 Python 参考实现交叉验证（随机用例）──"
python3 tools/gen_cases.py
"$JSC" tools/run_compare.js

echo "── 3. UI 端到端测试（DOM 桩）──"
"$JSC" tools/app.test.js

echo ""
echo "✅ 全部测试通过"
