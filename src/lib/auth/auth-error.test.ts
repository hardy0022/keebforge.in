import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import {
  AUTH_ERROR_MESSAGES,
  decideAuthErrorHandling,
  resolveAuthErrorMessage,
  SAFE_AUTH_ERROR_CODES,
} from "@/lib/auth/auth-error";
import AuthErrorPage from "@/app/(auth)/auth/error/page";
import { ResendVerificationForm } from "@/components/auth/ResendVerificationForm";

/**
 * /auth/error is a sanitiser: Better Auth lands there with `?error=<code>` and
 * sometimes `&error_description=<raw provider text>`. The proxy may only let a
 * code through when the page has real copy for it, and everything else has to
 * be dropped before it can reach the HTML/RSC payload.
 *
 * `account_not_linked` was added to the allow list so an unverified local
 * account trying to sign in with Google gets an explanation and a way forward
 * instead of the generic failure — this file pins that it now survives the
 * proxy, that the copy exists, and that nothing else got looser in the process.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const ORIGIN = "https://keebforge.in";

async function resultParams(query: string): Promise<{
  status: number;
  params: URLSearchParams;
}> {
  const res = await proxy(new NextRequest(`${ORIGIN}/auth/error${query}`));
  const location = res.headers.get("location");
  if (!location) return { status: res.status, params: new URLSearchParams() };
  return { status: res.status, params: new URL(location).searchParams };
}

async function isPassedThrough(query: string): Promise<boolean> {
  const res = await proxy(new NextRequest(`${ORIGIN}/auth/error${query}`));
  return res.headers.get("location") === null;
}

(async () => {
  // ── A. account_not_linked survives the proxy ──────────────────────────────
  {
    assert.equal(
      await isPassedThrough("?error=account_not_linked"),
      true,
      "account_not_linked must reach the page",
    );
    const decision = decideAuthErrorHandling(
      new URLSearchParams("error=account_not_linked"),
    );
    assert.deepEqual(decision, { action: "next" });
    pass("account_not_linked is preserved by proxy/auth error handling");
  }

  // ── B. it renders the specific, explanatory copy ──────────────────────────
  {
    const msg = resolveAuthErrorMessage("account_not_linked");
    assert.equal(msg.title, "Verify your email first");
    assert.match(
      msg.detail,
      /Your email address is not verified yet\. Please verify your email before signing in with Google\./,
    );
    assert.match(
      msg.detail,
      /verify your email and try Google again, or continue with your email and password/i,
    );
    pass("account_not_linked has the required explanation and both next steps");

    const page = await AuthErrorPage({
      searchParams: Promise.resolve({ error: "account_not_linked" }),
    });
    const rendered = collectText(page);
    assert.ok(
      rendered.includes("Your email address is not verified yet."),
      `page must render the copy, got: ${rendered.slice(0, 200)}`,
    );
    assert.ok(
      findComponent(page, ResendVerificationForm),
      "the resend action must be rendered for account_not_linked",
    );
    assert.ok(rendered.includes("Continue with email and password"));
    pass("the error page renders that copy plus the resend and sign-in actions");

    const other = await AuthErrorPage({
      searchParams: Promise.resolve({ error: "access_denied" }),
    });
    assert.equal(
      findComponent(other, ResendVerificationForm),
      false,
      "the resend action must not appear for unrelated codes",
    );
    pass("the resend action is scoped to account_not_linked only");
  }

  // ── C. the pre-existing safe codes keep working ───────────────────────────
  {
    for (const code of ["access_denied", "state_mismatch", "state_invalid"]) {
      assert.equal(
        await isPassedThrough(`?error=${code}`),
        true,
        `${code} must still reach the page`,
      );
      const msg = resolveAuthErrorMessage(code);
      assert.notEqual(msg.title, "Something went wrong", `${code} has copy`);
      assert.ok(!msg.detail.includes("<"), `${code} copy is plain text`);
    }
    assert.equal(SAFE_AUTH_ERROR_CODES.size, 4);
    pass("access_denied / state_mismatch / state_invalid still pass through");
  }

  // ── D. unknown codes and provider text are still stripped ─────────────────
  {
    const unknown = await resultParams("?error=internal_error");
    assert.equal(unknown.status, 307, "an unknown code is redirected away");
    assert.equal(unknown.params.has("error"), false, "and carries no code");

    const withDescription = await resultParams(
      "?error=account_not_linked&error_description=Google+said+something",
    );
    assert.equal(withDescription.status, 307, "raw provider text forces a strip");
    assert.equal(
      withDescription.params.get("error"),
      "account_not_linked",
      "but the safe code itself is kept",
    );
    assert.equal(withDescription.params.has("error_description"), false);

    const safeWithDescription = await resultParams(
      "?error=access_denied&error_description=nope",
    );
    assert.equal(safeWithDescription.params.get("error"), "access_denied");
    assert.equal(safeWithDescription.params.has("error_description"), false);

    const twoParams = await resultParams("?error=account_not_linked&x=1");
    assert.equal(twoParams.status, 307, "any extra param forces a strip");
    assert.equal(twoParams.params.get("error"), "account_not_linked");
    assert.equal(twoParams.params.has("x"), false);

    const bare = await resultParams("");
    assert.equal(bare.status, 200, "no params at all is untouched");

    // Unknown codes never reach the copy table either.
    assert.equal(
      resolveAuthErrorMessage("internal_error").title,
      "Something went wrong",
    );
    assert.equal(
      resolveAuthErrorMessage(undefined).title,
      "Something went wrong",
    );
    assert.equal(
      resolveAuthErrorMessage("__proto__").title,
      "Something went wrong",
      "the copy table must not be reachable through the prototype chain",
    );
    pass("arbitrary/unknown codes and error_description are still sanitized");
  }

  // The copy table may only contain codes the proxy would pass through.
  {
    for (const key of Object.keys(AUTH_ERROR_MESSAGES)) {
      assert.ok(
        SAFE_AUTH_ERROR_CODES.has(key),
        `${key} has copy but is not allow-listed`,
      );
    }
    pass("every code with copy is allow-listed, and vice versa");

    // Regression guard: `account_not_linked` must never fall back to the
    // generic message, because that is the defect being fixed.
    assert.notEqual(
      resolveAuthErrorMessage("account_not_linked").title,
      resolveAuthErrorMessage("nonsense").title,
    );
    pass("account_not_linked does not collapse into the generic message");
  }

  console.log(`\nPASS all ${n} auth error tests`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});

/** Flattens a React element tree into text, for render assertions. */
function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  const el = node as { props?: { children?: unknown } };
  if (el.props) return collectText(el.props.children);
  return "";
}

/** True when `target` appears as an element type anywhere in the tree. */
function findComponent(node: unknown, target: unknown): boolean {
  if (node === null || node === undefined || typeof node !== "object") {
    if (Array.isArray(node)) return node.some((c) => findComponent(c, target));
    return false;
  }
  if (Array.isArray(node)) return node.some((c) => findComponent(c, target));
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === target) return true;
  return Object.values(el.props ?? {}).some((v) => findComponent(v, target));
}
