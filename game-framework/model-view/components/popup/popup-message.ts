import { NodePool } from 'cc';
import { _decorator, Component, Node, Label, tween, Vec3, UIOpacity, Prefab, instantiate } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('PopupMessageManager')
export class PopupMessageManager extends Component {
    private _pool: NodePool = new NodePool();

    @property(Prefab)
    public messagePrefab: Prefab = null!;

    @property
    public moveDistance: number = 200;

    @property
    public duration: number = 1.5;

    @property
    public fadeStart: number = 0.7;

    @property
    public spacing: number = 300;

    private queue: string[] = [];
    private lastShow: number = 0;
    private static instance: PopupMessageManager | null = null;

    onLoad() {
        PopupMessageManager.instance = this;
    }

    public static show(message: string) {
        if (!this.instance!.messagePrefab) {
            return;
        }
        if (this.instance) {
            this.instance.addToQueue(message);
        }
    }

    public update(): void {
        const now = Date.now();
        if (this.queue.length > 0 && now - this.lastShow > this.spacing) {
            this.processQueue();
        }
    }

    private addToQueue(message: string) {
        this.queue.push(message);
    }

    private processQueue() {
        if (this.queue.length > 0) {
            const message = this.queue.shift()!;
            this.showMessage(message);
        }
    }

    private showMessage(message: string) {
        this.lastShow = Date.now();
        const messageNode = this._pool.get() ?? instantiate(this.messagePrefab);
        const label = messageNode.getComponent(Label)! ?? messageNode.getComponentInChildren(Label)!;
        label.string = message;

        messageNode.setPosition(0, 0, 0);
        messageNode.parent = this.node;

        const uiOpacity = messageNode.getComponent(UIOpacity) || messageNode.addComponent(UIOpacity);
        uiOpacity.opacity = 255;

        tween(messageNode)
            .to(this.duration * this.fadeStart, { position: new Vec3(0, this.moveDistance * this.fadeStart, 0) })
            .to(this.duration * (1 - this.fadeStart), { position: new Vec3(0, this.moveDistance, 0) })
            .start();

        tween(uiOpacity)
            .delay(this.duration * this.fadeStart)
            .to(this.duration * (1 - this.fadeStart), { opacity: 0 })
            .call(() => {
                this._pool.put(messageNode);
            })
            .start();
    }
}