import { Component, Label, Tween, Vec3, _decorator, randomRangeInt, tween, v3 } from "cc";
import { bezier } from "../../../utils/math";
import { ObjectPools } from "../../../utils/object-pool";
const { ccclass } = _decorator;

const temp = v3();

@ccclass("PopupLabel")
export class PopupLabel extends Component implements IGameFramework.IPoolObject {
    public declare pools: ObjectPools<PopupLabel>;
    public declare running: Array<PopupLabel>;
    private declare _label: Label;
    private declare _tween: Tween<{ v: number }>;
    private _disposed: boolean = false;
    private _inPoool: boolean = false;
    private _p1: Vec3 = v3();
    private _p2: Vec3 = v3();
    private _p3: Vec3 = v3();

    public onLoad() {
        this._label = this.getComponent(Label)!;
    }

    public set string(text: string) {
        // 不要小数点后的数字
        this._label.string = parseInt(text, 10) + "";
    }

    public set p1(pos: Vec3) {
        this._label.enabled = true;
        Vec3.copy(this._p1, pos);
        this._label.node.setPosition(this._p1);

        this._p2.set(this._p1.x, this._p1.y + 30, 1.0);
        this._p3.set(this._p1.x + randomRangeInt(-30, 30), this._p1.y, 1.0);
    }

    public get p1() {
        return this._p1;
    }

    public get inPoool() {
        return this._inPoool;
    }

    public get p2() {
        return this._p2;
    }

    public get p3() {
        return this._p3;
    }

    public set inPoool(i: boolean) {
        this._inPoool = i;
    }

    public onCreate(): void {

    }
    public onFree(): boolean {
        this._label.enabled = false;
        return true;
    }

    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.node.destroy();
    }

    public get isDisposed(): boolean {
        return this._disposed;
    }

    public play(): void {
        let t = { v: 0 };
        this._tween = tween(t).to(0.5, { v: 1.0 }, {
            onUpdate: (target?: object, ratio?: number) => {
                bezier(this.p1, this.p2, this.p3, ratio!, temp);
                this.node.setPosition(temp);
            }
        }).call(() => {
            this.pools.free(this);
            this.running.splice(this.running.indexOf(this), 1);
        }).start();
    }

    public stop(): void {
        this.pools.free(this);
        this._tween?.stop();
        this.node.removeFromParent();
    }
}