// Edge function: AI-анализ транскрипта и разбивка на сцены через Lovable AI
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_PROMPTS: Record<string, string> = {
  viral_tiktok:
    "Стиль Viral TikTok: быстрая нарезка по 2-4 сек, яркие хайлайт-слова (1-2 на сцену), частые зумы, агрессивный темп. Каждая сцена = одна мысль или яркая фраза.",
  podcast_clips:
    "Стиль Podcast Clips: спокойный темп, сцены по 4-8 сек, минимум зумов (только на ключевых утверждениях), 0-1 хайлайт-слово на сцену.",
  educational:
    "Стиль Educational: средний темп, сцены по 3-6 сек, выделяй термины и ключевые понятия как highlight_words, умеренные зумы на важных определениях.",
  mrbeast_pacing:
    "Стиль MrBeast: ультра-быстрая нарезка по 1.5-3 сек, агрессивные зумы почти на каждой сцене, 1-2 хайлайт-слова из самых эмоциональных слов, КАПС в важных моментах.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY не настроен" }), {
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

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { project_id } = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: project } = await admin
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return new Response(JSON.stringify({ error: "Проект не найден" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await admin
      .from("subtitles")
      .select("words")
      .eq("project_id", project_id)
      .single();

    if (!subs || !subs.words || (subs.words as any[]).length === 0) {
      return new Response(JSON.stringify({ error: "Сначала нужна транскрипция" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("projects").update({ status: "analyzing" }).eq("id", project_id);

    // Build a compact transcript with timestamps for the AI
    const trimStart = Number(project.trim_start) || 0;
    const trimEnd = project.trim_end != null ? Number(project.trim_end) : null;
    const clipDuration = Number(project.duration) || 0;
    let words = (subs.words as { text: string; start: number; end: number }[]);
    const maxWordEnd = words.length ? Math.max(...words.map((w) => w.end)) : 0;

    // Trim только если субтитры в абсолютной шкале исходного видео (Magic Clips child
    // уже хранит относительные таймкоды — их повторно резать нельзя).
    const needsTrim = trimEnd != null && trimEnd > trimStart && maxWordEnd > clipDuration + 2;
    if (needsTrim) {
      words = words
        .filter((w) => w.end > trimStart && w.start < trimEnd!)
        .map((w) => ({
          text: w.text,
          start: Math.max(0, w.start - trimStart),
          end: Math.min(trimEnd! - trimStart, w.end - trimStart),
        }));
    }

    const fullText = words.map((w) => w.text).join(" ");
    const duration = needsTrim
      ? trimEnd! - trimStart
      : (clipDuration || maxWordEnd || 0);

    const stylePrompt = STYLE_PROMPTS[project.style] ?? STYLE_PROMPTS.viral_tiktok;

    const systemPrompt = `Ты — AI-режиссёр коротких вертикальных видео (TikTok/Reels/Shorts). Твоя задача: разбить транскрипт на динамичные сцены под выбранный стиль монтажа.

${stylePrompt}

Правила:
- Сцены идут по порядку без пропусков и наложений
- Сумма всех сцен ≈ длительность видео (${duration.toFixed(1)} сек)
- Первая сцена — это HOOK (первые 1-2 сек), пометь её is_hook: true
- highlight_words — массив ключевых слов из текста сцены, которые надо выделить цветом (только слова, реально присутствующие в text сцены)
- zoom: "in" (наезд), "out" (отъезд) или "none"
- viral_score 0-100 — оценка вирального потенциала ролика
- title_suggestion — короткий цепляющий заголовок на языке оригинала (макс 60 символов)
- Все тексты — на языке оригинала транскрипта`;

    const userPrompt = `Транскрипт (длительность ${duration.toFixed(1)} сек):\n\n${fullText}`;

    console.log("Calling Lovable AI...");
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_montage",
              description: "Create scene-by-scene montage plan",
              parameters: {
                type: "object",
                properties: {
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        start: { type: "number" },
                        end: { type: "number" },
                        text: { type: "string" },
                        zoom: { type: "string", enum: ["in", "out", "none"] },
                        highlight_words: { type: "array", items: { type: "string" } },
                        is_hook: { type: "boolean" },
                      },
                      required: ["start", "end", "text", "zoom", "highlight_words", "is_hook"],
                    },
                  },
                  viral_score: { type: "number" },
                  title_suggestion: { type: "string" },
                },
                required: ["scenes", "viral_score", "title_suggestion"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_montage" } },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Lovable AI error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Превышен лимит AI-запросов, попробуйте позже" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Закончились AI-кредиты. Пополните баланс в настройках Lovable Cloud." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI Gateway вернул ${aiRes.status}`);
    }

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI не вернул структурированный ответ");

    const result = JSON.parse(toolCall.function.arguments);
    console.log("AI returned scenes:", result.scenes?.length, "viral_score:", result.viral_score);

    // Persist scenes
    await admin.from("scenes").delete().eq("project_id", project_id);
    const scenesToInsert = result.scenes.map((s: any, i: number) => ({
      project_id,
      user_id: user.id,
      start_time: s.start,
      end_time: s.end,
      text: s.text,
      zoom: s.zoom,
      highlight_words: s.highlight_words,
      is_hook: s.is_hook,
      order_index: i,
    }));
    await admin.from("scenes").insert(scenesToInsert);

    await admin
      .from("projects")
      .update({
        status: "ready",
        viral_score: Math.round(result.viral_score),
        title_suggestion: result.title_suggestion,
      })
      .eq("id", project_id);

    return new Response(
      JSON.stringify({ success: true, scene_count: result.scenes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Неизвестная ошибка";
    console.error("analyze-scenes error:", msg);

    // Mark project as failed
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const body = await req.clone().json().catch(() => ({}));
      if (body?.project_id) {
        await admin.from("projects").update({ status: "failed", error_message: msg }).eq("id", body.project_id);
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
