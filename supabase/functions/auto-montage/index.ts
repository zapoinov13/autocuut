// AI auto-montage: transcribe audio → chunk into blocks → analyze clips with Vision → ask Gemini to lay out segments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface Word { text: string; start: number; end: number; type?: string }
interface Block { idx: number; start: number; end: number; text: string }
interface ClipScene { description: string; subjects: string[]; setting: string; mood: string; motion: string; tags: string[] }
interface ClipMeta { id: string; idx: number; duration: number; description: string; scene: ClipScene }

const fail = async (admin: any, id: string | null, msg: string) => {
  if (admin && id) await admin.from("projects").update({ status: "failed", error_message: msg }).eq("id", id);
};

const recoverMissingClipRows = async (admin: any, project: any, projectId: string, userId: string) => {
  const { data: existing } = await admin.from("montage_clips").select("storage_path")
    .eq("project_id", projectId).eq("user_id", userId);
  const known = new Set((existing ?? []).map((c: any) => c.storage_path));
  const prefix = `${userId}/${projectId}`;
  const { data: objects, error } = await admin.storage.from("videos").list(prefix, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error || !objects?.length) return;
  const rows = objects
    .filter((obj: any) => /^clip_\d+\./.test(obj.name))
    .map((obj: any) => `${prefix}/${obj.name}`)
    .filter((path: string) => !known.has(path))
    .map((path: string) => {
      const order = Number(path.match(/clip_(\d+)\./)?.[1] ?? 0);
      return {
        project_id: projectId,
        user_id: userId,
        storage_path: path,
        duration: Number(project.duration) > 0 ? Math.max(4, Math.min(10, Number(project.duration) / Math.max(objects.length, 1))) : 4,
        order_index: order,
        meta: { recovered: true, original_name: path.split("/").pop() },
      };
    });
  if (rows.length) await admin.from("montage_clips").insert(rows);
};

const buildSpeechBlocks = (words: Word[], totalDur: number): Block[] => {
  if (!words.length) return uniformBlocks(totalDur);
  const blocks: Block[] = [];
  let buf: Word[] = [];
  const flush = () => {
    if (!buf.length) return;
    blocks.push({
      idx: blocks.length,
      start: buf[0].start,
      end: buf[buf.length - 1].end,
      text: buf.map((w) => w.text).join(" "),
    });
    buf = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    buf.push(w);
    const dur = buf[buf.length - 1].end - buf[0].start;
    const next = words[i + 1];
    const gap = next ? next.start - w.end : 0;
    const punct = /[.!?…]$/.test(w.text);
    if (!next) { flush(); break; }
    if (dur >= 3 && (punct || gap > 0.5)) flush();
    else if (dur >= 8) flush();
  }
  flush();
  return blocks;
};

const uniformBlocks = (totalDur: number): Block[] => {
  // music mode: 4s chunks
  const out: Block[] = [];
  const chunk = 4;
  let t = 0; let i = 0;
  while (t < totalDur - 0.2) {
    const end = Math.min(totalDur, t + chunk);
    out.push({ idx: i, start: t, end, text: `[music ${i + 1}]` });
    t = end; i++;
  }
  return out;
};

const emptyScene = (i: number): ClipScene => ({
  description: `Клип ${i + 1}`, subjects: [], setting: "", mood: "", motion: "", tags: [],
});

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function describeClipsBatch(thumbsB64: string[], apiKey: string): Promise<ClipScene[]> {
  const content: any[] = [{
    type: "text",
    text: `Проанализируй каждое изображение как сцену из видеоклипа. Для каждого верни строго JSON:
{"clips":[{"description":"одно предложение по-русски, что происходит","subjects":["человек","ноутбук"],"setting":"офис/улица/природа/студия/дом/...","mood":"энергичный/спокойный/тревожный/радостный/...","motion":"статика/медленное движение/быстрое движение","tags":["работа","технологии","город","..."]}]}
Порядок clips строго совпадает с порядком изображений. Только валидный JSON без markdown.`,
  }];
  for (const b64 of thumbsB64) {
    if (b64) content.push({ type: "image_url", image_url: { url: b64 } });
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(LOVABLE_AI, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
      }),
    }, 25_000);
  } catch (e) {
    console.error("vision timeout/error", e);
    return thumbsB64.map((_, i) => emptyScene(i));
  }
  if (!res.ok) {
    const t = await res.text();
    console.error("vision error", res.status, t.slice(0, 300));
    return thumbsB64.map((_, i) => emptyScene(i));
  }
  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(txt);
    const arr = Array.isArray(parsed) ? parsed : (parsed.clips ?? parsed.scenes ?? parsed.descriptions ?? []);
    return thumbsB64.map((_, i) => {
      const raw = arr[i];
      if (!raw) return emptyScene(i);
      if (typeof raw === "string") return { ...emptyScene(i), description: raw };
      return {
        description: String(raw.description ?? `Клип ${i + 1}`),
        subjects: Array.isArray(raw.subjects) ? raw.subjects.map(String).slice(0, 6) : [],
        setting: String(raw.setting ?? ""),
        mood: String(raw.mood ?? ""),
        motion: String(raw.motion ?? ""),
        tags: Array.isArray(raw.tags) ? raw.tags.map(String).slice(0, 8) : [],
      };
    });
  } catch {
    return thumbsB64.map((_, i) => emptyScene(i));
  }
}

// Lightweight Russian-friendly keyword overlap between block text and a clip scene.
const STOPWORDS = new Set(["и","в","на","не","что","это","как","по","с","для","от","до","но","или","же","бы","ли","за","о","у","к","из","я","ты","он","она","мы","вы","они","меня","тебя","его","её","нас","вас","их","быть","есть","был","была","было","было","эта","этот","эти","там","тут","так","уже","еще","ещё","все","всё","когда","если","чтобы","потому","только","даже","очень","можно","надо","нужно","свой","своя","свои","свое"]);
const tokenize = (s: string) => (s.toLowerCase().match(/[a-zа-яё0-9]{3,}/gi) ?? [])
  .map((w) => w.replace(/(ого|его|ому|ему|ыми|ими|ая|яя|ое|ее|ой|ей|ую|юю|ие|ые|ам|ям|ах|ях|ов|ев|ёв|ом|ем|ём|ы|и|у|ю|а|я|о|е|ь)$/i, ""))
  .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

function clipKeywords(c: ClipMeta): Set<string> {
  const all = [c.scene.description, c.scene.setting, c.scene.mood, c.scene.motion,
    ...(c.scene.subjects ?? []), ...(c.scene.tags ?? [])].join(" ");
  return new Set(tokenize(all));
}

function scoreMatch(blockText: string, clipKw: Set<string>): number {
  const bt = tokenize(blockText);
  let s = 0; for (const w of bt) if (clipKw.has(w)) s += 1;
  return s;
}

function buildFastKeywordLayout(
  blocks: Block[], clips: ClipMeta[], mode: "speech" | "music",
): { block_idx: number; clip_idx: number; clip_in: number; clip_out: number; reason: string }[] {
  const kw = clips.map(clipKeywords);
  let prev = -1;
  return blocks.map((b, i) => {
    let bestIdx = i % clips.length, bestScore = -1;
    for (let c = 0; c < clips.length; c++) {
      if (c === prev && clips.length > 1) continue;
      const sc = mode === "speech" ? scoreMatch(b.text, kw[c]) : (c === i % clips.length ? 1 : 0);
      if (sc > bestScore) { bestScore = sc; bestIdx = c; }
    }
    prev = bestIdx;
    const clip = clips[bestIdx];
    const dur = Math.max(0.6, b.end - b.start);
    const maxStart = Math.max(0, clip.duration - dur);
    const clip_in = maxStart > 0 ? +((i * 1.37) % maxStart).toFixed(2) : 0;
    return {
      block_idx: b.idx,
      clip_idx: bestIdx,
      clip_in,
      clip_out: Math.min(clip.duration || dur, clip_in + dur),
      reason: mode === "speech" && bestScore > 0 ? `Быстрый подбор по смыслу (score=${bestScore})` : "Быстрое чередование клипов",
    };
  });
}

async function layoutSegments(
  blocks: Block[], clips: ClipMeta[], mode: "speech" | "music", apiKey: string,
): Promise<{ block_idx: number; clip_idx: number; clip_in: number; clip_out: number; reason: string }[]> {
  const fastKeywordLayout = buildFastKeywordLayout(blocks, clips, mode);
  if (blocks.length > 14 || clips.length > 12 || mode === "music") return fastKeywordLayout;

  const sys = mode === "speech"
    ? `Ты режиссёр монтажа. На вход — блоки голоса (текст + длительность) и клипы со структурным описанием сцены (description, subjects, setting, mood, motion, tags).
ГЛАВНОЕ ПРАВИЛО: к каждому блоку подбирай клип, который СОВПАДАЕТ ПО СМЫСЛУ с текстом блока.
Алгоритм для каждого блока:
1) Выдели ключевые понятия из текста (объект, действие, место, настроение).
2) Найди клип, у которого subjects/tags/setting/description максимально пересекаются с этими понятиями.
3) Если ни один клип не подходит по смыслу — выбери самый нейтральный (общий план, минимум деталей) и пометь в reason "нейтральная подложка".
Дополнительные правила:
- Длительность сегмента = длительность блока.
- Не ставь один клип в двух подряд блоках.
- Старайся использовать как можно больше разных клипов.
- Если клип длиннее блока — выбери осмысленный отрезок через clip_in/clip_out.
- reason ОБЯЗАН содержать конкретные совпавшие слова или понятия (например: "текст про кофе → setting:кафе, tag:напиток").`
    : `Ты режиссёр клипов под музыку. Блоки — равные 4с куски, клипы — со сценовыми тегами.
Правила:
- Длительность сегмента = длительность блока.
- Чередуй клипы по mood/motion для динамики, не повторяй подряд.
- Используй каждый клип хотя бы раз.
- Если клип длиннее блока — бери кусок через clip_in/clip_out.
- reason — короткая фраза о ритме/настроении.`;

  const user = JSON.stringify({
    mode,
    blocks: blocks.map((b) => ({ i: b.idx, dur: +(b.end - b.start).toFixed(2), text: b.text.slice(0, 240) })),
    clips: clips.map((c) => ({
      i: c.idx, dur: +c.duration.toFixed(2),
      desc: c.scene.description,
      subjects: c.scene.subjects, setting: c.scene.setting,
      mood: c.scene.mood, motion: c.scene.motion, tags: c.scene.tags,
    })),
  });

  const res = await fetchWithTimeout(LOVABLE_AI, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `${user}\n\nВерни строго JSON:\n{"segments":[{"block_idx":0,"clip_idx":0,"clip_in":0,"clip_out":3.5,"reason":"..."}]}` },
      ],
      response_format: { type: "json_object" },
    }),
  }, 25_000);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`layout AI: ${res.status} ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  const txt = j.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(txt);
  const segs = parsed.segments ?? [];
  if (!Array.isArray(segs) || !segs.length) throw new Error("AI вернул пустую раскладку");
  return segs;
}

// Strengthens AI choice with keyword-overlap. If AI picked a clip with score 0
// but another clip has a clearly better match, swap (speech mode only).
function reinforceSemanticMatch(
  segs: { block_idx: number; clip_idx: number; clip_in: number; clip_out: number; reason: string }[],
  blocks: Block[], clips: ClipMeta[],
) {
  const kw = clips.map(clipKeywords);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const block = blocks[s.block_idx]; if (!block) continue;
    const chosen = s.clip_idx;
    const chosenScore = scoreMatch(block.text, kw[chosen] ?? new Set());
    let bestIdx = chosen, bestScore = chosenScore;
    for (let c = 0; c < clips.length; c++) {
      if (c === chosen) continue;
      // avoid repeating same clip as previous segment
      if (i > 0 && segs[i - 1].clip_idx === c) continue;
      const sc = scoreMatch(block.text, kw[c] ?? new Set());
      if (sc > bestScore) { bestScore = sc; bestIdx = c; }
    }
    if (bestIdx !== chosen && bestScore >= 2 && chosenScore === 0) {
      const matched = [...tokenize(block.text)].filter((w) => kw[bestIdx].has(w)).slice(0, 4);
      segs[i] = {
        ...s, clip_idx: bestIdx, clip_in: 0, clip_out: 0,
        reason: `Пост-матч по смыслу: ${matched.join(", ")} (было: «${s.reason ?? ""}»)`,
      };
    }
  }
}

async function processMontage(
  admin: any,
  project_id: string,
  userId: string,
  ELEVEN: string,
  LOVABLE_KEY: string,
) {
  try {
    const { data: project } = await admin.from("projects").select("*")
      .eq("id", project_id).eq("user_id", userId).single();
    if (!project) throw new Error("Проект не найден");
    if (!project.audio_path) throw new Error("Аудио не загружено");

    await recoverMissingClipRows(admin, project, project_id, userId);
    const { data: clipRows } = await admin.from("montage_clips").select("*")
      .eq("project_id", project_id).eq("user_id", userId).order("order_index");
    if (!clipRows || clipRows.length < 2) throw new Error("Минимум 2 клипа");

    await admin.from("projects").update({ status: "transcribing", error_message: null }).eq("id", project_id);

    // 1. Audio → ElevenLabs.
    // ВАЖНО: передаём подписанную ссылку (cloud_storage_url), а НЕ скачиваем файл
    // в память edge-функции. Раньше большие файлы убивали функцию по памяти,
    // проект молча зависал на "transcribing" и монтаж не создавался.
    console.log("signing audio url", project.audio_path);
    const { data: audioSigned, error: signErr } = await admin.storage.from("audio")
      .createSignedUrl(project.audio_path, 3600);
    if (signErr || !audioSigned) throw new Error(`Не удалось подписать ссылку на аудио: ${signErr?.message ?? "unknown"}`);

    const fd = new FormData();
    fd.append("cloud_storage_url", audioSigned.signedUrl);
    fd.append("model_id", "scribe_v2");
    fd.append("tag_audio_events", "false");
    fd.append("diarize", "false");
    const scribeRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST", headers: { "xi-api-key": ELEVEN }, body: fd,
    });
    if (!scribeRes.ok) {
      const t = await scribeRes.text();
      let friendly = `ElevenLabs: ${t.slice(0, 200)}`;
      try {
        const j = JSON.parse(t);
        const st = j?.detail?.status;
        if (st === "quota_exceeded") friendly = "На ключе ElevenLabs закончились кредиты. Пополните баланс или обновите API ключ.";
        else if (st === "detected_unusual_activity") friendly = "ElevenLabs отключил Free Tier для этого ключа. Нужен платный план или новый API ключ.";
        else if (typeof j?.detail?.message === "string") friendly = `ElevenLabs: ${j.detail.message.slice(0, 200)}`;
      } catch { /* оставляем сырой текст */ }
      throw new Error(friendly);
    }
    const transcript = await scribeRes.json();
    const words: Word[] = (transcript.words ?? []).filter((w: any) => w.type !== "spacing" && w.text?.trim());
    const totalDur = Number(project.duration) || (words.length ? words[words.length - 1].end : 60);

    // 2. Detect mode
    const wordsPerSec = words.length / Math.max(totalDur, 1);
    const mode: "speech" | "music" = wordsPerSec < 0.3 ? "music" : "speech";
    console.log("mode", mode, "words/sec", wordsPerSec.toFixed(2));

    // Save transcript as subtitles for the project (so editor can show them if needed)
    if (mode === "speech" && words.length) {
      await admin.from("subtitles").delete().eq("project_id", project_id);
      await admin.from("subtitles").insert({
        project_id, user_id: userId,
        words: words.map((w) => ({ text: w.text, start: w.start, end: w.end })),
      });
    }

    await admin.from("projects").update({ status: "analyzing" }).eq("id", project_id);

    // 3. Build blocks
    const blocks = mode === "speech"
      ? buildSpeechBlocks(words, totalDur)
      : uniformBlocks(totalDur);
    console.log("blocks", blocks.length);

    // 4. Describe clips via vision (batch)
    console.log("describing clips");
    const thumbB64: string[] = await Promise.all(clipRows.map(async (c: any) => {
      const thumbPath = (c.meta as any)?.thumb_path;
      if (!thumbPath) return "";
      try {
        const { data: img } = await admin.storage.from("thumbnails").download(thumbPath);
        if (!img) return "";
        const buf = new Uint8Array(await img.arrayBuffer());
        // base64
        let s = ""; for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
        return `data:image/jpeg;base64,${btoa(s)}`;
      } catch (e) {
        console.warn("thumb fail", e); return "";
      }
    }));
    const valid = thumbB64.filter(Boolean);
    let scenes: ClipScene[] = clipRows.map((_, i) => emptyScene(i));
    if (valid.length === clipRows.length) {
      try {
        scenes = await describeClipsBatch(valid, LOVABLE_KEY);
        if (scenes.length !== clipRows.length) {
          scenes = clipRows.map((_, i) => scenes[i] ?? emptyScene(i));
        }
      } catch (e) {
        console.error("vision failed, using fallback", e);
      }
    }

    // Save scene meta back
    await Promise.all(clipRows.map((clipRow: any, i: number) => admin.from("montage_clips").update({
        meta: { ...(clipRows[i].meta as any ?? {}), description: scenes[i].description, scene: scenes[i] },
      }).eq("id", clipRow.id)));

    const clipsMeta: ClipMeta[] = clipRows.map((c, i) => ({
      id: c.id, idx: i, duration: Number(c.duration),
      description: scenes[i].description, scene: scenes[i],
    }));

    // 5. Fast layout: use AI scene descriptions + keyword matching, no slow second AI call.
    console.log("building fast layout");
    const segs = buildFastKeywordLayout(blocks, clipsMeta, mode);

    if (mode === "speech") reinforceSemanticMatch(segs, blocks, clipsMeta);


    // 6. Save segments
    await admin.from("montage_segments").delete().eq("project_id", project_id);
    const toInsert = segs.map((s: any, i: number) => {
      const block = blocks[s.block_idx] ?? blocks[i] ?? blocks[blocks.length - 1];
      const clip = clipsMeta[s.clip_idx] ?? clipsMeta[0];
      const blockDur = block.end - block.start;
      let clip_in = Math.max(0, Number(s.clip_in) || 0);
      let clip_out = Math.min(clip.duration, Number(s.clip_out) || clip_in + blockDur);
      if (clip_out - clip_in < 0.3) {
        clip_in = 0;
        clip_out = Math.min(clip.duration, blockDur);
      }
      return {
        project_id, user_id: userId,
        order_index: i,
        clip_id: clip.id,
        clip_in, clip_out,
        audio_start: block.start, audio_end: block.end,
        reason: String(s.reason ?? "").slice(0, 240),
      };
    });
    if (toInsert.length) {
      const { error: insErr } = await admin.from("montage_segments").insert(toInsert);
      if (insErr) throw insErr;
    }

    await admin.from("projects").update({ status: "ready" }).eq("id", project_id);

    return new Response(JSON.stringify({
      success: true, mode, blocks: blocks.length, segments: toInsert.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("auto-montage error", msg);
    await fail(admin, project_id, msg);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const ELEVEN = Deno.env.get("ELEVENLABS_API_KEY");
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    if (!ELEVEN) throw new Error("ELEVENLABS_API_KEY не настроен");
    if (!LOVABLE_KEY) throw new Error("LOVABLE_API_KEY не настроен");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401, headers: corsHeaders });
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401, headers: corsHeaders });

    const { project_id } = await req.json();
    if (!project_id) throw new Error("project_id required");

    const { data: project } = await admin.from("projects").select("id, user_id, audio_path")
      .eq("id", project_id).eq("user_id", user.id).single();
    if (!project) throw new Error("Проект не найден");
    if (!project.audio_path) throw new Error("Аудио не загружено");

    await recoverMissingClipRows(admin, project, project_id, user.id);
    const { count } = await admin.from("montage_clips").select("id", { count: "exact", head: true })
      .eq("project_id", project_id).eq("user_id", user.id);
    if (!count || count < 2) throw new Error("Минимум 2 клипа");

    await admin.from("projects").update({ status: "transcribing", error_message: null }).eq("id", project_id);
    EdgeRuntime.waitUntil(processMontage(admin, project_id, user.id, ELEVEN, LOVABLE_KEY));

    return new Response(JSON.stringify({ accepted: true }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("auto-montage start error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
