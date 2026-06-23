
/**
 * 拿来做异步取消操作的CancellationToken
 * 
 * 自身取消的时候会传递给父CancellationToken
 * 
 * 但是父CancellationToken取消的时候不会传递给子CancellationToken
 *
 * @export
 * @class CancellationToken
 */
export class CancellationToken implements IGameFramework.ICancellationToken {
    private _isCancelled: boolean = false;
    private _parent: IGameFramework.Nullable<CancellationToken> = null;

    public constructor(parent?: IGameFramework.Nullable<CancellationToken>) {
        this._parent = parent;
    }

    public cancel(): void {
        if (this._isCancelled) return;
        this._isCancelled = true;

        if (this._parent) {
            this._parent.cancel();
        }
    }

    get isCancellationRequested(): boolean {
        return this._isCancelled;
    }
}

/**
 * 同步任务
 *
 * @export
 * @abstract
 * @class SyncTask
 * @implements {IGameFramework.ISyncTask}
 */
export abstract class SyncTask<T> implements IGameFramework.ISyncTask<T> {
    private _generator: IGameFramework.Nullable<Generator<T>>;
    private _disposed: boolean = false;
    private _done: boolean = false;
    private _token?: IGameFramework.ICancellationToken;
    private _runtime: IGameFramework.ITaskRuntime = null!;
    private _handle: IGameFramework.ITaskHandle<T> = null!;

    public constructor(runtime: IGameFramework.ITaskRuntime, token?: IGameFramework.ICancellationToken) {
        this._runtime = runtime;
        this._token = token;
    }

    public get isCancellationRequested(): boolean {
        return this._token ? this._token.isCancellationRequested : false;
    }

    /**
     * 能不能移动到任务的下一步
     *
     * @return {*}  {void}
     * @memberof SyncTask
     */
    public moveNext(): void {
        if (this.isCancellationRequested) {
            this._done = true;
            return;
        }

        if (!this._generator) {
            this._generator = this.task();
            if (!this._generator) {
                this._done = true;
                return;
            }
        }
        const result = this._generator.next();
        this._done = !!result.done;
        if (this._done) {
            this._handle.invokeDone(result.value as T);
        }
    }

    public set handle(handler: IGameFramework.ITaskHandle<T>) {
        this._handle = handler;
    }

    public get handle(): IGameFramework.ITaskHandle<T> {
        return this._handle;
    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    public get runtime(): IGameFramework.ITaskRuntime {
        return this._runtime;
    }

    public get isDone(): boolean {
        return this._done;
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._runtime = null!;
        this._done = false;
        this._handle = null!;
        this._generator = null;
    }

    public abstract task(): IGameFramework.Nullable<Generator<T>>;
}

/**
 * 异步任务
 *
 * @export
 * @abstract
 * @class AsyncTask
 * @implements {IGameFramework.IAsyncTask}
 */
export abstract class AsyncTask<T> implements IGameFramework.IAsyncTask<T> {
    protected _done: boolean = false;
    protected _resolve: IGameFramework.Nullable<(t: T) => void> = null;
    private _generator: IGameFramework.Nullable<AsyncGenerator<T>>;
    private _promise: IGameFramework.Nullable<Promise<IteratorResult<T, void>>> = null;
    private _disposed: boolean = false;
    private _token?: IGameFramework.ICancellationToken;
    private _runtime: IGameFramework.ITaskRuntime = null!;
    private _handle: IGameFramework.ITaskHandle<T> = null!;

    public constructor(runtime: IGameFramework.ITaskRuntime, token?: IGameFramework.ICancellationToken) {
        this._runtime = runtime;
        this._token = token;
    }

    public get isCancellationRequested(): boolean {
        return this._token ? this._token.isCancellationRequested : false;
    }

    public cancel(): void {
        if (this._disposed || this.isCancellationRequested) return;
        if (this._token) {
            this._token.cancel();
        }
    }

    /**
     * 能不能移动到任务的下一步
     *
     * @return {*}  {void}
     * @memberof AsyncTask
     */
    public async moveNext(): Promise<T> {
        if (!this._generator) {
            this._generator = this.task();
            if (!this._generator) {
                this._done = true;
                return null as T;
            }
        }

        // 如果当前异步任务还未完成，则不能调用下一个任务
        if (this._promise) {
            // 如果实现了可选的update方法，则调用update方法
            if ((this as IGameFramework.IAsyncTask<T>).update) {
                (this as IGameFramework.IAsyncTask<T>).update!();
            }
            return null as T;
        }
        this._promise = this._generator.next();
        const result = await this._promise;
        if (result.done) {
            this._done = true;
            this._handle.value = result.value as T;
            this._handle.invokeDone(result.value as T);
        } else {
            this._promise = null;
        }
        return result.value as T;
    }

    public set handle(handler: IGameFramework.ITaskHandle<T>) {
        this._handle = handler;
    }

    public get handle(): IGameFramework.ITaskHandle<T> {
        return this._handle;
    }

    public get isDone(): boolean {
        return this._done;
    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    public get runtime(): IGameFramework.ITaskRuntime {
        return this._runtime;
    }

    /**
     * 销毁异步任务
     *
     * @return {*}  {void}
     * @memberof AsyncTask
     */
    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._promise = null;
        this._runtime = null!;
        this._handle = null!;
        this._done = false;
        this._generator = null;
        this._resolve = null!;
    }

    public abstract task(): IGameFramework.Nullable<AsyncGenerator<T>>;
}

/**
 * 具备异步等待的Set
 *
 * @export
 * @class AsyncSet
 * @extends {Set<T>}
 * @template T
 */
export class AsyncSet<T> extends Set<T> implements IGameFramework.IAsyncCollection {
    private _promise: Promise<void> = null!;
    private _resolve: () => void = null!;

    public constructor() {
        super();
    }

    public add(t: T): this {
        const r = super.add(t);

        if (this._resolve) {
            this._resolve();
            this._resolve = null!;
            this._promise = null!;
        }
        return r;
    }

    public async wait(): Promise<void> {
        if (!this._promise) {
            this._promise = new Promise((resolve) => {
                this._resolve = resolve;
            });

        }
        return this._promise;
    }

    public done() {
        if (this._resolve) {
            this._resolve();
        }

        this.clear();
    }

    public clear(): void {
        this._resolve = null!;
        this._promise = null!;
    }
}
