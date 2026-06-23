import { Container } from "../../../core/container";
import { Component, Prefab, Vec3, _decorator, assert } from "cc";
import { DEBUG } from "cc/env";
import { AssetHandle, AssetService } from "../../../services/asset-service";
import { ObjectPools } from "../../../utils/object-pool";
import { PopupLabel } from "./popup-label";
const { ccclass } = _decorator;

@ccclass("PopupUtils")
export class PopupUtils extends Component {

    private _asset: IGameFramework.Nullable<AssetHandle<typeof Prefab>> = null;

    public initialize(asset: AssetHandle<typeof Prefab>): void {
        this._asset = asset;
    }

    /**
     * 正在运行的
     *
     * @private
     * @type {Label[]}
     * @memberof PopupUtils
     */
    private _runningLabels: PopupLabel[] = [];
    private _pools = new ObjectPools(() => {
        const assetSvr = Container.get(AssetService)!;
        const label = assetSvr.instantiateGetComponent(this._asset!, PopupLabel, true);
        DEBUG && assert(!!label, "PopupUtils: label is null");

        this.node.addChild(label!.node);
        label!.pools = this._pools;
        label!.running = this._runningLabels;
        return label!;
    }, 128, 30)

    public add(start: Vec3, text: string): void {
        DEBUG && assert(!!this._asset, "PopupUtils: asset is null");

        const label = this._pools.obtain();
        if (label) {
            label.string = text;
            label.p1 = start;

            if (!label.node.parent) {
                this.node.addChild(label.node);
            }

            this._runningLabels.push(label);

            label.play();
        }
    }

    public clear(): void {
        this._runningLabels.forEach(running => {
            running.stop();
        });
        this._runningLabels.length = 0;

        this._pools.clear();
    }
}