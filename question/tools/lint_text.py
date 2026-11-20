#!/usr/bin/env python3
"""석스 질문 글 점검기. 석스님이 지적했던 문장 버릇을 기계적으로 찾아 준다.

사용: python3 lint_text.py answer.md body.md [다른 파일 ...]

찾은 것은 '고칠 후보'예요. 문맥상 괜찮으면 그대로 둬요(예: '34만 명 가운데 80%'의 '가운데'는 자연스러워요).
기계 검사가 깨끗해도, 마지막에는 사람(윤문 전문가·메인)이 소리 내어 읽고 '떼어 읽기'로 확인해요.
"""
import re, sys

RULES = [
    # (이름, 정규식, 설명)
    ('소제목 이름을 주어로', r'(과학|역사|경제|인문|세상|지정학)의 눈(은|는|이|가|과|와|도|으로|에서|에게)',
     "'○○의 눈은 ~했어요' 대신 의견 내용을 주어로 쓰거나 '○○ 전문가는'으로 써요."),
    ("'가운데'를 '중심' 뜻으로", r'가운데(에는|에 두|에 놓|에 둘| 주제|로 삼|를 차지|에 세)',
     "'중심', '대표', '~를 앞세우다'처럼 사람들이 실제로 쓰는 말로 바꿔요."),
    ('새 말 만들기', r'(이?라고 (불러요|부를게요|부르기로)|이?라고 이름 붙)',
     '새 이름을 만들지 말고 나올 때마다 뜻을 풀어 써요. 중간부터 읽는 사람은 그 이름을 몰라요.'),
    ('흐릿한 결론', r'쪽이 (더 )?맞아 보여요|쪽이 (더 )?나아 보여요',
     "'그래서 ~하는 편이 나아요. ~이기 때문이에요.'처럼 판단과 까닭을 분명히 써요."),
    ('번역투', r'에 있어서|[을를] 통해|이 요구된다|할 필요가 있|으로 인해|에 대한 [가-힣]+성',
     '쉬운 우리말로 풀어요.'),
    ('공개 금지어', r'석스|강원|과학부장|81년생|1981년생|담임',
     '공개되는 답에는 질문자를 알아볼 수 있는 말을 쓰지 않아요.'),
    ('낱말만 던진 굵은 이름표', r'\*\*[^*\n]{1,12}[^요?!]\.\*\*',
     "뜻이 바로 통하면 괜찮아요(예: '갖출 역량과 자격'). 낯선 말이 섞였거나 줄여서 뜻을 짐작해야 하면(예: '이름을 얻을 가운데 주제') 질문이나 완전한 문장으로 바꿔요."),
    ('설명 없는 비유 후보', r'들고 다닐|들고 갈 수 있는|무기는|밑천',
     '비유라면 바로 뒤에 무엇을 뜻하는지 구체적인 예를 붙였는지 확인해요.'),
]

FRAMES = [  # 같은 문장 틀 되풀이
    (r'가능성이 커요', 2, "'가능성이 커요'가 많아요. 사실은 '~했어요', 예측은 '~거예요'로 나눠 써요."),
    (r'맞아 보여요', 1, "'맞아 보여요'를 되풀이하지 않아요."),
    (r'^지금은 ', 1, "'지금은 ~'으로 시작하는 결론 문장이 되풀이돼요. 항목마다 자기 말로 맺어요."),
]

def sentences(line):
    return [s for s in re.split(r'(?<=[.?!])\s+', line.replace('**', '')) if s.strip()]

def main(paths):
    total = 0
    for path in paths:
        text = open(path, encoding='utf-8').read()
        lines = text.split('\n')
        print(f'===== {path}')
        for i, line in enumerate(lines, 1):
            if line.startswith('#'):
                continue  # 소제목 줄(#### 경제의 눈 등)은 건너뜀
            for name, pat, tip in RULES:
                for m in re.finditer(pat, line):
                    a, b = max(0, m.start() - 25), min(len(line), m.end() + 25)
                    print(f'  {i}행 [{name}] …{line[a:b]}…\n      → {tip}')
                    total += 1
            for s in sentences(line):
                plain = re.sub(r'\[\d+\]|\*\*', '', s)
                if len(plain) > 90 and not line.lstrip().startswith(('|', '-', '1', '2', '3', '4', '5', '6', '7', '8', '9')):
                    print(f'  {i}행 [긴 문장 {len(plain)}자] {plain[:60]}…\n      → 두 문장으로 나눌 수 있는지 봐요.')
                    total += 1
        for pat, limit, tip in FRAMES:
            n = len(re.findall(pat, text, flags=re.M))
            if n > limit:
                print(f'  [같은 틀 {n}번] {tip}')
                total += 1
        quotes = re.findall(r"'([^'\n]{2,14})'", text)
        if quotes:
            print(f"  [참고] 작은따옴표로 묶은 말 {len(quotes)}개: {', '.join(sorted(set(quotes))[:20])}")
            print('      → 남의 말을 옮긴 것이면 괜찮아요. 새로 만든 말이면 풀어 써요.')
    print(f'\n고칠 후보 {total}개')

if __name__ == '__main__':
    main(sys.argv[1:])
