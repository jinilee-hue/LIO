# LIO 브랜드 투표 — JSONBin.io 셋업 가이드

CounterAPI v1의 CORS 문제로 인해 JSONBin.io로 전환합니다.
**가입 1회 + 두 줄 입력으로 즉시 작동합니다.**

---

## STEP 1 — JSONBin.io 가입 (1분)

1. **https://jsonbin.io** 접속 → 우측 상단 **Sign Up**
2. 이메일·비밀번호로 가입 (또는 Google·GitHub 로그인)
3. 이메일 인증 (받은 메일에서 confirm 링크 클릭)
4. 로그인 완료

> Free plan: 10,000 requests/month — 내부 20명 투표에 충분.

---

## STEP 2 — 새 Bin 만들기 (30초)

1. 로그인 후 좌측 메뉴 **Bins** 클릭
2. 우측 상단 **+ CREATE A BIN** 버튼 클릭
3. JSON 에디터에 정확히 다음 내용 입력 (복붙):

```json
{
  "1": 0,
  "2": 0,
  "3": 0,
  "4": 0,
  "5": 0
}
```

4. 우측 상단 **CREATE** 버튼 클릭
5. 생성된 bin 페이지로 이동되고, 주소창 URL이 다음과 같이 보임:
   ```
   https://jsonbin.io/68xxxxxxxxxxxxxxxxxx
   ```
   `/68...` 뒤의 **긴 문자열이 BIN ID**입니다. 복사해두세요.

---

## STEP 3 — Master Key 복사 (30초)

1. 좌측 메뉴 맨 아래 **API Keys** 클릭
2. **MASTER KEY** 섹션에서 키 복사 (`$2a$10$...` 형태로 시작하는 긴 문자열)

> Master Key는 한 사람당 한 개이고 영구적입니다.

---

## STEP 4 — HTML 파일에 붙여넣기 (1분)

`lio-design-system.html`을 텍스트 에디터로 열고, 파일 상단에서 다음 두 줄을 찾으세요:

```javascript
const JSONBIN_BIN_ID = 'YOUR_BIN_ID';
const JSONBIN_MASTER_KEY = 'YOUR_MASTER_KEY';
```

각각 STEP 2와 STEP 3에서 복사한 값으로 교체:

```javascript
const JSONBIN_BIN_ID = '68a1b2c3d4e5f6a7b8c9d0e1';
const JSONBIN_MASTER_KEY = '$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJK';
```

저장.

---

## STEP 5 — GitHub에 재업로드 (30초)

1. https://github.com/jinilee-hue/LIO 접속
2. `lio-design-system.html` 클릭 → 우상단 연필 아이콘(Edit) 또는 **Add file → Upload files**로 새 파일 업로드 (같은 이름이면 자동 교체)
3. **Commit changes**
4. 1~2분 후 https://jinilee-hue.github.io/LIO/lio-design-system.html 에서 반영

---

## STEP 6 — 동작 확인

1. https://jinilee-hue.github.io/LIO/lio-design-system.html 접속
2. 페이지 상단에 **노란 경고 배너 없음** 확인
3. 아무 디자인 카드에서 "이 디자인으로 결정하기" 버튼 클릭
4. **참여 1표** 표시 + 결과 차트 자동 표시되면 성공

**다른 사람이 다른 브라우저로 들어와서 투표하면 카운트가 누적**됩니다 (페이지 새로고침 또는 30초 polling으로 반영).

---

## 결과 확인 방법

**JSONBin 대시보드**:
- jsonbin.io → Bins → 본인 bin 클릭 → 현재 카운트 JSON 직접 확인

**또는 브라우저 URL**:
```
https://api.jsonbin.io/v3/b/[YOUR_BIN_ID]/latest
```
브라우저에 입력하면 인증 에러가 뜨지만, 페이지에서는 정상 작동하니 무시.

---

## 투표 초기화 (필요 시)

jsonbin.io 대시보드:
1. Bin 클릭 → 오른쪽 상단 **edit** 또는 직접 JSON 수정
2. 모든 값을 0으로 변경:
   ```json
   {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
   ```
3. **Update** 클릭

---

## 자주 묻는 질문

**Q. Master Key를 HTML에 넣으면 위험하지 않나요?**
A. 누구든 페이지 소스를 보면 키가 보입니다. 하지만:
- 다른 사람이 키로 할 수 있는 건 **이 특정 bin의 데이터 조작뿐** (다른 계정·다른 bin 접근 불가)
- 20명 내부 신뢰 환경에서는 사실상 안전
- 진짜 걱정되면 투표 끝나고 bin 삭제하면 됨

**Q. 동시에 두 명이 투표하면 어떻게 되나요?**
A. read-modify-write 방식이라 매우 드물게 둘 중 하나가 누락될 수 있습니다 (race condition). 20명이 동시에 한 클릭 누를 확률은 거의 0%라 문제 없습니다.

**Q. 무료 한도?**
A. JSONBin Free: 10,000 requests/month. 20명 × 페이지 polling 30초마다 × 회의 시간이라면 한도의 0.1%도 안 씁니다.

---

## 트러블슈팅

- **노란 배너 표시**: Step 4의 두 값이 아직 placeholder입니다.
- **"투표 처리 중 오류"**: Master Key가 잘못 복사됨. 따옴표 빠뜨림 또는 키 끝 부분 누락. JSONBin → API Keys에서 다시 복사.
- **카운트 안 올라감**: F12 → Console에서 정확한 에러 메시지 확인 후 알려주세요.

수고하셨습니다.
