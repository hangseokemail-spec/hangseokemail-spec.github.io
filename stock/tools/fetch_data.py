# -*- coding: utf-8 -*-
"""Seok's Stock 시세 수집기.

GitHub Actions에서 하루 두 번 돌며 ../data/ 아래 JSON을 갱신합니다.
- 미국·국내 일별 시세: 야후 파이낸스 chart API (분할 반영 종가 + 배당 이벤트)
  → 브라우저가 배당을 재투자한 총수익 지수를 직접 계산합니다(야후 adjclose와 같은 방식).
- 국내 종목 목록·시총·상장주식수: 네이버 증권
- 야후에서 못 받은 국내 종목은 네이버 일별 시세로 대체(배당 미반영 표시).

사용: python3 stock/tools/fetch_data.py [--only AAPL,005930] [--workers 6]
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import random
import re
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(__file__))
from universe_seed import (US_STOCKS, US_ETFS, US_FUNDS, INDICES,  # noqa: E402
                           KR_STOCK_ALWAYS, KR_ETF_KEYWORDS)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "data")
PX = os.path.join(DATA, "px")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")
START_TS = 946684800  # 2000-01-01
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept": "application/json,text/plain,*/*"})


def log(*a):
    print(*a, flush=True)


def get(url, tries=5, timeout=30, **kw):
    last = None
    for i in range(tries):
        try:
            r = S.get(url, timeout=timeout, **kw)
            if r.status_code == 200:
                return r
            last = f"HTTP {r.status_code}"
            if r.status_code in (404, 400):
                break
        except Exception as e:  # noqa: BLE001
            last = str(e)
        time.sleep(1.5 * (i + 1) + random.random())
    raise RuntimeError(f"{url[:90]} -> {last}")


def sig(x, n=6):
    if x is None:
        return None
    return float(f"{x:.{n}g}")


def ymd(d):
    return d.year * 10000 + d.month * 100 + d.day


def num(s):
    if s is None:
        return None
    s = str(s).replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


# ---------------------------------------------------------------- 네이버 목록
def naver_stock_rank(market, pages, size=100):
    out = []
    for p in range(1, pages + 1):
        r = get(f"https://m.stock.naver.com/api/stocks/marketValue/{market}?page={p}&pageSize={size}")
        for s in r.json().get("stocks", []):
            if s.get("stockEndType") != "stock":
                continue
            price = num(s.get("closePrice"))
            mv = num(s.get("marketValue"))  # 억원
            ex = (s.get("stockExchangeType") or {}).get("code") or ("KS" if market == "KOSPI" else "KQ")
            out.append({
                "code": s["itemCode"], "name": s["stockName"], "ex": ex,
                "price": price, "mcap": mv * 1e8 if mv else None,
                "shares": round(mv * 1e8 / price) if (mv and price) else None,
            })
    return out


def naver_etf_list():
    r = get("https://finance.naver.com/api/sise/etfItemList.nhn?etfType=0&targetColumn=market_sum&sortOrder=desc")
    r.encoding = "euc-kr"
    items = json.loads(r.text)["result"]["etfItemList"]
    return [{"code": x["itemcode"], "name": x["itemname"], "price": x.get("nowVal"),
             "mcap": (x.get("marketSum") or 0) * 1e8, "nav": x.get("nav")} for x in items]


# ---------------------------------------------------------------- 야후
def yahoo_chart(sym, period1=START_TS):
    now = int(time.time()) + 86400
    url = (f"https://query2.finance.yahoo.com/v8/finance/chart/{requests.utils.quote(sym)}"
           f"?period1={period1}&period2={now}&interval=1d&events=div%2Csplit%2CcapitalGains&includeAdjustedClose=true")
    j = get(url).json()
    res = (j.get("chart") or {}).get("result")
    if not res:
        raise RuntimeError(f"{sym}: empty chart")
    res = res[0]
    meta = res.get("meta", {})
    off = meta.get("gmtoffset", 0) or 0
    ts = res.get("timestamp") or []
    q = (res.get("indicators", {}).get("quote") or [{}])[0]
    closes = q.get("close") or []
    adj = ((res.get("indicators", {}).get("adjclose") or [{}])[0]).get("adjclose") or []
    rows = {}
    for i, t in enumerate(ts):
        c = closes[i] if i < len(closes) else None
        if c is None or c <= 0:
            continue
        d = ymd(dt.datetime.fromtimestamp(t + off, dt.UTC).date())
        rows[d] = (c, adj[i] if i < len(adj) else None)
    dmap = {}
    evs = res.get("events") or {}
    for kind in ("dividends", "capitalGains"):  # 펀드의 자본이득 분배도 재투자 대상
        for ev in (evs.get(kind) or {}).values():
            d = ymd(dt.datetime.fromtimestamp(ev["date"] + off, dt.UTC).date())
            if ev.get("amount"):
                dmap[d] = dmap.get(d, 0) + ev["amount"]
    dates = sorted(rows)
    # 배당 이상치 걸러내기: 전일 종가의 90% 이상인 분배는 데이터 오류로 보고 버림(분사·스핀오프는 유지)
    pos = {d: i for i, d in enumerate(dates)}
    divs = []
    for d, a in sorted(dmap.items()):
        i = pos.get(d)
        if i is None:
            continue
        if i == 0:
            divs.append([d, sig(a, 6)])  # 증분 수집: 앞 구간과 합칠 때 다시 검사
            continue
        prev_c = rows[dates[i - 1]][0]
        if a >= 0.9 * prev_c:
            continue
        divs.append([d, sig(a, 6)])
    return {
        "dates": dates,
        "close": [rows[d][0] for d in dates],
        "adj": [rows[d][1] for d in dates],
        "divs": divs,
        "name": meta.get("longName") or meta.get("shortName"),
        "currency": meta.get("currency"),
        "type": meta.get("instrumentType"),
    }


def yahoo_shares(sym):
    now = int(time.time()) + 86400
    url = (f"https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/"
           f"{requests.utils.quote(sym)}?type=quarterlyOrdinarySharesNumber,annualOrdinarySharesNumber"
           f"&period1=1104537600&period2={now}")
    try:
        j = get(url, tries=3).json()
    except Exception:  # noqa: BLE001
        return []
    pts = {}
    for r in (j.get("timeseries") or {}).get("result") or []:
        for key in ("quarterlyOrdinarySharesNumber", "annualOrdinarySharesNumber"):
            for v in r.get(key) or []:
                if v and v.get("reportedValue"):
                    d = int(v["asOfDate"].replace("-", ""))
                    pts[d] = v["reportedValue"]["raw"]
    return [[d, int(pts[d])] for d in sorted(pts)]


def naver_daily(code, start="20000101"):
    today = dt.date.today().strftime("%Y%m%d")
    url = (f"https://api.stock.naver.com/chart/domestic/item/{code}/day"
           f"?startDateTime={start}0000&endDateTime={today}2359")
    arr = get(url).json()
    dates, close = [], []
    for x in arr:
        c = x.get("closePrice")
        if c:
            dates.append(int(x["localDate"]))
            close.append(float(c))
    return {"dates": dates, "close": close, "adj": [None] * len(dates), "divs": []}


# ---------------------------------------------------------------- 저장
def encode(key, raw, shares=None, source="yahoo"):
    dates = raw["dates"]
    d0 = dates[0]
    base = dt.date(d0 // 10000, d0 // 100 % 100, d0 % 100)
    gaps, prev = [], base
    for d in dates[1:]:
        cur = dt.date(d // 10000, d // 100 % 100, d % 100)
        gaps.append((cur - prev).days)
        prev = cur
    out = {"k": key, "d0": d0, "dd": gaps, "c": [sig(c) for c in raw["close"]], "dv": raw["divs"]}
    if shares:
        out["sh"] = shares
    if source != "yahoo":
        out["src"] = source
    return out


def tr_check(raw):
    """배당 이벤트로 만든 총수익 지수가 야후 adjclose와 맞는지(최대 상대오차)."""
    adj = raw["adj"]
    if not adj or adj[-1] is None:
        return None
    divmap = dict((d, a) for d, a in raw["divs"])
    c = raw["close"]
    idx = [1.0]
    for i in range(1, len(c)):
        a = divmap.get(raw["dates"][i], 0)
        base = c[i - 1] - a if c[i - 1] > a else c[i - 1]
        idx.append(idx[-1] * c[i] / base)  # 야후 방식: 배당락일 수익 = 종가 / (전일종가 − 배당)
    # 정규화 비교: 마지막 값 기준
    worst = 0.0
    for i in range(0, len(c), max(1, len(c) // 200)):
        if adj[i] is None:
            continue
        mine = idx[i] / idx[-1]
        theirs = adj[i] / adj[-1]
        worst = max(worst, abs(mine / theirs - 1))
    return worst


def write_json(path, obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            if f.read() == s:
                return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    return True


# ---------------------------------------------------------------- 월간 순위표
def decode_px(obj):
    d0 = obj["d0"]
    cur = dt.date(d0 // 10000, d0 // 100 % 100, d0 % 100)
    dates = [cur]
    for g in obj["dd"]:
        cur = cur + dt.timedelta(days=g)
        dates.append(cur)
    return dates, obj["c"], dict((d, a) for d, a in obj.get("dv", []))


# 시가총액 보정: ADR은 원주 기준 주식수가 들어오므로 ADR 비율로 나눔, 버크셔 B는 A주 환산 주식수
MCAP_FACTOR = {"TSM": 1 / 5, "BABA": 1 / 8, "BRK-B": 1500}
# 순위표에서 뺄 중복 종목(같은 회사의 다른 주식 종류)
RANK_EXCLUDE = {"GOOG"}


def build_monthly(items):
    """시장별(미국주식/미국ETF/국내주식/국내ETF) 월말 총수익지수·시총·변동성 표.
    순위 전략(시총 상위 N, 모멘텀 상위 N, 저변동성 N)은 이 표만으로 종목을 고르고,
    고른 종목만 일별 시세를 내려받습니다."""
    import math
    groups = {"US_STOCK": [], "US_ETF": [], "KR_STOCK": [], "KR_ETF": []}
    for it in items:
        g = None
        if it["m"] == "US" and it["t"] == "stock" and it.get("g") != "추가" and it["k"] not in RANK_EXCLUDE:
            g = "US_STOCK"
        elif it["m"] == "US" and it["t"] == "etf":
            g = "US_ETF"
        elif it["m"] == "KR" and it["t"] == "stock":
            g = "KR_STOCK"
        elif it["m"] == "KR" and it["t"] == "etf":
            g = "KR_ETF"
        if g:
            groups[g].append(it["k"])
    for g, keys in groups.items():
        months_set, per = set(), {}
        for k in keys:
            path = os.path.join(PX, f"{k}.json")
            if not os.path.exists(path):
                continue
            obj = json.load(open(path, encoding="utf-8"))
            dates, c, dv = decode_px(obj)
            sh = obj.get("sh") or []
            tr, rets = [1.0], [0.0]
            for i in range(1, len(c)):
                a = dv.get(ymd(dates[i]), 0)
                base = c[i - 1] - a if c[i - 1] > a else c[i - 1]
                r = c[i] / base - 1
                rets.append(r)
                tr.append(tr[-1] * (1 + r))
            rows = {}
            for i, d in enumerate(dates):
                ym = d.year * 100 + d.month
                rows[ym] = i  # 그 달 마지막 거래일
            # 마지막 달은 월말이 지난 경우만(진행 중인 달도 포함: 표시용)
            out = {}
            for ym, i in rows.items():
                mc = None
                if sh:
                    di = ymd(dates[i])
                    s_at = sh[0][1]
                    for sd, sv in sh:
                        if sd <= di:
                            s_at = sv
                        else:
                            break
                    mc = c[i] * s_at * MCAP_FACTOR.get(k, 1)
                lo = max(1, i - 62)
                win = rets[lo:i + 1]
                vol = None
                if len(win) >= 40:
                    m = sum(win) / len(win)
                    vol = math.sqrt(sum((x - m) ** 2 for x in win) / (len(win) - 1)) * math.sqrt(252)
                out[ym] = (tr[i], mc, vol)
                months_set.add(ym)
            per[k] = out
        months = sorted(months_set)
        tick = sorted(per)
        # 각 종목은 첫 거래월(o: months 안의 위치)부터 값만 저장
        tbl = {"group": g, "months": months, "tickers": tick, "o": [], "tr": [], "mc": [], "vol": []}
        for k in tick:
            o = per[k]
            first = min(o)
            i0 = months.index(first)
            ms = months[i0:]
            tbl["o"].append(i0)
            tbl["tr"].append([sig(o[m][0], 6) if m in o else None for m in ms])
            tbl["mc"].append([sig(o[m][1], 4) if (m in o and o[m][1]) else None for m in ms])
            tbl["vol"].append([sig(o[m][2], 3) if (m in o and o[m][2]) else None for m in ms])
        write_json(os.path.join(DATA, f"monthly_{g}.json"), tbl)
        log(f"monthly {g}: {len(tick)} tickers x {len(months)} months")


# ---------------------------------------------------------------- 메인
def build_universe():
    U = []
    for t, n, g, al in US_STOCKS:
        U.append({"k": t, "y": t, "n": n, "m": "US", "t": "stock", "g": g, "cur": "USD", "al": al})
    for t, n, g, al in US_ETFS:
        U.append({"k": t, "y": t, "n": n, "m": "US", "t": "etf", "g": g, "cur": "USD", "al": al})
    for t, n, g, al in US_FUNDS:
        U.append({"k": t, "y": t, "n": n, "m": "US", "t": "fund", "g": g, "cur": "USD", "al": al})
    for k, y, n, g, cur in INDICES:
        U.append({"k": k, "y": y, "n": n, "m": "IDX", "t": "index", "g": g, "cur": cur, "al": []})

    kospi = naver_stock_rank("KOSPI", 5)   # 상위 500 (이름·시세 목록용)
    kosdaq = naver_stock_rank("KOSDAQ", 3)  # 상위 300
    etfs = naver_etf_list()
    kr_all = {"stocks": [], "etfs": []}
    for s in kospi + kosdaq:
        kr_all["stocks"].append([s["code"], s["name"], s["ex"], s["price"], s["mcap"], s["shares"]])
    for e in etfs:
        kr_all["etfs"].append([e["code"], e["name"], e["price"], e["mcap"]])

    seen = set(x["k"] for x in U)
    info = {s["code"]: s for s in kospi + kosdaq}
    pick = [s["code"] for s in kospi[:120]] + [s["code"] for s in kosdaq[:40]] + KR_STOCK_ALWAYS
    for code in pick:
        if code in seen:
            continue
        seen.add(code)
        s = info.get(code)
        ex = (s or {}).get("ex", "KS")
        U.append({"k": code, "y": f"{code}.{ex}", "n": (s or {}).get("name") or code, "m": "KR",
                  "t": "stock", "g": "코스닥" if ex == "KQ" else "코스피", "cur": "KRW", "al": [],
                  "shares": (s or {}).get("shares")})
    kw = re.compile("|".join(re.escape(k) for k in KR_ETF_KEYWORDS))
    for i, e in enumerate(etfs):
        if i < 250 or kw.search(e["name"]):
            if e["code"] in seen:
                continue
            seen.add(e["code"])
            U.append({"k": e["code"], "y": f"{e['code']}.KS", "n": e["name"], "m": "KR", "t": "etf",
                      "g": "국내 ETF", "cur": "KRW", "al": []})

    extra = os.path.join(DATA, "extra_tickers.txt")
    if os.path.exists(extra):
        for line in open(extra, encoding="utf-8"):
            t = line.split("#")[0].strip().upper()
            if not t or t in seen:
                continue
            seen.add(t)
            if re.fullmatch(r"\d{6}|\d{5}[A-Z]", t):
                s = info.get(t)
                ex = (s or {}).get("ex", "KS")
                U.append({"k": t, "y": f"{t}.{ex}", "n": (s or {}).get("name") or t, "m": "KR",
                          "t": "stock", "g": "추가", "cur": "KRW", "al": [], "shares": (s or {}).get("shares")})
            else:
                U.append({"k": t, "y": t, "n": t, "m": "US", "t": "stock", "g": "추가", "cur": "USD", "al": []})
    return U, kr_all


FULL = False  # --full 이면 모든 종목을 처음부터 다시 받음


def load_existing(key):
    path = os.path.join(PX, f"{key}.json")
    if not os.path.exists(path):
        return None
    try:
        obj = json.load(open(path, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None
    dates, c, _dv = decode_px(obj)
    return {"dates": [ymd(d) for d in dates], "close": list(c), "adj": [None] * len(c),
            "divs": [list(x) for x in obj.get("dv", [])], "sh": obj.get("sh") or [], "src": obj.get("src", "yahoo")}


def merge_incremental(old, new):
    """기존 DB 뒤에 새 날짜만 붙임. 겹치는 날 종가가 0.2% 넘게 다르면(분할·정정) None → 전체 재수집."""
    pos = {d: i for i, d in enumerate(old["dates"])}
    overlap = 0
    for d, c in zip(new["dates"], new["close"]):
        if d in pos:
            overlap += 1
            oc = old["close"][pos[d]]
            if oc and abs(sig(c) / oc - 1) > 0.002:
                return None
    if overlap == 0 and new["dates"] and old["dates"] and new["dates"][0] > old["dates"][-1] + 20:
        return None  # 빈 구간이 너무 김
    last = old["dates"][-1]
    out = {"dates": list(old["dates"]), "close": list(old["close"]), "adj": list(old["adj"]),
           "divs": [list(x) for x in old["divs"]]}
    for d, c, a in zip(new["dates"], new["close"], new["adj"]):
        if d > last:
            out["dates"].append(d)
            out["close"].append(c)
            out["adj"].append(a)
    have = {d for d, _ in out["divs"]}
    p2 = {d: i for i, d in enumerate(out["dates"])}
    for d, a in new["divs"]:
        if d in have or d not in p2:
            continue
        i = p2[d]
        if i > 0 and a >= 0.9 * out["close"][i - 1]:
            continue
        out["divs"].append([d, a])
    out["divs"].sort()
    return out


def fetch_full(u):
    key = u["k"]
    src = "yahoo"
    try:
        raw = yahoo_chart(u["y"])
        if u["m"] == "KR" and len(raw["dates"]) < 30:
            raise RuntimeError("too short")
    except Exception as e:  # noqa: BLE001
        if u["m"] == "KR" and re.fullmatch(r"[0-9A-Z]{6}", key):
            raw = naver_daily(key)
            src = "naver"
            if not raw["dates"]:
                raise RuntimeError(f"{key}: no data ({e})") from e
        elif u["m"] == "KR" and u["y"].endswith(".KS"):
            u["y"] = u["y"][:-3] + ".KQ"
            raw = yahoo_chart(u["y"])
        else:
            raise
    return raw, src


def fetch_one(u):
    key = u["k"]
    old = None if FULL else load_existing(key)
    mode = "full"
    raw, src = None, "yahoo"
    if old and old["dates"]:
        last = old["dates"][-1]
        lastd = dt.date(last // 10000, last // 100 % 100, last % 100)
        try:
            if old["src"] == "naver":
                new = naver_daily(key, (lastd - dt.timedelta(days=14)).strftime("%Y%m%d"))
                src = "naver"
            else:
                p1 = int(dt.datetime(lastd.year, lastd.month, lastd.day, tzinfo=dt.UTC).timestamp()) - 14 * 86400
                new = yahoo_chart(u["y"], p1)
            merged = merge_incremental(old, new)
            if merged is not None:
                raw, mode = merged, "inc"
                raw["name"], raw["type"] = new.get("name"), new.get("type")
        except Exception:  # noqa: BLE001
            raw = None
    if raw is None:
        raw, src = fetch_full(u)
        mode = "full"
    shares = None
    if u["t"] == "stock":
        prev_sh = (old or {}).get("sh") or []
        if u["m"] == "US":
            shares = yahoo_shares(u["y"]) if (mode == "full" or not prev_sh) else prev_sh
        else:
            shares = [x for x in prev_sh] if mode == "inc" else []
        if u.get("shares"):
            today = ymd(dt.date.today())
            cur = int(u["shares"])
            if not shares or abs(shares[-1][1] / cur - 1) > 0.005:
                shares = (shares or []) + [[today, cur]]
    chk = tr_check(raw) if (src == "yahoo" and mode == "full") else None
    obj = encode(key, raw, shares, src)
    changed = write_json(os.path.join(PX, f"{key}.json"), obj)
    c = raw["close"]
    meta = {
        "start": raw["dates"][0], "end": raw["dates"][-1], "last": sig(c[-1]),
        "prev": sig(c[-2]) if len(c) > 1 else None, "n_rows": len(c), "src": src,
        "nodiv": src != "yahoo", "mode": mode,
    }
    if (u["n"] == u["k"]) and raw.get("name"):
        u["n"] = raw["name"]
    if u.get("g") == "추가" and raw.get("type") == "ETF":
        u["t"] = "etf"
    return key, meta, chk, changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--full", action="store_true", help="모든 종목을 처음부터 다시 받기(주 1회)")
    args = ap.parse_args()
    global FULL
    FULL = args.full
    os.makedirs(PX, exist_ok=True)

    U, kr_all = build_universe()
    if args.only:
        want = set(args.only.split(","))
        todo = [u for u in U if u["k"] in want]
    else:
        todo = U
    log(f"universe {len(U)} / fetch {len(todo)}")

    ok, fail, checks, changed = {}, [], {}, 0
    modes = {"inc": 0, "full": 0}
    with cf.ThreadPoolExecutor(args.workers) as ex:
        futs = {ex.submit(fetch_one, u): u for u in todo}
        for i, f in enumerate(cf.as_completed(futs)):
            u = futs[f]
            try:
                k, meta, chk, ch = f.result()
                ok[k] = meta
                modes[meta["mode"]] += 1
                changed += ch
                if chk is not None:
                    checks[k] = round(chk, 5)
            except Exception as e:  # noqa: BLE001
                fail.append([u["k"], str(e)[:160]])
            if (i + 1) % 50 == 0:
                log(f"  {i + 1}/{len(todo)}  ok={len(ok)} fail={len(fail)}")

    # 이전 universe의 메타 유지(부분 수집 시)
    upath = os.path.join(DATA, "universe.json")
    prev = {}
    if os.path.exists(upath):
        try:
            prev = {x["k"]: x for x in json.load(open(upath, encoding="utf-8"))["items"]}
        except Exception:  # noqa: BLE001
            prev = {}
    items = []
    for u in U:
        m = ok.get(u["k"])
        if m is None and u["k"] in prev and os.path.exists(os.path.join(PX, f"{u['k']}.json")):
            items.append(prev[u["k"]])
            continue
        if m is None:
            continue
        row = {k: v for k, v in u.items() if k not in ("shares",) and v not in (None, [], "")}
        row.update({"s": m["start"], "e": m["end"], "p": m["last"], "pp": m["prev"]})
        if m["nodiv"]:
            row["nodiv"] = 1
        items.append(row)
    now = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    write_json(upath, {"updated": now, "count": len(items), "items": items})
    write_json(os.path.join(DATA, "kr_all.json"), {"updated": now, **kr_all})
    build_monthly(items)
    bad = sorted(checks.items(), key=lambda x: -x[1])[:15]
    write_json(os.path.join(DATA, "meta.json"), {
        "updated": now, "fetched": len(ok), "incremental": modes["inc"], "full": modes["full"],
        "failed": fail, "files_changed": changed,
        "tr_check_worst": bad,
    })
    log(f"done ok={len(ok)} (증분 {modes['inc']}, 전체 {modes['full']}) fail={len(fail)} changed={changed}")
    for k, e in fail[:30]:
        log("  FAIL", k, e)
    log("TR check worst:", bad[:8])


if __name__ == "__main__":
    main()
