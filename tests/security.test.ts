import "./setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertPublicUrl, isPrivateAddress } from "../lib/evidence";
import { clientIp } from "../lib/ratelimit";

describe("SSRF guard", () => {
  it("flags private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111"]) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });
  it("rejects internal URLs, other schemes and embedded credentials", async () => {
    for (const url of ["http://127.0.0.1:3000/api/projects", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "file:///etc/passwd", "https://user:pw@example.com/", "not a url"]) {
      await assert.rejects(assertPublicUrl(url), url);
    }
  });
});

describe("client IP for rate limiting", () => {
  it("ignores X-Forwarded-For when no proxy is trusted", () => {
    assert.equal(clientIp("1.2.3.4", 0), "direct");
  });
  it("uses the address appended by the trusted proxy, not the client-supplied one", () => {
    assert.equal(clientIp("6.6.6.6, 203.0.113.9", 1), "203.0.113.9");
  });
  it("skips over additional trusted proxies", () => {
    assert.equal(clientIp("6.6.6.6, 203.0.113.9, 10.0.0.2", 2), "203.0.113.9");
  });
});
