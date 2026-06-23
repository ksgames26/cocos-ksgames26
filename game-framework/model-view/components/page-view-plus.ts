import { _decorator, Event, EventTouch, Node, NodeEventType, PageView, sys, Vec2, Vec3, XrUIPressEventType } from "cc";
import { ScrollViewPlus } from "./scroll-view-plus";
const { ccclass, menu } = _decorator;

const temp = new Vec2();
const deltaPos = new Vec3();
const deltaPos1 = new Vec3();

/**
 * 页面视图增强版
 * 
 * 当前实现支持:
 * 
 * @example
 * ```
 * [√] PageViewPlus 嵌套 ScollViewPlus 组件。 支持外部PageViewPlus的左右滑动嵌套的ScollViewPlus组件上下滑动。
 * [x] PageViewPlus 嵌套 ScollViewPlus 组件。 支持外部PageViewPlus的上下滑动嵌套的ScollViewPlus组件左右滑动。
 * [x] PageViewPlus 嵌套 PageViewPlus 组件。  支持外部PageViewPlus的左右滑动嵌套的PageViewPlus组件上下滑动。
 * [x] PageViewPlus 嵌套 PageViewPlus 组件。  支持外部PageViewPlus的上下滑动嵌套的PageViewPlus组件左右滑动。
 * [x] ScollViewPlus 嵌套 PageViewPlus 组件。 支持外部ScollViewPlus的左右滑动嵌套的PageViewPlus组件上下滑动。
 * [x] ScollViewPlus 嵌套 PageViewPlus 组件。 支持外部ScollViewPlus的上下滑动嵌套的PageViewPlus组件左右滑动。
 * [x] ScollViewPlus 嵌套 ScollViewPlus 组件。支持外部ScollViewPlus的左右滑动嵌套的ScollViewPlus组件上下滑动。
 * [x] 支持任意的两者之间互相嵌套。只需要相邻节点的滑动方向不一致就形
 *
 * ```
 * @export
 * @class PageViewPlus
 * @extends {PageView}
 */
@ccclass("PageViewPlus")
@menu("GameFramework/ViewState/PageViewPlus")
export class PageViewPlus extends PageView {

    private _allScrllViewChildren: ScrollViewPlus[] = [];
    private _benignTouch: IGameFramework.Nullable<ScrollViewPlus> = null;
    private _firstDirection: "up" | "down" | "leftRight" = "leftRight";
    private _firstAdjust = true;

    // modify by wanghanbin 
    // 为了兼容slider嵌入到scrollview中，必现重新注册事件
    // 不使用捕获
    // 而是冒泡
    protected _registerEvent(): void {
        const self = this;
        const node = self.node;
        node.on(NodeEventType.TOUCH_START, self._onTouchBegan, self);
        node.on(NodeEventType.TOUCH_MOVE, self._onTouchMoved, self);
        node.on(NodeEventType.TOUCH_END, self._onTouchEnded, self);
        node.on(NodeEventType.TOUCH_CANCEL, self._onTouchCancelled, self);
        node.on(NodeEventType.MOUSE_WHEEL, self._onMouseWheel, self);

        if (sys.isXR) {
            node.on(XrUIPressEventType.XRUI_HOVER_ENTERED, self._xrHoverEnter, self);
            node.on(XrUIPressEventType.XRUI_HOVER_EXITED, self._xrHoverExit, self);
        }
    }

    // modify by wanghanbin 
    // 为了兼容slider嵌入到scrollview中，必现重新注册事件
    // 不使用捕获
    // 而是冒泡
    protected _unregisterEvent(): void {
        const self = this;
        const node = self.node;
        node.off(NodeEventType.TOUCH_START, self._onTouchBegan, self);
        node.off(NodeEventType.TOUCH_MOVE, self._onTouchMoved, self);
        node.off(NodeEventType.TOUCH_END, self._onTouchEnded, self);
        node.off(NodeEventType.TOUCH_CANCEL, self._onTouchCancelled, self);
        node.off(NodeEventType.MOUSE_WHEEL, self._onMouseWheel, self);

        if (sys.isXR) {
            node.off(XrUIPressEventType.XRUI_HOVER_ENTERED, self._xrHoverEnter, self);
            node.off(XrUIPressEventType.XRUI_HOVER_EXITED, self._xrHoverExit, self);
        }
    }

    protected _onTouchMoved(event: EventTouch, captureListeners: any): void {
        if (this._benignTouch) {
            const uiTrans = this._benignTouch.content!._uiProps.uiTransformComp;
            if (uiTrans!.isHit(event.getUILocation())) {

                const touch = event.touch!;
                this._getLocalAxisAlignDelta(deltaPos, touch);
                deltaPos1.add(deltaPos);

                const realMove = deltaPos1;
                this._clampDelta(realMove);

                temp.set(realMove.x, realMove.y);
                realMove.x = 0;
                realMove.y = 0;

                if (this._firstAdjust) {
                    if (temp.x == 0) {
                        if (temp.y > 0) { // up
                            this._firstDirection = "up";
                        } else if (temp.y < 0) { // down
                            this._firstDirection = "down";
                        }
                    } else {
                        this._firstDirection = "leftRight";
                    }

                    this._firstAdjust = false;
                }

                if (this._firstDirection == "leftRight") {
                    this._move(event, captureListeners);
                }
                return;
            }
        }

        this._move(event, captureListeners);
    }

    protected _hasNestedViewGroup(event: Event, captureListeners?: Node[]): boolean {
        return false;
    }

    protected _onTouchBegan(event: EventTouch, captureListeners: any): void {
        for (let i = 0, len = this._allScrllViewChildren.length; i < len; ++i) {
            let scrollView = this._allScrllViewChildren[i];
            const uiTrans = scrollView.content!._uiProps.uiTransformComp;
            if (uiTrans!.isHit(event.getUILocation())) {
                this._benignTouch = scrollView;
                break;
            }
        }
        super._onTouchBegan(event, captureListeners);
    }

    protected _onTouchEnded(event: EventTouch, captureListeners: any): void {
        this._benignTouch = null;
        this._firstAdjust = true;
        super._onTouchEnded(event, captureListeners);
    }

    protected _onTouchCancelled(event: EventTouch, captureListeners: any): void {
        this._benignTouch = null;
        this._firstAdjust = true;

        super._onTouchCancelled(event, captureListeners);
    }

    protected _initPages(): void {
        super._initPages();
        this._allScrllViewChildren = this.node.getComponentsInChildren(ScrollViewPlus);
    }

    private _move(event: EventTouch, captureListeners: any): void {
        event.propagationStopped = true;

        if (!this.enabledInHierarchy || !this._content) {
            return;
        }

        if (this._hasNestedViewGroup(event, captureListeners)) {
            return;
        }

        const touch = event.touch!;
        this._handleMoveLogic(touch);

        if (!this.cancelInnerEvents) {
            return;
        }

        this._stopPropagationIfTargetIsMe(event);
    }
}