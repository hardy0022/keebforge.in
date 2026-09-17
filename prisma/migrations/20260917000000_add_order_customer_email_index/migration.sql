-- Order.customerEmail lookup for guest-order → verified-account claiming
CREATE INDEX "Order_customerEmail_idx" ON "Order"("customerEmail");