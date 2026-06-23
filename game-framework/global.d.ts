import "cc";
import { Component, physics } from "cc";
import { MessageType } from "./protobuf-ts/message-type";
export { };

declare module "cc" {
    export interface Event {

        /**
         * 目标是不是该节点
         *
         * @param {Node} node
         * @return {*}  {boolean}
         * @memberof Event
         */
        isNode(node: Node): boolean;
    }

    export interface Node {

        /**
         * 深度优先遍历查找子节点
         *
         * @param {string} name
         * @param {Map<string, Node>} cache 查询缓存，如果传递了这个参数，那么在查找的时候会优先从缓存中查找，如果缓存中没有，才会去遍历查找，在遍历的过程中会被没暂时没匹配到的节点放入这个缓存中
         * @return {*}  {IGameFramework.Nullable<Node>}
         * @memberof Node
         */
        dfsGetChildByName(name: string, cache?: Map<string, Node>): IGameFramework.Nullable<Node>;

        /**
         * 广度优先遍历查找子节点
         *
         * @param {string} name
         * @param {Map<string, Node>} cache 查询缓存，如果传递了这个参数，那么在查找的时候会优先从缓存中查找，如果缓存中没有，才会去遍历查找，在遍历的过程中会被没暂时没匹配到的节点放入这个缓存中
         * @return {*}  {IGameFramework.Nullable<Node>}
         * @memberof Node
         */
        bfsGetChildByName(name: string, cache?: Map<string, Node>): IGameFramework.Nullable<Node>;

        /**
         * 是否激活点击
         * 
         * 默认允许
         */
        get touchEnable(): boolean;
        set touchEnable(enable: boolean);
    }

    export namespace __private {
        export interface _cocos_core_data_utils_attribute_defines__IExposedAttributesUserData extends IGameFramework.PropertypeDefine {

        }

        export interface _cocos_asset_asset_manager_config__IAssetInfo {
            ctor: IGameFramework.Constructor<Asset>;
            path: string;
        }
    }
}

declare global {
    interface window {
        diagnosis: Record<string, any>;
    }

    interface String {

        /**
         * 是不是空字符串
         *
         * @return {*}  {boolean}
         * @memberof String
         */
        isEmpty(): boolean;
    }

    interface IGameFramework {
        "IGameFramework.IEnv": IGameFramework.IEnv,
        "IGameFramework.ISerializable": IGameFramework.ISerializable,
        "IGameFramework.ISerializer": IGameFramework.ISerializer,
        "IGameFramework.ISingleton": IGameFramework.ISingleton,
        "IGameFramework.SpecialShapedScreen": IGameFramework.SpecialShapedScreen,
        "IGameFramework.IEventDispatcher": IGameFramework.IEventDispatcher<IGameFramework.EventOverview>
    }

    namespace IGameFramework {
        type IGraphID = string;
        type IListenerStepIndex = number;
        type IListenerBranchID = string;
        type IListenerBranchPrefabUUID = string;
        type IListenerId = [IGraphID, IListenerStepIndex, IListenerBranchID, IListenerBranchPrefabUUID];
        type IListenerIds = IListenerId[];
        interface IGameEvent {
            "beginners-tutorial": { uuid: string, view: Component },
            "tutorial-step-lock": { path: string },
            "tutorial-step-unlock": void,


            /**
             * 视图是否有新手引导
             * 
             * graphID  是图ID
             * stepIndex 是步骤索引
             * branchID 是引导分支ID
             * uuid     是引导所在视图Prefab的UUID，由新手引导编辑器配置导出
             *
             * @event [graphID,stepIndex,branchID,uuid][]
             */
            "view-has-tutorial": IListenerIds,
        }

        /**
         * 帧同步
         */
        namespace IFrameSync {

            /**
             * 错误码
             *
             * @enum {number}
             */
            const enum ErrorCode {
                /**离线 */
                OffLineErr = 100000,

                /**匹配失败 */
                StartMatchErr = 100001,

                /**取消匹配失败 */
                CancelMatchErr = 100002
            }

            interface CallResult {
                rtnCode: number;
                msg?: string;
            }

            /**
             * 帧数据玩家信息
             *
             * @interface IFramePlayerInfo
             */
            interface IFramePlayerInfo {
                playerId: string;
            }

            /**
             * 帧数据信息
             *
             * @interface IFrameInfo
             * @extends {IFramePlayerInfo}
             */
            interface IFrameInfo extends IFramePlayerInfo {
                data: string[];
                timestamp: number;
            }

            /**
             * 附加信息
             * @public
             */
            interface IFrameExtInfo {
                seed: number;
            }

            /**
             * 帧数据
             *
             * @interface IServerFrameMessage
             */
            interface IServerFrameMessage {
                currentRoomFrameId: number;
                frameInfo: IFrameInfo[];
                ext: IFrameExtInfo;
            }

            /**
             * 帧广播消息
             * @public
             */
            interface IRecvFrameMessage extends IServerFrameMessage {
                isReplay: boolean;
                time: number;
            }

            /**
             * 玩家信息
             * @param playerId - 玩家ID
             * @param status - 玩家状态 0：空闲；1：房间中；3：离线
             * @param customPlayerStatus - 自定义玩家状态
             * @param customPlayerProperties - 自定义玩家属性
             * @param teamId - 玩家teamId
             * @param isRobot - 是否为机器人，0：不是，1：是
             * @param robotName - 机器人名字
             * @param matchParams - 自定义匹配参数
             * @public
             */
            interface IPlayerInfo {
                playerId: string;
                status?: number;
                customPlayerStatus?: number;
                customPlayerProperties?: string;
                teamId?: string;
                isRobot?: number;
                robotName?: string;
                matchParams?: Record<string, string>;
            }

            /**
             * 帧同步客户端tick
             */
            interface IFrameSyncTick {
                /**
                 * 渲染帧执行
                 * @param dt 
                 */
                onRenderUpdate(dt: number): void;

                /**
                 * 逻辑帧执行
                 * @param dt 
                 */
                onLogicUpdate(dt: number): void;

                /**
                 * 预测帧执行
                 * @param dt 
                */
                onPreditUpdate(dt: number): void;
            }

            /**
             * 不同的帧同步服务适配层
             *
             * @interface IAppAdapter
             * @extends {IGameFramework.IDisposable}
             */
            interface IAppAdapter extends IGameFramework.IDisposable {

                /**
                 * 是不是已经链接到帧同步服务器了
                 */
                get isEnable(): boolean;

                /**
                 * 唯一名称
                 */
                get name(): string;

                /**
                 * 能不能启用
                 */
                get isOnline(): boolean;

                /**
                 * 是不是本地模拟的单机玩法
                 * 
                 * 就是不走服务器的玩法
                 */
                get isLocalAdpater(): boolean;

                /**
                 *  期望帧率对应的每帧时间（以 s 为单位）
                 */
                get frameTime(): number;

                /**
                 * 房主ID
                 */
                get ownerId(): string;

                /**
                 * 获取服务器分配的唯一ID
                 */
                get sPlayerId(): string;

                /**
                 * 逻辑帧ID
                 */
                get logicFrameId(): number;

                /**
                * 是不是房主
                *
                * @return {*}  {boolean}
                * @memberof IRoom
                */
                isOwner(): boolean;

                /**
                 * 创建客户端
                 */
                onCreate(args: any): Promise<void>;

                /**
                 * 初始化
                 */
                initialize(): Promise<boolean>;

                /**
                 * 启用
                 */
                onEnable(): Promise<void>;

                /**
                 * 禁用
                 */
                onDisable(): Promise<void>;

                /**
                 * 开始匹配
                 * @param config 匹配配置
                 * @param player 玩家配置
                 */
                startMatch(config: any, player: any): Promise<IGameFramework.Nullable<IRoom>>;

                /**
                 * 取消匹配
                 */
                cancelMatch(): Promise<IGameFramework.Nullable<CallResult>>;

                /**
                 *  开始帧同步
                 */
                startFrameSync(): void;

                /**
                 * 停止帧同步
                 */
                stopFrameSync(): void;

                /**
                * 渲染帧执行
                * @param update 
                */
                addRenderUpdate(update: (dt: number) => void): void;

                /**
                 * 逻辑帧执行
                 * @param update 
                 */
                addLogicUpdate(update: (dt: number) => void): void;

                /**
                 * 预测帧执行
                 * @param update 
                */
                addPreditUpdate(update: (dt: number) => void): void;

                /**
                 * 执行指令列表
                 * @param command 
                 */
                addCommandListExecute(execute: (command: IGameFramework.IFrameSync.IRecvFrameMessage) => void): void;

                /**
                 * 发送指令
                 * @param data 
                 */
                sendFrame(data: string): void;

                /**
                 * 获取确定性排序的玩家列表
                 */
                getPlayerDeterministicSorting(): Array<string>;
            }

            /**
             * 帧同步房间
             *
             * @interface IRoom
             */
            interface IRoom extends IGameFramework.IDisposable {

                /**
                 * 获取适配层
                 */
                get adapter(): IGameFramework.IFrameSync.IAppAdapter;

                /**
                 * 是不是自动步进
                 * 还是手动步进
                 * 
                 * 手动步进只每次update驱动可以手动跳动函数而不是引擎帧回调
                 * 
                 * 手动步进的时候，可以实现类似播放器的模式，按一下空格就跳一帧
                 */
                get autoUpdate(): boolean;
                set autoUpdate(value: boolean);

                /**
                 * 期望帧率对应的每帧时间（以 s 为单位）
                 */
                get frameTime(): number;

                /**
                 * 本地逻辑帧ID
                 */
                get logicFrameId(): number;

                /**
                 * 开始帧同步
                 *
                 * @memberof IRoom
                 */
                startFrameSync(): void;

                /**
                 * 停止帧同步
                 *
                 * @memberof IRoom
                 */
                stopFrameSync(): void;

                /**
                 * 是不是房主
                 *
                 * @return {*}  {boolean}
                 * @memberof IRoom
                 */
                isOwner(): boolean;

                /**
                 * 在不在房间中
                 *
                 * @return {*}  {boolean}
                 * @memberof IRoom
                 */
                inRoom(): boolean;

                /**
                 * 主动离开房间
                 *
                 * @return {*}  {Promise<void>}
                 * @memberof IRoom
                 */
                leave(): Promise<void>;

                /**
                 * 解散房间
                 *
                 * @return {*}  {Promise<void>}
                 * @memberof IRoom
                 */
                dismiss(): Promise<void>;

                /**
                 * 发送帧数据
                 *
                 * @param {string} data
                 * @memberof IRoom
                 */
                sendFrame(data: string): void;

                /**
                 * 房间里面得玩家是不是都准备好了
                 */
                allPlayerCanReady(): boolean;

                /**
                 * 获取玩家属性
                 */
                getPlayerProperty(): Map<string, IGameFramework.Nullable<string>>;

                /**
                 * 获取确定性排序好了的玩家ID
                 */
                getPlayerDeterministicSorting(): Array<string>;
            }
        }

        /**
         * 字符串转接口
         */
        type StringInterface<T> = T extends keyof IGameFramework ? IGameFramework[T] : any;

        /**
         * 类型
         */
        type Constructor<T> = new (...args: any[]) => T;

        /**
         * 可空类型
         */
        type Nullable<T> = T | null | undefined;

        /**
         * 只读转可写
         */
        type Writable<T> = {
            -readonly [K in keyof T]: T[K]
        }

        /**
         * 异步构造器
         */
        type AsyncCreate<T> = () => PromiseLike<T>;

        type EventName = string;
        type EventData = object | string | number | any;
        type EventListener<TEventData> = (
            data: TEventData,
        ) => Promise<unknown> | void;

        /**
         * 事件名称和预期数据类型的映射。
         * @type {Object.<EventName, EventData>}
         */
        interface EventOverview {
            [key: string]: EventData
        }

        interface Listener {
            get eventName(): string
            get priority(): number,
            get listener(): EventListener<EventData>,
            get callee(): unknown,
            get count(): number
            set count(count: number);
        }

        type ListenerMap = Map<EventName, Listener[]>;
        type OrderedListenerMap = Map<EventName, IGameFramework.Listener[]>;

        /**
         * 事件触发器
         *
         * @interface IEventDispatcher
         * @template TEventOverview
         */
        interface IEventDispatcher<TEventOverview extends EventOverview> {
            dispatchStrictSequence<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                eventData: TEventOverview[TEventName]
            ): Promise<void>

            dispatchStrictSequence<TEventName extends string>(
                eventName: Exclude<TEventName, keyof TEventOverview>,
                eventData: any
            ): Promise<void>

            dispatch<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                eventData: TEventOverview[TEventName]
            ): void

            dispatch<TEventName extends string>(
                eventName: Exclude<TEventName, keyof TEventOverview>,
                eventData: any
            ): void

            addListener<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                listener: EventListener<TEventOverview[TEventName]>,
                callee: unknown,
                count?: number,
                priority?: number,
            ): IGameFramework.Nullable<Listener>;

            addListener<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                listener: Function,
                callee: unknown,
                count?: number,
                priority?: number,
            ): IGameFramework.Nullable<Listener>;

            addListener<TEventName extends string>(
                eventName: Exclude<TEventName, keyof TEventOverview>,
                listener: EventListener<any>,
                callee: unknown,
                count?: number,
                priority?: number,
            ): IGameFramework.Nullable<Listener>;

            addAutoListener<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                listener: EventListener<TEventOverview[TEventName]>,
                callee: unknown,
                count?: number,
                priority?: number,
            ): IGameFramework.Nullable<Listener>;

            addAutoListener<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                listener: Function,
                callee: unknown,
                count?: number,
                priority?: number,
            ): IGameFramework.Nullable<Listener>;

            addAutoListener<TEventName extends string>(
                eventName: Exclude<TEventName, keyof TEventOverview>,
                listener: EventListener<any>,
                callee: unknown,
                count?: number,
                priority?: number,
            ): IGameFramework.Nullable<Listener>;

            addAsyncListener<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                callee: unknown,
                priority: number,
            ): Promise<TEventOverview[TEventName]>;

            addAsyncListener<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                callee: unknown,
                priority: number,
            ): Promise<TEventOverview[TEventName]>;

            removeListener<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                listener: IGameFramework.EventListener<TEventOverview[TEventName]>,
                callee?: unknown
            ): boolean;

            removeListeners<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName
            ): boolean;

            has<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName
            ): boolean;

            hasListener<TEventName extends Extract<keyof TEventOverview, string>>(
                eventName: TEventName,
                listener: IGameFramework.EventListener<TEventOverview[TEventName]>,
                callee: unknown
            ): boolean;

            hasListener<TEventName extends string>(
                eventName: Exclude<TEventName, keyof TEventOverview>,
                listener: IGameFramework.EventListener<any>,
                callee: unknown
            ): boolean;

            clearUp(e: string): void;
        }

        /**
         * 视图服务映射
         */
        interface IServiceViewMap {

        }

        interface JoltBroadPhaseLayerSettings {
            layers: physics.PhysicsGroup[];
        }

        interface JoltPhysicsSettings {
            movebroadPhaseLayer: JoltBroadPhaseLayerSettings;
            nonMovebroadPhaseLayer: JoltBroadPhaseLayerSettings;
            debug: boolean;
            drawBodies: boolean;
            drawConstraints: boolean;
            drawShape: boolean;
            drawBoundingBox: boolean;
            drawWorldTransform: boolean;
            drawCenterOfMass: boolean;
            isDeterministic: boolean;
            autoSimulation: boolean;
        }

        /**
         * 环境变量
         *
         * @interface IEnv
         */
        interface IEnv {

            /**
             * 是不是单机模拟环境
             */
            get isSingleMock(): boolean;

            /**
             * 获取物理配置
             */
            get physics(): IGameFramework.Nullable<JoltPhysicsSettings>;

            /**
             * 帧同步配置
             * 
             * @param {string} openID 用户唯一ID
             * @param {string} accessToken 加密Token，服务端获取
             */
            frameSyncConf<T extends IGameFramework.IFrameSync.IAppAdapter>(openID: string, accessToken?: string): Parameters<T["onCreate"]>[0];
        }

        /**
         * 全局配置表
         *
         * @interface ITableConf
         */
        interface ITableConf {

        }

        /**
         * 平台适配
         *
         * @interface IPalAdapter
         */
        interface IPalAdapter {

        }

        interface ISerializer {

            /**
             * 类型ID
             */
            get protoId(): string | number;
        }

        /**
         * 序列化
         *
         * @interface ISerializable
         */
        interface ISerializable {

            /**
             * 注入一个可以被序列化和反序列化的对象
             *
             * @template T
             * @param {Constructor<T>} clazz
             * @memberof ISerializable
             */
            registerType<T extends MessageType<object> & ISerializer>(clazz: Constructor<T>): void;

            /**
             * 注入一个可以被序列化和反序列化的对象
             *
             * @template T
             * @param {T} inst
             * @memberof ISerializable
             */
            registerInst<T extends MessageType<object> & ISerializer>(inst: T): void;

            /**
             * 编码
             *
             * @template T
             * @param {T} clazz
             * @return {*}  {Uint8Array}
             * @memberof ISerializable
             */
            encoder<T extends ISerializer>(clazz: T): IGameFramework.Nullable<Uint8Array>;

            /**
             * 解码
             *
             * @template T
             * @param {string|number} id
             * @param {Uint8Array} buffer
             * @return {*}  {T}
             * @memberof ISerializable
             */
            decoder<T extends ISerializer>(id: string | number, buffer: Uint8Array): IGameFramework.Nullable<T>;

            /**
             * 获取一个新的json对象而不是类实例
             *
             * @template T
             * @param {(string | number)} id
             * @return {*}  {T}
             * @memberof ISerializable
             */
            create<T>(id: string | number): IGameFramework.Nullable<T & ISerializer>;

            /**
             * 获取一个新的json对象而不是类实例
             *
             * @template T
             * @param {(string | number)} id
             * @return {*}  {T}
             * @memberof ISerializable
             */
            createByName<T extends IGameFramework.ISerializer>(name: string): IGameFramework.Nullable<T>;

            /**
             * 根据ID获取名称
             *
             * @param {(string | number)} id
             * @return {*}  {(string | null)}
             * @memberof ISerializable
             */
            getNameById(id: string | number): string | null;

            /**
             * 克隆一个对象
             *
             * @template T
             * @param {(string | number)} id
             * @param {T} source
             * @return {*}  {T}
             * @memberof ISerializable
             */
            clone<T>(id: string | number, source: T): IGameFramework.Nullable<T>;
        }

        /**
         * 单例接口
         *
         * @interface ISingleton
         */
        interface ISingleton {

            /**
             * 单例对象自己实现的任意参数
             * 
             * 创建的时候传入
             *
             * @param {*} args
             * @memberof ISingleton
             */
            onStart(args: unknown): void;

            /**
             * 单例销毁时调用
             *
             * @memberof ISingleton
             */
            onDestroy(): void;

            /**
             * 每帧驱动单例对象
             */
            onUpdate(): void;

            /**
             * 是否启用更新
             */
            enableUpdate: boolean;

            /**
             * 更新排序
             * 
             * 默认按照插入顺序执行
             */
            updateOrder: number;
        }


        /**
         * 特殊形状屏幕属性
         *
         * @interface SpecialShapedScreen
         */
        interface SpecialShapedScreen {

            /**
             * 是否修正顶部
             *
             * @type {boolean}
             * @memberof SpecialShapedScreen
             */
            fixTop?: boolean;

            /**
             * 是否修正底部
             *
             * @type {boolean}
             * @memberof SpecialShapedScreen
             */
            fixBottom?: boolean;

            /**
             * 是否修正缩放
             * 
             * @todo 暂时不支持 3.8.5 发布以后开始支持
             */
            fixScaled?: boolean;

            /**
             * 是否修正微信右上角
             *
             * @type {boolean}
             * @memberof SpecialShapedScreen
             */
            fixWxRightTop?: boolean;

            /**
             * 如果查询不存在的话，可以忽略
             */
            ignore?: boolean;

            /**
             * 组件名称
             *
             * @type {string}
             * @memberof SpecialShapedScreen
             */
            compName?: string;
        }

        /**
         * 定义用户数据
         *
         * @interface PropertypeDefine
         */
        interface PropertypeDefine {

            /**
             * 特殊形状屏幕属性
             *
             * @type {SpecialShapedScreen}
             * @memberof PropertypeDefine
             */
            specialShapedScreen?: SpecialShapedScreen

            /**
             * 是否绑定
             *
             * @type {boolean | string}
             * @memberof PropertypeDefine
             */
            binding?: boolean | string;

            /**
             * 组件ID
             *
             * @type {number}
             * @memberof PropertypeDefine
             */
            compIndex?: number;
        }

        /**
         * 对象接口
         *
         * 使用池化技术的所有对象都必须实现该接口
         */
        interface IPoolObject extends IGameFramework.IDisposable {
            /**
             * 是否在池中
             */
            inPoool: boolean;

            /**
             * 创建
             *
             * @memberof IObject
             */
            onCreate(): void;

            /**
             * 回收
             *
             * @memberof IObject
             * @returns boolean 当且仅当返回true得时候,继续放入池中
             */
            onFree(): boolean;

            /**
             * 销毁
             *
             * @memberof IObject
             */
            dispose(): void;
        }

        type Obj = keyof IPoolObject;

        /**
         * 提供一种用于释放资源但不会重复释放的机制。
         *
         * @export
         * @interface IDisposable
         */
        interface IDisposable {

            /**
             * 指示当前资源是否已释放。
             */
            get isDisposed(): boolean;

            /**
             * 释放当前资源。
             */
            dispose(): void;
        }

        /**
         * 对象池托管对象
         * 
         * 表示这个对象是从归属的对象池面创建和回收的
         *
         * @export
         * @interface IPoolManagedObject
         */
        interface IPoolManagedObject {

            /**
             * 是否自动回收
             * @type {boolean}
             * @memberof IPoolManagedObject
             */
            get autoFree(): boolean;
            set autoFree(value: boolean);

            /**
             * 是否已经被回收
             * @type {boolean}
             * @memberof ITaskHandle
             */
            get inThePool(): boolean;
            set inThePool(value: boolean);
        }

        interface IAsyncCollection {

            /**
             * 完成
             *
             * @memberof IAsyncCollection
             */
            done(): void;

            /**
             * 清理
             *
             * @memberof IAsyncCollection
             */
            clear(): void;
        }

        type AnyAsyncAwaitedCreate<T> = IAnyAsyncAwaitedCreate<T> | (() => IGameFramework.AnyAsyncAwaited<T>);

        /**
         * 实现一个异步子任务流
         *
         * @interface IAnyAsyncAwaitedCreate
         * @template T
         */
        interface IAnyAsyncAwaitedCreate<T> {
            run(): IGameFramework.AnyAsyncAwaited<T>
        }

        /**
         * 任务执行
         *
         * @interface ITaskActuator
         */
        interface ITaskActuator {
            /**
             * 执行什么
             *
             * @memberof ITaskActuator
             */
            infoInvoke: Nullable<(info: string) => void>;

            /**
             * 执行进度
             *
             * @memberof ITaskActuator
             */
            progressInvoke: Nullable<(progress: { progress: number, name: string }) => void>;
        }

        /**
         * 任务
         *
         * @export
         * @interface ITask
         * @extends {IDisposable}
         */
        interface ITask<T> extends IDisposable {
            /**
             * 执行任务
             *
             * @memberof ITask
             */
            moveNext(): void;

            /**
             * 任务句柄
             */
            set handle(handler: ITaskHandle<T>);
            get handle(): ITaskHandle<T>;

            /**
             * 指示当前任务是否已完成。
             *
             * @readonly
             * @type {boolean}
             * @memberof ITask
             */
            get isDone(): boolean;

            /**
             * 是不是取消了
             * 
             * @readonly
             * @type {boolean}
             * @member ITask
             */
            get isCancellationRequested(): boolean;

            /**
             * 获取任务运行时
             * @readonly
             * @type {ITaskRuntime}
             * @memberof ITask
             */
            get runtime(): ITaskRuntime;
        }


        /**
         * 可等待同步任务
         *
         * @export
         * @interface ISyncTask
         */
        interface ISyncTask<T> extends ITask<T> {

            /**
             * 返回一个可以迭代的同步任务句柄
             *
             * @return {*}  {Nullable< Generator<T>>}
             * @memberof ISyncTask
             */
            task(): Nullable<Generator<T>>;
        }

        /**
         * 可等待异步任务
         *
         * @export
         * @interface IAsyncTask
         */
        interface IAsyncTask<T> extends ITask<T> {

            /**
             * 返回一个可以迭代的异步任务句柄
             *
             * @return {*}  {Nullable<AsyncGenerator<T>>}
             * @memberof IAsyncTask
             */
            task(): Nullable<AsyncGenerator<T>>;

            /**
             * 每帧更新
             *
             * @memberof IAsyncTask
             */
            update?(): void;

            /**
             * 执行任务
             *
             * @memberof ITask
             */
            moveNext(): Promise<T>;
        }

        /**
         * 任务句柄
         *
         * @export
         * @interface TaskHandle
         * @extends {Promise<T>}
         * @extends {IDisposable}
         * @template T
         */
        interface ITaskHandle<T> extends Promise<T>, IPoolManagedObject, IDisposable, IEventDispatcher<{ done: T }> {
            /**
             * 句柄值
             *
             * @type {boolean}  
             * @memberof ITaskHandle<T>
             */
            get value(): T;
            set value(value: T);

            /**
             * 当前需要执行的任务
             * @readonly
             * @type {Nullable<ITask<T>>}
             * @memberof ITaskHandle
             */
            get task(): Nullable<ITask<T>>;

            /**
             * 唯一ID
             */
            get id(): string;

            /**
             * 异步任务日志
             */
            get logEnable(): boolean;
            set logEnable(enbale: boolean);

            /**
             * 任务是否完成
             */
            isDone(): boolean;

            /**
             * 异步任务迭代器
             *
             * @return {*}  {AsyncGenerator<T>}
             * @memberof ITaskHandle
             */
            [Symbol.asyncIterator](): AsyncGenerator<T>;

            /**
             * 是不是异步任务
             *
             * @return {*}  {this is IAsyncTaskHandle<T>}
             * @memberof ITaskHandle
             */
            isAsyncTask(): this is IAsyncTaskHandle<T>;

            /**
             * 重置
             * 
             * @param task 任务
             */
            reset(task: Nullable<ITask<T>>): this;

            /**
             * 清理当前任务
             *
             * @memberof ITaskHandle
             */
            cleanUp(): void;

            /**
             * 通知任务完成
             * 事件形式
             * 
             * @param v  
             * @memberof ITaskHandle
             */
            invokeDone(v: T): void;

            /**
             * 移动到任务的下一步
             */
            moveNext(): void;

            /**
             * 是否有效

             */
            isValid(): boolean;
        }

        /**
         * 取消令牌
         *
         * @interface ICancellationToken
         */
        interface ICancellationToken {

            /**
             * 取消
             *
             * @memberof ICancellationToken
             */
            cancel(): void;

            /**
             * 当前是否已取消
             * 
             * @memberof ICancellationToken
             */
            get isCancellationRequested(): boolean;
        }

        /**
         * 任意可等待
         */
        type AnyAsyncAwaited<T> = PromiseLike<T | IteratorResult<T>> | ITaskHandle<T>;

        /**
         * 异步任务句柄
         *
         * @export
         * @interface IAsyncTaskHandle
         * @extends {ITaskHandle<T>}
         * @template T
         */
        interface IAsyncTaskHandle<T> extends ITaskHandle<T> {
            /**
            * 当前需要执行的任务
            * @readonly
            * @type {Nullable<IAsyncTask<T>>}
            * @memberof ITaskHandle
            */
            get task(): Nullable<IAsyncTask<T>>;
        }

        /**
         * 任务运行时接口
         *
         * @export
         * @interface TaskRuntime
         */
        interface ITaskRuntime {

            /**
             * 迭代当前任务运行时中的所有任务,请确保实现自己的tick驱动update函数
             *
             * @memberof TaskRuntime
             */
            onUpdate(): void;

            /**
             * 获取一个空的任务句柄
             *
             * @return {*}  {ITaskHandle<unknown>}
             * @memberof ITaskRuntime
             */
            get(): ITaskHandle<unknown>;

            /**
             * 回收任务句柄
             *
             * @template T
             * @param {IGameFramework.ITaskHandle<T>} handle
             * @memberof ITaskRuntime
             */
            freeTask<T>(handle: ITaskHandle<T>): void;

            /**
             * 运行任务
             *
             * @template T
             * @param {ITask} task
             * @return {*}  {ITaskHandle<T>}
             * @memberof ITaskRuntime
             */
            runTask<T>(task: ITask<T>): ITaskHandle<T>;

            /**
             * 等待下一帧执行
             *
             * @template T
             * @return {*}  {ITaskHandle<T>}
             * @memberof ITaskRuntime
             */
            waitNextFrame<T>(token?: ICancellationToken): ITaskHandle<T>;

            /**
             * 等待指定帧数后执行
             *
             * @template T
             * @param {number} frame
             * @param {ICancellationToken} [token]
             * @return {*}  {ITaskHandle<T>}
             * @memberof ITaskRuntime
             */
            waitDelayFrame<T>(frame: number, token?: ICancellationToken): ITaskHandle<T>;


            /**
             * 等待指定时间后执行
             *
             * @param {number} delay
             * @param {IGameFramework.ICancellationToken} [token]
             * @return {*}  {IGameFramework.ITaskHandle<number>}
             * @memberof ITaskRuntime
             */
            waitDelay(delay: number, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<number>;

            /**
             * 等待条件满足
             *
             * @template T
             * @param {() => boolean} condition
             * @param {ICancellationToken} [token]
             * @return {*}  {ITaskHandle<T>}
             * @memberof ITaskRuntime
             */
            waitUntil<T>(condition: () => boolean, token?: ICancellationToken): ITaskHandle<T>;

            /**
             * 循环帧数迭代
             *
             * @template T
             * @param {number} frame
             * @param {ICancellationToken} [token]
             * @return {*}  {ITaskHandle<T>}
             * @memberof ITaskRuntime
             */
            loopFrameAsyncIter(frame: number, token?: ICancellationToken): ITaskHandle<number>;

            /**
             * 每帧更新
             *
             * @param {() => void} callback
             * @param {unknown} callee
             * @param {IGameFramework.ICancellationToken} [token]
             * @return {*}  {IGameFramework.ITaskHandle<void>}
             * @memberof ITaskRuntime
             */
            frameLoopTask(callback: () => void, callee: unknown, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<void>;

            /**
             * 时间更新
             *
             * @param {(time: number) => void} callback
             * @param {unknown} callee
             * @param {number} interval
             * @param {IGameFramework.ICancellationToken} [token]
             * @return {*}  {IGameFramework.ITaskHandle<void>}
             * @memberof ITaskRuntime
             */
            timeLoopTask(callback: (time: number) => void, callee: unknown, interval: number, token?: IGameFramework.ICancellationToken): IGameFramework.ITaskHandle<void>;
        }

        /**
        * 状态
        *
        * @interface IState
        * @template E
        */
        interface IState<E, B extends IStateMachineBlackboard> extends IGameFramework.IDisposable {

            /**
             * 状态id
             */
            get id(): string | number;

            /**
             * 状态机
             */
            get stateMachine(): IStateMachine<E, B, IState<E, B>>;
            set stateMachine(value: IStateMachine<E, B, IState<E, B>>);

            /**
             * 进入状态
             *
             * @param {E} entity
             * @memberof IState
             */
            enter(entity: E): void;

            /**
             * 更新状态
             *
             * @param {E} entity
             * @memberof IState
             */
            update(entity: E): void;

            /**
             * 退出状态
             *
             * @param {E} entity
             * @memberof IState
             */
            exit(entity: E): void;

            /**
             * 判断是否是当前状态
             *
             * @param {E} state
             * @return {*}  {boolean}
             * @memberof IState
             */
            equals(state: IState<E, B>): boolean;
        }

        /**
         * 状态
         *
         * @interface IAsyncState
         * @template E
         */
        interface IAsyncState<E, B extends IStateMachineBlackboard> extends IState<E, B> {
            /**
             * 状态机
             */
            get stateMachine(): IAsyncStateMachine<E, B, IAsyncState<E, B>>;
            set stateMachine(value: IAsyncStateMachine<E, B, IAsyncState<E, B>>);

            /**
             * 进入状态
             *
             * @param {E} entity
             * @memberof IState
             */
            enter(entity: E): Promise<void>;

            /**
             * 退出状态
             *
             * @param {E} entity
             * @memberof IState
             */
            exit(entity: E): Promise<void>;
        }

        /**
         * 状态机黑板
         *
         * @interface IStateMachineBlackboard
         */
        interface IStateMachineBlackboard {

            /**
             * 向黑板里面写入一个值
             *
             * @template T
             * @param {string} key
             * @param {T} val
             * @memberof IStateMachineBlackboard
             */
            setValue<T>(key: string, val: T): void;

            /**
             * 从黑板中获取一个值
             *
             * @template T
             * @param {string} key
             * @return {*}  {Nullable<T>}
             * @memberof IStateMachineBlackboard
             */
            getValue<T>(key: string): Nullable<T>;


            /**
             * 清理黑板数据
             *
             * @memberof IStateMachineBlackboard
             */
            clear(): void;
        }

        /**
        * 状态机
        *
        * @interface IStateMachine
        * @template E
        * @template S
        */
        interface IStateMachine<E, B extends IStateMachineBlackboard, S extends IState<E, B>> extends IGameFramework.IDisposable {

            /**
             * 状态更新
             *
             * @memberof IStateMachine
             */
            update(): void;

            /**
             * 添加状态
             *
             * @param {S} newState
             * @memberof IStateMachine
             */
            addState(newState: S): void;

            /**
             * 添加一组状态
             *
             * @param {S[]} newStates
             * @memberof IStateMachine
             */
            addArrayState(newStates: S[]): void;

            /**
             * 获取当前状态
             *
             * @return {IGameFramework.Nullable<S>}  {S}
             * @memberof IStateMachine
             */
            getCurrState(): IGameFramework.Nullable<S>;

            /**
             * 获取黑板数据
             *
             * @return {*}  {B}
             * @memberof IStateMachine
             */
            getBlackboard(): B;

            /**
             * 设置黑板数据
             *
             * @template T
             * @param {string} key
             * @param {T} val
             * @memberof IStateMachine
             */
            setBlackboardValue<T>(key: string, val: T): void;

            /**
             * 从黑板中获取一个值
             *
             * @template T
             * @param {string} key
             * @return {*}  {Nullable<T>}
             * @memberof IStateMachine
             */
            getBlackboardValue<T>(key: string): Nullable<T>;

            /**
             * 切换状态
             *
             * @param {S} newState
             * @return {*}  {void}
             * @memberof IStateMachine
             */
            changeStateByInstane(newState: S): void;

            /**
             * 切换状态
             *
             * @param {new (...args:any)=>S} newState
             * @return {*}  {void}
             * @memberof IStateMachine
             */
            changeStateByCtor(newState: new (...args: any) => S): void;

            /**
             * 切换状态
             *
             * @param {(string | number)} id
             * @return {*}  {void}
             * @memberof IStateMachine
             */
            changeStateById(id: string | number): void;

            /**
             * 状态切换之前
             *
             * @param {S} curr
             * @param {S} next
             * @memberof IStateMachine
             */
            beforeStateChange(curr: IGameFramework.Nullable<S>, next: S): void;

            /**
             * 状态切换之后
             *
             * @param {S} prev
             * @param {S} curr
             * @memberof IStateMachine
             */
            afterStateChange(prev: IGameFramework.Nullable<S>, curr: IGameFramework.Nullable<S>): void;

            /**
             * 是不是当前状态
             */
            currentIsState(state: IGameFramework.Constructor<S> | string): boolean;

            /**
             * 检查当前状态是否为提供的多个状态之一
             *
             * @param {...(IGameFramework.Constructor<S> | string)[]} states
             * @return {*}  {boolean}
             * @memberof StateMachine
             */
            currentIsAnyOf(...states: (IGameFramework.Constructor<S> | string)[]): boolean;

            /**
             * 获取当前状态机的持有者
             */
            get owner(): E;
        }

        /**
         * 状态机
         *
         * @interface IAsyncStateMachine
         * @template E
         * @template S
         */
        interface IAsyncStateMachine<E, B extends IStateMachineBlackboard, S extends IAsyncState<E, B>> extends IStateMachine<E, B, S> {
            /**
             * 切换状态
             *
             * @param {S} newState
             * @return {*}  {Promise<void>}
             * @memberof IStateMachine
             */
            changeStateByInstane(newState: S): Promise<void>;

            /**
             * 切换状态
             *
             * @param {new (...args:any)=>S} newState
             * @return {*}  {Promise<void>}
             * @memberof IStateMachine
             */
            changeStateByCtor(newState: new (...args: any) => S): Promise<void>;

            /**
             * 切换状态
             *
             * @param {(string | number)} id
             * @return {*}  {Promise<void>}
             * @memberof IStateMachine
             */
            changeStateById(id: string | number): Promise<void>;
        }
    }
}
