import assert from "node:assert/strict";
import test from "node:test";
import { OrderLifecycle } from "../src/order_lifecycle.ts";

test("fulfillment turns a checkout into a receipt-backed customer update", () => {
  const orders = new OrderLifecycle();
  const checkedOut = orders.checkout({
    tenantId: "tea-shop",
    orderId: "order-1042",
    customerEmail: "buyer@example.com",
    totalCents: 3499
  });
  assert.deepEqual(checkedOut.receipt, { orderId: "order-1042", totalCents: 3499 });

  const fulfilled = orders.fulfill({ orderId: "order-1042", trackingNumber: "TRACK-88" });
  assert.equal(fulfilled.state, "fulfilled");
  assert.equal(fulfilled.customerUpdate, "Order order-1042 shipped with tracking TRACK-88.");
});

test("an order cannot be fulfilled before checkout", () => {
  const orders = new OrderLifecycle();
  assert.throws(
    () => orders.fulfill({ orderId: "missing", trackingNumber: "TRACK-89" }),
    /Checkout must exist before fulfillment/
  );
});
