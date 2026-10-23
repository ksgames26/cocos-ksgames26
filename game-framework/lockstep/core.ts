// 由消费项目的 scripts/sync-lockstep.mjs 自动生成，请勿手改。
// 源文件 SHA-256：315a99ebea96897f7c7c9b8b31b5ed22eeccf2bc11d0c9f5de5d0ebea2f0907d
/** 与引擎无关的帧同步契约；本文件是 Cocos 运行时镜像的唯一源文件。 */
export const LOCKSTEP_VERSION = 1 as const;
export type LockstepCommand = readonly number[];
export interface LockstepManifest {
    version: typeof LOCKSTEP_VERSION;
    matchId: string;
    contentHash: string;
    seed: number;
    tickRate: number;
    inputDelay: number;
    maxFrames: number;
    actors: readonly string[];
}
export interface LockstepInput {
    frame: number;
    sequence: number;
    commands: readonly LockstepCommand[];
}
export interface LockstepFrame {
    frame: number;
    inputs: readonly { actorId: string; commands: readonly LockstepCommand[] }[];
}
export interface LockstepSimulation {
    reset(manifest: Readonly<LockstepManifest>): void;
    step(frame: Readonly<LockstepFrame>, fixedDeltaSeconds: number): void;
    /** 返回确定性模拟状态的哈希，不包含渲染数据和现实时间。 */
    checksum(): string;
}

function integer(value: number, min: number, max: number): boolean {
    return Number.isSafeInteger(value) && value >= min && value <= max;
}
export function validateManifest(value: LockstepManifest): LockstepManifest {
    if (
        !value ||
        value.version !== LOCKSTEP_VERSION ||
        typeof value.matchId !== 'string' ||
        !value.matchId ||
        value.matchId.length > 128 ||
        typeof value.contentHash !== 'string' ||
        !value.contentHash ||
        value.contentHash.length > 128 ||
        !integer(value.seed, 0, 0xffffffff) ||
        !integer(value.tickRate, 1, 120) ||
        !integer(value.inputDelay, 1, 30) ||
        !integer(value.maxFrames, 1, 36000) ||
        !Array.isArray(value.actors) ||
        value.actors.length < 1 ||
        value.actors.length > 16 ||
        value.actors.some((id) => typeof id !== 'string' || !id || id.length > 128) ||
        new Set(value.actors).size !== value.actors.length
    )
        throw new Error('Invalid lockstep manifest');
    return Object.freeze({ ...value, actors: Object.freeze([...value.actors].sort()) });
}
export function copyCommands(value: readonly LockstepCommand[]): readonly LockstepCommand[] {
    if (
        !Array.isArray(value) ||
        value.length > 8 ||
        value.some(
            (command) =>
                !Array.isArray(command) ||
                command.length < 1 ||
                command.length > 16 ||
                command.some((word) => !integer(word, -2147483648, 2147483647)),
        )
    ) {
        throw new Error('Commands must contain bounded int32 words');
    }
    return Object.freeze(value.map((command) => Object.freeze([...command])));
}

/** 每个参与者每帧最多一个不可变输入包；截止时未收到输入则填入空命令列表。 */
export class LockstepTimeline {
    readonly manifest: LockstepManifest;
    private pending = new Map<number, Map<string, readonly LockstepCommand[]>>();
    private sequences = new Map<string, number>();
    private next = 0;
    constructor(manifest: LockstepManifest) {
        this.manifest = validateManifest(manifest);
    }
    get nextFrame(): number {
        return this.next;
    }
    submit(actorId: string, input: LockstepInput): void {
        if (
            !this.manifest.actors.includes(actorId) ||
            !input ||
            !integer(
                input.frame,
                this.next,
                Math.min(this.manifest.maxFrames - 1, this.next + this.manifest.inputDelay + 30),
            ) ||
            !integer(input.sequence, 0, Number.MAX_SAFE_INTEGER) ||
            input.sequence <= (this.sequences.get(actorId) ?? -1)
        )
            throw new Error('Invalid, late or duplicate input');
        const commands = copyCommands(input.commands);
        const frame = this.pending.get(input.frame) ?? new Map();
        if (frame.has(actorId)) throw new Error('Input for this frame is already sealed');
        frame.set(actorId, commands);
        this.pending.set(input.frame, frame);
        this.sequences.set(actorId, input.sequence);
    }
    seal(): LockstepFrame {
        if (this.next >= this.manifest.maxFrames) throw new Error('Match frame limit reached');
        const frame = this.next++;
        const pending = this.pending.get(frame);
        this.pending.delete(frame);
        return Object.freeze({
            frame,
            inputs: Object.freeze(
                this.manifest.actors.map((actorId) =>
                    Object.freeze({
                        actorId,
                        commands: pending?.get(actorId) ?? Object.freeze([]),
                    }),
                ),
            ),
        });
    }
}

/** 单机和网络模式共用此执行器，严格按帧序和固定时间步长推进模拟。 */
export class LockstepRunner {
    readonly manifest: LockstepManifest;
    private next = 0;
    private failed = false;
    constructor(
        manifest: LockstepManifest,
        readonly simulation: LockstepSimulation,
    ) {
        this.manifest = validateManifest(manifest);
        simulation.reset(this.manifest);
    }
    get nextFrame(): number {
        return this.next;
    }
    apply(value: LockstepFrame): void {
        if (this.failed) throw new Error('Simulation failed; restore from a trusted replay');
        if (
            !value ||
            value.frame !== this.next ||
            this.next >= this.manifest.maxFrames ||
            !Array.isArray(value.inputs) ||
            value.inputs.length !== this.manifest.actors.length
        )
            throw new Error('Frame gap or malformed frame');
        const frame = Object.freeze({
            frame: value.frame,
            inputs: Object.freeze(
                value.inputs.map((input, index) => {
                    if (!input || input.actorId !== this.manifest.actors[index])
                        throw new Error('Actor order mismatch');
                    return Object.freeze({
                        actorId: input.actorId,
                        commands: copyCommands(input.commands),
                    });
                }),
            ),
        });
        try {
            this.simulation.step(frame, 1 / this.manifest.tickRate);
        } catch (error) {
            this.failed = true;
            throw error;
        }
        this.next++;
    }
}

export class LocalLockstepDriver {
    readonly timeline: LockstepTimeline;
    readonly runner: LockstepRunner;
    readonly frames: LockstepFrame[] = [];
    private accumulated = 0;
    constructor(manifest: LockstepManifest, simulation: LockstepSimulation) {
        this.timeline = new LockstepTimeline(manifest);
        this.runner = new LockstepRunner(manifest, simulation);
    }
    submit(actorId: string, input: LockstepInput): void {
        this.timeline.submit(actorId, input);
    }
    step(): LockstepFrame {
        const frame = this.timeline.seal();
        this.runner.apply(frame);
        this.frames.push(frame);
        return frame;
    }
    /** 限制单次追帧数量，保留尚未执行的模拟时间；渲染由调用方负责。 */
    advance(deltaSeconds: number, maxSteps = 8): number {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || !integer(maxSteps, 1, 120))
            throw new Error('Invalid clock advance');
        this.accumulated += deltaSeconds;
        const dt = 1 / this.runner.manifest.tickRate;
        let count = 0;
        while (
            this.accumulated + 1e-12 >= dt &&
            count < maxSteps &&
            this.runner.nextFrame < this.runner.manifest.maxFrames
        ) {
            this.step();
            this.accumulated = Math.max(0, this.accumulated - dt);
            count++;
        }
        return count;
    }
}

/** 渲染循环调用 pump 推进模拟；网络收包仅缓存帧，不直接修改模拟状态。 */
export class NetworkLockstepDriver {
    readonly runner: LockstepRunner;
    private frames = new Map<number, LockstepFrame>();
    private latest = -1;
    constructor(manifest: LockstepManifest, simulation: LockstepSimulation) {
        this.runner = new LockstepRunner(manifest, simulation);
    }
    get latestFrame(): number {
        return this.latest;
    }
    receive(frame: LockstepFrame): void {
        if (!frame || !integer(frame.frame, 0, this.runner.manifest.maxFrames - 1))
            throw new Error('Invalid frame number');
        if (frame.frame < this.runner.nextFrame) return;
        // 收包时校验并复制数据，避免调用方后续修改影响尚未执行的模拟帧。
        if (
            !Array.isArray(frame.inputs) ||
            frame.inputs.length !== this.runner.manifest.actors.length
        )
            throw new Error('Invalid frame roster');
        const copy = {
            frame: frame.frame,
            inputs: frame.inputs.map((input, index) => {
                if (input.actorId !== this.runner.manifest.actors[index])
                    throw new Error('Actor order mismatch');
                return { actorId: input.actorId, commands: copyCommands(input.commands) };
            }),
        };
        const previous = this.frames.get(frame.frame);
        if (previous && JSON.stringify(previous) !== JSON.stringify(copy))
            throw new Error('Conflicting authoritative frame');
        this.frames.set(frame.frame, copy);
        this.latest = Math.max(this.latest, frame.frame);
    }
    pump(maxSteps = 8): number {
        if (!integer(maxSteps, 1, 120)) throw new Error('Invalid pump budget');
        let count = 0;
        while (count < maxSteps) {
            const frame = this.frames.get(this.runner.nextFrame);
            if (!frame) break;
            this.runner.apply(frame);
            this.frames.delete(frame.frame);
            count++;
        }
        return count;
    }
}

/** 使用固定种子的 uint32 伪随机数生成器；模拟逻辑禁止使用 Math.random()。 */
export class LockstepRandom {
    private state: number;
    constructor(seed: number) {
        if (!integer(seed, 0, 0xffffffff)) throw new Error('Invalid seed');
        this.state = seed || 0x6d2b79f5;
    }
    nextUint32(): number {
        let value = this.state;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        return (this.state = value >>> 0);
    }
}
