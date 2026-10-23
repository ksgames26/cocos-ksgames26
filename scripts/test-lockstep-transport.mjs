import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";

const bundle = readFileSync(
  new URL("../game-framework/colyseus-cocos-creator.js", import.meta.url),
  "utf8",
);
const source = ts.transpileModule(
  readFileSync(
    new URL("../game-framework/lockstep/transport.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
function load(overrides = {}) {
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    ArrayBuffer,
    Uint8Array,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
    WebSocket,
    Blob,
    fetch,
    Headers,
    Request,
    Response,
    AbortController,
    ...overrides,
  });
  vm.runInContext(bundle, context);
  context.exports = {};
  context.require = (name) => {
    assert.equal(name, "../colyseus");
    return { colyseus: context.Colyseus };
  };
  vm.runInContext(source, context);
  return context.exports.LockstepTransport;
}
const Transport = load();
const reservation = {
  name: "lockstep",
  roomId: "room",
  processId: "process",
  sessionId: "session",
};
const match = { status: "matched", manifest: {}, reservation };
async function until(predicate) {
  for (let count = 0; count < 100; count++) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail("清理未在一秒内完成");
}

async function fixture(t, stage, httpDelay = 0) {
  const sockets = new Set();
  const upgradedSockets = new Set();
  let requests = 0;
  let pendingHttp = 0;
  let upgrades = 0;
  const server = createServer(async (_request, response) => {
    requests++;
    pendingHttp++;
    response.once("close", () => pendingHttp--);
    if (stage === "http") return;
    if (httpDelay) await delay(httpDelay);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(reservation));
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
  });
  server.on("upgrade", (request, socket) => {
    upgrades++;
    upgradedSockets.add(socket);
    socket.on("close", () => upgradedSockets.delete(socket));
    socket.on("end", () => socket.end());
    socket.resume();
    if (stage === "connecting") return;
    const accept = createHash("sha1")
      .update(
        request.headers["sec-websocket-key"] +
          "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      )
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    // 保持 WebSocket 活跃但不发送 JOIN_ROOM；只响应客户端关闭帧。
    socket.on("data", (bytes) => {
      if ((bytes[0] & 15) === 8) socket.end(Buffer.from([0x88, 0]));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return {
    url: `ws://127.0.0.1:${server.address().port}`,
    get requests() {
      return requests;
    },
    get pendingHttp() {
      return pendingHttp;
    },
    get upgrades() {
      return upgrades;
    },
    get sockets() {
      return upgradedSockets.size;
    },
  };
}

for (const stage of ["http", "connecting", "handshake"]) {
  for (const action of ["timeout", "abort", "dispose"]) {
    test(`${stage} 阶段 ${action} 立即拒绝并回收真实传输`, async (t) => {
      const peer = await fixture(t, stage);
      const transport = new Transport(peer.url);
      t.after(() => transport.dispose());
      const controller = new AbortController();
      const pending = transport.reconnect("room:token", {
        timeoutMs: action === "timeout" ? 250 : 5000,
        signal: controller.signal,
      });
      const rejected = assert.rejects(pending, /timed out|cancelled|disposed/);
      await until(() =>
        stage === "http" ? peer.requests === 1 : peer.upgrades === 1,
      );
      if (action === "abort") controller.abort(new Error("cancelled"));
      if (action === "dispose") transport.dispose();
      await rejected;
      await until(() =>
        stage === "http" ? peer.pendingHttp === 0 : peer.sockets === 0,
      );
      assert.equal(peer.upgrades, stage === "http" ? 0 : 1);
    });
  }
}

test("初次 connect 同样受房间握手总时限约束", async (t) => {
  const peer = await fixture(t, "handshake");
  const transport = new Transport(peer.url);
  await assert.rejects(
    transport.connect(match, { timeoutMs: 150 }),
    /timed out/,
  );
  await until(() => peer.sockets === 0);
  transport.dispose();
});

test("预约和房间握手共用时限，进入下一阶段不重新计时", async (t) => {
  const peer = await fixture(t, "handshake", 220);
  const transport = new Transport(peer.url);
  const start = performance.now();
  await assert.rejects(
    transport.reconnect("room:token", { timeoutMs: 350 }),
    /timed out/,
  );
  assert.equal(peer.upgrades, 1);
  assert.ok(performance.now() - start < 520);
  await until(() => peer.sockets === 0);
  transport.dispose();
});

test("并发尝试分别取消，预先取消及销毁后调用不产生请求", async (t) => {
  const peer = await fixture(t, "http");
  const transport = new Transport(peer.url);
  const controller = new AbortController();
  const first = transport.reconnect("room:token", {
    signal: controller.signal,
  });
  const firstRejected = assert.rejects(first, /cancelled/);
  let secondEnded = false;
  const second = transport.reconnect("room:token").finally(() => {
    secondEnded = true;
  });
  const secondRejected = assert.rejects(second, /disposed/);
  await until(() => peer.requests === 2);
  controller.abort(new Error("cancelled"));
  await firstRejected;
  await until(() => peer.pendingHttp === 1);
  assert.equal(secondEnded, false);
  await assert.rejects(
    transport.reconnect("room:token", { signal: controller.signal }),
    /cancelled/,
  );
  transport.dispose();
  await secondRejected;
  await until(() => peer.pendingHttp === 0);
  await assert.rejects(transport.connect(match), /disposed/);
  assert.equal(peer.requests, 2);
});

test("无 fetch 和 AbortController 的 XHR 路径可取消，迟到响应不再建连", async () => {
  const requests = [];
  let websocketCalls = 0;
  class XHR {
    open() {}
    setRequestHeader() {}
    send() {
      requests.push(this);
    }
    abort() {
      this.aborted = true;
    }
  }
  const XhrTransport = load({
    fetch: undefined,
    AbortController: undefined,
    XMLHttpRequest: XHR,
    WebSocket: class {
      constructor() {
        websocketCalls++;
      }
    },
  });
  for (const action of ["timeout", "dispose"]) {
    const transport = new XhrTransport("ws://127.0.0.1:1");
    const promise = transport.reconnect("room:token", { timeoutMs: 50 });
    const rejected = assert.rejects(promise, /timed out|disposed/);
    await until(() => requests.length > 0);
    const xhr = requests.shift();
    const lateLoad = xhr.onload;
    if (action === "dispose") transport.dispose();
    await rejected;
    assert.equal(xhr.aborted, true);
    assert.equal(xhr.onload, null);
    xhr.status = 200;
    xhr.responseText = JSON.stringify(reservation);
    lateLoad();
    await delay(10);
    assert.equal(websocketCalls, 0);
    transport.dispose();
  }
});

test("取消后迟到的 SDK 房间不能泄漏，已成功交付的房间不被 transport 销毁", async () => {
  const pending = [];
  let closed = 0;
  class FakeClient {
    consumeSeatReservation() {
      return new Promise((resolve) =>
        pending.push(() => resolve({ connection: { close: () => closed++ } })),
      );
    }
  }
  const exports = {};
  new Function("exports", "require", source)(exports, () => ({
    colyseus: { Client: FakeClient },
  }));
  const transport = new exports.LockstepTransport("ws://test");
  const controller = new AbortController();
  const cancelled = transport.connect(match, { signal: controller.signal });
  const rejected = assert.rejects(cancelled, /cancelled/);
  await until(() => pending.length === 1);
  controller.abort(new Error("cancelled"));
  await rejected;
  pending.shift()();
  await until(() => closed === 1);
  const success = transport.connect(match);
  await until(() => pending.length === 1);
  pending.shift()();
  const room = await success;
  transport.dispose();
  assert.equal(closed, 1);
  room.connection.close();
  assert.equal(closed, 2);
});

test("XHR 预约成功进入握手，服务端拒绝保留错误且不建立连接", async (t) => {
  const peer = await fixture(t, "handshake");
  const sent = [];
  let status = 200;
  class XHR {
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader() {}
    send(body) {
      sent.push({ method: this.method, url: this.url, body });
      queueMicrotask(() => {
        this.status = status;
        this.responseText = JSON.stringify(
          status === 200 ? reservation : { error: "expired" },
        );
        this.onload();
      });
    }
    abort() {
      assert.fail("已完成的 XHR 不应再次 abort");
    }
  }
  const XhrTransport = load({
    fetch: undefined,
    AbortController: undefined,
    XMLHttpRequest: XHR,
  });
  const transport = new XhrTransport(peer.url);
  await assert.rejects(
    transport.reconnect("room:token", { timeoutMs: 150 }),
    /timed out/,
  );
  await until(() => peer.sockets === 0);
  assert.equal(peer.upgrades, 1);
  assert.deepEqual(sent[0], {
    method: "POST",
    url: peer.url.replace("ws:", "http:") + "/matchmake/reconnect/room",
    body: '{"reconnectionToken":"token"}',
  });
  status = 409;
  await assert.rejects(transport.reconnect("room:token"), /expired/);
  assert.equal(peer.upgrades, 1);
  transport.dispose();
});
