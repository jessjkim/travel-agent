# Voyage Agent

An AI travel planning web app that drafts a high-level route first, then refines
with live transport and activity data.

## How the AI agent works

This app uses a single LLM (OpenAI GPT-4o) as an "agent" that can call tools.
The agent is instructed to:

- Collect trip constraints and propose a high-level route first.
- Ask for confirmation before making live data calls.
- Use tool calls for grounding (travel times and places) after confirmation.
- Always return a structured `ui_state` JSON so the UI updates predictably.

The backend orchestrates the loop:

1) User sends a message to `/api/chat`.
2) The server calls the LLM with tool schemas.
3) If the LLM requests a tool, the server runs it and feeds results back.
4) The LLM returns `{ reply, ui_state }`.
5) The UI renders the updated route, itinerary, and trip snapshot.

## Tools used

The agent uses tool calling to access external data:

- `route_search`: Google Maps Directions API for travel time between cities.
- `place_search`: Google Maps Places Text Search for activities/POIs.

Note: Google Maps does not provide flight pricing. Flights are out of scope for
this MVP and can be added later with a dedicated flight API.

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
- Export to CSV is available in the UI for Google Sheets import.
