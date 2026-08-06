'use strict';

/**
 * 交叉验证运行器（jsc）：
 *   jsc tools/run_compare.js
 * 读取 tools/cases.json（输入）与 tools/expected.json（Python 参考期望），
 * 用 js/calc.js 计算并与期望逐期对比。
 */
load('js/calc.js');

var cases = JSON.parse(readFile('tools/cases.json'));
var expected = JSON.parse(readFile('tools/expected.json'));
var fails = 0;
var checked = 0;

for (var c = 0; c < cases.length; c++) {
  var inp = cases[c];
  var want = expected[c];
  var got = RatioCalc.schedule(inp).rows;

  if (got.length !== want.length) {
    print('case ' + c + ' 期数不符: got=' + got.length + ' want=' + want.length);
    fails++;
    continue;
  }
  for (var i = 0; i < want.length; i++) {
    var w = want[i], g = got[i];
    checked++;
    var fields = ['principal', 'interest', 'total', 'remainPrincipal', 'remainInterest'];
    for (var f = 0; f < fields.length; f++) {
      var key = fields[f];
      if (Math.abs(g[key] - w[key]) > 0.005) {
        print('case ' + c + ' 期 ' + (i + 1) + ' ' + key + ' 不符: js=' + g[key] + ' py=' + w[key]);
        fails++;
      }
    }
  }
}

if (fails) {
  print('CROSS-CHECK FAIL: ' + fails + ' mismatches over ' + checked + ' cells');
  quit(1);
}
print('CROSS-CHECK PASSED: ' + cases.length + ' cases, ' + checked + ' cells identical');
