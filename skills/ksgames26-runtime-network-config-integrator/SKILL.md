---
name: "ksgames26-runtime-network-config-integrator"
description: "Integrates runtime config and networking on ksgames26. Invoke when changing ConfService, protobuf registration, Colyseus request flow, room message dispatch, or binary config usage."
---

# Ksgames26 Runtime Network Config Integrator

为 `ksgames26/game-framework` 维护配置表、protobuf 序列化和 Colyseus 联网集成。

## 适用场景

- 用户要接入或修改二进制配置表读取
- 用户要调整 `ConfService` 的数据解析或初始化方式
- 用户要新增 protobuf 消息、注册消息类型或调整序列化流程
- 用户要修改 `ColyseusSdk` 的请求-应答链路
- 用户要自定义 `Room` 的消息分发、推送处理或错误处理

## 必看文件

- `README.md`
- `game-framework/game-framework.ts`
- `game-framework/services/conf-service.ts`
- `game-framework/protobuf.ts`
- `game-framework/protobuf-ts/*`
- `game-framework/client.ts`
- `game-framework/room.ts`
- `game-framework/core/container.ts`
- `game-framework/core/event-dispatcher.ts`
- `game-framework/structures/byte.ts`

## 核心认知

1. `ConfService` 负责把二进制 buffer 解析成 `KV / LIST / MAP` 三类配置资源。
2. `ProtobufSerializer` 通过 protoId 注册和查找消息类型，提供 `encoder / decoder / create / clone`。
3. `ColyseusSdk` 负责连接、进房、发送消息、等待回复和维护当前 `Room`。
4. `Room` 负责监听消息、错误、离开事件，并把消息转成事件分发或实例方法调用。
5. 整套链路依赖 `Container` 中可用的 `IGameFramework.ISerializable` 实现。

## 工作步骤

1. 先确定需求属于配置链路、协议链路还是房间消息链路。
2. 如果是配置问题：
   - 先读 `ConfService`
   - 确认当前 bin 结构是否仍符合 `KV / LIST / MAP`
   - 确认 protoId 和反序列化器是否已注册
3. 如果是 protobuf 问题：
   - 先看 `ProtobufSerializer`
   - 明确是注册缺失、protoId 冲突，还是编码解码结果不一致
4. 如果是网络请求问题：
   - 先看 `ColyseusSdk` 的 `pushMessage`、`rpcHasReplyMessage`、`rpcHasPushMessage`
   - 再看 `Room` 如何把消息分发到 reply listener、实例方法或普通事件
5. 如果是业务房间扩展：
   - 优先通过继承 `Room` 增加 `onInit()`、`applyMessage()` 或特定消息处理函数
   - 不要把业务协议逻辑全塞回 SDK 底层

## 强约束

- 不要只改 TypeScript 类型而忽略真实二进制或消息编码结果
- 不要在 `ConfService` 中引入与现有 bin 协议不兼容的结构，除非同步升级生产者
- 新增 protobuf 消息时，要同时确认：
  - protoId
  - 注册时机
  - 编码和解码入口
  - 请求与回复消息体 id
- 修改 `Room` 分发策略时，要检查：
  - reply listener
  - 指定消息函数
  - 通用 `onMessage`
  - `onError`
  - `onLeave`
- SDK 底层只处理通用连接和消息编排，业务分发优先放到具体 `Room` 子类

## 常见误区

- `protoId` 没注册，却只在业务层排查
- 请求体能发出，但没有给回复 listener 预留唯一 id
- 只处理正常回复，没有考虑超时移除监听
- 修改配置解析后，没有确认 `Byte` 读取顺序和打包协议一致

## 最小验证

```bash
npx tsc -p tsconfig.game-framework.json
```

如果有可运行样例，还应至少验证：

- 配置表能成功解出目标结构
- protobuf 消息能正确 encode / decode
- 进房、发消息、收回复链路可走通
- 超时、离开房间、未注册消息等异常路径不会静默失败

## 输出要求

最终说明里优先给：

1. 影响的是配置读取、协议注册还是房间消息分发
2. 需要同步修改的消息类型或配置协议
3. 哪些异常路径已覆盖
4. 最小联调或回归验证方案
