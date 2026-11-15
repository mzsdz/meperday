# me/day

사진을 올리고 음식과 실제 먹은 양을 확인하는 식사 기록 앱. 기존 GitHub `mzsdz/meperday`, Vercel `meperday`, Supabase `xbclkxeexrhdqhxafuad`를 사용합니다.

## 실행과 검증

Node.js 24, `npm ci`, `.env.example`을 참고해 `.env.local` 설정 후 `npm run dev`.

- `npm run build`: Vite 운영 빌드
- `npm test`: 계산·EXIF·AI 스키마·개인 저장·기존 데이터 호환 검증
- `npm run test:e2e`: Chromium 모바일/데스크톱, 인증 경계와 저장 흐름
- `npx playwright install webkit` 후 `PLAYWRIGHT_WEBKIT=1 npm run test:e2e`: WebKit 포함
- 브라우저 테스트는 로컬 모드 및 모의 Supabase/AI 응답을 사용합니다. 실제 Google 계정 승인·실제 모델 정확도를 보증하지 않습니다.

## 현재 화면

**기록**: 오늘·이번 주(월–일)·이번 달(1일–말일) 섭취 kcal 합계. 날짜별 1st/2nd/3rd… 시간순 기록. 운동 kcal를 섭취 합계에서 빼지 않습니다. 최대 3장 업로드 후 먼저 개인 사진을 저장하고 음식별 분석 제안을 표시합니다. 제안은 선택·확인하기 전 섭취 합계에 반영되지 않습니다. 분석 실패 시 사진 보존 및 검색·직접 입력이 가능합니다.

**음식 확인**: AI 음식명/열량/기준 중량 제안 또는 자동완성 검색. 한 기록에 여러 음식 추가. 각 음식별 전부/1⁄2/1⁄3/1⁄4/한 입/두 입/세 입. 기준값을 보존해 재수정 때 비율을 중복 적용하지 않습니다. 한 입 기본 15g은 추정 가정이며 수정 가능합니다. 기준 중량이 없으면 입 단위의 열량도 미확인입니다. DB 음식 중량 변경은 100g 원본 값을 기준으로 영양소도 함께 환산합니다.

**관리**: 기본 탄수화물·단백질·지방·식이섬유·나트륨·포화지방·당류. + 점선 카드에서 검색하거나 전체 27항목을 보고 추가/숨기기. 기준도 수정 가능하며 계정 저널에 저장됩니다. 채우는 영양소는 녹색, 사용량 관리 항목은 갈색 계열. 미확인 정보는 0이 아니며 일부만 집계되면 표시합니다.

**몸무게**: 사진 필수. 체중계 숫자 OCR → 사용자 확인·수정 → 저장. 읽지 못하면 빈칸. 주간/월간 추이와 사진 기록. 숫자만으로 새 기록을 만들 수 없습니다.

## 데이터·분석 기준

- 원본 EXIF DateTimeOriginal의 달력 날짜·시각을 압축 전에 읽습니다. 시간대 변환이나 업로드 시각 대체가 없습니다. EXIF 없는 사진은 선택 날짜에 보관하고 시간은 빈칸입니다. GPS 미수집.
- `meday_journals.payload` JSONB 확장으로 `records[].items`, `suggestedItems`, `dashboard.nutrients/references`를 저장합니다. DB 스키마 변경이나 기존 데이터 삭제가 없습니다. 기존 단일 음식 기록도 편집 가능합니다. 과거 대화/식전후 연결은 데이터와 서버 호환을 유지하고, 화면은 직접 확인 방식입니다.
- 기존 비공개 Storage, 소유자 RLS, revision 충돌 검사를 그대로 사용합니다. 영양정보 없는 수치, 안 읽힌 체중은 null.
- Google 로그인이 기본. 로그인 전 기기 저장 및 로그인 후 기존 설정의 기기 기록 가져오기를 지원합니다.
- AI는 기존 Vercel AI Gateway/OIDC, 모델 환경변수 `AI_GATEWAY_MODEL`을 사용합니다. 기본 `openai/gpt-4o-mini`. `meal`/`weight` 구조화 출력과 서버 스키마 검증 추가. 기존 `food`/`exercise`/대화 API 호환 유지. 계정별 한국 날짜 하루 20회 한도, 분석 무료·포인트 중단 상태 유지.

## 국내 음식 검색 데이터

`public/foods.json`: 식품의약품안전처 **식품영양성분 데이터베이스(K-FCDB)**, 음식 DB 2026-08-28 공개판에서 100g 기준이며 출처가 명확한 외식/가정식 1,252건을 가공했습니다. 모든 국내 제품을 포함한 실시간 검색은 아닙니다. 동일 음식도 조리법·중량에 따라 실제 값이 달라집니다. 값과 출처 URL, 원본 100g 기준을 보존하고, 없는 영양소를 추정하여 채우지 않습니다. mL를 g으로 간주하지 않아 100mL 기준 행은 제외합니다.

- 출처: https://various.foodsafetykorea.go.kr/nutrient/general/down/historyList.do
- 갱신: 공식 음식 DB XLSX 다운로드 후 `python scripts/import-foods.py <xlsx 경로>`
- 기준량: 식품 등의 표시·광고에 관한 법률 시행규칙 별표 5, 1일 영양성분 기준치. 개인 권장섭취량·의학적 상한량과 다르며 화면에 고지합니다.
- 당류는 총당류입니다. 첨가당·혈당·노화점수로 해석하지 않습니다.

## 배포와 공유

기존 GitHub PR/CI → 기존 Vercel 프로젝트 배포. `public/social.png` 1200×630 및 canonical/Open Graph/Twitter 메타데이터 유지. 사이트 제목 `me/day`. 개인 기록은 공유 이미지에 넣지 않습니다.

대화형 UI의 과거 구현 설명은 `docs/legacy-concierge.md`에 보존했습니다. 과거 UI 전용 브라우저 테스트는 새 기록/관리/몸무게 테스트로 교체했으며 계산·서버·기존 기록 호환 단위 테스트는 유지합니다.
