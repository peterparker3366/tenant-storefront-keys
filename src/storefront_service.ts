import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { InfraiClient, InfraiError, InfraiResponseError } from "./infrai_client.ts";
import { OrderLifecycle, checkoutBody, fulfillmentBody } from "./order_lifecycle.ts";
import { TenantAccounts, onboardTenantBody, offboardTenantBody } from "./tenant_accounts.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const infrai = new InfraiClient(apiKey);
const tenants = new TenantAccounts(infrai, process.env.TENANT_REGISTRY_PATH ?? "data/tenant-accounts.json");
const orders = new OrderLifecycle();

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/tenants/onboard") {
      return json(response, 201, await tenants.onboard(onboardTenantBody.parse(await body(request))));
    }
    if (request.method === "POST" && request.url === "/tenants/offboard") {
      return json(response, 200, await tenants.offboard(offboardTenantBody.parse(await body(request))));
    }
    if (request.method === "POST" && request.url === "/orders/checkout") {
      return json(response, 201, orders.checkout(checkoutBody.parse(await body(request))));
    }
    if (request.method === "POST" && request.url === "/orders/fulfill") {
      return json(response, 200, orders.fulfill(fulfillmentBody.parse(await body(request))));
    }
    return json(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return json(response, status, { error: error.code, message: error.message });
    }
    if (error instanceof InfraiResponseError) {
      return json(response, 502, { error: error.message });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return json(response, 400, { error: "Invalid request body" });
    }
    return json(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});

function body(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Storefront service listening on http://localhost:${port}`));
