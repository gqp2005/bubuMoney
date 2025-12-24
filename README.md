# bubuMoney

부부의 재테크 및 가계부 통합 관리 PWA.

## Setup

1) 의존성 설치
```
npm install
```

2) 환경변수 설정
```
cp .env.local.example .env.local
```

3) 개발 서버 실행
```
npm run dev
```

## Firebase

- Authentication: Email/Password 활성화
- Firestore: rules 및 indexes 배포
```
firebase deploy --only firestore:rules,firestore:indexes
```
