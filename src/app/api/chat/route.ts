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
      name: "flight_search",
      description: "Search flights for a city pair and date",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          depart_date: { type: "string" },
          return_date: { type: "string" },
          adults: { type: "integer", default: 1 },
          cabin: {
            type: "string",
            enum: ["economy", "premium_economy", "business", "first"],
          },
          max_stops: { type: "integer", default: 1 },
          currency: { type: "string", default: "USD" },
          limit: { type: "integer", default: 5 },
        },
        required: ["origin", "destination", "depart_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "route_search",
      description: "Multi-modal routes with time/cost",
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
          currency: { type: "string", default: "USD" },
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

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
) {
  switch (toolName) {
    case "flight_search":
      return {
        items: [],
        meta: {
          note: "Configure Amadeus or Duffel to enable live flight search.",
          args,
        },
      };
    case "route_search":
      return {
        items: [],
        meta: {
          note: "Configure Rome2rio for multi-modal routes.",
          args,
        },
      };
    case "place_search":
      return {
        items: [],
        meta: {
          note: "Configure Google Places or Mapbox for POI results.",
          args,
        },
      };
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
        const toolResult = await handleToolCall(toolName, args);
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
