import { database } from "./store";
import { jobIndexVersion, reconcileJobRecords } from "./job-matching";
import type { Job, JobSourceRecord } from "./jobs";

export async function loadJobIndex() {
  const row = await database().prepare("SELECT payload FROM life_records WHERE id='job:matching'").first<{ payload: string }>();
  if (!row) return null;
  const metadata = JSON.parse(row.payload);
  if (metadata.version !== jobIndexVersion) return null;
  const rows = await database().prepare("SELECT payload FROM life_records WHERE kind='job_index' ORDER BY id").all<{ payload: string }>();
  const chunks = rows.results.map(row => JSON.parse(row.payload));
  if (chunks.length !== metadata.chunks || chunks.some(chunk => chunk.generation !== metadata.generation)) return null;
  return { jobs: chunks.flatMap(chunk => chunk.jobs) as Job[], metadata };
}

export async function updateJobIndex(records: JobSourceRecord[], force = false) {
  const previous = await loadJobIndex();
  const fingerprint = JSON.stringify(records.map(record => [record.source.id, record.source.enabled, record.snapshot.lastSuccess, record.snapshot.jobs.length]));
  if (!force && previous?.metadata.fingerprint === fingerprint) return previous.metadata;
  const now = new Date().toISOString(), generation = crypto.randomUUID();
  const result = reconcileJobRecords(records, previous?.jobs || [], now);
  const chunks: Job[][] = [];
  for (let i = 0; i < result.jobs.length; i += 100) chunks.push(result.jobs.slice(i, i + 100));
  const metadata = { version: jobIndexVersion, generation, fingerprint, chunks: chunks.length, lastRunAt: now, ...result.stats };
  // D1 batches are transactional: a reader sees a complete index or keeps its
  // prior snapshot. No external matching service or browser session is required.
  await database().batch([
    database().prepare("DELETE FROM life_records WHERE kind='job_index'"),
    ...chunks.map((jobs, index) => database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES (?,'job_index',?,?)").bind(`job-index:${String(index).padStart(5, "0")}`, JSON.stringify({ generation, jobs }), now)),
    database().prepare("INSERT INTO life_records (id,kind,payload,updated_at) VALUES ('job:matching','job_control',?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(JSON.stringify(metadata), now),
  ]);
  return metadata;
}
