import { Component, Node, Vec3, _decorator } from "cc";
import { EDITOR } from "cc/env";
const { ccclass, property } = _decorator;

/**
 * 俯视图 (Top View):
 *      
 *   z
 *   ↑
 *   |    o Camera
 *   |   /
 *   |  /  30°
 *   | /
 *   |/
 *   o--------→ x
 * Target
 *
 * 侧视图 (Side View):
 *   
 *   y     o Camera
 *   ↑    /
 *   |   / 45°
 *   |  /
 *   | /
 *   |/
 *   o--------→ z
 * Target
 *
 * @export
 * @class FollowLook
 * @extends {Component}
 */
@ccclass("Camera/D3Camera/FollowLook")
export class FollowLook extends Component {
    @property private _lockAt: IGameFramework.Nullable<Node> = null!;
    @property({ type: Node, tooltip: EDITOR ? "跟随目标" : "" })
    get lockAt(): IGameFramework.Nullable<Node> {
        return this._lockAt;
    }
    set lockAt(value: IGameFramework.Nullable<Node>) {
        this._lockAt = value;
        if (value) {
            this.setupInitialPosition();
        }
    }

    @property private _distance: number = 15;
    @property({ tooltip: EDITOR ? '跟随距离' : "" })
    get distance(): number {
        return this._distance;
    }
    set distance(value: number) {
        this._distance = value;
        if (this._lockAt) {
            this.setupInitialPosition();
        }
    }

    @property private _angle: number = 45;
    @property({ tooltip: EDITOR ? '垂直视角角度' : "" })
    get angle(): number {
        return this._angle;
    }
    set angle(value: number) {
        this._angle = value;
        if (this._lockAt) {
            this.setupInitialPosition();
        }
    }

    @property private _horizontalAngle: number = 45;
    @property({ tooltip: EDITOR ? '水平旋转角度' : "" })
    get horizontalAngle(): number {
        return this._horizontalAngle;
    }
    set horizontalAngle(value: number) {
        this._horizontalAngle = value;
        if (this._lockAt) {
            this.setupInitialPosition();
        }
    }

    @property private _ollowDamping: number = 0.2;
    @property({
        tooltip: EDITOR ? '跟随阻尼系数\n数字越小相机越灵敏 越大越迟顿' : "",
        range: [0, 1],
        step: 0.1,
        slide: true
    })
    get followDamping(): number {
        return this._ollowDamping;
    }
    set followDamping(value: number) {
        this._ollowDamping = value;
    }

    protected _targetPos: Vec3 = new Vec3();
    protected _currentPos: Vec3 = new Vec3();
    protected _offset: Vec3 = new Vec3();

    protected start(): void {
        if (!this._lockAt) {
            console.warn("FollowLook: No target to follow");
            return;
        }
        this.setupInitialPosition();
    }

    /**
     * 设置相机的初始位置和角度
     */
    private setupInitialPosition(): void {
        if (!this._lockAt) return;

        // 1. 转换角度为弧度
        // 垂直角度转弧度
        const verticalRad = Math.PI * this._angle / 180;
        // 水平角度转弧度
        const horizontalRad = Math.PI * this._horizontalAngle / 180;

        // 2. 计算垂直偏移
        // 在水平面上的投影长度
        const verticalDistance = this._distance * Math.cos(verticalRad);
        // 垂直高度
        const y = this._distance * Math.sin(verticalRad);

        // 3. 计算水平偏移
        // 水平X轴偏移
        const x = verticalDistance * Math.sin(horizontalRad);
        // 水平Z轴偏移  
        const z = -verticalDistance * Math.cos(horizontalRad);

        this._offset.set(x, y, z);

        // 设置相机位置
        const targetPos = this._lockAt.worldPosition;
        const cameraPos = new Vec3(
            targetPos.x + this._offset.x,
            targetPos.y + this._offset.y,
            targetPos.z + this._offset.z
        );
        this.node.setWorldPosition(cameraPos);

        // 让相机看向目标
        this.node.lookAt(targetPos);
    }

    protected lateUpdate(dt: number): void {
        if (!this._lockAt) return;

        // 计算目标位置（基于目标位置和偏移量）
        const targetPos = this._lockAt.worldPosition;
        this._targetPos.set(
            targetPos.x + this._offset.x,
            targetPos.y + this._offset.y,
            targetPos.z + this._offset.z
        );

        // 获取当前相机位置并平滑移动
        this.node.getWorldPosition(this._currentPos);
        Vec3.lerp(this._currentPos, this._currentPos, this._targetPos, this._ollowDamping);
        this.node.setWorldPosition(this._currentPos);
    }

    /**
     * 设置相机参数
     */
    public setup(params: {
        distance?: number,
        angle?: number,
        horizontalAngle?: number,
        damping?: number
    }): void {
        if (params.distance !== undefined) this._distance = params.distance;
        if (params.angle !== undefined) this._angle = params.angle;
        if (params.horizontalAngle !== undefined) this._horizontalAngle = params.horizontalAngle;
        if (params.damping !== undefined) this._ollowDamping = params.damping;

        this.setupInitialPosition();
    }
}