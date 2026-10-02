import { NextResponse } from "next/server";
import { requireOrganiser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    if (!(await requireOrganiser())) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorised",
        },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 1. Get latest event
    // --------------------------------------------------

    const { data: event, error: eventError } =
      await supabaseAdmin
        .from("events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (eventError) {
      throw eventError;
    }

    if (!event) {
      return NextResponse.json({
        success: true,
        event: null,
        participants: [],
        question: null,
        buzzes: [],
        answers: [],
      });
    }

    // --------------------------------------------------
    // 2. Load question, participants, buzzes and answers
    //    in parallel
    // --------------------------------------------------

    const questionPromise = event.active_question_id
      ? supabaseAdmin
          .from("questions")
          .select("*")
          .eq("id", event.active_question_id)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        });

    const participantsPromise =
      supabaseAdmin
        .from("participants")
        .select(
          "id,name,department,status,score,buzz_wins,joined_at"
        )
        .eq("event_id", event.id)
        .order("joined_at", {
          ascending: true,
        });

    const buzzesPromise =
      event.active_question_id
        ? supabaseAdmin
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
            .order("created_at", {
              ascending: true,
            })
        : Promise.resolve({
            data: [],
            error: null,
          });

    const answersPromise =
      event.active_question_id
        ? supabaseAdmin
            .from("answers")
            .select(`
              id,
              participant_id,
              attempt_number,
              answer_text,
              result,
              submitted_at
            `)
            .eq(
              "question_id",
              event.active_question_id
            )
            .order("submitted_at", {
              ascending: true,
            })
        : Promise.resolve({
            data: [],
            error: null,
          });

    const [
      questionResult,
      participantsResult,
      buzzesResult,
      answersResult,
    ] = await Promise.all([
      questionPromise,
      participantsPromise,
      buzzesPromise,
      answersPromise,
    ]);

    // --------------------------------------------------
    // 3. Check errors
    // --------------------------------------------------

    if (questionResult.error) {
      throw questionResult.error;
    }

    if (participantsResult.error) {
      throw participantsResult.error;
    }

    if (buzzesResult.error) {
      throw buzzesResult.error;
    }

    if (answersResult.error) {
      throw answersResult.error;
    }

    const question =
      questionResult.data || null;

    const participants =
      participantsResult.data || [];

    const buzzes =
      buzzesResult.data || [];

    const answers =
      answersResult.data || [];

    // --------------------------------------------------
    // 4. Create participant lookup map
    // --------------------------------------------------

    const participantMap = new Map(
      participants.map((p) => [
        p.id,
        p,
      ])
    );

    // --------------------------------------------------
    // 5. Attach participant information to buzzes
    // --------------------------------------------------

    const buzzesWithParticipants =
      buzzes.map((b) => {
        const p =
          participantMap.get(
            b.participant_id
          );

        return {
          ...b,

          participants: p
            ? {
                name: p.name,
                department:
                  p.department,
              }
            : null,
        };
      });

    // --------------------------------------------------
    // 6. Attach participant information to answers
    // --------------------------------------------------

    const answersWithParticipants =
      answers.map((a) => {
        const p =
          participantMap.get(
            a.participant_id
          );

        return {
          ...a,

          participants: p
            ? {
                name: p.name,
                department:
                  p.department,
              }
            : null,
        };
      });

    // --------------------------------------------------
    // 7. Return organizer state
    // --------------------------------------------------

    return NextResponse.json({
      success: true,

      event,

      question,

      participants,

      buzzes:
        buzzesWithParticipants,

      answers:
        answersWithParticipants,
    });
  } catch (e) {
    console.error(
      "ORGANISER STATE ERROR",
      e
    );

    return NextResponse.json(
      {
        success: false,

        error:
          e instanceof Error
            ? e.message
            : "Organiser state could not be loaded",
      },
      {
        status: 500,
      }
    );
  }
}