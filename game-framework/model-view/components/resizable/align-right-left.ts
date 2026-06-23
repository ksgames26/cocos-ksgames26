import { _decorator, Component, Node, UITransform } from 'cc';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('AlignRightToLeft')
@executeInEditMode
export class AlignRightToLeft extends Component {
    @property(Node)
    targetNode: Node = null!; // 目标节点

    onLoad() {
        this.updateSize();
        if (
            !this.targetNode!) {
            return;
        }

        this.targetNode!.on(Node.EventType.SIZE_CHANGED, this.updateSize, this);
        
        this.targetNode!.on(Node.EventType.TRANSFORM_CHANGED, this.updateSize, this);
    }

    updateSize() {
        if (!this.targetNode) return;

        const targetTransform = this.targetNode.getComponent(UITransform);
        const thisTransform = this.node.getComponent(UITransform);

        if (targetTransform && thisTransform) {
            const targetWorldPos = this.targetNode.getWorldPosition();
            const thisWorldPos = this.node.getWorldPosition();

            // 计算目标节点左边的位置
            const targetLeft = targetWorldPos.x - targetTransform.width * targetTransform.anchorX;

            // 计算当前节点右边的位置
            const thisRight = thisWorldPos.x + thisTransform.width * (1 - thisTransform.anchorX);

            // 计算新的位置，使当前节点的右边靠着目标节点的左边
            const offset = targetLeft - thisRight;
            this.node.setWorldPosition(thisWorldPos.x + offset, thisWorldPos.y, thisWorldPos.z);
        }
    }
}