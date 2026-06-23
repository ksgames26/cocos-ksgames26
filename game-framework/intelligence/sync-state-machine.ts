import { EventDispatcher } from "../core/event-dispatcher";

export class StateMachine<E, B extends IGameFramework.IStateMachineBlackboard, S extends IGameFramework.IState<E, B>, U extends IGameFramework.EventOverview> extends EventDispatcher<U> implements IGameFramework.IStateMachine<E, B, S> {
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
     * @memberof StateMachine
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
            this.addState(state);
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
    public changeStateByInstane(newState: S): void {
        if (this._currentState && newState === this._currentState) {
            return;
        }

        if (this._states.every(state => state !== newState)) {
            // 不允许中途添加新的状态
            return;
        }

        if (this._currentState) {
            this._currentState.exit(this._owner);
        }

        let prev = this._currentState;
        this.beforeStateChange(this._currentState, newState);
        if (this._currentState) {
            this._currentState.enter(this._owner);
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
    public changeStateByCtor(newState: new (...args: any) => S): void {
        const find = this._states.find(state => state.constructor == newState);
        if (find) {
            this.changeStateByInstane(find);
        }
    }

    /**
     *  根据状态唯一ID切换状态
     *
     * @param {(string | number)} id
     * @return {*}  {void}
     * @memberof StateMachine
     */
    public changeStateById(id: string | number): void {
        const find = this._states.find(state => state.id === id);
        if (find) {
            this.changeStateByInstane(find);
        }
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._states.forEach(state => state.dispose());
    }
}