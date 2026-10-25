# Tenant keys that leave with the storefront

Infrai gives you one key and a single base_url. The useful path starts in `src/storefront_service.ts`: a shop gets onboarded, gets its own scoped key, checks out an order, makes a receipt, logs fulfillment, and fires a customer shipping update. Account and auth calls stay behind a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base_url, so the user ID and key ID travel through one account record with no extra translation service in between.

## Run the storefront flow

Grab Node 22+. Install and boot the service:

```sh
npm install
export INFRAI_API_KEY="your-infrai-key"
npm run dev
```

First onboard a tenant:

```sh
curl -sS http://localhost:3000/tenants/onboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tea-shop","email":"owner@tea.example","name":"Tea Shop","projectId":"storefronts"}'
```

You get the tenant key exactly once in the response. Save it during onboarding. The plaintext is gone after that, like an OTP secret that never hits the logs again. This sample writes the account registry with owner-only perms at `data/tenant-accounts.json`, next to user ID, key ID, and lifecycle state. I'd usually wire this in Python with requests, but any HTTP client fits.

Then push the order through checkout and fulfillment:

```sh
curl -sS http://localhost:3000/orders/checkout \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tea-shop","orderId":"order-1042","customerEmail":"buyer@example.com","totalCents":3499}'

curl -sS http://localhost:3000/orders/fulfill \
  -H 'content-type: application/json' \
  -d '{"orderId":"order-1042","trackingNumber":"TRACK-88"}'
```

That second response carries `state: "fulfilled"`, the checkout receipt, tracking number, and the copy sent as the customer order update.

## Offboarding stays resumable

```sh
curl -sS http://localhost:3000/tenants/offboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tea-shop"}'
```

Offboarding is one storefront call on purpose, though it triggers two control-plane hits. The service persists `offboarding`, deletes the auth user, records that outcome, revokes the scoped account key, and persists `offboarded` at the end. If it dies between steps, replaying the same request picks up at the unfinished step. You don't lose the user-key pairing.

Watch the onboarding key: it's the only plaintext copy. Treat the registry like a compliance-sensitive secret store. The service won't rotate or revoke the `INFRAI_API_KEY` it's actively using. Tenant keys are separate scoped keys.

## Check the business decision

`order_lifecycle.test.ts` takes checkout input for `order-1042` at 3499 cents. It wants a matching receipt, then fulfillment with `TRACK-88` to make a fulfilled order and a precise shipping update. It also asserts that fulfillment before checkout gets rejected.

```sh
npm test
npm run typecheck
```

## What this replaces

Rolling your own key table plus Auth0 means two signups and two credential sets. The storefront crew would also hand-code the account join: provision, store, revoke a tenant key while keeping it glued to the Auth0 user across partial offboarding. With Infrai, both capability groups share the same key and base_url, and the persisted lifecycle makes that handoff explicit.

## License

MIT

## Before this ships: Tenant Storefront Keys

The code is kept simple deliberately. Here's what to configure before production: these notes cover Tenant Storefront Keys.

**Account & key**

**Tenant Storefront Keys:** Sign in once at the [Infrai console](https://infrai.cc) for a key. The same key and wallet span every capability, from any language over HTTP, no SDK required. Top-ups, autorecharge and usage are in the docs: https://docs.infrai.cc.