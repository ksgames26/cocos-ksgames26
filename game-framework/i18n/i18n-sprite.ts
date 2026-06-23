import { Container } from "../core/container";
import { _decorator, assetManager, Component, SpriteFrame } from "cc";
import { EDITOR } from "cc/env";
import { AutoSprite } from "../model-view/components/auto-asset/auto-sprite";
import { I18N_EVENT, I18NService } from "./i18n-services";
const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/**
 * 多语言 Sprite 组件
 * 自动根据 key 获取对应语言的图片资源，并在语言切换时自动更新
 */
@ccclass("I18NSprite")
@requireComponent(AutoSprite)
@executeInEditMode
export class I18NSprite extends Component {

    @property({
        displayName: "多语言Key",
        tooltip: "多语言图片资源的键值"
    })
    private _i18nKey: string = "";

    @property({
        displayName: "多语言Key",
        tooltip: "多语言图片资源的键值"
    })
    public get i18nKey(): string {
        return this._i18nKey;
    }

    public set i18nKey(value: string) {
        this._i18nKey = value;
        this.updateSprite();
    }

    /** Sprite 组件引用 */
    private _sprite: AutoSprite | null = null;

    /** I18N 服务引用 */
    private _i18nService: I18NService | null = null;

    /** 是否正在加载 */
    private _isLoading: boolean = false;

    onLoad(): void {
        this._sprite = this.getComponent(AutoSprite);
        this._i18nService = Container.get(I18NService) ?? null;
    }

    onEnable(): void {
        // 监听语言切换事件
        this._i18nService?.addAutoListener(I18N_EVENT.I18N_EVENT_LOCALE_CHANGED, this.onLocaleChanged, this);
        // 初始更新
        this.updateSprite();
    }

    onDisable(): void {
        // 取消监听
        this._i18nService?.removeListener(I18N_EVENT.I18N_EVENT_LOCALE_CHANGED, this.onLocaleChanged, this);
    }

    /**
     * 语言切换回调
     */
    private onLocaleChanged(): void {
        this.updateSprite();
    }

    /**
    * 编辑器函数
    *
    * @private
    * @param {string} confValue
    * @memberof I18NSprite
    */
    private editorChangeState(confValue: string): void {
        this.updateSprite(confValue);
    }

    /**
     * 设置多语言 Key
     * @param key 多语言键
     */
    public setI18NKey(key: string): void {
        this._i18nKey = key;
        this.updateSprite();
    }

    /**
     * 更新 Sprite 图片
     * 
     * @param uuid 编辑器模式下使用的 uuid
     */
    public async updateSprite(uuid?: string): Promise<void> {
        if (!this._sprite) {
            this._sprite = this.getComponent(AutoSprite);
        }

        if (!this._sprite) {
            return;
        }

        if (!this._i18nKey || this._i18nKey.length === 0) {
            return;
        }

        if (!EDITOR) {
            if (!this._i18nService) {
                this._i18nService = Container.get(I18NService) ?? null;
            }

            if (!this._i18nService) {
                return;
            }
        }

        // 防止重复加载
        if (this._isLoading) {
            return;
        }

        if (EDITOR) {
            if (!uuid) {
                this._sprite.spriteFrame = null;
                return;
            }

            this._isLoading = true;

            assetManager.loadAny<SpriteFrame>(uuid!, (e, v) => {
                if (e) {
                    console.error("查询uuid失败  " + `${e.message || e}, uuid =${uuid}`);
                } else {
                    const frame = v;
                    if (this._sprite) {
                        this._sprite.spriteFrame = frame ?? null;
                    }
                }

                this._isLoading = false;
            });
            return;
        }

        this._isLoading = true;

        try {
            const i18nService = this._i18nService;
            if (!i18nService) {
                return;
            }

            const spriteFrame = await i18nService.getAssetHandle(this._i18nKey);

            // 检查组件是否仍然有效
            if (!this.isValid || !this._sprite || !this._sprite.isValid) {
                return;
            }

            if (spriteFrame) {
                if ("frame" in spriteFrame) {
                    this._sprite.atlasAssetHandle(spriteFrame.atlas, spriteFrame.frame);
                } else {
                    this._sprite.sprAssetHandle(spriteFrame);
                }
            }
        } finally {
            this._isLoading = false;
        }
    }
}
