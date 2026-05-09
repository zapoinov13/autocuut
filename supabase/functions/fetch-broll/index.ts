// AI-driven B-roll: groups scenes into 5–8s blocks, asks LLM which need visual support
// and what to search on Pexels. Same clip spans all scenes in a block (no flicker).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_BLOCK_SEC = 5;   // не короче 5с — клип не должен "мигать"
const MAX_BLOCK_SEC = 9;   // и не дольше 9с — иначе скучно

interface SceneRow {
  id: string;
  text: string;
  start_time: number;
  end_time: number;
  is_hook: boolean;
  highlight_words: string[];
  order_index: number;
}

interface Block {
  scenes: SceneRow[];
  start: number;
  end: number;
  text: string;
}

function buildBlocks(scenes: SceneRow[]): Block[] {
  const blocks: Block[] = [];
  let cur: SceneRow[] = [];
  const flush = () => {
    if (!cur.length) return;
    blocks.push({
      scenes: cur,
      start: cur[0].start_time,
      end: cur[cur.length - 1].end_time,
      text: cur.map((s) => s.text).join(" "),
    });
    cur = [];
  };
  for (const s of scenes) {
    cur.push(s);
    const dur = cur[cur.length - 1].end_time - cur[0].start_time;
    if (dur >= MIN_BLOCK_SEC && dur >= MAX_BLOCK_SEC * 0.7) flush();
    else if (dur >= MAX_BLOCK_SEC) flush();
  }
  flush();
  return blocks;
}

interface AIDecision {
  index?: number;
  i?: number;
  use: boolean;
  query: string;
  reason?: string;
}

async function aiPickBrolls(blocks: Block[], apiKey: string): Promise<AIDecision[]> {
  const payload = blocks.map((b, i) => ({
    i,
    seconds: Math.round(b.end - b.start),
    text: b.text,
  }));

  const sys = `You are a video editor choosing B-roll for a talking-head video.
Rules:
- Skip blocks that are introductions, calls-to-action, transitions, abstract opinions, generic filler.
- Pick B-roll ONLY when there is a concrete visual concept the viewer benefits from seeing (a place, object, action, person doing X, data, scene).
- Aim to cover ~40-60% of blocks, NEVER all of them.
- Two consecutive blocks should rarely both have B-roll — let the speaker breathe.
- Query MUST be 1-3 simple English nouns/verbs Pexels stock library matches (e.g. "doctor patient consultation"). No abstract words.
- Reason MUST be in Russian, ONE short sentence (max 10 words) explaining your choice.
Return ONLY JSON: {"picks":[{"i":number,"use":boolean,"query":string,"reason":string}, ...]} for every block.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify({ blocks: payload }) },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("AI gateway error", res.status, t);
    throw new Error(`AI ${res.status}`);
  }
  const j = await res.json();
  const raw = j?.choices?.[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/```json|```/g, "").trim();
  let parsed: any = {};
  try { parsed = JSON.parse(cleaned); } catch { parsed = {}; }
  const picks: AIDecision[] = Array.isArray(parsed.picks) ? parsed.picks : [];
  return picks;
}

async function pexelsSearch(query: string, key: string, orientation: "portrait" | "landscape"): Promise<string | null> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) return null;
  const json = await res.json();
  const video = json?.videos?.[0];
  if (!video) return null;
  const file = video.video_files?.find((f: any) => f.quality === "hd") ?? video.video_files?.[0];
  return file?.link ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!PEXELS_API_KEY) {
      return new Response(JSON.stringify({ error: "PEXELS_API_KEY не настроен" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY не настроен" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const projectId: string = body.projectId;
    const target: "broll_url" | "top_video_url" = body.target ?? "broll_url";
    const orientation: "portrait" | "landscape" = body.orientation ?? "portrait";

    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId обязателен" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: scenes, error: scErr } = await admin
      .from("scenes")
      .select("id, text, start_time, end_time, is_hook, highlight_words, order_index")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .order("order_index");

    if (scErr) throw scErr;
    if (!scenes?.length) {
      return new Response(JSON.stringify({ updated: 0, total: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) очистить старые broll'ы — чтобы не было миксовки
    await admin.from("scenes").update({ [target]: null }).eq("project_id", projectId).eq("user_id", user.id);

    // 2) разбить на блоки 5–9с
    const blocks = buildBlocks(scenes as SceneRow[]);

    // 3) AI решает, где нужен b-roll и какой запрос
    let picks: AIDecision[] = [];
    try {
      picks = await aiPickBrolls(blocks, LOVABLE_API_KEY);
    } catch (e) {
      console.error("AI failed, abort:", e);
      return new Response(JSON.stringify({ error: "AI выбор не удался" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) запрет двух подряд b-roll блоков
    const usedIdx = new Set<number>();
    const sorted = [...picks].sort((a, b) => a.i - b.i);
    let prevUsed = -2;
    for (const p of sorted) {
      if (p.use && p.query && p.i - prevUsed >= 2) {
        usedIdx.add(p.i);
        prevUsed = p.i;
      }
    }

    // 5) Pexels + проставить URL на ВСЕ сцены блока
    let updated = 0;
    let appliedScenes = 0;
    for (let i = 0; i < blocks.length; i++) {
      if (!usedIdx.has(i)) continue;
      const pick = picks.find((p) => p.i === i);
      if (!pick) continue;
      try {
        const url = await pexelsSearch(pick.query, PEXELS_API_KEY, orientation);
        if (!url) continue;
        const ids = blocks[i].scenes.map((s) => s.id);
        const { error: updErr } = await admin
          .from("scenes")
          .update({ [target]: url })
          .in("id", ids);
        if (updErr) { console.error(updErr); continue; }
        updated++;
        appliedScenes += ids.length;
      } catch (e) {
        console.error("Pexels error block", i, e);
      }
    }

    return new Response(
      JSON.stringify({
        updated,                    // сколько B-roll клипов выбрано
        applied_scenes: appliedScenes, // сколько сцен покрыто
        total_blocks: blocks.length,
        total_scenes: scenes.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("fetch-broll error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
