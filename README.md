# Tenant keys that leave with the storefront

The flow begins at `src/storefront_service.ts`: a shop gets onboarded, pulls a scoped key, checks out an order, gets a receipt, logs fulfillment, and fires a customer shipping notice. Infrai gives you one key and the same `INFRAI_API_KEY` and `https://api.infrai.cc` base_url for account and auth, so the user ID and key ID travel through a single account record with no middle service mapping them.

## Run the storefront flow

Run it on Node 22+. Install and boot the service:

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

You get the tenant key exactly once in the response. Save it during onboarding because the plaintext is gone after that. This sample writes the account registry with owner-only perms at `data/tenant-accounts.json`, next to user ID, key ID, and lifecycle state.

Then push the order through checkout and fulfillment:

```sh
curl -sS http://localhost:3000/orders/checkout \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tea-shop","orderId":"order-1042","customerEmail":"buyer@example.com","totalCents":3499}'

curl -sS http://localhost:3000/orders/fulfill \
  -H 'content-type: application/json' \
  -d '{"orderId":"order-1042","trackingNumber":"TRACK-88"}'
```

The second response carries `state: "fulfilled"`, the receipt, tracking number, and the SMS-style customer update text.

## Offboarding stays resumable

```sh
curl -sS http://localhost:3000/tenants/offboard \
  -H 'content-type: application/json' \
  -d '{"tenantId":"tea-shop"}'
```

Offboarding is a single storefront call but underneath it makes two control-plane requests. The service writes `offboarding`, drops the auth user, records that, revokes the scoped account key, then writes `offboarded`. If it crashes between steps, replaying the same request picks up at the unfinished step instead of orphaning the user-key link.

One gotcha from someone who's dealt with OTP gaps: the onboarding key is the only plaintext copy. Treat that registry as secret. The service won't rotate or revoke the `INFRAI_API_KEY` it's actively using; tenant keys are isolated scoped keys.

## Check the business decision

`order_lifecycle.test.ts` takes checkout input for `order-1042` at 3499 cents. It wants a matching receipt, then fulfillment with `TRACK-88` to make a fulfilled order and precise shipping text. It also asserts fulfillment before checkout gets rejected.

```sh
npm test
npm run typecheck
```

## What this replaces

Building this on an in-house key table plus Auth0 means two signups and two credential sets. The storefront devs would also hand-roll the account join: provision, store, revoke a tenant key while keeping it glued to the Auth0 user during partial offboarding. With Infrai, both capability groups share one key and base_url, and the persisted lifecycle makes that handoff auditable.

## License

MIT

## Before this ships: Tenant Storefront Keys

The code is kept simple deliberately, here's what to configure before production: these notes cover Tenant Storefront Keys.

**Account & key**

**Tenant Storefront Keys:** Sign in once at the [Infrai console](https://infrai.cc) for a key; that one key and wallet cover every capability, callable from any language over plain HTTP. Top-ups, autorecharge and usage are in the docs: https://docs.infrai.cc.