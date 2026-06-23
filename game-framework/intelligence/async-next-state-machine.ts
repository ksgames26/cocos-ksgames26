import { assert, js } from "cc";
import { DEBUG } from "cc/env";
import { DefaultBlackboard } from "./async-state-machine";
import { AsyncTask } from "../core/task";

export class AsyncNextState implements IGameFramework.IAsyncState<null, DefaultBlackboard> {
    public declare stateMachine: AsyncNextStateMachine;
    protected _id: string | number = null!;
    protected _actuator: IGameFramework.ITaskActuator = { infoInvoke: void 0, progressInvoke: void 0 };
    protected _resolve: IGameFramework.Nullable<() => void> = null;
    private _disposed: boolean = false;

    /**
     * 当前执行的任务信息
     * 
     * 又调用者自行修改
     * 
     * 在上层调用方可以很方便的制定任务的一个显示tips
     * 
     * 比如正在加载，正在联网，正在巴拉巴拉。。。
     *
     * @protected
     * @type {string}
     * @memberof AsyncNextState
     */
    protected _message: string = "";


    /**
     * 任务进度进度值本身
     *
     * @protected
     * @type {number}
     * @memberof AsyncNextState
     */
    protected _progress: number = 0;

    public get actuator() {
        return this._actuator;
    }

    public initialize() {
        this._id = this.stateMachine.generatorID();
    }

    public get id(): string | number {
        return this._id;
    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    /**
     * 进入状态
     * 
     * 默认行为是不做任何任务处理
     * 
     * 直接返回
     * @return {*}  {Promise<void>}
     * @memberof AsyncNextState
     */
    public async enter(): Promise<void> {
        let promise = new Promise<void>((resolve, _) => {
            this._resolve = resolve;
        });

        if (this._actuator.infoInvoke) this._actuator.infoInvoke(this._message);
        return promise;
    }

    /**
     * 每帧更新
     * @memberof AsyncNextState
     */
    public update(): void {
        if (this._actuator.progressInvoke) this._actuator.progressInvoke({ progress: this._progress, name: this._message });
    }

    /**
     * 退出状态
     * @memberof AsyncNextState
     */
    public async exit(): Promise<void> {
        this._actuator = null!;
        this._resolve = null!;
    }

    public equals(state: IGameFramework.IAsyncState<null, DefaultBlackboard>): boolean {
        return this.id == state.id;
    }

    public dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this.exit();
    }
}

/**
 * 异步迭代状态机
 * 
 * 当前状态机是一个接一个的完成任务的，不支持切换任务
 *
 * @export
 * @class AsyncNextStateMachine
 * @extends {AsyncTask<T>}
 * @implements {IGameFramework.IAsyncStateMachine<unknown, DefaultBlackboard, AsyncNextState>}
 * @template T
 */
export class AsyncNextStateMachine extends AsyncTask<IGameFramework.ITaskActuator> implements IGameFramework.IAsyncStateMachine<null, DefaultBlackboard, AsyncNextState> {
    protected _states: AsyncNextState[] = [];
    protected _currentState: IGameFramework.Nullable<AsyncNextState>;
    protected _blackboard: DefaultBlackboard = new DefaultBlackboard();
    protected _running: boolean = false;
    protected _ids: js.IDGenerator = new js.IDGenerator("AsyncNextStateMachine<T>");

    /**
     * 创建一个新的ID
     *
     *
     * @return {*}  {string}
     * @memberof AsyncNextStateMachine
     */
    public generatorID(): string {
        return this._ids.getNewId();
    }

    public async *task(): IGameFramework.Nullable<AsyncGenerator<IGameFramework.ITaskActuator>> {
        if (this._states.length <= 0) return;

        this._running = true;
        let index = 0;
        let state = this._states[index];
        while (state != void 0) {
            if (this.isCancellationRequested) {
                this.dispose();
                return;
            }
            this._currentState = state;

            DEBUG && assert(!this._currentState.isDisposed, "AsyncNextStateMachine: current state is disposed");

            // 这里返回一个任务执行器给迭代器，供调用者使用
            // 当然这里本身是可以不返回actuator而是返回AsyncNextState
            // 但是直接返回整个AsyncNextState实例又不太好，调用者本身只需要这个任务的开始和进度就好了
            // 所以这里包一层任务执行器
            yield state.actuator;

            // 返回任务执行器后就可以开始执行等待任务执行完毕了
            // 在这个时间段
            // 任务状态的update会被调用，以便调用者更新自己的任务相关
            await state.enter();
            state.exit();
            state = this._states[++index];
        }

        this._running = false;
    }

    /**
     * 启动状态机
     *
     * @return {*}  {IGameFramework.ITaskHandle<IGameFramework.ITaskActuator>}
     * @memberof AsyncNextStateMachine
     */
    public run(): IGameFramework.ITaskHandle<IGameFramework.ITaskActuator> {
        DEBUG && assert(this._states.length > 0, "AsyncNextStateMachine: run() states is empty");

        return this.runtime.runTask(this);
    }

    public update(): void {
        if (this.isDisposed) return;

        if (!this._running || !this._currentState) return;
        this._currentState!.update();
    }

    /**
     * 新增一个状态
     *
     * @param {AsyncNextState} newState
     * @return {*}  {void}
     * @memberof AsyncNextStateMachine
     */
    public addState(newState: AsyncNextState): void {
        if (this._running) return;

        if (this._states.find(state => state.equals(newState))) {
            return;
        }

        newState.stateMachine = this;
        newState.initialize();
        this._states.push(newState);
    }

    /**
     * 新增一组状态
     *
     * @param {AsyncNextState[]} newStates
     * @return {*}  {void}
     * @memberof AsyncNextStateMachine
     */
    public addArrayState(newStates: AsyncNextState[]): void {
        if (this._running) return;

        newStates.forEach((state: AsyncNextState) => {
            this._states.push(state);
        });
    }

    /**
    * 当前状态是否为某个状态
    *
    * @param state
    * @returns
    */
    public currentIsState(findState: IGameFramework.Constructor<unknown> | string): boolean {
        const find = this._states.find(state => {
            if (typeof findState === "string") {
                return findState === state.id;
            } else {
                return state.constructor === findState;
            }
        });
        return this._currentState === find;
    }

    /**
     * 检查当前状态是否为提供的多个状态之一
     *
     * @param {...(IGameFramework.Constructor<unknown> | string)[]} states
     * @return {*}  {boolean}
     * @memberof AsyncStateMachine
     */
    public currentIsAnyOf(...states: (IGameFramework.Constructor<unknown> | string)[]): boolean {
        const stateSet = new Set(states);
        return this._states.some(state => {
            if (typeof state.id === "string" && stateSet.has(state.id)) {
                return this._currentState === state;
            }
            if (stateSet.has(state.constructor as IGameFramework.Constructor<unknown>)) {
                return this._currentState === state;
            }
            return false;
        });
    }

    /**
     * 获取当前状态
     *
     * @return {*}  {IGameFramework.Nullable<AsyncNextState>}
     * @memberof AsyncNextStateMachine
     */
    public getCurrState(): IGameFramework.Nullable<AsyncNextState> {
        return this._currentState;
    }

    /**
     * 获取状态机黑板
     *
     * @return {*}  {DefaultBlackboard}
     * @memberof AsyncNextStateMachine
     */
    public getBlackboard(): DefaultBlackboard {
        return this._blackboard;
    }

    /**
     * 设值黑板值
     *
     * @template T
     * @param {string} key
     * @param {T} val
     * @memberof AsyncNextStateMachine
     */
    public setBlackboardValue<T>(key: string, val: T): void {
        this._blackboard.setValue(key, val);
    }

    public cancel(): void {
        this._running = false;
        super.cancel();
    }

    /**
     * 获取黑板值
     *
     * @template T
     * @param {string} key
     * @return {*}  {IGameFramework.Nullable<T>}
     * @memberof AsyncNextStateMachine
     */
    public getBlackboardValue<T>(key: string): IGameFramework.Nullable<T> {
        return this._blackboard.getValue(key);
    }

    public async changeStateByInstane(newState: AsyncNextState): Promise<void> {

    }

    public async changeStateByCtor(newState: new (...args: any) => AsyncNextState): Promise<void> {

    }

    public async changeStateById(id: string | number): Promise<void> {

    }

    public beforeStateChange(curr: IGameFramework.Nullable<AsyncNextState>, next: AsyncNextState): void {

    }

    public afterStateChange(prev: IGameFramework.Nullable<AsyncNextState>, curr: IGameFramework.Nullable<AsyncNextState>): void {

    }

    public get owner() {
        return null;
    }

    public dispose(): void {
        if (this.isDisposed) {
            return;
        }

        if (this._running) {
            this.cancel();
        } else {
            super.dispose();
            this._states.forEach(state => {
                state.dispose();
            });
        }
    }
}