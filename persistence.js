// Keep a job until its write is acknowledged, including writes already in flight.
class SaveQueue {
  constructor({ delay = 400, retryDelay = 2000, onChange = () => {}, onError = () => {} } = {}) {
    Object.assign(this, { delay, retryDelay, onChange, onError });
    this.jobs = new Map(); this.revision = 0; this.edits = new Map();
  }
  has(key) { return this.jobs.has(key); }
  changedSince(key, revision) { return (this.edits.get(key) || 0) > revision; }
  later(key, fn) {
    let job = this.jobs.get(key);
    if (!job) { job = { key, version: 0 }; this.jobs.set(key, job); }
    clearTimeout(job.timer); job.fn = fn; job.version++; job.error = null;
    this.edits.set(key, ++this.revision);
    this.schedule(job, this.delay); this.onChange(this);
  }
  schedule(job, delay) {
    clearTimeout(job.timer);
    job.timer = setTimeout(() => { job.timer = null; this.run(job).catch(() => {}); }, delay);
  }
  run(job) {
    if (job.running) return job.running;
    if (this.jobs.get(job.key) !== job) return Promise.resolve();
    clearTimeout(job.timer); job.timer = null;
    const version = job.version, fn = job.fn;
    job.running = Promise.resolve().then(fn).then(result => {
      if (result === false || result?.ok === false) throw new Error('保存先が書き込みを受け付けませんでした');
      job.error = null;
      if (job.version === version) this.jobs.delete(job.key);
    }).catch(error => {
      job.error = error; this.onError(error, job.key); throw error;
    }).finally(() => {
      job.running = null;
      if (this.jobs.get(job.key) === job) this.schedule(job, job.error ? this.retryDelay : 0);
      this.onChange(this);
    });
    this.onChange(this); return job.running;
  }
  async flush() {
    // A save can enqueue another save (e.g. diary -> chat). Drain those too.
    while (this.jobs.size) {
      const jobs = [...this.jobs.values()];
      for (const job of jobs) { clearTimeout(job.timer); job.timer = null; }
      const results = await Promise.allSettled(jobs.map(job => this.run(job)));
      const failed = results.find(r => r.status === 'rejected');
      if (failed) throw failed.reason;
    }
  }
}

// Synchronous recovery copy before the debounce/IPC boundary. Never remove a
// newer edit when an older write completes. Namespaced by vault.
class RecoveryJournal {
  constructor(storage, vault) { this.storage = storage; this.prefix = 'pkm-recovery:' + JSON.stringify(vault) + ':'; }
  record(key, kind, payload) {
    const value = JSON.stringify({ kind, payload });
    this.storage.setItem(this.prefix + key, value); return value;
  }
  acknowledge(key, value) {
    if (this.storage.getItem(this.prefix + key) === value) this.storage.removeItem(this.prefix + key);
  }
  entries() {
    const out = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key.startsWith(this.prefix)) out.push({ key: key.slice(this.prefix.length), ...JSON.parse(this.storage.getItem(key)) });
    }
    return out;
  }
}

// Keep identities: mounted editors retain these objects in their callbacks.
// A pending/newer local edit must survive an older state response.
function reconcile(current, incoming, keyOf, protect = () => false) {
  const old = new Map(current.map(x => [keyOf(x), x]));
  const result = incoming.map(x => {
    const key = keyOf(x), live = old.get(key); old.delete(key);
    if (!live) return x;
    if (!protect(key)) Object.assign(live, x);
    return live;
  });
  for (const [key, value] of old) if (protect(key)) result.push(value);
  return result;
}

module.exports = { SaveQueue, RecoveryJournal, reconcile };
