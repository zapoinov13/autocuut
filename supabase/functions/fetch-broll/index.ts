// Поиск b-roll клипов через Pexels API по тексту сцены
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Простое извлечение ключевых слов: убираем стоп-слова, берём 2-3 значимых
const STOP = new Set("и в во на с со к по для что это не но да нет был была быть как же ли уже еще ещё или а ну вот так там тут где когда чтобы если бы то ты вы мы они он она они мне меня тебя его её их при до от из у о об про под над без через между свой моя моё мой а the a an of in on for with to from by is are was were be been being have has had do does did this that these those i you he she it we they".split(" "));

function extractQuery(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
  return words.slice(0, 2).join(" ") || text.split(/\s+/).slice(0, 2).join(" ");
}

async function pexelsSearch(query: string, key: string, orientation: "portrait" | "landscape" = "portrait"): Promise<string | null> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) return null;
  const json = await res.json();
  const video = json?.videos?.[0];
  if (!video) return null;
  // выбираем HD/SD файл
  const file = video.video_files?.find((f: any) => f.quality === "hd") ?? video.video_files?.[0];
  return file?.link ?? null;
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

    // получаем сцены проекта (RLS обеспечивается фильтром по user_id)
    const { data: scenes, error: scErr } = await admin
      .from("scenes")
      .select("id, text, highlight_words, user_id, project_id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .order("order_index");

    if (scErr) throw scErr;
    if (!scenes?.length) {
      return new Response(JSON.stringify({ updated: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    for (const scene of scenes) {
      const hl: string[] = (scene.highlight_words as any) ?? [];
      const query = hl.length ? hl.slice(0, 2).join(" ") : extractQuery(scene.text);
      if (!query.trim()) continue;
      try {
        const url = await pexelsSearch(query, PEXELS_API_KEY, orientation);
        if (url) {
          await admin.from("scenes").update({ [target]: url }).eq("id", scene.id);
          updated++;
        }
      } catch (e) {
        console.error("Pexels error for scene", scene.id, e);
      }
    }

    return new Response(JSON.stringify({ updated, total: scenes.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-broll error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
