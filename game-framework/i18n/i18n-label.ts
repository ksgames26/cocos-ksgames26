import { Container } from "../core/container";
import { CCObjectFlags, Component, Label, _decorator } from "cc";
import { EDITOR } from "cc/env";
import { I18N_EVENT, I18NService } from "./i18n-services";

const { ccclass, property, requireComponent, executeInEditMode } = _decorator;

/**
 * 多语言 Label 组件
 * 自动根据 key 获取对应语言的文本，并在语言切换时自动更新
 */
@ccclass("I18NLabel")
@requireComponent(Label)
@executeInEditMode
export class I18NLabel extends Component {

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
        this.updateLabel();
    }

    /** 格式化参数 */
    private _args: any[] = [];

    /** Label 组件引用 */
    private _label: Label | null = null;

    /** I18N 服务引用 */
    private _i18nService: I18NService | null = null;

    onLoad(): void {
        this._label = this.getComponent(Label);
        this._i18nService = Container.get(I18NService) ?? null;
    }

    onEnable(): void {
        // 监听语言切换事件
        this._i18nService?.addAutoListener(I18N_EVENT.I18N_EVENT_LOCALE_CHANGED, this.onLocaleChanged, this);
        // 初始更新
        this.updateLabel();
    }

    onDisable(): void {
        // 取消监听
        this._i18nService?.removeListener(I18N_EVENT.I18N_EVENT_LOCALE_CHANGED, this.onLocaleChanged, this);
    }

    /**
     * 语言切换回调
     */
    private onLocaleChanged(): void {
        this.updateLabel();
    }

    /**
     * 编辑器函数
     *
     * @private
     * @param {string} confValue
     * @memberof I18NLabel
     */
    private editorChangeState(confValue: string): void {
        this.updateLabel(confValue);
    }

    /**
     * 设置多语言 Key 和格式化参数
     * @param key 多语言键
     * @param args 格式化参数
     */
    public setI18NKey(key: string, ...args: any[]): void {
        this._i18nKey = key;
        this._args = args;
        this.updateLabel();
    }

    /**
     * 更新格式化参数（不改变 key）
     * @param args 格式化参数
     */
    public setArgs(...args: any[]): void {
        this._args = args;
        this.updateLabel();
    }

    /**
     * 更新 Label 文本
     */
    public updateLabel(text?: string): void {
        if (!this._label) {
            this._label = this.getComponent(Label);
        }

        if (!this._label) {
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
        this._label.string = text ?? "";
    }
}
