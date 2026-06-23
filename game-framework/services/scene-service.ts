import { logger } from "../core/log";
import { Container } from "../core/container";
import { Asset, Node, Prefab, _decorator, assert, director, find, game, js } from "cc";
import { DEBUG } from "cc/env";
import { EventDispatcher } from "../core/event-dispatcher";
import { type BaseService } from "../model-view/base-service";
import { type BaseView } from "../model-view/base-view";
import { AssetHandle, AssetService } from "./asset-service";
import { UIService } from "./ui-service";

const { ccclass } = _decorator;

/**
 * 场景生命周期阶段
 */
export const enum ScenePhase {
    /** 未初始化 */
    None,
    /** 正在加载资源 */
    Loading,
    /** 已加载，等待进入 */
    Loaded,
    /** 正在进入场景 */
    Entering,
    /** 运行中 */
    Running,
    /** 正在退出场景 */
    Exiting,
    /** 已退出，等待销毁 */
    Exited,
    /** 已销毁 */
    Destroyed,
}

/**
 * 场景配置参数
 */
export class SceneOptions {
    public constructor(

        /**
         * 场景唯一标识名称
         */
        public name: string,

        /**
         * 3D场景预制体资源句柄（可选，如果提供，将实例化3D场景内容）
         */
        public scenePrefab: IGameFramework.Nullable<AssetHandle<typeof Prefab>> = null,

        /**
         * 场景需要预加载的资源句柄列表
         */
        public preloadAssets: AssetHandle<typeof Asset>[] = [],

        /**
         * 进入场景时自动打开的UI面板列表
         */
        public autoOpenViews: { service: IGameFramework.Constructor<BaseService>, args?: any }[] = [],

        /**
         * 是否保留上一个场景（用于场景叠加）
         * 
         * 默认为 false，即进入新场景时会自动销毁旧场景
         */
        public keepPrevScene: boolean = false,

        /**
         * 场景的自定义数据，供场景控制器使用
         */
        public userData: IGameFramework.Nullable<Readonly<any>> = void 0,
    ) { }
}

/**
 * 场景控制器抽象基类
 * 
 * 每个场景可以绑定一个控制器，用于处理场景特定的业务逻辑。
 * 子类需要实现相应的生命周期方法。
 */
export abstract class SceneController {
    private _scene: IGameFramework.Nullable<SceneContext> = null;
    private _options: SceneOptions = null!;

    /**
     * 获取所属的场景上下文
     */
    public get scene(): IGameFramework.Nullable<SceneContext> {
        return this._scene;
    }

    /** @internal */
    public _setScene(scene: IGameFramework.Nullable<SceneContext>, options: IGameFramework.Nullable<SceneOptions>): void {
        this._scene = scene;
        this._options = options ?? this._options;
    }

    /**
     * 场景资源加载完成后调用
     * 
     * 在此阶段可以执行额外的初始化工作，比如构建3D地形、生成NPC等
     */
    public async onSceneLoaded(options: SceneOptions): Promise<void> { }

    /**
     * 场景进入时调用
     * 
     * 3D根节点已挂载，UI已就绪
     */
    public async onSceneEnter(): Promise<void> { }

    /**
     * 场景每帧更新
     */
    public onSceneUpdate(dt: number): void { }

    /**
     * 场景退出前调用
     * 
     * 可以在此做清理逻辑、保存数据等
     */
    public async onSceneExit(): Promise<void> { }

    /**
     * 场景销毁后调用
     * 
     * 所有资源已释放
     */
    public onSceneDestroyed(): void { }
}

/**
 * 场景上下文
 * 
 * 封装了一个场景实例的完整信息，包括3D根节点、UI面板引用、当前阶段和控制器。
 */
export class SceneContext {
    /** 场景当前生命周期阶段 */
    public phase: ScenePhase = ScenePhase.None;

    /** 3D场景根节点 */
    public root3D: IGameFramework.Nullable<Node> = null;

    /** 3D世界根节点 */
    public worldRoot: IGameFramework.Nullable<Node> = null;

    /** 场景控制器 */
    public controller: IGameFramework.Nullable<SceneController> = null;

    /** 当前场景打开的UI视图名称集合 */
    public openedViews: Set<string> = new Set();

    /** 场景配置 */
    public readonly options: SceneOptions;

    public constructor(options: SceneOptions) {
        this.options = options;
    }
}

/**
 * SceneService 事件定义
 */
interface SceneEventOverview {
    /** 场景开始加载 */
    "scene-loading": string;
    /** 场景加载完成 */
    "scene-loaded": string;
    /** 场景进入 */
    "scene-enter": string;
    /** 场景退出 */
    "scene-exit": string;
    /** 场景销毁 */
    "scene-destroyed": string;
    /** 场景切换开始（旧场景名称） */
    "scene-switch-begin": { from: IGameFramework.Nullable<string>, to: string };
    /** 场景切换完成（新场景名称） */
    "scene-switch-end": { from: IGameFramework.Nullable<string>, to: string };
}

/**
 * 3D场景管理服务
 * 
 * 提供完整的场景生命周期管理，包括：
 * - 场景资源的加载与释放
 * - 3D场景根节点的创建与销毁
 * - 场景级别UI的打开与关闭
 * - 场景间切换（支持过渡）
 * - 场景控制器绑定
 * 
 * 场景生命周期：
 * ```
 * None → Loading → Loaded → Entering → Running → Exiting → Exited → Destroyed
 * ```
 * 
 * @example
 * ```ts
 * const sceneSvr = Container.get(SceneService)!;
 * 
 * // 加载并进入场景
 * await sceneSvr.switchScene(new SceneOptions(
 *     "BattleScene",
 *     battlePrefabHandle,
 *     [res1, res2],
 *     [{ service: BattleUIService }]
 * ), new BattleSceneController());
 * ```
 *
 * @export
 * @class SceneService
 * @extends {EventDispatcher<SceneEventOverview>}
 * @implements {IGameFramework.ISingleton}
 */
@ccclass("SceneService")
export class SceneService extends EventDispatcher<SceneEventOverview> implements IGameFramework.ISingleton {
    private _assetService: AssetService = Container.get(AssetService)!;
    private _uiService: UIService = Container.get(UIService)!;

    /** 当前激活的场景 */
    private _currentScene: IGameFramework.Nullable<SceneContext> = null;

    /** 场景缓存池（按名称索引） */
    private _sceneCache: Map<string, SceneContext> = new Map();

    /** 3D世界根节点，所有场景的3D内容挂在此节点下 */
    private _worldRoot: Node = null!;

    /** 是否正在切换场景 */
    private _switching: boolean = false;

    public get enableUpdate() {
        return true;
    }

    public get updateOrder() {
        return 10;
    }

    /**
     * 获取当前场景上下文
     */
    public get currentScene(): IGameFramework.Nullable<SceneContext> {
        return this._currentScene;
    }

    /**
     * 获取当前场景名称
     */
    public get currentSceneName(): IGameFramework.Nullable<string> {
        return this._currentScene?.options.name ?? null;
    }

    /**
     * 获取3D世界根节点
     */
    public get worldRoot(): Node {
        return this._worldRoot;
    }

    /**
     * 是否正在切换场景
     */
    public get isSwitching(): boolean {
        return this._switching;
    }

    //#region IGameFramework.ISingleton
    public onStart(args: IGameFramework.Nullable<{
        /**
         * 3D世界根节点的父节点路径
         * 
         * 默认为 "Scene" (Cocos Creator 的场景根)
         */
        worldRootParentPath?: string,

        /**
         * 3D世界根节点名称
         * 
         * 默认为 "WorldRoot"
         */
        worldRootName?: string,
    }>): void {
        const parentPath = args?.worldRootParentPath ?? "3DRoot";
        const worldRootName = args?.worldRootName ?? "WorldRoot";

        let parent: IGameFramework.Nullable<Node> = null;
        if (parentPath) {
            parent = find(parentPath);

            if (!parent) {
                parent = director.getScene();
            }
        } else {
            // 默认挂在 Scene 下
            const scene = director.getScene();
            parent = scene;
        }

        DEBUG && assert(!!parent, `SceneService: 未找到世界根节点的父节点`);

        this._worldRoot = new Node(worldRootName);
        parent!.addChild(this._worldRoot);

        logger.debug("SceneService initialized");
    }

    public onDestroy(): void {
        // 销毁所有缓存的场景
        for (const [name, ctx] of this._sceneCache) {
            this._destroySceneContext(ctx);
        }
        this._sceneCache.clear();
        this._currentScene = null;

        if (this._worldRoot && this._worldRoot.isValid) {
            this._worldRoot.destroy();
        }
        this._worldRoot = null!;
    }

    public onUpdate(): void {
        if (this._currentScene && this._currentScene.phase === ScenePhase.Running) {
            this._currentScene.controller?.onSceneUpdate(game.deltaTime);
        }
    }
    //#endregion

    /**
     * 加载场景资源（不进入场景），返回带进度的异步迭代器
     * 
     * 适用于需要显示加载进度的场景（如启动流程、Loading界面），加载完成后场景处于 Loaded 阶段。
     * 可以通过 `for await` 迭代获取实时加载进度。
     * 
     * @example
     * ```ts
     * const sceneSvr = Container.get(SceneService)!;
     * for await (const progress of sceneSvr.loadScene(options, controller)) {
     *     this._progress = progress.progress;
     *     this._message = progress.name;
     * }
     * // 加载完成后，可以通过 getSceneContext 获取场景上下文
     * const ctx = sceneSvr.getSceneContext(options.name);
     * ```
     *
     * @param {SceneOptions} options 场景配置
     * @param {SceneController} [controller] 场景控制器
     * @return {*}  {AsyncGenerator<{ name: string, progress: number }>}
     * @memberof SceneService
     */
    public async *loadScene(options: SceneOptions, controller?: SceneController): AsyncGenerator<{ name: string, progress: number }> {
        DEBUG && assert(!!options.name, "SceneService: 场景名称不能为空");

        if (this._sceneCache.has(options.name)) {
            logger.warn(`SceneService: 场景 ${options.name} 已加载，跳过重复加载`);
            yield { name: `场景 ${options.name} 已加载`, progress: 1 };
            return;
        }

        const ctx = new SceneContext(options);
        ctx.phase = ScenePhase.Loading;

        if (controller) {
            ctx.controller = controller;
            controller._setScene(ctx, options);
        }

        this.dispatch("scene-loading", options.name);

        // 汇总需要加载的资源
        const allAssets: AssetHandle<typeof Asset>[] = [...options.preloadAssets];
        if (options.scenePrefab && !options.scenePrefab.getAsset()) {
            allAssets.push(options.scenePrefab as AssetHandle<typeof Asset>);
        }

        // 通过 AssetService.loadAssets 加载并转发进度
        if (allAssets.length > 0) {
            for await (const progress of this._assetService.loadAssets(allAssets)) {
                yield progress;
            }
        }

        // 资源加载完毕，通知控制器初始化
        yield { name: `场景 ${options.name} 初始化中`, progress: 1 };

        ctx.phase = ScenePhase.Loaded;
        this._sceneCache.set(options.name, ctx);

        await ctx.controller?.onSceneLoaded(options);

        this.dispatch("scene-loaded", options.name);
        logger.debug(`SceneService: 场景 ${options.name} 加载完成`);
    }

    /**
     * 加载场景资源（不进入场景），无进度回调的简便方法
     * 
     * 内部消费 loadScene 的异步迭代器，等待全部加载完成后返回场景上下文。
     * 适合不需要展示进度的场合。
     *
     * @param {SceneOptions} options 场景配置
     * @param {SceneController} [controller] 场景控制器
     * @return {*}  {Promise<IGameFramework.Nullable<SceneContext>>}
     * @memberof SceneService
     */
    public async loadSceneAsync(options: SceneOptions, controller?: SceneController): Promise<IGameFramework.Nullable<SceneContext>> {
        for await (const _ of this.loadScene(options, controller)) {
            // 消费迭代器，等待加载完成
        }
        return this._sceneCache.get(options.name) ?? null;
    }

    /**
     * 进入已加载的场景
     * 
     * 场景必须处于 Loaded 或 Exited 阶段才能进入
     *
     * @param {string} name 场景名称
     * @return {*}  {Promise<boolean>}
     * @memberof SceneService
     */
    public async enterScene(name: string): Promise<boolean> {
        const ctx = this._sceneCache.get(name);
        if (!ctx) {
            logger.error(`SceneService: 场景 ${name} 未加载，无法进入`);
            return false;
        }

        if (ctx.phase !== ScenePhase.Loaded && ctx.phase !== ScenePhase.Exited) {
            logger.error(`SceneService: 场景 ${name} 当前阶段 ${ctx.phase}，不允许进入`);
            return false;
        }

        ctx.phase = ScenePhase.Entering;

        // 创建3D根节点
        this._createSceneRoot(ctx);

        // 自动打开UI面板
        if (ctx.options.autoOpenViews.length > 0) {
            const openPromises = ctx.options.autoOpenViews.map(async (viewConf) => {
                const view = await this._uiService.open(viewConf.service, viewConf.args);
                if (view) {
                    const key = this._uiService.getOpenViewKey(view as unknown as BaseView<BaseService>);
                    ctx.openedViews.add(key ?? view.viewName);
                }
            });
            await Promise.all(openPromises);
        }

        // 通知控制器
        await ctx.controller?.onSceneEnter();

        ctx.phase = ScenePhase.Running;
        this._currentScene = ctx;

        this.dispatch("scene-enter", name);
        logger.debug(`SceneService: 进入场景 ${name}`);

        return true;
    }

    /**
     * 退出当前场景
     * 
     * 关闭场景内的所有UI、移除3D根节点
     *
     * @param {string} name 要退出的场景名称
     * @return {*}  {Promise<boolean>}
     * @memberof SceneService
     */
    public async exitScene(name: string): Promise<boolean> {
        const ctx = this._sceneCache.get(name);
        if (!ctx) {
            logger.error(`SceneService: 场景 ${name} 不存在，无法退出`);
            return false;
        }

        if (ctx.phase !== ScenePhase.Running) {
            logger.error(`SceneService: 场景 ${name} 当前阶段 ${ctx.phase}，不在运行中，不允许退出`);
            return false;
        }

        ctx.phase = ScenePhase.Exiting;

        // 通知控制器
        await ctx.controller?.onSceneExit();

        // 关闭场景内所有UI面板
        await this._closeSceneViews(ctx);

        // 移除3D根节点（但不销毁，以便重新进入）
        this._removeSceneRoot(ctx);

        ctx.phase = ScenePhase.Exited;

        if (this._currentScene === ctx) {
            this._currentScene = null;
        }

        this.dispatch("scene-exit", name);
        logger.debug(`SceneService: 退出场景 ${name}`);

        return true;
    }

    /**
     * 销毁场景
     * 
     * 彻底释放场景的所有资源，场景不可再次进入
     *
     * @param {string} name 场景名称
     * @return {*}  {Promise<boolean>}
     * @memberof SceneService
     */
    public async destroyScene(name: string): Promise<boolean> {
        const ctx = this._sceneCache.get(name);
        if (!ctx) {
            logger.warn(`SceneService: 场景 ${name} 不存在`);
            return false;
        }

        // 如果场景还在运行，先退出
        if (ctx.phase === ScenePhase.Running) {
            await this.exitScene(name);
        }

        this._destroySceneContext(ctx);
        this._sceneCache.delete(name);

        this.dispatch("scene-destroyed", name);
        logger.debug(`SceneService: 销毁场景 ${name}`);

        return true;
    }

    /**
     * 切换场景
     * 
     * 自动处理旧场景的退出/销毁和新场景的加载/进入
     *
     * @param {SceneOptions} options 新场景配置
     * @param {SceneController} [controller] 新场景控制器
     * @return {*}  {Promise<IGameFramework.Nullable<SceneContext>>}
     * @memberof SceneService
     */
    public async switchScene(options: SceneOptions, controller?: SceneController): Promise<IGameFramework.Nullable<SceneContext>> {
        if (this._switching) {
            logger.warn("SceneService: 正在切换场景中，忽略重复请求");
            return null;
        }

        this._switching = true;
        const fromName = this._currentScene?.options.name ?? null;

        this.dispatch("scene-switch-begin", { from: fromName, to: options.name });

        try {
            // 退出并销毁旧场景
            if (this._currentScene) {
                const oldName = this._currentScene.options.name;
                if (!options.keepPrevScene) {
                    await this.destroyScene(oldName);
                } else {
                    await this.exitScene(oldName);
                }
            }

            // 加载新场景
            let ctx: SceneContext | undefined = this._sceneCache.get(options.name);
            if (!ctx) {
                ctx = (await this.loadSceneAsync(options, controller)) ?? undefined;
            }

            if (!ctx) {
                logger.error(`SceneService: 加载场景 ${options.name} 失败`);
                return null;
            }

            // 进入新场景
            await this.enterScene(options.name);

            this.dispatch("scene-switch-end", { from: fromName, to: options.name });
            logger.debug(`SceneService: 场景切换完成 ${fromName ?? "null"} → ${options.name}`);

            return ctx;
        } finally {
            this._switching = false;
        }
    }

    /**
     * 在当前场景中打开一个UI面板
     *
     * @template T
     * @template U
     * @param {IGameFramework.Constructor<T>} service 面板服务的构造函数
     * @param {*} [args] 打开面板的参数
     * @return {*}  {Promise<IGameFramework.Nullable<BaseView<T>>>}
     * @memberof SceneService
     */
    public async openSceneView<T extends BaseService<any, any, any>>(
        service: IGameFramework.Constructor<T>,
        args?: T extends BaseService<any, any, infer A> ? A : unknown,
    ): Promise<IGameFramework.Nullable<BaseView<T>>> {
        if (!this._currentScene || this._currentScene.phase !== ScenePhase.Running) {
            logger.warn("SceneService: 当前没有运行中的场景，无法打开UI");
            return null;
        }

        const view = await this._uiService.open(service, args);
        if (view) {
            const key = this._uiService.getOpenViewKey(view as unknown as BaseView<BaseService>);
            this._currentScene.openedViews.add(key ?? view.viewName);
        }
        return view;
    }

    /**
     * 在当前场景中关闭一个UI面板
     *
     * @template T
     * @template U
     * @param {IGameFramework.Constructor<T>} ctor 面板的构造函数
     * @return {*}  {Promise<boolean>}
     * @memberof SceneService
     */
    public async closeSceneView<T extends BaseView<U>, U extends BaseService>(ctor: IGameFramework.Constructor<T>): Promise<boolean> {
        if (!this._currentScene) {
            logger.warn("SceneService: 当前没有场景，无法关闭UI");
            return false;
        }

        let targetName: IGameFramework.Nullable<string> = null;
        for (const name of this._currentScene.openedViews) {
            const openedView = this._uiService.getOpenView(name);
            if (openedView instanceof ctor) {
                targetName = name;
                break;
            }
        }

        if (!targetName) {
            return false;
        }

        const result = await this._uiService.closeOrPopViewName(targetName);
        if (result) {
            this._currentScene.openedViews.delete(targetName);
        }
        return result;
    }

    /**
     * 在当前场景的3D根节点下添加子节点
     *
     * @param {Node} child 要添加的节点
     * @return {*}  {boolean}
     * @memberof SceneService
     */
    public addToScene3D(child: Node): boolean {
        if (!this._currentScene || !this._currentScene.root3D) {
            logger.warn("SceneService: 当前场景无3D根节点");
            return false;
        }

        this._currentScene.root3D.addChild(child);
        return true;
    }

    /**
     * 获取当前场景的3D根节点
     *
     * @return {*}  {IGameFramework.Nullable<Node>}
     * @memberof SceneService
     */
    public getScene3DRoot(): IGameFramework.Nullable<Node> {
        return this._currentScene?.root3D ?? null;
    }

    /**
     * 判断场景是否已加载
     *
     * @param {string} name
     * @return {*}  {boolean}
     * @memberof SceneService
     */
    public isSceneLoaded(name: string): boolean {
        const ctx = this._sceneCache.get(name);
        return !!ctx && ctx.phase !== ScenePhase.None && ctx.phase !== ScenePhase.Destroyed;
    }

    /**
     * 判断场景是否在运行中
     *
     * @param {string} name
     * @return {*}  {boolean}
     * @memberof SceneService
     */
    public isSceneRunning(name: string): boolean {
        const ctx = this._sceneCache.get(name);
        return !!ctx && ctx.phase === ScenePhase.Running;
    }

    /**
     * 获取场景上下文
     *
     * @param {string} name
     * @return {*}  {IGameFramework.Nullable<SceneContext>}
     * @memberof SceneService
     */
    public getSceneContext(name: string): IGameFramework.Nullable<SceneContext> {
        return this._sceneCache.get(name) ?? null;
    }

    /**
     * 获取当前场景中已打开的UI面板名称列表
     *
     * @return {*}  {string[]}
     * @memberof SceneService
     */
    public getOpenedViewNames(): string[] {
        if (!this._currentScene) return [];
        return Array.from(this._currentScene.openedViews);
    }

    //#region 内部方法

    /**
     * 创建场景的3D根节点
     */
    private _createSceneRoot(ctx: SceneContext): void {
        let root = ctx.root3D;
        if (root && root.isValid) {
            if (root.parent !== this._worldRoot) {
                this._worldRoot.addChild(root);
            }
            ctx.worldRoot = this._worldRoot;
            return;
        }

        if (ctx.options.scenePrefab) {
            const prefabNode = this._assetService.instantiateAsset(ctx.options.scenePrefab as AssetHandle<typeof Prefab>, true);
            if (prefabNode) {
                root = prefabNode;
                this._worldRoot.addChild(prefabNode);
            } else {
                logger.warn(`SceneService: 场景 ${ctx.options.name} 的预制体实例化失败`);
            }
        } else {
            root = new Node(`${ctx.options.name}-Root3D`);
            this._worldRoot.addChild(root);
        }

        ctx.worldRoot = this._worldRoot;
        ctx.root3D = root;
    }

    /**
     * 移除场景3D根节点（不销毁节点，用于临时退出）
     */
    private _removeSceneRoot(ctx: SceneContext): void {
        if (ctx.root3D && ctx.root3D.isValid) {
            ctx.root3D.removeFromParent();
        }
    }

    /**
     * 关闭场景中所有打开的UI面板
     */
    private async _closeSceneViews(ctx: SceneContext): Promise<void> {
        const viewNames = Array.from(ctx.openedViews);
        const closePromises = viewNames.map(async (name) => {
            try {
                await this._uiService.closeOrPopViewName(name);
            } catch (e) {
                logger.warn(`SceneService: 关闭UI ${name} 时出错`, e);
            }
        });
        await Promise.all(closePromises);
        ctx.openedViews.clear();
    }

    /**
     * 彻底销毁一个场景上下文
     */
    private _destroySceneContext(ctx: SceneContext): void {
        // 销毁3D根节点
        if (ctx.root3D && ctx.root3D.isValid) {
            ctx.root3D.removeFromParent();
            ctx.root3D.destroy();
            ctx.root3D = null;
        }

        // 释放预加载的资源引用
        if (ctx.options.scenePrefab) {
            this._assetService.releaseAsset(ctx.options.scenePrefab as AssetHandle<typeof Asset>, false);
        }

        for (const handle of ctx.options.preloadAssets) {
            this._assetService.releaseAsset(handle, false);
        }

        // 通知控制器
        ctx.controller?.onSceneDestroyed();
        ctx.controller?._setScene(null, null);
        ctx.controller = null;

        ctx.phase = ScenePhase.Destroyed;
    }

    //#endregion
}
