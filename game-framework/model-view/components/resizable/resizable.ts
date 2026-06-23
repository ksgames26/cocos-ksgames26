import { _decorator, Component, Node, Size, UITransform } from 'cc';
const { ccclass, property } = _decorator;

/**
 * 自动调整自身大小为目标节点的大小
 *
 * @export
 * @class ResizableNode
 * @extends {Component}
 */
@ccclass('ResizableNode')
export class ResizableNode extends Component {
    @property(Node) private targetNode: Node | null = null;
    @property(Size) private expand: Size = new Size();

    onLoad() {
        this.updateSize();

        this.targetNode!.on(Node.EventType.SIZE_CHANGED, this.updateSize, this);
    }

    private updateSize() {
        if (!this.targetNode) return;

        const targetTransform = this.targetNode.getComponent(UITransform);
        const thisTransform = this.node.getComponent(UITransform);

        if (targetTransform && thisTransform) {
            thisTransform.width = targetTransform.width;
            thisTransform.height = targetTransform.height;

            thisTransform.width += this.expand.width;
            thisTransform.height += this.expand.height;
        }
    }
}