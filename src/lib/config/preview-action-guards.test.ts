import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";

/**
 * Focused regression tests for the two Preview Guard remediation follow-ups:
 *
 *  1. Server actions that can reach an external service (Cloudinary upload /
 *     Delhivery live tracking) BEFORE the database guard fires must refuse in a
 *     Preview deployment, so a blocked request performs no external side effect.
 *
 *       - submitRepairRequest (guest + manual/UNSURE address reaches Cloudinary
 *         with no prior prisma call) -> guarded.
 *       - fetchShipmentScans  (calls Delhivery's tracking API and never touches
 *         the database) -> guarded.
 *       - submitReview        (prisma always runs before the upload) -> NOT
 *         guarded; proven here that a thrown database guard aborts before the
 *         upload happens.
 *
 *  2. The shipping route Preview refusal carries a distinct, stable error code
 *     ("PREVIEW_DISABLED") rather than the generic "NOT_CONFIGURED", while
 *     production/local behaviour is unchanged.
 *
 * Every network/database dependency is replaced through the CommonJS
 * `Module._load` hook (same technique as outbound-paths.test.ts and
 * payment-endpoints.test.ts), so no email is sent, no image is uploaded, no
 * provider is called and no connection is opened.
 */

const REPO = path.resolve(__dirname, "../../..");
const PRISMA_PATH = path.join(REPO, "src/lib/db/prisma.ts");

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

type UploadArgs = { folder: string };
const cloudinarySpy = {
  uploads: [] as UploadArgs[],
  deletes: [] as string[],
  configured: true,
  cloudinaryConfigured() {
    return cloudinarySpy.configured;
  },
  mediaFolder(type: string, id: string) {
    return `keebforge/${type.toLowerCase()}/${id}`;
  },
  async uploadBuffer(_buffer: Buffer, opts: UploadArgs) {
    cloudinarySpy.uploads.push(opts);
    return {
      url: "https://res.example/upload/v1/review.jpg",
      publicId: "keebforge/review/pub_1",
      width: 1200,
      height: 800,
    };
  },
  async deleteImage(publicId: string) {
    cloudinarySpy.deletes.push(publicId);
    return true;
  },
};

const delhiverySpy = {
  calls: [] as string[],
  async trackShipment(waybill: string) {
    delhiverySpy.calls.push(waybill);
    return {
      ok: true as const,
      data: {
        awb: waybill,
        status: "Delivered",
        destination: "Pune",
        scans: [] as {
          location: string;
          status: string;
          instructions: string;
          scannedAt: string | null;
        }[],
      },
    };
  },
};

const resendSends: unknown[] = [];

/** Set true to make the first review prisma read throw (simulated db guard). */
let simulateDbGuard = false;
const prismaCalls: string[] = [];
class PreviewGuardError extends Error {
  code = "UNAPPROVED_PREVIEW_TARGET";
}

const fakePrisma = {
  order: {
    create: async () => {
      prismaCalls.push("order.create");
      return { id: "order_test_1" };
    },
  },
  media: {
    createMany: async () => ({ count: 0 }),
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
  },
  address: { findFirst: async () => null },
  product: {
    findFirst: async () => {
      prismaCalls.push("product.findFirst");
      if (simulateDbGuard) throw new PreviewGuardError("blocked");
      return null;
    },
  },
  review: {
    findFirst: async () => {
      prismaCalls.push("review.findFirst");
      if (simulateDbGuard) throw new PreviewGuardError("blocked");
      return null;
    },
    findUnique: async () => {
      prismaCalls.push("review.findUnique");
      if (simulateDbGuard) throw new PreviewGuardError("blocked");
      return null;
    },
  },
  tracking: { findUnique: async () => null },
};

function installStubs() {
  const mod = Module as unknown as {
    _load: (
      this: unknown,
      request: string,
      parent: { filename?: string } | null,
      main: boolean,
    ) => unknown;
    __pagStubbed?: boolean;
  };
  if (mod.__pagStubbed) return;
  const orig = mod._load;

  const ResendStub = class {
    emails = {
      send: async (args: unknown) => {
        resendSends.push(args);
        return { data: { id: "test-email" }, error: null };
      },
    };
  };

  mod._load = function (request, parent, main) {
    if (request === "server-only") return {};
    if (request === "resend") return { Resend: ResendStub, default: ResendStub };
    if (request === "next/cache") {
      return { revalidatePath: () => {}, revalidateTag: () => {} };
    }
    if (request === "next/headers") {
      return {
        headers: async () => new Headers(),
        cookies: async () => ({ get: () => undefined }),
      };
    }
    if (request === "@/lib/db/prisma" || request === PRISMA_PATH) {
      return { prisma: fakePrisma, getPrisma: () => fakePrisma };
    }
    if (request === "@/lib/auth/session") {
      return {
        getCurrentAuth: async () => ({
          user: { id: "user_test_1" },
          profile: { id: "profile_test_1" },
        }),
      };
    }
    if (request === "@/lib/orders/tracking") {
      return { syncTrackingCache: async () => {} };
    }
    if (request === "@/lib/images/cloudinary") return cloudinarySpy;
    if (request === "@/lib/shipping/delhivery") {
      // Keep the real exports (SHIPPING_ERROR_MESSAGES, calculateShipping, …) so
      // the shipping routes still behave normally; only spy on the live call.
      const real = orig.call(this, request, parent, main) as Record<
        string,
        unknown
      >;
      return { ...real, trackShipment: delhiverySpy.trackShipment };
    }
    if (request === "@/lib/reviews") {
      return {
        MAX_REVIEW_IMAGES: 4,
        recalcProductRating: async () => {},
        verifiedProfileIds: async () => new Set<string>(),
      };
    }
    if (request === "@/lib/caching/cache") {
      return { invalidateReviews: () => {} };
    }
    return orig.call(this, request, parent, main);
  };
  mod.__pagStubbed = true;
}
installStubs();

const savedVercelEnv = process.env.VERCEL_ENV;
const asPreview = () => {
  process.env.VERCEL_ENV = "preview";
};
const asLocal = () => {
  delete process.env.VERCEL_ENV;
};

function repairForm() {
  const fd = new FormData();
  fd.set("serviceType", "repair");
  fd.set("deviceType", "KEYBOARD");
  fd.set("brand", "Acme");
  fd.set("model", "Model X");
  fd.append("workTypes", "Lubing");
  fd.set("description", "The spacebar is unreliable and the board is noisy.");
  fd.set("firstName", "Test");
  fd.set("lastName", "Customer");
  fd.set("phone", "9876543210");
  fd.set("email", "customer@example.org");
  fd.set("shippingMethod", "UNSURE");
  return fd;
}

(async () => {
  try {
    const { PREVIEW_OPERATION_DISABLED_MESSAGE } = await import(
      "@/lib/config/preview-guard"
    );
    const { submitRepairRequest } = await import("@/app/actions/repair-request");
    const { fetchShipmentScans } = await import("@/app/actions/track-order");
    const { submitReview } = await import("@/app/actions/review");
    const { NextRequest } = await import("next/server");
    const { resetRateLimits } = await import("@/lib/payments/rate-limit");

    // ── 1a. repair request refuses before any external side effect ────────────
    {
      asPreview();
      cloudinarySpy.uploads.length = 0;
      resendSends.length = 0;
      prismaCalls.length = 0;

      const state = await submitRepairRequest({}, repairForm());
      assert.equal(
        state.error,
        PREVIEW_OPERATION_DISABLED_MESSAGE,
        "guest repair request must be refused in Preview",
      );
      assert.equal(state.ok, undefined, "refused request must not report success");
      assert.equal(cloudinarySpy.uploads.length, 0, "no image may be uploaded");
      assert.equal(resendSends.length, 0, "no confirmation email may be sent");
      assert.equal(prismaCalls.length, 0, "no database work may happen");

      // Local control: the same submission is not blocked (never Preview-coded).
      asLocal();
      resendSends.length = 0;
      const local = await submitRepairRequest({}, repairForm());
      assert.ok(local.ok, "local repair request must still persist (control)");
      assert.notEqual(
        local.error,
        PREVIEW_OPERATION_DISABLED_MESSAGE,
        "local request must never receive the Preview refusal",
      );

      pass("repair request: Preview refuses before upload/email/db; local unaffected");
    }

    // ── 1b. live tracking refuses before the provider call ────────────────────
    {
      asPreview();
      delhiverySpy.calls.length = 0;
      const fd = new FormData();
      fd.set("waybill", "1234567890");

      const state = await fetchShipmentScans({ ok: false, error: "" }, fd);
      assert.deepEqual(
        state,
        { ok: false, error: PREVIEW_OPERATION_DISABLED_MESSAGE },
        "live tracking must be refused in Preview",
      );
      assert.equal(
        delhiverySpy.calls.length,
        0,
        "Delhivery must not be called in Preview",
      );

      // Local control: the provider is reachable again.
      asLocal();
      const local = await fetchShipmentScans({ ok: false, error: "" }, fd);
      assert.ok(local.ok, "local tracking must still call the provider (control)");
      assert.deepEqual(
        delhiverySpy.calls,
        ["1234567890"],
        "local tracking must call Delhivery exactly once",
      );

      pass("tracking: Preview refuses before the Delhivery call; local unaffected");
    }

    // ── 1c. review is ordered db-first, so no explicit guard is needed ────────
    {
      asPreview();
      simulateDbGuard = true;
      cloudinarySpy.uploads.length = 0;
      prismaCalls.length = 0;

      const fd = new FormData();
      fd.set("slug", "");
      fd.set("mode", "create");
      fd.set("rating", "5");
      fd.set("title", "Great board");
      fd.set("body", "This board is a real joy to type on every single day.");
      fd.append(
        "images",
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "photo.png", {
          type: "image/png",
        }),
      );

      await assert.rejects(
        () => submitReview({}, fd),
        /blocked/,
        "review must abort when the database guard throws",
      );
      assert.ok(
        prismaCalls.length > 0,
        "review must touch the database before any upload",
      );
      assert.equal(
        cloudinarySpy.uploads.length,
        0,
        "review must not upload before the database guard",
      );

      simulateDbGuard = false;
      pass("review: database guard fires before any Cloudinary upload");
    }

    // ── 2. shipping routes expose a distinct Preview error code ───────────────
    {
      const serviceQuote = await import(
        path.join(REPO, "src/app/api/shipping/service-quote/route.ts")
      );
      const calculate = await import(
        path.join(REPO, "src/app/api/shipping/calculate/route.ts")
      );

      const post = (url: string, body: string) =>
        new NextRequest(`http://localhost${url}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });

      asPreview();
      resetRateLimits();
      // Deliberately invalid JSON: the guard must short-circuit before parsing.
      const sqPreview = await serviceQuote.POST(post("/api/shipping/service-quote", "not json"));
      const sqBody = await sqPreview.json();
      assert.equal(sqPreview.status, 503, "service-quote Preview must be 503");
      assert.equal(
        sqBody.errorCode,
        "PREVIEW_DISABLED",
        "service-quote must use the distinct Preview code",
      );
      assert.equal(
        sqBody.message,
        PREVIEW_OPERATION_DISABLED_MESSAGE,
        "service-quote Preview message must be the shared refusal",
      );

      const caPreview = await calculate.POST(post("/api/shipping/calculate", "not json"));
      const caBody = await caPreview.json();
      assert.equal(caPreview.status, 503, "calculate Preview must be 503");
      assert.equal(
        caBody.errorCode,
        "PREVIEW_DISABLED",
        "calculate must use the distinct Preview code",
      );
      assert.deepEqual(caBody.shipping, [], "calculate Preview must return no options");

      // Local control: the guard is not applied and a bad body is a plain 400.
      asLocal();
      resetRateLimits();
      const sqLocal = await serviceQuote.POST(post("/api/shipping/service-quote", "{}"));
      const sqLocalBody = await sqLocal.json();
      assert.equal(sqLocal.status, 400, "local service-quote bad body must be 400");
      assert.equal(
        sqLocalBody.errorCode,
        "INVALID_PINCODE",
        "local service-quote must keep its existing error code",
      );

      resetRateLimits();
      const caLocal = await calculate.POST(post("/api/shipping/calculate", "{}"));
      const caLocalBody = await caLocal.json();
      assert.equal(caLocal.status, 400, "local calculate bad body must be 400");
      assert.equal(
        caLocalBody.errorCode,
        "INVALID_PINCODE",
        "local calculate must keep its existing error code",
      );

      pass("shipping: Preview uses PREVIEW_DISABLED; local behaviour unchanged");
    }

    console.log(`\nPASS all ${n} preview action guard tests`);
  } finally {
    if (savedVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedVercelEnv;
  }
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
