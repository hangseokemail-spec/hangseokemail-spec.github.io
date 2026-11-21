#!/usr/bin/env python3
"""Seok's Stock 실적(펀더멘털) DB: 분기 매출·영업이익·순이익·EPS와 '공시일'을 모은다.

미국: SEC EDGAR XBRL companyfacts(무료·공식, 2009년 무렵부터). 같은 분기 값이 여러 번 나오면
      '처음 공시된 값과 그 공시일'을 쓴다 → 백테스트에서 그때 알 수 없던 값을 쓰지 않게.
      4분기는 10-K 연간 값에서 1~3분기를 빼서 만들고, 공시일은 10-K 날짜.
한국: OpenDART(금감원 전자공시) API. 환경변수 DART_API_KEY가 있을 때만(아직 준비 중).

저장: stock/data/fund/US_STOCK.json
  {"updated", "src", "fields": ["end","filed","rev","oi","ni","eps"],
   "t": {티커: {"cik", "at": 마지막으로 받은 날, "q": [[분기말 yyyymmdd, 공시일 yyyymmdd, 매출, 영업이익, 순이익, 희석 EPS], ...]}}}
증분: 기본은 '새 분기가 나올 때가 된 종목'(마지막 분기말이 75일 넘게 지났고 3일 안에 받지 않은 종목)만 다시 받아
      없던 분기만 붙인다. 이미 있는 분기 값은 바꾸지 않는다(처음 공시 값 유지). --full이면 모두 다시 받음.

SEC는 User-Agent에 연락처를 요구한다: 환경변수 SEC_UA(예: "이름 연락처")를 쓰고, 없으면 일반 이름을 쓴다.
"""
import argparse, datetime as dt, json, os, sys, time, urllib.request, urllib.error, gzip

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FUND = os.path.join(DATA, "fund")
UA = os.environ.get("SEC_UA") or "SeoksStock-research/1.0"  # SEC가 거절하지 않는 형식(공백·괄호 있는 이름은 403이 난 적 있음)

REV_TAGS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet",
            "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet", "RevenuesNetOfInterestExpense"]
OI_TAGS = ["OperatingIncomeLoss"]
NI_TAGS = ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"]
EPS_TAGS = ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"]
FORMS = {"10-Q", "10-K", "10-Q/A", "10-K/A", "10-KT", "10-QT"}
# 지주회사 전환·합병으로 CIK가 바뀐 종목: 예전 회사의 분기 기록도 이어 붙인다(새 CIK 먼저, 겹치면 먼저 공시된 값)
PRED = {"XOM": [34088], "GOOGL": [1288776], "DIS": [1001039], "BLK": [1364742], "ETN": [31277], "LIN": [884905],
        "MDT": [64670], "MRVL": [1058057], "AVGO": [1649338, 1441634]}


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=40) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    b = gzip.decompress(b)
                return json.loads(b)
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                if e.code == 403:
                    print(f"  거절됨(403): {url} — SEC_UA를 바꿔 보세요", file=sys.stderr)
                return None
            time.sleep(1.5 * (i + 1))
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


def d2i(s):  # '2024-03-30' -> 20240330
    return int(s.replace("-", ""))


def days(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


def lookup_cik(ticker):
    """EDGAR 검색 색인에서 티커로 CIK 찾기(정확히 같은 티커만)."""
    for q in [ticker, ticker.replace("-", "."), ticker.replace("-", "")]:
        j = get(f"https://efts.sec.gov/LATEST/search-index?keysTyped={q}")
        for h in (j or {}).get("hits", {}).get("hits", []):
            tks = [x.strip().upper() for x in str(h["_source"].get("tickers", "")).split(",")]
            if q.upper() in tks or ticker.upper() in tks:
                return int(h["_id"])
        time.sleep(0.2)
    return None


def tag_series(arr):
    """한 태그의 분기 값(처음 공시 값). 4분기는 같은 태그의 연간 − 1~3분기."""
    q, a, allq = {}, {}, {}
    for x in arr:
        if x.get("form") not in FORMS or "start" not in x or x.get("val") is None:
            continue
        n = days(x["start"], x["end"])
        box = q if 75 <= n <= 105 else a if 340 <= n <= 390 else None
        if box is None:
            continue
        k = x["end"]
        if box is q:
            allq.setdefault(k, []).append(x)
        if k not in box or x["filed"] < box[k]["filed"]:
            box[k] = x
    q4 = {}
    for end, y in a.items():
        if any(abs(days(e, end)) <= 7 for e in q):
            continue
        ins = sorted((x for e, x in q.items() if days(y["start"], x["start"]) >= -7 and days(e, end) >= 20), key=lambda x: x["end"])
        if len(ins) != 3:
            continue
        # 연간 값과 같은 기준(분사·재작성 반영)이 되게, 연간 공시일까지 나온 것 중 가장 최근 분기 값을 뺀다
        base = [max((z for z in allq[x["end"]] if z["filed"] <= y["filed"]), key=lambda z: z["filed"], default=x) for x in ins]
        q4[end] = {"end": end, "val": y["val"] - sum(x["val"] for x in base), "filed": max(y["filed"], *(x["filed"] for x in ins))}
    q.update(q4)
    return {e: (x["val"], x["filed"]) for e, x in q.items()}


def series(facts, tags, unit, pick="first"):
    """여러 태그 합치기. pick='first'는 우선순위가 높은 태그, 'max'는 가장 큰 값(매출: 전체 매출이 부분 매출보다 큼)."""
    g = facts.get("facts", {}).get("us-gaap", {})
    out = {}
    for tag in tags:
        arr = g.get(tag, {}).get("units", {}).get(unit)
        if not arr:
            continue
        for e, v in tag_series(arr).items():
            if e not in out or (pick == "max" and v[0] > out[e][0]):
                out[e] = v
    if pick == "max":  # 매출이 0 이하로 나오면(잘못 만들어진 4분기 등) 버림
        out = {e: v for e, v in out.items() if v[0] > 0}
    return out


def parse(facts):
    cols = [series(facts, REV_TAGS, "USD", "max"), series(facts, OI_TAGS, "USD"), series(facts, NI_TAGS, "USD"), series(facts, EPS_TAGS, "USD/shares")]
    ends = sorted(set().union(*[c.keys() for c in cols]))
    rows = []
    for e in ends:
        vals = [c.get(e) for c in cols]
        filed = max(v[1] for v in vals if v)
        def num(v, f=False):
            if not v:
                return None
            return round(v[0], 4) if f else int(round(v[0]))
        rows.append([d2i(e), d2i(filed), num(vals[0]), num(vals[1]), num(vals[2]), num(vals[3], True)])
    return [r for r in rows if r[0] >= 20070101]


def merge_first(a, b):
    """두 회사(CIK) 기록 합치기: 같은 분기면 먼저 공시된 쪽, 빈 칸은 다른 쪽으로 채움."""
    by = {r[0]: r[:] for r in a}
    for r in b:
        o = by.get(r[0])
        if o is None:
            by[r[0]] = r[:]
            continue
        first, other = (o, r) if o[1] <= r[1] else (r[:], o)
        for i in range(2, 6):
            if first[i] is None:
                first[i] = other[i]
        by[r[0]] = first
    return [by[k] for k in sorted(by)]


def merge(old, new):
    """이미 있는 분기는 그대로(빈 칸만 채움), 없던 분기만 붙임."""
    by = {r[0]: r for r in old}
    for r in new:
        if r[0] in by:
            o = by[r[0]]
            for i in range(2, 6):
                if o[i] is None and r[i] is not None:
                    o[i] = r[i]
        else:
            by[r[0]] = r
    return [by[k] for k in sorted(by)]


def run_us(full=False, only=None, limit=None):
    os.makedirs(FUND, exist_ok=True)
    tickers = json.load(open(os.path.join(DATA, "monthly_US_STOCK.json")))["tickers"]
    if only:
        tickers = [t for t in tickers if t in only]
    cik_path = os.path.join(FUND, "sec_cik.json")
    ciks = json.load(open(cik_path)) if os.path.exists(cik_path) else {}
    path = os.path.join(FUND, "US_STOCK.json")
    db = json.load(open(path)) if os.path.exists(path) else {"t": {}}
    today = dt.date.today()
    changed = fetched = 0
    nodata = []
    for t in tickers:
        if t not in ciks:
            ciks[t] = lookup_cik(t)
            time.sleep(0.2)
        cik = ciks[t]
        if not cik:
            nodata.append(t)
            continue
        cur = db["t"].get(t)
        if cur and not full:
            last_end = dt.date.fromisoformat(str(cur["q"][-1][0])[:4] + "-" + str(cur["q"][-1][0])[4:6] + "-" + str(cur["q"][-1][0])[6:]) if cur["q"] else dt.date(2000, 1, 1)
            at = dt.date.fromisoformat(cur.get("at", "2000-01-01"))
            if (today - last_end).days < 75 or (today - at).days < 3:
                continue
        if limit is not None and fetched >= limit:
            break
        rows = []
        for c in [cik] + PRED.get(t, []):
            facts = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{c:010d}.json")
            fetched += 1
            time.sleep(0.15)
            if facts:
                rows = merge_first(rows, parse(facts))
        if not rows:
            nodata.append(t)
            if cur:
                cur["at"] = today.isoformat()
            continue
        old = cur["q"] if cur else []
        q = rows if full else merge([r[:] for r in old], rows)  # --full은 처음부터 다시 만듦
        if q != old:
            changed += 1
        db["t"][t] = {"cik": cik, "at": today.isoformat(), "q": q}
        print(f"{t}: {len(q)}분기 ({q[0][0]}~{q[-1][0]})", flush=True)
    json.dump(ciks, open(cik_path, "w"), ensure_ascii=False, indent=0, sort_keys=True)
    db.update({"updated": dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), "src": "SEC EDGAR XBRL companyfacts",
               "fields": ["end", "filed", "rev", "oi", "ni", "eps"]})
    all_t = json.load(open(os.path.join(DATA, "monthly_US_STOCK.json")))["tickers"]
    db["nodata"] = sorted(t for t in all_t if not db["t"].get(t, {}).get("q"))
    if changed or full or not os.path.exists(path):
        with open(path, "w") as f:
            json.dump(db, f, ensure_ascii=False, separators=(",", ":"))
        meta_p = os.path.join(DATA, "meta.json")
        meta = json.load(open(meta_p))
        meta["updated"] = db["updated"]
        meta["fund"] = {"US_STOCK": {"updated": db["updated"], "tickers": len(db["t"]), "nodata": len(db["nodata"])}}
        json.dump(meta, open(meta_p, "w"), ensure_ascii=False, indent=1)
    print(f"US: 받음 {fetched}, 바뀜 {changed}, 자료 없음 {len(set(nodata))} {sorted(set(nodata))}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    run_us(full=a.full, only=set(a.only) if a.only else None, limit=a.limit)
    if not os.environ.get("DART_API_KEY"):
        print("KR: DART_API_KEY가 없어 국내 실적은 건너뜀")


if __name__ == "__main__":
    sys.exit(main())
