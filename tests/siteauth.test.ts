import "./setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowPlanning } from "../lib/ratelimit";
import { isAuthorized } from "../lib/siteauth";
import { bumpCounter } from "../lib/store";

const basic = (user: string, pass: string) => `Basic ${btoa(`${user}:${pass}`)}`;

describe("site password", () => {
  it("accepts the right user and password", () => {
    assert.equal(isAuthorized(basic("demo", "s3cret:with:colons"), "demo", "s3cret:with:colons"), true);
  });
  it("rejects a wrong password, a wrong user, a missing header and garbage", () => {
    assert.equal(isAuthorized(basic("demo", "nope"), "demo", "s3cret"), false);
    assert.equal(isAuthorized(basic("admin", "s3cret"), "demo", "s3cret"), false);
    assert.equal(isAuthorized(null, "demo", "s3cret"), false);
    assert.equal(isAuthorized("Basic !!!not-base64", "demo", "s3cret"), false);
    assert.equal(isAuthorized(`Bearer ${btoa("demo:s3cret")}`, "demo", "s3cret"), false);
  });
  it("rejects a password that is only a prefix of the real one", () => {
    assert.equal(isAuthorized(basic("demo", "s3c"), "demo", "s3cret"), false);
  });
});

describe("persistent daily limits", () => {
  it("counts atomically per key", async () => {
    const values = await Promise.all(Array.from({ length: 5 }, () => bumpCounter("test:concurrent")));
    assert.deepEqual([...values].sort(), [1, 2, 3, 4, 5]);
  });

  it("stops planning once the daily total is used up, regardless of address", async () => {
    process.env.PLAN_LIMIT_PER_DAY = "20"; // default; the limit is read at import time
    const req = (ip: string) => new Request("http://localhost", { headers: { "x-forwarded-for": ip } });
    // Use up today's total from many different addresses.
    const day = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < 20; i++) await bumpCounter(`plan:${day}`);
    assert.equal(await allowPlanning(req("203.0.113.77")), false);
  });
});
