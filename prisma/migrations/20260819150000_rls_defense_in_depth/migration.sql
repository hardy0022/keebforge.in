-- KeebForge.in — Row Level Security (defense-in-depth).
-- The application accesses the DB via Prisma (table-owner role), which bypasses RLS.
-- These policies only matter if someone obtains the Supabase anon/authenticated keys,
-- in which case they must not read or write anything. Default-with-policies below
-- gives authenticated users access to their OWN profile only.

-- Identity
ALTER TABLE "Profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomerProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;

-- Catalog & content (read-only for anon; never writable by clients)
ALTER TABLE "Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InventoryMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkProject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SiteSetting" ENABLE ROW LEVEL SECURITY;

-- Orders & everything downstream — never directly reachable by clients
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderService" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderRepair" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderTimeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WarrantyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Cart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CartItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Coupon" ENABLE ROW LEVEL SECURITY;

-- Tracking is intentionally public-read via the app; no direct client access needed.
ALTER TABLE "Tracking" ENABLE ROW LEVEL SECURITY;

-- Profile: users manage only their own row
CREATE POLICY "profile_select_own" ON "Profile" FOR SELECT USING (auth.uid()::text = id);
CREATE POLICY "profile_update_own" ON "Profile" FOR UPDATE USING (auth.uid()::text = id);
CREATE POLICY "profile_insert_own" ON "Profile" FOR INSERT WITH CHECK (auth.uid()::text = id);

-- Customer profile & addresses: users manage their own
CREATE POLICY "customer_profile_select_own" ON "CustomerProfile" FOR SELECT USING (auth.uid()::text = "profileId");
CREATE POLICY "customer_profile_insert_own" ON "CustomerProfile" FOR INSERT WITH CHECK (auth.uid()::text = "profileId");
CREATE POLICY "customer_profile_update_own" ON "CustomerProfile" FOR UPDATE USING (auth.uid()::text = "profileId");

CREATE POLICY "address_select_own" ON "Address" FOR SELECT USING (auth.uid()::text = "profileId");
CREATE POLICY "address_insert_own" ON "Address" FOR INSERT WITH CHECK (auth.uid()::text = "profileId");
CREATE POLICY "address_update_own" ON "Address" FOR UPDATE USING (auth.uid()::text = "profileId");
CREATE POLICY "address_delete_own" ON "Address" FOR DELETE USING (auth.uid()::text = "profileId");

-- Orders: customers may read their own orders only
CREATE POLICY "order_select_own" ON "Order" FOR SELECT USING (
  auth.uid()::text = "profileId" OR
  "customerEmail" = auth.jwt() ->> 'email'
);

-- Cart: users manage only their own
CREATE POLICY "cart_select_own" ON "Cart" FOR SELECT USING (auth.uid()::text = "profileId");
CREATE POLICY "cart_insert_own" ON "Cart" FOR INSERT WITH CHECK (auth.uid()::text = "profileId");
CREATE POLICY "cart_update_own" ON "Cart" FOR UPDATE USING (auth.uid()::text = "profileId");
CREATE POLICY "cart_delete_own" ON "Cart" FOR DELETE USING (auth.uid()::text = "profileId");

-- Reviews: approved reviews are publicly readable
CREATE POLICY "review_select_approved" ON "Review" FOR SELECT USING (status = 'APPROVED');
CREATE POLICY "review_insert_own" ON "Review" FOR INSERT WITH CHECK (auth.uid()::text = "profileId");

-- Catalog & content: public read-only
CREATE POLICY "catalog_read" ON "Category" FOR SELECT USING (true);
CREATE POLICY "catalog_read" ON "Brand" FOR SELECT USING (true);
CREATE POLICY "product_read_active" ON "Product" FOR SELECT USING (active = true);
CREATE POLICY "product_read_active" ON "ProductVariant" FOR SELECT USING (true);
CREATE POLICY "product_read_active" ON "ProductImage" FOR SELECT USING (true);
CREATE POLICY "service_read_active" ON "ServiceGroup" FOR SELECT USING (active = true);
CREATE POLICY "service_read_active" ON "Service" FOR SELECT USING (active = true);
CREATE POLICY "work_read_active" ON "WorkProject" FOR SELECT USING (active = true);
CREATE POLICY "setting_read" ON "SiteSetting" FOR SELECT USING (true);