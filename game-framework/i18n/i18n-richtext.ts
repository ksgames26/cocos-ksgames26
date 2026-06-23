import { Container } from "../core/container";
import { Component, RichText, _decorator } from "cc";
import { EDITOR } from "cc/env";
import { I18N_EVENT, I18NService } from "./i18n-services";

const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/**
 * 多语言 RichText 组件
 * 自动根据 key 获取对应语言的富文本，并在语言切换时自动更新
 */
@ccclass("I18NRichText")
@requireComponent(RichText)
@executeInEditMode
export class I18NRichText extends Component {

    @property({
        displayName: "多语言Key",
        tooltip: "多语言资源的键值"
    })
    private _i18nKey: string = "";

    @property({
        displayName: "多语言Key",
        tooltip: "多语言资源的键值"
    })
    public get i18nKey(): string {
        return this._i18nKey;
    }

    public set i18nKey(value: string) {
        this._i18nKey = value;
        this.updateRichText();
    }

    /** 格式化参数 */
    private _args: any[] = [];

    /** RichText 组件引用 */
    private _richText: RichText | null = null;

    /** I18N 服务引用 */
    private _i18nService: I18NService | null = null;

    onLoad(): void {
        this._richText = this.getComponent(RichText);
        this._i18nService = Container.get(I18NService) ?? null;
    }

    onEnable(): void {
        // 监听语言切换事件
        this._i18nService?.addAutoListener(I18N_EVENT.I18N_EVENT_LOCALE_CHANGED, this.onLocaleChanged, this);
        // 初始更新
        this.updateRichText();
    }

    onDisable(): void {
        // 取消监听
        this._i18nService?.removeListener(I18N_EVENT.I18N_EVENT_LOCALE_CHANGED, this.onLocaleChanged, this);
    }

    /**
    * 编辑器函数
    *
    * @private
    * @param {string} confValue
    * @memberof I18NRichText
    */
    private editorChangeState(confValue: string): void {
        this.updateRichText(confValue);
    }

    /**
     * 语言切换回调
     */
    private onLocaleChanged(): void {
        this.updateRichText();
    }

    /**
     * 设置多语言 Key 和格式化参数
     * @param key 多语言键
     * @param args 格式化参数
     */
    public setI18NKey(key: string, ...args: any[]): void {
        this._i18nKey = key;
        this._args = args;
        this.updateRichText();
    }

    /**
     * 更新格式化参数（不改变 key）
     * @param args 格式化参数
     */
    public setArgs(...args: any[]): void {
        this._args = args;
        this.updateRichText();
    }

    /**
     * 更新 RichText 文本
     */
    public updateRichText(text?: string): void {
        if (!this._richText) {
            this._richText = this.getComponent(RichText);
        }

        if (!this._richText) {
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

            text = this._i18nService.getString(this._i18nKey, ...this._args);
        }
        this._richText.string = text ?? "";
    }
}
