import assert from "node:assert/strict";
import { readJsonBody } from "@/lib/http/read-json-body";
import {
  MAX_IMAGE_DIM,
  readImageDimensions,
} from "@/lib/images/read-dimensions";
import {
  sniffBoundedImageType,
  sniffImageType,
} from "@/lib/images/validation";
import {
  emailField,
  optionIdsJson,
  phoneField,
  requiredText,
  workTypesField,
} from "@/lib/validation/customer-input";
import {
  MAX_EMAIL,
  ORDER_JSON_LIMIT,
} from "@/lib/utils/limits";
import {
  PACKAGE_LIMITS,
  isValidPackage,
} from "@/lib/shipping/package-limits";

/**
 * The limiter test's sibling: the bounds that stop an oversized/off-schema
 * request from reaching the database, Razorpay, Delhivery or Cloudinary.
 */

(async () => {
let n = 0;
function pass(label: string) {
  console.log(`PASS ${++n} ${label}`);
}

// ── readJsonBody ────────────────────────────────────────────────────────────

{
  const req = new Request("http://test.local/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderNumber: "KF30X2A", amount: 123 }),
  });
  const read = await readJsonBody<{ orderNumber: string }>(req, 64 * 1024);
  assert.equal(read.ok, true);
  if (read.ok) assert.equal(read.data.orderNumber, "KF30X2A");
  pass("readJsonBody parses a normal JSON body");
}

{
  const req = new Request("http://test.local/x", {
    method: "POST",
    body: JSON.stringify({ blob: "x".repeat(4096) }),
  });
  const read = await readJsonBody(req, 1024);
  assert.equal(read.ok, false);
  if (!read.ok) assert.equal(read.status, 413);
  pass("readJsonBody rejects a body over the byte budget with 413");
}

{
  const req = new Request("http://test.local/x", { method: "POST", body: "{not json" });
  const read = await readJsonBody(req, 1024);
  assert.equal(read.ok, false);
  if (!read.ok) assert.equal(read.status, 400);
  pass("readJsonBody answers 400 for malformed JSON instead of throwing");
}

{
  const req = new Request("http://test.local/x", { method: "POST" });
  const read = await readJsonBody(req, 1024);
  assert.equal(read.ok, false);
  pass("readJsonBody answers 400 for an empty body");
}

{
  const req = {
    headers: new Headers({ "content-length": String(10 * 1024 * 1024) }),
    body: null,
  } as unknown as Request;
  const read = await readJsonBody(req, 1024);
  assert.equal(read.ok, false);
  if (!read.ok) assert.equal(read.status, 413);
  pass("readJsonBody rejects an oversized declared content-length up front");
}

// ── readImageDimensions ─────────────────────────────────────────────────────

function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const dv = new DataView(b.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return b;
}

function jpegBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0);
  const i = 20; // after the 18-byte APP0 segment
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], i); // SOF0
  const dv = new DataView(b.buffer);
  dv.setUint16(i + 5, height);
  dv.setUint16(i + 7, width);
  return b;
}

function webpVp8xBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  b.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  b.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  // Payload at 20: flags (20), reserved (21-23), then 3-byte LE canvas
  // width-1 at 24-26 and height-1 at 27-29.
  const w = width - 1;
  const h = height - 1;
  b[24] = w & 0xff;
  b[25] = (w >> 8) & 0xff;
  b[26] = (w >> 16) & 0xff;
  b[27] = h & 0xff;
  b[28] = (h >> 8) & 0xff;
  b[29] = (h >> 16) & 0xff;
  return b;
}

{
  assert.deepEqual(readImageDimensions(pngBytes(4032, 3024)), {
    width: 4032,
    height: 3024,
  });
  assert.deepEqual(readImageDimensions(jpegBytes(6000, 4000)), {
    width: 6000,
    height: 4000,
  });
  assert.deepEqual(readImageDimensions(webpVp8xBytes(1920, 1080)), {
    width: 1920,
    height: 1080,
  });
  pass("readImageDimensions decodes JPEG, PNG and WebP headers");
}

{
  const huge = readImageDimensions(pngBytes(20000, 15000));
  assert.ok(huge && huge.width > MAX_IMAGE_DIM);
  assert.equal(readImageDimensions(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])), null);
  const ftyp = new Uint8Array(24);
  ftyp.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp" (avif container — not parsed)
  assert.equal(readImageDimensions(ftyp), null);
  pass("readImageDimensions returns oversized dims and skips avif/garbage");
}

{
  const avif = new Uint8Array(16);
  avif.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
  avif.set([0x61, 0x76, 0x69, 0x66], 8); // "avif"
  assert.equal(sniffImageType(avif), "avif");
  assert.equal(readImageDimensions(avif), null);
  assert.equal(sniffBoundedImageType(avif), null);
  assert.equal(sniffBoundedImageType(pngBytes(64, 64)), "png");
  assert.equal(sniffBoundedImageType(webpVp8xBytes(64, 64)), "webp");
  pass("customer uploads reject avif and accept dimension-bounded formats");
}

// ── customer-input schemas ──────────────────────────────────────────────────

{
  assert.equal(emailField().parse("  Foo@Bar.com "), "foo@bar.com");
  assert.equal(emailField().safeParse("nope").success, false);
  assert.equal(emailField().safeParse(`${"a".repeat(MAX_EMAIL + 5)}@x.io`).success, false);
  pass("emailField normalizes case and enforces the length cap");
}

{
  assert.equal(phoneField().parse(""), undefined);
  assert.equal(phoneField().parse("9876543210"), "9876543210");
  assert.equal(phoneField().safeParse("98765").success, false);
  pass("phoneField clears on empty and requires exactly 10 digits");
}

{
  const t = requiredText("Name", 5);
  assert.equal(t.parse("  Bob "), "Bob");
  assert.equal(t.safeParse("").success, false);
  assert.equal(t.safeParse("123456").success, false);
  pass("requiredText trims and enforces min 1 / max N");
}

{
  assert.equal(workTypesField().safeParse(["Lubing"]).success, true);
  assert.equal(workTypesField().safeParse(["Made Up Work"]).success, false);
  assert.equal(workTypesField().safeParse([]).success, false);
  assert.equal(workTypesField().safeParse(Array(11).fill("Lubing")).success, false);
  pass("workTypesField allows only the allow-list and caps at 10");
}

{
  assert.deepEqual(optionIdsJson().parse('["a","b"]'), ["a", "b"]);
  assert.deepEqual(optionIdsJson().parse("[]"), []);
  assert.equal(optionIdsJson().safeParse('["a","a"]').success, false);
  assert.equal(
    optionIdsJson().safeParse(JSON.stringify(Array(11).fill("a"))).success,
    false,
  );
  assert.equal(
    optionIdsJson().safeParse(JSON.stringify(["x".repeat(121)])).success,
    false,
  );
  assert.equal(optionIdsJson().safeParse("{oops").success, false);
  pass("optionIdsJson caps count, per-id length, duplicates and JSON shape");
}

// ── package limits ──────────────────────────────────────────────────────────

{
  assert.equal(PACKAGE_LIMITS.MAX_DIM_CM, 100);
  assert.equal(PACKAGE_LIMITS.MAX_COMBINED_CM, 250);
  assert.equal(
    isValidPackage({ lengthCm: 80, widthCm: 80, heightCm: 80, weightKg: 10 }),
    true,
  );
  assert.equal(
    isValidPackage({ lengthCm: 150, widthCm: 10, heightCm: 10, weightKg: 1 }),
    false,
    "a single side over 100 cm is rejected",
  );
  assert.equal(
    isValidPackage({ lengthCm: 90, widthCm: 90, heightCm: 90, weightKg: 1 }),
    false,
    "a combined size over 250 cm is rejected",
  );
  assert.equal(
    isValidPackage({ lengthCm: 80, widthCm: 80, heightCm: 80, weightKg: 31 }),
    false,
    "weight over 30 kg is rejected",
  );
  pass("isValidPackage enforces the size, combined-size and weight caps");
}

{
  assert.equal(ORDER_JSON_LIMIT >= 64 * 1024, true);
  pass("the order body budget is at least the default budget");
}
})();
