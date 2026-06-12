// HeyGen API proxy: список аватаров/голосов, создание и синхронизация видео
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const HEYGEN_BASE = "https://api.heygen.com";

async function heygen(path: string, apiKey: string, init?: RequestInit) {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = (json as { message?: string; error?: string })?.message
      ?? (json as { error?: string })?.error
      ?? text.slice(0, 300);
    throw new Error(`HeyGen ${res.status}: ${err}`);
  }
  return json;
}

async function syncHeygenVideo(
  admin: ReturnType<typeof createClient>,
  projectId: string,
  userId: string,
  heygenVideoId: string,
  apiKey: string,
) {
  const statusRes = await heygen(`/v3/videos/${heygenVideoId}`, apiKey) as {
    data?: { status?: string; video_url?: string; failure_message?: string };
  };
  const data = statusRes.data ?? statusRes as { status?: string; video_url?: string; failure_message?: string };
  const status = data.status ?? "pending";

  if (status === "pending" || status === "processing" || status === "waiting") {
    return { phase: "rendering", status };
  }
  if (status === "failed") {
    throw new Error(data.failure_message ?? "HeyGen не смог сгенерировать видео");
  }
  if (status !== "completed" || !data.video_url) {
    return { phase: "rendering", status };
  }

  // Скачиваем готовое видео в storage
  const videoRes = await fetch(data.video_url);
  if (!videoRes.ok) throw new Error(`Не удалось скачать видео HeyGen: ${videoRes.status}`);
  const blob = await videoRes.blob();
  const videoPath = `${userId}/${projectId}.mp4`;
  const { error: upErr } = await admin.storage.from("videos").upload(videoPath, blob, {
    contentType: "video/mp4", upsert: true,
  });
  if (upErr) throw upErr;

  const { data: signed } = await admin.storage.from("videos").createSignedUrl(videoPath, 60 * 60 * 24 * 7);

  const { data: existing } = await admin.from("projects").select("meta, duration").eq("id", projectId).single();
  const prevMeta = (existing?.meta ?? {}) as Record<string, unknown>;

  await admin.from("projects").update({
    video_path: videoPath,
    video_url: signed?.signedUrl ?? null,
    status: "transcribing",
    meta: { ...prevMeta, heygen_video_id: heygenVideoId, heygen_status: "completed", phase: "transcribing" },
  }).eq("id", projectId);

  return { phase: "transcribing", status: "completed" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const HEYGEN_KEY = Deno.env.get("HEYGEN_API_KEY");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), { status: 401, headers: corsHeaders });
    }

    if (!HEYGEN_KEY) {
      return new Response(JSON.stringify({
        error: "HEYGEN_API_KEY не настроен. Добавьте ключ HeyGen в секреты проекта (Lovable Cloud → Secrets).",
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { action, ...params } = await req.json();

    // ── list_avatars ──
    if (action === "list_avatars") {
      const looks: { id: string; name: string; preview_image_url: string | null; gender: string | null }[] = [];

      // Публичные (stock) аватары для экспертных видео
      try {
        const pub = await heygen("/v3/avatars/looks?ownership=public&limit=50", HEYGEN_KEY) as {
          data?: { looks?: Record<string, unknown>[]; avatars?: Record<string, unknown>[] };
        };
        const arr = pub.data?.looks ?? pub.data?.avatars ?? [];
        for (const a of arr) {
          looks.push({
            id: String(a.id ?? a.avatar_id ?? ""),
            name: String(a.name ?? a.avatar_name ?? "Avatar"),
            preview_image_url: (a.preview_image_url ?? a.preview_url ?? a.image_url ?? null) as string | null,
            gender: (a.gender ?? null) as string | null,
          });
        }
      } catch (e) { console.warn("public avatars", e); }

      // Приватные digital twin (если есть)
      try {
        const priv = await heygen("/v3/avatars/looks?avatar_type=digital_twin&ownership=private&limit=20", HEYGEN_KEY) as {
          data?: { looks?: Record<string, unknown>[] };
        };
        for (const a of priv.data?.looks ?? []) {
          looks.push({
            id: String(a.id ?? ""),
            name: `⭐ ${String(a.name ?? "Digital Twin")}`,
            preview_image_url: (a.preview_image_url ?? a.preview_url ?? null) as string | null,
            gender: (a.gender ?? null) as string | null,
          });
        }
      } catch (e) { console.warn("private avatars", e); }

      // Fallback v2 API
      if (!looks.length) {
        try {
          const v2 = await heygen("/v2/avatars", HEYGEN_KEY) as {
            data?: { avatars?: Record<string, unknown>[] };
          };
          for (const a of v2.data?.avatars ?? []) {
            looks.push({
              id: String(a.avatar_id ?? a.id ?? ""),
              name: String(a.avatar_name ?? a.name ?? "Avatar"),
              preview_image_url: (a.preview_image_url ?? a.preview_url ?? null) as string | null,
              gender: (a.gender ?? null) as string | null,
            });
          }
        } catch (e) { console.warn("v2 avatars", e); }
      }

      return new Response(JSON.stringify({ avatars: looks.filter((a) => a.id) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── list_voices ──
    if (action === "list_voices") {
      const voices: { id: string; name: string; language: string | null; gender: string | null }[] = [];
      try {
        const res = await heygen("/v3/voices", HEYGEN_KEY) as {
          data?: { voices?: Record<string, unknown>[] };
        };
        for (const v of res.data?.voices ?? []) {
          voices.push({
            id: String(v.voice_id ?? v.id ?? ""),
            name: String(v.name ?? v.display_name ?? "Voice"),
            language: (v.language ?? v.locale ?? null) as string | null,
            gender: (v.gender ?? null) as string | null,
          });
        }
      } catch {
        const v2 = await heygen("/v2/voices", HEYGEN_KEY) as {
          data?: { voices?: Record<string, unknown>[] };
        };
        for (const v of v2.data?.voices ?? []) {
          voices.push({
            id: String(v.voice_id ?? v.id ?? ""),
            name: String(v.name ?? "Voice"),
            language: (v.language ?? null) as string | null,
            gender: (v.gender ?? null) as string | null,
          });
        }
      }
      return new Response(JSON.stringify({ voices: voices.filter((v) => v.id) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── create ──
    if (action === "create") {
      const { project_id, avatar_id, voice_id, script, aspect_ratio, title } = params;
      if (!project_id || !avatar_id || !voice_id || !script?.trim()) {
        throw new Error("project_id, avatar_id, voice_id и script обязательны");
      }

      const { data: project } = await admin.from("projects").select("id, user_id")
        .eq("id", project_id).eq("user_id", user.id).single();
      if (!project) throw new Error("Проект не найден");

      const createRes = await heygen("/v3/videos", HEYGEN_KEY, {
        method: "POST",
        body: JSON.stringify({
          type: "avatar",
          avatar_id,
          voice_id,
          script: String(script).trim(),
          title: title ?? "Expert Video",
          resolution: "1080p",
          aspect_ratio: aspect_ratio ?? "9:16",
        }),
      }) as { data?: { video_id?: string }; video_id?: string };

      const heygenVideoId = createRes.data?.video_id ?? createRes.video_id;
      if (!heygenVideoId) throw new Error("HeyGen не вернул video_id");

      await admin.from("projects").update({
        status: "analyzing",
        error_message: null,
        meta: {
          heygen_video_id: heygenVideoId,
          avatar_id,
          voice_id,
          script: String(script).trim(),
          aspect_ratio: aspect_ratio ?? "9:16",
          phase: "heygen_rendering",
        },
      }).eq("id", project_id);

      return new Response(JSON.stringify({ success: true, heygen_video_id: heygenVideoId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── sync ──
    if (action === "sync") {
      const { project_id } = params;
      const { data: project } = await admin.from("projects").select("*")
        .eq("id", project_id).eq("user_id", user.id).single();
      if (!project) throw new Error("Проект не найден");

      const meta = (project.meta ?? {}) as Record<string, string>;
      const heygenVideoId = meta.heygen_video_id;
      if (!heygenVideoId) throw new Error("HeyGen video_id не найден");

      if (project.video_path) {
        return new Response(JSON.stringify({ phase: "done", status: "ready" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await syncHeygenVideo(admin, project_id, user.id, heygenVideoId, HEYGEN_KEY);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("heygen-api error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
