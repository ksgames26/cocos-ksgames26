import {
    NetworkLockstepDriver,
    type LockstepManifest,
    type LockstepSimulation,
    type LockstepCommand,
    type LockstepFrame,
} from "./core";

/** Small transport boundary: native Colyseus rooms satisfy this contract. */
export interface LockstepConnection {
    onMessage(type: string, callback: (message: any) => void): () => void;
    send(type: string, message: unknown): void;
    leave(): Promise<unknown>;
}
export interface LockstepMatchResult {
    status: "idle" | "queued" | "matched";
    manifest?: LockstepManifest;
    reservation?: unknown;
}
class Requests {
    private sequence = 0;
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
            message.ok
                ? request.resolve(message.value)
                : request.reject(new Error("Lockstep request rejected"));
        });
    }
    request(body: object): Promise<any> {
        if (this.closed)
            return Promise.reject(new Error("Lockstep transport is closed"));
        const id = ++this.sequence;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error("Lockstep request timed out"));
            }, 10000);
            this.pending.set(id, { resolve, reject, timer });
            try {
                this.room.send(this.channel, { ...body, id });
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(error);
            }
        });
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
    }
}

/** Owns matchmaking requests on an existing authenticated GS lobby connection. */
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
    /** Does not disconnect the GS lobby owned by the application. */
    dispose(): void {
        this.requests.close();
    }
}

/** FS transport plus bounded replay. Keep the same instance when reconnecting. */
export class NetworkLockstepSession {
    readonly driver: NetworkLockstepDriver;
    readonly manifest: LockstepManifest;
    actorId = "";
    started = false;
    endReason = "";
    onDesync?: (frame: number) => void;
    private requests: Requests;
    private removers: (() => void)[] = [];
    private sequence = 0;
    private submittedFrame = -1;
    private syncing?: Promise<void>;
    private disposed = false;
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
            room.onMessage("ls:desync", (message) => {
                this.endReason = "desync";
                this.onDesync?.(message.frame);
            }),
        ];
    }
    /** Call before ready and again after reconnect. Never regenerates or skips missing frames. */
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
            const value = await this.requests.request({ op: "sync", from });
            if (
                JSON.stringify(value.manifest) !== JSON.stringify(this.manifest)
            )
                throw new Error("Replay manifest mismatch");
            this.actorId = value.actorId;
            this.started = value.started;
            this.endReason = value.ended;
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
    /** One input packet per target frame. Quantize gameplay inputs to int32 before calling. */
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
        // Do not automatically resend on an ambiguous timeout. The server seals at most one packet.
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
    /** Captures checkpoint hashes during pump, so batched catch-up cannot skip checkpoints. */
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
        if (this.disposed) throw new Error("Session disposed");
        this.requests.close();
        if (this.syncing) await this.syncing.catch(() => {});
        if (this.reporting) await this.reporting.catch(() => {});
        for (const remove of this.removers) remove();
        this.attach(room);
        await this.synchronize();
    }
    async dispose(): Promise<void> {
        if (this.disposed) return;
        this.disposed = true;
        this.requests.close();
        for (const remove of this.removers) remove();
        await this.room.leave();
    }
}
