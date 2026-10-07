import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifySmtpError,
  missingSmtpConfig,
  smtpConfig,
  smtpConfigProblem,
  smtpTransportOptions,
} from "./smtpDriver";

/**
 * Which SMTP failures are worth trying again, and how the port is read.
 *
 * The transport itself is nodemailer's problem and is not tested here. What is
 * this driver's problem is the 4xx/5xx distinction: retrying a permanent
 * rejection produces the identical rejection five more times and buries the one
 * message an operator needed to read.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("classifying a failure", () => {
  it("treats rejected authentication as configuration, never as a blip", () => {
    // For Gmail this is almost always a missing App Password, and no number of
    // retries creates one.
    const error = classifySmtpError({ code: "EAUTH", message: "535 auth failed" });

    expect(error.kind).toBe("PERMISSION");
    expect(error.retryable).toBe(false);
  });

  it("retries a server it could not reach", () => {
    for (const code of ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNRESET"]) {
      const error = classifySmtpError({ code, message: "gagal" });
      expect(error.kind).toBe("TRANSIENT");
      expect(error.retryable).toBe(true);
    }
  });

  it("retries a 4xx, because SMTP says 4xx is temporary", () => {
    const error = classifySmtpError({ responseCode: 451, message: "coba lagi nanti" });

    expect(error.kind).toBe("TRANSIENT");
    expect(error.retryable).toBe(true);
  });

  it("does not retry a rejected recipient", () => {
    const error = classifySmtpError({ responseCode: 550, message: "no such user" });

    expect(error.kind).toBe("RECIPIENT_REJECTED");
    expect(error.retryable).toBe(false);
  });

  it("does not retry a permanent rejection of the message", () => {
    const error = classifySmtpError({ responseCode: 554, message: "ditolak" });

    expect(error.retryable).toBe(false);
  });

  it("still produces an EmailError for something it does not recognise", () => {
    // The dispatcher only knows how to handle an EmailError; anything escaping
    // as a bare Error is recorded as UNKNOWN and not retried.
    const error = classifySmtpError(new Error("aneh"));

    expect(error.kind).toBe("UNKNOWN");
    expect(error.retryable).toBe(false);
  });
});

describe("reading the configuration", () => {
  function stub(values: Record<string, string>) {
    for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
  }

  it("defaults to 587 with STARTTLS", () => {
    stub({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.com", SMTP_PASSWORD: "x", SMTP_PORT: "" });

    expect(smtpConfig()).toMatchObject({ port: 587, secure: false });
  });

  it("uses implicit TLS on 465", () => {
    stub({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "a@b.com",
      SMTP_PASSWORD: "x",
      SMTP_PORT: "465",
    });

    expect(smtpConfig()).toMatchObject({ port: 465, secure: true });
  });

  it("falls back to the login as the sender", () => {
    stub({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "a@b.com",
      SMTP_PASSWORD: "x",
      SMTP_SENDER: "",
    });

    expect(smtpConfig()?.sender).toBe("a@b.com");
  });

  it("refuses to guess when something essential is absent", () => {
    stub({ SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", SMTP_SENDER: "" });

    expect(smtpConfig()).toBeUndefined();
    expect(missingSmtpConfig()).toEqual(["SMTP_HOST", "SMTP_SENDER"]);
  });

  it("takes a company relay with no login, as long as it says who is sending", () => {
    stub({
      SMTP_HOST: "relay.corp.example",
      SMTP_PORT: "25",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      SMTP_SENDER: "hc-portal@corp.example",
    });

    expect(smtpConfig()).toMatchObject({ port: 25, auth: undefined, sender: "hc-portal@corp.example" });
  });

  it("treats half a login as a mistake, not as a relay", () => {
    stub({ SMTP_HOST: "relay.corp.example", SMTP_USER: "svc", SMTP_PASSWORD: "", SMTP_SENDER: "" });
    expect(smtpConfig()).toBeUndefined();
    expect(missingSmtpConfig()).toEqual(["SMTP_PASSWORD"]);
  });

  it("never lets a password travel over plain SMTP", () => {
    stub({ SMTP_HOST: "relay.corp.example", SMTP_USER: "svc", SMTP_PASSWORD: "x", SMTP_TLS: "off" });

    expect(smtpConfig()).toBeUndefined();
    expect(smtpConfigProblem()).toMatch(/SMTP_TLS=off ditolak/);
  });

  it("refuses a TLS mode it does not know rather than picking one", () => {
    stub({ SMTP_HOST: "relay.corp.example", SMTP_USER: "svc", SMTP_PASSWORD: "x", SMTP_TLS: "maybe" });
    expect(smtpConfigProblem()).toMatch(/SMTP_TLS="maybe"/);
  });

  it("reads the company CA path", () => {
    stub({
      SMTP_HOST: "relay.corp.example",
      SMTP_SENDER: "hc@corp.example",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      SMTP_CA_CERT_PATH: "/run/certs/corp-root-ca.pem",
    });
    expect(smtpConfig()?.caCertPath).toBe("/run/certs/corp-root-ca.pem");
  });
});

describe("what the connection is allowed to be", () => {
  const base = {
    host: "relay.corp.example",
    port: 587,
    secure: false,
    sender: "hc@corp.example",
    tls: "required" as const,
  };

  it("requires STARTTLS by default, so a stripped offer stops the send", () => {
    const options = smtpTransportOptions(base);
    expect(options.requireTLS).toBe(true);
    expect(options.ignoreTLS).toBe(false);
    expect(options.tls).toMatchObject({ rejectUnauthorized: true, minVersion: "TLSv1.2", servername: base.host });
  });

  it("does not ask for STARTTLS on implicit TLS, which is already encrypted", () => {
    expect(smtpTransportOptions({ ...base, port: 465, secure: true }).requireTLS).toBe(false);
  });

  it("logs in only when there is a login", () => {
    expect(smtpTransportOptions(base).auth).toBeUndefined();
    expect(smtpTransportOptions({ ...base, auth: { user: "svc", password: "x" } }).auth).toEqual({
      user: "svc",
      pass: "x",
    });
  });

  it("trusts the company CA when given one, and never sends an address as SNI", () => {
    const ca = Buffer.from("ca");
    const options = smtpTransportOptions({ ...base, host: "10.0.0.25" }, ca);
    expect(options.tls).toMatchObject({ ca });
    expect(options.tls).not.toHaveProperty("servername");
  });
});
