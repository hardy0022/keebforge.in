"use client";

import { useActionState, useState } from "react";
import {
  deleteProductColorOption,
  saveProductColorOption,
  saveProductSecondaryColorHeading,
  type CatalogActionState,
} from "@/app/admin/actions/catalog";

type ColorGroup = "BASE" | "SECONDARY";

type ColorOption = {
  id: string;
  name: string;
  colorCode: string;
  priceAdjustment: number;
  imageUrl: string | null;
  imagePublicId: string | null;
  enabled: boolean;
  sortOrder: number;
  group: ColorGroup;
};

export function ProductColorOptions({
  productId,
  colorOptions,
  secondaryColorHeading,
}: {
  productId: string;
  colorOptions: ColorOption[];
  secondaryColorHeading: string | null;
}) {
  const [saveState, saveAction, saving] = useActionState<
    CatalogActionState,
    FormData
  >(saveProductColorOption, {});
  const [headingState, headingAction, savingHeading] = useActionState<
    CatalogActionState,
    FormData
  >(saveProductSecondaryColorHeading, {});
  const [delState, delAction, deleting] = useActionState<
    CatalogActionState,
    FormData
  >(deleteProductColorOption, {});
  const [editing, setEditing] = useState<ColorOption | null>(null);
  const [addingGroup, setAddingGroup] = useState<ColorGroup | null>(null);

  const formOpen = addingGroup !== null || editing !== null;

  const reset = () => {
    setAddingGroup(null);
    setEditing(null);
  };

  const startAdding = (group: ColorGroup) => {
    setAddingGroup(group);
    setEditing(null);
  };

  return (
    <section
      className="admin-card"
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ marginBottom: 0 }}>Color Options</h3>
          <p className="muted" style={{ fontSize: "0.75rem", margin: 0 }}>
            Base colors and an optional second color section with its own
            admin-defined heading. Circular swatches, single select. Image and
            price per color.
          </p>
        </div>
      </div>

      {(saveState.error || delState.error) && (
        <p style={{ color: "var(--err)", fontSize: "0.8rem", margin: 0 }}>
          {saveState.error || delState.error}
        </p>
      )}
      {saveState.ok && (
        <p style={{ color: "var(--acc)", fontSize: "0.8rem", margin: 0 }}>
          ✓ Color option saved
        </p>
      )}

      {formOpen && (
        <form
          action={saveAction}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 12,
            border: "1px solid var(--bdr)",
            borderRadius: 8,
            background: "var(--bg2)",
          }}
        >
          <input type="hidden" name="productId" value={productId} />
          {editing?.id && <input type="hidden" name="id" value={editing.id} />}
          <div
            className="admin-grid cols-2"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            }}
          >
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span
                style={{
                  fontFamily: "var(--ff-display)",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                }}
              >
                Color name
              </span>
              <input
                className="input"
                name="name"
                defaultValue={editing?.name ?? ""}
                placeholder="White"
                required
              />
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span
                style={{
                  fontFamily: "var(--ff-display)",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                }}
              >
                Color code / HEX
              </span>
              <input
                className="input"
                name="colorCode"
                defaultValue={editing?.colorCode ?? "#000000"}
                placeholder="#FFFFFF"
                required
              />
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span
                style={{
                  fontFamily: "var(--ff-display)",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                }}
              >
                Additional price (₹)
              </span>
              <input
                className="input"
                type="number"
                name="priceAdjustment"
                min={0}
                step="1"
                defaultValue={
                  editing ? editing.priceAdjustment / 100 : 0
                }
              />
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span
                style={{
                  fontFamily: "var(--ff-display)",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                }}
              >
                Display order
              </span>
              <input
                className="input"
                type="number"
                name="sortOrder"
                defaultValue={editing?.sortOrder ?? colorOptions.length}
              />
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span
                style={{
                  fontFamily: "var(--ff-display)",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--t3)",
                }}
              >
                Section
              </span>
              <select
                className="input"
                name="group"
                defaultValue={editing?.group ?? addingGroup ?? "BASE"}
              >
                <option value="BASE">Base colors</option>
                <option value="SECONDARY">Second color section</option>
              </select>
            </label>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
                <span
                  style={{
                    fontFamily: "var(--ff-display)",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--t3)",
                  }}
                >
                  Image URL (assigned to this color)
                </span>
                <input
                  className="input"
                  name="imageUrl"
                  defaultValue={editing?.imageUrl ?? ""}
                  placeholder="https://..."
                />
              </label>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={editing?.enabled ?? true}
                />
                <span>Enabled</span>
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-admin sm primary" disabled={saving}>
              {saving ? "Saving…" : "Save color"}
            </button>
            <button
              type="button"
              className="btn-admin sm"
              onClick={reset}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {(
          [
            { key: "BASE" as const, label: "Base colors" },
            {
              key: "SECONDARY" as const,
              label: secondaryColorHeading?.trim() || "Second color section",
            },
          ]
        ).map((section) => {
          const items = colorOptions
            .filter((c) => (c.group ?? "BASE") === section.key)
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <div
              key={section.key}
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                {section.key === "SECONDARY" ? (
                  <form
                    action={headingAction}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flex: 1,
                      flexWrap: "wrap",
                    }}
                  >
                    <input type="hidden" name="productId" value={productId} />
                    <input
                      className="input"
                      name="secondaryColorHeading"
                      defaultValue={secondaryColorHeading ?? ""}
                      placeholder="Section heading (e.g. Keycaps Color)"
                      aria-label="Second color section heading"
                      style={{ maxWidth: 320 }}
                    />
                    <button
                      className="btn-admin sm"
                      disabled={savingHeading}
                    >
                      {savingHeading ? "Saving…" : "Save heading"}
                    </button>
                    {headingState.error ? (
                      <span
                        style={{ color: "var(--err)", fontSize: "0.75rem" }}
                      >
                        {headingState.error}
                      </span>
                    ) : null}
                    {headingState.ok ? (
                      <span
                        style={{ color: "var(--acc)", fontSize: "0.75rem" }}
                      >
                        ✓ Saved
                      </span>
                    ) : null}
                  </form>
                ) : (
                  <div
                    style={{
                      fontFamily: "var(--ff-display)",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--t3)",
                    }}
                  >
                    {section.label}
                  </div>
                )}
                {!formOpen && (
                  <button
                    type="button"
                    className="btn-admin sm"
                    onClick={() => startAdding(section.key)}
                  >
                    + Add color
                  </button>
                )}
              </div>
              {items.length === 0 && (
                <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
                  No colors in this section yet.
                </p>
              )}
              {items.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "8px 10px",
                      border: "1px solid var(--bdr)",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: c.colorCode,
                          border: "1px solid var(--bdr-h)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          {c.colorCode} · +
                          {(c.priceAdjustment / 100).toLocaleString("en-IN")}₹ ·{" "}
                          {c.enabled ? "Enabled" : "Disabled"}
                          {c.imageUrl ? " · image assigned" : ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn-admin sm"
                        onClick={() => {
                          setEditing(c);
                          setAddingGroup(null);
                        }}
                        disabled={saving || deleting}
                      >
                        Edit
                      </button>
                      <form action={delAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input
                          type="hidden"
                          name="productId"
                          value={productId}
                        />
                        <button
                          className="btn-admin sm"
                          disabled={saving || deleting}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
    </section>
  );
}
