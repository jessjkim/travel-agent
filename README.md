# Voyage Agent

An AI travel planning web app that drafts a high-level route first, then refines
with live transport and activity data.

## Getting started

1) Install dependencies:
```
npm install
```

2) Add your API keys:
```
OPENAI_API_KEY=sk-...
GOOGLE_MAPS_API_KEY=your_key
```
Create `./.env.local` with the key above.

3) Run the dev server:
```
npm run dev
```

Open http://localhost:3000

## Notes

- Routes use Google Maps Directions and places use Google Maps Places. Add your
  Google Maps API key in `.env.local`.
