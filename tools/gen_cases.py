#!/usr/bin/env python3
"""Ratio 参考实现 + 随机用例生成器（与 js/calc.js 独立交叉验证用）。

用法：python3 tools/gen_cases.py   → 生成 tools/cases.json（输入）与 tools/expected.json（期望输出）
"""
import json
import math
import os
import random

random.seed(20260806)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)))


def ym_index(y, m):
    return y * 12 + (m - 1)


def rate_at_month(idx, rates):
    r = rates[0]['rate'] if rates else 0.0
    for seg in rates:
        if ym_index(seg['y'], seg['m']) <= idx:
            r = seg['rate']
    return r


def round2(x):
    return math.floor(x * 100 + 0.5) / 100  # 正数下等价 JS Math.round


def next_segment(p, remain, cur, rates):
    seg_len = remain
    for seg in rates:
        si = ym_index(seg['y'], seg['m'])
        if si > cur:
            seg_len = min(si - cur, remain)
            break
    r = rate_at_month(cur, rates) / 100 / 12
    if r == 0:
        amount = p / remain
    else:
        amount = p * r * (1 + r) ** remain / ((1 + r) ** remain - 1)
    return amount, seg_len


def amount_series(P, n, s, rates):
    """等额本息原计划月供序列（用于 shorten 模式）"""
    out = []
    p = P
    remain = n
    cur = s
    while remain > 0:
        amount, seg_len = next_segment(p, remain, cur, rates)
        for _ in range(seg_len):
            out.append(amount)
        r = rate_at_month(cur, rates) / 100 / 12
        if r == 0:
            p -= amount * seg_len
        else:
            p = p * (1 + r) ** seg_len - amount * ((1 + r) ** seg_len - 1) / r
        remain -= seg_len
        cur += seg_len
    return out


def schedule(inp):
    amount = float(inp['amount'])
    term = int(inp['term'])
    s = ym_index(inp['startY'], inp['startM'])
    rates = sorted(inp.get('rates', []), key=lambda x: ym_index(x['y'], x['m']))
    prepays = sorted(
        ({**p, 'idx': ym_index(p['y'], p['m'])} for p in inp.get('prepays', [])),
        key=lambda x: x['idx'],
    )
    prepay_map = {}
    for p in prepays:
        prepay_map.setdefault(p['idx'], []).append(p)

    is_installment = inp['method'] == 'installment'
    p = amount
    principal_base = amount / term
    seg = None
    base_amounts = amount_series(amount, term, s, rates) if is_installment else None
    shorten_mode = False
    rows = []

    for i in range(1, term + 1):
        if p <= 0:
            break
        cur = s + i - 1
        r = rate_at_month(cur, rates) / 100 / 12
        interest = round2(p * r)
        if is_installment:
            if shorten_mode:
                principal = min(round2(base_amounts[i - 1] - interest), p)
            elif i == term:
                principal = p
            else:
                if seg is None or seg[1] <= 0:
                    seg = next_segment(p, term - i + 1, cur, rates)
                a = seg[0]
                seg = (a, seg[1] - 1)
                principal = min(round2(a - interest), p)
        else:
            principal = p if i == term else min(round2(principal_base), p)
        p = round2(p - principal)
        if p < 0:
            p = 0.0

        if cur in prepay_map:
            for pp in prepay_map[cur]:
                paid = min(pp['amount'], p)
                p = round2(p - paid)
                if p < 0:
                    p = 0.0
                principal = round2(principal + paid)
                if pp['mode'] == 'reduce' and p > 0:
                    shorten_mode = False
                    if is_installment:
                        seg = None
                    else:
                        principal_base = p / (term - i) if term - i > 0 else 0
                elif pp['mode'] == 'shorten' and p > 0:
                    shorten_mode = True

        rows.append({
            'i': i, 'y': cur // 12, 'm': cur % 12 + 1,
            'principal': principal, 'interest': interest,
            'total': round2(principal + interest),
            'remainPrincipal': p,
        })

    remain_interest = 0.0
    for k in range(len(rows) - 1, -1, -1):
        remain_interest = round2(remain_interest + rows[k]['interest'])
        rows[k]['remainInterest'] = remain_interest

    return rows


def random_rates(start_y, start_m):
    """生成 1~4 段利率，起点为 start_y/start_m，逐段递增日期"""
    n = random.randint(1, 4)
    rates = []
    y, m = start_y, start_m
    for _ in range(n):
        rates.append({'y': y, 'm': m, 'rate': round(random.uniform(2.5, 5.5), 2)})
        # 下一段在 6~36 个月后
        idx = ym_index(y, m) + random.randint(6, 36)
        y, m = idx // 12, idx % 12 + 1
    return rates


def random_case():
    start_y = random.randint(2018, 2024)
    start_m = random.randint(1, 12)
    term = random.choice([12, 24, 60, 120, 180, 240, 300, 360])
    method = random.choice(['installment', 'principal'])
    amount = random.randint(100000, 3000000)
    case = {
        'amount': amount,
        'term': term,
        'startY': start_y,
        'startM': start_m,
        'method': method,
        'rates': random_rates(start_y, start_m),
    }
    n_prepay = random.randint(0, 3)
    prepays = []
    if n_prepay:
        cur = ym_index(start_y, start_m) + random.randint(1, term - 1)
        for _ in range(n_prepay):
            prepays.append({
                'y': cur // 12, 'm': cur % 12 + 1,
                'amount': random.randint(10000, 500000),
                'mode': random.choice(['reduce', 'shorten']),
            })
            cur += random.randint(6, 60)
    if prepays:
        case['prepays'] = prepays
    return case


def main():
    cases = [random_case() for _ in range(100)]
    expected = [schedule(c) for c in cases]
    with open(os.path.join(OUT, 'cases.json'), 'w') as f:
        json.dump(cases, f, ensure_ascii=False)
    with open(os.path.join(OUT, 'expected.json'), 'w') as f:
        json.dump(expected, f, ensure_ascii=False)
    print('generated 100 cases -> tools/cases.json, tools/expected.json')


if __name__ == '__main__':
    main()
