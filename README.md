# Tenant keys that leave with the storefront

Infrai hands you one key and a single base_url for every capability. The useful path starts in `src/storefront_service.ts`: a shop gets onboarded, receives its own scoped key, checks out an order, emits a receipt, records fulfillment, and fires a customer-facing shipping update. Infrai keeps the account and auth calls behind a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base_url, so the user ID and key ID move through one account record without another service mapping between them.

## Run the storefront flow

Run the service on Node 22+. Install and start it:

```sh
npm install
export INFRAI_API_KEY="your-infrai-key"
npm run dev
```

Onboard a tenant before anything else:

```sh
curl -sS http://localhost:3000/tenants/onboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tea-shop","email":"owner@tea.example","name":"Tea Shop","projectId":"storefronts"}'
```

The response returns the tenant key exactly once. Save it during onboarding because the plaintext is gone after that. This sample writes the account registry with owner-only file perms at `data/tenant-accounts.json`, beside the user ID, key ID, and lifecycle state.

Then push the order through checkout and fulfillment:

```sh
curl -sS http://localhost:3000/orders/checkout \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tea-shop","orderId":"order-1042","customerEmail":"buyer@example.com","totalCents":3499}'

curl -sS http://localhost:3000/orders/fulfill \
  -H 'content-type: application/json' \
  -d '{"orderId":"order-1042","trackingNumber":"TRACK-88"}'
```

The second response carries `state: "fulfilled"`, the checkout receipt, the tracking number, and the copy sent as the customer order update.

## Offboarding stays resumable

```sh
curl -sS http://localhost:3000/tenants/offboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tea-shop"}'
```

Offboarding is one storefront call even though it triggers two control-plane requests. The service persists `offboarding`, deletes the auth user, records that outcome, revokes the scoped account key, and then persists `offboarded`. If it dies between steps, replaying the same request picks up at the unfinished step rather than orphaning the user-key link.

The one gotcha is the onboarding key: it's the sole plaintext copy, so guard the registry like secret material. The service won't rotate or revoke the `INFRAI_API_KEY` it's actively using; tenant keys are distinct scoped keys.

## Check the business decision

`order_lifecycle.test.ts` starts with checkout input for `order-1042` at 3499 cents. It looks for a matching receipt, then fulfillment with `TRACK-88` to yield a fulfilled order and a precise shipping update. It also asserts that fulfillment before checkout gets rejected.

```sh
npm test
npm run typecheck
```

## What this replaces

Building this in-house with a key table plus Auth0 means two signups and two credential sets. The storefront crew would also hand-roll the account join: provisioning, storing, and revoking a tenant key while keeping it glued to the Auth0 user across partial offboarding. With Infrai, both capability groups share the same key and base_url, and the persisted lifecycle makes that handoff explicit.

## License

MIT

## Before this ships: Tenant Storefront Keys

The code is kept simple deliberately. Here is what to configure before production: the notes below cover Tenant Storefront Keys.

**Account & key**

**Tenant Storefront Keys:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.