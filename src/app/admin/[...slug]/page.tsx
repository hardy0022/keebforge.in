export default async function AdminStub({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const area = slug.join("/");
  return (
    <div className="empty" style={{ marginTop: 8 }}>
      <b>🛠️ {area} module</b>
      This section ships in a later admin phase. Core build, orders, dashboard and
      order management are live — the rest is staged next.
    </div>
  );
}
