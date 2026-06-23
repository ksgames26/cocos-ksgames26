import { getWindowSize } from "../../core/misc";
import { clamp } from 'cc';
import { _decorator, Component, EventTouch, Node, UITransform, Vec2, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DraggableNode')
export class DraggableNode extends Component {
    private _isDragging: boolean = false;
    private _startPosition: Vec3 = new Vec3();
    private _startTouchPosition: Vec3 = new Vec3();

    private _screenWidth: number = 0;
    private _screenHeight: number = 0;
    private _hasMove: boolean = false;

    private _callback: Function = () => { };

    public setCallback(callback: Function) {
        this._callback = callback;
    }

    public onLoad() {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);

        // 获取屏幕尺寸
        const screenSize = getWindowSize();
        this._screenWidth = screenSize.width;
        this._screenHeight = screenSize.height;

        // 获取节点的 UITransform 组件
        const uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) return;

        // 计算节点的半宽和半高
        const halfWidth = uiTransform.width / 2;

        this.node.position = new Vec3(-this._screenWidth / 2 + halfWidth, 0, 1.0);
    }

    public setRandomPosition() {
        // 获取节点的 UITransform 组件
        const uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) return;

        // 计算节点的半宽和半高
        const halfWidth = uiTransform.width / 2;
        const halfHeight = uiTransform.height / 2;

        // 生成随机位置
        const randomX = Math.random() * (this._screenWidth - uiTransform.width) - (this._screenWidth / 2 - halfWidth);
        const randomY = Math.random() * (this._screenHeight - uiTransform.height) - (this._screenHeight / 2 - halfHeight);

        // 设置节点位置
        this.node.position = new Vec3(randomX, randomY, this.node.position.z);
    }

    public onTouchStart(event: EventTouch) {
        this._isDragging = true;
        this._hasMove = false;
        this._startPosition.set(this.node.position);
        event.getUILocation(this._startTouchPosition as unknown as Vec2);
    }

    public onTouchMove(event: EventTouch) {
        if (!this._isDragging) return;

        this._hasMove = true;

        const touchPos = event.getUILocation();
        const delta = new Vec3(
            touchPos.x - this._startTouchPosition.x,
            touchPos.y - this._startTouchPosition.y,
            0
        );

        let newPos = new Vec3(
            this._startPosition.x + delta.x,
            this._startPosition.y + delta.y,
            this._startPosition.z
        );

        // 获取节点的 UITransform 组件
        const uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) return;

        // 计算节点的半宽和半高
        const halfWidth = uiTransform.width / 2;
        const halfHeight = uiTransform.height / 2;

        newPos.x = clamp(newPos.x, -this._screenWidth / 2 + halfWidth, this._screenWidth / 2 - halfWidth);
        newPos.y = clamp(newPos.y, -this._screenHeight / 2 + halfHeight, this._screenHeight / 2 - halfHeight);

        this.node.position = newPos;
    }

    public onTouchEnd() {
        if (!this._hasMove && this._callback) {
            this._callback();
        }

        this._hasMove = false;
        this._isDragging = false;
    }
}