import { Container } from "../core/container";
import { logger } from "../core/log";
import { Deferred, isDestroyed, isPromise } from "../core/misc";
import { Component, EventKeyboard, UIOpacity, Widget, _decorator } from "cc";
import { UIService } from "../services/ui-service";
import { BaseService } from "./base-service";
import { type BaseView } from "./base-view";
import { bindingAndFixSpecialShapedScreen } from "./binding-and-fix-special-shaped-screen";
const { ccclass, property, menu } = _decorator;

/**
 * 视图组件基类
 * 
 * bindingAndFixSpecialShapedScreen的时候会逐级向下扫描所有的集成了BaseViewComponent的组件，并把祖试图也就是BaseView的实例注入进来
 *
 * @export
 * @abstract
 * @class BaseViewComponent
 * @extends {Component}
 */
@ccclass("BaseViewComponent")
@menu("GameFramework/ViewState/BaseViewComponent")
export abstract class BaseViewComponent<U extends BaseService, T extends BaseView<U>, S = any> extends Component {
    /**
     * 组件所在的祖视图
     *
     * @private
     * @type {T}
     * @memberof BaseViewComponent
     */
    protected _view: T = null!;
    protected _canBindingFix: boolean = true;
    protected _canCloseSelf: boolean = false;
    protected _closeDeferred: Deferred<void> | null = null;
    protected _viewComponents: BaseViewComponent<U, T>[] = [];
    private _viewCloseAfterPromise: IGameFramework.Nullable<Promise<IGameFramework.Nullable<S>>>;
    private _viewCloseAfterResolve: IGameFramework.Nullable<(r: IGameFramework.Nullable<any>) => void>;

    /**
     * 面板关闭后通知
     *
     * @template R
     * @param {IGameFramework.Nullable<R>} r
     * @return {*}  {void}
     * @memberof BaseViewComponent
     */
    public applyViewCloseAfter(r: IGameFramework.Nullable<S>): void {
        if (!this._viewCloseAfterResolve) {
            return;
        }

        this._viewCloseAfterResolve!(r);
        this._viewCloseAfterResolve = null;
        this._viewCloseAfterPromise = null;
    }

    /**
     * 等待组件关闭后处理
     *
     * @return {*}  {Promise<IGameFramework.Nullable<S>>}
     * @memberof BaseViewComponent
     */
    public async viewCloseAfter(): Promise<IGameFramework.Nullable<S>> {
        if (this.isDisposed) {
            logger.warn(`${this.constructor.name} 已销毁, 无法在调用viewCloseAfter`);
            return Promise.resolve(null);
        }

        if (this._viewCloseAfterPromise) return this._viewCloseAfterPromise;
        return this._viewCloseAfterPromise = new Promise<IGameFramework.Nullable<S>>(resolve => {
            this._viewCloseAfterResolve = resolve;
        });
    }

    /**
     * 如果你的组件是单独的prefab组件,那么你可以设置这个属性为true
     * 
     * 单独的prefab一般是实例化后动态添加到view中，在view实例化的时候，这个组件并没有实例化，所以view无法自动绑定该prefab上的component
     *
     * @readonly
     * @memberof BaseViewComponent
     */
    @property
    public get asyncBinding() {
        return this._asyncBinging;
    }

    public set asyncBinding(asyncBinding: boolean) {
        this._asyncBinging = asyncBinding;
    }

    public get isDisposed(): boolean {
        return isDestroyed(this.node);
    }

    public get viewComponents() {
        return this._viewComponents;
    }

    @property protected _asyncBinging: boolean = false;


    @property
    public get fixSpecialShapedScreenHasCache() {
        return this._fixSpecialShapedScreenHasCache;
    }

    public set fixSpecialShapedScreenHasCache(value: boolean) {
        this._fixSpecialShapedScreenHasCache = value;
    }

    protected _fixSpecialShapedScreenHasCache = true;

    public enableKeyboard() {
        const uiService = Container.get(UIService)!;
        uiService.enableKeyboard(this);
    }

    public disableKeyboard() {
        const uiService = Container.get(UIService)!;
        uiService.disableKeyboard(this);
    }

    public set view(view: T) {
        this._view = view;
    }

    public get view() {
        return this._view;
    }

    /**
     * 组件所在的视图服务
     *
     * @readonly
     * @public
     * @memberof BaseViewComponent
     */
    public get service() {
        return this._view.service;
    }

    /**
     * 关闭视图而不是自身
     * 
     * 关闭自身请使用close方法
     *
     * @protected
     * @memberof BaseViewComponent
     */
    protected async closeView() {
        await this._view.close();
    }

    public async close() {
        if (this.isDisposed) {
            return;
        }

        if (this._closeDeferred) {
            return this._closeDeferred?.promise;
        }

        this._closeDeferred = new Deferred<void>();
        let r: IGameFramework.Nullable<S> = null;
        if (this._canCloseSelf) {
            r = await this.onClose?.();
        }

        const deferred = this._closeDeferred;
        this.node.removeFromParent();
        this.applyViewCloseAfter(r);
        this.node.destroy();
        deferred?.fulfilled();
        this._closeDeferred = null;
    }

    public afterAddChild() {
        this._handleAfterAddChild(false).catch((err) => {
            logger.error("BaseViewComponent afterAddChild error:", err);
        });
    }

    public async asyncAfterAddChild() {
        await this._handleAfterAddChild(true);
    }

    private async _handleAfterAddChild(withPreload: boolean): Promise<void> {
        if (!this._asyncBinging || !this._view || !this._canBindingFix) return;

        // 不允许二次绑定
        this._canBindingFix = false;

        const safeArea = Container.get(UIService)!.getSafeArea();
        bindingAndFixSpecialShapedScreen(this, safeArea, this._view, this._fixSpecialShapedScreenHasCache ? new Map() : void 0);

        // 对于直接在view所在的prefab上的组件，是不会被调用afterAddChild的。在view中会自动调用所有实现了onShow函数的组件
        // 但是对于动态prefab实例化出来的组件，是会调用组件的afterAddChild的，所以这里需要手动调用onShow
        if (!this.onShow) {
            return;
        }

        const widget = this.node.getComponent(Widget);
        const needWaitNextFrame = widget && (!widget.isAbsoluteLeft || !widget.isAbsoluteTop || !widget.isAbsoluteRight || !widget.isAbsoluteBottom);

        const runOnShow = async () => {
            if (withPreload && this.preloadAssets) {
                await this.preloadAssets();
            }

            const result = this.onShow!();
            if (result && isPromise(result)) {
                result.catch((err) => {
                    logger.error("BaseViewComponent onShow error:", err);
                });
            }
        };

        if (needWaitNextFrame) {
            let add = false;
            let sourceValue = 255;
            let uiOpacity = this.node.getComponent(UIOpacity);
            if (uiOpacity) {
                sourceValue = uiOpacity.opacity;
            } else {
                uiOpacity = this.node.addComponent(UIOpacity);
                add = true;
            }

            uiOpacity.opacity = 0;

            await this._view.service.taskSvr.waitNextFrame();
            if (this.isDisposed) {
                return;
            }

            uiOpacity.opacity = sourceValue;
            if (add) {
                uiOpacity.destroy();
            }

            await runOnShow();
        } else {
            await runOnShow();
        }
    }

    /**
     * 显示所有子组件
     *
     * @memberof BaseViewComponent
     */
    public childComponentsShow(): void {
        this._viewComponents.forEach(component => {
            component.onShow?.();
        });
    }

    /**
    * 键盘按下事件，总是从顶部面板往下传递
    * 
    * @example
    * 
    * ---root        4
    *   ---panel1    3
    *    ---panel2   2
    *   ---panel3    1
    *
    * @protected
    * @param {EventKeyboard} event
    * @memberof BaseView
    */
    public onKeyDown(event: EventKeyboard): void {

    }

    /**
     * 键盘抬起事件，总是从顶部面板往下传递
     *
     * @public
     * @param {EventKeyboard} event
     * @memberof BaseView
     */
    public onKeyUp(event: EventKeyboard): void {

    }

    /**
     * 键盘长按事件，总是从顶部面板往下传递
     *
     * @public
     * @param {EventKeyboard} event
     * @memberof BaseView
     */
    public onKeyPressing(event: EventKeyboard): void {

    }

    /**
     * 预加载资源
     *
     * @memberof BaseViewComponent
     */
    public async preloadAssets?(): Promise<void>;

    /**
     * 视图组件的初始化
     *
     * @memberof BaseViewComponent
     */
    public onShow?(): Promise<void> | void;

    /**
     * 视图组件的销毁
     *
     * @memberof BaseViewComponent
     */
    public async onClose?(): Promise<S>;
}
