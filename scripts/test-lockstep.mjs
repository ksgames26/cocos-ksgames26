import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function load(name, imports = {}) {
  const exports = {};
  const source = readFileSync(
    new URL(`../game-framework/lockstep/${name}.ts`, import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  new Function("exports", "require", code)(exports, (id) => {
    if (!(id in imports)) throw new Error("Unexpected dependency: " + id);
    return imports[id];
  });
  return exports;
}
const core = load("core");
const { LockstepLobbyClient, NetworkLockstepSession } = load("network", {
  "./core": core,
});
const manifest = core.validateManifest({
  version: 1,
  matchId: "test",
  contentHash: "content",
  seed: 42,
  tickRate: 60,
  inputDelay: 3,
  maxFrames: 180,
  actors: ["a"],
});
class Connection {
  listeners = new Map();
  sent = [];
  left = false;
  onMessage(type, handler) {
    this.listeners.set(type, handler);
    return () => this.listeners.delete(type);
  }
  send(type, body) {
    this.sent.push({ type, body });
  }
  emit(type, value) {
    this.listeners.get(type)?.(value);
  }
  reply(value, ok = true, channel = "ls:reply") {
    this.emit(channel, { id: this.sent.at(-1).body.id, ok, value });
  }
  async leave() {
    this.left = true;
  }
}
class Simulation {
  reset() {
    this.frame = -1;
  }
  step(frame) {
    this.frame = frame.frame;
  }
  checksum() {
    return "hash" + this.frame;
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("评分查询关联应答，结算状态通知与补帧恢复一致", async () => {
  const room = new Connection();
  const lobby = new LockstepLobbyClient(room);
  const request = lobby.profile("race");
  assert.deepEqual(room.sent.at(-1).body, {
    op: "profile",
    queueId: "race",
    id: 1,
  });
  const profile = {
    mmr: 1100,
    games: 3,
    rank: { tier: 2, name: "新秀", minimumMmr: 1100 },
    queueId: "race",
    seasonId: "s1",
  };
  room.reply(profile, true, "ls:match-reply");
  assert.deepEqual(await request, profile);
  lobby.dispose();
  const session = new NetworkLockstepSession(room, manifest, new Simulation());
  let notified;
  session.onRating = (status) => {
    notified = status;
  };
  room.emit("ls:rating", { status: "settled" });
  assert.equal(session.ratingStatus, "settled");
  assert.equal(notified, "settled");
  const syncing = session.synchronize();
  room.reply({
    manifest,
    actorId: "a",
    started: true,
    ended: "frame-limit",
    ratingStatus: "failed",
    nextFrame: 0,
    frames: [],
  });
  await syncing;
  assert.equal(session.ratingStatus, "failed");
  await session.dispose();
  assert.equal(room.listeners.size, 0);
});

test("lobby disposal rejects pending requests and preserves the application GS connection", async () => {
  const room = new Connection();
  const lobby = new LockstepLobbyClient(room);
  const first = lobby.join("race", "content");
  const second = lobby.poll();
  room.emit("ls:match-reply", {
    id: room.sent[0].body.id,
    ok: true,
    value: { status: "queued" },
  });
  assert.equal((await first).status, "queued");
  const rejected = assert.rejects(second, /closed/);
  lobby.dispose();
  await rejected;
  assert.equal(room.left, false);
  assert.equal(room.listeners.size, 0);
  await assert.rejects(lobby.poll(), /closed/);
});

test("batched pump captures each checkpoint at its original state and coalesces reports", async () => {
  const room = new Connection();
  const session = new NetworkLockstepSession(room, manifest, new Simulation());
  const timeline = new core.LockstepTimeline(manifest);
  for (let i = 0; i < 120; i++) room.emit("ls:frame", timeline.seal());
  assert.equal(session.pump(120), 120);
  const reporting = session.reportChecksum();
  assert.equal(session.reportChecksum(), reporting);
  assert.equal(room.sent.at(-1).body.hash, "hash59");
  room.reply(true);
  await flush();
  assert.equal(room.sent.at(-1).body.hash, "hash119");
  room.reply(true);
  await reporting;
  await session.dispose();
  assert.equal(room.listeners.size, 0);
});

test("reconnect cancels an in-flight replay immediately and preserves the simulation cursor", async () => {
  const old = new Connection();
  const session = new NetworkLockstepSession(old, manifest, new Simulation());
  const pending = session.synchronize();
  const rejected = assert.rejects(pending, /closed/);
  const next = new Connection();
  const reconnect = session.reconnect(next);
  await rejected;
  await flush();
  assert.equal(old.listeners.size, 0);
  const timeline = new core.LockstepTimeline(manifest);
  next.reply({
    manifest,
    actorId: "a",
    started: true,
    ended: "",
    nextFrame: 2,
    frames: [timeline.seal(), timeline.seal()],
  });
  await reconnect;
  assert.equal(session.pump(), 2);
  assert.equal(session.driver.runner.nextFrame, 2);
  await session.dispose();
});

test("a changed replay manifest is rejected before applying history", async () => {
  const room = new Connection();
  const session = new NetworkLockstepSession(room, manifest, new Simulation());
  const syncing = session.synchronize();
  room.reply({
    manifest: { ...manifest, seed: 100 },
    frames: [],
    nextFrame: 0,
  });
  await assert.rejects(syncing, /manifest mismatch/);
  assert.equal(session.driver.runner.nextFrame, 0);
  await session.dispose();
});
