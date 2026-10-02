"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type GameData = {
  event?: {
    id?: string;
    code?: string;
    status?: string;
    active_question_id?: string | null;
    question_visible?: boolean;
    logo_visible?: boolean;
    buzzer_open?: boolean;
    paused?: boolean;
  };
  question?: {
    id?: string;
    question_text?: string;
    logo_url?: string | null;
  } | null;
  participants?: any[];
  buzzes?: any[];
  answers?: any[];
};

export default function LiveGame() {
  const [d, setD] = useState<GameData | null>(null);
  const [e, setE] = useState("");
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);

  async function load() {
    // Prevent overlapping requests
    if (loadingRef.current) return;

    loadingRef.current = true;

    try {
      const r = await fetch("/api/organiser/state", {
        cache: "no-store",
      });

      const x = await r.json().catch(() => null);

      if (!r.ok) {
        setE(
          x?.error ||
            `Unable to load game state (${r.status})`
        );
        return;
      }

      setD(x);
      setE("");
    } catch (error) {
      console.error("LIVE GAME LOAD ERROR:", error);

      setE(
        "Unable to connect to the game server. Please wait and try again."
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
  load();

  const timer = setInterval(() => {
    load();
  }, 1500);

  return () => {
    clearInterval(timer);
  };
}, []);

  async function act(action: string) {
    try {
      setE("");

      const r = await fetch(
        "/api/organiser/action",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
          }),
        }
      );

      const x = await r.json().catch(() => null);

      if (!r.ok) {
        setE(
          x?.error ||
            `Action failed (${r.status})`
        );
        return;
      }

      await load();
    } catch (error) {
      console.error(
        "LIVE GAME ACTION ERROR:",
        error
      );

      setE(
        "Unable to connect to the game server."
      );
    }
  }

  const event = d?.event;
  const question = d?.question;

  return (
    <main className="shell">
      <div className="top">
        <div>
          <div className="tag">
            NEXOVERSE'26 • LIVE CONTROL
          </div>

          <h1>Live Game</h1>
        </div>

        <Link
          className="btn"
          href="/organiser/dashboard"
        >
          Dashboard
        </Link>
      </div>

      {e && (
        <div className="card">
          <p className="error">{e}</p>
          <button
            className="btn"
            onClick={load}
          >
            Retry
          </button>
        </div>
      )}

      <div className="card">
        <p>
          Status:{" "}
          <b>
            {event?.status || "waiting"}
          </b>
        </p>

        <p>
          Game Code:{" "}
          <b>
            {event?.code || "NEXO26"}
          </b>
        </p>

        <h2>
          {loading
            ? "Loading game..."
            : question?.question_text ||
              "No active question"}
        </h2>

        {question?.logo_url &&
          event?.logo_visible && (
            <div style={{ margin: "20px 0" }}>
              <img
                src={question.logo_url}
                alt="Question logo"
                style={{
                  maxWidth: "320px",
                  maxHeight: "220px",
                  objectFit: "contain",
                }}
              />
            </div>
          )}

        <div className="actions">
          {[
  "start_game",
  "reveal_question",
  "reveal_logo",
  "open_buzzer",
  "close_buzzer",
  "previous_question",
  "next_question",
  "end_game",
].map((action) => (
            <button
              className="btn primary"
              key={action}
              onClick={() => act(action)}
            >
              {action
                .replaceAll("_", " ")
                .toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid2">
        <div className="card">
          <h2>Participants</h2>
          <p>
            Total:{" "}
            <b>
              {d?.participants?.length || 0}
            </b>
          </p>
        </div>

        <div className="card">
          <h2>Current Buzzes</h2>
          <p>
            Total:{" "}
            <b>
              {d?.buzzes?.length || 0}
            </b>
          </p>
        </div>

        <div className="card">
          <h2>Submitted Answers</h2>
          <p>
            Total:{" "}
            <b>
              {d?.answers?.length || 0}
            </b>
          </p>
        </div>
      </div>
    </main>
  );
}