import "./setup";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { authorizeMilestone, authorizeProject, hashToken, issueAccess, roleFor, TOKEN_HEADER } from "../lib/access";
import { resetStore, updateProject } from "../lib/store";

const req = (token?: string, query?: string) =>
  new Request(`http://localhost/api/x${query ? `?t=${query}` : ""}`, { headers: token ? { [TOKEN_HEADER]: token } : {} });

describe("personal links", () => {
  let tokens: { client: string; freelancer: string };

  beforeEach(async () => {
    await resetStore();
    const issued = issueAccess();
    tokens = issued.tokens;
    await updateProject("p_bakery", (p) => void (p.access = issued.access));
  });

  it("stores only hashes, never the tokens themselves", () => {
    const { tokens: t, access } = issueAccess();
    assert.notEqual(access.client, t.client);
    assert.equal(access.client, hashToken(t.client));
    assert.ok(t.client.length >= 32);
  });

  it("derives the role from the token", () => {
    const { tokens: t, access } = issueAccess();
    assert.equal(roleFor({ access }, t.client), "client");
    assert.equal(roleFor({ access }, t.freelancer), "freelancer");
    assert.equal(roleFor({ access }, "made-up"), null);
    assert.equal(roleFor({ access }, null), null);
    assert.equal(roleFor({}, t.client), null);
  });

  it("rejects requests without a valid link", async () => {
    await assert.rejects(authorizeProject(req(), "p_bakery"), (e: any) => e.status === 401);
    await assert.rejects(authorizeProject(req("wrong"), "p_bakery"), (e: any) => e.status === 401);
  });

  it("does not reveal whether a project exists", async () => {
    const missing = await authorizeProject(req(tokens.client), "p_nope").catch((e) => e);
    const wrong = await authorizeProject(req("wrong"), "p_bakery").catch((e) => e);
    assert.equal(missing.status, wrong.status);
    assert.equal(missing.message, wrong.message);
  });

  it("enforces which party may act", async () => {
    assert.equal((await authorizeMilestone(req(tokens.client), "m1", ["client"])).role, "client");
    await assert.rejects(authorizeMilestone(req(tokens.freelancer), "m1", ["client"]), (e: any) => e.status === 403);
    await assert.rejects(authorizeMilestone(req(tokens.client), "m1", ["freelancer"]), (e: any) => e.status === 403);
  });

  it("does not accept a token from the URL, where it could leak into logs", async () => {
    await assert.rejects(authorizeProject(req(undefined, tokens.freelancer), "p_bakery"), (e: any) => e.status === 401);
  });

  it("does not accept one project's link for another project", async () => {
    const other = issueAccess();
    await updateProject("p_bakery", (p) => void (p.access = other.access));
    await assert.rejects(authorizeProject(req(tokens.client), "p_bakery"), (e: any) => e.status === 401);
  });
});
