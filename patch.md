# Patch Notes

## v1.9

- Budget: per-tab category selection saved per scope (공용/카테고리) and synced across devices.
- Budget: monthly total is now the sum of category budgets (removed direct monthly input).
- Budget: floating save button and parent > child labels in tabs, sheets, and budget list.
- Stats: member/asset breakdown now supports "더보기" toggles like category breakdown.

### v1.9 (한국어)

- 예산: 공용/카테고리 탭별 선택 카테고리를 저장하고 기기간 동기화.
- 예산: 월 예산 입력 제거, 카테고리 예산 합계로 총 예산 표시.
- 예산: 저장 버튼을 우측 하단 플로팅으로 변경, 부모 > 자식 라벨 표기.
- 통계: 구성원/자산 지출도 더보기 토글 지원.

## v1.8

- Settings: CSV import section is collapsible and loads on demand.
- Settings: data reset modal shows per-option delete count previews.
- Settings: settings changes now use toasts only (no notification spam).
- Stats/Budget: personal-only categories include `budgetApplied` entries in common view; personal-only tabs show only your entries.
- Transactions: list/search rendering optimized with memoized cards + pagination ("더보기").
- Notifications: pagination fixed and timeline list renders correctly with "더보기".
- Hooks: cache subscriptions for categories/subjects/payment methods to reduce duplicate listeners.
- Stats: range sheet quick buttons fixed and month-end uses per-range context.
- Dark mode: header/menu contrast and global text/background overrides for readability.

### v1.8 (한국어)

- 설정: CSV 가져오기 섹션을 접기/펼치기로 변경하고 열 때만 로딩.
- 설정: 데이터 초기화 모달에 항목별 삭제 건수 미리보기 표시.
- 설정: 설정 변경은 토스트만 사용(알림 누적 방지).
- 통계/예산: personalOnly 카테고리의 `budgetApplied`는 공용에 포함, personalOnly 탭은 본인 내역만 표시.
- 내역: 리스트/검색 렌더링 최적화(메모 카드) + 더보기 페이징 적용.
- 알림: 타임라인 목록/더보기 페이징 정상화.
- 훅: 카테고리/주체/결제수단 구독 캐시로 중복 리스너 감소.
- 통계: 조회 기간 시트의 빠른 범위 버튼 오류 수정.
- 다크모드: 헤더/메뉴 대비 및 전역 텍스트/배경 가독성 보정.

## v1.7

- Transactions: keep category/payment values when editing another user's entry; default subject to your nickname when available.
- Transactions: search sheet now scrolls as a whole so filters are reachable on mobile.
- Stats: headers switch to "입금/지출" based on view type; range confirm button text is now readable.
- Budget: monthly budget input is per tab (공용/카테고리) and month navigator matches the stats layout.
- Tooling: add backfill scripts for `budgetEnabled` and `budgetApplied`, plus admin deps.

### v1.7 (한국어)

- 내역: 다른 사람 내역 편집 시 카테고리/결제수단 값 유지; 주체 기본값을 내 닉네임으로 설정.
- 내역: 검색 시트가 전체 스크롤되어 모바일에서 필터 접근 가능.
- 통계: 입금/지출에 따라 섹션 제목 전환, 조회 완료 버튼 텍스트 가독성 개선.
- 예산: 공용/카테고리 탭별 월 예산 입력 적용, 월 이동 UI를 통계와 동일한 배치로 정렬.
- 도구: `budgetEnabled`/`budgetApplied` 백필 스크립트 추가 및 admin 의존성 추가.

## v1.6

- Categories: add “personal only” flag for expense categories and honor it across transactions, stats, and budget views.
- Transactions: allow budgetApplied=true items from personal categories to show in list/calendar for both users.
- Notifications: suppress personal-only transaction alerts; unify transaction create/update/delete message format.
- Notifications: add timeline separators (today/yesterday/older).

### v1.6 (한국어)

- 카테고리: 지출 카테고리에 “내역 비공개(본인만 보기)” 플래그 추가, 내역/통계/예산 화면에 반영.
- 내역: personalOnly 카테고리라도 budgetApplied=true 항목은 양쪽 리스트/달력에서 표시.
- 알림: 개인 카테고리 내역 알림 제외, 내역 추가/수정/삭제 메시지 포맷 통일.
- 알림: 타임라인 구분선(오늘/어제/이전) 추가.

## v1.5

- Stats/Budget: add budget category tabs (common + budget categories with overflow sheet).
- Stats/Budget: budget-enabled categories are excluded from the common tab and shown only in their category tabs.
- Budget: budgetApplied=true is treated as income within budget category tabs; removed “budget load complete” notifications.

### v1.5 (한국어)

- 통계/예산: 예산 카테고리 탭(공용 + 예산 카테고리, 더보기 시트) 추가.
- 통계/예산: 예산 카테고리는 공용 탭에서 제외하고 해당 카테고리 탭에서만 표시.
- 예산: budgetApplied=true는 카테고리 탭에서 수입으로 집계, “예산 불러오기 완료” 알림 제거.

## v1.4

- Stats: show active filter summary under filter chips, store filters without effect warnings, and increase swipe threshold to 150px.
- Notifications: add “more/less” toggle for long messages and log invite create/expire/accept events.
- Transactions: add list sort toggle (input/alpha/category) and show category selection grouped by parent/child with default expanded state.
- Dashboard: recent transactions sorted newest-first using created time when available.
- Date parsing: custom range/URL date parsing uses local timezone via date-fns `parse`.

### v1.4 (한국어)

- 통계: 필터 칩 아래에 선택 요약 표시, 필터 저장/로드 경고 제거, 스와이프 임계값 150px로 상향.
- 알림: 긴 메시지 더보기/접기 추가, 초대 코드 생성/만료/참여 알림 기록.
- 내역: 정렬 토글(입력순/가나다순/카테고리순) 추가, 카테고리 선택을 대분류/소분류 그룹(기본 펼침)으로 개선.
- 대시보드: 최근 내역을 최신 우선으로 정렬(입력 시간 기준 우선).
- 날짜 파싱: 커스텀 범위/URL 날짜를 로컬 타임존 기준으로 해석.

## v1.3

- Amount inputs show comma separators while typing on new/edit transaction forms.
- Swipe threshold increased for calendar/statistics to prevent accidental month changes.
- Payment owner labels now align with each spouse nickname in payment edit and category tabs.

### v1.3 (한국어)

- 내역 추가/수정 금액 입력 시 콤마 표기 적용.
- 달력/통계 스와이프 임계값 상향(의도치 않은 월 변경 방지).
- 결제수단 탭/편집 화면에서 배우자 닉네임 표시 일치하도록 수정.

## v1.2

- Invites: public invite lookup with stricter rules and fixed join flow for non-members.
- Settings: persistent invite code until expiry with remaining-time display; invite input card removed.
- Settings: show account email, fix partner nickname mapping across spouses.
- Users: store `id` field on profiles and add backfill script for existing users.
- Transactions: stabilize date param sync to avoid render loops.

### v1.2 (한국어)

- 초대 코드: 공개 조회 방식으로 전환, 권한 규칙 정리, 비멤버 참여 흐름 수정.
- 설정: 초대 코드 만료 전까지 유지 + 남은 시간 표시, 초대 코드 입력 카드 제거.
- 설정: 내 아이디(이메일) 표시, 서로 다른 닉네임 매핑 오류 수정.
- 사용자: `users` 문서에 `id` 저장, 기존 데이터 백필 스크립트 추가.
- 내역: 날짜 파라미터 동기화 안정화(렌더 루프 방지).

## v1.1

- Budget dashboard: monthly detail with top-category spend, budget save/load to Firestore, and category budgets with progress.
- Budget inputs format with thousand separators and save/load success notifications.
- Settings: add invite code join card with success notification.
- Transactions: scrollable sheets for category/subject/payment in new/edit pages.
- Transactions edit: preselect payment owner tab matching existing payment.
- Stats: persist selected month and filters across refresh.

### v1.1 (한국어)

- 예산 화면: 월별 상세(상위 카테고리 지출), Firestore 저장/불러오기, 카테고리별 예산+진행률 추가.
- 예산 입력 콤마 포맷 및 저장/불러오기 알림 기록.
- 설정에 초대 코드 입력/참여 카드 추가(성공 알림 포함).
- 내역 추가/수정 시 카테고리·주체·결제수단 시트 스크롤 적용.
- 내역 수정 시 기존 결제수단 소유 탭 자동 선택.
- 통계 탭: 선택 월/필터 새로고침 유지.

## v1.0

- Added notifications page and per-user read status, with TTL-based cleanup (requires Firestore TTL on `expiresAt`).
- Added unread notifications badge (count) and auto-mark as read on entering notifications; removed the "Mark all read" button.
- Reworked transactions calendar + list layout and search sheet (type, date presets, range).
- Linked new/edit transactions to return to the edited date on the calendar.
- Updated memos to support multiple entries with per-entry delete and date/time display.
- Added settings tools: category link, payment methods editor page, and data reset options.

### v1.0 (한국어)

- 알림 페이지 추가 및 사용자별 읽음 처리, TTL 기반 자동 삭제(`expiresAt` 필드 TTL 설정 필요).
- 알림 미읽음 배지(숫자) 추가 및 알림 진입 시 자동 읽음 처리, "모두 읽음" 버튼 제거.
- 내역 달력+리스트 레이아웃 및 검색 시트(유형/기간 프리셋/기간 선택) 개선.
- 새 내역/수정 저장 후 해당 날짜 달력으로 복귀.
- 메모를 다건 저장 방식으로 변경(항목별 삭제 및 날짜/시간 표시).
- 설정에 카테고리 링크, 결제수단 편집 페이지, 데이터 초기화 옵션 추가.
