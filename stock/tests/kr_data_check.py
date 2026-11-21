"""국내 실적 DB(KR_STOCK.json) 점검: python3 tests/kr_data_check.py [종목코드…] — 종목 수·분기 수·빈 분기·튀는 값·공시일·대형주 값."""
import json, sys, statistics as st
from datetime import date

ROOT = __import__("os").path.dirname(__import__("os").path.dirname(__import__("os").path.abspath(__file__)))
db = json.load(open(f"{ROOT}/data/fund/KR_STOCK.json"))
uni = {x["k"]: x["n"] for x in json.load(open(f"{ROOT}/data/universe.json"))["items"]}
all_t = json.load(open(f"{ROOT}/data/monthly_KR_STOCK.json"))["tickers"]
nm = lambda t: f"{t} {uni.get(t, '?')}"
d8 = lambda i: date(i // 10000, i // 100 % 100, i % 100)
jo = lambda v: "—" if v is None else f"{v / 1e12:,.2f}조" if abs(v) >= 1e12 else f"{v / 1e8:,.0f}억"

T = db["t"]
have = [t for t in all_t if T.get(t, {}).get("q")]
print(f"갱신 {db.get('updated')} · 목록 {len(all_t)}종목 · 자료 있음 {len(have)} · 없음 {len(db.get('nodata', []))} · 뺌 {len(db.get('skip', {}))}")
fs = {}
for t in have:
    fs[T[t].get("fs")] = fs.get(T[t].get("fs"), 0) + 1
print("연결/별도:", fs)
print("\n[뺀 종목]")
for t, why in sorted(db.get("skip", {}).items()):
    print(" ", nm(t), "—", why)
notyet = [t for t in all_t if t not in have and t not in db.get("skip", {})]
print(f"\n[아직 자료 없음(뺀 것 제외) {len(notyet)}]", " ".join(nm(t) for t in notyet[:60]), "…" if len(notyet) > 60 else "")

# 분기 수·시작·끝·빈 분기
print("\n[분기 범위]")
ends = {}
gaps, short, late_start = [], [], []
for t in have:
    q = T[t]["q"]
    e = [r[0] for r in q]
    ends.setdefault(e[-1], []).append(t)
    want = []
    y, m = e[0] // 10000, e[0] // 100 % 100
    while y * 10000 + m * 100 <= e[-1]:
        want.append(y * 100 + m)
        m += 3
        if m > 12:
            y, m = y + 1, m - 12
    miss = sorted(set(want) - {x // 100 for x in e})
    if miss:
        gaps.append((t, miss))
    if e[0] > 20150331:
        late_start.append((t, e[0]))
    if len(q) < 20:
        short.append((t, len(q)))
nq = [len(T[t]["q"]) for t in have]
print(f"  분기 수: 최소 {min(nq)} · 중앙 {st.median(nq)} · 최대 {max(nq)}")
print("  마지막 분기:", {k: len(v) for k, v in sorted(ends.items())})
for k, v in sorted(ends.items()):
    if k != max(ends):
        print(f"    {k}에서 끝남:", " ".join(nm(t) for t in v))
print(f"  2015년 1분기보다 늦게 시작 {len(late_start)}:", " ".join(f"{nm(t)}({s})" for t, s in late_start[:40]))
print(f"  중간에 빈 분기 {len(gaps)}:")
for t, miss in gaps[:40]:
    print("   ", nm(t), miss)

# 값 점검
print("\n[값 점검]")
nulls = {"rev": 0, "oi": 0, "ni": 0, "eps": 0}
rows = 0
bad_filed, spikes, oi_gt_rev, eps_sign = [], [], [], []
for t in have:
    q = T[t]["q"]
    revs = [r[2] for r in q]
    for i, r in enumerate(q):
        rows += 1
        for j, k in enumerate(("rev", "oi", "ni", "eps")):
            if r[2 + j] is None:
                nulls[k] += 1
        lag = (d8(r[1]) - d8(r[0])).days
        if lag < 0 or lag > 130:
            bad_filed.append((t, r[0], r[1], lag))
        if r[2] and r[3] is not None and r[3] > r[2] * 1.001:
            oi_gt_rev.append((t, r[0], r[2], r[3]))
        if r[4] is not None and r[5] is not None and r[4] * r[5] < 0 and abs(r[4]) > 1e9:
            eps_sign.append((t, r[0], r[4], r[5]))
        nb = [v for v in revs[max(0, i - 4):i] + revs[i + 1:i + 5] if v]
        if r[2] and len(nb) >= 4:
            med = st.median(nb)
            if r[2] > med * 2.5 or r[2] < med / 2.5:
                spikes.append((t, r[0], r[2], med, r[0] % 10000 == 1231))
print(f"  분기 줄 {rows} · 빈 칸: " + ", ".join(f"{k} {v}({v / rows:.1%})" for k, v in nulls.items()))
print(f"  공시일이 분기말 전이거나 130일 넘게 뒤 {len(bad_filed)}:")
for x in bad_filed[:30]:
    print("   ", nm(x[0]), x[1], "공시", x[2], f"{x[3]}일")
print(f"  매출이 앞뒤 분기 중앙값의 2.5배 넘게 튐 {len(spikes)} (4분기 {sum(1 for s in spikes if s[4])}):")
for x in spikes[:40]:
    print("   ", nm(x[0]), x[1], jo(x[2]), "주변", jo(x[3]), "← 4분기(연간−누적)" if x[4] else "")
print(f"  영업이익 > 매출 {len(oi_gt_rev)}:")
for x in oi_gt_rev[:20]:
    print("   ", nm(x[0]), x[1], "매출", jo(x[2]), "영업이익", jo(x[3]))
print(f"  순이익과 EPS 부호가 다름 {len(eps_sign)}:")
for x in eps_sign[:20]:
    print("   ", nm(x[0]), x[1], "순이익", jo(x[2]), "EPS", x[3])

# 반기·3분기 값이 3개월이 아니라 누적으로 들어온 것 같은 해(2분기 ≈ 1분기×2, 3분기 ≈ 1분기×3)
cum = []
for t in have:
    by = {r[0]: r for r in T[t]["q"]}
    for y in range(2015, 2027):
        a, b, c = (by.get(y * 10000 + md) for md in (331, 630, 930))
        if a and b and c and a[2] and b[2] and c[2] and b[2] / a[2] > 1.7 and c[2] / a[2] > 2.5:
            cum.append((t, y, a[2], b[2], c[2]))
print(f"  누적 값이 섞인 것 같은 해 {len(cum)}:")
for x in cum[:30]:
    print("   ", nm(x[0]), x[1], "1·2·3분기 매출", jo(x[2]), jo(x[3]), jo(x[4]))

# 대형주 최근 값
print("\n[대형주 최근 8분기: 분기말 공시일 매출 영업이익 순이익 EPS]")
for t in sys.argv[1:] or ["005930", "000660", "005380", "035420", "035720", "105560", "207940", "051910", "068270", "005490"]:
    if t not in T:
        print(" ", nm(t), "— 자료 없음", db.get("skip", {}).get(t, ""))
        continue
    print(" ", nm(t), T[t].get("fs"), f"{len(T[t]['q'])}분기 {T[t]['q'][0][0]}~")
    for r in T[t]["q"][-8:]:
        print(f"     {r[0]} {r[1]}  {jo(r[2]):>10} {jo(r[3]):>10} {jo(r[4]):>10} {r[5]}")
