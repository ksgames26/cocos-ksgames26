import { logger } from "../../../core/log";
import { Sprite, SpriteAtlas, SpriteFrame, _decorator } from "cc";
import { AssetHandle } from "../../../services/asset-service";
const { ccclass } = _decorator;

@ccclass("AutoSprite")
export class AutoSprite extends Sprite {

    private static readonly _spriteFrameDescriptor = Object.getOwnPropertyDescriptor(Sprite.prototype, "spriteFrame");
    private static _setBaseSpriteFrame(target: AutoSprite, value: SpriteFrame | null) {
        AutoSprite._spriteFrameDescriptor?.set?.call(target, value);
    }
    private static _getBaseSpriteFrame(target: AutoSprite): SpriteFrame | null {
        return (AutoSprite._spriteFrameDescriptor?.get?.call(target) as SpriteFrame | null) ?? null;
    }

    private _frameName: string = "";
    private _assetHandle: IGameFramework.Nullable<AssetHandle<typeof SpriteFrame | typeof SpriteAtlas>> = null;

    public get frameName(): string {
        return this._frameName;
    }

    get spriteFrame(): SpriteFrame | null {
        return AutoSprite._getBaseSpriteFrame(this);
    }

    set spriteFrame(value) {
        if (AutoSprite._getBaseSpriteFrame(this) === value) {
            return;
        }

        // 释放掉之前的资源
        if (value == null) {

            // 如果当前Sprite之前是用AssetHandle加载的，那么释放掉引用
            if (this._assetHandle) {
                this._assetHandle.releaseAsset(false);
                this._assetHandle = null;
            }
        }

        this._frameName = "";
        AutoSprite._setBaseSpriteFrame(this, value);
    }

    sprAssetHandle(value: IGameFramework.Nullable<AssetHandle<typeof SpriteFrame>>) {
        if (this._assetHandle === value) {
            return;
        }

        if (this._assetHandle) {
            this._assetHandle.releaseAsset(false);
        }

        this._assetHandle = value;

        if (this._assetHandle) {
            this.spriteFrame = (this._assetHandle as AssetHandle<typeof SpriteFrame>).addRefAndGetAsset() ?? null;
            if (!this.spriteFrame) {
                logger.warn("AutoSprite", "sprAssetHandle", "加载精灵帧失败");

                // 先释放掉引用
                this._assetHandle = null;
                // 释放精灵帧
                this.spriteFrame = null;
                return;
            }
        } else {
            this.spriteFrame = null;
        }
    }

    atlasAssetHandle(value: IGameFramework.Nullable<AssetHandle<typeof SpriteAtlas>>, frameName: string) {
        if (this._assetHandle === value) {
            if( this._frameName === frameName){
                return;
            }

            this.spriteFrame = null;
        }

        if (this._assetHandle) {
            this._assetHandle.releaseAsset(false);
            this._assetHandle = null;
        }

        this._assetHandle = value;

        if (this._assetHandle) {
            const atlas = (this._assetHandle as AssetHandle<typeof SpriteAtlas>).addRefAndGetAsset();
            if (!atlas) {
                logger.warn("AutoSprite", "atlasAssetHandle", "加载精灵图集失败");

                // 先释放掉引用
                this._assetHandle = null;
                // 释放精灵帧
                this.spriteFrame = null;
                return;
            }
            this.spriteFrame = atlas.getSpriteFrame(frameName);
            this._frameName = frameName;
        } else {
            this.spriteFrame = null;
        }
    }

    onDestroy(): void {
        this._frameName = "";
        if (this._assetHandle) {
            this._assetHandle.releaseAsset(false);
            this._assetHandle = null;
        }

        super.onDestroy();
    }
}
