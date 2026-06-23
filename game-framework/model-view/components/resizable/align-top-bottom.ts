import { _decorator, Component, Node, UITransform } from 'cc';
const { ccclass, property, executeInEditMode } = _decorator;

/**
 * 总是把当前节点的顶部靠着目标节点的底部，可配置额外间隔
 */
@ccclass('AlignTopToBottom')
@executeInEditMode
export class AlignTopToBottom extends Component {
    @property(Node)
    targetNode: Node = null!; // 需要参照的目标节点

    @property({ tooltip: '在节点之间插入的额外间隔，单位：像素' })
    spacing: number = 0;

    onLoad() {
        if (!this.targetNode) {
            return;
        }

        this.updateSize();
        this.targetNode.on(Node.EventType.SIZE_CHANGED, this.updateSize, this);
        this.targetNode.on(Node.EventType.TRANSFORM_CHANGED, this.updateSize, this);
        this.targetNode.on(Node.EventType.NODE_DESTROYED,this.onTargetNodeDestroyed,this);
    }

    onDestroy() {
        if (!this.targetNode) {
            return;
        }
    }

    private onTargetNodeDestroyed(){
        this.targetNode = null!;
    }

    updateSize() {
        if (!this.targetNode) return;

        const targetTransform = this.targetNode.getComponent(UITransform);
        const thisTransform = this.node.getComponent(UITransform);

        if (!targetTransform || !thisTransform) {
            return;
        }

        const targetWorldPos = this.targetNode.getWorldPosition();
        const thisWorldPos = this.node.getWorldPosition();

        // 目标节点底部坐标
        const targetBottom = targetWorldPos.y - targetTransform.height * targetTransform.anchorY;
        // 当前节点顶部坐标
        const thisTop = thisWorldPos.y + thisTransform.height * (1 - thisTransform.anchorY);

        // 让当前节点顶部贴住目标节点底部，同时预留 spacing 间隔
        const offset = targetBottom - thisTop - this.spacing;

        this.node.setWorldPosition(thisWorldPos.x, thisWorldPos.y + offset, thisWorldPos.z);
    }
}
