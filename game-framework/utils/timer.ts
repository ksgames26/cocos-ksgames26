export class Timer {
    private _elapsed: number = 0;
    private _interval: number;
    private _paused: boolean = false;
    private _loops: number = -1; // -1 表示无限循环

    constructor(interval: number, loops: number = -1) {
        this._interval = interval;
        this._loops = loops;
    }

    tick(dt: number): boolean {
        if (this._paused || this._loops === 0) return false;

        this._elapsed += dt;
        if (this._elapsed >= this._interval) {
            this._elapsed -= this._interval;
            
            if (this._loops > 0) {
                this._loops--;
            }
            
            return true;
        }
        return false;
    }

    pause(): void {
        this._paused = true;
    }

    resume(): void {
        this._paused = false;
    }

    reset(resetLoops: boolean = true): void {
        this._elapsed = 0;
        if (resetLoops) {
            this._loops = -1;
        }
    }

    get remaining(): number {
        return Math.max(0, this._interval - this._elapsed);
    }

    get progress(): number {
        return Math.min(1, this._elapsed / this._interval);
    }
}