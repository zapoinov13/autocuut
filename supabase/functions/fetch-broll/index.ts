// AI-driven B-roll: groups scenes into 5–9s blocks with topic context,
// asks LLM for primary + 2 fallback Pexels queries per relevant block,
// fetches a clip whose duration covers the whole block (no flicker).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_BLOCK_SEC = 5;
const MAX_BLOCK_SEC = 9;

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
  i: number;
  use: boolean;
  queries: string[]; // primary + fallbacks
  reason: string;
}

async function aiPickBrolls(blocks: Block[], topic: string, apiKey: string): Promise<AIDecision[]> {
  const payload = blocks.map((b, i) => ({
    i,
    seconds: Math.round(b.end - b.start),
    text: b.text,
  }));

  const sys = `You are a senior video editor choosing B-roll for a talking-head short video.

VIDEO TOPIC / CONTEXT:
"""${topic}"""

RULES:
- Skip blocks that are intros, calls-to-action, transitions, abstract opinions, generic filler.
- Pick B-roll ONLY when there is a CONCRETE visual concept the viewer benefits from seeing (a place, object, action, person doing X, data, scene).
- The query MUST be concretely tied to BOTH the block text AND the overall video topic above. Generic stock ideas like "people talking", "city", "abstract" are forbidden.
- Aim to cover ~40-60% of blocks, NEVER all of them.
- Two consecutive blocks should rarely both have B-roll — let the speaker breathe.
- For each chosen block, return THREE queries: a precise primary (3-5 English words) + two simpler fallbacks (1-3 English words each), all Pexels-friendly stock concepts.
- Reason MUST be in Russian, ONE short sentence (max 12 words) explaining why this visual fits the topic.

Return ONLY JSON: {"picks":[{"i":number,"use":boolean,"queries":[string,string,string],"reason":string}, ...]} for EVERY block.`;

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
  const picks: AIDecision[] = (Array.isArray(parsed.picks) ? parsed.picks : []).map((p: any) => ({
    i: p.i ?? p.index ?? 0,
    use: !!p.use,
    queries: Array.isArray(p.queries) ? p.queries.filter(Boolean) : (p.query ? [p.query] : []),
    reason: p.reason ?? "",
  }));
  return picks;
}

async function pexelsSearchOne(
  query: string,
  key: string,
  orientation: "portrait" | "landscape",
  minDuration: number,
): Promise<string | null> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=${orientation}&min_duration=${Math.max(2, Math.floor(minDuration))}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) return null;
  const json = await res.json();
  const videos = json?.videos ?? [];
  // pick the first video that's long enough; prefer HD file
  for (const v of videos) {
    if (v.duration && v.duration < minDuration) continue;
    const file = v.video_files?.find((f: any) => f.quality === "hd") ?? v.video_files?.[0];
    if (file?.link) return file.link;
  }
  return null;
}

async function pexelsFindFirst(
  queries: string[],
  key: string,
  orientation: "portrait" | "landscape",
  minDuration: number,
): Promise<{ url: string; query: string } | null> {
  for (const q of queries) {
    const url = await pexelsSearchOne(q, key, orientation, minDuration);
    if (url) return { url, query: q };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!PEXELS_API_KEY || !LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Не настроены ключи" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
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

    const [{ data: project }, { data: scenes, error: scErr }] = await Promise.all([
      admin.from("projects").select("title, title_suggestion").eq("id", projectId).eq("user_id", user.id).maybeSingle(),
      admin.from("scenes").select("id, text, start_time, end_time, is_hook, highlight_words, order_index")
        .eq("project_id", projectId).eq("user_id", user.id).order("order_index"),
    ]);

    if (scErr) throw scErr;
    if (!scenes?.length) {
      return new Response(JSON.stringify({ updated: 0, total: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context: project title + first 2 scenes
    const topic = [
      project?.title_suggestion ?? project?.title ?? "",
      (scenes as SceneRow[]).slice(0, 2).map((s) => s.text).join(" "),
    ].filter(Boolean).join(" — ");

    // Wipe previous broll for this target + meta
    const wipe: any = { [target]: null };
    if (target === "broll_url") wipe.broll_meta = null;
    await admin.from("scenes").update(wipe).eq("project_id", projectId).eq("user_id", user.id);

    const blocks = buildBlocks(scenes as SceneRow[]);

    let picks: AIDecision[] = [];
    try {
      picks = await aiPickBrolls(blocks, topic, LOVABLE_API_KEY);
    } catch (e) {
      console.error("AI failed:", e);
      return new Response(JSON.stringify({ error: "AI выбор не удался" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Forbid two B-roll blocks in a row
    const allowedIdx = new Set<number>();
    const sorted = [...picks].sort((a, b) => a.i - b.i);
    let prevUsed = -2;
    for (const p of sorted) {
      if (p.use && p.queries.length && p.i - prevUsed >= 2) {
        allowedIdx.add(p.i);
        prevUsed = p.i;
      }
    }

    type DecisionOut = {
      block_id: string;
      i: number;
      start: number;
      end: number;
      seconds: number;
      text: string;
      use: boolean;
      queries: string[];
      query: string;
      reason: string;
      broll_url: string | null;
      status: "applied" | "skipped_ai" | "skipped_adjacent" | "no_pexels_match";
    };
    const report: DecisionOut[] = [];
    let updated = 0;
    let appliedScenes = 0;

    for (let i = 0; i < blocks.length; i++) {
      const pick = picks.find((p) => p.i === i);
      const b = blocks[i];
      const block_id = `${projectId}-b${i}`;
      const seconds = Math.round(b.end - b.start);
      const base = {
        block_id,
        i,
        start: b.start,
        end: b.end,
        seconds,
        text: b.text,
        queries: pick?.queries ?? [],
        query: pick?.queries?.[0] ?? "",
        reason: pick?.reason ?? "",
      };

      if (!pick?.use || !pick.queries.length) {
        report.push({ ...base, use: false, broll_url: null, status: "skipped_ai" });
        continue;
      }
      if (!allowedIdx.has(i)) {
        report.push({ ...base, use: false, broll_url: null, status: "skipped_adjacent",
          reason: pick.reason || "Соседний блок уже с B-roll" });
        continue;
      }
      try {
        const found = await pexelsFindFirst(pick.queries, PEXELS_API_KEY, orientation, seconds);
        if (!found) {
          report.push({ ...base, use: true, broll_url: null, status: "no_pexels_match" });
          continue;
        }
        const ids = b.scenes.map((s) => s.id);
        const meta = {
          block_id,
          query: found.query,
          queries: pick.queries,
          reason: pick.reason,
        };
        const update: any = { [target]: found.url };
        if (target === "broll_url") update.broll_meta = meta;
        const { error: updErr } = await admin.from("scenes").update(update).in("id", ids);
        if (updErr) {
          console.error(updErr);
          report.push({ ...base, use: true, broll_url: null, status: "no_pexels_match" });
          continue;
        }
        updated++;
        appliedScenes += ids.length;
        report.push({ ...base, use: true, broll_url: found.url, query: found.query, status: "applied" });
      } catch (e) {
        console.error("Pexels error block", i, e);
        report.push({ ...base, use: true, broll_url: null, status: "no_pexels_match" });
      }
    }

    return new Response(
      JSON.stringify({
        updated,
        applied_scenes: appliedScenes,
        total_blocks: blocks.length,
        total_scenes: scenes.length,
        decisions: report,
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
