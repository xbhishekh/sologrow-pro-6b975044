import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, Send } from "lucide-react";

type TgPopup = {
  id: string;
  enabled: boolean;
  telegram_url: string;
  title: string;
  description: string;
  note: string;
  button_text: string;
  repeat_minutes: number;
};

export default function AdminTelegramPopup() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<TgPopup | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [repeat, setRepeat] = useState(10);

  const apply = (r: TgPopup) => {
    setRow(r);
    setEnabled(r.enabled);
    setUrl(r.telegram_url || "");
    setTitle(r.title || "");
    setDescription(r.description || "");
    setNote(r.note || "");
    setButtonText(r.button_text || "");
    setRepeat(r.repeat_minutes ?? 10);
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("telegram_popup_settings" as never)
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    if (!data) {
      const { data: ins, error: insErr } = await supabase
        .from("telegram_popup_settings" as never)
        .insert({ enabled: false } as never)
        .select("*")
        .single();
      if (insErr) {
        toast.error(insErr.message);
        setLoading(false);
        return;
      }
      apply(ins as unknown as TgPopup);
    } else {
      apply(data as unknown as TgPopup);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (overrideEnabled?: boolean) => {
    if (!row) return;
    setSaving(true);
    const payload = {
      enabled: overrideEnabled ?? enabled,
      telegram_url: url.trim(),
      title: title.trim(),
      description: description.trim(),
      note: note.trim(),
      button_text: buttonText.trim() || "Join Telegram Channel",
      repeat_minutes: Math.max(0, Number(repeat) || 0),
    };
    const { error } = await supabase
      .from("telegram_popup_settings" as never)
      .update(payload as never)
      .eq("id", row.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(payload.enabled ? "Telegram popup ON — users ko dikhega" : "Telegram popup OFF");
    load();
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Telegram Join Popup</h1>
            <p className="text-sm text-muted-foreground">Users ko dikhne wala Telegram popup control karein</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <Label className="text-sm font-semibold">Popup Enabled</Label>
                  <p className="text-xs text-muted-foreground">
                    {enabled ? "ON — sabhi users ko popup dikh raha hai" : "OFF — kisi user ko popup nahi dikhega"}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => { setEnabled(v); save(v); }}
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label>Telegram Channel URL</Label>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://telegram.me/yourchannel" />
              </div>

              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Note Box Text</Label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Button Text</Label>
                  <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Repeat (minutes)</Label>
                  <Input type="number" min={0} value={repeat} onChange={(e) => setRepeat(Number(e.target.value))} />
                </div>
              </div>

              <Button onClick={() => save()} disabled={saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}