import { _decorator, Node, Vec3 } from "cc";
import { VirtualList } from "./virtual-list";
import { ListItemTyepe, ListLayout, VirtualListDirection } from "./virtual-utils";
const { ccclass } = _decorator;

/**
 * 虚拟列表带粘性布局
 *
 * @export
 * @class VirtualStickyList
 * @extends {VirtualList}
 */
@ccclass('GameFramework/VirtualList/VirtualStickyList')
export class VirtualStickyList extends VirtualList {
	protected _activeHeaderIndex: number | null = null;
	protected _activeBottomIndex: number | null = null;

	protected postLayout(): void {
		super.postLayout();
		if (this.layout === ListLayout.GRID) {
			return;
		}
		this.updateStickyHeader();
		this.updateStickyBottom();
	}

	protected shouldKeepIndex(index: number): boolean {
		return index === this._activeHeaderIndex || index === this._activeBottomIndex;
	}

	protected updateStickyHeader() {
		const previous = this._activeHeaderIndex;
		if (!this._dataProvider || this._itemLayouts.length === 0) {
			if (previous !== null) {
				this.releaseSticky(previous);
			}
			this._activeHeaderIndex = null;
			return;
		}
		const scroll = this._scrollOffset;
		let candidate = -1;
		const layouts = this._itemLayouts;
		for (let i = 0; i < layouts.length; i++) {
			if (this._dataProvider.getItemType?.(i) !== ListItemTyepe.STICKY_HEADER) {
				continue;
			}
			if (layouts[i].offset <= scroll + 0.5) {
				candidate = i;
			} else {
				break;
			}
		}
		if (candidate < 0) {
			if (previous !== null) {
				this.releaseSticky(previous);
			}
			this._activeHeaderIndex = null;
			return;
		}
		if (previous !== null && previous !== candidate) {
			this.releaseSticky(previous);
		}
		this.ensureItem(candidate);
		this._activeHeaderIndex = candidate;
		const next = this.findNextSticky(candidate, ListItemTyepe.STICKY_HEADER);
		const record = this._activeItems.get(candidate);
		if (!record) {
			return;
		}
		const layout = this._itemLayouts[candidate];
		const axisSize = this.getViewportSize();
		if (axisSize <= 0) {
			return;
		}
		const isVertical = this.direction === VirtualListDirection.VERTICAL;
		let center = isVertical ? axisSize / 2 - layout.size / 2 : -axisSize / 2 + layout.size / 2;
		if (next >= 0) {
			const nextLayout = this._itemLayouts[next];
			const gap = nextLayout.offset - this._scrollOffset - layout.size;
			const push = Math.min(0, gap);
			center += isVertical ? -push : push;
		}
		if (isVertical) {
			record.node.setPosition(new Vec3(0, center, 0));
		} else {
			record.node.setPosition(new Vec3(center, 0, 0));
		}
		this.bringNodeToFront(record.node);
	}

	protected updateStickyBottom() {
		const previous = this._activeBottomIndex;
		if (!this._dataProvider || this._itemLayouts.length === 0) {
			if (previous !== null) {
				this.releaseSticky(previous);
			}
			this._activeBottomIndex = null;
			return;
		}
		const axisSize = this.getViewportSize();
		if (axisSize <= 0) {
			return;
		}
		const scrollEnd = this._scrollOffset + axisSize;
		let candidate = -1;
		for (let i = this._itemLayouts.length - 1; i >= 0; i--) {
			if (this._dataProvider.getItemType?.(i) !== ListItemTyepe.STICKY_FOOTER) {
				continue;
			}
			const layout = this._itemLayouts[i];
			if (layout.offset + layout.size >= scrollEnd - 0.5) {
				candidate = i;
			}
		}
		if (candidate < 0) {
			if (previous !== null) {
				this.releaseSticky(previous);
			}
			this._activeBottomIndex = null;
			return;
		}
		if (previous !== null && previous !== candidate) {
			this.releaseSticky(previous);
		}
		this.ensureItem(candidate);
		this._activeBottomIndex = candidate;
		const record = this._activeItems.get(candidate);
		if (!record) {
			return;
		}
		const layout = this._itemLayouts[candidate];
		const base = this.direction === VirtualListDirection.VERTICAL
			? -axisSize / 2 + layout.size / 2
			: axisSize / 2 - layout.size / 2;
		record.node.setPosition(this.direction === VirtualListDirection.VERTICAL ? new Vec3(0, base, 0) : new Vec3(base, 0, 0));
		this.bringNodeToFront(record.node);
	}

	private findNextSticky(startIndex: number, type: ListItemTyepe): number {
		for (let i = startIndex + 1; i < this._itemLayouts.length; i++) {
			if (this._dataProvider?.getItemType?.(i) === type) {
				return i;
			}
		}
		return -1;
	}

	private bringNodeToFront(node: Node) {
		const container = this.content ?? this.node;
		if (!container) {
			return;
		}
		if (node.parent !== container) {
			container.addChild(node);
		}
		const lastIndex = Math.max(0, container.children.length - 1);
		node.setSiblingIndex(lastIndex);
	}

	private releaseSticky(index: number) {
		const record = this._activeItems.get(index);
		if (!record) {
			return;
		}
		this.positionItem(index);
	}
}