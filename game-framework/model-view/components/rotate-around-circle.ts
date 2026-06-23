import { CCInteger, Component, Node, _decorator } from "cc";
import { DEV } from "cc/env";
const { ccclass, property, playOnFocus, executeInEditMode } = _decorator;

@ccclass('RotateAroundCircle')
@executeInEditMode
@playOnFocus
export class RotateAroundCircle extends Component {
    @property({ type: CCInteger, tooltip: DEV ? "radiusX和radiusY一至则为圆形运动,否则为椭圆运动" : "" }) radiusX: number = 100; // 旋转半径  
    @property({ type: CCInteger, tooltip: DEV ? "radiusX和radiusY一至则为圆形运动,否则为椭圆运动" : "" }) radiusY: number = 100; // 旋转半径  
    @property speed: number = 130; // 旋转速度（度/秒）  
    @property(Node) rotateNode: Node = null!;
    @property(Node) centerNode: Node = null!;

    private _angle: number = 0; // 当前角度  

    public update(dt: number) {
        if (this.rotateNode == null || this.centerNode == null) return;

        this._angle += this.speed * dt;
        const centerX = this.centerNode.position.x;
        const centerY = this.centerNode.position.y;
        const x = centerX + this.radiusX * Math.cos(this._angle * Math.PI / 180);
        const y = centerY + this.radiusY * Math.sin(this._angle * Math.PI / 180);

        this.rotateNode.setPosition(x, y);
    }
}