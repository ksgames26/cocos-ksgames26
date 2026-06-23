import { _decorator, Component, Node, UITransform, Vec2 } from 'cc';
const { ccclass, executeInEditMode, property } = _decorator;

@ccclass('ResizeToFitChildren')
@executeInEditMode
export class ResizeToFitChildren extends Component {
    private _offsetTop = 0;
    private _offsetBottom = 0;
    private _offsetLeft = 0;
    private _offsetRight = 0;

    @property({ tooltip: '顶部额外留白，单位：像素' })
    public get offsetTop(): number {
        return this._offsetTop;
    }
    public set offsetTop(value: number) {
        if (this._offsetTop === value) return;
        this._offsetTop = value;
        this.resizeToFitChildren();
    }

    @property({ tooltip: '底部额外留白，单位：像素' })
    public get offsetBottom(): number {
        return this._offsetBottom;
    }
    public set offsetBottom(value: number) {
        if (this._offsetBottom === value) return;
        this._offsetBottom = value;
        this.resizeToFitChildren();
    }

    @property({ tooltip: '左侧额外留白，单位：像素' })
    public get offsetLeft(): number {
        return this._offsetLeft;
    }
    public set offsetLeft(value: number) {
        if (this._offsetLeft === value) return;
        this._offsetLeft = value;
        this.resizeToFitChildren();
    }

    @property({ tooltip: '右侧额外留白，单位：像素' })
    public get offsetRight(): number {
        return this._offsetRight;
    }
    public set offsetRight(value: number) {
        if (this._offsetRight === value) return;
        this._offsetRight = value;
        this.resizeToFitChildren();
    }

    public onLoad() {
        this.node.children.forEach(child => {
            child.on(Node.EventType.SIZE_CHANGED, this.resizeToFitChildren, this);
            child.on(Node.EventType.TRANSFORM_CHANGED, this.resizeToFitChildren, this);
        });

        this.node.on(Node.EventType.CHILD_ADDED, this.onChildAdded, this);
        this.node.on(Node.EventType.CHILD_REMOVED, this.onChildRemoved, this);

        this.resizeToFitChildren();
    }

    private onChildAdded(child: Node) {
        child.on(Node.EventType.SIZE_CHANGED, this.resizeToFitChildren, this);
        child.on(Node.EventType.TRANSFORM_CHANGED, this.resizeToFitChildren, this);
        this.resizeToFitChildren();
    }

    private onChildRemoved(child: Node) {
        child.off(Node.EventType.SIZE_CHANGED, this.resizeToFitChildren, this);
        child.off(Node.EventType.TRANSFORM_CHANGED, this.resizeToFitChildren, this);
        this.resizeToFitChildren();
    }

    private resizeToFitChildren() {
        const uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) return;

        let minX = Number.MAX_VALUE, minY = Number.MAX_VALUE;
        let maxX = Number.MIN_VALUE, maxY = Number.MIN_VALUE;

        this.node.children.forEach(child => {
            const childTransform = child.getComponent(UITransform);
            if (childTransform) {
                const childPos = child.getPosition();
                const childSize = new Vec2(childTransform.width, childTransform.height);

                const left = childPos.x - childSize.x * childTransform.anchorX;
                const right = childPos.x + childSize.x * (1 - childTransform.anchorX);
                const bottom = childPos.y - childSize.y * childTransform.anchorY;
                const top = childPos.y + childSize.y * (1 - childTransform.anchorY);

                if (left < minX) minX = left;
                if (right > maxX) maxX = right;
                if (bottom < minY) minY = bottom;
                if (top > maxY) maxY = top;
            }
        });

        // 应用用户配置的额外留白
        minX -= this._offsetLeft;
        maxX += this._offsetRight;
        minY -= this._offsetBottom;
        maxY += this._offsetTop;

        const newWidth = maxX - minX;
        const newHeight = maxY - minY;

        uiTransform.setContentSize(newWidth, newHeight);
    }
}