export default function CartLoading() {
  const line = (w: string, mt = 10) => (
    <div
      className="skeleton"
      style={{ width: w, height: 14, borderRadius: "var(--r-sm)", marginTop: mt }}
    />
  );
  const row = (
    <article className="cart-row">
      <div className="cart-row-product">
        <div
          className="skeleton"
          style={{ width: 100, aspectRatio: "16/10", borderRadius: "var(--r-sm)", flexShrink: 0 }}
        />
        <div className="cart-row-details" style={{ flex: 1 }}>
          {line("58%")}
          {line("34%", 8)}
          {line("46%", 8)}
        </div>
      </div>
      <div style={{ justifySelf: "center" }}>
        <div className="skeleton" style={{ width: 84, height: 34, borderRadius: "var(--r-md)" }} />
      </div>
      <div style={{ justifySelf: "end" }}>
        <div className="skeleton" style={{ width: 72, height: 16, borderRadius: "var(--r-sm)" }} />
      </div>
    </article>
  );

  return (
    <main>
      <section className="pt-[calc(var(--nav-h)+40px)] pb-8">
        <div className="wrap">
          <div className="skeleton" style={{ width: 200, height: 34, borderRadius: "var(--r-md)" }} />
          <div className="skeleton" style={{ width: 320, height: 14, borderRadius: "var(--r-sm)", marginTop: 14 }} />
        </div>
      </section>
      <section className="svc-section pt-0">
        <div className="wrap">
          <div className="cart-layout">
            <div className="cart-list">
              <div className="cart-col-headings">
                <span>Product</span>
                <span>Quantity</span>
                <span>Total</span>
              </div>
              {row}
              {row}
            </div>
            <aside className="cart-summary">
              <div className="skeleton" style={{ height: 200, borderRadius: "var(--r-lg)" }} />
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
