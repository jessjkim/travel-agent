import OpenAI from "openai";
import { NextResponse } from "next/server";

type TripState = {
  start_date?: string;
  end_date?: string;
  origin?: string;
  budget?: number;
  currency?: string;
  pace?: string;
  interests?: string[];
};

type RouteStop = {
  city: string;
  days: number;
  notes?: string;
};

type Activity = {
  title: string;
  time?: string;
  type?: string;
};

type DayPlan = {
  date?: string;
  city: string;
  activities: Activity[];
};

type UIState = {
  trip: TripState;
  route: RouteStop[];
  itinerary: DayPlan[];
  pending_questions: string[];
};

type SessionState = {
  messages: OpenAI.ChatCompletionMessageParam[];
  ui_state: UIState;
};

const defaultState: UIState = {
  trip: {
    currency: "USD",
    pace: "balanced",
  },
  route: [],
  itinerary: [],
  pending_questions: [
    "Share your dates, origin, and 2-3 must-see places to get started.",
  ],
};

const sessions = new Map<string, SessionState>();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

const systemPrompt = `
You are a travel planning agent that drafts itineraries and asks smart follow-ups.

Rules:
- Always respond with valid JSON: {"reply": string, "ui_state": object}
- Always include a full ui_state object in your response.
- Start with a high-level route (city order + days) before calling external tools.
- Use tools only after the user confirms the route or explicitly asks for prices/times.
- Keep replies concise and actionable.

The ui_state schema:
{
  "trip": {
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "origin": "string",
    "budget": number,
    "currency": "USD",
    "pace": "relaxed|balanced|packed",
    "interests": ["string"]
  },
  "route": [{"city": "string", "days": number, "notes": "string"}],
  "itinerary": [{"date": "YYYY-MM-DD", "city": "string", "activities": [{"title": "string", "time": "HH:MM", "type": "string"}]}],
  "pending_questions": ["string"]
}
`;

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "route_search",
      description: "Routes with travel time using Google Maps Directions",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          date: { type: "string" },
          time: { type: "string" },
          mode: {
            type: "string",
            enum: ["train", "bus", "ferry", "car", "mixed"],
          },
          limit: { type: "integer", default: 5 },
        },
        required: ["origin", "destination", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "place_search",
      description: "Find activities or attractions",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          location: { type: "string" },
          radius_km: { type: "integer", default: 10 },
          categories: { type: "array", items: { type: "string" } },
          limit: { type: "integer", default: 10 },
        },
        required: ["query", "location"],
      },
    },
  },
];

function getSession(sessionId?: string) {
  if (sessionId && sessions.has(sessionId)) {
    return { id: sessionId, session: sessions.get(sessionId)! };
  }

  const id = sessionId ?? crypto.randomUUID();
  const session = {
    messages: [],
    ui_state: defaultState,
  };
  sessions.set(id, session);
  return { id, session };
}

function safeParseJSON(content: string | null) {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function parseLatLng(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^\s*(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)\s*$/);
  if (!match) return null;
  return { lat: Number(match[1]), lng: Number(match[3]) };
}

function mapMode(mode: string) {
  if (mode === "car") return "driving";
  if (mode === "train" || mode === "bus" || mode === "ferry") return "transit";
  return "transit";
}

async function routeSearchAdapter(args: Record<string, unknown>) {
  if (!googleMapsApiKey) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY.");
  }

  const {
    origin,
    destination,
    date,
    time,
    mode = "mixed",
    limit = 5,
  } = args as {
    origin: string;
    destination: string;
    date: string;
    time?: string;
    mode?: string;
    limit?: number;
  };

  const directionsMode = mapMode(mode);
  const departureTime = date
    ? Math.floor(
        new Date(`${date}T${time ?? "09:00"}:00`).getTime() / 1000
      )
    : undefined;

  const params = new URLSearchParams({
    origin,
    destination,
    mode: directionsMode,
    key: googleMapsApiKey,
  });

  if (departureTime) {
    params.set("departure_time", String(departureTime));
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Directions failed (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as {
    routes?: Array<{
      summary?: string;
      legs?: Array<{
        duration?: { value: number };
        start_address?: string;
        end_address?: string;
      }>;
    }>;
  };

  const items =
    data?.routes?.slice(0, limit).map((route, index) => {
      const leg = route.legs?.[0];
      const durationMinutes =
        typeof leg?.duration?.value === "number"
          ? Math.round(leg.duration.value / 60)
          : null;
      return {
        id: `gmap-${index}`,
        type: "route",
        title: route.summary ?? `${origin} → ${destination}`,
        price: null,
        duration_minutes: durationMinutes,
        depart_at: null,
        arrive_at: null,
        stops: null,
        provider: "Google Maps",
        deep_link: null,
        meta: {
          start_address: leg?.start_address ?? null,
          end_address: leg?.end_address ?? null,
          mode: directionsMode,
        },
      };
    }) ?? [];

  return { items };
}

async function placeSearchAdapter(args: Record<string, unknown>) {
  if (!googleMapsApiKey) {
    throw new Error("Missing GOOGLE_MAPS_API_KEY.");
  }

  const {
    query,
    location,
    radius_km = 10,
    limit = 10,
  } = args as {
    query: string;
    location?: string;
    radius_km?: number;
    limit?: number;
  };

  const latLng = parseLatLng(location);
  const params = new URLSearchParams({
    key: googleMapsApiKey,
  });

  if (latLng) {
    params.set("query", query);
    params.set("location", `${latLng.lat},${latLng.lng}`);
    params.set("radius", String(radius_km * 1000));
  } else {
    params.set("query", location ? `${query} in ${location}` : query);
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Places failed (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as {
    results?: Array<{
      place_id: string;
      name: string;
      formatted_address?: string;
      rating?: number;
      user_ratings_total?: number;
      geometry?: { location?: { lat: number; lng: number } };
    }>;
  };

  const items =
    data?.results?.slice(0, limit).map((place) => ({
      id: place.place_id,
      type: "place",
      title: place.name,
      price: null,
      duration_minutes: null,
      depart_at: null,
      arrive_at: null,
      stops: null,
      provider: "Google Maps",
      deep_link: null,
      meta: {
        address: place.formatted_address ?? null,
        rating: place.rating ?? null,
        ratings_count: place.user_ratings_total ?? null,
        location: place.geometry?.location ?? null,
      },
    })) ?? [];

  return { items };
}

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
) {
  switch (toolName) {
    case "route_search":
      return await routeSearchAdapter(args);
    case "place_search":
      return await placeSearchAdapter(args);
    default:
      return { items: [], meta: { note: "Unknown tool call.", args } };
  }
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY." },
      { status: 500 }
    );
  }

  const body = await request.json();
  const message = (body?.message ?? "").trim();
  if (!message) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 }
    );
  }

  const { id, session } = getSession(body?.session_id);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt.trim() },
    {
      role: "system",
      content: `Current ui_state: ${JSON.stringify(session.ui_state)}`,
    },
    ...session.messages,
    { role: "user", content: message },
  ];

  let workingMessages = [...messages];
  let finalReply = "";
  let finalState = session.ui_state;

  for (let i = 0; i < 4; i += 1) {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: workingMessages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      workingMessages.push(assistantMessage);
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const args = safeParseJSON(toolCall.function.arguments) ?? {};
        let toolResult: unknown;
        try {
          toolResult = await handleToolCall(toolName, args);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Tool call failed.";
          toolResult = {
            items: [],
            meta: {
              note: message,
              args,
            },
          };
        }
        workingMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(toolResult),
        });
      }
      continue;
    }

    const parsed = safeParseJSON(assistantMessage.content);
    if (parsed?.reply && parsed?.ui_state) {
      finalReply = parsed.reply;
      finalState = parsed.ui_state;
    } else {
      finalReply =
        "I can help plan your trip, but I could not format the response. Try again with your dates and origin.";
      finalState = session.ui_state;
    }

    workingMessages.push({
      role: "assistant",
      content: assistantMessage.content ?? "",
    });
    break;
  }

  session.messages = workingMessages.filter((messageItem) => {
    return messageItem.role !== "system";
  });
  session.ui_state = finalState;
  sessions.set(id, session);

  return NextResponse.json({
    reply: finalReply,
    ui_state: finalState,
    session_id: id,
  });
}
