import { implementation } from "../core/misc";
import { SinglyLinkedList } from "../structures/linked-list";
import { AsyncGeneratorMultipleCallsError } from "../core/error";
import { logger } from "../core/log";
import { AsyncSet, AsyncTask, SyncTask } from "../core/task";
import { EventTouch, Node, NodeEventType, Pool, assert, game, js } from "cc";
import { DEBUG } from "cc/env";
import { EventDispatcher } from "../core/event-dispatcher";
import { _decorator } from "cc";
const { ccclass } = _decorator;

/**
 * 可等待任务句柄
 *
 * @export
 * @class TaskHandle
 * @implements {IGameFramework.ITaskHandle<T>}
 * @template T
 */
@ccclass("TaskHandle")
export class TaskHandle<T> extends EventDispatcher<{ done: T }> implements IGameFramework.ITaskHandle<T> {
    private static _idGenerator = new js.IDGenerator("TaskHandle");
    private _disposed: boolean = false;
    private _promise: Promise<T> = null!;
    private _done: boolean = false;
    private _task: IGameFramework.Nullable<IGameFramework.ITask<T>> = null!;
    private _resolve: (value: T | PromiseLike<T>) => void = null!;
    private _reject: (reason: any) => void = null!;
    private _v: T = null!;
    private _inThePool: boolean = false;
    private _id: string = "";
    private _autoFree: boolean = true;
    private _running: boolean = false;
    private _log: boolean = false;

    private set done(value: boolean) {
        this._done = value;
    }

    /**
     * 任务完成时带入的参数
     *
     * @type {T}
     * @memberof TaskHandle
     */
    public get value(): T {
        return this._v;
    }

    public set value(value: T) {
        this._v = value;
    }

    /**
    * 唯一ID
    */
    public get id(): string {
        return this._id;
    }

    /**
     * 是否开启日志开关
     *
     * @memberof TaskHandle
     */
    public set logEnable(enable: boolean) {
        this._log = enable;
    }

    public get logEnable() {
        return this._log;
    }

    /**
     * 是否已经被回收
     * @type {boolean}
     * @memberof IGameFramework.ITaskHandle
     */
    public get inThePool(): boolean {
        return this._inThePool;
    }

    public set inThePool(value: boolean) {
        this._inThePool = value;
    }

    /* 是否自动回收资源
     *
     * @type {boolean}
     * @memberof TaskHandle
     */
    public get autoFree(): boolean {
        return this._autoFree;
    }

    public set autoFree(value: boolean) {
        this._autoFree = value;
    }

    /**
     * 当前需要执行的任务
     *
     * @readonly
     * @type {IGameFramework.Nullable<IGameFramework.ITask<T>>}
     * @memberof TaskHandle
     */
    public get task(): IGameFramework.Nullable<IGameFramework.ITask<T>> {
        return this._task!;
    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    /**
     * 通知任务完成
     *
     * @param {T} value
     * @memberof TaskHandle
     */
    public invokeDone(value: T): void {
        this._v = value;
        this.dispatch("done", value);
    }

    /**
     * 任务是否完成
     *
     * @return {*}  {boolean}
     * @memberof TaskHandle
     */
    public isDone(): boolean {
        return this._done;
    }

    /**
     * 任务是否异步
     *
     * @return {*}  {this is IGameFramework.IAsyncTask}
     * @memberof TaskHandle
     */
    public isAsyncTask(): this is IGameFramework.IAsyncTaskHandle<T> {
        return this._task instanceof AsyncTask;
    }

    /**
     * 是否有效
     *
     * @return {*}  {boolean}
     * @memberof TaskHandle
     */
    public isValid(): boolean {
        return !!this._promise;
    }

    /**
     * 重置任务
     *
     * @param {IGameFramework.Nullable<IGameFramework.ITask<T>>} [task]
     * @memberof TaskHandle
     */
    public reset(task: IGameFramework.Nullable<IGameFramework.ITask<T>>): this {
        this._task = task;
        this._id = TaskHandle._idGenerator.getNewId();
        if (this._task) {
            this._task.handle = this;
        }
        this._promise = new Promise<T>((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });

        return this;
    }

    /**
     * 执行下一步
     *
     * @return {*}  {void}
     * @memberof TaskHandle
     */
    public moveNext(): void {
        // 外部可能驱动这个任务到结束了
        if (this._task!) {
            this.done = this._task!.isDone;
        }

        if (this._done) {
            this.resolve();
            return;
        }

        if (this._task == null) {
            this.done = true;
        } else {
            this._task!.moveNext();
            this.done = this._task!.isDone;
        }

        this.resolve();
    }

    /**
     * 完成任务
     *
     * @return {*}  
     * @memberof TaskHandle
     */
    public resolve(): void {
        if (!this._done) return;
        if (this._resolve) this._resolve(this.value);
    }

    /**
     * 任务异常
     *
     * @param {*} reason
     * @memberof TaskHandle
     */
    public reject(reason: any) {
        if (this._reject) this._reject(reason);
    }

    /**
     * 等待任务完成
     *
     * @template TResult1
     * @template TResult2
     * @param {(((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined)} [onfulfilled]
     * @param {(((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined)} [onrejected]
     * @return {*}  {(Promise<TResult1 | TResult2>)}
     * @memberof TaskHandle
     */
    public async then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined): Promise<TResult1 | TResult2> {

        // 如果是异步任务
        if (this.isAsyncTask() && !this._running) {

            // 执行这个异步任务
            // 直到这个异步任务完成
            // 一般执行到这里
            // 说明调用者并不关心子任务调用结果
            // 而是直接await了这个异步任务
            for await (const o of this) {
                DEBUG && this._log && logger.log(o);
            }

            this.resolve();
        }

        // 如果是同步任务
        // 则等待promise完成即可
        return this._promise.then(onfulfilled, onrejected);
    }

    /**
     * 任务异常处理
     *
     * @template TResult
     * @param {(((reason: any) => TResult | PromiseLike<TResult>) | null | undefined)} [onrejected]
     * @return {*}  {(Promise<T | TResult>)}
     * @memberof TaskHandle
     */
    public catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined): Promise<T | TResult> {
        return this._promise.catch(onrejected);
    }

    /**
     * 任务最终完成处理
     *
     * @param {((() => void) | null | undefined)} [onfinally]
     * @return {*}  {Promise<T>}
     * @memberof TaskHandle
     */
    public finally(onfinally?: (() => void) | null | undefined): Promise<T> {
        return this._promise.finally(onfinally);
    }

    /**
     * 异步迭代器
     * 
     * 异步任务很可能因为实现者实现的问题导致任务死锁,一定要小心实现异步任务
     *
     * @return {*}  {AsyncGenerator<void>}
     * @memberof TaskHandle
     */
    public async *[Symbol.asyncIterator](): AsyncGenerator<T> {
        DEBUG && assert(this._task != null, "task is null");
        DEBUG && assert(this.isAsyncTask(), "TaskHandle.asyncIterator() can only be used with AsyncTask");

        // 不能多次执行
        if (this._running) {
            throw new AsyncGeneratorMultipleCallsError();
        }

        if (this.isAsyncTask()) {

            // 潜在问题
            // 由于TaskHandle是池化管理
            // 假如有如下调用:
            // 1, var handler = task services create running task
            // 2, for await (let value of handler) {
            // 3,     // do something
            // 4, }
            // 5, 逻辑运行到这里的时候handler已经被回收
            // 6, 一般这个时候继续调用会直接抛出错误 AsyncGeneratorMultipleCallsError
            // 7, 但是假如不是现在调用。而是在其他逻辑之后调用，比如在任何地方从池中又取出了这个handler。并且这个handler还没有执行完毕的时候如果被执行力for await (let value of handler) {}
            // 9, 就会有意想不到的错误发生

            // 1，对于这种问题最好的规避方法就是不要在任何地方去缓存拿到的handler.做到即创建即使用即抛弃
            // 2，当然开发者也可以自行对比ID，把ID缓存下来，如果发现ID不一样了，那说明这个Handle已经发生过回收并又重新使用了
            // 3，对于任意一个异步任务且还没运行就已经处于done状态的task，直接抛出错误
            if (this._task!.isDone) {
                throw new AsyncGeneratorMultipleCallsError();
            }

            let task = this.task! as IGameFramework.IAsyncTask<T>;
            this._running = true;

            while (this._task && !this._task!.isDone) {
                let v = await task.moveNext();
                if (task.isDone) {

                    // 异步任务完成
                    this.done = true;
                    return;
                }
                else yield v || this.value;
            }
        }
    }

    /**
     * 释放资源
     *
     * @memberof TaskHandle
     */
    public dispose(): void {
        if (this._disposed) return;
        this.cleanUp();
        this._disposed = true;
    }

    /**
     * 清理资源
     *
     * @memberof TaskHandle
     */
    public cleanUp(): void {
        DEBUG && assert(!this._disposed, "TaskHandle has been disposed");

        this._promise = null!;
        this._done = false;
        if (this._task) this._task.dispose();
        super.clearUp();
        this._autoFree = true; // 默认自动释放
        this._task = null!;
        this._resolve = null!;
        this._reject = null!;
        this._v = null!;
        this._running = false;
        this._log = false;
    }

    /**
     * 返回Promise的字符串
     * 
     * @example
     * ```typescript
     * 
     * // 对于此类判断是否为Promise对象的函数可以为true
     * function isPromise(obj) {
     *    return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
     * }
     * 
     * // 对于此类判断是否为Promise对象的函数可以为true
     * function isPromise(obj) {
     *    return obj && Object.prototype.toString.call(obj) === '[object Promise]'
     * }
     * 
     * // 对于此类判断是否为Promise对象的函数可以为true
     * function isPromise(obj) {
     *    if (Promise && Promise.resolve) {
     *       return Promise.resolve(obj) == obj
     *    } else {
     *       throw new Error('当前环境不支持 Promise !')
     *    }
     * }
     * ```
     *
     * @readonly
     * @memberof TaskHandle
     */
    public get [Symbol.toStringTag]() {
        return "Promise";
    };
}

/**
 * 等待一定帧数
 *
 * @class WaitDelayFrame
 * @implements {ITask}
 */
class WaitDelayFrame<T> extends SyncTask<T> implements IGameFramework.ITask<T> {

    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        private _frame: number,
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
    }

    public override *task(): IGameFramework.Nullable<Generator<T>> {
        while (this._frame > 0) {
            if (this.isCancellationRequested) return;
            this._frame--;
            yield null!;
        }
    }
}

/**
 * 等待条件满足
 *
 * @class WaitUntil
 * @implements {ITask}
 */
class WaitUntil<T> extends SyncTask<T> implements IGameFramework.ITask<T> {
    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        private _condition: () => boolean,
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
    }

    public override *task(): IGameFramework.Nullable<Generator<T>> {
        while (!this._condition()) {
            if (this.isCancellationRequested) return;
            yield null!;
        }
    }
}

/**
 * 延迟一定时间
 *
 * @class WaitDealy
 * @extends {AsyncTask<T>}
 * @implements {IGameFramework.IAsyncTask<T>}
 * @template T
 */
class WaitDelay<T> extends AsyncTask<T> implements IGameFramework.IAsyncTask<T> {
    private _start: number = 0;

    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        private _delay: number,
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
        this._start = Date.now();
    }

    public override async *task(): IGameFramework.Nullable<AsyncGenerator<T>> {
        yield await new Promise<T>(resolve => {
            this._resolve = resolve;
        });
    }

    public update(): void {
        if (this._resolve == null) return;

        if (this.isCancellationRequested) {
            this._resolve && this._resolve(0 as T);
            this._resolve = null;
            return;
        }

        let diff = Date.now() - this._start;
        let distance = diff - this._delay;
        if (distance >= 0) {
            this.handle.value = distance as T;
            this._resolve && this._resolve(distance as T);
            this._resolve = null;
        }
    }
};

/**
 * 帧更新
 *
 * @class FrameUpdate
 * @extends {AsyncTask<T>}
 * @implements {IGameFramework.IAsyncTask<T>}
 * @template T
 */
class FrameUpdate<T> extends AsyncTask<T> implements IGameFramework.IAsyncTask<T> {
    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        private _callback: () => void,
        private _callee: unknown,
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
    }

    public override async *task(): IGameFramework.Nullable<AsyncGenerator<T>> {
        yield await new Promise<T>(resolve => {
            this._resolve = resolve;
        });
    }

    public update(): void {
        if (this._resolve == null) return;

        if (this.isCancellationRequested) {
            this._resolve && this._resolve(0 as T);
            this._resolve = null;
            return;
        }

        this._callback.call(this._callee);
    }
};


/**
 * 毫秒更新
 *
 * @class TimeUpdate
 * @extends {AsyncTask<T>}
 * @implements {IGameFramework.IAsyncTask<T>}
 * @template T
 */
class TimeUpdate<T> extends AsyncTask<T> implements IGameFramework.IAsyncTask<T> {
    private _startTime: number = 0;
    private _lastTime: number = 0;
    private _lastUpdateTime: number = 0;

    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        private _callback: (deltaTime: number) => void,
        private _callee: unknown,
        private _updateInterval: number = 1000 / parseInt(game.frameRate as string, 10),
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
        this._startTime = Date.now();
        this._lastTime = this._startTime;
        this._lastUpdateTime = this._startTime;
    }

    public override async *task(): IGameFramework.Nullable<AsyncGenerator<T>> {
        yield await new Promise<T>(resolve => {
            this._resolve = resolve;
        });
    }

    public update(): void {
        if (this._resolve == null) return;

        if (this.isCancellationRequested) {
            this._resolve && this._resolve(0 as T);
            this._resolve = null;
            return;
        }

        const currentTime = Date.now();

        const timeSinceLastUpdate = currentTime - this._lastUpdateTime;
        if (timeSinceLastUpdate < this._updateInterval) {
            return;
        }
        // 多余的时间参与补偿，避免时间丢失
        const remainder = timeSinceLastUpdate % this._updateInterval;
        this._lastUpdateTime = currentTime - remainder;

        const deltaTime = this._lastUpdateTime - this._lastTime;
        this._lastTime = this._lastUpdateTime;

        this._callback.call(this._callee, deltaTime);
    }
}

/**
 * 循环毫秒迭代
 *
 * @class LoopMilliseconds
 * @extends {AsyncTask<number>}
 * @implements {IGameFramework.IAsyncTask<number>}
 */
class LoopMilliseconds extends AsyncTask<number> implements IGameFramework.IAsyncTask<number> {
    private _executed = 0;
    private readonly _maxIterations: number;
    private readonly _interval: number;

    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        interval: number,
        maxIterations: number,
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
        this._interval = Math.max(1, Math.floor(interval));
        this._maxIterations = Number.isFinite(maxIterations) ? Math.max(1, Math.floor(maxIterations)) : Number.POSITIVE_INFINITY;
    }

    public override async *task(): IGameFramework.Nullable<AsyncGenerator<number>> {
        while (!this.isCancellationRequested && this._executed < this._maxIterations) {
            await this.runtime.waitDelay(this._interval);
            if (this.isCancellationRequested) return;
            this._executed++;
            this.handle.value = this._executed;
            yield this.handle.value;
        }
    }
}

/**
 * 循环帧数迭代
 *
 * @class LoopFrame
 * @extends {AsyncTask}
 * @implements {IGameFramework.IAsyncTask}
 */
class LoopFrame<T> extends AsyncTask<T> implements IGameFramework.IAsyncTask<T> {
    private _count: number = 0;

    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        private _frame: number,
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
        this._count = this._frame;
    }

    public override async *task(): IGameFramework.Nullable<AsyncGenerator<T>> {
        while (this._frame > 0) {
            if (this.isCancellationRequested) return;
            this._frame--;
            this.handle.value = this._count - this._frame as T;
            let handle = this.runtime.waitNextFrame();
            yield await handle as Awaited<T>;
        }
    }
}

/**
 * 瀑布流异步任务迭代器
 *
 * @class AsyncWaterFallTask
 * @extends {AsyncTask<T>}
 * @implements {IGameFramework.IAsyncTask<T>}
 * @template T
 */
class AsyncWaterFallTask<T> extends AsyncTask<T> implements IGameFramework.IAsyncTask<T> {
    private _tasks: SinglyLinkedList<() => IGameFramework.AnyAsyncAwaited<T>> = new SinglyLinkedList<() => IGameFramework.AnyAsyncAwaited<T>>();
    private _child: AsyncGenerator<T> = null!;

    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
    }

    /**
     * 添加子任务
     *
     * @param {() => IGameFramework.AnyAsyncAwaited<T>} task
     * @memberof AsyncWaterFallTask
     */
    public add(task: () => IGameFramework.AnyAsyncAwaited<T>): void {
        this._tasks.append(task);
    }

    /**
     * 异步迭代器
     *
     * @memberof AsyncWaterFallTask
     */
    public override async *task(): IGameFramework.Nullable<AsyncGenerator<T>> {
        if (this._tasks.isEmpty()) return null;
        let task = this._tasks.pop()!;
        while (task) {
            if (this.isCancellationRequested) return;
            let awaited: IGameFramework.AnyAsyncAwaited<T> = task();

            let v: Awaited<T> | IteratorResult<T> = null!;
            if (awaited instanceof TaskHandle && awaited.isAsyncTask()) {
                this._child = awaited[Symbol.asyncIterator]();
                v = await this._child.next();
            } else {
                v = await awaited;
            }

            if (this.isIteratorResult(v)) {
                this.handle.value = v.value as T;
                if (v.done) this._child = null!;
                else yield v.value;
            } else {
                this.handle.value = v as T;
                yield v;
            }

            if (this._tasks.isEmpty() && this._child == null) return;
            if (this._child != null) task = () => this._child.next();
            else task = this._tasks.pop()!;
        }
    }

    private isIteratorResult<T>(v: Awaited<T> | IteratorResult<T>): v is IteratorResult<T> {
        return v && typeof v === "object" && (<IteratorResult<T>>v).done !== undefined;
    }
}

/**
 * 提供一个瀑布流异步任务构建器，以免过早的runTask
 *
 * @class AsyncWaterFallBuilder
 * @template T
 */
class AsyncWaterFallBuilder<T> {
    private _task: IGameFramework.ITask<T>;
    constructor(private _taskService: IGameFramework.ITaskRuntime, token?: IGameFramework.ICancellationToken) {
        this._task = new AsyncWaterFallTask(this._taskService, token)
    }

    /**
     * 添加子任务
     * 
     * 因为Awaited一旦创建即开始运行，所以这里必须使用一个函数在需要的时候才进行Awaited的创建
     *
     * @param {IGameFramework.AnyAsyncAwaitedCreate<T>} task
     * @return {*}  {this}
     * @memberof AsyncWaterFallBuilder
     */
    public add(task: IGameFramework.AnyAsyncAwaitedCreate<T>): this {
        if (typeof task == "function") {
            (this._task as AsyncWaterFallTask<T>).add(task);
        } else {

            // 调用链+1
            // 如果需要封装一些局部参数自用，建议使用实现IAnyAsyncAwaitedCreate<T>接口的方式
            (this._task as AsyncWaterFallTask<T>).add(() => task.run());
        }

        return this;
    }

    public build(): IGameFramework.ITaskHandle<T> {
        return this._taskService.runTask(this._task);
    }
}

/**
 * 异步事件
 *
 * @class AsyncTouchEvent
 * @extends {AsyncTask<T>}
 * @implements {IGameFramework.IAsyncTask<T>}
 * @template T
 */
class AsyncTouchEvent<T> extends AsyncTask<T> implements IGameFramework.IAsyncTask<T> {
    private _events: { event: NodeEventType, useCapture: boolean }[] = [];
    private _target: unknown = null!;
    private _asyncSet: AsyncSet<EventTouch> = new AsyncSet<EventTouch>();

    public set target(target: unknown) {
        this._target = target;
    }

    public get target(): unknown {
        return this._target;
    }

    public constructor(
        runtime: IGameFramework.ITaskRuntime,
        private _nodes: Node[],
        token?: IGameFramework.ICancellationToken
    ) {
        super(runtime, token);
    }

    public on(event: NodeEventType, useCapture: boolean = false) {
        this._events.push({ event, useCapture });
    }

    public async *task(): IGameFramework.Nullable<AsyncGenerator<T>> {
        const invoke = (event: EventTouch) => {
            this._asyncSet.add(event);
        };

        const destroy = () => {
            if (this.isDone) {
                return;
            }

            this._done = true;
            this._asyncSet.done();
        };

        for (const node of this._nodes) {
            for (const event of this._events) {
                node.on(event.event, invoke, this._target, event.useCapture);
            }
            node.on(NodeEventType.NODE_DESTROYED, destroy, this._target);
        }

        const asyncSet = this._asyncSet;
        try {
            while (!this.isDone) {
                if (this.isCancellationRequested) return;
                for (let event of asyncSet) {
                    this.handle.value = event as T;
                    yield event as Awaited<T>;
                }
                asyncSet.clear();
                await asyncSet.wait();
            }
        } finally {
            for (const node of this._nodes) {
                for (const event of this._events) {
                    node.off(event.event, invoke, this._target, event.useCapture);
                }
                node.off(NodeEventType.NODE_DESTROYED, destroy, this._target);
            }
        }
    }
}

/**
 * 异步任务构造器
 *
 * @class AsyncTouchEventBuilder
 * @template T
 */
class AsyncTouchEventBuilder<T> {
    private _task: IGameFramework.ITask<T>;
    constructor(private _taskService: IGameFramework.ITaskRuntime, node: Node[], token?: IGameFramework.ICancellationToken) {
        this._task = new AsyncTouchEvent(this._taskService, node, token)
    }

    public on(event: NodeEventType, useCapture: boolean = false): this {
        (this._task as AsyncTouchEvent<T>).on(event, useCapture);
        return this;
    }

    public setTarget(target: unknown): this {
        (this._task as AsyncTouchEvent<T>).target = target;
        return this;
    }

    /**
     * 构造任务 
     *
     * @param {(iterable: IGameFramework.ITaskHandle<T>) => void} [iterableCallback]
     * @return {*}  {IGameFramework.ITaskHandle<T>}
     * @memberof AsyncTouchEventBuilder
     */
    public build(iterableCallback?: (iterable: IGameFramework.ITaskHandle<T>) => void): IGameFramework.ITaskHandle<T> {
        DEBUG && assert((this._task as AsyncTouchEvent<T>).target != null!, "AsyncTouchEvent.target is null!");
        const iterable = this._taskService.runTask(this._task);
        iterableCallback && iterableCallback(iterable);
        return iterable;
    }
}

/**
 * 任务服务
 *
 * @export
 * @class TaskService
 * @implements {ISingleton}
 * @implements {IGameFramework.ITaskRuntime}
 */
@ccclass("TaskService")
@implementation("IGameFramework.ITaskRuntime")
export class TaskService implements IGameFramework.ISingleton, IGameFramework.ITaskRuntime {
    private _running: Array<TaskHandle<unknown>> = [];
    private _taskHandlePool: Pool<TaskHandle<unknown>> = null!;

    onStart(args: IGameFramework.Nullable<{ taskPoolSize?: number }>): void {
        let taskPoolSize = 20;
        if (args && typeof args === "object") {
            if (args.taskPoolSize && typeof args.taskPoolSize === "number" && !isNaN(args.taskPoolSize)) {
                taskPoolSize = args.taskPoolSize;
            }
        }

        this._taskHandlePool = new Pool<TaskHandle<unknown>>(() => new TaskHandle<unknown>(), taskPoolSize, (handle) => {
            handle.dispose();
        });
    }

    public get enableUpdate() {
        return true;
    }

    public get updateOrder() {
        return 0;
    }

    onDestroy(): void { }

    /**
     * 更新任务
     *
     * @memberof TaskService
     */
    public onUpdate(): void {
        const running = this._running;
        let task: TaskHandle<unknown>;
        for (let i = running.length - 1; i >= 0; i--) {
            task = running[i];
            if (task.isDone() && !task.inThePool) {
                // 先检查一次，如果已经完成了就不需要在执行了
                // 为什么先在这里执行一次，因为任务本身可能在其他地方执行完毕了，但是不一定已经移除出running数组了
                if (task.autoFree) this.free(task);
                running.splice(i, 1);
                continue;
            }

            task.moveNext();
            if (task.isDone()) {

                // 这里先这样回收。
                // 如果cocos creator升级typescript到5.2以上，则可以使用using语法，自动回收资源
                // 如果这里现在不回收
                // 则需要调用者在使用完handle后手动调用free方法回收资源
                if (task.autoFree) this.free(task);
                running.splice(i, 1);
            }
        }
    }

    /**
     * 回收任务句柄
     *
     * @param {IGameFramework.ITaskHandle<unknown>} handle
     * @memberof TaskService
     */
    private free(handle: IGameFramework.ITaskHandle<unknown>): void {
        // 在开发环境下不允许回收已经回收过的资源
        if (DEBUG) assert(!handle.inThePool, "handle is pooled");
        // 在生产环境下直接返回不做回收,但是可能会造成taskHandlePool的资源池越来越大
        // 因为在开发环境下，就应该已经解决了问题
        else if (handle.inThePool) return;

        handle.cleanUp();
        handle.inThePool = true;
        this._taskHandlePool.free(handle as TaskHandle<unknown>);
    }

    /**
     * 获取任务句柄
     *
     * @return {*}  {IGameFramework.ITaskHandle<T>}
     * @memberof TaskService
     */
    public get<T>(): IGameFramework.ITaskHandle<T> {
        const handle = this._taskHandlePool.alloc();
        handle.inThePool = false;
        return handle as IGameFramework.ITaskHandle<T>;
    }

    /**
     * 执行任务
     * 
     * 对于TaskHandle可以使用isAsyncTask函数判断是不是AsynTask。AsyncTask请使用for await...of语法进行迭代
     * 
     * 对于任何同步任务而言
     * 
     * 调用链如下: 
     * ```typescript
     * taskService.runTask
     * taskService.onUpdate
     * taskhandle.moveNext
     * synctask.moveNext
     * call your custom task task function
     * task.done
     * ```
     * 
     * 对于任何异步任务而言
     * 
     * 如果你使用for await调用ITaskHadnle<T>
     * 则调用链如下:
     * ```typescript
     * taskService.runTask
     * taskhandle[Symbol.asyncIterator]
     * taskService.onUpdate
     * taskhandle.moveNext
     * asynctask.moveNext
     * call your custom task task function
     * task.done
     * ```
     * 
     * 如果你使用await调用ITaskHadnle<T>
     * 则调用链如下:
     * ```typescript
     * taskService.runTask
     * taskService.onUpdate
     * taskhandle[Symbol.asyncIterator]
     * taskService.onUpdate
     * taskhandle.moveNext
     * asynctask.moveNext
     * call your custom task task function
     * task.done
     * your await done
     * await after code call
     * ```
     * 
     * 当然你可以两者一起用
     *
     * @template T
     * @param {ITask} task 同步任务
     * @return {*}  {IGameFramework.ITaskHandle<T>} 任务句柄
     * @memberof TaskService
     */
    public runTask<T>(task: IGameFramework.Nullable<IGameFramework.ITask<T>>): IGameFramework.ITaskHandle<T> {
        let taskHandle = this.get().reset(task) as TaskHandle<T>;
        this._running.push(taskHandle as TaskHandle<unknown>);
        return taskHandle;
    }

    /**
     * 回收任务句柄
     *
     * @template T
     * @param {IGameFramework.ITaskHandle<T>} handle
     * @return {*}  {void}
     * @memberof TaskService
     */
    public freeTask<T>(handle: IGameFramework.ITaskHandle<T>): void {
        if (this._running.includes(handle as TaskHandle<unknown>)) {
            return;
        }

        this.free(handle);
    }

    /**
     * 等待下一帧
     * 
     * @example
     * ```typescript
     * await taskService.waitNextFrame();
     * ```
     * 
     * 对于TaskHandle可以使用isAsyncTask函数判断是不是AsynTask。AsyncTask请使用for await...of语法进行迭代
     *
     * @template T
     * @return {*}  {IGameFramework.ITaskHandle<T>}
     * @memberof TaskService
     */
    public waitNextFrame<T>(token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<T> {
        let task = this.get().reset(new WaitDelayFrame(this, 1, token)) as TaskHandle<T>;
        this._running.push(task as TaskHandle<unknown>);
        return task;
    }

    /**
     * 等待指定帧数
     * 
     * @example
     * ```typescript
     * // director.getTotalFrames() 30
     * await taskService.waitDelayFrame(30);
     * // director.getTotalFrames() 60
     * ```
     * 
     * 对于TaskHandle可以使用isAsyncTask函数判断是不是AsynTask。AsyncTask请使用for await...of语法进行迭代
     *
     * @template T
     * @param {number} frame 帧数
     * @param {IGameFramework.ICancellationToken} [token] 取消令牌
     * @return {*}  {IGameFramework.ITaskHandle<T>} 任务句柄
     * @memberof TaskService
     */
    public waitDelayFrame<T>(frame: number, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<T> {
        DEBUG && assert(frame > 0, "frame must be greater than 0");
        if (frame == 1) return this.waitNextFrame();

        let task = this.get().reset(new WaitDelayFrame(this, frame, token)) as TaskHandle<T>;
        this._running.push(task as TaskHandle<unknown>);
        return task;
    }

    /**
     * 等待条件满足
     * 
     * @example
     * ```typescript
     * let count = 0;
     * 
     * // other do something where count is 10
     * await taskService.waitUntil(() => count >= 10);
     * // count is 10 now
     * ```
     * 
     * 对于TaskHandle可以使用isAsyncTask函数判断是不是AsynTask。AsyncTask请使用for await...of语法进行迭代
     *
     * @template T
     * @param {() => boolean} condition 条件函数
     * @param {IGameFramework.ICancellationToken} [token] 取消令牌
     * @return {*}  {IGameFramework.ITaskHandle<T>}
     * @memberof TaskService
     */
    public waitUntil<T>(condition: () => boolean, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<T> {
        let task = this.get().reset(new WaitUntil(this, condition, token)) as TaskHandle<T>;
        this._running.push(task as TaskHandle<unknown>);
        return task;
    }

    /**
     * 等待指定时间
     *
     * @param {number} delay 毫秒数
     * @param {IGameFramework.ICancellationToken} [token]
     * @return {*}  {IGameFramework.ITaskHandle<number>} 最终会返回溢出时间
     * @memberof TaskService
     */
    public waitDelay(delay: number, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<number> {
        let task = this.get().reset(new WaitDelay(this, delay, token)) as TaskHandle<number>;
        this._running.push(task as TaskHandle<unknown>);
        return task;
    }

    /**
     * 循环帧数迭代
     * 
     * @example
     * ```typescript
     * console.log("start",director.getTotalFrames());
     * for await (const o of task.loopFrameAsyncIter(100)) {
     *    console.log(director.getTotalFrames())
     * }
     * console.log("end",director.getTotalFrames());
     * ```
     *
     * 对于TaskHandle可以使用isAsyncTask函数判断是不是AsynTask。AsyncTask请使用for await...of语法进行迭代
     * 
     * @template T
     * @param {number} frame
     * @param {IGameFramework.ICancellationToken} [token]
     * @return {*}  {IGameFramework.ITaskHandle<T>}
     * @memberof TaskService
     */
    public loopFrameAsyncIter(frame: number, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<number> {
        let task = this.get().reset(new LoopFrame(this, frame, token)) as TaskHandle<number>;
        this._running.push(task as TaskHandle<unknown>);
        return task;
    }

    /**
     * 基于时间的异步循环
     * 
     * @example
     * ```typescript
     * for await (const o of task.loopTimeAsyncIter(1000, 5)) {
     *    console.log(o);
     * }
     * ```
     * 
     * 对于TaskHandle可以使用isAsyncTask函数判断是不是AsynTask。AsyncTask请使用for await...of语法进行迭代
     * 
     * @template T
     * @param {number} interval 间隔时间，单位毫秒
     * @param {number} [maxIteration] 最大迭代次数
     * @param {IGameFramework.ICancellationToken} [token]
     * @return {*}  {IGameFramework.ITaskHandle<number>}
     * @memberof TaskService
     */
    public loopTimeAsyncIter(interval: number, maxIteration?: number, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<number> {
        DEBUG && assert(interval > 0, "interval must be greater than 0");
        if (maxIteration != null) {
            DEBUG && assert(maxIteration > 0, "maxIteration must be greater than 0");
        }
        const limit = maxIteration ?? Number.POSITIVE_INFINITY;
        const task = this.get().reset(new LoopMilliseconds(this, interval, limit, token)) as TaskHandle<number>;
        this._running.push(task as TaskHandle<unknown>);
        return task;
    }

    /**
     * 每帧更新
     * 
     * @param {() => void} callback
     * @param {unknown} callee
     * @param {IGameFramework.ICancellationToken} [token]
     * @return {*}  {IGameFramework.ITaskHandle<void>}
     * @memberof TaskService
     */
    public frameLoopTask(callback: () => void, callee: unknown, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<void> {
        let task = this.get().reset(new FrameUpdate(this, callback, callee, token)) as TaskHandle<void>;
        this._running.push(task as TaskHandle<unknown>);
        return task;
    }

    /**
     * 时间更新
     *
     * @param {(time: number) => void} callback
     * @param {unknown} callee
     * @param {number} interval
     * @param {IGameFramework.ICancellationToken} [token]
     * @return {*}  {IGameFramework.ITaskHandle<void>}
     * @memberof TaskService
     */
    public timeLoopTask(callback: (time: number) => void, callee: unknown, interval: number, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<void> {
        let task = this.get().reset(new TimeUpdate(this, callback, callee, interval, token)) as TaskHandle<void>;
        this._running.push(task as TaskHandle<unknown>);
        return task;
    }

    /**
     * 瀑布流异步任务构建器
     * 
     * @example
     * ```typescript
     * var handle = task.waterFallTaskBuiler()
     *    .add(() => new Promise(resolve => setTimeout(() => resolve("1"), 1000)))    // result is "1"
     *    .add(() => new Promise(resolve => setTimeout(() => resolve("2"), 1000)))    // result is "2"
     *    .add(() => new Promise(resolve => setTimeout(() => resolve("3"), 1000)))    // result is "3"
     *    .add(() => task.waitNextFrame())                                            // result is null
     *    .add(() => task.waitDelayFrame(10))                                         // result is null
     *    .add(() => task.waterFallTaskBuiler()                                        
     *       .add(() => new Promise(resolve => setTimeout(() => resolve("4"), 1000))) // result is "4"
     *       .add(() => new Promise(resolve => setTimeout(() => resolve("5"), 1000))) // result is "5"
     *       .add(() => new Promise(resolve => setTimeout(() => resolve("6"), 1000))) // result is "6"
     *       .build())
     *    .add(() => new Promise(resolve => setTimeout(() => resolve("7"), 1000)))    // result is "7"
     *    .build();
     * for await (let result of handle) {
     *    console.log(director.getTotalFrames(), result);
     * }
     * ```
     *
     * @template T
     * @return {*}  {AsyncWaterFallBuilder<T>}
     * @memberof TaskService
     */
    public waterFallTaskBuiler<T>(): AsyncWaterFallBuilder<T> {
        return new AsyncWaterFallBuilder<T>(this);
    }

    /**
     * 创建一个异步事件任务构建器
     * 
     * 可以监听Node事件
     * 
     * @example
     * ```typescript
     *  task!.eventBuilder<EventTouch>(
     *       node, this._map.node]
     *       , this).on(NodeEventType.TOUCH_START).build(async iterable => {
     *           for await (const event of iterable) {
     *               console.log(event);
     *            }
     *       });
     * ```
     * 
     * @template T
     * @param {Node} node
     * @param {unknown} [target]
     * @param {IGameFramework.ICancellationToken} [token]
     * @return {*}  {AsyncTouchEventBuilder<T>}
     * @memberof TaskService
     */
    public eventBuilder<T>(node: Node, target?: unknown, token?: IGameFramework.ICancellationToken): AsyncTouchEventBuilder<T> {
        return new AsyncTouchEventBuilder(this, [node], token).setTarget(target) as AsyncTouchEventBuilder<T>;
    }

    /**
     * 创建一个异步事件任务构建器
     * 
     * 可以监听Node事件
     * 
     * @example
     * ```typescript
     * task!.eventsBuilder<EventTouch>(
     *       [node1, node2, node3, node4, node5,... other nodes]
     *       , this).on(NodeEventType.TOUCH_START).build(async iterable => {
     *           for await (const event of iterable) {
     *               console.log(event);
     *           }
     *       });
     * ```
     * 
     * @template T
     * @param {Node[]} node 需要监听事件的node数组
     * @param {unknown} [target] 
     * @param {IGameFramework.ICancellationToken} [token]
     * @return {*}  {AsyncTouchEventBuilder<T>}
     * @memberof TaskService
     */
    public eventsBuilder<T>(node: Node[], target?: unknown, token?: IGameFramework.ICancellationToken): AsyncTouchEventBuilder<T> {
        return new AsyncTouchEventBuilder(this, node, token).setTarget(target) as AsyncTouchEventBuilder<T>;
    }
}
