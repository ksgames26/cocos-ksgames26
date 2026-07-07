import { _decorator, Animation, AnimationClip, AnimationState, assert, clamp, game } from "cc";
import { DEBUG, EDITOR } from "cc/env";
import { AsyncStateMachine, DefaultBlackboard } from "../../intelligence/async-state-machine";
const { ccclass, property, menu, executeInEditMode } = _decorator;

class State implements IGameFramework.IAsyncState<ViewState, DefaultBlackboard> {
    public declare stateMachine: ViewStateMachine;
    private _direction: number = 1.0;
    private _disposed: boolean = false;

    public constructor(private _id: number, private _event: AnimationClip.IEvent) {

    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    public get frame() {
        return this._event.frame;
    }

    public async enter(entity: ViewState): Promise<void> {
        let state = entity.createDefaultState();
        let scale = entity.scale;
        let time = state.duration;
        if (entity.speed == 1 && scale != 1) {
            state.speed = time / scale;
        } else if (entity.speed != 1) {
            state.speed = entity.speed;
        }

        const trans = entity.trans;
        if (!trans) {
            state.setTime(this._event.frame);
            state.sample();
            return;
        }

        const prev = this.stateMachine.getPrevState();
        if (prev) {
            const info = state.sample();
            if (prev._event.frame > this._event.frame) {
                info.direction = -1.0;
            } else if (prev._event.frame < this._event.frame) {
                info.direction = 1.0;
            }

            this._direction = info.direction;
        }
    }

    public update(entity: ViewState): void {
        if (EDITOR && !entity.defaultClip) return;

        let state = entity.getState(entity.defaultClip!.name);
        if (!state) return;

        let delta = 0.0;
        if (this._direction == 1.0) {
            if (state.time >= this._event.frame) {
                return;
            }

            if (entity.trans) {
                delta = state.time + game.deltaTime * state.speed;
            } else {
                delta = this._event.frame;
            }
            if (delta > this._event.frame) delta = this._event.frame;
        } else {
            if (state.time <= this._event.frame) {
                return;
            }

            if (entity.trans) {
                delta = state.time - game.deltaTime * state.speed;
            } else {
                delta = this._event.frame;
            }
            if (delta < this._event.frame) delta = this._event.frame;
        }

        state.setTime(delta);
        state.sample();
    }

    public async exit(entity: ViewState): Promise<void> {

    }

    public equals(entity: State): boolean {
        return this._event === entity._event;
    }

    public get id() {
        return this._id;
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
    }
}

class ViewStateMachine extends AsyncStateMachine<ViewState, DefaultBlackboard, State> {

    private _prev: IGameFramework.Nullable<State> = null;

    /**
     * 根据状态实力切换状态
     *
     * @param {S} newState
     * @return {*}  {boolean}
     * @memberof StateMachine
     */
    public async changeStateByInstane(newState: State): Promise<void> {
        // 重写了父类的实现,主要是把状态相同的这个判断去掉
        // 有这样一种情况
        // 比如当前状态是1, 然后切换到状态2, 然后切换到状态1
        // 这个过程连续执行
        // changeState(1)
        // changeState(2)
        // changeState(1)
        // 由于动画状态机是全异步状态
        // 会导致加了这个判断只能切换到2而无法成功切换到1
        // if (this._currentState && newState === this._currentState) {
        //     return;
        // }

        if (this._states.every(state => state !== newState)) {
            // 不允许中途添加新的状态
            return;
        }

        if (this._currentState) {
            await this._currentState.exit(this._owner);
        }

        let prev = this._currentState;
        this.beforeStateChange(this._currentState ?? null, newState);
        if (this._currentState) {
            await this._currentState.enter(this._owner);
        }
        this.afterStateChange(prev, this._currentState);
    }

    public changeCurrentState() {
        const owner = this._owner as ViewState;
        let defaultState = owner.createDefaultState();
        const first = this._states.find(state => defaultState.time <= state.frame);
        if (first) {
            this._currentState = first;
        }
    }

    public getPrevState(): IGameFramework.Nullable<State> {
        return this._prev;
    }

    public get timeInSecond(): number {
        if (!this._currentState || !this._prev) {
            return 0;
        }
        let per = 1.0;
        if (this.owner.speed == 1 && this.owner.scale != 1) {
            per = this.owner.scale;
        } else if (this.owner.speed != 1) {
            per = this.owner.speed;
        }
        return Math.abs(this._currentState.frame - this._prev.frame) / per;
    }

    public beforeStateChange(curr: IGameFramework.Nullable<State>, next: State): void {
        this._prev = curr;
        this._currentState = next;
    }
}

DEBUG && assert(!!Animation, "项目设置中未启用动画模块");

/**
 * 基于动画状态的视图状态控制器
 *
 * @export
 * @class ViewState
 * @extends {Animation}
 */
@ccclass("ViewState")
@executeInEditMode
@menu("GameFramework/ViewState/ViewState")
export class ViewState extends Animation {
    /**
     * 视图状态机
     *
     * @private
     * @memberof ViewState
     */
    private _stateMachine = new ViewStateMachine(this, new DefaultBlackboard());
    private _index: number = 0;
    private _trans: boolean = true;

    @property({ editorOnly: true }) desc = "";
    @property private _scale: number = 1.0;
    private _speed: number = 1.0;
    private _needAdjustState: boolean = false;
    private _clip: AnimationClip | null = null;

    @property({ type: [AnimationClip], override: true, visible: false })
    get clips(): (AnimationClip | null)[] {
        return super.clips;
    }

    set clips(value) {
        super.clips = value;
    }

    @property private _stateIndex: number = 0;

    @property({ tooltip: EDITOR ? "发布后，在视图组件载入时，是否切换到 stateIndex 状态" : "" }) private onLoadApply: boolean = false;

    @property({ type: AnimationClip, override: true, visible: true, displayName: "View State" })
    get defaultClip(): AnimationClip | null {
        return this._defaultClip;
    }

    set defaultClip(value) {
        if (value == null || value == undefined) {
            return;
        }

        const has = super.clips.find(v => v!.name == value!.name);
        if (!has) {
            this.addClip(value!, value!.name);
        }
        this._defaultClip = value;
    }

    @property({ override: true, visible: false })
    public playOnLoad = false;

    /**
     * 编辑器Inspector函数
     *
     * @private
     * @param {string} stateStr
     * @memberof ViewState
     */
    private editorChangeState(stateStr: string) {
        if (!EDITOR) {
            return;
        }

        let state = parseInt(stateStr, 10);
        const clip = this.defaultClip;
        if (!clip) {
            return;
        }

        const max = clip.events.length;
        if (!max) {
            return;
        }

        state = clamp(state, 0, max - 1);
        this._stateIndex = state;
        this.changeState(this._stateIndex, false);
    }

    /**
     * 编辑器Inspector函数
     *
     * @private
     * @return {*}  {string}
     * @memberof ViewState
     */
    private editorGetState(): string {
        if (!EDITOR) {
            return "";
        }

        const clip = this.defaultClip;
        if (!clip) {
            return "0";
        }

        const max = clip.events.length;
        if (!max) {
            return "0";
        }

        return this._stateIndex.toString();
    }

    public onLoad() {
        const clip = this.defaultClip;
        if (!clip) {
            return;
        }

        if (clip.events.length <= 0) {
            return;
        }

        const map = new Map<number, AnimationClip.IEvent>();
        for (const event of clip.events) {
            const has = map.get(event.frame);
            if (has) {
                // 有名字的事件会替换掉没有名字的事件
                if (!has.func && event.func) {
                    map.set(event.frame, event);
                }
            } else {
                map.set(event.frame, event);
            }
        }

        let index = 0;
        for (const e of map) {
            this._stateMachine.addState(new State(index++, e[1]));
        }

        if (EDITOR || this.onLoadApply) {
            this.changeState(this._stateIndex, false);
        }
    }

    /**
     * 播放速度
     *
     * @memberof ViewState
     */
    public get speed() {
        return this._speed;
    }

    public set speed(speed: number) {
        this._speed = speed;
    }

    /**
     * 时间缩放
     * 
     * 只是调整播放速度到缩放时间
     * 
     * 比如一个动画时长是2秒
     * 
     * scale为0.5的话，则播放速度为1
     * scale为2的话，则播放速度为4
     * 
     * 如果speed不为1，则scale不生效
     *
     * @memberof ViewState
     */
    @property
    public get scale() {
        return this._scale;
    }

    public set scale(scale: number) {
        this._scale = scale;
    }

    /**
     * 状态总数
     *
     * @readonly
     * @memberof ViewState
     */
    public get stateMax() {
        const clip = this.defaultClip;
        if (!clip) {
            return 0;
        }

        return clip.events.length;
    }

    /**
     * 切换状态是否动画过度
     *
     * @memberof ViewState
     */
    public get trans() {
        return this._trans;
    }

    public set trans(trans: boolean) {
        this._trans = trans;
    }

    /**
     * 两个状态时间距离
     * 
     * 即从一个状态到另一个状态所经过的时间 
     *
     * @readonly
     * @type {number}
     * @memberof ViewState
     */
    public get timeInSecond(): number {
        return this._stateMachine.timeInSecond;
    }

    /**
     * 改变状态
     *
     * @param {number} index
     * @param {boolean} [trans=this._trans]
     * @memberof ViewState
     */
    public async changeState(index: number, trans: boolean = this._trans): Promise<void> {
        if (DEBUG) assert(index < this.stateMax, "index out of range");
        else if (index > this.stateMax) return;

        if (this.needAdjustState) {
            this._needAdjustState = false;
            this._stateMachine.changeCurrentState();
        }

        this._index = index;
        this._trans = trans;
        await this._stateMachine.changeStateById(index);
    }

    /**
     * 创建初始化状态
     *
     * @return {*}  {AnimationState}
     * @memberof ViewState
     */
    public createDefaultState(): AnimationState {
        let state = this.getState(this.defaultClip!.name);
        if (!state) {
            state = this.createState(this.defaultClip!, this.defaultClip!.name);
        }

        return state;
    }

    /**
     * 设置百分比位置
     *
     * @memberof ViewState
     */
    public set percent(percent: number) {
        let state = this.createDefaultState();
        if (!state) return;
        state.time = state.duration * percent;
        state.sample();
        this._needAdjustState = true;
    }

    /**
     * 如果在设置百分比位置之后
     * 
     * 切换了状态，则需要重新校验一下当前的状态
     *
     * @readonly
     * @memberof ViewState
     */
    public get needAdjustState() {
        return this._needAdjustState;
    }

    /**
     * 当前状态索引
     *
     * @readonly
     * @memberof ViewState
     */
    public get index() {
        return this._index;
    }

    public update() {
        if (this._needAdjustState) return;
        this._stateMachine.update();
    }
}
