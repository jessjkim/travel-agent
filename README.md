# Travel Agent

An AI travel planning web app that gathers trip constraints, drafts a high-level
route, and then refines the plan with live transport times and activity data
from tool calls.

[screen-capture.webm](https://github.com/user-attachments/assets/0da5f8a9-cb9a-4d79-a8df-c481f1479b50)

## How the AI agent works

This app uses a single LLM (OpenAI GPT-4o) as an "agent" that can call tools.
The agent is instructed to:

- Collect trip constraints and propose a high-level route first.
- Ask for confirmation before making live data calls.
- Use tool calls for travel times and places after confirmation.
- Display itinerary

## Tools used

The agent uses tool calling to access external data:

- `route_search`: Google Maps Directions API for travel time between cities.
- `place_search`: Google Maps Places Text Search for activities/POIs.

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
