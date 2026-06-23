import { game, Node, tween, Tween, Vec3 } from "cc";

type AnyTween = Tween<object>;

/**
 * TweenGroup：
 * ```ts
 * const group = new TweenGroup(2.35);
 * const tweenA = tween(nodeA).to(1, {...}).union().repeatForever();
 * const tweenB = tween(nodeB).to(1, {...}).union().repeatForever();
 * group.add(tweenA).add(tweenB);
 * group.start(); // 所有Tween以相同节奏启动
 * 
 * // 某个Tween需要临时停掉
 * tweenA.stop();
 * group.remove(tweenA);
 * 
 * // 重新加入时用当前相位直接同步
 * group.add(tweenA);
 * tweenA.start(group.getPhase());
 * ```
 */
export class TweenGroup {
    private _duration: number;
    private _phase = 0;
    private _startClock = 0;
    private readonly _tweens: AnyTween[] = [];

    constructor(duration: number) {
        this._duration = Math.max(duration, Number.EPSILON);
    }

    public add(tweenInstance: AnyTween): this {
        if (!this._tweens.includes(tweenInstance)) {
            this._tweens.push(tweenInstance);
        }
        return this;
    }

    public remove(tweenInstance: AnyTween): this {
        const index = this._tweens.indexOf(tweenInstance);
        if (index !== -1) {
            this._tweens.splice(index, 1);
        }
        return this;
    }

    public clear(): void {
        this._tweens.length = 0;
        this._phase = 0;
        this._startClock = 0;
    }

    public setDuration(duration: number): this {
        this._duration = Math.max(duration, Number.EPSILON);
        this._phase = this._normalizePhase(this._phase);
        return this;
    }

    public start(phase = 0): void {
        const normalized = this._normalizePhase(phase);
        this._phase = normalized;
        this._startClock = TweenGroup._nowSeconds() - normalized;

        for (const tweenInstance of this._tweens) {
            tweenInstance.start(normalized);
        }
    }

    public stop(): void {
        this._phase = this.getPhase();
        for (const tweenInstance of this._tweens) {
            tweenInstance.stop();
        }
    }

    public resume(): void {
        this.start(this.getPhase());
    }

    public getPhase(): number {
        if (this.isRunning()) {
            const elapsed = TweenGroup._nowSeconds() - this._startClock;
            return this._normalizePhase(elapsed);
        }
        return this._phase;
    }

    public isRunning(): boolean {
        return this._tweens.some(t => t.running);
    }

    private _normalizePhase(phase: number): number {
        const normalized = phase % this._duration;
        return normalized < 0 ? normalized + this._duration : normalized;
    }

    private static _nowSeconds(): number {
        return game.totalTime * 0.001;
    }
}

export function tweenPosShake(node: Node, intensity: number = 10, duration: number = 0.5): void {
    // TODO tween ckeck

    const originalPosition = node.position.clone();
    const shakes = Math.floor(duration / 0.05); // 每次晃动的持续时间为0.05秒

    const shakeTween = tween(node);

    for (let i = 0; i < shakes; i++) {
        const offsetX = (Math.random() - 0.5) * intensity * 2;
        const offsetY = (Math.random() - 0.5) * intensity * 2;
        shakeTween.to(0.05, { position: new Vec3(offsetX, offsetY, 0) });
    }

    shakeTween.call(() => {
        node.setPosition(originalPosition); // 恢复到原始位置
    });

    shakeTween.start();
}

export function tween2DAngleShake(node: Node, angle: number = 10, duration: number = 0.5): void {
    // TODO tween ckeck

    const originalRotation = node.rotation.clone();
    const shakes = Math.floor(duration / 0.1); // 每次晃动的持续时间为0.1秒

    const shakeTween = tween(node);

    for (let i = 0; i < shakes; i++) {
        const shakeAngle = (i % 2 === 0 ? angle : -angle);
        shakeTween.to(0.1, { eulerAngles: new Vec3(0, 0, shakeAngle) });
    }

    shakeTween.call(() => {
        node.setRotation(originalRotation); // 恢复到原始角度
    });

    shakeTween.start();
}

