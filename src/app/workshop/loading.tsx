export default function WorkshopLoading() {
  const line = (w: string) => (
    <div
      className="skeleton"
      style={{
        width: w,
        height: 14,
        borderRadius: "var(--r-sm)",
        marginTop: 10,
      }}
    />
  );
  const field = (w: string) => (
    <div
      className="skeleton"
      style={{
        width: w,
        height: 42,
        borderRadius: "var(--r-md)",
        flex: `1 1 ${w}`,
      }}
    />
  );

  return (
    <main className="ri-page">
      <header className="ri-hero">
        <div
          className="skeleton"
          style={{ width: 90, height: 12, borderRadius: "var(--r-sm)" }}
        />
        <div
          className="skeleton"
          style={{
            width: "min(420px, 80%)",
            height: 48,
            borderRadius: "var(--r-md)",
            marginTop: 18,
          }}
        />
        <div
          className="skeleton"
          style={{
            width: "min(520px, 90%)",
            height: 16,
            borderRadius: "var(--r-sm)",
            marginTop: 18,
          }}
        />
      </header>

      <section className="skeleton" style={{ height: 520, borderRadius: "var(--r-lg)" }}>
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 6 }}>
          {line("38%")}
          {line("55%")}
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 22,
            }}
          >
            {field("180px")}
            {field("180px")}
            {field("280px")}
          </div>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            {field("140px")}
            {field("180px")}
            {field("180px")}
          </div>
          <div className="skeleton" style={{ height: 130, borderRadius: "var(--r-md)", marginTop: 22 }} />
          <div
            className="skeleton"
            style={{ width: 180, height: 46, borderRadius: "var(--r-md)", marginTop: 18 }}
          />
        </div>
      </section>
    </main>
  );
}