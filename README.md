# bubuMoney

부부의 재테크 및 가계부 통합 관리 PWA.

## v1.0

v1.0 baseline release.

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

## Vercel 배포

1) Vercel CLI 설치 및 로그인
```
npm i -g vercel
vercel login
```

2) 프로젝트 연결
```
vercel link --project bubumoney
```

3) 환경변수 설정 (.env.local 기준)
```
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production
vercel env add NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID production
```

4) 배포
```
vercel --prod
```

## GitHub Actions 자동 배포

사전 준비:
- Vercel 프로젝트가 GitHub 리포지토리와 연결되어 있어야 합니다.
- Vercel 토큰과 프로젝트/팀 정보가 필요합니다.

1) Vercel 토큰 발급
- https://vercel.com/account/tokens 에서 토큰 생성

2) 프로젝트 정보 확인
```
vercel project ls
vercel project inspect bubumoney
```

3) GitHub Secrets 등록 (Repo → Settings → Secrets and variables → Actions)
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

4) GitHub Actions 워크플로우 추가
`/.github/workflows/vercel.yml`
```yaml
name: Vercel Deploy

on:
  push:
    branches: [ "main" ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install Vercel CLI
        run: npm i -g vercel
      - name: Pull Vercel Env
        run: vercel env pull .env.local --yes --environment=production
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      - name: Build
        run: vercel build --prod --token ${{ secrets.VERCEL_TOKEN }}
      - name: Deploy
        run: vercel deploy --prebuilt --prod --token ${{ secrets.VERCEL_TOKEN }}
```
