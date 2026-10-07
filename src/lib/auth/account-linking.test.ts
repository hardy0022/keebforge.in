import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Google sign-in against an account that was created with email + password.
 *
 * THE RULE BEING PINNED
 * ──────────────────────
 * Better Auth only implicitly links a social provider to an existing local
 * account when BOTH sides are trustworthy:
 *
 *   - the provider reports an email-verified identity, AND
 *   - `account.accountLinking.requireLocalEmailVerified` (default **true**,
 *     i.e. the local account's `emailVerified` is already true).
 *
 * KeebForge deliberately ships `requireEmailVerification: false` so existing
 * password users can still sign in, which means most local accounts are
 * unverified — so Google sign-in must be REFUSED for them, with no account
 * row written. That refusal is what surfaces `account_not_linked` on
 * /auth/error.
 *
 * These tests drive the real `handleOAuthUserInfo` from the installed
 * better-auth build (loaded by absolute path so the package `exports` map is
 * not in play) with a minimal context, so the assertion is about the library's
 * actual behaviour rather than a re-implementation of it.
 */

type UserRow = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AdapterLog = {
  linkAccount: unknown[];
  createSession: unknown[];
  findUserByEmail: string[];
};

function makeUser(emailVerified: boolean): UserRow {
  const now = new Date("2026-10-06T00:00:00.000Z");
  return {
    id: "user-local-1",
    email: "buyer@example.com",
    emailVerified,
    name: "Buyer",
    image: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The smallest context `handleOAuthUserInfo` touches on the link path. Every
 * adapter method is instrumented so "was a link written?" is an observed
 * fact, not an inference.
 */
function makeContext(user: UserRow) {
  const log: AdapterLog = { linkAccount: [], createSession: [], findUserByEmail: [] };
  const context = {
    // No `account.accountLinking`, no `user.validateUserInfo`, no
    // `emailVerification` — i.e. the shipped configuration.
    options: {} as Record<string, unknown>,
    // getTrustedProviders() resolves to [] when `trustedProviders` is unset,
    // which is exactly how this app is configured.
    trustedProviders: [] as string[],
    socialProviders: [{ id: "google", options: {} }],
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    internalAdapter: {
      findAccountOwnerByKey: async () => null,
      findUserByEmail: async (email: string) => {
        log.findUserByEmail.push(email);
        return { user, accounts: [] };
      },
      linkAccount: async (account: unknown) => {
        log.linkAccount.push(account);
        return { id: "acct-created", ...(account as Record<string, unknown>) };
      },
      createSession: async (userId: string) => {
        log.createSession.push(userId);
        return { id: `sess_${userId}`, userId, expiresAt: new Date(Date.now() + 86_400_000) };
      },
    },
  };
  return { context, log };
}

function makeOpts(emailVerified: boolean) {
  return {
    userInfo: {
      id: "google-sub-123",
      email: "buyer@example.com",
      emailVerified,
      name: "Buyer",
    },
    account: {
      providerId: "google",
      issuer: "google",
      accountId: "google-sub-123",
      accessToken: "access-token",
      scope: "openid email profile",
    },
    callbackURL: "/auth/callback",
    disableSignUp: false,
    overrideUserInfo: false,
    source: { method: "oauth" as const, oauth: { providerId: "google" } },
  };
}

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(__dirname, "../../..");
const LINK_ACCOUNT_MJS = path.join(
  REPO,
  "node_modules/better-auth/dist/oauth2/link-account.mjs",
);

(async () => {
  assert.ok(
    fs.existsSync(LINK_ACCOUNT_MJS),
    "the better-auth link-account module must be present",
  );
  const mod = (await import(pathToFileURL(LINK_ACCOUNT_MJS).href)) as {
    handleOAuthUserInfo: (
      c: unknown,
      opts: unknown,
    ) => Promise<{ error: string | null; data?: unknown }>;
  };
  assert.equal(typeof mod.handleOAuthUserInfo, "function");

  // ── E. an unverified local account is refused ─────────────────────────────
  {
    const user = makeUser(false); // emailVerified: false — the shipped default
    const { context, log } = makeContext(user);
    const result = await mod.handleOAuthUserInfo({ context }, makeOpts(true));

    assert.equal(
      result.error,
      "account not linked",
      "an unverified local account must be refused, not silently merged",
    );
    assert.equal(result.data, null, "no session is created");
    assert.equal(
      log.linkAccount.length,
      0,
      "no account row may be written for an unverified local account",
    );
    assert.equal(
      log.createSession.length,
      0,
      "no session may be created",
    );
    pass(
      "Google linking is blocked for an unverified local account (requireLocalEmailVerified default holds)",
    );
  }

  // ── H. the refusal does not link anything ─────────────────────────────────
  {
    const user = makeUser(false);
    const { context, log } = makeContext(user);
    await mod.handleOAuthUserInfo({ context }, makeOpts(true));
    assert.deepEqual(
      log.findUserByEmail,
      ["buyer@example.com"],
      "the local account is looked up by email",
    );
    assert.equal(log.linkAccount.length, 0);
    assert.equal(log.createSession.length, 0);
    pass("no automatic account linking occurs on the refused path");
  }

  // ── the provider must be verified too ─────────────────────────────────────
  {
    // Local account IS verified, but Google did not report a verified email
    // and the app sets no `trustedProviders` — still refused.
    const user = makeUser(true);
    const { context, log } = makeContext(user);
    const result = await mod.handleOAuthUserInfo({ context }, makeOpts(false));
    assert.equal(result.error, "account not linked");
    assert.equal(log.linkAccount.length, 0);
    pass("an unverified provider identity cannot link even to a verified local account");
  }

  // ── F. a verified local account links and signs in normally ───────────────
  {
    const user = makeUser(true); // emailVerified: true
    const { context, log } = makeContext(user);
    const result = await mod.handleOAuthUserInfo({ context }, makeOpts(true));

    assert.equal(
      result.error,
      null,
      `a verified local account must link, got: ${String(result.error)}`,
    );
    assert.equal(log.linkAccount.length, 1, "exactly one link is written");
    const written = log.linkAccount[0] as { providerId: string; userId: string; accountId: string };
    assert.equal(written.providerId, "google");
    assert.equal(written.userId, user.id, "linked to the local account");
    assert.equal(written.accountId, "google-sub-123");
    assert.equal(log.createSession.length, 1, "and a session is issued");
    assert.ok(result.data, "sign-in completes");
    pass("a verified local account continues through the normal Google linking flow");
  }

  // ── the app must never turn the gate off ──────────────────────────────────
  {
    const source = fs.readFileSync(
      path.join(REPO, "src/lib/auth/better-auth.ts"),
      "utf8",
    );
    // Checked as config keys (with the key/colon form) so prose that merely
    // discusses them does not trip the assertion.
    for (const forbidden of [
      "requireLocalEmailVerified",
      "accountLinking",
      "disableImplicitLinking",
      "allowDifferentEmails",
    ]) {
      assert.ok(
        !source.includes(forbidden),
        `${forbidden} must never be configured: it would weaken the OAuth gate`,
      );
    }
    assert.ok(
      !source.includes("requireEmailVerification:"),
      "requireEmailVerification must remain unset (existing users must still be able to sign in)",
    );
    assert.ok(
      source.includes("sendOnSignUp: true"),
      "verification mail on sign-up must stay enabled",
    );
    pass(
      "requireLocalEmailVerified / requireEmailVerification / accountLinking are untouched",
    );
  }

  console.log(`\nPASS all ${n} account linking tests`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
