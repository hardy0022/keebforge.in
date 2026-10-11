import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  REGISTER_ERROR_MESSAGES,
  readRetryAfterSeconds,
  registrationErrorMessage,
  tooManyAttemptsMessage,
} from "@/lib/auth/register-error";

/**
 * Registration error copy.
 *
 * The defect being pinned: every sign-up failure except "email already exists"
 * used to collapse into one generic message, so a weak password, a rate limit,
 * a Sentinel security block, or a transient server failure all looked
 * identical. Each known case now has its own safe copy, and — critically — no
 * raw `code`, raw provider `message`, or stack text may ever be surfaced.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

/** The literal strings a rendered message must never contain. */
const FORBIDDEN = [
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  "FAILED_TO_CREATE_USER",
  "INVALID_EMAIL",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "INVALID_PASSWORD",
  "COMPROMISED_PASSWORD",
  "POW_CHALLENGE_REQUIRED",
  "stack",
  "<script",
  "at Object.",
];

function assertSafe(message: string) {
  assert.equal(typeof message, "string");
  assert.ok(message.length > 0, "message must not be empty");
  assert.ok(!message.includes("<"), `no markup in: ${message}`);
  for (const token of FORBIDDEN) {
    assert.ok(
      !message.includes(token),
      `message leaked internal detail "${token}": ${message}`,
    );
  }
}

function map(status: number, code?: string, extra?: Record<string, unknown>) {
  const message = registrationErrorMessage({
    status,
    statusText: "x",
    ...(code ? { code } : {}),
    ...extra,
  });
  assertSafe(message);
  return message;
}

(() => {
  // ── A. duplicate accounts keep their existing, specific copy ──────────────
  {
    const byCode = map(422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL");
    const byStatus = map(409);
    const byBare422 = map(422);
    assert.equal(byCode, REGISTER_ERROR_MESSAGES.duplicate);
    assert.equal(byStatus, REGISTER_ERROR_MESSAGES.duplicate);
    assert.equal(byBare422, REGISTER_ERROR_MESSAGES.duplicate);
    assert.match(byCode, /already exists/i);
    assert.match(byCode, /signing in/i);
    pass("duplicate email (422 code / 409 / bare 422) → sign-in hint");
  }

  // ── B. FAILED_TO_CREATE_USER must NOT read as "email already exists" ──────
  {
    const as422 = map(422, "FAILED_TO_CREATE_USER");
    const as400 = map(400, "FAILED_TO_CREATE_USER");
    assert.equal(as422, REGISTER_ERROR_MESSAGES.temporary);
    assert.equal(as400, REGISTER_ERROR_MESSAGES.temporary);
    assert.notEqual(as422, REGISTER_ERROR_MESSAGES.duplicate);
    pass("transient create failure (422 or 400) → retry, not duplicate");
  }

  // ── C. invalid input categories ───────────────────────────────────────────
  {
    assert.equal(map(400, "INVALID_EMAIL"), REGISTER_ERROR_MESSAGES.invalidEmail);
    for (const code of [
      "PASSWORD_TOO_SHORT",
      "PASSWORD_TOO_LONG",
      "INVALID_PASSWORD",
    ]) {
      assert.equal(
        map(400, code),
        REGISTER_ERROR_MESSAGES.invalidPassword,
        `${code} must map to the password copy`,
      );
    }
    assert.equal(map(400), REGISTER_ERROR_MESSAGES.invalidInput);
    pass("invalid email / password / generic 400 each get their own copy");
  }

  // ── D. compromised (breached) password ────────────────────────────────────
  {
    const message = map(400, "COMPROMISED_PASSWORD");
    assert.equal(message, REGISTER_ERROR_MESSAGES.breachedPassword);
    assert.match(message, /data breach/i);
    pass("COMPROMISED_PASSWORD → breach-specific guidance");
  }

  // ── E. Sentinel security challenge / block are explained, not bypassed ────
  {
    assert.equal(
      map(423, "POW_CHALLENGE_REQUIRED"),
      REGISTER_ERROR_MESSAGES.securityChallenge,
    );
    assert.equal(map(423), REGISTER_ERROR_MESSAGES.securityChallenge);
    const blocked = map(403);
    assert.equal(blocked, REGISTER_ERROR_MESSAGES.securityBlocked);
    assert.match(blocked, /security reasons/i);
    pass("PoW challenge (423/code) and 403 block both surface friendly copy");
  }

  // ── F. rate limit explains attempts + uses a valid interval only ──────────
  {
    const noInterval = map(429);
    assert.match(noInterval, /too many attempts/i);
    assert.match(noInterval, /wait/i);
    assert.equal(noInterval, tooManyAttemptsMessage(null));

    const withHeader = registrationErrorMessage(
      { status: 429 },
      "10",
    );
    assertSafe(withHeader);
    assert.match(withHeader, /wait 10 seconds/i);

    // Interval may also arrive as a field on the error body.
    const withField = registrationErrorMessage({ status: 429, retryAfter: 5 });
    assertSafe(withField);
    assert.match(withField, /wait 5 seconds/i);

    // Singular reads naturally.
    assert.ok(tooManyAttemptsMessage(1).includes("1 second and"));
    assert.ok(!tooManyAttemptsMessage(1).includes("1 seconds"));
    pass("429 → too-many-attempts copy with a safe, singular-aware interval");
  }

  // ── G. interval parsing rejects/clamps hostile values ─────────────────────
  {
    assert.equal(readRetryAfterSeconds("10"), 10);
    assert.equal(readRetryAfterSeconds(10.4), 11);
    assert.equal(readRetryAfterSeconds(" 7 "), 7);
    assert.equal(readRetryAfterSeconds(999999), 3600, "clamped to one hour");
    for (const bad of [0, -5, "0", "-1", "abc", "", "  ", null, undefined, NaN, Infinity, {}]) {
      assert.equal(readRetryAfterSeconds(bad), null, `rejects ${String(bad)}`);
    }
    // A rejected interval degrades to the "wait a moment" wording.
    assert.equal(
      registrationErrorMessage({ status: 429 }, "abc"),
      tooManyAttemptsMessage(null),
    );
    pass("retry interval is validated, clamped, and degrades safely");
  }

  // ── H. server errors + unknown fall back to the generic retry message ─────
  {
    assert.equal(map(500), REGISTER_ERROR_MESSAGES.temporary);
    assert.equal(map(503), REGISTER_ERROR_MESSAGES.temporary);
    assert.equal(map(599), REGISTER_ERROR_MESSAGES.temporary);
    assert.equal(map(418), REGISTER_ERROR_MESSAGES.temporary);
    assert.equal(
      registrationErrorMessage(undefined),
      REGISTER_ERROR_MESSAGES.temporary,
    );
    assert.equal(
      registrationErrorMessage(null),
      REGISTER_ERROR_MESSAGES.temporary,
    );
    assert.equal(registrationErrorMessage("boom"), REGISTER_ERROR_MESSAGES.temporary);
    assert.equal(
      registrationErrorMessage({ status: "weird", code: 42 }),
      REGISTER_ERROR_MESSAGES.temporary,
    );
    pass("5xx and unknown shapes fall back to the generic retry message");
  }

  // ── I. raw provider message / prototype keys are never rendered ───────────
  {
    const raw = registrationErrorMessage({
      status: 400,
      code: "SOMETHING_ELSE",
      message: "prisma: unique constraint failed at Object.<anonymous>",
    });
    assertSafe(raw);
    assert.ok(
      !raw.includes("prisma"),
      "raw provider message must not be echoed",
    );
    assert.equal(
      registrationErrorMessage({ code: "__proto__", status: 400 }),
      REGISTER_ERROR_MESSAGES.invalidInput,
      "prototype keys must not escape the mapping",
    );

    // A KNOWN code that arrives with a raw provider message must still return
    // only the safe mapped copy — the raw text is replaced, never passed on.
    const knownWithRawMessage = registrationErrorMessage({
      status: 422,
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      message: "User already exists. Use another email.",
    });
    assertSafe(knownWithRawMessage);
    assert.equal(knownWithRawMessage, REGISTER_ERROR_MESSAGES.duplicate);
    assert.ok(
      !knownWithRawMessage.includes("Use another email"),
      "the raw provider message must be replaced by the safe copy",
    );
    pass("raw messages and prototype keys never reach the rendered copy");
  }

  // ── J. the form actually uses the mapper (regression wiring guard) ────────
  {
    const file = path.join(
      process.cwd(),
      "src/components/auth/RegisterForm.tsx",
    );
    const source = fs.readFileSync(file, "utf8");
    assert.ok(
      source.includes("registrationErrorMessage("),
      "RegisterForm must call the shared mapper",
    );
    assert.ok(
      !source.includes("Unable to create your account right now"),
      "the hard-coded catch-all must be gone from the component",
    );
    pass("RegisterForm renders through registrationErrorMessage");
  }

  console.log(`\nPASS all ${n} registration error tests`);
})();
