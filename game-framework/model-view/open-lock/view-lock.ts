import { Container } from "../../core/container";
import { logger } from "../../core/log";
import { js, Node, Prefab } from "cc";
import { AssetHandle } from "../../services/asset-service";
import { OpenViewOptions, UIService } from "../../services/ui-service";
import { BaseService } from "../base-service";
import { BaseView } from "../base-view";
import { BaseViewComponent } from "../base-view-component";

type ServiceViewArgs<T extends BaseService> = T extends BaseService<any, any, infer A> ? A : unknown;

/**
 * ViewComponentLock 是一个管理视图组件锁定状态的类。
 *
 * @export
 * @class ViewComponentLock
 * @template T
 * @template S
 */
export class ViewComponentLock<T extends BaseView<BaseService>, S extends BaseViewComponent<BaseService, T>> {
    private _canOpen: boolean = true;
    private _component: IGameFramework.Nullable<S> = null;
    private _prefab: AssetHandle<typeof Prefab>;
    private _parent: IGameFramework.Nullable<Node>;
    private _view: IGameFramework.Nullable<T>;

    public constructor(prefab: AssetHandle<typeof Prefab>, parent?: Node, view?: T) {
        this._prefab = prefab;
        this._parent = parent!;
        this._view = view!;
    }

    public get componentCanOpen() {
        return this._canOpen;
    }

    public get component() {
        return this._component;
    }

    public async openComponent(view?: T, parent?: Node): Promise<IGameFramework.Nullable<S>> {
        if (!this._canOpen) {
            logger.warn("Component is locking, cannot open component");
            return;
        }

        this._canOpen = false;

        const uiSvr = Container.get(UIService)!;
        if (!uiSvr) {
            logger.error("UIService instance is null");

            this._canOpen = true;
            return;
        }

        const p = parent ?? this._parent;
        const v = view ?? this._view;

        if (!p || !v) {
            logger.error("Parent node or view is null");

            this._canOpen = true;
            return;
        }

        const isLoad = this._prefab.getAsset();
        if (!isLoad) {
            await this._prefab.safeGetAsset();
        }

        this._component = await uiSvr.asyncAppendComponent<BaseView<BaseService>, BaseService, S>(v, this._prefab, p);
        if (this._component) {
            this._component.node.on(Node.EventType.NODE_DESTROYED, () => {
                this._canOpen = true;
            }, this);
        } else {
            this._canOpen = true;
        }

        return this._component;
    }

    public async closeComponent(): Promise<void> {
        if (this._component) {
            await this._component.close();
            this._component = null!;
        }
    }

    public clear(): void {
        this._component = null!;
    }
}


/**
 * ViewLock 是一个管理视图锁定状态的类。
 *
 * 默认模式下，它用于防止同一视图重复打开。
 * 当 `enableRefCount` 为 `true` 时，会切换为引用计数模式：
 * - 多次 `openView()` 会复用同一个视图实例
 * - 多次 `closeView()` 会递减引用，直到计数归零才真正关闭
 *
 * 这个模式适合等待态、全局遮罩这类“单例复用视图”。
 *
 * @export
 * @class ViewLock
 */
export class ViewLock<S extends BaseService, StreamTaskReturn> {
    private _canOpen: boolean = true;
    private _enableRefCount: boolean = false;
    private _openingTask: Promise<IGameFramework.Nullable<BaseView<S, StreamTaskReturn>>> | null = null;
    private _options: OpenViewOptions<ServiceViewArgs<S>>;
    private _isOpening: boolean = false;
    private _refCount: number = 0;
    private _service: S;
    private _nodeDestroyClear: Node;
    private _shouldCloseAfterOpen: boolean = false;
    private _view: BaseView<S, StreamTaskReturn> | null = null;

    private _beforeTask: (args?: ServiceViewArgs<S>) => Promise<IGameFramework.Nullable<ServiceViewArgs<S>>> = null!;
    public set beforeTask(task: (args?: ServiceViewArgs<S>) => Promise<IGameFramework.Nullable<ServiceViewArgs<S>>>) {
        this._beforeTask = task;
    }

    public constructor(
        service: S,
        options?: OpenViewOptions<ServiceViewArgs<S>>,
        nodeDestroyClear?: Node,
        lockOptions?: {
            /**
             * 是否启用引用计数模式。
             *
             * 启用后，已打开或打开中的视图会被复用，
             * 直到所有调用方都执行了 `closeView()` 才会真正关闭。
             */
            enableRefCount?: boolean;
        },
    ) {
        this._service = service;
        const serviceOptions = service.viewOptions() as OpenViewOptions<ServiceViewArgs<S>>;
        this._options = options ?? serviceOptions;
        this._nodeDestroyClear = nodeDestroyClear ?? null!;
        this._enableRefCount = !!lockOptions?.enableRefCount;

        if (this._nodeDestroyClear) {
            this._nodeDestroyClear.on(Node.EventType.NODE_DESTROYED, this.clear, this);
        }
    }

    public get viewCanOpen() {
        return this._canOpen;
    }

    public get view() {
        return this._view;
    }

    public get hasView() {
        return this._view !== null;
    }

    public get isOpening() {
        return this._isOpening;
    }

    public get refCount() {
        return this._refCount;
    }

    public async openView(args?: ServiceViewArgs<S>): Promise<IGameFramework.Nullable<BaseView<S, StreamTaskReturn>>> {
        if (this._enableRefCount && this._view && !this._view.isDisposed) {
            this._refCount++;
            return this._view;
        }

        if (this._enableRefCount && this._openingTask) {
            this._refCount++;
            return await this._openingTask;
        }

        if (!this._canOpen) {
            logger.warn("View is locking, cannot open view");
            return;
        }

        this._canOpen = false;
        if (this._enableRefCount) {
            this._refCount++;
            this._shouldCloseAfterOpen = false;
            this._openingTask = this.doOpenView(args);
            try {
                return await this._openingTask;
            } finally {
                this._openingTask = null;
            }
        }

        return await this.doOpenView(args);
    }

    public async closeView(): Promise<void> {
        if (this._enableRefCount) {
            if (this._refCount > 0) {
                this._refCount--;
            }

            if (this._refCount > 0) {
                return;
            }

            if (this._isOpening && !this._view) {
                this._shouldCloseAfterOpen = true;
                return;
            }
        }

        if (this._view) {
            await this._view.close();
            this._view = null;
        }
    }

    private async doOpenView(args?: ServiceViewArgs<S>): Promise<IGameFramework.Nullable<BaseView<S, StreamTaskReturn>>> {
        const uiSvr = Container.get(UIService)!;
        if (!uiSvr) {
            logger.error("UIService instance is null");
            this._canOpen = true;
            this._refCount = 0;
            return;
        }

        this._isOpening = true;
        this._options.args = undefined;
        if (this._beforeTask) {
            const result = await this._beforeTask(args);
            if (result !== undefined) {
                this._options.args = result;
            }
        } else if (args !== undefined) {
            this._options.args = args;
        }

        try {
            const view = await uiSvr.openView(this._options, this._service);
            this._view = view ?? null;
            if (view) {
                view.viewCloseAfter().then(() => {
                    this._view = null;
                    this._canOpen = true;
                    this._refCount = 0;
                    this._shouldCloseAfterOpen = false;
                });

                if (this._enableRefCount && (this._shouldCloseAfterOpen || this._refCount <= 0)) {
                    this._shouldCloseAfterOpen = false;
                    this._refCount = 0;
                    await view.close();
                }
            } else {
                this._canOpen = true;
                this._refCount = 0;
                this._shouldCloseAfterOpen = false;
            }

            return view ?? null;
        } finally {
            this._isOpening = false;
        }
    }

    public clear(): void {
        this._view = null!;
        this._options?.dispose();
        this._options = null!;
        this._service = null!;
        this._nodeDestroyClear = null!;
        this._beforeTask = null!;
        this._openingTask = null;
        this._refCount = 0;
        this._isOpening = false;
        this._canOpen = true;
        this._shouldCloseAfterOpen = false;
    }
}

/**
 * 检查是否有任何视图当前正在打开
 * 
 * 只要有一个正在打开的面板，就返回true，表示有面板正在打开
 * 
 * @param viewLocks 
 * @returns
 */
export const hasOpeningView = <S extends BaseService>(viewLocks: ViewLock<S, any>[]) => {
    return viewLocks.some(lock => !lock.viewCanOpen);
};

/**
 * 检查是否有任何视图当前正在打开
 * 
 * 只要有一个正在打开的组件，就返回true，表示有视图组件正在打开
 * 
 * @param viewLocks 
 * @returns 
 */
export const hasOpeningComponent = <T extends BaseView<BaseService>, S extends BaseViewComponent<BaseService, T>>(viewLocks: ViewComponentLock<T, S>[]) => {
    return viewLocks.some(lock => !lock.componentCanOpen);
};

/**
 * 
 * 是否可以打开某个面板
 * 
 * 假设有AB三个面板互斥
 * 
 * 1. 当前打开A，点击打开B，则关闭A，打开B
 * 2. 当前打开A，点击打开A，则不操作
 * 3. 当前没有打开任何面板，点击打开A，则打开A
 * 4. 当前打开A，A正在打开但还未打开，则不操作 （防止重复点击）
 * 5. 当前打开A，B正在打开但还未打开，则不操作
 * 
 * @param openLock 
 * @param viewLocks 
 * @param view 
 * @param viewName 
 * @param args 
 * @returns 
 */
export const canOpenView = async <S extends BaseService>(
    openLock: ViewLock<S, any>,
    viewLocks: ViewLock<S, any>[],
    view: BaseView<BaseService<{}, { [key: string]: any; }>, any>,
    viewName: string,
    args?: ServiceViewArgs<S>
): Promise<boolean | BaseView<S, any>> => {
    // 我是否可以打开
    if (!openLock.viewCanOpen) {
        return false;
    }

    if (view && view.viewName === viewName) {
        return false;
    }

    const filter = viewLocks.filter(lock => lock !== openLock);
    const hasOpening = hasOpeningView(filter);
    if (hasOpening) {
        if (view) {
            // 异步打开面板，要先打开新面板，再关闭需要关闭的面板。这样可以避免首次加载时间差造成的问题
            const nView = await openLock.openView(args);
            await view.close();
            return nView ?? false;
        }
        return false;
    }

    if (view) {
        await view.close();
    }

    return true;
};


/**
 * 
 * 是否可以打开某个视图组件
 * 
 * 假设有AB三个视图组件互斥
 * 
 * 1. 当前打开A，点击打开B，则关闭A，打开B
 * 2. 当前打开A，点击打开A，则不操作
 * 3. 当前没有打开任何视图组件，点击打开A，则打开A
 * 4. 当前打开A，A正在打开但还未打开，则不操作 （防止重复点击）
 * 5. 当前打开A，B正在打开但还未打开，则不操作
 * 
 * @param openLock 
 * @param componentLocks 
 * @param component 
 * @param componentName 
 * @returns 
 */
export const canOpenComponent = async <T extends BaseView<BaseService>, S extends BaseViewComponent<BaseService, T>>(
    openLock: ViewComponentLock<T, S>,
    componentLocks: ViewComponentLock<T, S>[],
    component: S,
    componentName: string
): Promise<boolean | S> => {
    // 我是否可以打开
    if (!openLock.componentCanOpen) {
        return false;
    }

    if (component && js.getClassName(component) === componentName) {
        return false;
    }

    const filter = componentLocks.filter(lock => lock !== openLock);
    const hasOpening = hasOpeningComponent(filter);
    if (hasOpening) {
        if (component) {

            // 异步打开组件，要先打开新组件，再关闭需要关闭的组件。这样可以避免首次加载时间差造成的问题
            const nComponent = await openLock.openComponent();
            await component.close();
            return nComponent ?? false;
        }
        return false;
    }

    if (component) {
        await component.close();
    }

    return true;
};
