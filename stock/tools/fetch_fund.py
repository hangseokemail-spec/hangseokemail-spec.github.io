#!/usr/bin/env python3
"""Seok's Stock 실적(펀더멘털) DB: 분기 매출·영업이익·순이익·EPS와 '공시일'을 모은다.

미국: SEC EDGAR XBRL companyfacts(무료·공식, 2009년 무렵부터). 같은 분기 값이 여러 번 나오면
      '처음 공시된 값과 그 공시일'을 쓴다 → 백테스트에서 그때 알 수 없던 값을 쓰지 않게.
      4분기는 10-K 연간 값에서 1~3분기를 빼서 만들고, 공시일은 10-K 날짜.
한국: OpenDART(금감원 전자공시) API, 2015년~. 환경변수 DART_API_KEY가 있을 때만.
      분기·반기·3분기 보고서의 손익계산서 '3개월' 값을 그 분기 값으로, 4분기는 사업보고서 연간 − 3분기 누적.
      공시일 = 접수번호(rcept_no) 앞 8자리. 연결재무제표가 없으면 별도. 결산월이 12월이 아닌 회사는 뺌.
      저장: stock/data/fund/KR_STOCK.json(같은 모양, 금액은 원). 받은 보고서는 done에 적어 다시 받지 않음.

저장: stock/data/fund/US_STOCK.json
  {"updated", "src", "fields": ["end","filed","rev","oi","ni","eps","gp","cfo","capex","ta","eq","bb","div"],
   "t": {티커: {"cik", "at": 마지막으로 받은 날, "q": [[분기말 yyyymmdd, 공시일 yyyymmdd, 매출, 영업이익, 순이익, 희석 EPS,
                                                    매출총이익, 영업현금흐름, 설비투자, 총자산, 자본(지배주주), 자사주 매입, 배당 지급], ...]}}}
  (2026-11-21 뒤 7열 추가. 현금흐름은 분기 값으로 풀고, 그 분기 실적과 같은 날 이전에 공시된 값만 담는다)
증분: 기본은 '새 분기가 나올 때가 된 종목'(마지막 분기말이 75일 넘게 지났고 3일 안에 받지 않은 종목)만 다시 받아
      없던 분기만 붙인다. 이미 있는 분기 값은 바꾸지 않는다(처음 공시 값 유지). --full이면 모두 다시 받음.

SEC는 User-Agent에 연락처를 요구한다: 환경변수 SEC_UA(예: "이름 연락처")를 쓰고, 없으면 일반 이름을 쓴다.
"""
import argparse, datetime as dt, io, json, os, sys, time, urllib.parse, urllib.request, urllib.error, gzip, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FUND = os.path.join(DATA, "fund")
UA = os.environ.get("SEC_UA") or "SeoksStock-research/1.0"  # SEC가 거절하지 않는 형식(공백·괄호 있는 이름은 403이 난 적 있음)

REV_TAGS = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet",
            "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet", "RevenuesNetOfInterestExpense"]
OI_TAGS = ["OperatingIncomeLoss"]
NI_TAGS = ["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic", "ProfitLoss"]
EPS_TAGS = ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"]
# 2026-11-21 추가(재무상태표·현금흐름): 매출총이익, 영업현금흐름, 설비투자, 총자산, 자본(지배주주), 자사주 매입, 배당 지급
GP_TAGS = ["GrossProfit"]
COGS_TAGS = ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold", "CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization"]
CFO_TAGS = ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"]
CAPEX_TAGS = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements"]
TA_TAGS = ["Assets"]
EQ_TAGS = ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"]
BB_TAGS = ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"]
DIV_TAGS = ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"]
FIELDS = ["end", "filed", "rev", "oi", "ni", "eps", "gp", "cfo", "capex", "ta", "eq", "bb", "div"]
NCOL = len(FIELDS)
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


def ytd_series(arr):
    """현금흐름처럼 10-Q에 '회계연도 시작부터 누적'으로 나오는 값 → 분기 값(처음 공시 값).
    같은 시작일의 누적값을 끝나는 날 순으로 놓고 앞 값을 뺀다(1분기=3개월 누적, 4분기=연간−9개월). 3개월 값이 따로 있으면 그것을 쓴다."""
    by = {}  # 시작일 → {끝: 처음 공시 사실}
    direct = {}
    for x in arr:
        if x.get("form") not in FORMS or "start" not in x or x.get("val") is None:
            continue
        n = days(x["start"], x["end"])
        if not (75 <= n <= 105 or 165 <= n <= 195 or 255 <= n <= 285 or 340 <= n <= 390):
            continue
        box = by.setdefault(x["start"], {})
        if x["end"] not in box or x["filed"] < box[x["end"]]["filed"]:
            box[x["end"]] = x
        if 75 <= n <= 105 and (x["end"] not in direct or x["filed"] < direct[x["end"]]["filed"]):
            direct[x["end"]] = x
    out = {}
    for st, box in by.items():
        ends = sorted(box)
        prev = None
        for e in ends:
            x = box[e]
            n = days(st, e)
            if 75 <= n <= 105:
                v, f = x["val"], x["filed"]
            elif prev is not None and 75 <= days(prev, e) <= 105:
                v, f = x["val"] - box[prev]["val"], max(x["filed"], box[prev]["filed"])
            else:
                prev = e
                continue
            if e not in out or f < out[e][1]:
                out[e] = (v, f)
            prev = e
    for e, x in direct.items():  # 회사가 3개월 값을 직접 낸 분기는 그 값을 우선
        if e not in out or x["filed"] <= out[e][1]:
            out[e] = (x["val"], x["filed"])
    return out


def inst_series(arr):
    """재무상태표처럼 '그날 잔액'인 값 → {날짜: (값, 처음 공시일)}."""
    out = {}
    for x in arr:
        if x.get("form") not in FORMS or "start" in x or x.get("val") is None:
            continue
        e = x["end"]
        if e not in out or x["filed"] < out[e][1]:
            out[e] = (x["val"], x["filed"])
    return out


def series_by(facts, tags, fn, unit="USD"):
    g = facts.get("facts", {}).get("us-gaap", {})
    out = {}
    for tag in tags:
        arr = g.get(tag, {}).get("units", {}).get(unit)
        if not arr:
            continue
        for e, v in fn(arr).items():
            if e not in out:
                out[e] = v
    return out


def near_end(col, e, tol=7):
    """같은 분기말(±7일)의 값"""
    if e in col:
        return col[e]
    best = None
    for k, v in col.items():
        d = abs(days(k, e))
        if d <= tol and (best is None or d < best[0]):
            best = (d, v)
    return best[1] if best else None


def parse(facts):
    cols = [series(facts, REV_TAGS, "USD", "max"), series(facts, OI_TAGS, "USD"), series(facts, NI_TAGS, "USD"), series(facts, EPS_TAGS, "USD/shares")]
    gp = series(facts, GP_TAGS, "USD")
    cogs = series(facts, COGS_TAGS, "USD")
    extra = [series_by(facts, CFO_TAGS, ytd_series), series_by(facts, CAPEX_TAGS, ytd_series),
             series_by(facts, TA_TAGS, inst_series), series_by(facts, EQ_TAGS, inst_series),
             series_by(facts, BB_TAGS, ytd_series), series_by(facts, DIV_TAGS, ytd_series)]
    ends = sorted(set().union(*[c.keys() for c in cols]))
    rows = []
    for e in ends:
        vals = [c.get(e) for c in cols]
        filed = max(v[1] for v in vals if v)
        def num(v, f=False):
            if not v:
                return None
            return round(v[0], 4) if f else int(round(v[0]))
        # 새 열은 그 분기 실적과 같은 날(또는 그 전)에 공시된 값만 — 나중에 나온 값으로 과거를 미리 보지 않게
        def ok(v):
            return v if v and v[1] <= filed else None
        g = ok(gp.get(e))
        if g is None and vals[0] and ok(cogs.get(e)):
            g = (vals[0][0] - cogs[e][0], filed)
        ex = [ok(near_end(c, e)) for c in extra]
        rows.append([d2i(e), d2i(filed), num(vals[0]), num(vals[1]), num(vals[2]), num(vals[3], True), num(g)] + [num(v) for v in ex])
    return [r for r in rows if r[0] >= 20070101]


def pad(r):
    return r + [None] * (NCOL - len(r)) if len(r) < NCOL else r


def merge_first(a, b):
    """두 회사(CIK) 기록 합치기: 같은 분기면 먼저 공시된 쪽, 빈 칸은 다른 쪽으로 채움."""
    by = {r[0]: pad(r[:]) for r in a}
    for r in b:
        r = pad(r[:])
        o = by.get(r[0])
        if o is None:
            by[r[0]] = r
            continue
        first, other = (o, r) if o[1] <= r[1] else (r, o)
        for i in range(2, NCOL):
            if first[i] is None:
                first[i] = other[i]
        by[r[0]] = first
    return [by[k] for k in sorted(by)]


def merge(old, new):
    """이미 있는 분기는 그대로(빈 칸만 채움), 없던 분기만 붙임."""
    by = {r[0]: pad(r) for r in old}
    for r in new:
        r = pad(r)
        if r[0] in by:
            o = by[r[0]]
            for i in range(2, NCOL):
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
               "fields": FIELDS})
    all_t = json.load(open(os.path.join(DATA, "monthly_US_STOCK.json")))["tickers"]
    db["nodata"] = sorted(t for t in all_t if not db["t"].get(t, {}).get("q"))
    if changed or full or not os.path.exists(path):
        with open(path, "w") as f:
            json.dump(db, f, ensure_ascii=False, separators=(",", ":"))
        meta_p = os.path.join(DATA, "meta.json")
        meta = json.load(open(meta_p))
        meta["updated"] = db["updated"]
        meta.setdefault("fund", {})["US_STOCK"] = {"updated": db["updated"], "tickers": len(db["t"]), "nodata": len(db["nodata"])}
        json.dump(meta, open(meta_p, "w"), ensure_ascii=False, indent=1)
    print(f"US: 받음 {fetched}, 바뀜 {changed}, 자료 없음 {len(set(nodata))} {sorted(set(nodata))}")


# ------------------------------------------------------------------ 한국: OpenDART
DART = "https://opendart.fss.or.kr/api/"
REPORTS = [("11013", 3, 45), ("11012", 6, 45), ("11014", 9, 45), ("11011", 12, 90)]  # (보고서 코드, 분기말 월, 제출 기한 일)


class DartStop(Exception):
    pass


class Dart:
    """키는 환경변수에서만 읽고, 주소·키를 화면에 찍지 않는다."""
    def __init__(self, key, max_calls):
        self.key, self.max_calls, self.calls = key, max_calls, 0

    def raw(self, name, **params):
        if self.calls >= self.max_calls:
            raise DartStop(f"이번 실행 호출 한도 {self.max_calls}회")
        self.calls += 1
        url = DART + name + "?" + urllib.parse.urlencode({"crtfc_key": self.key, **params})
        for i in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "SeoksStock-research/1.0"}), timeout=40) as r:
                    b = r.read()
                time.sleep(0.07)
                return b
            except Exception as e:  # 주소(키 포함)는 찍지 않음
                err = type(e).__name__
                time.sleep(2 * (i + 1))
        raise DartStop(f"OpenDART 연결 실패({err})")

    def json(self, name, **params):
        j = json.loads(self.raw(name, **params))
        st = j.get("status")
        if st in ("010", "011", "012", "901"):
            raise DartStop(f"인증키 문제({st}: {j.get('message')})")
        if st == "020":
            raise DartStop("오늘 호출 한도를 넘었어요(020) — 내일 이어서 받음")
        return j


def num(v):
    if v is None:
        return None
    v = str(v).replace(",", "").strip()
    if v in ("", "-"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


NM = lambda x: str(x or "").replace(" ", "")
KR_ACCOUNTS = {
    "rev": (["ifrs-full_Revenue", "ifrs_Revenue"], ["매출액", "수익(매출액)", "영업수익", "매출", "매출액(영업수익)", "영업수익(매출액)", "수익"]),
    "oi": (["dart_OperatingIncomeLoss"], ["영업이익", "영업이익(손실)", "영업손익", "영업손실"]),
    "ni": (["ifrs-full_ProfitLossAttributableToOwnersOfParent", "ifrs_ProfitLossAttributableToOwnersOfParent", "ifrs-full_ProfitLoss", "ifrs_ProfitLoss"],
           ["지배기업의소유주에게귀속되는당기순이익", "지배기업소유주지분", "당기순이익", "당기순이익(손실)", "분기순이익", "분기순이익(손실)", "반기순이익", "반기순이익(손실)", "당기순손익"]),
    "eps": (["ifrs-full_DilutedEarningsLossPerShare", "ifrs_DilutedEarningsLossPerShare", "ifrs-full_BasicEarningsLossPerShare", "ifrs_BasicEarningsLossPerShare"],
            ["희석주당이익", "희석주당이익(손실)", "기본주당이익", "기본주당이익(손실)", "기본및희석주당이익", "기본및희석주당이익(손실)", "기본주당순이익", "기본주당순이익(손실)"]),
}


# 2026-11-21: 매출총이익(손익), 총자산·자본(재무상태표, 그날 잔액), 영업현금흐름·설비투자·자사주·배당(현금흐름, 연초부터 누적)
KR_IS_MORE = {"gp": (["ifrs-full_GrossProfit", "ifrs_GrossProfit"], ["매출총이익", "매출총이익(손실)"])}
KR_BS = {
    "ta": (["ifrs-full_Assets", "ifrs_Assets"], ["자산총계"]),
    "eq": (["ifrs-full_EquityAttributableToOwnersOfParent", "ifrs_EquityAttributableToOwnersOfParent", "ifrs-full_Equity", "ifrs_Equity"],
           ["지배기업의소유주에게귀속되는자본", "지배기업소유주지분", "지배기업의소유주지분", "자본총계"]),
}
KR_CF = {
    "cfo": (["ifrs-full_CashFlowsFromUsedInOperatingActivities", "ifrs_CashFlowsFromUsedInOperatingActivities"],
            ["영업활동현금흐름", "영업활동으로인한현금흐름", "영업활동으로부터의현금흐름", "영업활동순현금흐름", "영업활동으로인한순현금흐름"]),
    "capex": (["ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities", "ifrs-full_PurchaseOfPropertyPlantAndEquipment", "ifrs_PurchaseOfPropertyPlantAndEquipment"], ["유형자산의취득", "유형자산취득"]),
    "bb": (["ifrs-full_PaymentsToAcquireOrRedeemEntitysShares", "ifrs_PaymentsToAcquireOrRedeemEntitysShares", "dart_AcquisitionOfTreasuryShares"], ["자기주식의취득", "자기주식취득"]),
    "div": (["ifrs-full_DividendsPaidClassifiedAsFinancingActivities", "ifrs_DividendsPaidClassifiedAsFinancingActivities", "ifrs-full_DividendsPaid"],
            ["배당금의지급", "배당금지급", "배당금의지급(지배기업)", "현금배당금의지급"]),
}
KR_VER = 2  # 보고서 값 형식 판: 2부터 재무상태표·현금흐름도 담음(1판은 다시 받음)


def _find(rows, ids, nms):
    for want in ids:
        hit = next((x for x in rows if x.get("account_id") == want), None)
        if hit:
            return hit
    for want in nms:
        hit = next((x for x in rows if NM(x.get("account_nm")) == want), None)
        if hit:
            return hit
    return None


def kr_pick(items):
    """한 보고서에서 항목별 (3개월 값, 누적 값).
    손익: 3개월·누적 그대로 / 재무상태표: (잔액, 잔액) / 현금흐름: (None, 연초부터 누적, 누적 칸이 비면 당기 칸)."""
    ist = [x for x in items if x.get("sj_div") in ("IS", "CIS")]
    ist.sort(key=lambda x: (0 if x.get("sj_div") == "IS" else 1, int(x.get("ord") or 0)))
    bs = sorted((x for x in items if x.get("sj_div") == "BS"), key=lambda x: int(x.get("ord") or 0))
    cf = sorted((x for x in items if x.get("sj_div") == "CF"), key=lambda x: int(x.get("ord") or 0))
    out = {}
    for k, (ids, nms) in {**KR_ACCOUNTS, **KR_IS_MORE}.items():
        hit = _find(ist, ids, nms)
        out[k] = (num(hit.get("thstrm_amount")), num(hit.get("thstrm_add_amount"))) if hit else (None, None)
    for k, (ids, nms) in KR_BS.items():
        hit = _find(bs, ids, nms)
        v = num(hit.get("thstrm_amount")) if hit else None
        out[k] = (v, v)
    for k, (ids, nms) in KR_CF.items():
        hit = _find(cf, ids, nms)
        c = None
        if hit:
            c = num(hit.get("thstrm_add_amount"))
            if c is None:
                c = num(hit.get("thstrm_amount"))
            if c is not None and k != "cfo":
                c = abs(c)  # 나가는 돈은 양수로(설비투자·자사주·배당)
        out[k] = (None, c)
    return out


IS_K = ("rev", "oi", "ni", "eps", "gp")
CF_K = ("cfo", "capex", "bb", "div")
BS_K = ("ta", "eq")


def kr_quarters(reps):
    """reps: {(연도, 보고서코드): {'filed': yyyymmdd, 'v': kr_pick 결과}} → 분기 표(열은 FIELDS 순서)."""
    rows = []
    years = sorted({y for y, _ in reps})
    get = lambda rep_, k, i: (rep_["v"].get(k) or (None, None))[i] if rep_ else None
    for y in years:
        q1, h1, q3, fy = (reps.get((y, c)) for c in ("11013", "11012", "11014", "11011"))
        seq = [("11013", 3, q1, None), ("11012", 6, h1, q1), ("11014", 9, q3, h1)]
        for rc, mon, rep_, prev in seq:
            if not rep_:
                continue
            end = y * 10000 + mon * 100 + (31 if mon in (3, 12) else 30)
            v = {k: get(rep_, k, 0) for k in IS_K}
            for k in CF_K:  # 누적 − 직전 보고서 누적(1분기는 누적 그대로)
                c = get(rep_, k, 1)
                pc = get(prev, k, 1) if prev else 0
                v[k] = None if c is None or pc is None else c - pc
            for k in BS_K:
                v[k] = get(rep_, k, 0)
            rows.append([end, rep_["filed"]] + [v[k] for k in FIELDS[2:]])
        if fy:
            v = {}
            for k in IS_K:
                a = get(fy, k, 0)
                cum9 = get(q3, k, 1)
                if cum9 is None and q1 and h1 and q3 and None not in (get(q1, k, 0), get(h1, k, 0), get(q3, k, 0)):
                    cum9 = get(q1, k, 0) + get(h1, k, 0) + get(q3, k, 0)
                v[k] = a - cum9 if a is not None and cum9 is not None else None
            for k in CF_K:  # 연간 − 3분기 누적
                c, pc = get(fy, k, 1), get(q3, k, 1)
                v[k] = c - pc if c is not None and pc is not None else None
            for k in BS_K:
                v[k] = get(fy, k, 0)
            rows.append([y * 10000 + 1231, fy["filed"]] + [v[k] for k in FIELDS[2:]])
    # 정정공시가 있으면 DART가 마지막 정정본의 접수번호를 줘서 공시일이 몇 년 뒤로 찍힌다 →
    # 법정 제출 기한(분기·반기 45일, 사업보고서 90일)보다 늦으면 기한 날짜를 공시일로 본다(원래 보고서는 기한 안에 나옴)
    def cap_filed(end, filed):
        e = dt.date(end // 10000, end // 100 % 100, end % 100)
        due = e + dt.timedelta(days=90 if end % 10000 == 1231 else 45)
        dint = due.year * 10000 + due.month * 100 + due.day
        return min(filed, dint)
    rows = [[r[0], cap_filed(r[0], r[1])] + r[2:] for r in rows]
    out = []
    ei = FIELDS.index("eps")
    for r in sorted(rows):
        r = r[:2] + [None if x is None else (round(x, 1) if i + 2 == ei else int(round(x))) for i, x in enumerate(r[2:])]
        if r[2] is not None and r[2] <= 0:
            r[2] = None
        if any(v is not None for v in r[2:]):
            out.append(r)
    return out


def corp_codes(d, need):
    path = os.path.join(FUND, "dart_corp.json")
    m = json.load(open(path)) if os.path.exists(path) else {}
    if all(t in m for t in need):
        return m
    z = zipfile.ZipFile(io.BytesIO(d.raw("corpCode.xml")))
    root = ET.fromstring(z.read(z.namelist()[0]))
    allm = {}
    for el in root.iter("list"):
        sc = (el.findtext("stock_code") or "").strip()
        if sc:
            allm[sc] = el.findtext("corp_code").strip()
    m.update({t: allm.get(t) for t in need})
    json.dump(m, open(path, "w"), ensure_ascii=False, indent=0, sort_keys=True)
    return m


def run_kr(max_calls=15000, max_minutes=200, full=False, only=None, fetcher=None):
    """국내 실적. 받은 보고서 원본 값은 KR_raw.json(수집기 전용), 앱이 읽는 분기 표는 KR_STOCK.json."""
    key = os.environ.get("DART_API_KEY", "").strip()
    if not key and not fetcher:
        print("KR: DART_API_KEY가 없어 국내 실적은 건너뜀")
        return
    os.makedirs(FUND, exist_ok=True)
    d = fetcher or Dart(key, max_calls)
    t0 = time.time()
    all_t = json.load(open(os.path.join(DATA, "monthly_KR_STOCK.json")))["tickers"]
    tickers = [t for t in all_t if t in only] if only else all_t
    raw_p, pub_p = os.path.join(FUND, "KR_raw.json"), os.path.join(FUND, "KR_STOCK.json")
    raw = json.load(open(raw_p)) if os.path.exists(raw_p) else {"t": {}}
    pub = json.load(open(pub_p)) if os.path.exists(pub_p) else {"t": {}}
    today = dt.date.today()
    changed, stop = 0, None

    def rebuild(t):
        nonlocal changed
        cur = raw["t"][t]
        q = kr_quarters({(int(k[:4]), k[5:]): v for k, v in cur.get("reps", {}).items()})
        old = pub["t"].get(t, {}).get("q")
        if q and q != old:
            pub["t"][t] = {"corp": cur.get("corp"), "fs": cur.get("fs"), "q": q}
            changed += 1
            print(f"{t}: {len(q)}분기 ({q[0][0]}~{q[-1][0]}) 호출 {getattr(d, 'calls', 0)}", flush=True)

    def save():
        stamp = dt.datetime.now(dt.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        raw["updated"] = stamp
        json.dump(raw, open(raw_p, "w"), ensure_ascii=False, separators=(",", ":"))
        pub.update({"updated": stamp, "src": "OpenDART 단일회사 전체 재무제표(연결 우선)", "fields": FIELDS, "currency": "KRW"})
        pub["nodata"] = sorted(t for t in all_t if not pub["t"].get(t, {}).get("q"))
        pub["skip"] = {t: v["skip"] for t, v in raw["t"].items() if v.get("skip")}
        with open(pub_p, "w") as f:
            json.dump(pub, f, ensure_ascii=False, separators=(",", ":"))

    # 아직 자료가 없는 종목 먼저, 그다음 예전 판(1판) 보고서를 다시 받아야 하는 종목, 나머지
    def stale_n(t):
        cur = raw["t"].get(t) or {}
        return sum(1 for v in cur.get("reps", {}).values() if v.get("ver", 1) < KR_VER)
    def order(t):
        cur = raw["t"].get(t) or {}
        return (0 if not cur.get("reps") and not cur.get("skip") else 1 if stale_n(t) else 2)
    tickers = sorted(tickers, key=lambda t: (order(t), all_t.index(t) if t in all_t else 0))
    t = None
    try:
        corp = corp_codes(d, tickers)
        for n, t in enumerate(tickers):
            if time.time() - t0 > max_minutes * 60:
                stop = f"시간 한도 {max_minutes}분"
                break
            cur = raw["t"].setdefault(t, {"corp": corp.get(t), "done": [], "reps": {}})
            if full:
                cur.update({"done": [], "reps": {}})
                cur.pop("fs", None)
            cc = cur.get("corp") or corp.get(t)
            if not cc:
                cur["skip"] = "고유번호 없음"
                continue
            if "acc_mt" not in cur:
                cur["acc_mt"] = str(d.json("company.json", corp_code=cc).get("acc_mt") or "")
            if cur["acc_mt"] and cur["acc_mt"] != "12":
                cur["skip"] = f"결산월 {cur['acc_mt']}월(12월 결산만 받음)"
                continue
            cur.pop("skip", None)
            # 예전 판 값만 있는 보고서는 다시 받음(재무상태표·현금흐름 추가)
            done = set(x for x in cur["done"] if x not in cur["reps"] or cur["reps"][x].get("ver", 1) >= KR_VER)
            touched = False
            for y in range(2015, today.year + 1):
                for rc, mon, due in REPORTS:
                    tag = f"{y}-{rc}"
                    pend = dt.date(y, mon, 31 if mon in (3, 12) else 30)
                    if tag in done or (today - pend).days < 30:
                        continue  # 받았거나 아직 낼 때가 아님
                    items = None
                    for fs in ([cur["fs"]] if cur.get("fs") else ["CFS", "OFS"]):
                        j = d.json("fnlttSinglAcntAll.json", corp_code=cc, bsns_year=str(y), reprt_code=rc, fs_div=fs)
                        if j.get("status") == "000" and j.get("list"):
                            items = j["list"]
                            cur["fs"] = fs
                            break
                    if items:
                        cur["reps"][tag] = {"filed": int(str(items[0]["rcept_no"])[:8]), "v": kr_pick(items), "ver": KR_VER}
                        done.add(tag)
                        touched = True
                    elif tag in cur["reps"]:
                        done.add(tag)  # 다시 받으려 했는데 없으면 예전 값 유지
                    elif (today - pend).days > due + 30:
                        done.add(tag)  # 상장 전이거나 끝내 안 낸 보고서는 다시 묻지 않음
                    cur["done"] = sorted(done)
            cur["at"] = today.isoformat()
            if touched:
                rebuild(t)
            if n % 10 == 9:
                save()
    except DartStop as e:
        stop = str(e)
        if t and t in raw["t"] and raw["t"][t].get("reps"):
            rebuild(t)
    save()
    if changed:
        meta_p = os.path.join(DATA, "meta.json")
        meta = json.load(open(meta_p))
        meta["updated"] = pub["updated"]
        meta.setdefault("fund", {})["KR_STOCK"] = {"updated": pub["updated"], "tickers": sum(1 for v in pub["t"].values() if v.get("q")), "nodata": len(pub["nodata"])}
        json.dump(meta, open(meta_p, "w"), ensure_ascii=False, indent=1)
    print(f"KR: 호출 {getattr(d, 'calls', 0)}, 바뀜 {changed}, 자료 있음 {sum(1 for v in pub['t'].values() if v.get('q'))}종목" + (f", 멈춤: {stop}" if stop else ""))


def probe_kr(arg):
    """한 회사·한 보고서의 계정 목록을 찍어 본다(키는 찍지 않음): --kr-probe 005930:2024:11012"""
    key = os.environ.get("DART_API_KEY", "").strip()
    if not key:
        print("DART_API_KEY 없음"); return
    code, year, rc = (arg.split(":") + ["2024", "11012"])[:3]
    d = Dart(key, 20)
    corp = corp_codes(d, [code]).get(code)
    for fs in ("CFS", "OFS"):
        j = d.json("fnlttSinglAcntAll.json", corp_code=corp, bsns_year=year, reprt_code=rc, fs_div=fs)
        if j.get("status") == "000" and j.get("list"):
            print(f"{code} {year} {rc} {fs} 접수 {j['list'][0].get('rcept_no')}")
            for x in j["list"]:
                if x.get("sj_div") in ("BS", "CF", "IS", "CIS"):
                    print(f"  {x.get('sj_div'):3} {x.get('account_id','')[:60]:60} {NM(x.get('account_nm'))[:24]:24} 당기={x.get('thstrm_amount')} 누적={x.get('thstrm_add_amount')}")
            v = kr_pick(j["list"])
            print("뽑은 값:", json.dumps(v, ensure_ascii=False))
            return
    print("자료 없음", j.get("status"), j.get("message"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kr-probe", help="국내 계정 확인: 종목코드:연도:보고서코드")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--us-only", action="store_true")
    ap.add_argument("--kr-only", action="store_true")
    ap.add_argument("--max-calls", type=int, default=15000, help="OpenDART 이번 실행 최대 호출(하루 2만 회 한도)")
    ap.add_argument("--max-minutes", type=int, default=200)
    a = ap.parse_args()
    if a.kr_probe:
        return probe_kr(a.kr_probe)
    only = set(a.only) if a.only else None
    if not a.kr_only:
        run_us(full=a.full, only=only, limit=a.limit)
    if not a.us_only:
        run_kr(max_calls=a.max_calls, max_minutes=a.max_minutes, full=a.full, only=only)


if __name__ == "__main__":
    sys.exit(main())
