import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw, ArrowUp, AlignVerticalJustifyCenter, ArrowDown, Wand2, Save } from "lucide-react";
import {
  STYLE_LIST, STYLES, StyleId, SubtitleStyle, FONT_OPTIONS,
  DEFAULT_CUSTOM_STYLE, loadCustomStyle, saveCustomStyle,
} from "@/lib/styles";
import { useEffect, useState, ReactNode } from "react";
import { toast } from "sonner";

interface Props {
  styleId: StyleId;
  onPick: (id: StyleId) => void;
  onCustomChange: (s: SubtitleStyle) => void;
  words: Word[];
  onWordsChange: (words: Word[]) => void | Promise<void>;
  subtitleY: number;
  onSubtitleYChange: (y: number) => void;
  trigger?: ReactNode;
  defaultTab?: "presets" | "custom" | "text";
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

interface Word { text: string; start: number; end: number; }

export const StylePanel = ({
  styleId, onPick, onCustomChange,
  words, onWordsChange,
  subtitleY, onSubtitleYChange,
  trigger, defaultTab = "presets",
  open, onOpenChange,
}: Props) => {
  const [custom, setCustom] = useState<SubtitleStyle>(() => loadCustomStyle());
  const [tab, setTab] = useState<"presets" | "custom" | "text">(defaultTab);
  const [subtitleText, setSubtitleText] = useState(() => words.map((w) => w.text).join(" "));

  useEffect(() => { setTab(defaultTab); }, [defaultTab, open]);
  useEffect(() => { onCustomChange(custom); }, [custom, onCustomChange]);
  useEffect(() => { if (open) setSubtitleText(words.map((w) => w.text).join(" ")); }, [words, open]);

  const update = <K extends keyof SubtitleStyle>(key: K, value: SubtitleStyle[K]) => {
    const base = styleId === "custom" ? custom : STYLES[styleId].subtitleStyle;
    const next = { ...base, [key]: value };
    setCustom(next);
    saveCustomStyle(next);
    if (styleId !== "custom") onPick("custom");
  };

  const activeStyle: SubtitleStyle = styleId === "custom" ? custom : STYLES[styleId].subtitleStyle;

  const normalizeText = () => setSubtitleText((text) => text.replace(/\s+/g, " ").trim());
  const saveText = async () => {
    const nextText = subtitleText.replace(/\s+/g, " ").trim();
    if (!nextText || words.length === 0) return;
    const tokens = nextText.split(" ");
    const firstStart = words[0]?.start ?? 0;
    const lastEnd = words.at(-1)?.end ?? firstStart + tokens.length * 0.35;
    const total = Math.max(0.1, lastEnd - firstStart);
    const nextWords = tokens.map((text, i) => {
      const existing = words[i];
      if (existing && tokens.length === words.length) return { ...existing, text };
      const start = firstStart + (total * i) / tokens.length;
      const end = firstStart + (total * (i + 1)) / tokens.length;
      return { text, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) };
    });
    setSubtitleText(nextText);
    await onWordsChange(nextWords);
    toast.success("Титры обновлены");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="h-10 justify-start w-full">
            🎨 <span className="ml-2 text-sm">Субтитры</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[440px] overflow-y-auto p-0">
        <SheetHeader className="px-5 py-4 border-b border-border/40">
          <SheetTitle>Субтитры</SheetTitle>
        </SheetHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="px-5 pt-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="presets">Стили</TabsTrigger>
            <TabsTrigger value="custom">Настройка</TabsTrigger>
            <TabsTrigger value="text">Текст</TabsTrigger>
          </TabsList>

          {/* PRESETS */}
          <TabsContent value="presets" className="mt-4">
            <div className="grid grid-cols-2 gap-2.5">
              {STYLE_LIST.filter((s) => s.id !== "custom").map((s) => {
                const ss = s.subtitleStyle;
                const active = styleId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => onPick(s.id)}
                    className={`relative h-24 rounded-lg border overflow-hidden flex items-center justify-center px-2 transition-smooth ${
                      active ? "border-primary ring-2 ring-primary/40" : "border-border/60 hover:border-primary/60"
                    }`}
                    style={{ background: "#1a1a1a" }}
                  >
                    <span
                      className="text-center"
                      style={{
                        fontFamily: `"${ss.fontFamily}", system-ui, sans-serif`,
                        fontWeight: ss.fontWeight,
                        fontSize: 22,
                        color: ss.color,
                        textTransform: ss.uppercase ? "uppercase" : "none",
                        WebkitTextStroke: ss.strokeWidth > 0 ? `${Math.min(ss.strokeWidth, 2)}px ${ss.strokeColor}` : undefined,
                        textShadow: ss.shadowBlur > 0 ? `0 2px ${Math.min(ss.shadowBlur, 8)}px ${ss.shadowColor}` : undefined,
                        background: ss.background !== "transparent" ? ss.background : undefined,
                        padding: ss.background !== "transparent" ? "2px 8px" : undefined,
                        borderRadius: 4,
                        lineHeight: 1.1,
                      }}
                    >
                      Sample <span style={{ color: ss.highlightColor }}>word</span>
                    </span>
                    <span className="absolute top-1 left-1.5 text-[10px] font-medium text-white/70">{s.emoji} {s.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              Кликни «Настройка» чтобы доработать выбранный стиль
            </p>
          </TabsContent>

          {/* CUSTOM */}
          <TabsContent value="custom" className="mt-4 pb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground">Изменения сохраняются автоматически</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs"
                onClick={() => { setCustom(DEFAULT_CUSTOM_STYLE); saveCustomStyle(DEFAULT_CUSTOM_STYLE); toast.success("Сброшено"); }}>
                <RotateCcw className="h-3 w-3 mr-1" /> Сброс
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs">Шрифт</Label>
                <Select value={custom.fontFamily} onValueChange={(v) => update("fontFamily", v as any)}>
                  <SelectTrigger className="mt-1.5 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        <span style={{ fontFamily: `"${f.value}"` }}>{f.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Отступ слов</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{activeStyle.wordGap ?? 8}px</span>
                  </div>
                  <Slider value={[activeStyle.wordGap ?? 8]} min={0} max={28} step={1} className="mt-2"
                    onValueChange={(v) => update("wordGap", v[0])} />
                </div>
                <div>
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Отступ плашки</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{activeStyle.paddingX ?? 14}px</span>
                  </div>
                  <Slider value={[activeStyle.paddingX ?? 14]} min={0} max={36} step={1} className="mt-2"
                    onValueChange={(v) => update("paddingX", v[0])} />
                </div>
              </div>

              {/* Position Y */}
              <div>
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Позиция по вертикали</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{Math.round(subtitleY)}%</span>
                </div>
                <Slider value={[subtitleY]} min={5} max={95} step={1} className="mt-2"
                  onValueChange={(v) => onSubtitleYChange(v[0])} />
                <div className="grid grid-cols-3 gap-1.5 mt-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onSubtitleYChange(12)}>
                    <ArrowUp className="h-3 w-3 mr-1" /> Сверху
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onSubtitleYChange(50)}>
                    <AlignVerticalJustifyCenter className="h-3 w-3 mr-1" /> Центр
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onSubtitleYChange(85)}>
                    <ArrowDown className="h-3 w-3 mr-1" /> Снизу
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">💡 Можно перетаскивать прямо на превью</p>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Слов на экране</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{custom.maxWords ?? 2}</span>
                </div>
                <Slider value={[custom.maxWords ?? 2]} min={1} max={4} step={1} className="mt-2"
                  onValueChange={(v) => update("maxWords", v[0])} />
                <p className="text-[10px] text-muted-foreground mt-1.5">💡 1-2 слова = вирусный TikTok-стиль</p>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Размер</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{custom.fontSize}px</span>
                </div>
                <Slider value={[custom.fontSize]} min={14} max={84} step={1} className="mt-2"
                  onValueChange={(v) => update("fontSize", v[0])} />
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Жирность</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{custom.fontWeight}</span>
                </div>
                <Slider value={[custom.fontWeight]} min={100} max={900} step={100} className="mt-2"
                  onValueChange={(v) => update("fontWeight", v[0])} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ColorPick label="Цвет текста" value={custom.color} onChange={(v) => update("color", v)} />
                <ColorPick label="Подсветка" value={custom.highlightColor} onChange={(v) => update("highlightColor", v)} />
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Обводка</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{custom.strokeWidth}px</span>
                </div>
                <Slider value={[custom.strokeWidth]} min={0} max={6} step={0.5} className="mt-2"
                  onValueChange={(v) => update("strokeWidth", v[0])} />
                {custom.strokeWidth > 0 && (
                  <div className="mt-2">
                    <ColorPick label="Цвет обводки" value={custom.strokeColor} onChange={(v) => update("strokeColor", v)} />
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <Label className="text-xs">Тень</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{custom.shadowBlur}px</span>
                </div>
                <Slider value={[custom.shadowBlur]} min={0} max={30} step={1} className="mt-2"
                  onValueChange={(v) => update("shadowBlur", v[0])} />
              </div>

              <div>
                <Label className="text-xs">Фон-плашка</Label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  {[
                    { v: "transparent", l: "Нет" },
                    { v: "rgba(0,0,0,0.55)", l: "Тёмная" },
                    { v: "rgba(255,255,255,0.85)", l: "Светлая" },
                  ].map((o) => (
                    <button key={o.v} onClick={() => update("background", o.v)}
                      className={`text-xs h-9 rounded-md border ${
                        custom.background === o.v ? "border-primary bg-primary/5" : "border-border/60"
                      }`}>{o.l}</button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-md bg-surface-1">
                <Label className="text-sm">ВЕРХНИЙ РЕГИСТР</Label>
                <Switch checked={custom.uppercase} onCheckedChange={(v) => update("uppercase", v)} />
              </div>

              {/* Live preview */}
              <div className="rounded-lg bg-black p-6 flex items-center justify-center min-h-[120px]">
                <span style={{
                  fontFamily: `"${activeStyle.fontFamily}", system-ui, sans-serif`,
                  fontSize: `${Math.min(activeStyle.fontSize, 40)}px`,
                  fontWeight: activeStyle.fontWeight,
                  color: activeStyle.color,
                  WebkitTextStroke: activeStyle.strokeWidth > 0 ? `${activeStyle.strokeWidth}px ${activeStyle.strokeColor}` : undefined,
                  textShadow: activeStyle.shadowBlur > 0 ? `0 4px ${activeStyle.shadowBlur}px ${activeStyle.shadowColor}` : undefined,
                  textTransform: activeStyle.uppercase ? "uppercase" : "none",
                  background: activeStyle.background !== "transparent" ? activeStyle.background : undefined,
                  padding: activeStyle.background !== "transparent" ? "6px 12px" : undefined,
                  borderRadius: 8,
                  lineHeight: 1.15,
                  textAlign: "center",
                }}>
                  Привет <span style={{ color: activeStyle.highlightColor }}>мир</span>!
                </span>
              </div>
            </div>
          </TabsContent>

          {/* TEXT */}
          <TabsContent value="text" className="mt-4 pb-6">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Текст титров</Label>
                <Textarea
                  value={subtitleText}
                  onChange={(e) => setSubtitleText(e.target.value)}
                  className="mt-1.5 min-h-[260px] text-sm leading-relaxed bg-surface-1"
                  placeholder="Текст субтитров..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={normalizeText}>
                  <Wand2 className="h-4 w-4 mr-2" /> Убрать пробелы
                </Button>
                <Button onClick={saveText} disabled={!subtitleText.trim() || words.length === 0}>
                  <Save className="h-4 w-4 mr-2" /> Сохранить
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Если меняешь количество слов, тайминги распределятся автоматически по длине ролика.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

const ColorPick = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <div className="flex gap-2 mt-1.5">
      <input type="color" value={value.startsWith("#") ? value : "#FFFFFF"}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 rounded-md border border-border bg-transparent cursor-pointer" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-xs font-mono" />
    </div>
  </div>
);
