// Edge function: транскрипция видео через ElevenLabs Scribe
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ScribeWord {
  text: string;
  start: number;
  end: number;
  type?: string;
  speaker_id?: string;
}

interface ScribeResponse {
  text: string;
  words?: ScribeWord[];
  language_code?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY не настроен" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth client to identify user
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id } = await req.json();
    if (!project_id) {
      return new Response(JSON.stringify({ error: "project_id обязателен" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client to bypass RLS for status updates and storage
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: project, error: projErr } = await admin
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: "Проект не найден" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!project.video_path) {
      return new Response(JSON.stringify({ error: "Видео не загружено" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status
    await admin.from("projects").update({ status: "transcribing" }).eq("id", project_id);

    // Get signed URL for the video file
    const { data: signed, error: signErr } = await admin.storage
      .from("videos")
      .createSignedUrl(project.video_path, 3600);

    if (signErr || !signed) {
      throw new Error(`Не удалось получить ссылку на видео: ${signErr?.message}`);
    }

    // Download video into edge function memory
    console.log("Downloading video from", signed.signedUrl);
    const videoRes = await fetch(signed.signedUrl);
    if (!videoRes.ok) throw new Error(`Скачивание видео не удалось: ${videoRes.status}`);
    const videoBlob = await videoRes.blob();
    console.log("Video size:", videoBlob.size);

    // Send to ElevenLabs Scribe
    const formData = new FormData();
    formData.append("file", videoBlob, "video.mp4");
    formData.append("model_id", "scribe_v2");
    formData.append("tag_audio_events", "false");
    formData.append("diarize", "false");
    // language_code оставляем пустым для авто-определения (поддержка любого языка)

    console.log("Calling ElevenLabs Scribe...");
    const scribeRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: formData,
    });

    if (!scribeRes.ok) {
      const errText = await scribeRes.text();
      console.error("Scribe error:", scribeRes.status, errText);
      throw new Error(`Транскрипция не удалась (${scribeRes.status}): ${errText.slice(0, 200)}`);
    }

    const transcript: ScribeResponse = await scribeRes.json();
    console.log("Transcript text length:", transcript.text?.length, "words:", transcript.words?.length);

    // Save subtitles (word-level)
    const words = (transcript.words ?? [])
      .filter((w) => w.type !== "spacing" && w.text.trim().length > 0)
      .map((w) => ({ text: w.text, start: w.start, end: w.end }));

    // Upsert subtitles row
    await admin.from("subtitles").delete().eq("project_id", project_id);
    await admin.from("subtitles").insert({
      project_id,
      user_id: user.id,
      words,
    });

    return new Response(
      JSON.stringify({
        success: true,
        text: transcript.text,
        word_count: words.length,
        language: transcript.language_code,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
    console.error("transcribe-video error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
