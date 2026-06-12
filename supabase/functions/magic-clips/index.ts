// Magic Clips: AI находит лучшие viral-моменты в длинном видео по транскрипту
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface Word { text: string; start: number; end: number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

  let projectId: string | null = null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    if (!LOVABLE_KEY) throw new Error("LOVABLE_API_KEY не настроен");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    projectId = body.project_id;
    const clipCount = Math.min(8, Math.max(3, Number(body.clip_count) || 5));

    const { data: project } = await admin.from("projects").select("*")
      .eq("id", projectId).eq("user_id", user.id).single();
    if (!project) throw new Error("Проект не найден");

    const { data: subs } = await admin.from("subtitles").select("words").eq("project_id", projectId).maybeSingle();
    const words = (subs?.words ?? []) as Word[];
    if (!words.length) throw new Error("Сначала нужна транскрипция видео");

    await admin.from("projects").update({ status: "analyzing", error_message: null }).eq("id", projectId);

    const duration = Number(project.duration) || words[words.length - 1]?.end || 0;
    const fullText = words.map((w) => w.text).join(" ");

    // Таймкоды каждые ~30 сек для ориентира AI
    const timeline: string[] = [];
    let bucket: Word[] = [];
    for (const w of words) {
      bucket.push(w);
      if (bucket.length && w.end - bucket[0].start >= 25) {
        timeline.push(`[${bucket[0].start.toFixed(1)}s–${w.end.toFixed(1)}s] ${bucket.map((x) => x.text).join(" ")}`);
        bucket = [];
      }
    }
    if (bucket.length) {
      timeline.push(`[${bucket[0].start.toFixed(1)}s–${bucket[bucket.length - 1].end.toFixed(1)}s] ${bucket.map((x) => x.text).join(" ")}`);
    }

    const systemPrompt = `Ты — AI-редактор viral-контента. Из длинного видео (${duration.toFixed(0)} сек) выбери ровно ${clipCount} лучших фрагмента для вертикальных шортсов (Reels/TikTok/Shorts).

Правила:
- Каждый клип 15–60 секунд
- start/end — точные секунды по таймлайну транскрипта
- Клипы не пересекаются
- Первые 1–2 сек каждого клипа = сильный hook (вопрос, провокация, инсайт)
- viral_score 0–100 — потенциал виральности
- title — цепляющее название клипа (до 60 символов)
- hook — первая фраза-крючок
- reason — почему этот момент зайдёт (1 предложение)
- Приоритет: эмоции, инсайты, провокации, практическая польза
- Язык — как в оригинале

Верни строго JSON: {"clips":[{"start":0,"end":45,"title":"...","hook":"...","viral_score":85,"reason":"..."}]}`;

    const aiRes = await fetch(LOVABLE_AI, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Таймлайн:\n${timeline.join("\n")}\n\nПолный текст:\n${fullText}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      throw new Error(`AI: ${aiRes.status} ${t.slice(0, 200)}`);
    }

    const aiJson = await aiRes.json();
    const txt = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: { clips?: unknown[] };
    try {
      parsed = JSON.parse(txt);
    } catch {
      throw new Error("AI вернул некорректный JSON");
    }
    const clips = (parsed.clips ?? []) as {
      start: number; end: number; title: string; hook: string;
      viral_score: number; reason: string;
    }[];

    if (!clips.length) throw new Error("AI не нашёл подходящих клипов");

    // Валидация и нормализация
    const valid = clips
      .map((c) => ({
        start: Math.max(0, Number(c.start)),
        end: Math.min(duration, Number(c.end)),
        title: String(c.title ?? "").slice(0, 80),
        hook: String(c.hook ?? "").slice(0, 120),
        viral_score: Math.round(Math.min(100, Math.max(0, Number(c.viral_score) || 50))),
        reason: String(c.reason ?? "").slice(0, 240),
      }))
      .filter((c) => c.end - c.start >= 10 && c.end > c.start)
      .slice(0, clipCount);

    if (!valid.length) throw new Error("AI вернул некорректные таймкоды");

    await admin.from("magic_clip_segments").delete().eq("project_id", projectId);
    await admin.from("magic_clip_segments").insert(
      valid.map((c, i) => ({
        project_id: projectId,
        user_id: user.id,
        order_index: i,
        start_time: c.start,
        end_time: c.end,
        title: c.title,
        hook: c.hook,
        viral_score: c.viral_score,
        reason: c.reason,
      })),
    );

    const maxScore = Math.max(...valid.map((c) => c.viral_score));
    await admin.from("projects").update({
      status: "ready",
      viral_score: maxScore,
      title_suggestion: valid[0]?.title ?? project.title,
    }).eq("id", projectId);

    return new Response(JSON.stringify({ success: true, clips: valid.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("magic-clips error:", msg);
    if (projectId) {
      await admin.from("projects").update({ status: "failed", error_message: msg }).eq("id", projectId);
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
