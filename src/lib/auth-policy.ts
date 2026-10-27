/**
 * 가입 정책.
 *
 * 이 가계부는 부부 두 사람만 사용하므로, 기본값은 "초대 전용"이다.
 * 초대코드 없이 새 가계부를 만드는 공개 회원가입은 차단된다.
 *
 * 새 가계부를 처음 만들어야 할 때만 환경변수로 잠시 열어준다.
 *   NEXT_PUBLIC_ALLOW_OPEN_SIGNUP=true
 * 작업이 끝나면 반드시 되돌릴 것.
 */
export const ALLOW_OPEN_SIGNUP =
  process.env.NEXT_PUBLIC_ALLOW_OPEN_SIGNUP === "true";
