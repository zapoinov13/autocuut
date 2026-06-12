import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2, CheckCircle2 } from "lucide-react";
import { ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { SubtitleStyle } from "@/lib/styles";
import type { VideoFormat } from "./FormatPanel";

interface Word { text: string; start: number; end: number; }
interface Scene { id: string; start_time: number; end_time: number; zoom: string; highlight_words: string[]; top_video_url?: string | null; }

interface Props {
  trigger: ReactNode;
  projectTitle: string;
  videoUrl: string;
  words: Word[];
  scenes: Scene[];
  subtitleStyle: SubtitleStyle;
  format: VideoFormat;
  musicUrl?: string | null;
  musicVolume?: number;
  captionsEnabled: boolean;
  subtitleY?: number;
}

const QUALITIES = [
  { id: "720p",  label: "720p HD",       width: 720,  bitrate: 4_000_000,  desc: "~4 Mbps · быстро" },
  { id: "1080p", label: "1080p Full HD", width: 1080, bitrate: 8_000_000,  desc: "~8 Mbps · стандарт" },
  { id: "1440p", label: "1440p QHD",     width: 1440, bitrate: 14_000_000, desc: "~14 Mbps · максимум для браузера" },
];

// Загрузка видео в кросс-доменно совместимый Blob URL (чтобы canvas не был tainted)
async function loadVideoElement(src: string): Promise<HTMLVideoElement> {
  const res = await fetch(src);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.src = url;
  v.crossOrigin = "anonymous";
  v.muted = false;
  v.playsInline = true;
  await new Promise((res, rej) => {
    v.onloadedmetadata = () => res(null);
    v.onerror = () => rej(new Error("Не удалось загрузить видео"));
  });
  return v;
}

export const ExportDialog = (props: Props) => {
  const { trigger, projectTitle, videoUrl, words, scenes, subtitleStyle: sub, format, musicUrl, musicVolume = 20, captionsEnabled, subtitleY = 80 } = props;
  const [quality, setQuality] = useState("1080p");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const startExport = async () => {
    setBusy(true);
    setProgress(0);
    setDownloadUrl(null);
    cancelRef.current = false;

    try {
      const q = QUALITIES.find((x) => x.id === quality)!;
      const isLandscape = format === "landscape";
      const W = isLandscape ? Math.round(q.width * 16 / 9) : q.width;
      const H = isLandscape ? q.width : Math.round(q.width * 16 / 9);

      const mainVideo = await loadVideoElement(videoUrl);

      // Preload top videos for split scenes
      const topMap = new Map<string, HTMLVideoElement>();
      if (format === "split") {
        for (const s of scenes) {
          if (s.top_video_url) {
            try { topMap.set(s.id, await loadVideoElement(s.top_video_url)); } catch { /* ignore */ }
          }
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d", { alpha: false })!;

      // Audio: combine main video audio + music via WebAudio
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      const audioCtx = new AudioCtx();
      const dest = audioCtx.createMediaStreamDestination();

      const mainSrc = audioCtx.createMediaElementSource(mainVideo);
      const mainGain = audioCtx.createGain();
      mainGain.gain.value = 1;
      mainSrc.connect(mainGain).connect(dest);
      // also play to speakers
      mainGain.connect(audioCtx.destination);

      let musicEl: HTMLAudioElement | null = null;
      if (musicUrl) {
        musicEl = new Audio();
        musicEl.crossOrigin = "anonymous";
        musicEl.src = musicUrl;
        musicEl.loop = true;
        await new Promise((r) => { musicEl!.oncanplay = () => r(null); musicEl!.load(); });
        const mSrc = audioCtx.createMediaElementSource(musicEl);
        const mGain = audioCtx.createGain();
        mGain.gain.value = Math.min(1, Math.max(0, musicVolume / 100));
        mSrc.connect(mGain).connect(dest);
      }

      // Combine canvas video stream + audio
      const videoStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      // Pick supported mime
      const mimeCandidates = [
        "video/mp4;codecs=h264",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";

      const recorder = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: q.bitrate,
        audioBitsPerSecond: 192_000,
      });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const stopPromise = new Promise<void>((res) => { recorder.onstop = () => res(); });

      recorder.start(1000);

      mainVideo.currentTime = 0;
      await mainVideo.play();
      if (musicEl) { musicEl.currentTime = 0; musicEl.play(); }

      const totalDuration = mainVideo.duration;

      // Render loop
      const drawFrame = () => {
        if (cancelRef.current || mainVideo.ended || mainVideo.currentTime >= totalDuration) {
          recorder.stop();
          mainVideo.pause();
          if (musicEl) musicEl.pause();
          return;
        }
        const t = mainVideo.currentTime;
        const scene = scenes.find((s) => t >= s.start_time && t < s.end_time);

        // background
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);

        // zoom
        let scale = 1;
        if (scene) {
          const p = (t - scene.start_time) / Math.max(0.01, scene.end_time - scene.start_time);
          if (scene.zoom === "in") scale = 1 + p * 0.15;
          if (scene.zoom === "out") scale = 1.15 - p * 0.15;
        }

        if (format === "split") {
          // Top half — top video for active scene
          const halfH = H / 2;
          const topV = scene?.id ? topMap.get(scene.id) : undefined;
          if (topV) {
            try {
              if (topV.paused) topV.play().catch(() => {});
              drawCover(ctx, topV, 0, 0, W, halfH, 1);
            } catch { /* ignore */ }
          }
          // Bottom half — main video
          drawCover(ctx, mainVideo, 0, halfH, W, halfH, scale);
        } else {
          drawCover(ctx, mainVideo, 0, 0, W, H, scale);
        }

        // Subtitles
        if (captionsEnabled) {
          drawSubtitles(ctx, words, t, scene, sub, W, H, subtitleY);
        }

        setProgress(Math.min(99, (t / totalDuration) * 100));
        requestAnimationFrame(drawFrame);
      };
      drawFrame();

      await stopPromise;

      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setProgress(100);

      // auto download
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectTitle || "video"}-${quality}.${ext}`;
      a.click();

      toast.success("Экспорт готов!", { description: `Файл ${quality} скачан` });
    } catch (e: any) {
      console.error(e);
      toast.error("Ошибка экспорта", { description: e.message ?? "Неизвестная ошибка" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" /> Экспорт видео
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Качество</Label>
            <div className="space-y-2 mt-2">
              {QUALITIES.map((q) => (
                <button key={q.id} onClick={() => setQuality(q.id)} disabled={busy}
                  className={`w-full text-left p-3 rounded-lg border transition-smooth ${
                    quality === q.id ? "border-primary bg-primary/5" : "border-border/60 bg-surface-1"
                  }`}>
                  <p className="text-sm font-medium">{q.label}</p>
                  <p className="text-xs text-muted-foreground">{q.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground p-3 rounded-md bg-surface-1 border border-border/40">
            💡 Рендер идёт прямо в твоём браузере: бесплатно, без серверов.
            Не закрывай вкладку. Длительность: примерно равна длине видео.
          </div>

          {busy && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">Рендер: {Math.round(progress)}%</p>
            </div>
          )}

          {downloadUrl && !busy && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/30">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="text-sm flex-1">Готово!</span>
              <Button size="sm" variant="outline" asChild>
                <a href={downloadUrl} download={`${projectTitle}-${quality}.webm`}>Скачать снова</a>
              </Button>
            </div>
          )}

          <Button onClick={startExport} disabled={busy} className="w-full shadow-glow">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {busy ? "Рендер..." : "Начать экспорт"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Helpers
function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, dx: number, dy: number, dw: number, dh: number, scale = 1) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const targetRatio = dw / dh;
  const videoRatio = vw / vh;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (videoRatio > targetRatio) {
    sw = vh * targetRatio;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / targetRatio;
    sy = (vh - sh) / 2;
  }
  // apply zoom by shrinking source rect
  if (scale !== 1) {
    const newSw = sw / scale;
    const newSh = sh / scale;
    sx += (sw - newSw) / 2;
    sy += (sh - newSh) / 2;
    sw = newSw; sh = newSh;
  }
  ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawSubtitles(
  ctx: CanvasRenderingContext2D,
  words: Word[],
  t: number,
  scene: Scene | undefined,
  sub: SubtitleStyle,
  W: number,
  H: number,
  subtitleY: number,
) {
  const MAX_WORDS = (sub as any).maxWords ?? 2;
  let idx = words.findIndex((w) => t >= w.start && t < w.end);
  if (idx === -1) {
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i].end <= t && t - words[i].end < 0.25) { idx = i; break; }
    }
    if (idx === -1) {
      const up = words.findIndex((w) => w.start > t && w.start - t < 0.15);
      if (up !== -1) idx = up;
    }
  }
  if (idx === -1) return;
  const visible = words.slice(idx, idx + MAX_WORDS);
  if (!visible.length) return;

  const baseRefH = 720;
  const fontSize = Math.round(sub.fontSize * (H / baseRefH));
  const fontFam = `"${sub.fontFamily}", sans-serif`;
  ctx.font = `${sub.fontWeight} ${fontSize}px ${fontFam}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const highlightSet = new Set((scene?.highlight_words ?? []).map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")));

  const preparedWords = visible.map((w) => ({
    raw: w.text,
    text: sub.uppercase ? w.text.toUpperCase() : w.text,
    active: t >= w.start && t < w.end,
  }));
  const wordGap = Math.round((sub.wordGap ?? 8) * (H / 720));
  const text = preparedWords.map((w) => w.text).join(" ");

  const maxWidth = W * 0.9;
  const lines: string[] = [];
  const wordsArr = text.split(" ");
  let cur = "";
  for (const w of wordsArr) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);

  const lineH = fontSize * 1.2;
  const totalH = lines.length * lineH;
  const measureLine = (line: string) => {
    const parts = line.split(" ").filter(Boolean);
    return parts.reduce((sum, part) => sum + ctx.measureText(part).width, 0) + Math.max(0, parts.length - 1) * (ctx.measureText(" ").width + wordGap);
  };

  const cy = (subtitleY / 100) * H;

  // background
  if (sub.background && sub.background !== "transparent") {
    ctx.fillStyle = sub.background;
    const padX = Math.round((sub.paddingX ?? fontSize * 0.4) * (H / 720));
    const padY = Math.round((sub.paddingY ?? fontSize * 0.25) * (H / 720));
    const maxLineW = Math.max(...lines.map(measureLine));
    const bx = (W - maxLineW) / 2 - padX;
    const by = cy - totalH / 2 - padY;
    ctx.fillRect(bx, by, maxLineW + padX * 2, totalH + padY * 2);
  }

  let visibleWordIndex = 0;
  lines.forEach((line, i) => {
    const y = cy - totalH / 2 + lineH / 2 + i * lineH;
    // shadow
    if (sub.shadowBlur > 0) {
      ctx.shadowColor = sub.shadowColor;
      ctx.shadowBlur = sub.shadowBlur;
      ctx.shadowOffsetY = 4;
    } else {
      ctx.shadowBlur = 0;
    }

    // word-by-word color (highlight)
    const lineWords = line.split(" ");
    const lineW = measureLine(line);
    let xCursor = (W - lineW) / 2;
    const spaceW = ctx.measureText(" ").width + wordGap;

    for (const w of lineWords) {
      const cleaned = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      const sourceWord = preparedWords[visibleWordIndex++];
      const isHl = Boolean(sourceWord?.active) || highlightSet.has(cleaned);
      const color = isHl ? sub.highlightColor : sub.color;
      const wW = ctx.measureText(w).width;
      const xCenter = xCursor + wW / 2;

      // stroke
      if (sub.strokeWidth > 0) {
        ctx.strokeStyle = sub.strokeColor;
        ctx.lineWidth = sub.strokeWidth;
        ctx.lineJoin = "round";
        ctx.strokeText(w, xCenter, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(w, xCenter, y);

      xCursor += wW + spaceW;
    }

    ctx.shadowBlur = 0;
  });
}
