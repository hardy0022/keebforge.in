"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveWork } from "@/app/admin/actions/work";
import { Spinner } from "@/components/admin/ActionForm";

type ImageItem = { key: string; file: File | null; publicId: string | null; url: string };

export type WorkProjectProp = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  workPerformed: string | null;
  date: string | null;
  featured: boolean;
  active: boolean;
  sortOrder: number;
  images: { url: string; publicId?: string | null }[];
};

const CATEGORIES = ["CUSTOM_BUILD", "REPAIR", "MOD", "PCB", "MOUSE", "OTHER"] as const;

function label(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(date: string | null): string {
  return date ? new Date(date).toISOString().slice(0, 10) : "";
}

export function WorkForm({ project }: { project?: WorkProjectProp }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImageItem[]>(() =>
    (project?.images ?? []).map((img) => ({ key: `e-${img.url}`, file: null, publicId: img.publicId ?? null, url: img.url }))
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);
  const [featured, setFeatured] = useState(project?.featured ?? false);
  const [active, setActive] = useState(project?.active ?? true);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (items.length + files.length > 20) {
      setToast({ ok: false, message: "At most 20 images per project." });
      return;
    }
    setItems((prev) => [
      ...prev,
      ...files.map((f) => ({ key: `n-${f.name}-${Math.random().toString(36).slice(2, 7)}`, file: f, publicId: null, url: URL.createObjectURL(f) })),
    ]);
  }

  function removeItem(key: string) {
    if (toast) setToast(null);
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item?.publicId) setRemoved((r) => [...r, item.publicId!]);
      return prev.filter((i) => i.key !== key);
    });
  }

  function moveItem(key: string, dir: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (items.length === 0) {
      setToast({ ok: false, message: "Add at least one image." });
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (project) fd.set("id", project.id);
    fd.set("featured", featured ? "on" : "");
    fd.set("active", active ? "on" : "");
    fd.set("removedImages", JSON.stringify(removed));

    let fileIdx = 0;
    const newKeyToIdx = new Map<string, number>();
    for (const item of items) {
      if (item.file) {
        fd.append(`file-${fileIdx}`, item.file);
        newKeyToIdx.set(item.key, fileIdx);
        fileIdx++;
      }
    }
    fd.set(
      "workImages",
      JSON.stringify(
        items.map((item) =>
          item.publicId ? { publicId: item.publicId, url: item.url } : { fileIndex: newKeyToIdx.get(item.key) ?? -1 }
        )
      )
    );

    setPending(true);
    setToast(null);
    const result = await saveWork({}, fd);
    setPending(false);
    if (result.ok) {
      setToast({ ok: true, message: "Project saved" });
      router.refresh();
      router.push(`/admin/work/${result.id ?? project?.id}`);
    } else {
      setToast({ ok: false, message: result.error ?? "Unable to save the project." });
    }
  }

  return (
    <form onSubmit={onSubmit} className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ marginBottom: 0 }}>{project ? `Edit project: ${project.title}` : "New project"}</h3>
        {project && (
          <Link href={`/work/${project.slug}`}>
            View live →
          </Link>
        )}
      </div>

      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <input className="input" name="title" placeholder="Project title" defaultValue={project?.title ?? ""} required disabled={pending} />
        <input className="input" name="slug" placeholder="Slug (blank = auto)" defaultValue={project?.slug ?? ""} disabled={pending} />
        <select className="select" name="category" defaultValue={project?.category ?? "CUSTOM_BUILD"} disabled={pending}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
        <input className="input" type="date" name="date" defaultValue={fmtDate(project?.date ?? null)} disabled={pending} />
        <input className="input" name="sortOrder" type="number" min={0} defaultValue={project?.sortOrder ?? 0} title="Lower numbers appear first" disabled={pending} />
        <div className="admin-actions" style={{ margin: 0 }}>
          <button type="submit" className="btn-admin primary" disabled={pending}>
            {pending ? <Spinner /> : project ? "Save changes" : "Create project"}
          </button>
        </div>
      </div>

      <div>
        <div className="muted" style={{ fontSize: "0.78rem", marginBottom: 8 }}>
          Images — first image is the cover. Click arrows to reorder, × to remove.
        </div>
        <div className="work-image-grid">
          {items.map((item, i) => (
            <div key={item.key} className="work-image-tile">
              <img src={item.url} alt="" />
              <div className="work-image-controls">
                <button type="button" className="btn-admin" aria-label="Move earlier" onClick={() => moveItem(item.key, -1)} disabled={pending || i === 0}>
                  ←
                </button>
                <button type="button" className="btn-admin" aria-label="Move later" onClick={() => moveItem(item.key, 1)} disabled={pending || i === items.length - 1}>
                  →
                </button>
                <button type="button" className="btn-admin" style={{ color: "var(--err)" }} aria-label="Remove image" onClick={() => removeItem(item.key)} disabled={pending}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <label className="work-image-add" role="button">
            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} disabled={pending} />
            <span>+ Add images</span>
          </label>
        </div>
        {removed.length > 0 && <div className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>{removed.length} image(s) will be deleted on save.</div>}
      </div>

      <textarea className="textarea" name="description" placeholder="Short description" defaultValue={project?.description ?? ""} required style={{ minHeight: 70 }} disabled={pending} />
      <textarea className="textarea" name="workPerformed" placeholder="Work performed (optional)" defaultValue={project?.workPerformed ?? ""} style={{ minHeight: 70 }} disabled={pending} />

      <div className="flex items-center gap-4" style={{ fontSize: "0.85rem" }}>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} disabled={pending} /> Featured
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={pending} /> Published
        </label>
      </div>

      {toast && (
        <div className={`kf-toast ${toast.ok ? "ok" : "err"}`} role="status">
          {toast.ok ? `✓ ${toast.message}` : `✕ ${toast.message}`}
        </div>
      )}
    </form>
  );
}