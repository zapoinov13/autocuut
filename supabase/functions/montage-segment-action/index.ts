// Point operations on a single montage segment: replace_clip, trim, move, delete, split, regenerate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const LOVABLE_AI = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "auth" }), { status: 401, headers: corsHeaders });
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "auth" }), { status: 401, headers: corsHeaders });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { action, segment_id, project_id, payload } = await req.json();
    if (!action || !project_id) throw new Error("action и project_id обязательны");

    // verify ownership of project
    const { data: project } = await admin.from("projects").select("id, user_id")
      .eq("id", project_id).eq("user_id", user.id).single();
    if (!project) return new Response(JSON.stringify({ error: "Проект не найден" }), { status: 404, headers: corsHeaders });

    if (action === "delete") {
      await admin.from("montage_segments").delete().eq("id", segment_id).eq("user_id", user.id);
      return ok({ deleted: true });
    }

    if (action === "trim") {
      const { clip_in, clip_out } = payload ?? {};
      await admin.from("montage_segments")
        .update({ clip_in, clip_out, locked: true })
        .eq("id", segment_id).eq("user_id", user.id);
      return ok({ trimmed: true });
    }

    if (action === "replace_clip") {
      const { clip_id, clip_in } = payload ?? {};
      const { data: seg } = await admin.from("montage_segments").select("*").eq("id", segment_id).single();
      const { data: clip } = await admin.from("montage_clips").select("*").eq("id", clip_id).single();
      if (!seg || !clip) throw new Error("not found");
      const dur = Number(seg.audio_end) - Number(seg.audio_start);
      const ci = Math.max(0, Number(clip_in) || 0);
      const co = Math.min(Number(clip.duration), ci + dur);
      await admin.from("montage_segments")
        .update({ clip_id, clip_in: ci, clip_out: co, locked: true, reason: "Заменено вручную" })
        .eq("id", segment_id).eq("user_id", user.id);
      return ok({ replaced: true });
    }

    if (action === "reorder") {
      const { order } = payload ?? {}; // [{id, order_index}]
      if (!Array.isArray(order)) throw new Error("order required");
      for (const it of order) {
        await admin.from("montage_segments")
          .update({ order_index: it.order_index })
          .eq("id", it.id).eq("user_id", user.id);
      }
      return ok({ reordered: true });
    }

    if (action === "regenerate") {
      // pick a different clip than the current one (round-robin among non-current clips)
      const { data: seg } = await admin.from("montage_segments").select("*").eq("id", segment_id).single();
      if (!seg) throw new Error("segment not found");
      const { data: allClips } = await admin.from("montage_clips").select("*")
        .eq("project_id", project_id).order("order_index");
      if (!allClips || allClips.length < 2) throw new Error("Нужно ≥2 клипа");

      const others = allClips.filter((c) => c.id !== seg.clip_id);
      let chosen = others[0];

      if (LOVABLE_KEY) {
        try {
          const sys = `Выбери индекс самого подходящего клипа для текста аудио-блока. Ответ JSON {"i": число}.`;
          const userMsg = JSON.stringify({
            block_text: seg.reason ? `(контекст: ${seg.reason})` : "",
            duration: Number(seg.audio_end) - Number(seg.audio_start),
            clips: others.map((c, i) => ({ i, dur: Number(c.duration), desc: (c.meta as any)?.description ?? `Клип ${i}` })),
          });
          const r = await fetch(LOVABLE_AI, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_KEY}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
              response_format: { type: "json_object" },
            }),
          });
          if (r.ok) {
            const j = await r.json();
            const idx = JSON.parse(j.choices?.[0]?.message?.content ?? "{}").i;
            if (typeof idx === "number" && others[idx]) chosen = others[idx];
          }
        } catch (e) { console.warn("regen AI fail", e); }
      }

      const dur = Number(seg.audio_end) - Number(seg.audio_start);
      const ci = 0;
      const co = Math.min(Number(chosen.duration), dur);
      await admin.from("montage_segments")
        .update({ clip_id: chosen.id, clip_in: ci, clip_out: co, reason: "AI: предложен другой клип" })
        .eq("id", segment_id);
      return ok({ regenerated: true, clip_id: chosen.id });
    }

    throw new Error(`Неизвестное действие: ${action}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("segment-action error", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  function ok(o: any) {
    return new Response(JSON.stringify({ success: true, ...o }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
