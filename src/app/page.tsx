"use client";

import { useState, type FormEvent } from "react";
import styles from "./page.module.css";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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

const initialState: UIState = {
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

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Tell me your dates, origin city, budget, and a few must-see spots. I will draft a high-level route first.",
    },
  ]);
  const [uiState, setUiState] = useState<UIState>(initialState);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message: trimmed,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to reach the agent.");
      }

      const data = (await response.json()) as {
        reply: string;
        ui_state: UIState;
        session_id: string;
      };

      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
      setUiState(data.ui_state ?? uiState);
      setSessionId(data.session_id ?? sessionId);
    } catch (error) {
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            "I hit a snag reaching the planner. Double-check your API key and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const tripItems = [
    {
      label: "Dates",
      value:
        uiState.trip.start_date && uiState.trip.end_date
          ? `${uiState.trip.start_date} → ${uiState.trip.end_date}`
          : "Not set",
    },
    {
      label: "Origin",
      value: uiState.trip.origin ?? "Not set",
    },
    {
      label: "Budget",
      value: uiState.trip.budget
        ? `${uiState.trip.currency ?? "USD"} ${uiState.trip.budget}`
        : "Not set",
    },
    {
      label: "Pace",
      value: uiState.trip.pace ?? "Not set",
    },
    {
      label: "Interests",
      value:
        uiState.trip.interests && uiState.trip.interests.length > 0
          ? uiState.trip.interests.join(", ")
          : "Not set",
    },
  ];

  return (
    <div className={styles.page}>
      <header className={`${styles.header} ${styles.animIn}`}>
        <div className={styles.brand}>
          <div className={styles.brandMark} />
          <div className={styles.brandText}>
            <span className={styles.title}>Voyage Agent</span>
            <span className={styles.subtitle}>
              A single-LLM travel companion that drafts, validates, and refines
              your itinerary with live transport data.
            </span>
          </div>
        </div>
        <div className={styles.chipRow}>
          <span className={styles.chip}>LLM + tools</span>
          <span className={styles.chip}>Global routes</span>
          <span className={styles.chip}>Search-only</span>
        </div>
      </header>

      <section className={styles.layout}>
        <div className={`${styles.card} ${styles.chat} ${styles.animIn}`}>
          <div className={styles.cardTitle}>
            <h2>Trip planner chat</h2>
            <span>Live session</span>
          </div>
          <div className={styles.chatLog}>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`${styles.msg} ${
                  message.role === "user" ? styles.msgUser : ""
                }`}
              >
                <span className={styles.msgRole}>{message.role}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
          <form className={styles.inputRow} onSubmit={handleSubmit}>
            <textarea
              className={styles.textarea}
              placeholder="Example: Aug 1–10 from NYC, budget $2k, want Tokyo + Kyoto, love food and temples."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <button className={styles.button} type="submit" disabled={loading}>
              {loading ? "Planning..." : "Send"}
            </button>
          </form>
        </div>

        <div className={`${styles.card} ${styles.animIn}`}>
          <div className={styles.cardTitle}>
            <h2>Trip constraints</h2>
            <span>Snapshot</span>
          </div>
          <div className={styles.infoList}>
            {tripItems.map((item) => (
              <div key={item.label} className={styles.cost}>
                <span>{item.label}</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${styles.card} ${styles.animIn}`}>
          <div className={styles.cardTitle}>
            <h2>Route draft</h2>
            <span>High level</span>
          </div>
          {uiState.route.length === 0 ? (
            <p className={styles.emptyState}>
              Once you confirm the route, I will fetch real travel times and
              prices for each leg.
            </p>
          ) : (
            <div className={styles.routeList}>
              {uiState.route.map((stop) => (
                <div key={stop.city} className={styles.routeItem}>
                  <span className={styles.routeCity}>{stop.city}</span>
                  <span className={styles.routeDays}>{stop.days} days</span>
                </div>
              ))}
            </div>
          )}
          {uiState.pending_questions.length > 0 && (
            <div className={styles.routeList}>
              {uiState.pending_questions.map((question) => (
                <div key={question} className={styles.routeItem}>
                  <span>{question}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${styles.card} ${styles.animIn}`}>
          <div className={styles.cardTitle}>
            <h2>Itinerary preview</h2>
            <span>Draft</span>
          </div>
          {uiState.itinerary.length === 0 ? (
            <p className={styles.emptyState}>
              Your day-by-day plan will appear here after the route is locked.
            </p>
          ) : (
            <div className={styles.itineraryList}>
              {uiState.itinerary.map((day) => (
                <div key={`${day.city}-${day.date}`} className={styles.dayCard}>
                  <div className={styles.dayTitle}>
                    {day.date ? `${day.date} · ${day.city}` : day.city}
                  </div>
                  {day.activities.map((activity, index) => (
                    <div
                      key={`${activity.title}-${index}`}
                      className={styles.activity}
                    >
                      <span>{activity.title}</span>
                      <span>{activity.time ?? activity.type ?? "Flex"}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
