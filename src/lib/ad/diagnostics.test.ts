import { createPublicKey, createSign, generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resetLdapCaCache, type LdapClientLike, type LdapEnv } from "./ldapConnection";
import { runAdDiagnostics } from "./diagnostics";

const BASE_DN = "DC=corp,DC=example,DC=com";
const OU = `OU=Karyawan,${BASE_DN}`;
const QUARANTINE = `OU=Karantina,${BASE_DN}`;
const CISO = `CN=IT Security Approvers,OU=Groups,${BASE_DN}`;

let tempDirectory = "";

afterEach(async () => {
  vi.unstubAllEnvs();
  resetLdapCaCache();
  if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
  tempDirectory = "";
});

function der(tag: number, content: Buffer): Buffer {
  const length = content.length;
  const lengthBytes =
    length < 128
      ? Buffer.from([length])
      : (() => {
          let remaining = length;
          const bytes: number[] = [];
          while (remaining > 0) {
            bytes.unshift(remaining & 0xff);
            remaining >>>= 8;
          }
          return Buffer.from([0x80 | bytes.length, ...bytes]);
        })();
  return Buffer.concat([Buffer.from([tag]), lengthBytes, content]);
}

function sequence(...parts: Buffer[]): Buffer {
  return der(0x30, Buffer.concat(parts));
}

function oid(bytes: number[]): Buffer {
  return der(0x06, Buffer.from(bytes));
}

function certTime(date: Date): Buffer {
  const value = date.toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "Z");
  return der(0x17, Buffer.from(value.slice(2), "ascii"));
}

function makeCaCertificate(expiresAt: Date): Buffer {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const algorithm = sequence(oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]), der(0x05, Buffer.alloc(0)));
  const commonName = sequence(
    der(0x31, sequence(oid([0x55, 0x04, 0x03]), der(0x0c, Buffer.from("Diagnostics Test CA")))),
  );
  const basicConstraints = sequence(
    oid([0x55, 0x1d, 0x13]),
    der(0x01, Buffer.from([0xff])),
    der(0x04, sequence(der(0x01, Buffer.from([0xff])))),
  );
  const extensions = der(0xa3, sequence(basicConstraints));
  const now = new Date();
  const tbs = sequence(
    der(0xa0, der(0x02, Buffer.from([0x02]))),
    der(0x02, Buffer.from([0x01])),
    algorithm,
    commonName,
    sequence(certTime(new Date(now.getTime() - 24 * 60 * 60 * 1000)), certTime(expiresAt)),
    commonName,
    createPublicKey(privateKey).export({ type: "spki", format: "der" }) as Buffer,
    extensions,
  );
  const signer = createSign("RSA-SHA256");
  signer.update(tbs);
  signer.end();
  const signature = signer.sign(privateKey);
  const certificate = sequence(tbs, algorithm, der(0x03, Buffer.concat([Buffer.from([0]), signature])));
  const pem = `-----BEGIN CERTIFICATE-----\n${certificate.toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END CERTIFICATE-----\n`;
  return Buffer.from(pem);
}

async function caFile(expiresInDays = 365): Promise<string> {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "ad-diagnostics-"));
  const file = path.join(tempDirectory, "test-ca.pem");
  await writeFile(file, makeCaCertificate(new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)));
  return file;
}

function ldapEnv(caCertPath: string, overrides: LdapEnv = {}): LdapEnv {
  return {
    NODE_ENV: "production",
    AD_DRIVER: "ldap",
    AD_LDAP_URL: "ldaps://dc.corp.example.com:636",
    AD_BASE_DN: BASE_DN,
    AD_BIND_DN: `CN=svc-hc,OU=Service,${BASE_DN}`,
    AD_BIND_PASSWORD: "never-show-this-password",
    LDAP_CA_CERT_PATH: caCertPath,
    AD_MANAGED_OUS: `${OU};${QUARANTINE}`,
    AD_QUARANTINE_OU: QUARANTINE,
    AD_LDAP_WRITE_ENABLED: "false",
    AD_GROUP_HC: "CN=HC,OU=Groups,DC=corp,DC=example,DC=com",
    AD_GROUP_ADMIN: "CN=HC Admin,OU=Groups,DC=corp,DC=example,DC=com",
    AD_GROUP_OPS: "CN=HC Ops,OU=Groups,DC=corp,DC=example,DC=com",
    AD_GROUP_AUDITOR: "CN=HC Audit,OU=Groups,DC=corp,DC=example,DC=com",
    CISO_APPROVER_GROUP: CISO,
    ...overrides,
  };
}

function fakeDirectory(existingDns: string[] = [BASE_DN, OU, QUARANTINE, CISO]) {
  const state = { closed: false, writes: 0 };
  const client: LdapClientLike = {
    async search(dn) {
      return existingDns.includes(dn) ? [{ dn }] : [];
    },
    async add() {
      state.writes += 1;
    },
    async modify() {
      state.writes += 1;
    },
    async modifyDn() {
      state.writes += 1;
    },
    async close() {
      state.closed = true;
    },
  };
  return { client, state };
}

function check(report: Awaited<ReturnType<typeof runAdDiagnostics>>, id: string) {
  const result = report.checks.find((entry) => entry.id === id);
  expect(result, `expected check ${id}`).toBeDefined();
  return result!;
}

describe("read-only AD diagnostics", () => {
  it("closes the connection and never performs a directory write", async () => {
    const { client, state } = fakeDirectory();
    const report = await runAdDiagnostics({
      env: ldapEnv(await caFile()),
      connect: async () => client,
      now: () => new Date(),
    });

    expect(report.overall).toBe("warn");
    expect(state.closed).toBe(true);
    expect(state.writes).toBe(0);
    expect(check(report, "bind").status).toBe("ok");
  });

  it("names a missing managed OU", async () => {
    const missingOu = `OU=Missing,${BASE_DN}`;
    const { client } = fakeDirectory([BASE_DN, QUARANTINE, CISO]);
    const report = await runAdDiagnostics({
      env: ldapEnv(await caFile(), { AD_MANAGED_OUS: `${missingOu};${QUARANTINE}` }),
      connect: async () => client,
    });

    expect(check(report, "managed-ous").message).toContain(missingOu);
    expect(check(report, "managed-ous").status).toBe("fail");
    expect(check(report, "quarantine-ou").status).toBe("ok");
  });

  it("fails when the quarantine OU is outside the managed allow-list", async () => {
    const outside = `OU=Outside,${BASE_DN}`;
    const { client } = fakeDirectory();
    const report = await runAdDiagnostics({
      env: ldapEnv(await caFile(), { AD_QUARANTINE_OU: outside }),
      connect: async () => client,
    });

    expect(check(report, "quarantine-ou").status).toBe("fail");
    expect(check(report, "quarantine-ou").message).toContain("AD_MANAGED_OUS");
  });

  it("distinguishes a rejected bind from an unreachable domain controller", async () => {
    const env = ldapEnv(await caFile());
    const rejected = await runAdDiagnostics({
      env,
      connect: async () => {
        throw Object.assign(new Error("denied"), { code: 49 });
      },
    });
    const unreachable = await runAdDiagnostics({
      env,
      connect: async () => {
        throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
      },
    });

    expect(check(rejected, "bind").message).toContain("PERMISSION");
    expect(check(unreachable, "bind").message).toContain("tidak terjangkau");
    expect(JSON.stringify([rejected, unreachable])).not.toContain("never-show-this-password");
  });

  it("does not bind when the CA cannot be read", async () => {
    const connect = vi.fn();
    const report = await runAdDiagnostics({
      env: ldapEnv(path.join(os.tmpdir(), "missing-ad-test-ca.pem")),
      connect,
    });

    expect(check(report, "ca").status).toBe("fail");
    expect(check(report, "bind").status).toBe("skip");
    expect(connect).not.toHaveBeenCalled();
  });

  it("warns when the CA expires within 30 days", async () => {
    const report = await runAdDiagnostics({
      env: ldapEnv(await caFile(10)),
      connect: async () => fakeDirectory().client,
    });

    expect(check(report, "ca").status).toBe("warn");
  });

  it("fails an expired CA and does not bind", async () => {
    const connect = vi.fn();
    const report = await runAdDiagnostics({
      env: ldapEnv(await caFile(-1)),
      connect,
    });

    expect(check(report, "ca").status).toBe("fail");
    expect(check(report, "bind").status).toBe("skip");
    expect(connect).not.toHaveBeenCalled();
  });

  it("fails production plaintext URLs and the removed mock driver", async () => {
    const env = ldapEnv(await caFile(), {
      AD_DRIVER: "mock",
      AD_LDAP_URL: "ldap://dc.corp.example.com:389",
    });
    const report = await runAdDiagnostics({ env });

    expect(check(report, "login-url").status).toBe("fail");
    expect(check(report, "driver").status).toBe("fail");
    expect(check(report, "driver").message).toMatch(/dihapus/);
  });

  // Not a warning in development any more: there is no simulated directory
  // for the worker to fall back on, so without LDAP it can do nothing at all.
  it("fails a missing or removed driver outside production as well", async () => {
    for (const driver of ["mock", ""]) {
      const report = await runAdDiagnostics({ env: { NODE_ENV: "development", AD_DRIVER: driver } });

      expect(check(report, "driver").status).toBe("fail");
      expect(report.overall).toBe("fail");
    }
  });

  it("warns when LDAP writes are disabled", async () => {
    const report = await runAdDiagnostics({
      env: ldapEnv(await caFile()),
      connect: async () => fakeDirectory().client,
    });

    expect(report.writeEnabled).toBe(false);
    expect(check(report, "write").status).toBe("warn");
  });
});

describe("division OUs", () => {
  const FINANCE = `OU=Finance,${OU}`;
  const LEGAL = `OU=Legal,${OU}`;

  async function run(overrides: LdapEnv, existing: string[] = [BASE_DN, OU, QUARANTINE, CISO, FINANCE]) {
    const { client } = fakeDirectory(existing);
    return runAdDiagnostics({ env: ldapEnv(await caFile(), overrides), connect: async () => client });
  }

  it("is skipped, and says where accounts go instead, when nothing is configured", async () => {
    const result = check(await run({}), "department-ous");

    expect(result.status).toBe("skip");
    expect(result.message).toMatch(/AD_OU_STANDARD/);
  });

  it("passes when every mapped OU exists inside AD_MANAGED_OUS", async () => {
    expect(check(await run({ AD_DEPARTMENT_OUS: `Finance=>${FINANCE}` }), "department-ous").status).toBe("ok");
  });

  it("fails an OU outside AD_MANAGED_OUS, naming the division", async () => {
    const result = check(
      await run({ AD_DEPARTMENT_OUS: "Finance=>OU=Finance,OU=Lain,DC=corp,DC=example,DC=com" }),
      "department-ous",
    );

    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/Finance/);
  });

  it("fails a mapped OU the directory does not have - answered the way AD answers it", async () => {
    const { client } = fakeDirectory([BASE_DN, OU, QUARANTINE, CISO, FINANCE]);
    // A real domain controller throws noSuchObject for a base that is not there.
    const strict: LdapClientLike = {
      ...client,
      async search(dn, options) {
        if (dn === LEGAL) throw Object.assign(new Error("No Such Object"), { code: 32 });
        return client.search(dn, options);
      },
    };
    const report = await runAdDiagnostics({
      env: ldapEnv(await caFile(), { AD_DEPARTMENT_OUS: `Finance=>${FINANCE};Legal=>${LEGAL}` }),
      connect: async () => strict,
    });

    expect(check(report, "department-ous").status).toBe("fail");
    expect(check(report, "department-ous").message).toMatch(/Legal/);
  });

  it("warns, listing them, about divisions the naming convention points at a missing OU", async () => {
    const result = check(await run({ AD_DEPARTMENT_OU_PARENT: OU }), "department-ous");

    expect(result.status).toBe("warn");
    expect(result.message).toMatch(/Legal/);
    expect(result.message).not.toMatch(/Finance \(/);
  });

  it("fails a mapping it cannot read", async () => {
    expect(check(await run({ AD_DEPARTMENT_OUS: "Finance OU=Finance" }), "department-ous").status).toBe("fail");
  });
});
