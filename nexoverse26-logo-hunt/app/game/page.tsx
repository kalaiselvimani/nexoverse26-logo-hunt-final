"use client";

import { useEffect, useState } from "react";

type Game = {
  status: string;
  questionVisible: boolean;
  logoVisible: boolean;
  buzzerOpen: boolean;
  paused: boolean;

  question: any;

  myBuzz: any;

  canAnswer: boolean;

  currentPriority: number | null;
};

export default function Game() {
  const [g, setG] =
    useState<Game | null>(null);

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [answer, setAnswer] =
    useState("");

  async function load() {
    try {
      const r = await fetch(
        "/api/participant/state",
        {
          cache: "no-store",
        }
      );

      const d =
        await r.json().catch(
          () => null
        );

      if (r.ok) {
        setG(d.game);
        setError("");
      } else {
        setError(
          d?.error ||
            "Game state unavailable"
        );
      }
    } catch {
      setError(
        "Unable to connect to game server."
      );
    }
  }

  useEffect(() => {
  let stopped = false;
  let loading = false;

  async function poll() {
    if (stopped || loading) return;

    loading = true;

    try {
      await load();
    } finally {
      loading = false;
    }
  }

  poll();

  const t = setInterval(poll, 1500);

  return () => {
    stopped = true;
    clearInterval(t);
  };
}, []);

  async function buzz() {
  setBusy(true);
  setError("");

  try {
    const r = await fetch(
      "/api/game/buzz",
      {
        method: "POST",
      }
    );

    const d =
      await r.json().catch(
        () => null
      );

    if (!r.ok) {
      setError(
        d?.reason ||
          d?.error ||
          "Buzz failed"
      );

      setBusy(false);
      return;
    }

    // First accepted buzz already gets
    // its priority in the database.
    // Wait for fresh game state before
    // showing BUZZ NOW again.
    await load();
  } catch {
    setError(
      "Unable to connect to game server."
    );
  }

  setBusy(false);
}
  async function submit() {
    if (!answer.trim()) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const r = await fetch(
        "/api/game/answer",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            answer,
          }),
        }
      );

      const d =
        await r.json().catch(
          () => null
        );

      if (!r.ok) {
        setError(
          d?.error ||
            "Answer failed"
        );
      } else {
        setAnswer("");
      }
    } catch {
      setError(
        "Unable to connect to game server."
      );
    }

    setBusy(false);

    await load();
  }

  if (!g) {
    return (
      <main className="shell center">
        <div>
          Loading game...
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="top">
        <div className="brand">
  NEXOVERSE<span className="accent">'26</span> • BRAND STALKER • LOGO HUNT
</div>

        <div className="pill">
          {g.paused
            ? "PAUSED"
            : g.status.toUpperCase()}
        </div>
      </div>

      <div
        className="card"
        style={{
          maxWidth: 1000,
          margin: "35px auto",
        }}
      >
        <div className="tag">
  LOGO HUNT
</div>

{g.logoVisible &&
g.question?.logoUrl ? (
  <img
    className="logo"
    src={g.question.logoUrl}
    alt="Brand logo"
  />
) : (
  <div className="status">
    Waiting for organiser
    to reveal the logo...
  </div>
)}

        {/* BUZZ BUTTON */}

        {g.buzzerOpen &&
          !g.myBuzz && (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                padding: "35px",
              }}
            >
              <button
                className="bigbuzz"
                onClick={buzz}
                disabled={busy}
              >
                {busy
                  ? "BUZZING"
                  : "BUZZ NOW"}
              </button>
            </div>
          )}

        {/* PARTICIPANT HAS BUZZED */}

        {g.myBuzz && (
          <div
            className="status"
            style={{
              marginTop: 25,
            }}
          >
            <p>
              Your Priority:{" "}
              <b>
                #
                {
                  g.myBuzz
                    .priority
                }
              </b>
            </p>

            {/* CURRENT TURN */}

            {g.canAnswer ? (
              <>
                <h2>
                  🎯 YOUR TURN
                </h2>

                <div className="form">
                  <input
                    className="input"
                    value={answer}
                    onChange={(e) =>
                      setAnswer(
                        e.target.value
                      )
                    }
                    placeholder="Type your answer"
                    disabled={busy}
                  />

                  <button
                    className="btn primary"
                    onClick={submit}
                    disabled={
                      busy ||
                      !answer.trim()
                    }
                  >
                    Submit Answer
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>
                  🔒 BUZZER LOCKED
                </h2>

                {g.currentPriority && (
                  <p>
                    Current answer
                    priority: #
                    {
                      g.currentPriority
                    }
                  </p>
                )}

                <p>
                  Please wait for your
                  turn.
                </p>
              </>
            )}
          </div>
        )}

        {!g.buzzerOpen &&
          !g.myBuzz && (
            <div
              className="status"
              style={{
                marginTop: 25,
              }}
            >
              BUZZER CLOSED
            </div>
          )}

        {error && (
          <p className="error">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}