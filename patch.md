# Patch Notes

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
