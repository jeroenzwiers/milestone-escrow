// Checks the configured storage backend end to end: create, read, update under a lock,
// files and webhook idempotency. With DATABASE_URL set this runs against Postgres (Neon).
// Usage: npm run db:check
import { backendName } from "../lib/db";
import { getFile, getProject, insertProject, isEventProcessed, markEventProcessed, newDemoScenario, putFile, updateMilestone } from "../lib/store";

async function main() {
  console.log(`backend: ${backendName()}`);
  const { projects, milestones } = newDemoScenario();
  const project = { ...projects[0], title: `db-check ${new Date().toISOString()}` };
  await insertProject(project, milestones);
  console.log(`✔ inserted project ${project.id} with ${milestones.length} milestones`);

  const back = await getProject(project.id);
  if (!back || back.milestones.length !== 3 || back.milestones[0].id !== milestones[0].id) throw new Error("read-back mismatch");
  console.log("✔ read back, milestones in order");

  // Ten concurrent updates on one milestone must all survive (row lock, no lost updates).
  await Promise.all(Array.from({ length: 10 }, (_, i) => updateMilestone(milestones[0].id, (m) => void m.events.push({ at: new Date().toISOString(), type: `check-${i}` }))));
  const events = (await getProject(project.id))!.milestones[0].events.length;
  if (events !== 10) throw new Error(`expected 10 events after concurrent updates, got ${events}`);
  console.log("✔ 10 concurrent updates, none lost");

  const key = `uploads/${milestones[0].id}/check/1-check.png`;
  await putFile(key, "image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const file = await getFile(key);
  if (file?.mediaType !== "image/png" || file.data.length !== 4) throw new Error("file round-trip failed");
  console.log("✔ file stored and read back");

  const eventId = `check-${project.id}`;
  if (!(await markEventProcessed(eventId)) || (await markEventProcessed(eventId)) || !(await isEventProcessed(eventId))) {
    throw new Error("webhook idempotency failed");
  }
  console.log("✔ webhook event ids are idempotent");
  console.log("\nStorage works. (The check project stays in the database; it has no links, so nobody can open it.)");
  process.exit(0);
}

main().catch((err) => {
  console.error("✘", err.message);
  process.exit(1);
});
