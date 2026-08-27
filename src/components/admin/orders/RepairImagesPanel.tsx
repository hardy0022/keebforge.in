"use client";

import { useRef, useState } from "react";
import { cldUrl } from "@/lib/cloudinary-url";

type RepairMedia = {
  id: string;
  publicId: string;
  secureUrl: string;
  role: string;
  sortOrder: number;
};

export type RepairImagesRepair = { id: string; label: string; media: RepairMedia[] };

const ROLE_SECTIONS = [
  { role: "CUSTOMER_UPLOAD", label: "Customer uploads" },
  { role: "DIAGNOSTIC", label: "Diagnostic" },
  { role: "BEFORE", label: "Before" },
  { role: "WORK", label: "During work" },
  { role: "AFTER", label: "After" },
  { role: "FINAL", label: "Final" },
] as const;

const MAX_PER_SECTION = 8;

function mediaFor(media: RepairMedia[], role: string) {
  return media.filter((m) => m.role === role).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function RepairImagesPanel({ repairs }: { repairs: RepairImagesRepair[] }) {
  if (repairs.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "1.05rem", fontWeight: 700 }}>Repair images</h2>
      {repairs.map((r) => (
        <RepairImages key={r.id} repair={r} />
      ))}
    </div>
  );
}

function RepairImages({ repair }: { repair: RepairImagesRepair }) {
  const [media, setMedia] = useState<RepairMedia[]>(repair.media);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(0);

  async function upload(role: string, files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("entityType", "REPAIR");
      fd.set("entityId", repair.id);
      fd.set("role", role);
      busy.current += 1;
      try {
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const data = (await res.json()) as { ok?: boolean; media?: RepairMedia; error?: string };
        if (!res.ok || !data.ok || !data.media) {
          setError(data.error ?? `Could not upload ${file.name}.`);
        } else {
          setMedia((rows) => [...rows, data.media!]);
        }
      } catch {
        setError(`Could not upload ${file.name}.`);
      } finally {
        busy.current -= 1;
      }
    }
  }

  async function remove(m: RepairMedia) {
    setError(null);
    setMedia((rows) => rows.filter((x) => x.id !== m.id));
    try {
      const res = await fetch(`/api/uploads?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setMedia((rows) => [...rows, m]);
      setError("Delete failed — image restored.");
    }
  }

  return (
    <div style={{ background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: "var(--r-sm)", padding: 12 }}>
      <div className="muted" style={{ fontSize: "0.78rem", fontWeight: 600, marginBottom: 10 }}>{repair.label}</div>
      {error && (
        <p role="alert" style={{ fontSize: "0.75rem", color: "#e5484d", marginBottom: 8 }}>{error}</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
        {ROLE_SECTIONS.map(({ role, label }) => {
          const rows = mediaFor(media, role);
          return (
            <div key={role}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span className="muted" style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {label}
                </span>
                {rows.length < MAX_PER_SECTION && (
                  <label className="btn-admin sm" style={{ cursor: "pointer" }}>
                    + Add
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      multiple
                      hidden
                      onChange={(e) => {
                        void upload(role, e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              {rows.length === 0 ? (
                <div className="muted" style={{ fontSize: "0.7rem", border: "1px dashed var(--bdr)", borderRadius: 6, padding: "10px 8px", textAlign: "center" }}>
                  None yet
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {rows.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => void remove(m)}
                      title="Click to delete"
                      aria-label={`Delete ${label.toLowerCase()} image`}
                      style={{ padding: 0, border: "1px solid var(--bdr)", borderRadius: 6, overflow: "hidden", cursor: "pointer", background: "none" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail */}
                      <img src={cldUrl(m.secureUrl, 200)} alt="" width={72} height={72} style={{ display: "block", objectFit: "cover" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: "0.65rem", marginTop: 10 }}>
        Click an image to delete it from Cloudinary.
      </p>
    </div>
  );
}
