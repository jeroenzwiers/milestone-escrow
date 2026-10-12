// Storage backends behind lib/store.ts. Projects and milestones are stored as JSON
// documents either in a local file (development, tests) or in Postgres (deployment,
// e.g. Neon), selected by DATABASE_URL. Uploaded files live in the same backend.
import { promises as fs } from "node:fs";
import path from "node:path";

export type Doc = { id: string };
export type ProjectDoc = Doc & { createdAt: string };
export type MilestoneDoc = Doc & { projectId: string };
export type StoredFile = { mediaType: string; data: Buffer };

export interface Backend {
  getProject(id: string): Promise<{ project: ProjectDoc; milestones: MilestoneDoc[] } | undefined>;
  getMilestone(id: string): Promise<MilestoneDoc | undefined>;
  allMilestones(): Promise<MilestoneDoc[]>;
  insert(project: ProjectDoc, milestones: MilestoneDoc[]): Promise<void>;
  /** Run fn with the project and its milestones locked; changes made by fn are saved. */
  mutateProject<T>(id: string, fn: (project: ProjectDoc, milestones: MilestoneDoc[]) => T): Promise<T>;
  mutateMilestone<T>(id: string, fn: (milestone: MilestoneDoc) => T): Promise<T>;
  replaceAll(projects: ProjectDoc[], milestones: MilestoneDoc[]): Promise<void>;
  putFile(key: string, file: StoredFile): Promise<void>;
  getFile(key: string): Promise<StoredFile | undefined>;
  /** True the first time an id is marked; used for webhook idempotency across restarts. */
  markProcessed(eventId: string): Promise<boolean>;
  isProcessed(eventId: string): Promise<boolean>;
}

// ---------- JSON file (local development and tests) ----------

class FileBackend implements Backend {
  private queue: Promise<unknown> = Promise.resolve();
  private processed = new Set<string>();

  constructor(private dir: string) {}

  private get dbFile() {
    return path.join(this.dir, "db.json");
  }

  private async load(): Promise<{ projects: ProjectDoc[]; milestones: MilestoneDoc[] }> {
    try {
      const db = JSON.parse(await fs.readFile(this.dbFile, "utf8"));
      if (Array.isArray(db.projects)) return db;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    return { projects: [], milestones: [] };
  }

  private async save(db: { projects: ProjectDoc[]; milestones: MilestoneDoc[] }) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.dbFile, JSON.stringify(db, null, 2));
  }

  // Serialize writes within this process so concurrent requests can't clobber each other.
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async getProject(id: string) {
    const db = await this.load();
    const project = db.projects.find((p) => p.id === id);
    return project && { project, milestones: db.milestones.filter((m) => m.projectId === id) };
  }

  async getMilestone(id: string) {
    return (await this.load()).milestones.find((m) => m.id === id);
  }

  async allMilestones() {
    return (await this.load()).milestones;
  }

  insert(project: ProjectDoc, milestones: MilestoneDoc[]) {
    return this.exclusive(async () => {
      const db = await this.load();
      db.projects.push(project);
      db.milestones.push(...milestones);
      await this.save(db);
    });
  }

  mutateProject<T>(id: string, fn: (p: ProjectDoc, ms: MilestoneDoc[]) => T) {
    return this.exclusive(async () => {
      const db = await this.load();
      const p = db.projects.find((x) => x.id === id);
      if (!p) throw new Error(`Project ${id} not found`);
      const result = fn(p, db.milestones.filter((m) => m.projectId === id));
      await this.save(db);
      return result;
    });
  }

  mutateMilestone<T>(id: string, fn: (m: MilestoneDoc) => T) {
    return this.exclusive(async () => {
      const db = await this.load();
      const m = db.milestones.find((x) => x.id === id);
      if (!m) throw new Error(`Milestone ${id} not found`);
      const result = fn(m);
      await this.save(db);
      return result;
    });
  }

  replaceAll(projects: ProjectDoc[], milestones: MilestoneDoc[]) {
    return this.exclusive(() => this.save({ projects, milestones }));
  }

  private filePath(key: string) {
    return path.join(this.dir, "files", key.replace(/[^\w.-]+/g, "_"));
  }

  async putFile(key: string, file: StoredFile) {
    await fs.mkdir(path.join(this.dir, "files"), { recursive: true });
    await fs.writeFile(this.filePath(key), file.data);
    await fs.writeFile(`${this.filePath(key)}.type`, file.mediaType);
  }

  async getFile(key: string) {
    try {
      return { data: await fs.readFile(this.filePath(key)), mediaType: await fs.readFile(`${this.filePath(key)}.type`, "utf8") };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  async markProcessed(eventId: string) {
    if (this.processed.has(eventId)) return false;
    this.processed.add(eventId);
    return true;
  }

  async isProcessed(eventId: string) {
    return this.processed.has(eventId);
  }
}

// ---------- Postgres (Neon in deployment, PGlite in tests) ----------

type Rows<T> = { rows: T[] };
type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<Rows<T>>;
type Driver = { query: Query; transaction<T>(fn: (q: Query) => Promise<T>): Promise<T> };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  doc jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS milestones (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position int NOT NULL,
  doc jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS milestones_project ON milestones(project_id);
CREATE TABLE IF NOT EXISTS files (
  key text PRIMARY KEY,
  media_type text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS processed_events (
  id text PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now()
);
`;

class SqlBackend implements Backend {
  private ready: Promise<void>;

  constructor(private db: Driver) {
    this.ready = (async () => {
      for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
    })();
  }

  private async q() {
    await this.ready;
    return this.db.query;
  }

  async getProject(id: string) {
    const query = await this.q();
    const p = await query<{ doc: ProjectDoc }>("SELECT doc FROM projects WHERE id = $1", [id]);
    if (!p.rows[0]) return undefined;
    const ms = await query<{ doc: MilestoneDoc }>("SELECT doc FROM milestones WHERE project_id = $1 ORDER BY position", [id]);
    return { project: p.rows[0].doc, milestones: ms.rows.map((r) => r.doc) };
  }

  async getMilestone(id: string) {
    const query = await this.q();
    return (await query<{ doc: MilestoneDoc }>("SELECT doc FROM milestones WHERE id = $1", [id])).rows[0]?.doc;
  }

  async allMilestones() {
    const query = await this.q();
    return (await query<{ doc: MilestoneDoc }>("SELECT doc FROM milestones ORDER BY project_id, position")).rows.map((r) => r.doc);
  }

  async insert(project: ProjectDoc, milestones: MilestoneDoc[]) {
    await this.ready;
    await this.db.transaction(async (q) => {
      await q("INSERT INTO projects (id, doc) VALUES ($1, $2::jsonb)", [project.id, JSON.stringify(project)]);
      for (const [i, m] of milestones.entries()) {
        await q("INSERT INTO milestones (id, project_id, position, doc) VALUES ($1, $2, $3, $4::jsonb)", [m.id, project.id, i, JSON.stringify(m)]);
      }
    });
  }

  async mutateProject<T>(id: string, fn: (p: ProjectDoc, ms: MilestoneDoc[]) => T) {
    await this.ready;
    return this.db.transaction(async (q) => {
      const p = (await q<{ doc: ProjectDoc }>("SELECT doc FROM projects WHERE id = $1 FOR UPDATE", [id])).rows[0]?.doc;
      if (!p) throw new Error(`Project ${id} not found`);
      const ms = (await q<{ doc: MilestoneDoc }>("SELECT doc FROM milestones WHERE project_id = $1 ORDER BY position FOR UPDATE", [id])).rows.map((r) => r.doc);
      const result = fn(p, ms);
      await q("UPDATE projects SET doc = $2::jsonb WHERE id = $1", [id, JSON.stringify(p)]);
      for (const m of ms) await q("UPDATE milestones SET doc = $2::jsonb WHERE id = $1", [m.id, JSON.stringify(m)]);
      return result;
    });
  }

  async mutateMilestone<T>(id: string, fn: (m: MilestoneDoc) => T) {
    await this.ready;
    return this.db.transaction(async (q) => {
      const m = (await q<{ doc: MilestoneDoc }>("SELECT doc FROM milestones WHERE id = $1 FOR UPDATE", [id])).rows[0]?.doc;
      if (!m) throw new Error(`Milestone ${id} not found`);
      const result = fn(m);
      await q("UPDATE milestones SET doc = $2::jsonb WHERE id = $1", [id, JSON.stringify(m)]);
      return result;
    });
  }

  async replaceAll(projects: ProjectDoc[], milestones: MilestoneDoc[]) {
    await this.ready;
    await this.db.transaction(async (q) => {
      await q("DELETE FROM milestones");
      await q("DELETE FROM projects");
      for (const p of projects) {
        await q("INSERT INTO projects (id, doc) VALUES ($1, $2::jsonb)", [p.id, JSON.stringify(p)]);
        const own = milestones.filter((m) => m.projectId === p.id);
        for (const [i, m] of own.entries()) {
          await q("INSERT INTO milestones (id, project_id, position, doc) VALUES ($1, $2, $3, $4::jsonb)", [m.id, p.id, i, JSON.stringify(m)]);
        }
      }
    });
  }

  async putFile(key: string, file: StoredFile) {
    const query = await this.q();
    await query("INSERT INTO files (key, media_type, data) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET media_type = EXCLUDED.media_type, data = EXCLUDED.data", [key, file.mediaType, file.data]);
  }

  async getFile(key: string) {
    const query = await this.q();
    const row = (await query<{ media_type: string; data: Uint8Array }>("SELECT media_type, data FROM files WHERE key = $1", [key])).rows[0];
    return row && { mediaType: row.media_type, data: Buffer.from(row.data) };
  }

  async markProcessed(eventId: string) {
    const query = await this.q();
    const res = await query<{ id: string }>("INSERT INTO processed_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id", [eventId]);
    return res.rows.length === 1;
  }

  async isProcessed(eventId: string) {
    const query = await this.q();
    return (await query("SELECT 1 FROM processed_events WHERE id = $1", [eventId])).rows.length === 1;
  }
}

async function pgDriver(url: string): Promise<Driver> {
  const { Pool } = await import("pg");
  // Neon closes idle connections; keep the pool small and let it reconnect.
  // Keep full certificate verification explicit; pg will weaken "sslmode=require" in a future major version.
  const connectionString = url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, "$1verify-full");
  const pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  pool.on("error", (err) => console.error("postgres pool", err));
  const query: Query = (text, params) => pool.query(text, params as unknown[]) as never;
  return {
    query,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn((text, params) => client.query(text, params as unknown[]) as never);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function pgliteDriver(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const query: Query = (text, params) => db.query(text, params) as never;
  return { query, transaction: (fn) => db.transaction((tx) => fn((text, params) => tx.query(text, params) as never)) };
}

/** Lazily constructed backend; SqlBackend needs an async driver, so this proxies until it is ready. */
function lazySql(driver: () => Promise<Driver>): Backend {
  const backend = driver().then((d) => new SqlBackend(d));
  return new Proxy({} as Backend, {
    get: (_t, prop: keyof Backend) =>
      async (...args: unknown[]) => {
        const b = await backend;
        return (b[prop] as (...a: unknown[]) => unknown).apply(b, args);
      },
  });
}

function createBackend(): Backend {
  if (process.env.DATABASE_URL) return lazySql(() => pgDriver(process.env.DATABASE_URL!));
  if (process.env.STORE === "pglite") return lazySql(pgliteDriver);
  return new FileBackend(process.env.DATA_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data"));
}

// One backend per process, kept across dev-server hot reloads.
const g = globalThis as { __escrowBackend?: Backend };
export const backend: Backend = (g.__escrowBackend ??= createBackend());

export function backendName(): string {
  return process.env.DATABASE_URL ? "postgres" : process.env.STORE === "pglite" ? "pglite" : "file";
}
