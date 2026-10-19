import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, readdir, rmdir, open } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { validatePublicSnapshot } from './snapshot.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, cause) => Object.assign(new Error(code), { code, cause });
const isId = id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
const encode = value => Buffer.from(JSON.stringify(value));
async function durableWrite(path, bytes) {
  const handle = await open(path, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

// Append-only object and generation files. A .complete marker is the commit
// point. Readers ignore incomplete files. Power-loss durability is unproven.
export function createLocalSnapshotStorage(root, { hook = async () => {} } = {}) {
  if (typeof root !== 'string' || !resolve(root).startsWith(resolve(tmpdir()) + sep)) {
    throw new Error('Local storage root must be a dedicated directory under OS temp');
  }
  const objects = join(root, 'objects');
  const lock = join(root, 'publish.lock');
  const call = (point, context) => hook(point, context);
  async function initialize() { await mkdir(objects, { recursive: true }); }
  async function put(candidate) {
    await initialize();
    validatePublicSnapshot(candidate);
    const bytes = encode(candidate), id = digest(bytes);
    const target = join(objects, `${id}.json`), marker = join(objects, `${id}.complete`);
    const objectLock = join(objects, `.lock-${id}`);
    await call('beforeObjectWrite', { id });
    try { await mkdir(objectLock); }
    catch (error) { if (error.code === 'EEXIST') throw fail('OBJECT_BUSY', error); throw error; }
    try {
      let complete = false;
      try { await readFile(marker); complete = true; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!complete) {
        // The per-object lock excludes a live writer during local retry.
        await unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
        await durableWrite(target, bytes);
        await call('afterTemporaryWrite', { id });
        await durableWrite(marker, Buffer.from(id));
      }
      await call('afterObjectWrite', { id });
      const actual = await readFile(target);
      if (!actual.equals(bytes)) throw fail('IMMUTABLE_CONFLICT');
      return id;
    } finally { await rmdir(objectLock); }
  }
  async function get(id) {
    if (!isId(id)) throw fail('INVALID_OBJECT_ID');
    await call('beforeObjectRead', { id });
    let bytes, marker;
    try {
      [bytes, marker] = await Promise.all([
        readFile(join(objects, `${id}.json`)), readFile(join(objects, `${id}.complete`))
      ]);
    } catch (error) { throw fail(error.code === 'ENOENT' ? 'OBJECT_MISSING' : 'STORAGE_UNAVAILABLE', error); }
    if (marker.toString() !== id || digest(bytes) !== id) throw fail('OBJECT_CORRUPT');
    try { const value = JSON.parse(bytes.toString('utf8')); validatePublicSnapshot(value); return value; }
    catch (error) { throw fail('OBJECT_CORRUPT', error); }
  }
  async function pointer() {
    await call('beforePointerRead');
    let names;
    try { names = await readdir(root); }
    catch (error) { if (error.code === 'ENOENT') return null; throw fail('STORAGE_UNAVAILABLE', error); }
    const generations = names.map(name => /^publication-(\d+)\.complete$/.exec(name))
      .filter(Boolean).map(match => Number(match[1])).sort((a, b) => b - a);
    if (!generations.length) return null;
    const generation = generations[0];
    if (!Number.isSafeInteger(generation) || generation < 1) throw fail('POINTER_CORRUPT');
    try {
      const raw = await readFile(join(root, `publication-${generation}.json`));
      const marker = await readFile(join(root, `publication-${generation}.complete`));
      if (marker.toString() !== digest(raw)) throw new Error('Pointer marker mismatch');
      const value = JSON.parse(raw.toString('utf8'));
      if (!isId(value.id) || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
          value.generation !== generation || typeof value.datasetVersion !== 'string') throw new Error('Invalid pointer');
      return value;
    } catch (error) { throw fail('POINTER_CORRUPT', error); }
  }
  async function compareAndSwap(expectedGeneration, next) {
    await initialize();
    try { await mkdir(lock); }
    catch (error) { if (error.code === 'EEXIST') throw fail('PUBLISH_BUSY', error); throw error; }
    try {
      const old = await pointer();
      if ((old?.generation ?? 0) !== expectedGeneration) return { applied: false, pointer: old };
      const stored = await get(next.id);
      if (stored.sourceRevision !== next.revision || stored.datasetVersion !== next.datasetVersion ||
          (old && (next.revision < old.revision ||
            (next.revision === old.revision && next.id !== old.id)))) {
        throw fail('INVALID_PROMOTION');
      }
      const record = { id: next.id, revision: next.revision,
        datasetVersion: next.datasetVersion, generation: expectedGeneration + 1 };
      const raw = encode(record);
      const path = join(root, `publication-${record.generation}.json`);
      const marker = join(root, `publication-${record.generation}.complete`);
      await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await durableWrite(path, raw);
      await call('beforePointerCommit', record);
      await durableWrite(marker, Buffer.from(digest(raw)));
      await call('afterPointerCommit', record);
      return { applied: true, pointer: record };
    } finally { await rmdir(lock); }
  }
  async function history() {
    const names = await readdir(objects).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    return names.filter(name => /^[a-f0-9]{64}\.complete$/.test(name)).map(name => name.slice(0, 64)).sort();
  }
  return { root, initialize, put, get, pointer, compareAndSwap, history };
}
