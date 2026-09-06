import { ShopGridSkeleton } from "@/components/shop/skeletons";

export default function Loading() {
  return (
    <main className="shop-page">
      <section className="shop-hero">
        <div className="wrap">
          <div className="sk" style={{ width: 90, height: 13, borderRadius: 0 }} />
          <div className="sk" style={{ width: "55%", maxWidth: 420, height: 30, marginTop: 14 }} />
          <div className="sk" style={{ width: "80%", maxWidth: 680, height: 13, marginTop: 16 }} />
          <div className="sk" style={{ width: "65%", maxWidth: 520, height: 13, marginTop: 8 }} />
        </div>
      </section>
      <section className="svc-section">
        <div className="wrap">
          <ShopGridSkeleton count={12} />
        </div>
      </section>
    </main>
  );
}