#!/usr/bin/env python3
"""국내 실적 수집기(OpenDART) 점검 — 인터넷 없이 가짜 응답으로: python3 tests/fund_kr_check.py"""
import importlib.util, io, json, os, shutil, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ff", os.path.join(HERE, "..", "tools", "fetch_fund.py"))
ff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ff)

ok = bad = 0
def check(c, msg):
    global ok, bad
    if c:
        ok += 1
    else:
        bad += 1
        print("실패:", msg)

# 가짜 회사: 000100(연결, 12월 결산), 000150(별도만), 000250(3월 결산)
def item(acc_id, nm, a, add=None, sj="IS", rcept="20240515000123"):
    return {"rcept_no": rcept, "sj_div": sj, "account_id": acc_id, "account_nm": nm, "thstrm_amount": a, "thstrm_add_amount": add, "ord": "1"}

def report(y, rc, q, cum, filed):
    """q/cum: (매출, 영업이익, 지배주주 순이익, EPS)"""
    r = f"{filed}000123"
    if rc == "11011":  # 사업보고서: 연간 값만
        return [item("ifrs-full_Revenue", "매출액", str(cum[0]), rcept=r), item("dart_OperatingIncomeLoss", "영업이익", str(cum[1]), rcept=r),
                item("ifrs-full_ProfitLossAttributableToOwnersOfParent", "지배기업의 소유주에게 귀속되는 당기순이익", str(cum[2]), rcept=r),
                item("ifrs-full_ProfitLoss", "당기순이익", str(cum[2] + 5), rcept=r),
                item("ifrs-full_BasicEarningsLossPerShare", "기본주당이익", str(cum[3]), rcept=r),
                item("ifrs-full_Assets", "자산총계", "999", sj="BS", rcept=r)]
    return [item("ifrs-full_Revenue", "매출액", f"{q[0]:,}", f"{cum[0]}", rcept=r), item("dart_OperatingIncomeLoss", "영업이익", str(q[1]), str(cum[1]), rcept=r),
            item("ifrs-full_ProfitLossAttributableToOwnersOfParent", "지배기업 소유주지분", str(q[2]), str(cum[2]), rcept=r),
            item("ifrs-full_BasicEarningsLossPerShare", "기본주당이익", str(q[3]), str(cum[3]), rcept=r)]

Q = {2023: [(100, 10, 8, 1.0), (110, 11, 9, 1.1), (120, 12, 10, 1.2), (130, -3, -2, -0.2)],
     2024: [(150, 20, 12, 1.5), (160, 22, 13, 1.6), (170, 25, 14, 1.7), (180, 26, 15, 1.8)]}
FILED = {"11013": "0515", "11012": "0814", "11014": "1114", "11011": "0320"}
def cum(y, n):
    return tuple(sum(Q[y][i][k] for i in range(n)) for k in range(4))

class Fake:
    calls = 0
    def raw(self, name, **p):
        self.calls += 1
        b = io.BytesIO()
        with zipfile.ZipFile(b, "w") as z:
            z.writestr("CORPCODE.xml", "<result>" + "".join(f"<list><corp_code>{c}</corp_code><corp_name>x</corp_name><stock_code>{s}</stock_code></list>" for s, c in [("000100", "00100000"), ("000150", "00150000"), ("000250", "00250000")]) + "<list><corp_code>00999999</corp_code><corp_name>비상장</corp_name><stock_code> </stock_code></list></result>")
        return b.getvalue()
    def json(self, name, **p):
        self.calls += 1
        cc = p.get("corp_code")
        if name == "company.json":
            return {"status": "000", "acc_mt": "03" if cc == "00250000" else "12"}
        y, rc, fs = int(p["bsns_year"]), p["reprt_code"], p["fs_div"]
        if y not in Q or (cc == "00150000" and fs == "CFS"):
            return {"status": "013", "message": "조회된 데이타가 없습니다."}
        n = {"11013": 1, "11012": 2, "11014": 3, "11011": 4}[rc]
        filed_y = y + 1 if rc == "11011" else y
        return {"status": "000", "list": report(y, rc, Q[y][n - 1], cum(y, n), f"{filed_y}{FILED[rc]}")}

tmp = tempfile.mkdtemp()
try:
    os.makedirs(os.path.join(tmp, "fund"))
    json.dump({"tickers": ["000100", "000150", "000250", "000270"]}, open(os.path.join(tmp, "monthly_KR_STOCK.json"), "w"))
    json.dump({"updated": "x"}, open(os.path.join(tmp, "meta.json"), "w"))
    ff.DATA, ff.FUND = tmp, os.path.join(tmp, "fund")
    f = Fake()
    ff.run_kr(fetcher=f)
    pub = json.load(open(os.path.join(tmp, "fund", "KR_STOCK.json")))
    q = pub["t"]["000100"]["q"]
    check(len(q) == 8, f"2023~2024 8분기 ({len(q)})")
    by = {r[0]: r for r in q}
    check(by[20231231][2:] == [130, -3, -2, -0.2], f"4분기 = 연간 − 3분기 누적 {by[20231231]}")
    check(by[20231231][1] == 20240320, "4분기 공시일 = 사업보고서 접수일")
    check(by[20240630][1] == 20240814 and by[20240630][2] == 160, "2분기 = 반기보고서 3개월 값")
    check(by[20240331][4] == 12, "순이익은 지배주주 귀속 우선")
    check(by[20240331][2] == 150, "쉼표가 있는 금액도 읽음")
    check(pub["t"]["000150"]["fs"] == "OFS" and len(pub["t"]["000150"]["q"]) == 8, "연결이 없으면 별도")
    check("000250" in pub["skip"] and "000250" not in pub["t"], "3월 결산은 뺌")
    check("000270" in pub["nodata"], "고유번호 없는 종목은 자료 없음")
    raw = json.load(open(os.path.join(tmp, "fund", "KR_raw.json")))
    check("2024-11011" in raw["t"]["000100"]["done"], "받은 보고서는 done에")
    meta = json.load(open(os.path.join(tmp, "meta.json")))
    check(meta.get("fund", {}).get("KR_STOCK", {}).get("tickers") == 2, "meta.json에 국내 실적 기록")
    # 두 번째 실행: 새로 받을 보고서가 없으면 호출이 거의 없어야 함(아직 안 낸 최근 보고서 확인만)
    f2 = Fake()
    ff.run_kr(fetcher=f2)
    check(f2.calls <= 3 * 4 * 2 + 3, f"증분: 이미 받은 보고서는 다시 묻지 않음(호출 {f2.calls})")
    # 키 문제면 멈춤(키를 화면에 찍지 않음)
    class BadKey(Fake):
        def json(self, name, **p):
            raise ff.DartStop("인증키 문제(010: 등록되지 않은 인증키입니다.)")
    ff.run_kr(fetcher=BadKey())
    check(json.load(open(os.path.join(tmp, "fund", "KR_STOCK.json")))["t"]["000100"]["q"] == q, "멈춰도 받아 둔 자료는 그대로")
finally:
    shutil.rmtree(tmp)
print(f"fund_kr: 통과 {ok} / 실패 {bad}")
sys.exit(1 if bad else 0)
