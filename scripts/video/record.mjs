// Records the demo video's picture: a real run of the team flow in a visible Chrome,
// with stills taken per narration line (demo/video/narration.json, by "cue").
//
// Adapted from the Study Coach recorder, with one difference in approach. There the
// page played the clips and the recorder followed in real time. Here the agents take a
// minute and PayPal waits for a person to log in, so this records a storyboard instead:
// for every line the stills that belong to it, in order. scripts/video/mux.py then
// gives each line exactly the length of its clip and spreads that line's stills over
// it. The waiting disappears; everything shown really happened.
//
// As in the Premortem recorder, Chrome runs headless (HEADFUL=1 shows it), so nothing
// moves on screen while it records.
//
//   npm run build && npm start          # the app on http://localhost:3000 (set CHALLENGE_WINDOW_MINUTES=1)
//   node scripts/video/record.mjs       # frames + demo/video/storyboard.json
//   python scripts/video/mux.py         # the finished mp4
//
// The two PayPal payments are made by hand: the recorder opens the PayPal link in your
// own browser, you pay with the client sandbox account, and the recorder waits for it.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.DEMO_URL || "http://localhost:3000";
const OUT = path.resolve("demo/video");
const FRAMES = path.join(OUT, "frames");
const EVIDENCE_PDF = path.resolve("demo/evidence/fietskoerier-trial-week-log.pdf");
const PR_URL = "https://github.com/jeroenzwiers/gouden-korst-webshop/pull/2";
const DELIVERY = ["BezorgBende", "Fietskoerier Demodorp"];

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

// 1280x720 at 1.5x gives 1920x1080 stills of a page laid out as if zoomed to 150%,
// so small text survives YouTube (same choice as the Study Coach video).
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: process.env.HEADFUL ? false : true,
  defaultViewport: null,
  // Window sized to the captured viewport plus browser chrome, so nothing is rescaled between stills.
  args: ["--window-size=1280,860", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check"],
});
const [page] = await browser.pages();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });

const board = []; // { cue, file }
let n = 0;
async function shot(cue, target = page) {
  const file = path.join(FRAMES, `f${String(n++).padStart(4, "0")}.jpg`);
  // Only the visible viewport: capturing beyond it makes Chrome resize the page for every
  // still, which shows on screen as the page jumping between sizes.
  await target.screenshot({ path: file, type: "jpeg", quality: 92, captureBeyondViewport: false });
  board.push({ cue, file: path.relative(OUT, file).replaceAll("\\", "/") });
}

async function waitFor(fn, { timeout = 120_000, every = 600, label = "condition", arg } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${label}`);
    await sleep(every);
  }
}

// Click the first element matching `selector` whose text contains `text`.
async function click(selector, text) {
  const ok = await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => !t || e.textContent.includes(t));
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    },
    selector,
    text,
  );
  if (!ok) throw new Error(`Nothing to click: ${selector} "${text ?? ""}"`);
  await sleep(500);
}

async function scrollTo(selector, text, block = "start") {
  await page.evaluate(
    (sel, t, b) => {
      const el = [...document.querySelectorAll(sel)].find((e) => !t || e.textContent.includes(t));
      el?.scrollIntoView({ block: b });
    },
    selector,
    text,
    block,
  );
  await sleep(400);
}

const titleCard = (big, small) => `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;background:#0b2a6f;color:#fff;font-family:system-ui,Segoe UI,sans-serif;text-align:center">
<div style="font-size:15px;letter-spacing:.2em;opacity:.75;text-transform:uppercase">PayPal AI Hackathon</div>
<div style="font-size:58px;font-weight:700;margin:14px 0 18px">Milestone Escrow</div>
<div style="font-size:24px;max-width:820px;line-height:1.35">${big}</div>
<div style="font-size:15px;margin-top:26px;opacity:.75">${small}</div></body></html>`;

// Follow the agents' live trace: a still each time a line is added.
async function followTrace(cue, doneFn, label, cueFor) {
  let seen = -1;
  const until = Date.now() + 6 * 60_000;
  while (Date.now() < until) {
    const state = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".negotiation.live li")];
      items.at(-1)?.scrollIntoView({ block: "center" });
      return { count: items.length, texts: items.map((li) => li.textContent) };
    });
    if (state.count !== seen && state.count > 0) {
      seen = state.count;
      await sleep(150);
      const cues = [cueFor ? cueFor(state.texts) : cue].flat();
      await shot(cues[0]);
      // One still can belong to two lines when both moments arrived in the same refresh.
      for (const extra of cues.slice(1)) board.push({ cue: extra, file: board.at(-1).file });
    }
    if (await page.evaluate(doneFn)) return;
    await sleep(700);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// The client's API call from inside the page, with the link token this browser holds.
function clientCall(apiPath, body) {
  return page.evaluate(
    async (p, b) => {
      const id = location.pathname.split("/")[2];
      const token = JSON.parse(localStorage.getItem(`escrow:tokens:${id}`) ?? "{}").client;
      const res = await fetch(p.replace(":id", id), {
        method: "POST",
        headers: { "x-escrow-token": token, "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      return { ok: res.ok, json: await res.json().catch(() => ({})) };
    },
    apiPath,
    body,
  );
}

// The same PayPal order the button would open, paid through its approve link in your own
// browser: the recorder keeps one still of the PayPal page and waits until the money is in.
async function payWithPayPal(cue) {
  const { ok, json } = await clientCall("/api/projects/:id/fund", { returnUrl: `${BASE}/` });
  if (!ok || !json.approveUrl) throw new Error(`Could not create the PayPal order: ${json.error ?? "no approve link"}`);

  const paypal = await browser.newPage();
  await paypal.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
  await paypal.goto(json.approveUrl, { waitUntil: "networkidle2", timeout: 60_000 }).catch(() => {});
  await sleep(2500);
  await shot(cue, paypal);
  await paypal.close();

  // Opens in your default browser; rundll32 takes the URL as one argument, & and all.
  spawn("rundll32", ["url.dll,FileProtocolHandler", json.approveUrl], { detached: true, stdio: "ignore" }).unref();
  say("PayPal opened in your browser: log in with the CLIENT sandbox account (sb-ychkk…) and pay.");
  say(`If it did not open: ${json.approveUrl}`);

  // Capturing fails until the payment is approved; try every few seconds.
  const until = Date.now() + 15 * 60_000;
  for (;;) {
    const r = await clientCall("/api/projects/:id/fund/capture", { orderId: json.orderId });
    if (r.ok) break;
    if (Date.now() > until) throw new Error(`Payment not received: ${r.json.error ?? "timeout"}`);
    await sleep(4000);
  }
  await page.reload({ waitUntil: "networkidle0" });
  await waitFor(() => !document.querySelector(".fund-plan") && !!document.querySelector(".milestone"), { label: "the plan to be funded" });
  say("Funded.");
}

async function actAs(name) {
  await click(".role-switch button", name);
  await sleep(1200);
}

async function cardStatus(name) {
  return page.evaluate((nm) => {
    const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm);
    return card?.querySelector(".badge")?.textContent ?? null;
  }, name);
}

async function deliver(name, cueBefore, cueReview, fill) {
  await actAs(name);
  const before = await cardStatus(name);
  if (before !== "funded") throw new Error(`${name}'s milestone is "${before}", not funded; nothing to deliver`);
  await page.evaluate((nm) => {
    const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm);
    card?.querySelector("form.deliver")?.scrollIntoView({ block: "center" });
  }, name);
  await fill();
  if (cueBefore) await shot(cueBefore);
  await page.evaluate((nm) => {
    const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm);
    card?.querySelector("form.deliver button[type=submit]")?.click();
  }, name);
  say(`${name} submitted; the AI reviewer is checking…`);
  // A still per new step of the review, then the verdict.
  let seen = -1;
  const until = Date.now() + 5 * 60_000;
  while (Date.now() < until) {
    const s = await page.evaluate((nm) => {
      const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm);
      const trace = card?.querySelectorAll(".notice.reviewing ol.trace li") ?? [];
      card?.querySelector(".notice.reviewing, .verification")?.scrollIntoView({ block: "center" });
      return { steps: trace.length, status: card?.querySelector(".badge")?.textContent };
    }, name);
    if (s.status === "AI reviewing" && s.steps !== seen && s.steps > 0) {
      seen = s.steps;
      await shot(cueReview);
    }
    if (s.status && s.status !== "AI reviewing" && s.status !== "funded") break;
    await sleep(800);
  }
  await page.evaluate((nm) => {
    const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm);
    card?.querySelector(".verification")?.scrollIntoView({ block: "start" });
  }, name);
  await sleep(500);
  await shot(cueReview);
  const status = await cardStatus(name);
  say(`${name}: ${status}`);
  return status;
}

try {
  // 1. Title card, then the home page.
  await page.setContent(titleCard("Give it a goal and a budget. A team assembles, and everyone is paid when their part is verified.", "PayPal sandbox · demo provider agents"));
  await shot("intro");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await waitFor(() => document.body.innerText.includes("Try the team demo"), { label: "the home page" });
  await shot("home");

  // 2. The goal.
  await page.goto(`${BASE}/goals/new`, { waitUntil: "networkidle0" });
  await click("button.link", "Use example");
  await shot("goal-form");
  await click("button[type=submit]", "Assemble a team");
  await waitFor(() => location.pathname.startsWith("/projects/"), { label: "the project page" });
  say("Agents are assembling the team…");

  // 3. Live negotiation, assigned to the narration by what the trace says.
  let declineSeen = false;
  let courierSeen = false;
  await followTrace(
    "trace-start",
    () => !!document.querySelector(".team-plan") || document.body.innerText.includes("No plan could be assembled"),
    "the plan",
    (texts) => {
      const decline = texts.some((t) => /Studio Pixel: declines/i.test(t));
      const courier = texts.some((t) => /Fietskoerier Demodorp: (offers|declines)/i.test(t));
      const cues = [];
      if (decline && !declineSeen) cues.push("trace-decline");
      if (courier && !courierSeen && decline) cues.push("trace-courier");
      declineSeen ||= decline;
      courierSeen ||= courier && decline;
      if (cues.length) return cues;
      return courierSeen ? "trace-courier" : declineSeen ? "trace-decline" : "trace-start";
    },
  );
  if (await page.evaluate(() => document.body.innerText.includes("No plan could be assembled"))) throw new Error("The agents could not assemble a plan this time; run again.");
  await scrollTo(".team-plan");
  await shot("plan");
  await scrollTo(".rationale");
  await shot("plan");

  // 4. Approve and fund with one PayPal payment.
  await click(".approval button.primary", "Approve plan");
  await waitFor(() => !!document.querySelector(".fund-plan"), { label: "the PayPal button" });
  await scrollTo(".fund-plan", null, "center");
  await shot("paypal");
  await payWithPayPal("paypal");
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(600);
  await shot("funded");

  // 5. The courier in the plan drops out; the planner replans live.
  const courier = await page.evaluate((names) => [...document.querySelectorAll(".provider-chip")].map((c) => c.textContent).find((t) => names.includes(t)), DELIVERY);
  if (!courier) throw new Error("No courier in this plan; run again for the dropout scene.");
  await page.evaluate(() => document.querySelector("details.demo-controls")?.setAttribute("open", ""));
  await scrollTo("details.demo-controls", null, "center");
  await shot("dropout");
  await click("details.demo-controls button", `${courier} drops out`);
  await followTrace("replan-trace", () => !!document.querySelector(".replan") || document.body.innerText.includes("No plan could be assembled"), "plan v2");
  await scrollTo(".replan");
  await shot("plan-v2");
  await scrollTo(".money-effect", null, "center");
  await shot("plan-v2");
  await click(".replan button.primary", "Approve plan v2");
  await waitFor(() => !document.querySelector(".replan"), { label: "plan v2 to be applied" });
  // New or changed work may need funding; give the page time to show the PayPal button.
  const needsFunding = await waitFor(
    () => (document.querySelector(".fund-plan") ? "pay" : [...document.querySelectorAll("section.milestone .badge")].every((b) => b.textContent !== "not funded") ? "funded" : null),
    { label: "plan v2 funding state", timeout: 60_000 },
  );
  if (needsFunding === "pay") await payWithPayPal("plan-v2-paid");

  // 6. Deliveries: Daan's pull request (expected: changes requested), the courier's log (expected: verified).
  const newCourier = await page.evaluate(
    (names, gone) => [...document.querySelectorAll("section.milestone")].map((c) => c.querySelector(".provider-chip")?.textContent).find((t) => names.includes(t) && t !== gone),
    DELIVERY,
    courier,
  );
  await deliver("Daan Visser", "deliver-daan", "review-daan", async () => {
    await page.evaluate((url) => {
      const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === "Daan Visser");
      const set = (sel, v) => {
        const el = card.querySelector(sel);
        const proto = Object.getPrototypeOf(el);
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      set("textarea[name=note]", "Order page with PayPal checkout, pickup and lunchtime delivery slots.");
      set("textarea[name=links]", url);
    }, PR_URL);
  });
  if (newCourier) {
    await deliver(newCourier, null, "review-courier", async () => {
      const handle = await page.evaluateHandle((nm) => {
        const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm);
        return card.querySelector("input[type=file]");
      }, newCourier);
      await handle.uploadFile(EVIDENCE_PDF);
    });
    // Payout: the client releases right away instead of waiting out the window.
    await actAs("Client");
    if ((await cardStatus(newCourier)) === "verified") {
      await page.evaluate((nm) => {
        const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm);
        [...card.querySelectorAll("button")].find((b) => b.textContent.includes("Release now"))?.click();
      }, newCourier);
      await waitFor((nm) => [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm)?.innerText.includes("Paid out"), { label: "the payout", arg: newCourier });
    }
    await page.evaluate((nm) => {
      const card = [...document.querySelectorAll("section.milestone")].find((c) => c.querySelector(".provider-chip")?.textContent === nm);
      card?.querySelector(".settlement, .notice")?.scrollIntoView({ block: "center" });
    }, newCourier);
    await sleep(500);
    await shot("payout");
  }

  // 7. The record, and the closing card.
  await page.evaluate(() => {
    const logs = [...document.querySelectorAll("main > details")];
    logs.forEach((d) => d.setAttribute("open", ""));
    logs.at(-1)?.scrollIntoView({ block: "start" });
  });
  await sleep(500);
  await shot("audit");
  await page.evaluate(() => {
    const d = [...document.querySelectorAll("details")].find((x) => x.querySelector("summary")?.textContent.includes("why this team"));
    d?.setAttribute("open", "");
    d?.scrollIntoView({ block: "start" });
  });
  await sleep(500);
  await shot("offers");
  await page.setContent(titleCard("Give it a goal and a budget. A team assembles, and everyone is paid when their part is verified.", "github.com/jeroenzwiers/milestone-escrow"));
  await shot("title");
} catch (err) {
  console.error(`\n✘ ${err.message}`);
  console.error("Stills so far are kept; fix the cause and run again.");
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(OUT, "storyboard.json"), JSON.stringify(board, null, 2) + "\n");
  const cues = [...new Set(board.map((b) => b.cue))];
  say(`${board.length} stills for ${cues.length} cues: ${cues.join(", ")}`);
  await browser.close();
}
