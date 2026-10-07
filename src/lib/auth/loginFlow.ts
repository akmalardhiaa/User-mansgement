import { cookies } from "next/headers";
import QRCode from "qrcode";

import type { AdUser } from "./ad";
import { clearLoginFailures } from "./loginThrottle";
import { mfaIssuer } from "./mfa";
import { PENDING_COOKIE, pendingCookieOptions } from "./pendingLogin";
import { recordSecurityEvent } from "./securityLog";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "./session";
import { otpauthUri } from "./totp";

/**
 * The end of a sign-in, shared by the password step (2FA off) and the code step.
 */

export function publicUser(user: AdUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles,
    department: user.department,
  };
}

/** Opens the session, sets its cookie, and forgets the failed attempts. */
export async function completeSignIn(user: AdUser, ip: string, viaMfa: boolean): Promise<void> {
  const { id, maxAgeSeconds } = await createSession({
    userId: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles,
    department: user.department,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, id, sessionCookieOptions(maxAgeSeconds));
  store.set(PENDING_COOKIE, "", pendingCookieOptions(0));

  clearLoginFailures(user.username);
  await recordSecurityEvent({
    type: "login.success",
    username: user.username,
    ip,
    detail: viaMfa ? "dengan 2FA" : "tanpa 2FA (LOGIN_2FA=off)",
  });
}

/**
 * What the form needs to show a first-time user: the QR code, and the same
 * secret as text for a phone whose camera will not cooperate.
 *
 * The QR is drawn here as SVG and sent as a data URI, so the secret never
 * leaves the server for a third-party QR service — and the page's CSP already
 * allows data: images.
 */
export async function enrollmentView(user: AdUser, secret: string) {
  const uri = otpauthUri(mfaIssuer(), user.username, secret);
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return {
    account: user.username,
    issuer: mfaIssuer(),
    secret,
    qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
}
