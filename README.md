# Voyage Agent

An AI travel planning web app that drafts a high-level route first, then refines
with live transport and activity data.

## Getting started

1) Install dependencies:
```
npm install
```

2) Add your API key:
```
OPENAI_API_KEY=sk-...
```
Create `./.env.local` with the key above.

3) Run the dev server:
```
npm run dev
```

Open http://localhost:3000

## Notes

- Live data adapters (flights, routes, places) are stubbed. Configure providers
  in `src/app/api/chat/route.ts`.
