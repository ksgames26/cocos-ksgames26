import {
    NetworkLockstepDriver,
    type LockstepManifest,
    type LockstepSimulation,
    type LockstepCommand,
    type LockstepFrame,
} from "./core";

/** 最小传输接口；原生 Colyseus 房间可直接满足此契约。 */
export interface LockstepConnection {
    onMessage(type: string, callback: (message: any) => void): () => void;
    send(type: string, message: unknown): void;
    leave(consented?: boolean): Promise<unknown>;
    /** 原生 Colyseus 提供此状态，已断开时无需等待另一次离房通知。 */
    readonly connection?: { readonly isOpen: boolean; close?(): void };
}
async function leaveConnection(
    room: LockstepConnection,
    consented = true,
): Promise<void> {
    if (room.connection?.isOpen === false) return;
    if (!consented && room.connection?.close) {
        // 补帧失败按意外断线清理，保留服务器重连窗口，也不等待离房握手。
        room.connection.close();
        return;
    }
    await room.leave(consented);
}
export interface LockstepMatchResult {
    status: "idle" | "queued" | "matched";
    manifest?: LockstepManifest;
    reservation?: unknown;
}
export interface LockstepRankProfile {
    queueId: string;
    seasonId: string;
    mmr: number;
    games: number;
    rank: { tier: number; name: string; minimumMmr: number };
}
export type LockstepRatingStatus = "unrated" | "pending" | "settled" | "failed";
// 序号随底层连接存活，避免销毁包装器后旧响应命中新请求。
const requestSequences = new WeakMap<LockstepConnection, number>();
class ReplayRateLimit extends Error {
    constructor(readonly retryAfterMs: number) {
        super("Lockstep replay rate limited");
    }
}
class Requests {
    private waits = new Map<
        ReturnType<typeof setTimeout>,
        (error: Error) => void
    >();
    private pending = new Map<
        number,
        {
            resolve(value: any): void;
            reject(error: Error): void;
            timer: ReturnType<typeof setTimeout>;
        }
    >();
    private remove: () => void;
    private closed = false;
    constructor(
        private room: LockstepConnection,
        private channel: string,
        reply: string,
    ) {
        this.remove = room.onMessage(reply, (message) => {
            const request = this.pending.get(message?.id);
            if (!request) return;
            this.pending.delete(message.id);
            clearTimeout(request.timer);
            if (message.ok) request.resolve(message.value);
            else if (
                message.code === "REPLAY_RATE_LIMIT" &&
                Number.isInteger(message.retryAfterMs) &&
                message.retryAfterMs > 0 &&
                message.retryAfterMs <= 1000
            )
                request.reject(new ReplayRateLimit(message.retryAfterMs));
            else request.reject(new Error("Lockstep request rejected"));
        });
    }
    request(body: object, applyReply?: (value: any) => void): Promise<any> {
        if (this.closed)
            return Promise.reject(new Error("Lockstep transport is closed"));
        const id = (requestSequences.get(this.room) ?? 0) + 1;
        if (!Number.isSafeInteger(id))
            return Promise.reject(
                new Error("Lockstep request sequence exhausted"),
            );
        requestSequences.set(this.room, id);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error("Lockstep request timed out"));
            }, 10000);
            this.pending.set(id, {
                resolve(value) {
                    try {
                        // 在消息回调内应用快照，不能晚于同批次的后续通知。
                        applyReply?.(value);
                        resolve(value);
                    } catch (error) {
                        reject(error);
                    }
                },
                reject,
                timer,
            });
            try {
                this.room.send(this.channel, { ...body, id });
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error);
            }
        });
    }
    /** 只读补帧遇到明确限流才重试，关闭连接时立即取消等待。 */
    async replay(from: number, applyReply: (value: any) => void): Promise<any> {
        for (let attempt = 0; ; attempt++) {
            try {
                return await this.request({ op: "sync", from }, applyReply);
            } catch (error) {
                if (!(error instanceof ReplayRateLimit) || attempt >= 3)
                    throw error;
                await new Promise<void>((resolve, reject) => {
                    if (this.closed)
                        return reject(new Error("Lockstep transport closed"));
                    const timer = setTimeout(() => {
                        this.waits.delete(timer);
                        resolve();
                    }, error.retryAfterMs);
                    this.waits.set(timer, reject);
                });
            }
        }
    }
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.remove();
        for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(new Error("Lockstep transport closed"));
        }
        this.pending.clear();
        for (const [timer, reject] of this.waits) {
            clearTimeout(timer);
            reject(new Error("Lockstep transport closed"));
        }
        this.waits.clear();
    }
}

/** 在已有且完成鉴权的 GS 大厅连接上管理匹配请求。 */
export class LockstepLobbyClient {
    private requests: Requests;
    constructor(lobby: LockstepConnection) {
        this.requests = new Requests(lobby, "ls:match", "ls:match-reply");
    }
    join(queueId: string, contentHash: string): Promise<LockstepMatchResult> {
        return this.requests.request({ op: "join", queueId, contentHash });
    }
    poll(): Promise<LockstepMatchResult> {
        return this.requests.request({ op: "poll" });
    }
    cancel(): Promise<LockstepMatchResult> {
        return this.requests.request({ op: "cancel" });
    }
    /** 查询当前登录身份的评分与段位，不允许传入其他玩家身份。 */
    profile(queueId: string): Promise<LockstepRankProfile> {
        return this.requests.request({ op: "profile", queueId });
    }
    /** 仅释放匹配监听，不断开由应用持有的 GS 大厅连接。 */
    dispose(): void {
        this.requests.close();
    }
}

/** 管理 FS 通信和有界历史补帧；重连时保留同一个会话实例。 */
export class NetworkLockstepSession {
    readonly driver: NetworkLockstepDriver;
    readonly manifest: LockstepManifest;
    actorId = "";
    started = false;
    endReason = "";
    ratingStatus: LockstepRatingStatus = "unrated";
    onRating?: (status: LockstepRatingStatus) => void;
    onDesync?: (frame: number) => void;
    private requests: Requests;
    private removers: (() => void)[] = [];
    private sequence = 0;
    private submittedFrame = -1;
    private syncing?: Promise<void>;
    private disposed = false;
    private reconnecting?: LockstepConnection;
    private checkpoints = new Map<number, string>();
    private reporting?: Promise<void>;
    constructor(
        private room: LockstepConnection,
        manifest: LockstepManifest,
        simulation: LockstepSimulation,
    ) {
        this.driver = new NetworkLockstepDriver(manifest, simulation);
        this.manifest = this.driver.runner.manifest;
        this.attach(room);
    }
    private attach(room: LockstepConnection): void {
        this.room = room;
        this.requests = new Requests(room, "ls:request", "ls:reply");
        this.removers = [
            room.onMessage("ls:frame", (frame: LockstepFrame) =>
                this.driver.receive(frame),
            ),
            room.onMessage("ls:start", (manifest: LockstepManifest) => {
                if (manifest.matchId !== this.manifest.matchId)
                    throw new Error("Match mismatch");
                this.started = true;
            }),
            room.onMessage("ls:end", (message) => {
                this.endReason = message.reason;
            }),
            room.onMessage("ls:rating", (message) => {
                this.ratingStatus = message.status;
                this.onRating?.(message.status);
            }),
            room.onMessage("ls:desync", (message) => {
                // 终态发布后不可被迟到的哈希诊断改写。
                if (this.endReason) return;
                this.endReason = "desync";
                this.onDesync?.(message.frame);
            }),
        ];
    }
    /** 就绪前和重连后调用；拉取缺失历史帧，不自行生成或跳过缺帧。 */
    synchronize(): Promise<void> {
        if (this.disposed) return Promise.reject(new Error("Session disposed"));
        if (this.syncing) return this.syncing;
        this.syncing = this.replay().finally(() => {
            this.syncing = undefined;
        });
        return this.syncing;
    }
    private async replay(): Promise<void> {
        let from = this.driver.runner.nextFrame;
        let target: number | undefined;
        do {
            const value = await this.requests.replay(from, (snapshot) => {
                if (
                    JSON.stringify(snapshot.manifest) !==
                    JSON.stringify(this.manifest)
                )
                    throw new Error("Replay manifest mismatch");
                this.actorId = snapshot.actorId;
                this.started = snapshot.started;
                this.endReason = snapshot.ended;
                this.ratingStatus = snapshot.ratingStatus ?? "unrated";
            });
            target ??= value.nextFrame;
            for (const frame of value.frames) this.driver.receive(frame);
            if (from < target && value.frames.length === 0)
                throw new Error("Incomplete frame history");
            from += value.frames.length;
        } while (from < target);
    }
    async ready(contentHash: string): Promise<void> {
        if (contentHash !== this.manifest.contentHash)
            throw new Error("Simulation content mismatch");
        await this.synchronize();
        await this.requests.request({ op: "ready", contentHash });
    }
    /** 每个目标帧仅提交一个输入包；调用前将玩法输入量化为 int32。 */
    async submit(
        commands: readonly LockstepCommand[],
        targetFrame = Math.max(0, this.driver.latestFrame + 1) +
            this.manifest.inputDelay,
    ): Promise<void> {
        if (
            !this.started ||
            this.endReason ||
            this.disposed ||
            targetFrame <= this.submittedFrame
        )
            throw new Error("Cannot submit input");
        const input = {
            frame: targetFrame,
            sequence: this.sequence++,
            commands,
        };
        // 超时后无法确认是否送达，因此不自动重发；服务器每人每帧最多接收一个包。
        this.submittedFrame = targetFrame;
        await this.requests.request({ op: "input", input });
    }
    pump(maxSteps = 8): number {
        if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 120)
            throw new Error("Invalid pump budget");
        let count = 0;
        while (count < maxSteps && this.driver.pump(1)) {
            count++;
            const frame = this.driver.runner.nextFrame - 1;
            if (frame % 60 === 59)
                this.checkpoints.set(
                    frame,
                    this.driver.runner.simulation.checksum(),
                );
            for (const old of this.checkpoints.keys())
                if (old < frame - 540) this.checkpoints.delete(old);
        }
        return count;
    }
    /** 上报 pump 执行期间捕获的检查点哈希，避免批量追帧漏掉检查点。 */
    reportChecksum(): Promise<void> {
        if (this.reporting) return this.reporting;
        this.reporting = this.flushChecksums().finally(() => {
            this.reporting = undefined;
        });
        return this.reporting;
    }
    private async flushChecksums(): Promise<void> {
        for (const [frame, hash] of this.checkpoints) {
            if (this.driver.latestFrame - frame < 600) {
                await this.requests.request({ op: "hash", frame, hash });
            }
            this.checkpoints.delete(frame);
        }
    }
    async reconnect(room: LockstepConnection): Promise<void> {
        if (this.disposed || this.reconnecting) {
            if (room !== this.room && room !== this.reconnecting)
                await leaveConnection(room);
            throw new Error(
                this.disposed
                    ? "Session disposed"
                    : "Reconnect already pending",
            );
        }
        this.reconnecting = room;
        this.detach();
        try {
            await Promise.all([
                this.syncing?.catch(() => {}),
                this.reporting?.catch(() => {}),
            ]);
            // 等待旧请求退出期间可能已销毁会话，不能再接入新的连接。
            if (this.disposed) throw new Error("Session disposed");
            this.attach(room);
            await this.synchronize();
            if (this.disposed) throw new Error("Session disposed");
        } catch (error) {
            if (this.room === room) this.detach();
            if (!this.disposed || this.room !== room)
                await leaveConnection(room, this.disposed);
            throw error;
        } finally {
            this.reconnecting = undefined;
        }
    }
    private detach(): void {
        this.requests.close();
        for (const remove of this.removers.splice(0)) remove();
    }
    async dispose(): Promise<void> {
        if (this.disposed) return;
        this.disposed = true;
        this.detach();
        await leaveConnection(this.room);
    }
}
