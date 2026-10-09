import { z } from "zod";

export const checkoutBody = z.object({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  customerEmail: z.string().email(),
  totalCents: z.number().int().positive()
}).strict();

export const fulfillmentBody = z.object({
  orderId: z.string().min(1),
  trackingNumber: z.string().min(1)
}).strict();

export type StorefrontOrder = {
  orderId: string;
  tenantId: string;
  customerEmail: string;
  totalCents: number;
  state: "checked_out" | "fulfilled";
  customerUpdate: string;
  receipt?: { orderId: string; totalCents: number };
  trackingNumber?: string;
};

export class OrderLifecycle {
  private readonly orders = new Map<string, StorefrontOrder>();

  checkout(input: z.infer<typeof checkoutBody>): StorefrontOrder {
    const order: StorefrontOrder = {
      ...input,
      state: "checked_out",
      customerUpdate: `Order ${input.orderId} is confirmed.`,
      receipt: { orderId: input.orderId, totalCents: input.totalCents }
    };
    this.orders.set(input.orderId, order);
    return order;
  }

  fulfill(input: z.infer<typeof fulfillmentBody>): StorefrontOrder {
    const order = this.orders.get(input.orderId);
    if (!order) throw new Error("Checkout must exist before fulfillment");
    order.state = "fulfilled";
    order.trackingNumber = input.trackingNumber;
    order.customerUpdate = `Order ${input.orderId} shipped with tracking ${input.trackingNumber}.`;
    return order;
  }
}
