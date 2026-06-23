import { js } from "cc";
import { _decorator, CCString, Component, EventHandler, instantiate, Label, Node, RichText, tween, Tween, UITransform, Vec3 } from "cc";
const { ccclass, property } = _decorator;

@ccclass("LeftRightButton")
export class LeftRightButton extends Component {
    @property({ type: Node })
    public leftButton: Node | null = null;

    @property({ type: Node })
    public rightButton: Node | null = null;

    @property({ type: Node })
    public labelNode: Node | null = null;

    @property({ type: [CCString] })
    public items: string[] = [];

    @property({ tooltip: "是否启用切换动画" })
    public enableAnimation: boolean = true;

    @property({ tooltip: "动画时长(秒)", min: 0.1, max: 2 })
    public animationDuration: number = 0.3;

    @property({ type: [EventHandler], tooltip: "切换回调" })
    public onChangeEvents: EventHandler[] = [];

    @property 
    public moveOffset: number = 400;

    private _currentIndex: number = 0;
    private _isAnimating: boolean = false;
    private _label: Label | RichText | null = null;
    private _cloneLabel: Node | null = null;

    public get currentIndex(): number {
        return this._currentIndex;
    }

    public set currentIndex(value: number) {
        this._currentIndex = value;
        this.updateLabel();
    }

    public get currentItem(): string {
        return this.items[this._currentIndex] ?? "";
    }

    protected onLoad(): void {
        this._label = this.labelNode?.getComponent(Label) ?? this.labelNode?.getComponent(RichText) ?? null;
        this.leftButton?.on(Node.EventType.TOUCH_END, this.onLeftClick, this);
        this.rightButton?.on(Node.EventType.TOUCH_END, this.onRightClick, this);
        this.updateLabel();
    }

    protected onDestroy(): void {
        this._cloneLabel = null;
    }

    private onLeftClick(): void {
        if (this._isAnimating || this.items.length === 0) return;
        const newIndex = (this._currentIndex - 1 + this.items.length) % this.items.length;
        this.switchTo(newIndex, 1); // 1: 从左边进入
    }

    private onRightClick(): void {
        if (this._isAnimating || this.items.length === 0) return;
        const newIndex = (this._currentIndex + 1) % this.items.length;
        this.switchTo(newIndex, -1); // -1: 从右边进入
    }

    private switchTo(newIndex: number, direction: number): void {
        if (newIndex === this._currentIndex) return;

        const oldIndex = this._currentIndex;
        this._currentIndex = newIndex;

        if (this.enableAnimation && this.labelNode) {
            this.playAnimation(direction);
        } else {
            this.updateLabel();
        }

        this.emitChangeEvent(oldIndex, newIndex);
    }

    private playAnimation(direction: number): void {
        if (!this.labelNode) return;

        this._isAnimating = true;
        const offsetX = this.moveOffset * direction;

        Tween.stopAllByTarget(this.labelNode);

        // 创建克隆节点用于显示新文字
        if (this._cloneLabel) {
            Tween.stopAllByTarget(this._cloneLabel);
            this._cloneLabel.destroy();
        }
        this._cloneLabel = instantiate(this.labelNode);
        this._cloneLabel.parent = this.labelNode.parent;
        this._cloneLabel.setPosition(new Vec3(offsetX, this._label?.node.position.y ?? 0, 0));

        // 设置新文字到克隆节点
        const cloneLabelComp = this._cloneLabel.getComponent(Label) ?? this._cloneLabel.getComponent(RichText);
        if (cloneLabelComp) {
            cloneLabelComp.string = this.currentItem;
        }

        // 旧文字移出
        tween(this.labelNode)
            .to(this.animationDuration, { position: new Vec3(-offsetX, 0, 0) }, { easing: "sineInOut" })
            .call(() => {
                this.updateLabel();
                this.labelNode!.setPosition(Vec3.ZERO);
            })
            .start();

        // 新文字移入
        tween(this._cloneLabel)
            .to(this.animationDuration, { position: Vec3.ZERO }, { easing: "sineInOut" })
            .call(() => {
                this._cloneLabel?.destroy();
                this._cloneLabel = null;
                this._isAnimating = false;
            })
            .start();
    }

    private updateLabel(): void {
        if (this._label) {
            this._label.string = this.currentItem;
        }
    }

    private emitChangeEvent(oldIndex: number, newIndex: number): void {
        EventHandler.emitEvents(this.onChangeEvents, oldIndex, newIndex, this.items[newIndex]);
    }

    /** 设置当前选中项（无动画） */
    public setIndex(index: number): void {
        if (index >= 0 && index < this.items.length) {
            this._currentIndex = index;
            this.updateLabel();
        }
    }

    /** 设置选项列表 */
    public setItems(items: string[], defaultIndex: number = 0): void {
        this.items = items;
        this._currentIndex = Math.max(0, Math.min(defaultIndex, items.length - 1));
        this.updateLabel();
    }

    /** 
     * 添加切换监听
     * @param target 目标组件
     * @param handler 回调方法名 (oldIndex: number, newIndex: number, item: string) => void
     */
    public addChangeListener(target: Component, handler: string): void {
        const eventHandler = new EventHandler();
        eventHandler.target = target.node;
        eventHandler.component = js.getClassName(target);
        eventHandler.handler = handler;
        this.onChangeEvents.push(eventHandler);
    }

    /** 移除切换监听 */
    public removeChangeListener(target: Component, handler: string): void {
        const index = this.onChangeEvents.findIndex(
            (e) => e.target === target.node && e.handler === handler
        );
        if (index !== -1) {
            this.onChangeEvents.splice(index, 1);
        }
    }
}
