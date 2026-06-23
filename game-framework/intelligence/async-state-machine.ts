import { EventDispatcher } from "../core/event-dispatcher";

export class DefaultBlackboard implements IGameFramework.IStateMachineBlackboard {
    protected _values: Map<string, any>;
    public constructor() {
        this._values = new Map<string, any>();
    }

    public setValue<T>(key: string, val: T): void {
        this._values.set(key, val);
    }

    public getValue<T>(key: string): IGameFramework.Nullable<T> {
        return this._values.get(key);
    }

    public clear(): void {
        this._values.clear();
    }
}

type EventOverview<S> = {
    "StateDoComplete": S
}

export class AsyncStateMachine<E, B extends IGameFramework.IStateMachineBlackboard, S extends IGameFramework.IAsyncState<E, B>> extends EventDispatcher<EventOverview<S>> implements IGameFramework.IAsyncStateMachine<E, B, S> {
    protected _owner: E;
    protected _states: S[];
    protected _currentState: IGameFramework.Nullable<S>;
    protected _blackboard: B;
    private _disposed: boolean = false;

    public constructor(owner: E, backboard: B, states?: S[]) {
        super();

        this._owner = owner;
        this._blackboard = backboard;
        this._states = [];
        this._currentState = null!;
        states && this.addArrayState(states);
    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    /**
     * 获取当前状态
     *
     * @return {*}  {S}
     * @memberof StateMachine
     */
    public getCurrState(): IGameFramework.Nullable<S> {
        return this._currentState;
    }

    /**
     * 当前状态是否为某个状态
     *
     * @param state
     * @returns
     */
    public currentIsState(findState: IGameFramework.Constructor<S> | string): boolean {
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
     * @param {...(IGameFramework.Constructor<S> | string)[]} states
     * @return {*}  {boolean}
     * @memberof AsyncStateMachine
     */
    public currentIsAnyOf(...states: (IGameFramework.Constructor<S> | string)[]): boolean {
        const stateSet = new Set(states);
        return this._states.some(state => {
            if (typeof state.id === "string" && stateSet.has(state.id)) {
                return this._currentState === state;
            }
            if (stateSet.has(state.constructor as IGameFramework.Constructor<S>)) {
                return this._currentState === state;
            }
            return false;
        });
    }

    /**
     * 当前状态机所有者
     *
     * @readonly
     * @type {E}
     * @memberof StateMachine
     */
    public get owner(): E {
        return this._owner;
    }

    /**
     * 添加状态
     *
     * @param {S} newState
     * @return {*}  {void}
     * @memberof StateMachine
     */
    public addState(newState: S): void {
        if (this._states.find(state => state.equals(newState))) {
            return;
        }

        newState.stateMachine = this;
        this._states.push(newState);
    }

    /**
     * 批量添加状态
     *
     * @param {S[]} newStates
     * @memberof StateMachine
     */
    public addArrayState(newStates: S[]): void {
        newStates.forEach((state: S) => {
            this._states.push(state);
        });
    }

    /**
     * 获取黑板
     *
     * @return {*}  {B}
     * @memberof StateMachine
     */
    public getBlackboard(): B {
        return this._blackboard;
    }

    /**
     * 设置黑板中的值
     *
     * @template T
     * @param {string} key
     * @param {T} val
     * @memberof StateMachine
     */
    public setBlackboardValue<T>(key: string, val: T): void {
        this._blackboard.setValue(key, val);
    }

    /**
     * 从黑板中获取值
     *
     * @template T
     * @param {string} key
     * @return {*}  {IGameFramework.Nullable<T>}
     * @memberof StateMachine
     */
    public getBlackboardValue<T>(key: string): IGameFramework.Nullable<T> {
        return this._blackboard.getValue(key);
    }

    public update(): void {
        if (this._currentState) {
            this._currentState.update(this._owner);
        }
    }

    /**
     * 根据状态实力切换状态
     *
     * @param {S} newState
     * @return {*}  {boolean}
     * @memberof StateMachine
     */
    public async changeStateByInstane(newState: S): Promise<void> {
        if (this._currentState && newState === this._currentState) {
            return;
        }

        if (this._states.every(state => state !== newState)) {
            // 不允许中途添加新的状态
            return;
        }

        if (this._currentState) {
            await this._currentState.exit(this._owner);
        }

        let prev = this._currentState;
        this.beforeStateChange(this._currentState, newState);
        if (this._currentState) {
            await this._currentState.enter(this._owner);
        }
        this.afterStateChange(prev, this._currentState);
    }

    /**
     * 状态切换之前
     *
     * @param {S} curr
     * @param {S} next
     * @memberof StateMachine
     */
    public beforeStateChange(curr: IGameFramework.Nullable<S>, next: S): void {
        this._currentState = next;
    }

    /**
     * 状态切换之后
     *
     * @param {S} prev
     * @param {S} curr
     * @memberof StateMachine
     */
    public afterStateChange(prev: IGameFramework.Nullable<S>, curr: IGameFramework.Nullable<S>): void {

    }

    /**
     * 根据状态的构造函数切换状态
     *
     * @param {new (...args: any) => S} newState
     * @return {*}  {void}
     * @memberof StateMachine
     */
    public async changeStateByCtor(newState: new (...args: any) => S): Promise<void> {
        const find = this._states.find(state => state.constructor == newState);
        if (find) {
            await this.changeStateByInstane(find);
        }

        return Promise.resolve();
    }

    /**
     *  根据状态唯一ID切换状态
     *
     * @param {(string | number)} id
     * @return {*}  {void}
     * @memberof StateMachine
     */
    public async changeStateById(id: string | number): Promise<void> {
        const find = this._states.find(state => state.id === id);
        if (find) {
            await this.changeStateByInstane(find);
        }
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._states.forEach(state => state.dispose());
    }
}