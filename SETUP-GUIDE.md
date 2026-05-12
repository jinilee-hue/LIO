# LIO 브랜드 투표 페이지 — GitHub 배포 가이드

내부용 20명 미만 투표 시스템입니다.
**가입·API 키 없이** 2분 안에 URL 발급받을 수 있습니다.

준비물:
- GitHub 계정 (이미 있을 거예요)
- `lio-design-system.html` 파일
- `logos/` 폴더

---

## STEP 1 — Namespace 정하기 (30초)

`lio-design-system.html` 파일을 텍스트 에디터(VS Code, 메모장 등)로 열고 파일 상단에서 이 줄을 찾으세요:

```javascript
const COUNTER_NS = 'lio-brand-vote-CHANGE-ME';
```

이 `'lio-brand-vote-CHANGE-ME'`를 **추측하기 어려운 unique 문자열**로 변경해주세요. 추천 예시:

```javascript
const COUNTER_NS = 'lio-vote-poly-x9k4p7m2';
```

> **왜 unique해야 하나요?**
> 누구나 `lio-brand-vote` 같은 흔한 namespace를 추측해서 카운트를 조작할 수 있습니다. 무작위 문자 몇 개를 섞으면 사실상 안전합니다 (이런 식의 obscurity는 내부 20명 정도에는 충분).

저장.

---

## STEP 2 — GitHub에 올리기 (1분)

### 옵션 A: 새 repository로 시작 (가장 단순)

1. https://github.com/new 접속
2. Repository name: `lio-vote` (자유)
3. Public 선택 (GitHub Pages 무료 사용)
4. **Create repository**
5. 다음 화면에서 **uploading an existing file** 클릭
6. `lio-design-system.html`과 `logos/` 폴더를 **드래그앤드롭**
7. **Commit changes** 클릭

### 옵션 B: 이미 있는 repo에 올리기

해당 repo로 가서 똑같이 파일 업로드 후 commit.

---

## STEP 3 — GitHub Pages 활성화 (30초)

1. Repository 페이지 상단 → **Settings**
2. 좌측 메뉴 → **Pages**
3. **Source**: `Deploy from a branch`
4. **Branch**: `main` (또는 `master`) / `/(root)` 선택
5. **Save** 클릭
6. 1~2분 후 페이지 상단에 URL이 표시됨:
   `https://your-username.github.io/lio-vote/lio-design-system.html`

이 URL을 팀에 공유하면 끝.

---

## (선택) 더 깔끔한 URL 만들기

파일명을 `lio-design-system.html` → `index.html`로 바꾸면 URL이 간단해집니다:
- 전: `https://username.github.io/lio-vote/lio-design-system.html`
- 후: `https://username.github.io/lio-vote/`

repository에서 파일명 변경 → commit → 1분 후 적용.

---

## 결과 확인 방법

**페이지 자체에서**:
- 상단 sticky bar에 실시간 총 투표 수 표시
- 본인 투표 후 즉시 1위 차트 표시
- 페이지를 다시 열거나 30초마다 자동으로 다른 사람 표 반영

**Counter 직접 확인**:
브라우저 주소창에 다음 URL 입력 (`your-ns` 부분만 본인 namespace로 교체):
```
https://api.counterapi.dev/v1/your-ns/candidate-1
https://api.counterapi.dev/v1/your-ns/candidate-2
https://api.counterapi.dev/v1/your-ns/candidate-3
https://api.counterapi.dev/v1/your-ns/candidate-4
https://api.counterapi.dev/v1/your-ns/candidate-5
```
각 후보의 현재 카운트가 JSON으로 표시됩니다.

---

## 투표 초기화 (필요 시)

브라우저 주소창에 한 번씩 입력하면 0으로 reset:
```
https://api.counterapi.dev/v1/your-ns/candidate-1/set?count=0
https://api.counterapi.dev/v1/your-ns/candidate-2/set?count=0
... (5번 후보까지)
```

---

## 자주 묻는 질문

**Q. 한 사람이 여러 번 투표할 수 있나요?**
A. 같은 브라우저에서는 한 표만 가능 (localStorage 차단). 다른 브라우저·시크릿 모드로 들어오면 추가 투표 가능 — 내부 신뢰 환경에 충분합니다.

**Q. 누가 카운트를 조작할까 걱정됩니다.**
A. namespace를 추측 어렵게 만들면 (Step 1) 사실상 안전합니다. 페이지 소스를 보면 namespace가 노출되긴 하지만, 내부 팀에 공유하는 URL이므로 문제 없습니다.

**Q. 실시간 업데이트는 어떻게 되나요?**
A. 페이지에 30초마다 자동 새로고침 + 창에 다시 포커스 들어오면 새로고침. 즉각 실시간은 아니지만 내부 회의 용도에 충분합니다.

**Q. 무료 한도가 있나요?**
A. CounterAPI 무료 무제한. 20명이 각자 한 번씩 투표하는 트래픽은 한도 근처에도 못 갑니다.

**Q. 결과를 보고서에 넣고 싶어요.**
A. 페이지 1위 카드를 스크린샷하시거나, 위의 "결과 확인 방법"에서 본 JSON 값을 직접 보시면 됩니다.

---

## 트러블슈팅

- **노란 경고 배너 표시**: Step 1의 `COUNTER_NS`가 아직 기본값 (`CHANGE-ME`) 상태입니다. 본인 unique 문자열로 변경하세요.
- **GitHub Pages URL이 404**: Settings → Pages에서 Source 설정 확인. Branch가 `main`이고 `/(root)`인지, Save 후 1~2분 대기.
- **로고가 안 보임**: `logos/` 폴더가 같이 업로드됐는지 확인.
- **투표 후 카운트가 안 올라감**: 브라우저 콘솔(F12)에서 에러 메시지 확인 후 알려주세요.

수고하셨습니다.
