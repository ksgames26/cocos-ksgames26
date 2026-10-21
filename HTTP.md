# HTTP 游戏客户端

`HttpGameClient` 配合独立 HTTP + DB 游戏服务器使用，管理 JSON 请求、游客凭据和 Redis 会话 token。通过公开入口导入：

```typescript
import { sys } from 'cc';
import { HttpGameClient, HttpRequestError } from 'db://ksgames26/game-framework';

const http = new HttpGameClient({
    baseUrl: 'http://127.0.0.1:2570',
    realmId: 0,
    storageNamespace: 'my-game',
    storage: sys.localStorage,
    timeoutMs: 15000,
});

const session = await http.loginGuest();
const profile = await http.get('/player/profile');
const mail = await http.get<{ subjects: string[]; nextCursor: string }>('/player/mail');
```

`baseUrl` 使用客户端可达的统一入口地址，支持代理前缀，不包含 `/api`、query、凭据或 fragment。SDK 给业务路径自动加 `/api`；多个后端应放在同一个负载均衡地址之后，避免以节点地址分别保存账号。

## 请求参数

| API | 行为 |
| --- | --- |
| `loginGuest()` | 读取原服游客凭据，创建/恢复账号；有效会话直接复用 |
| `get<T>(path, query?)` | 自动登录、带 token 的 GET |
| `post<T>(path, body?)` | 自动登录、带 token 的 JSON POST |
| `request<T>(path, options)` | GET/POST/PUT/PATCH/DELETE；支持 query、body、headers、timeoutMs、auth |
| `session` | 当前会话身份、worldId、有效期快照；不暴露两种 token |
| `logout()` | 取消在途请求，清理内存会话；保留游客凭据 |
| `logout({ forgetCredential: true })` | 同时删除本地游客凭据，下次会创建新账号 |
| `dispose()` | 取消请求并关闭客户端；之后调用会失败 |

请求参数示例（业务路径需由游戏服务器注册）：

```typescript
const page = await http.get('/mail', { limit: 20, after: '123' });
const result = await http.post('/reward/claim', { operationId: savedOperationId });
const version = await http.request('/version', { auth: false });
```

query 会进行 URL 编码，数组编码为重复键，null/undefined 省略。动态路径段使用 `encodeURIComponent(value)`；不要在 path 拼接 query，也不能传绝对 URL。返回类型泛型只提供 TypeScript 类型，不进行业务响应的运行时校验。成功响应直接返回 JSON 内容，204/空响应为 null。

构造选项 headers 会同时用于登录和业务请求，单次 headers 可覆盖普通头。`Authorization`、`Content-Type` 等由客户端维护，调用者不能覆盖；JSON 请求自动设置 Content-Type，所有请求默认 Accept: application/json。业务额外字段（版本、包体、幂等 ID）必须与服务器定义一致，SDK 不凭空添加身份字段或 admin 密钥。

## 登录和 token

`POST /api/auth/guest` 自动携带 `{ realmId, loginToken }`。首次无凭据时创建游客，后续使用保存的 loginToken 恢复同一账号。持久键按 namespace + 规范化后的 baseUrl + 原 realmId 隔离。会话 token 只保存在内存，业务请求自动添加 `Authorization: Bearer <sessionToken>`。

服务端返回的 userId、realmId、worldId、token 格式及有效期会被校验。原 realmId 不因合服改变；worldId 来自服务端，会在续登时更新，世界业务仍以服务端当前解析结果为准。请求 body/query 不自动添加 userId/realmId/worldId，服务端从 token 解析可信身份。

同一个客户端实例的并发首次请求共用一次登录，临近过期时提前续登；游戏应共享一个实例，不要给每个接口临时 new 客户端。GET 收到 401 后合并续登并最多重发一次；POST/PUT/PATCH/DELETE 收到 401 时清理失效会话并抛错，下次请求会续登，但失败的写请求不自动重发。403、500、网络异常和超时都不自动重试。

失效凭据、维护状态、网络失败不会触发“清空凭据后自动创建新账号”。存储读取失败会阻止登录；保存失败会报告 storage 错误，并在当前实例内保留刚获取的凭据以便重试。首次创建游客的响应若丢失，客户端无法恢复该响应中未收到的凭据，服务器当前没有创建账号幂等协议。

`logout` 是本地退出，服务端目前没有 token 撤销接口；它不会删除服务器账号。`forgetCredential` 会丢失该设备恢复游客的依据，应仅由明确的用户操作触发。不要把登录返回值或请求头写入日志。

## 异常、取消和平台

失败抛出 `HttpRequestError`，包含 kind、status 和可选 serverCode。kind 为 http/network/timeout/cancelled/invalid-response/configuration/storage；status 为 HTTP 状态码，无 HTTP 响应时为 0。服务器公开的 error 消息可用于 UI，SDK 不把请求体或 token 附加到异常。

```typescript
try {
    await http.get('/player/profile');
} catch (error) {
    if (error instanceof HttpRequestError && error.status === 403) {
        // 提示区服维护或未开放。
    } else {
        throw error;
    }
}
```

默认每次网络请求 15 秒超时（登录与业务请求分别计时），超时会 abort XHR。dispose/logout 会取消全部在途请求，晚到的结果不会恢复已退出的会话。中断客户端请求不会回滚已提交的 DB 事务；需要重试写入时由业务继续使用同一 operationId。

传输使用 Cocos 运行环境的 XMLHttpRequest，不依赖 fetch、URL 或 AbortController。可通过 createXHR 注入适配器。平台支持参考 [Cocos 网络接口说明](https://docs.cocos.com/creator/3.8/manual/zh/advanced-topics/http.html)；发布微信小游戏时配置请求合法域名及 HTTPS，Web 跨域部署需在服务入口处理 CORS/预检。当前服务器只内置 HTTP 游客登录，微信登录需要对应服务端 HTTP 接口后再扩展，不能把 wx.login 的 code 当作 loginToken。

`npm run test:http` 验证实际 SDK 类的并发、续登、退出、错误、超时、存储隔离和身份参数，传输使用可控 XHR。消费模板还提供 `pnpm client:test:http` 验证真实 HTTP 监听器与本客户端的联调。以上不代表 Creator 或微信设备实测。
