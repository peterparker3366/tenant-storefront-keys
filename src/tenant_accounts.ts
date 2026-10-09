import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const onboardTenantBody = z.object({
  tenantId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  projectId: z.string().min(1)
}).strict();

export const offboardTenantBody = z.object({ tenantId: z.string().min(1) }).strict();

const remoteUser = z.object({ user_id: z.string().min(1) }).passthrough();
const remoteKey = z.object({ id: z.string().min(1), key: z.string().min(1) }).passthrough();

const tenantAccount = z.object({
  tenantId: z.string(),
  email: z.string(),
  status: z.enum(["provisioning", "active", "offboarding", "offboarded"]),
  userId: z.string().optional(),
  keyId: z.string().optional(),
  scopedKey: z.string().optional(),
  userDeleted: z.boolean().default(false),
  keyRevoked: z.boolean().default(false)
});
type TenantAccount = z.infer<typeof tenantAccount>;

const registrySchema = z.record(tenantAccount);

export class TenantAccounts {
  private readonly infrai: InfraiClient;
  private readonly registryPath: string;

  constructor(infrai: InfraiClient, registryPath: string) {
    this.infrai = infrai;
    this.registryPath = registryPath;
  }

  async onboard(input: z.infer<typeof onboardTenantBody>): Promise<TenantAccount> {
    const accounts = await this.readRegistry();
    const existing = accounts[input.tenantId];
    if (existing?.status === "active") return existing;

    const account: TenantAccount = existing ?? {
      tenantId: input.tenantId,
      email: input.email,
      status: "provisioning",
      userDeleted: false,
      keyRevoked: false
    };
    accounts[input.tenantId] = account;
    await this.writeRegistry(accounts);

    if (!account.userId) {
      const user = await this.infrai.request("POST", "/v1/auth/user/create", remoteUser, {
        email: input.email,
        name: input.name,
        metadata: { tenant_id: input.tenantId },
        idempotency_key: `tenant-user-${input.tenantId}`
      });
      account.userId = user.user_id;
      await this.writeRegistry(accounts);
    }

    if (!account.keyId) {
      const key = await this.infrai.request("POST", "/v1/account/keys/create", remoteKey, {
        project_id: input.projectId,
        name: `storefront-${input.tenantId}`,
        scopes: ["checkout", "fulfillment", "receipts", "order_updates"],
        idempotency_key: `tenant-key-${input.tenantId}`
      });
      account.keyId = key.id;
      account.scopedKey = key.key;
      account.status = "active";
      await this.writeRegistry(accounts);
    }
    return account;
  }

  async offboard(input: z.infer<typeof offboardTenantBody>): Promise<TenantAccount> {
    const accounts = await this.readRegistry();
    const account = accounts[input.tenantId];
    if (!account?.userId || !account.keyId) throw new Error("Tenant account is not active");
    if (account.status === "offboarded") return account;

    account.status = "offboarding";
    await this.writeRegistry(accounts);
    if (!account.userDeleted) {
      await this.infrai.request("DELETE", `/v1/auth/user/delete/${encodeURIComponent(account.userId)}`, z.unknown());
      account.userDeleted = true;
      await this.writeRegistry(accounts);
    }
    if (!account.keyRevoked) {
      await this.infrai.request("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(account.keyId)}`, z.unknown());
      account.keyRevoked = true;
      account.scopedKey = undefined;
      await this.writeRegistry(accounts);
    }
    account.status = "offboarded";
    await this.writeRegistry(accounts);
    return account;
  }

  private async readRegistry(): Promise<Record<string, TenantAccount>> {
    try {
      return registrySchema.parse(JSON.parse(await readFile(this.registryPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  private async writeRegistry(accounts: Record<string, TenantAccount>): Promise<void> {
    await mkdir(dirname(this.registryPath), { recursive: true });
    const temporaryPath = `${this.registryPath}.new`;
    await writeFile(temporaryPath, `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.registryPath);
  }
}
