import { _decorator, Event, Node, NodeEventType, ScrollView, sys, XrUIPressEventType } from "cc";
const { ccclass } = _decorator;

@ccclass("ScrollViewPlus")
export class ScrollViewPlus extends ScrollView {

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

    protected _hasNestedViewGroup(event: Event, captureListeners?: Node[]): boolean {
        return false;
    }
}