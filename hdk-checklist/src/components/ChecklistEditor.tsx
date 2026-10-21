import { useEffect, useState } from "react";
import type { CheckKind, ChecklistItemConfig, ChecklistSectionConfig, ItemInputType } from "../types";
import { getChecklistConfig, saveChecklistConfig } from "../storage";
import { defaultChecklistConfig, itemType } from "../checklistData";
import { CHECK_KINDS, KIND_LABEL } from "../checkKinds";
import { compressImage } from "../evidenceUtils";
import { draftGuides } from "../guideAI";
import { confirmDialog, toast } from "../dialogs";

interface Props {
  onAuthLost: () => void;
}

const TYPE_LABELS: Record<ItemInputType, string> = {
  status: "OK / NOK / U/S / N/A",
  number: "Number",
  text: "Text",
};

// New ids never collide with the built-in "<section>-<index>" ids, so history stays matched
const newId = (prefix: string) => `${prefix}-x${crypto.randomUUID().slice(0, 8)}`;

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export default function ChecklistEditor({ onAuthLost }: Props) {
  const [kind, setKind] = useState<CheckKind>("daily");
  const [config, setConfig] = useState<ChecklistSectionConfig[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Sections opened in the editor, and the item search
  const [openSet, setOpenSet] = useState<Record<string, boolean>>({});
  const [find, setFind] = useState("");
  // Items whose guide editor is open, and the section the AI is drafting for
  const [guideOpen, setGuideOpen] = useState<Record<string, boolean>>({});
  const [drafting, setDrafting] = useState<string | null>(null);

  useEffect(() => {
    let current = true; // ignore a slow load for a checklist we've since switched away from
    getChecklistConfig(kind).then((cfg) => current && setConfig(cfg.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it, type: itemType(it) })) }))));
    return () => { current = false; };
  }, [kind]);

  async function switchKind(next: CheckKind) {
    if (next === kind) return;
    if (dirty && !await confirmDialog({ title: "Discard unsaved changes?", message: `Your changes to the ${kind} checklist haven't been saved.`, confirmLabel: "Discard", danger: true })) return;
    setConfig(null);
    setDirty(false);
   
    setOpenSet({});
    setKind(next);
  }

  const kindPicker = (
    <div className="kind-tabs" style={{ padding: 0, margin: "16px 0 0" }}>
      {CHECK_KINDS.map((k) => (
        <button key={k} className={`kind-tab${k === kind ? " active" : ""}`} onClick={() => switchKind(k)}>{KIND_LABEL[k]}</button>
      ))}
    </div>
  );

  if (!config) return (
    <div className="checklist-editor">
      {kindPicker}
      <p style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading checklist…</p>
    </div>
  );

  function update(next: ChecklistSectionConfig[]) {
    setConfig(next);
    setDirty(true);
   
  }

  function updateSection(si: number, patch: Partial<ChecklistSectionConfig>) {
    update(config!.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  }

  function updateItem(si: number, ii: number, patch: Partial<ChecklistItemConfig>) {
    updateSection(si, { items: config![si].items.map((it, i) => (i === ii ? { ...it, ...patch } : it)) });
  }

  async function addRefPhoto(si: number, ii: number, file?: File) {
    if (!file) return;
    try { updateItem(si, ii, { refPhoto: await compressImage(file) }); }
    catch { toast("Couldn't read that photo.", "error"); }
  }

  /** AI drafts the "what to check" text for items in the section that have none; the admin reviews it */
  async function draftSection(si: number) {
    const sec = config![si];
    const missing = sec.items.filter((it) => it.label.trim() && !it.guide?.trim());
    if (missing.length === 0) { toast("Every item in this section already has a guide."); return; }
    setDrafting(sec.id);
   
    try {
      const drafts = await draftGuides(sec.title, missing);
      updateSection(si, { items: sec.items.map((it) => (drafts[it.id] && !it.guide?.trim() ? { ...it, guide: drafts[it.id] } : it)) });
      setGuideOpen((g) => ({ ...g, ...Object.fromEntries(Object.keys(drafts).map((id) => [id, true])) }));
      toast(`Drafted ${Object.keys(drafts).length} guides. Check each one, add the location and a photo, then Save.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI draft failed.", "error");
    }
    setDrafting(null);
  }

  async function persist(next: ChecklistSectionConfig[] | null, okText: string) {
    setSaving(true);
    try {
      await saveChecklistConfig(next, kind);
      setDirty(false);
      toast(okText);
    } catch (e) {
      const text = e instanceof Error ? e.message : "Save failed.";
      if (/signed in|expired/i.test(text)) onAuthLost();
      toast(text, "error");
    }
    setSaving(false);
  }

  function save() {
    const cleaned = config!
      .map((s) => ({ ...s, title: s.title.trim(), items: s.items.filter((it) => it.label.trim()).map((it) => ({
        ...it, label: it.label.trim(), guide: it.guide?.trim() || undefined, location: it.location?.trim() || undefined,
      })) }))
      .filter((s) => s.title && s.items.length > 0);
    setConfig(cleaned);
    persist(cleaned, `${KIND_LABEL[kind]} checklist saved. New inspections use it now.`);
  }

  async function reset() {
    if (!await confirmDialog({ title: `Reset the ${kind} checklist?`, message: "It goes back to the built-in default. Your items, guides and photos for this checklist will be lost.", confirmLabel: "Reset", danger: true })) return;
    setConfig(defaultChecklistConfig(kind));
    persist(null, "Checklist reset to default.");
  }

  const total = config.reduce((a, s) => a + s.items.length, 0);

  const q = find.trim().toLowerCase();
  const matches = (it: ChecklistItemConfig) => !q || [it.label, it.guide, it.location].some((v) => v?.toLowerCase().includes(q));
  const withGuide = config.reduce((a, s) => a + s.items.filter((it) => it.guide || it.location || it.refPhoto).length, 0);
  const isOpen = (id: string) => !!q || !!openSet[id];

  return (
    <div className="checklist-editor">
      {kindPicker}
      <div className="editor-bar" style={{ marginTop: 12 }}>
        <div>
          <strong>{KIND_LABEL[kind]} checklist</strong>
          <span className="editor-sub">{config.length} sections · {total} items · {withGuide} with a guide</span>
        </div>
        <div className="editor-actions">
          <button className="btn-small" onClick={reset} disabled={saving}>Reset</button>
          <button className="btn-export" onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      <p className="editor-hint">Changes apply to new inspections. Past logs and PDFs keep the items they were recorded with.</p>
      <div className="editor-tools">
        <input className="filter-input" type="search" placeholder="Find an item" value={find} onChange={(e) => setFind(e.target.value)} />
        <button className="btn-small" onClick={() => setOpenSet(Object.fromEntries(config.map((s) => [s.id, true])))}>Expand all</button>
        <button className="btn-small" onClick={() => setOpenSet({})}>Collapse all</button>
      </div>

      {config.map((sec, si) => (q && !sec.items.some(matches)) ? null : (
        <div key={sec.id} className="editor-section">
          <div className="editor-section-head">
            <button className="editor-toggle" onClick={() => setOpenSet((o) => ({ ...o, [sec.id]: !o[sec.id] }))}>{isOpen(sec.id) ? "▾" : "▸"}</button>
            <input className="editor-title" value={sec.title} placeholder="Section title" onChange={(e) => updateSection(si, { title: e.target.value })} />
            <span className="editor-count">{sec.items.length}</span>
            <button className="icon-btn" title="Move up" onClick={() => update(move(config, si, -1))}>↑</button>
            <button className="icon-btn" title="Move down" onClick={() => update(move(config, si, 1))}>↓</button>
            <button className="icon-btn danger" title="Delete section" onClick={async () => { if (await confirmDialog({ title: "Delete this section?", message: `"${sec.title || "Untitled"}" and its ${sec.items.length} item${sec.items.length === 1 ? "" : "s"} will be removed when you save.`, confirmLabel: "Delete", danger: true })) update(config.filter((_, i) => i !== si)); }}>×</button>
          </div>

          {isOpen(sec.id) && (
            <div className="editor-items">
              <button className="btn-small" style={{ alignSelf: "flex-start" }} disabled={drafting !== null} onClick={() => draftSection(si)}>
                {drafting === sec.id ? "Drafting…" : "✨ Draft missing guides with AI"}
              </button>
              {sec.items.map((it, ii) => !matches(it) ? null : (
                <div key={it.id} className="editor-item">
                  <input className="editor-label" value={it.label} placeholder="Item label" onChange={(e) => updateItem(si, ii, { label: e.target.value })} />
                  <div className="editor-item-row">
                    <select value={it.type} onChange={(e) => updateItem(si, ii, { type: e.target.value as ItemInputType })}>
                      {(Object.keys(TYPE_LABELS) as ItemInputType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                    {it.type === "number" && (
                      <>
                        <input className="editor-num" placeholder="Unit" value={it.unit ?? ""} onChange={(e) => updateItem(si, ii, { unit: e.target.value || undefined })} />
                        <input className="editor-num" type="number" step="any" placeholder="Min" value={it.min ?? ""} onChange={(e) => updateItem(si, ii, { min: e.target.value === "" ? undefined : Number(e.target.value) })} />
                        <input className="editor-num" type="number" step="any" placeholder="Max" value={it.max ?? ""} onChange={(e) => updateItem(si, ii, { max: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      </>
                    )}
                    <span className="editor-spacer" />
                    <button className="icon-btn" title="Move up" onClick={() => updateSection(si, { items: move(sec.items, ii, -1) })}>↑</button>
                    <button className="icon-btn" title="Move down" onClick={() => updateSection(si, { items: move(sec.items, ii, 1) })}>↓</button>
                    <button className="icon-btn" title="Duplicate" onClick={() => updateSection(si, { items: [...sec.items.slice(0, ii + 1), { ...it, id: newId(sec.id), label: `${it.label} (copy)` }, ...sec.items.slice(ii + 1)] })}>⧉</button>
                    <button className="icon-btn danger" title="Delete item" onClick={() => updateSection(si, { items: sec.items.filter((_, i) => i !== ii) })}>×</button>
                  </div>
                  <button className={`guide-toggle${it.guide || it.location || it.refPhoto ? " has" : ""}`} onClick={() => setGuideOpen((g) => ({ ...g, [it.id]: !g[it.id] }))}>
                    {guideOpen[it.id] ? "▾" : "▸"} Guide{it.guide || it.location || it.refPhoto ? ` · ${[it.location && "location", it.guide && "text", it.refPhoto && "photo"].filter(Boolean).join(", ")}` : " · none yet"}
                  </button>
                  {guideOpen[it.id] && (
                    <div className="guide-edit">
                      <input placeholder="Location, e.g. Engine bay, left side behind the cab" value={it.location ?? ""} onChange={(e) => updateItem(si, ii, { location: e.target.value || undefined })} />
                      <textarea rows={2} placeholder="What to check and what OK looks like" value={it.guide ?? ""} onChange={(e) => updateItem(si, ii, { guide: e.target.value || undefined })} />
                      <div className="guide-photo-row">
                        {it.refPhoto && <img src={it.refPhoto} alt="Reference" className="guide-thumb" />}
                        <label className="btn-small guide-upload">
                          {it.refPhoto ? "Change photo" : "📷 Add reference photo"}
                          <input type="file" accept="image/*" hidden onChange={(e) => { addRefPhoto(si, ii, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {it.refPhoto && <button className="btn-small" onClick={() => updateItem(si, ii, { refPhoto: undefined })}>Remove</button>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn-new" onClick={() => updateSection(si, { items: [...sec.items, { id: newId(sec.id), label: "", type: "status" }] })}>+ Add item</button>
            </div>
          )}
        </div>
      ))}

      <button className="btn-small" style={{ marginTop: 4 }} onClick={() => {
        const id = newId("s");
        update([...config, { id, title: "", items: [{ id: newId(id), label: "", type: "status" }] }]);
        setOpenSet((o) => ({ ...o, [id]: true }));
      }}>+ Add section</button>
    </div>
  );
}
