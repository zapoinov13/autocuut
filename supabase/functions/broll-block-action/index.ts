// Per-block B-roll actions: search Pexels, regenerate, pick a specific URL, clear.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PexelsHit {
  id: number;
  url: string;          // playable mp4 link
  thumb: string;        // preview image
  duration: number;
  width: number;
  height: number;
}

async function pexelsSearch(
  query: string,
  key: string,
  orientation: "portrait" | "landscape",
  minDuration: number,
  perPage = 12,
): Promise<PexelsHit[]> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientation}&min_duration=${Math.max(2, Math.floor(minDuration))}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) return [];
  const json = await res.json();
  const out: PexelsHit[] = [];
  for (const v of json?.videos ?? []) {
    const file = v.video_files?.find((f: any) => f.quality === "hd") ?? v.video_files?.[0];
    if (!file?.link) continue;
    out.push({
      id: v.id,
      url: file.link,
      thumb: v.image,
      duration: v.duration,
      width: file.width ?? v.width,
      height: file.height ?? v.height,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const PEXELS_API_KEY = Deno.env.get("PEXELS_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!PEXELS_API_KEY) {
      return new Response(JSON.stringify({ error: "PEXELS_API_KEY не настроен" }), {
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
    const action: "search" | "regenerate" | "pick" | "clear" = body.action;
    const projectId: string = body.projectId;
    const sceneIds: string[] = Array.isArray(body.sceneIds) ? body.sceneIds : [];
    const orientation: "portrait" | "landscape" = body.orientation ?? "portrait";
    const target: "broll_url" | "top_video_url" = body.target ?? "broll_url";

    if (!projectId || !action) {
      return new Response(JSON.stringify({ error: "projectId и action обязательны" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Owner-check via RLS-bound admin: filter by user_id
    const { data: scenes, error: scErr } = await admin
      .from("scenes")
      .select("id, start_time, end_time, broll_url, broll_meta, project_id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .in("id", sceneIds.length ? sceneIds : [""]);

    if (scErr) throw scErr;
    if (!sceneIds.length || !scenes?.length) {
      return new Response(JSON.stringify({ error: "Сцены не найдены" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const minDur = Math.max(...scenes.map((s: any) => Number(s.end_time))) - Math.min(...scenes.map((s: any) => Number(s.start_time)));

    if (action === "clear") {
      const update: any = { [target]: null };
      if (target === "broll_url") update.broll_meta = null;
      await admin.from("scenes").update(update).in("id", sceneIds);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "search") {
      const query: string = body.query ?? "";
      if (!query.trim()) {
        return new Response(JSON.stringify({ error: "query обязателен" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const results = await pexelsSearch(query, PEXELS_API_KEY, orientation, minDur);
      return new Response(JSON.stringify({ results }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "pick") {
      const url: string = body.url;
      const query: string = body.query ?? "";
      if (!url) {
        return new Response(JSON.stringify({ error: "url обязателен" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const meta = scenes[0]?.broll_meta ?? {};
      const newMeta = { ...meta, query: query || (meta as any).query, picked_at: new Date().toISOString() };
      const update: any = { [target]: url };
      if (target === "broll_url") update.broll_meta = newMeta;
      await admin.from("scenes").update(update).in("id", sceneIds);
      return new Response(JSON.stringify({ ok: true, url }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "regenerate") {
      const meta: any = scenes[0]?.broll_meta ?? {};
      const queries: string[] = Array.isArray(meta.queries) && meta.queries.length
        ? meta.queries
        : (meta.query ? [meta.query] : (body.query ? [body.query] : []));
      if (!queries.length) {
        return new Response(JSON.stringify({ error: "Нет запроса для перегенерации" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const currentUrl: string | null = scenes[0]?.broll_url ?? null;
      // gather candidates from all queries, skip current url
      let candidates: PexelsHit[] = [];
      for (const q of queries) {
        const r = await pexelsSearch(q, PEXELS_API_KEY, orientation, minDur);
        candidates = candidates.concat(r);
        if (candidates.filter((c) => c.url !== currentUrl).length >= 1) break;
      }
      const next = candidates.find((c) => c.url !== currentUrl) ?? candidates[0];
      if (!next) {
        return new Response(JSON.stringify({ error: "Pexels ничего не вернул" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const newMeta = { ...meta, query: queries[0], queries };
      const update: any = { [target]: next.url };
      if (target === "broll_url") update.broll_meta = newMeta;
      await admin.from("scenes").update(update).in("id", sceneIds);
      return new Response(JSON.stringify({ ok: true, url: next.url, thumb: next.thumb }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("broll-block-action error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
