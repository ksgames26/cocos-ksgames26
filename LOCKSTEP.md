# 客户端帧同步

从 `game-framework/game-framework` 公开导入。旧 `IGameFramework.IFrameSync`、`IEnv.frameSyncConf` 已删除；使用明确的 manifest、输入、帧和 simulation 接口，不再通过空配置启用旧实现。

## MMR 与段位查询

在已登录的 GS 上使用 `await lobby.profile(queueId)` 获取当前玩家的 `LockstepRankProfile`（queueId、seasonId、mmr、games、rank.tier/name/minimumMmr）。服务器决定评分与段位，客户端不上传 MMR、赛季或目标身份。profile 与 join/poll/cancel 共用至少 200ms 的请求间隔。

`NetworkLockstepSession.ratingStatus` 为 `unrated/pending/settled/failed`，可通过 `onRating(status)` 接收变更；补帧 sync 同样恢复状态。settled 后从 GS 再查 profile 获取最新分数，failed 表示未能确认结算，应查询服务器审计结果。结束比赛不等于已经计分；服务器未配置可信玩法验证器时为 unrated。帧同步及哈希一致本身不能证明名次有效。

## 单机执行

游戏实现 `LockstepSimulation`：`reset(manifest)` 创建初始状态；`step(frame, dt)` 按输入更新；`checksum()` 返回完整确定性状态哈希。异步资源加载在创建 driver 前完成。

```ts
const local = new LocalLockstepDriver({
    version: 1, matchId: 'practice', contentHash: 'race-build-v1', seed: 123,
    tickRate: 60, inputDelay: 3, maxFrames: 36000, actors: ['local'],
}, simulation);

// 每个目标帧一个包，sequence 单调增加；游戏先量化为 int32。
local.submit('local', { frame: 0, sequence: 0, commands: [[1, 1000, -250]] });
// Cocos update(dt) 只负责驱动时钟；simulation 收到固定 1/60。
local.advance(dt, 8);
// local.frames 可用于重放；回放使用相同 manifest 和新的 simulation。
```

补帧预算只限制本次执行量，未执行的时间保留，不丢模拟帧。`step()` 可用于测试、录像逐帧回放。单机直接提交到目标帧；inputDelay 主要作为网络输入目标偏移。

## 大厅匹配与网络比赛

```ts
const lobby = new LockstepLobbyClient(existingGsRoom.nativeRoom);
let match = await lobby.join('race', loadedContentHash);
// 按 500ms 左右间隔 poll，处理 idle/queued/matched；取消排队调用 cancel。
match = await lobby.poll();
if (match.status !== 'matched' || !match.manifest) return;

const transport = new LockstepTransport(loginEndpoint);
let native = await transport.connect(match);
const session = new NetworkLockstepSession(native, match.manifest, simulation);
await session.ready(loadedContentHash);
// 等 session.started 后采集输入；同一目标帧必须先汇总，不重复 submit。
await session.submit([[1, 1000, -250]]);

// 每次 update(dt)：网络由 FS 帧驱动，不把渲染 dt 传入 simulation。
session.pump(8);
void session.reportChecksum().catch(handleNetworkError);
```

`submit()` 默认目标为最新收到的服务器帧 + 1 + inputDelay。渲染比逻辑帧快时，游戏必须按目标帧采集/合并，只提交一次；底层拒绝重复目标。未知是否送达的输入超时不自动重发。状态检查点在 pump 内按每 60 帧捕获，即使一次补多帧也不会漏采；`reportChecksum()` 合并并发，发送尚未上报的近期检查点。

把 lobby、transport 和 session 放在游戏 Service 生命周期内；UI 仅展示 queued、started、endReason 等状态。大厅连接继续处理 GS 消息，不把 FS 房间覆盖到原 ColyseusSdk 中。`lobby.dispose()` 只移除监听、不离开 GS；若希望退出队列，先 await cancel 再 dispose。`session.dispose()` 释放监听、拒绝挂起请求并主动离开 FS。

## 短重连

请求编号随底层连接单调递增；销毁或重建 lobby 包装器不会复用旧编号，迟到回复不会命中新请求。只读 sync 收到 `REPLAY_RATE_LIMIT` 后按服务端 1–1000ms 的提示等待，同一页最多重试 3 次；销毁或换连接会立即取消等待。输入和不确定是否送达的超时不重试。服务器的补帧与输入使用独立限流预算。

```ts
// 原连接意外 onLeave 时立即保存/使用 token；不要主动 leave 来模拟重连。
const token = native.reconnectionToken;
native = await transport.reconnect(token);
await session.reconnect(native);
if (!session.started && !session.endReason) await session.ready(loadedContentHash);
// 继续 pump；同一个 session 保留原 simulation、输入序号和下一帧。
```

Transport 关闭 SDK 自动重连，避免未经历史同步直接恢复游戏。游戏在网络错误回调中安排短窗口内有限重试，处理窗口到期；不要每个 update 并发重连。补历史按本地下一帧分页拉取，网络仍可接收新帧；缺帧不模拟，不跳到当前帧。不持久化 reconnectionToken 到公开日志。服务端首版窗口默认 15 秒，主动离开、到期或 FS 重启均不能恢复原比赛。

`session.reconnect(native)` 接管传入的新连接；等待旧请求期间若会话被 dispose，或新连接补帧失败，会移除监听并关闭该新连接。并发 reconnect 会拒绝额外调用并关闭其额外连接，当前重连继续执行。退出后不会重新绑定已销毁的会话。传输可选提供 `connection.isOpen`（原生 Colyseus 已提供），已断开的连接退出时直接完成清理，不再等待第二次离房通知。

## 赛车与 Jolt 接口边界

本模块定义帧驱动，不包含赛道、车辆配置或比赛结算。Jolt 异步初始化完成后再创建 simulation；关闭 `JoltWorld.autoSimulation`，由 simulation.step 先按 manifest.actors 顺序应用控制，再执行一次固定步物理，渲染单独插值。只能由一个 driver 推动物理世界，不能同时让组件 update 自动推进。

控制值先量化为整数；空 commands 表示该帧没有操作，若采用持续控制状态，游戏需明确每帧的默认油门/转向规则。使用插件 `DeterministicMath` 的三角函数/长度/归一化及 `LockstepRandom`。内容指纹需覆盖赛道、车辆参数、逻辑版本和已验证 WASM 哈希；服务端队列必须部署同一指纹。服务端排序一致不等于物理必然一致，也不等于成绩防作弊。

## 核心同步与验证

`game-framework/lockstep/core.ts` 为服务器框架纯核心的生成镜像，保留在客户端独立仓库中，单独克隆可直接使用。不要手改；消费工作区运行 `pnpm lockstep:sync` 更新，`pnpm lockstep:check` 比较规范化换行后的源码 SHA 和内容，两端子模块一起提交。其他消费项目若没有该脚本，应提供同等生成/比较机制或更新已验证的客户端版本。

类型检查不等于实机验证。消费项目 `pnpm --dir server/source test:lockstep` 使用真实 Redis/MySQL 和独立 DB/MM/两个 FS/GS/LG，执行实际客户端 core/network 源码的确定性整数模拟。Creator/Web/微信的输入采集、资源加载和 Jolt 设备一致性须另测。

独立客户端仓库运行 `pnpm test:lockstep`，验证请求释放、补帧检查点、重连取消旧请求、重连与销毁竞争、并发重连隔离及内容版本拒绝。多进程测试还执行本仓库自带的 Cocos Colyseus bundle 和 LockstepTransport，属于 Node 环境下的真实网络联调。
