import { logger } from "../../../core/log";
import { _decorator, Component, Enum, warn } from "cc";
import { NestedScrollPriority, VirtualList } from "./virtual-list";
const { ccclass, property } = _decorator;

/**
 * 可选配置组件，用于在需要时覆盖 VirtualList 的嵌套滚动优先级
 */
@ccclass("GameFramework/VirtualList/NestedScrollConfig")
export class VirtualListNestedScrollConfig extends Component {
	@property({ type: Enum(NestedScrollPriority), tooltip: "嵌套滚动优先级覆盖" })
	public priority: NestedScrollPriority = NestedScrollPriority.CHILD_FIRST;

	protected onEnable() {
		this.applyPriority();
	}

	protected onValidate() {
		this.applyPriority();
	}

	protected onDestroy() {
		this.applyPriority();
	}

	private applyPriority() {
		const target = this.getComponent(VirtualList);
		if (!target) {
			logger.warn("NestedScrollConfig 需要挂在含有 VirtualList 的节点上");
			return;
		}
		target.nestedScrollPriority = this.priority;
	}
}
