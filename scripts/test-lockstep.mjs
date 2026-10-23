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
    const handlers = this.listeners.get(type) ?? new Set();
    handlers.add(handler);
    this.listeners.set(type, handlers);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) this.listeners.delete(type);
    };
  }
  send(type, body) {
    this.sent.push({ type, body });
  }
  emit(type, value) {
    for (const handler of this.listeners.get(type) ?? []) handler(value);
  }
  reply(value, ok = true, channel = "ls:reply") {
    this.emit(channel, { id: this.sent.at(-1).body.id, ok, value });
  }
  async leave(consented = true) {
    this.left = true;
    this.leftConsented = consented;
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

test("同一大厅重建或并存的包装器不会复用请求编号，旧回复不能串入新请求", async () => {
  const room = new Connection();
  const old = new LockstepLobbyClient(room);
  const pending = old.join("race", "content");
  const rejected = assert.rejects(pending, /closed/);
  const staleId = room.sent.at(-1).body.id;
  old.dispose();
  await rejected;
  const lobby = new LockstepLobbyClient(room);
  const parallel = new LockstepLobbyClient(room);
  let completed = false;
  const profile = lobby.profile("race").then((value) => {
    completed = true;
    return value;
  });
  const profileId = room.sent.at(-1).body.id;
  const poll = parallel.poll();
  const pollId = room.sent.at(-1).body.id;
  assert.equal(new Set([staleId, profileId, pollId]).size, 3);
  room.emit("ls:match-reply", {
    id: staleId,
    ok: true,
    value: { status: "matched" },
  });
  await flush();
  assert.equal(completed, false);
  room.emit("ls:match-reply", {
    id: pollId,
    ok: true,
    value: { status: "queued" },
  });
  assert.deepEqual(await poll, { status: "queued" });
  parallel.dispose();
  room.emit("ls:match-reply", {
    id: profileId,
    ok: true,
    value: { mmr: 1000 },
  });
  assert.deepEqual(await profile, { mmr: 1000 });
  lobby.dispose();
  assert.equal(room.listeners.size, 0);
});

test("120Hz 断线 30 秒的 225 页补帧能等待限流继续，写入被限流不能自动重发", async () => {
  const config = core.validateManifest({
    ...manifest,
    tickRate: 120,
    maxFrames: 12000,
  });
  const timeline = new core.LockstepTimeline(config);
  const frames = Array.from({ length: 3600 }, () => timeline.seal());
  const room = new Connection();
  let throttled = false;
  room.send = function (type, body) {
    this.sent.push({ type, body });
    queueMicrotask(() => {
      if (body.op === "sync" && (body.from !== 2880 || throttled)) {
        this.reply({
          manifest: config,
          actorId: "a",
          started: true,
          ended: "",
          nextFrame: frames.length,
          frames: frames.slice(body.from, body.from + 16),
        });
      } else {
        throttled = true;
        this.emit("ls:reply", {
          id: body.id,
          ok: false,
          code: "REPLAY_RATE_LIMIT",
          retryAfterMs: 1,
        });
      }
    });
  };
  const session = new NetworkLockstepSession(
    new Connection(),
    config,
    new Simulation(),
  );
  await session.reconnect(room);
  while (session.pump(120)) {}
  assert.equal(session.driver.runner.nextFrame, 3600);
  assert.equal(room.sent.length, 226);
  assert.equal(room.left, false);
  await assert.rejects(session.submit([[1]]));
  assert.equal(room.sent.filter((item) => item.body.op === "input").length, 1);
  await session.dispose();
});

test("补帧等待限流期间销毁会话立即取消，持续限流只有限次重试", async () => {
  for (const dispose of [true, false]) {
    const room = new Connection();
    room.send = function (type, body) {
      this.sent.push({ type, body });
      queueMicrotask(() =>
        this.emit("ls:reply", {
          id: body.id,
          ok: false,
          code: "REPLAY_RATE_LIMIT",
          retryAfterMs: dispose ? 1000 : 1,
        }),
      );
    };
    const session = new NetworkLockstepSession(
      room,
      manifest,
      new Simulation(),
    );
    const pending = session.synchronize();
    const rejected = assert.rejects(
      pending,
      dispose ? /closed/ : /rate limited/,
    );
    await flush();
    if (dispose) await session.dispose();
    await rejected;
    assert.equal(room.sent.length, dispose ? 1 : 4);
    await session.dispose();
  }
});

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

for (const reconnect of [false, true]) {
  test(`${reconnect ? "重连" : "同步"}补帧回复后的生命周期通知不能被旧快照覆盖`, async () => {
    const room = new Connection();
    const session = new NetworkLockstepSession(
      reconnect ? new Connection() : room,
      manifest,
      new Simulation(),
    );
    const ratings = [];
    session.onRating = (status) => ratings.push(status);
    try {
      const pending = reconnect
        ? session.reconnect(room)
        : session.synchronize();
      if (reconnect) await flush();
      // 同一次网络投递中，回复先到，通知后到，Promise 续体最后执行。
      room.reply({
        manifest,
        actorId: "a",
        started: false,
        ended: "",
        ratingStatus: "pending",
        nextFrame: 0,
        frames: [],
      });
      room.emit("ls:start", manifest);
      room.emit("ls:end", { reason: "frame-limit" });
      room.emit("ls:rating", { status: "settled" });
      await pending;
      assert.equal(session.started, true);
      assert.equal(session.endReason, "frame-limit");
      assert.equal(session.ratingStatus, "settled");
      assert.deepEqual(ratings, ["settled"]);
      await assert.rejects(session.submit([[1]]), /Cannot submit/);
    } finally {
      await session.dispose();
    }
  });
}

test("分页补帧期间保留迟到的失步通知，后到快照仍能恢复评分", async () => {
  const room = new Connection();
  const session = new NetworkLockstepSession(room, manifest, new Simulation());
  const timeline = new core.LockstepTimeline(manifest);
  const frames = [timeline.seal(), timeline.seal()];
  const snapshot = {
    manifest,
    actorId: "a",
    started: true,
    ended: "",
    ratingStatus: "pending",
    nextFrame: 2,
  };
  try {
    const pending = session.synchronize();
    room.reply({ ...snapshot, frames: frames.slice(0, 1) });
    await flush();
    assert.equal(room.sent.at(-1).body.from, 1);
    room.emit("ls:rating", { status: "pending" });
    room.reply({
      ...snapshot,
      ratingStatus: "failed",
      frames: frames.slice(1),
    });
    room.emit("ls:desync", { frame: 1 });
    await pending;
    assert.equal(session.endReason, "desync");
    assert.equal(session.ratingStatus, "failed");
    assert.equal(session.pump(), 2);
    await assert.rejects(session.submit([]), /Cannot submit/);
  } finally {
    await session.dispose();
  }
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

for (const operation of ["synchronize", "reportChecksum"]) {
  test(`等待 ${operation} 退出时销毁会话，不得泄漏新连接或监听`, async () => {
    const old = new Connection();
    const session = new NetworkLockstepSession(old, manifest, new Simulation());
    if (operation === "reportChecksum") {
      const timeline = new core.LockstepTimeline(manifest);
      for (let i = 0; i < 60; i++) old.emit("ls:frame", timeline.seal());
      session.pump(60);
    }
    const pending = session[operation]();
    const cancelled = assert.rejects(pending, /closed/);
    const next = new Connection();
    const reconnect = session.reconnect(next);
    const rejected = assert.rejects(reconnect, /disposed/);
    await session.dispose();
    await Promise.all([cancelled, rejected]);
    assert.equal(old.left, true);
    assert.equal(next.left, true);
    assert.equal(old.listeners.size, 0);
    assert.equal(next.listeners.size, 0);
    assert.equal(next.sent.length, 0);
  });
}

test("新连接补帧期间销毁或补帧失败，都释放连接和监听", async () => {
  for (const dispose of [true, false]) {
    const session = new NetworkLockstepSession(
      new Connection(),
      manifest,
      new Simulation(),
    );
    const next = new Connection();
    const reconnect = session.reconnect(next);
    const rejected = assert.rejects(
      reconnect,
      dispose ? /closed|disposed/ : /manifest mismatch/,
    );
    await flush();
    assert.equal(next.listeners.size, 6);
    if (dispose) await session.dispose();
    else next.reply({ manifest: { ...manifest, seed: 999 } });
    await rejected;
    assert.equal(next.left, true);
    assert.equal(next.leftConsented, dispose);
    assert.equal(next.listeners.size, 0);
    await session.dispose();
  }
});

test("并发重连拒绝额外连接，不干扰正在同步的连接", async () => {
  const session = new NetworkLockstepSession(
    new Connection(),
    manifest,
    new Simulation(),
  );
  const next = new Connection();
  const extra = new Connection();
  const reconnect = session.reconnect(next);
  await assert.rejects(session.reconnect(next), /already pending/);
  assert.equal(next.left, false);
  await assert.rejects(session.reconnect(extra), /already pending/);
  assert.equal(extra.left, true);
  await flush();
  next.reply({
    manifest,
    actorId: "a",
    started: true,
    ended: "",
    nextFrame: 0,
    frames: [],
  });
  await reconnect;
  assert.equal(next.left, false);
  await session.dispose();
  const late = new Connection();
  await assert.rejects(session.reconnect(late), /disposed/);
  assert.equal(late.left, true);
});

test("已断开的原生连接退出时不等待第二次离房通知", async () => {
  const room = new Connection();
  room.connection = { isOpen: false };
  room.leave = () => {
    throw new Error("断开的连接不能再次等待 leave");
  };
  const session = new NetworkLockstepSession(room, manifest, new Simulation());
  await session.dispose();
  assert.equal(room.listeners.size, 0);
});

test("重连补帧失败保持模拟游标，异常断开后可再次补齐且不重复执行", async () => {
  const old = new Connection();
  const session = new NetworkLockstepSession(old, manifest, new Simulation());
  const timeline = new core.LockstepTimeline(manifest);
  const frames = Array.from({ length: 70 }, () => timeline.seal());
  frames.slice(0, 10).forEach((frame) => old.emit("ls:frame", frame));
  assert.equal(session.pump(10), 10);
  const failed = new Connection();
  let closes = 0;
  failed.connection = { isOpen: true, close: () => closes++ };
  failed.leave = () => assert.fail("补帧失败不能发送主动离房或等待 leave 通知");
  const reconnecting = session.reconnect(failed);
  await flush();
  failed.emit("ls:reply", {
    id: failed.sent.at(-1).body.id,
    ok: false,
    error: "temporary",
  });
  await assert.rejects(reconnecting);
  assert.equal(closes, 1);
  assert.equal(failed.listeners.size, 0);
  assert.equal(session.driver.runner.nextFrame, 10);
  const retry = new Connection();
  retry.send = function (type, body) {
    this.sent.push({ type, body });
    queueMicrotask(() =>
      this.reply({
        manifest,
        actorId: "a",
        started: true,
        ended: "",
        nextFrame: 70,
        frames: frames.slice(body.from, body.from + 16),
      }),
    );
  };
  await session.reconnect(retry);
  assert.equal(session.pump(120), 60);
  assert.equal(session.driver.runner.simulation.checksum(), "hash69");
  assert.equal(session.pump(), 0);
  await session.dispose();
  assert.equal(retry.leftConsented, true);
});

test("终局后的失步通知不能改写结束原因，补帧恢复保持同一终态", async () => {
  const room = new Connection();
  const session = new NetworkLockstepSession(room, manifest, new Simulation());
  room.emit("ls:end", { reason: "frame-limit" });
  room.emit("ls:desync", { frame: 179 });
  assert.equal(session.endReason, "frame-limit");
  const syncing = session.synchronize();
  room.reply({
    manifest,
    actorId: "a",
    started: true,
    ended: "frame-limit",
    nextFrame: 0,
    frames: [],
  });
  await syncing;
  assert.equal(session.endReason, "frame-limit");
  await session.dispose();
});
