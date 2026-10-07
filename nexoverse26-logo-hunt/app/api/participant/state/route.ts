import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const s = await requireParticipant();

    if (!s) {
      return NextResponse.json(
        {
          success: false,
          error: "Participant session required",
        },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 1. Get current event
    // --------------------------------------------------

    const { data: event, error: eventError } =
      await supabaseAdmin
        .from("events")
        .select(`
          id,
          code,
          status,
          active_round_id,
          active_question_id,
          question_visible,
          logo_visible,
          buzzer_open,
          paused,
          timer_started_at,
          timer_seconds,
          buzzer_attempt
        `)
        .eq("id", s.eventId)
        .single();

    if (eventError) {
      throw eventError;
    }

    // --------------------------------------------------
    // 2. No active question
    // --------------------------------------------------

    if (!event.active_question_id) {
      return NextResponse.json({
        success: true,

        game: {
          status: event.status,
          roundId: event.active_round_id,
          questionVisible: event.question_visible,
          logoVisible: event.logo_visible,
          buzzerOpen: event.buzzer_open,
          paused: event.paused,
          timerStartedAt: event.timer_started_at,
          timerSeconds: event.timer_seconds,
          currentPriority: null,
          canAnswer: false,
          question: null,
          myBuzz: null,
        },
      });
    }

    // --------------------------------------------------
    // 3. Load question + current attempt buzzes
    //    in parallel
    // --------------------------------------------------

    const [questionResult, buzzResult] =
      await Promise.all([
        supabaseAdmin
          .from("questions")
          .select(`
            id,
            round_id,
            question_text,
            logo_url,
            points,
            timer_seconds,
            sort_order
          `)
          .eq("id", event.active_question_id)
          .single(),

        supabaseAdmin
          .from("buzzes")
          .select(`
            id,
            participant_id,
            attempt_number,
            priority,
            created_at
          `)
          .eq(
            "question_id",
            event.active_question_id
          )
          .eq(
            "attempt_number",
            event.buzzer_attempt
          )
          .order("priority", {
            ascending: true,
          }),
      ]);

    if (questionResult.error) {
      throw questionResult.error;
    }

    if (buzzResult.error) {
      throw buzzResult.error;
    }

    const question = questionResult.data;
    const buzzes = buzzResult.data || [];

    // --------------------------------------------------
    // 4. If nobody has buzzed yet,
    //    DON'T query answers
    // --------------------------------------------------

    let answers: any[] = [];

    if (buzzes.length > 0) {
      const { data, error } =
        await supabaseAdmin
          .from("answers")
          .select(`
            id,
            participant_id,
            attempt_number,
            result,
            submitted_at
          `)
          .eq(
            "question_id",
            event.active_question_id
          )
          .eq(
            "attempt_number",
            event.buzzer_attempt
          )
          .order("submitted_at", {
            ascending: true,
          });

      if (error) {
        throw error;
      }

      answers = data || [];
    }

    // --------------------------------------------------
    // 5. Build latest answer lookup
    // --------------------------------------------------

    const answerMap = new Map<
      string,
      any
    >();

    for (const answer of answers) {
      const key =
        `${answer.participant_id}:${answer.attempt_number}`;

      // Answers are ordered ASC,
      // so latest answer overwrites previous answer.
      answerMap.set(key, answer);
    }

    // --------------------------------------------------
    // 6. Find current answer turn
    // --------------------------------------------------

    let currentBuzz: any = null;

    for (const buzz of buzzes) {
      const key =
        `${buzz.participant_id}:${buzz.attempt_number}`;

      const latestAnswer =
        answerMap.get(key);

      /*
        No answer
        -> participant gets turn.

        Pending
        -> participant still gets turn.

        Wrong / correct
        -> move to next priority.
      */

      if (
        !latestAnswer ||
        latestAnswer.result === "pending"
      ) {
        currentBuzz = buzz;
        break;
      }
    }

    // --------------------------------------------------
    // 7. Find this participant's buzz
    // --------------------------------------------------

    const myBuzz =
      buzzes.find(
        (buzz) =>
          buzz.participant_id ===
          s.participantId
      ) || null;

    let currentPriority: number | null =
      null;

    let canAnswer = false;

    if (currentBuzz) {
      currentPriority =
        currentBuzz.priority;

      canAnswer =
        currentBuzz.participant_id ===
        s.participantId;
    }

    // --------------------------------------------------
    // 8. Return game state
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      game: {
        status: event.status,

        roundId:
          event.active_round_id,

        questionVisible:
          event.question_visible,

        logoVisible:
          event.logo_visible,

        buzzerOpen:
          event.buzzer_open,

        paused:
          event.paused,

        timerStartedAt:
          event.timer_started_at,

        timerSeconds:
          event.timer_seconds,

        currentPriority,

        canAnswer,

        question: {
  id: question.id,

  // Question text must NEVER be sent to participants
  text: null,

  // Logo is sent only after organiser reveals it
  logoUrl:
    event.logo_visible
      ? question.logo_url
      : null,

  points:
    question.points,
},
        myBuzz:
          myBuzz
            ? {
                attemptNumber:
                  myBuzz.attempt_number,

                priority:
                  myBuzz.priority,
              }
            : null,
      },
    });
  } catch (e) {
    console.error(
      "PARTICIPANT STATE ERROR",
      e
    );

    return NextResponse.json(
      {
        success: false,

        error:
          e instanceof Error
            ? e.message
            : "Game state could not be loaded",
      },
      {
        status: 500,
      }
    );
  }
}