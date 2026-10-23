import { colyseus } from "../colyseus";
import type { FetchFn, Room, SeatReservation } from "../colyseus-cocos-creator";
import type { LockstepMatchResult } from "./network";

export interface LockstepConnectOptions {
    /** 单次 HTTP 预约、WebSocket 建连和房间握手的总时限，默认且最多 5000 毫秒。 */
    timeoutMs?: number;
    /** 取消当前尝试；已交给会话的连接不受影响。 */
    signal?: AbortSignal;
}

/** SDK 的 XHR 回退不处理 signal，预约请求在此统一支持主动取消。 */
class ReservationRequest {
    aborted = false;
    reason: unknown;
    private cancelHttp?: () => void;

    abort(reason: unknown): void {
        this.aborted = true;
        this.reason = reason;
        this.cancelHttp?.();
    }

    readonly fetch: FetchFn = async (url, init) => {
        if (this.aborted) throw this.reason;
        if (
            typeof fetch === "function" &&
            typeof AbortController === "function"
        ) {
            const controller = new AbortController();
            this.cancelHttp = () => controller.abort(this.reason);
            return fetch(url, { ...init, signal: controller.signal });
        }
        // Cocos 原生和小游戏环境可能同时缺少 fetch、AbortController。
        return new Promise<Response>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(init?.method ?? "POST", url.toString());
            xhr.withCredentials = init?.credentials === "include";
            new Headers(init?.headers).forEach((value, key) =>
                xhr.setRequestHeader(key, value),
            );
            const clear = () => {
                this.cancelHttp = undefined;
                xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
            };
            this.cancelHttp = () => {
                clear();
                try {
                    xhr.abort();
                } catch {
                    // 某些平台在请求结束后 abort 会抛错，仍按原取消原因结束。
                }
                reject(this.reason);
            };
            const fail = () => {
                clear();
                reject(new Error("Reservation request failed"));
            };
            xhr.onerror = xhr.ontimeout = xhr.onabort = fail;
            xhr.onload = () => {
                clear();
                // 该适配器仅供 JSON 预约端点使用，响应正文先保存再释放 XHR。
                const body = xhr.responseText;
                resolve({
                    ok: xhr.status >= 200 && xhr.status < 300,
                    status: xhr.status,
                    statusText: xhr.statusText,
                    headers: new Headers({
                        "content-type": "application/json",
                    }),
                    json: async () => JSON.parse(body),
                } as Response);
            };
            xhr.send((init?.body as XMLHttpRequestBodyInit) ?? null);
        });
    };
}

/** 使用 SDK 扩展点捕获握手中的房间，避免取消时拿不到底层连接。 */
class LockstepTransportClient extends colyseus.Client {
    pendingRoom?: Room;

    protected override createRoom<T>(name: string): Room<any, T> {
        const room = super.createRoom<T>(name);
        room.reconnection.enabled = false;
        this.pendingRoom = room;
        return room;
    }
}

/** 创建独立 FS 连接；已有 GS 客户端和房间仍由大厅持有。 */
export class LockstepTransport {
    private readonly pending = new Set<(reason: unknown) => void>();
    private disposed = false;

    constructor(private readonly endpoint: string) {}

    async connect(
        result: LockstepMatchResult,
        options: LockstepConnectOptions = {},
    ) {
        if (
            result.status !== "matched" ||
            !result.manifest ||
            !result.reservation
        ) {
            throw new Error("A server-issued match reservation is required");
        }
        return this.run(
            (client) =>
                client.consumeSeatReservation(
                    result.reservation as SeatReservation,
                ),
            options,
        );
    }

    async reconnect(
        reconnectionToken: string,
        options: LockstepConnectOptions = {},
    ) {
        const [roomId, token, extra] = reconnectionToken.split(":");
        if (!roomId || !token || extra !== undefined)
            throw new Error("Invalid reconnection token");
        return this.run(async (client, request) => {
            // 预约请求和握手共用时限，HTTP 回复迟到时不能继续建立 WebSocket。
            const response = await client.http.post<SeatReservation>(
                `matchmake/reconnect/${encodeURIComponent(roomId)}`,
                {
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ reconnectionToken: token }),
                },
            );
            if (request.aborted) throw request.reason;
            return client.consumeSeatReservation({
                ...response.data,
                reconnectionToken: token,
            });
        }, options);
    }

    private run(
        connect: (
            client: LockstepTransportClient,
            request: ReservationRequest,
        ) => Promise<Room>,
        options: LockstepConnectOptions,
    ): Promise<Room> {
        const timeoutMs = options.timeoutMs ?? 5000;
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5000)
            return Promise.reject(new Error("Invalid connection timeout"));
        if (this.disposed)
            return Promise.reject(new Error("Lockstep transport disposed"));
        if (options.signal?.aborted)
            return Promise.reject(
                options.signal.reason ?? new Error("Connection cancelled"),
            );

        // 每次尝试独立持有 HTTP、房间和取消信号，并发取消不会关闭其他连接。
        const cancellation = new ReservationRequest();
        const client = new LockstepTransportClient(this.endpoint, {
            fetchFn: cancellation.fetch,
        });
        return new Promise((resolve, reject) => {
            let settled = false;
            const close = (room?: Room) => {
                try {
                    // 包括 CONNECTING 和尚未收到房间握手的连接。
                    room?.connection?.close();
                } catch {
                    // 清理错误不能覆盖原始失败，也不能阻止其他尝试取消。
                }
            };
            const cleanup = () => {
                clearTimeout(timer);
                options.signal?.removeEventListener("abort", abort);
                this.pending.delete(cancel);
            };
            const cancel = (reason: unknown) => {
                if (settled) return;
                settled = true;
                cleanup();
                cancellation.abort(reason);
                close(client.pendingRoom);
                client.pendingRoom = undefined;
                reject(reason);
            };
            const abort = () =>
                cancel(
                    options.signal.reason ?? new Error("Connection cancelled"),
                );
            const timer = setTimeout(
                () => cancel(new Error("Lockstep connection timed out")),
                timeoutMs,
            );
            this.pending.add(cancel);
            options.signal?.addEventListener("abort", abort, { once: true });
            // 同步抛错也走统一清理；连接完成前取消的迟到结果不得交给调用者。
            Promise.resolve()
                .then(() => {
                    if (cancellation.aborted) throw cancellation.reason;
                    return connect(client, cancellation);
                })
                .then((room) => {
                    if (settled) {
                        close(room);
                        return;
                    }
                    settled = true;
                    cleanup();
                    client.pendingRoom = undefined;
                    resolve(room);
                }, cancel);
        });
    }

    /** 取消全部在途建连并禁止新尝试；成功返回的房间由 NetworkLockstepSession 释放。 */
    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const cancel of [...this.pending])
            cancel(new Error("Lockstep transport disposed"));
    }
}
