import "./setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signedFileUrl, verifyFileUrl } from "../lib/files";
import { getFile, putFile } from "../lib/store";

const params = (url: string) => new URL(url, "http://localhost").searchParams;

describe("signed file URLs", () => {
  it("round-trips a valid URL to its key", () => {
    assert.equal(verifyFileUrl(params(signedFileUrl("uploads/m1/s1/1-shot.png"))), "uploads/m1/s1/1-shot.png");
  });

  it("rejects an expired URL", () => {
    const url = signedFileUrl("uploads/m1/s1/a.png", Date.now() - 11 * 60_000);
    assert.equal(verifyFileUrl(params(url)), null);
  });

  it("rejects a URL whose key was swapped for another file", () => {
    const p = params(signedFileUrl("uploads/m1/s1/a.png"));
    p.set("k", "uploads/m2/s9/secret.pdf");
    assert.equal(verifyFileUrl(p), null);
  });

  it("rejects a URL whose expiry was extended", () => {
    const p = params(signedFileUrl("uploads/m1/s1/a.png"));
    p.set("exp", String(Date.now() + 365 * 86_400_000));
    assert.equal(verifyFileUrl(p), null);
  });

  it("rejects missing parameters", () => {
    assert.equal(verifyFileUrl(new URLSearchParams("k=uploads/x")), null);
  });
});

describe("file storage", () => {
  it("stores and returns bytes and media type", async () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    await putFile("uploads/m1/s1/1-shot.png", "image/png", data);
    const back = await getFile("uploads/m1/s1/1-shot.png");
    assert.equal(back?.mediaType, "image/png");
    assert.deepEqual([...back!.data], [...data]);
  });

  it("returns undefined for an unknown key", async () => {
    assert.equal(await getFile("uploads/none/none/none.png"), undefined);
  });
});

describe("database URL from the environment", () => {
  it("strips surrounding quotes and whitespace, and treats empty as unset", async () => {
    const { normalizeDatabaseUrl } = await import("../lib/db");
    const url = "postgresql://u:p@host/db?sslmode=require";
    assert.equal(normalizeDatabaseUrl(`"${url}"`), url);
    assert.equal(normalizeDatabaseUrl(`  '${url}'  `), url);
    assert.equal(normalizeDatabaseUrl(` ${url}\n`), url);
    assert.equal(normalizeDatabaseUrl(url), url);
    assert.equal(normalizeDatabaseUrl('""'), undefined);
    assert.equal(normalizeDatabaseUrl("  "), undefined);
    assert.equal(normalizeDatabaseUrl(undefined), undefined);
  });
});
