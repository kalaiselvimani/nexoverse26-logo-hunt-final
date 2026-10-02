import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
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

    const { answer } = await req.json();

    const answerText = String(answer || "").trim();

    if (!answerText) {
      return NextResponse.json(
        {
          success: false,
          error: "Answer is required.",
        },
        { status: 400 }
      );
    }

    // Get current event
    const { data: event, error: eventError } =
      await supabaseAdmin
        .from("events")
        .select(`
          id,
          active_question_id,
          buzzer_attempt,
          status
        `)
        .eq("id", s.eventId)
        .single();

    if (eventError) {
      throw eventError;
    }

    if (
      event.status !== "running" ||
      !event.active_question_id
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "No active question.",
        },
        { status: 409 }
      );
    }

    const questionId = event.active_question_id;
    const attemptNumber = event.buzzer_attempt;

    /*
      These queries are independent after the event
      is loaded, so run them in parallel.
    */
    const [
      { data: myBuzz, error: buzzError },
      { data: answers, error: answersError },
      { data: buzzes, error: buzzesError },
    ] = await Promise.all([
      supabaseAdmin
        .from("buzzes")
        .select(`
          id,
          participant_id,
          attempt_number,
          priority
        `)
        .eq("question_id", questionId)
        .eq("participant_id", s.participantId)
        .eq("attempt_number", attemptNumber)
        .maybeSingle(),

      supabaseAdmin
        .from("answers")
        .select(`
          participant_id,
          result
        `)
        .eq("question_id", questionId)
        .eq("attempt_number", attemptNumber),

      supabaseAdmin
        .from("buzzes")
        .select(`
          participant_id,
          priority,
          attempt_number
        `)
        .eq("question_id", questionId)
        .eq("attempt_number", attemptNumber)
        .order("priority", {
          ascending: true,
        }),
    ]);

    if (buzzError) {
      throw buzzError;
    }

    if (answersError) {
      throw answersError;
    }

    if (buzzesError) {
      throw buzzesError;
    }

    if (!myBuzz) {
      return NextResponse.json(
        {
          success: false,
          error: "You have not buzzed for this question.",
        },
        { status: 403 }
      );
    }

    /*
      Check whether this participant already submitted
      an answer.

      This replaces the old extra database query.
    */
    const existingAnswer = (answers || []).find(
      (a) =>
        a.participant_id === s.participantId
    );

    if (existingAnswer) {
      return NextResponse.json(
        {
          success: false,
          error: "Answer already submitted.",
        },
        { status: 409 }
      );
    }

    /*
      Determine whose turn it is.

      The first participant whose answer is missing
      or still pending gets the current turn.
    */
    let currentParticipantId: string | null = null;

    for (const buzz of buzzes || []) {
      const participantAnswer = (answers || []).find(
        (a) =>
          a.participant_id ===
          buzz.participant_id
      );

      if (
        !participantAnswer ||
        participantAnswer.result === "pending"
      ) {
        currentParticipantId =
          buzz.participant_id;

        break;
      }
    }

    if (
      currentParticipantId !==
      s.participantId
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "It is not your turn to answer.",
        },
        { status: 403 }
      );
    }

    /*
      Insert pending answer.
      Organiser will judge it.
    */
    const { error: insertError } =
      await supabaseAdmin
        .from("answers")
        .insert({
          question_id: questionId,
          participant_id: s.participantId,
          attempt_number: attemptNumber,
          answer_text: answerText,
          result: "pending",
        });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({
      success: true,
      message: "Answer submitted successfully.",
    });
  } catch (e) {
    console.error("ANSWER ERROR", e);

    return NextResponse.json(
      {
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Answer could not be submitted.",
      },
      {
        status: 500,
      }
    );
  }
}