import { _decorator, Component, EventTouch, Material, Node, Sprite, UITransform, Vec2, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('SteerManager')
export class SteerManager extends Component {
    @property(Vec2)
    holeCenter: Vec2 = new Vec2(0, 0);

    @property(Vec2)
    holeSize: Vec2 = new Vec2(100, 100);

    @property
    gradientWidth: number = 20;

    @property
    isSquare: boolean = false;

    @property(Node)
    maskNode: Node | null = null;

    private material: Material | null = null;

    onLoad() {
        const sprite = this.node.getComponent(Sprite);
        if (sprite) {
            this.material = sprite.getMaterial(0);
        }

        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }

    update() {
        if (this.material) {
            this.material.setProperty('holeCenter', this.holeCenter);
            this.material.setProperty('holeSize', this.holeSize);
            this.material.setProperty('gradientWidth', this.gradientWidth);
        }
    }

    public setHoleCenter(x: number, y: number) {
        this.holeCenter.set(x, y);
    }

    public setHoleSize(width: number, height: number) {
        this.holeSize.set(width, height);
    }

    public setGradientWidth(width: number) {
        this.gradientWidth = width;
    }

    public setIsSquare(isSquare: boolean) {
        this.isSquare = isSquare;
    }

    private onTouchStart(event: EventTouch) {
        this.handleClick(event, event.getUILocation());
    }

    private onTouchEnd(event: EventTouch) {
        this.handleClick(event, event.getUILocation());
    }

    private handleClick(event: EventTouch, location: Vec2) {
        if (!this.maskNode) return;

        const uiTransform = this.maskNode.getComponent(UITransform);
        if (!uiTransform) return;

        const localPos = uiTransform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
        const centerX = localPos.x + uiTransform.width / 2;
        const centerY = localPos.y + uiTransform.height / 2;

        const halfSize = this.holeSize.multiplyScalar(0.5);
        const dist = new Vec2(Math.abs(centerX - this.holeCenter.x), Math.abs(centerY - this.holeCenter.y));
        let isInside = false;
        if (this.isSquare) {
            isInside = dist.x <= halfSize.x && dist.y <= halfSize.y;
        } else {
            const radius = halfSize.length();
            const distToCenter = dist.length();
            isInside = distToCenter <= radius;
        }

        if (isInside) {
            console.log('点在洞里');
            // 处理点击事件
        } else {
            console.log('点在洞外');
            // 阻止点击事件
            event.propagationStopped = true;
        }
    }
}