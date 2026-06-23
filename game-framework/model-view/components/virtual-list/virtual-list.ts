import { logger } from "../../../core/log";
import {
	_decorator,
	Component,
	Enum,
	EventMouse,
	EventTouch,
	instantiate,
	math,
	Node,
	Prefab,
	UITransform,
	Vec2,
	Vec3
} from "cc";
import { VirtualListGroup } from "./virtual-list-group";
import {
	GridAlignment,
	ListItemTyepe,
	ListLayout,
	VirtualGridLineInfo,
	VirtualListDataProvider,
	VirtualListDirection,
	VirtualListGridDelegate,
	VirtualListPrefabProxy,
	VirtualListRenderCallback,
	VirtualListItemClickCallback,
	VirtualListItemClickEvent
} from "./virtual-utils";
const { ccclass, property } = _decorator;

export enum NestedScrollPriority {
	/** 子列表优先处理滚动事件 */
	CHILD_FIRST = 0,
	/** 父列表优先处理滚动事件 */
	PARENT_FIRST = 1
}

interface ItemLayout {
	size: number;
	offset: number;
	lineIndex?: number;
	gridInfo?: VirtualGridLineInfo;
}

interface GridLineMeta {
	size: number;
	offset: number;
}

interface ActiveItem {
	index: number;
	node: Node;
	prefabKey: string;
}

/**
 * 虚拟列表基类，负责滚动、复用以及动态尺寸测量
 */
@ccclass('GameFramework/VirtualList/VirtualList')
export abstract class VirtualList extends Component {
	private _group: VirtualListGroup | null = null;

	@property({ type: Enum(ListLayout), tooltip: "列表布局类型" })
	public layout: ListLayout = ListLayout.DIRECTION;

	@property({ type: Enum(VirtualListDirection), tooltip: "虚拟列表滑动方向" })
	public direction: VirtualListDirection = VirtualListDirection.VERTICAL;

	@property({ tooltip: "UI 事件节点，默认使用组件节点" })
	public viewport: Node | null = null;

	@property({ tooltip: "Item 容器节点，默认使用组件节点" })
	public content: Node | null = null;

	@property({ tooltip: "预估 item 主轴尺寸，用于尚未测量的元素" })
	public estimatedItemSize = 80;

	@property({ tooltip: "Item 间距" })
	public spacing = 4;

	@property({ tooltip: "额外缓冲区长度" })
	public buffer = 200;

	@property({ tooltip: "滑动阻尼（可选调节）" })
	public dragDamping = 1;

	@property({ tooltip: "Grid 交叉轴间距" })
	public crossSpacing = 4;

	@property({ tooltip: "拖拽越界时允许的最大距离（像素），用于限制越界长度" })
	public maxOverscroll = 200;

	@property({ tooltip: "越界阻尼系数，越大拖动越“沉”，影响越界阻尼效果" })
	public overscrollResistance = 0.55;

	@property({ tooltip: "回弹弹簧刚度，越大回弹越快" })
	public springStiffness = 150;

	@property({ tooltip: "回弹阻尼，防止回弹振荡" })
	public springDamping = 26;

	@property({ tooltip: "惯性段的摩擦系数，影响速度衰减" })
	public friction = 4;

	@property({ tooltip: "低于此速度会停止惯性并贴地（单位：像素/秒）" })
	public inertiaClamp = 0.03;

	public nestedScrollPriority: NestedScrollPriority = NestedScrollPriority.CHILD_FIRST;

	protected _dataProvider: VirtualListDataProvider | null = null;
	protected _prefabProxy: VirtualListPrefabProxy | null = null;
	protected _renderCallback: VirtualListRenderCallback | null = null;
	protected _gridDelegate: VirtualListGridDelegate | null = null;
	protected _itemClickCallback: VirtualListItemClickCallback | null = null;
	/** 存储每个 item 节点的点击数据，用于事件触发时获取 */
	private _itemClickData: Map<Node, { index: number; data: unknown; itemType: ListItemTyepe }> = new Map();
	/** 共享的点击处理函数，避免为每个 item 创建闭包 */
	private _sharedClickHandler: ((event: EventTouch) => void) | null = null; protected _itemLayouts: ItemLayout[] = [];
	protected _activeItems: Map<number, ActiveItem> = new Map();
	protected _pools: Map<string, Node[]> = new Map();
	protected _gridLineMeta: Map<number, GridLineMeta> = new Map();
	protected _gridLineOrder: number[] = [];

	protected _scrollOffset = 0;
	protected _velocity = 0;
	protected _touching = false;
	protected _touchStartPos = 0;
	protected _touchStartOffset = 0;
	protected _layoutDirty = false;
	protected _lastTouchTime = 0;
	protected _firstVisibleIndex = 0;
	protected _scrollAnimActive = false;
	protected _scrollAnimStartOffset = 0;
	protected _scrollAnimTarget = 0;
	protected _scrollAnimDuration = 0.25;
	protected _scrollAnimElapsed = 0;
	private _pendingOverflowReleaseDir: number | null = null;

	public setDataProvider(provider: VirtualListDataProvider | null) {
		this._dataProvider = provider;
		this.reloadData();
	}

	public setPrefabProxy(proxy: VirtualListPrefabProxy | null) {
		this._prefabProxy = proxy;
		this.reloadData();
	}

	public setRenderCallback(cb: VirtualListRenderCallback | null) {
		this._renderCallback = cb;
		this.requestLayout();
	}

	public setGridDelegate(delegate: VirtualListGridDelegate | null) {
		this._gridDelegate = delegate;
		this.reloadData();
	}

	/**
	 * 设置 item 点击回调
	 * 
	 * @param callback 点击回调函数，接收 VirtualListItemClickEvent 参数
	 * 
	 * @example
	 * ```typescript
	 * list.setItemClickCallback((event) => {
	 *     console.log(`点击了 item ${event.index}`, event.data);
	 *     // 在嵌套列表中，可以阻止事件向父列表传播
	 *     event.stopPropagation();
	 * });
	 * ```
	 */
	public setItemClickCallback(callback: VirtualListItemClickCallback | null) {
		this._itemClickCallback = callback;
	}

	/**
	 * 触发重载，清空缓存并重新计算布局
	 *
	 * @memberof VirtualList
	 */
	public reloadData() {
		this.recycleAll();
		const count = this._dataProvider?.getItemCount() ?? 0;
		this._itemLayouts = [];
		this._gridLineMeta.clear();
		this._gridLineOrder = [];
		let offset = 0;
		if (this.isGridMode()) {
			let nextOffset = 0;
			const lineCounts = new Map<number, number>();
			const lineAlign = new Map<number, GridAlignment | undefined>();
			for (let i = 0; i < count; i++) {
				const lineInfo = this._gridDelegate?.getGridLineInfo(i);
				if (!lineInfo) {
					logger.warn(`VirtualList GRID 缺少 index=${i} 的行信息`);
					continue;
				}
				const currentCount = (lineCounts.get(lineInfo.lineIndex) ?? 0) + 1;
				lineCounts.set(lineInfo.lineIndex, currentCount);
				if (!lineAlign.has(lineInfo.lineIndex) && lineInfo.alignment !== undefined) {
					lineAlign.set(lineInfo.lineIndex, lineInfo.alignment);
				}
				let meta = this._gridLineMeta.get(lineInfo.lineIndex);
				if (!meta) {
					meta = { size: this.estimatedItemSize, offset: nextOffset };
					this._gridLineMeta.set(lineInfo.lineIndex, meta);
					this._gridLineOrder.push(lineInfo.lineIndex);
					nextOffset += meta.size + this.spacing;
				}
				const indexInLine = lineInfo.indexInLine ?? currentCount - 1;
				this._itemLayouts.push({
					size: meta.size,
					offset: meta.offset,
					lineIndex: lineInfo.lineIndex,
					gridInfo: {
						lineIndex: lineInfo.lineIndex,
						indexInLine,
						itemsInLine: lineInfo.itemsInLine ?? currentCount,
						alignment: lineInfo.alignment
					}
				});
			}
			const warnedLines = new Set<number>();
			this._itemLayouts.forEach((layout) => {
				if (layout.lineIndex === undefined || !layout.gridInfo) {
					return;
				}
				const actualCount = lineCounts.get(layout.lineIndex);
				if (actualCount !== undefined) {
					if (layout.gridInfo.itemsInLine !== actualCount && !warnedLines.has(layout.lineIndex)) {
						logger.warn(`VirtualList GRID 行 ${layout.lineIndex} itemsInLine=${layout.gridInfo.itemsInLine} 与实际 ${actualCount} 不符，已自动纠正`);
						warnedLines.add(layout.lineIndex);
					}
					layout.gridInfo.itemsInLine = actualCount;
					layout.gridInfo.indexInLine = math.clamp(layout.gridInfo.indexInLine, 0, Math.max(0, actualCount - 1));
				}
				if (layout.gridInfo.alignment === undefined) {
					layout.gridInfo.alignment = lineAlign.get(layout.lineIndex) ?? GridAlignment.CENTER;
				}
			});
		} else {
			for (let i = 0; i < count; i++) {
				const size = this.estimatedItemSize;
				this._itemLayouts.push({ size, offset, lineIndex: i });
				offset += size + (i === count - 1 ? 0 : this.spacing);
			}
		}
		this._scrollOffset = 0;
		this.requestLayout();
	}

	protected recycleAll() {
		this._activeItems.forEach((item) => this.recycleItem(item));
		this._activeItems.clear();
	}

	protected recycleItem(item: ActiveItem) {
		// 移除点击监听器
		this.removeItemClickListener(item.node);

		const list = this._pools.get(item.prefabKey) ?? [];
		list.push(item.node);
		this._pools.set(item.prefabKey, list);
		item.node.active = false;
	}

	protected acquireItem(prefab: Prefab): Node {
		const key = prefab.uuid;
		const list = this._pools.get(key);
		if (list && list.length > 0) {
			const node = list.pop()!;
			node.active = true;
			return node;
		}
		const node = instantiate(prefab);
		(this.content ?? this.node).addChild(node);
		return node;
	}

	protected requestLayout() {
		this._layoutDirty = true;
	}

	protected onEnable(): void {
		this._group = this.findGroup();
		if (this._group) {
			this._group.registerList(this);
		}
		// 初始化共享的点击处理函数
		this._sharedClickHandler = this.createSharedClickHandler();
		this.bindInput(true);
		this.requestLayout();
	}

	protected onDisable(): void {
		this.bindInput(false);
		this.recycleAll();
		// 清理所有点击数据
		this._itemClickData.clear();
		this._sharedClickHandler = null;
		if (this._group) {
			this._group.unregisterList(this);
			this._group = null;
		}
	}

	protected bindInput(enabled: boolean) {
		const target = this.viewport ?? this.node;
		if (!target) {
			return;
		}
		if (enabled) {
			target.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
			target.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
			target.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
			target.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
			target.on(Node.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
		} else {
			target.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
			target.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
			target.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
			target.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
			target.off(Node.EventType.MOUSE_WHEEL, this.onMouseWheel, this);
		}
	}

	protected onTouchStart(event: EventTouch) {
		if (!this._group || !this._group.resolveTouchOwner(event, this, "start")) {
			return;
		}
		this.beginTouchFrom(event);
	}

	protected onTouchMove(event: EventTouch) {
		if (!this._group || !this._group.resolveTouchOwner(event, this, "move")) {
			return;
		}
		if (!this._touching) {
			return;
		}
		const pos = event.getUILocation();
		const current = this.direction === VirtualListDirection.VERTICAL ? pos.y : pos.x;
		const delta = (current - this._touchStartPos) / Math.max(0.1, this.dragDamping);
		const prevOffset = this._scrollOffset;
		const factor = this.direction === VirtualListDirection.VERTICAL ? 1 : -1;
		const desired = this._touchStartOffset + delta * factor;
		this._scrollOffset = this.applyDragResistance(desired);
		this.clampScroll();
		this.requestLayout();
		const now = this.getNow();
		const elapsed = Math.max((now - this._lastTouchTime) / 1000, 1e-3);
		this._velocity = (this._scrollOffset - prevOffset) / elapsed;
		this._lastTouchTime = now;
	}

	protected onTouchEnd(event?: EventTouch) {
		if (event && this._group && !this._group.resolveTouchOwner(event, this, "end")) {
			return;
		}
		this._touching = false;
		if (this._group) {
			this._group.releaseTouch(event, this);
		}
	}

	protected onMouseWheel(event: EventMouse) {
		const delta = event.getScrollY();
		this._scrollOffset += delta;
		this.clampScroll();
		this.requestLayout();
	}

	protected clampScroll() {
		const extra = this.maxOverscroll;
		this._scrollOffset = math.clamp(this._scrollOffset, -extra, this.getMaxScrollOffset() + extra);
	}

	protected getViewportSize(): number {
		const transform = this.getViewportTransform();
		if (!transform) {
			return 0;
		}
		return this.direction === VirtualListDirection.VERTICAL ? transform.height : transform.width;
	}

	protected getContentSize(): number {
		const layouts = this._itemLayouts;
		if (layouts.length === 0) {
			return 0;
		}
		const last = layouts[layouts.length - 1];
		return last.offset + last.size;
	}

	protected getMaxScrollOffset(): number {
		return Math.max(0, this.getContentSize() - this.getViewportSize());
	}

	protected update(dt: number): void {
		if (this._scrollAnimActive) {
			this.stepScrollAnimation(dt);
		} else if (!this._touching) {
			this.integrateInertia(dt);
		}
		if (this._layoutDirty) {
			this._layoutDirty = false;
			this.layoutVisibleItems();
		}
	}

	protected layoutVisibleItems() {
		if (!this._dataProvider) {
			this.recycleAll();
			return;
		}
		const viewportSize = this.getViewportSize();
		const contentSize = this.getContentSize();
		const start = math.clamp(this._scrollOffset - this.buffer, 0, contentSize);
		const end = math.clamp(this._scrollOffset + viewportSize + this.buffer, 0, contentSize);
		let firstIndex = this.findIndexByOffset(start);
		let lastIndex = this.findIndexByOffset(end);
		if (this.isGridMode()) {
			firstIndex = this.expandToLineEdge(firstIndex, -1);
			lastIndex = this.expandToLineEdge(lastIndex, 1);
		}
		this._firstVisibleIndex = firstIndex;

		this._activeItems.forEach((item, index) => {
			if (this.shouldKeepIndex(index)) {
				return;
			}
			if (index < firstIndex || index > lastIndex) {
				this.recycleItem(item);
				this._activeItems.delete(index);
			}
		});

		for (let i = firstIndex; i <= lastIndex; i++) {
			this.ensureItem(i);
		}

		this.postLayout();
	}

	/** 子类可扩展粘性之类的处理 */
	protected postLayout() {
		// default empty
	}

	/** 子类可覆盖以保留必须常驻的 index */
	protected shouldKeepIndex(_index: number): boolean {
		return false;
	}

	protected ensureItem(index: number) {
		if (index < 0 || index >= this._itemLayouts.length || !this._dataProvider) {
			return;
		}
		if (this._activeItems.has(index)) {
			this.positionItem(index);
			return;
		}
		const type = this._dataProvider.getItemType?.(index) ?? ListItemTyepe.NORMAL;
		const data = this._dataProvider.getItemData(index);
		const prefab = this._prefabProxy?.(index, type, data);
		if (!prefab) {
			logger.warn(`VirtualList 缺少 index=${index} 的 Prefab`);
			return;
		}
		const node = this.acquireItem(prefab);
		const prefabKey = prefab.uuid;
		this._activeItems.set(index, { index, node, prefabKey });
		this.positionItem(index);
		this._renderCallback?.(node, index, data, type);
		// 注册点击监听器
		this.registerItemClickListener(node, index, data, type);
		this.measureItem(index);
	}

	protected measureItem(index: number) {
		const record = this._activeItems.get(index);
		if (!record) {
			return;
		}
		const transform = record.node.getComponent(UITransform);
		if (!transform) {
			return;
		}
		const layout = this._itemLayouts[index];
		const size = this.direction === VirtualListDirection.VERTICAL ? transform.height : transform.width;
		if (this.isGridMode() && layout?.lineIndex !== undefined) {
			this.updateGridMeasurement(layout.lineIndex, size);
			return;
		}
		if (Math.abs(size - layout.size) < 0.5) {
			return;
		}
		const delta = size - layout.size;
		layout.size = size;
		for (let i = index + 1; i < this._itemLayouts.length; i++) {
			this._itemLayouts[i].offset += delta;
		}
		if (index <= this._firstVisibleIndex && this._scrollOffset > 0) {
			this._scrollOffset += delta;
			this.clampScroll();
		}
		this.requestLayout();
	}

	protected positionItem(index: number) {
		const record = this._activeItems.get(index);
		const layout = this._itemLayouts[index];
		if (!record || !layout) {
			return;
		}
		const viewport = this.getViewportTransform();
		if (!viewport) {
			return;
		}
		const transform = record.node.getComponent(UITransform);
		const isGrid = this.isGridMode();
		if (this.direction === VirtualListDirection.VERTICAL) {
			const half = viewport.height / 2;
			const top = half - (layout.offset - this._scrollOffset);
			const centerY = top - layout.size / 2;
			const centerX = isGrid && transform && layout.lineIndex !== undefined
				? this.computeGridCrossCenter(index, layout, transform.width, viewport.width)
				: 0;
			record.node.setPosition(new Vec3(centerX, centerY, 0));
		} else {
			const half = viewport.width / 2;
			const left = -half + (layout.offset - this._scrollOffset);
			const centerX = left + layout.size / 2;
			const centerY = isGrid && transform && layout.lineIndex !== undefined
				? this.computeGridCrossCenter(index, layout, transform.height, viewport.height)
				: 0;
			record.node.setPosition(new Vec3(centerX, centerY, 0));
		}
	}

	public scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start', trans = false) {
		if (index < 0 || index >= this._itemLayouts.length) {
			return;
		}
		const viewport = this.getViewportSize();
		const layout = this._itemLayouts[index];
		let target = layout.offset;
		if (align === 'center') {
			target = layout.offset - viewport / 2 + layout.size / 2;
		} else if (align === 'end') {
			target = layout.offset - viewport + layout.size;
		}
		if (trans) {
			this.animateToOffset(target);
		} else {
			this.setScrollOffset(target);
		}
	}

	public scrollToItem(index: number, align: 'start' | 'center' | 'end' = 'start', trans = false) {
		this.scrollToIndex(index, align, trans);
	}

	public scrollToTop(trans = false) {
		if (trans) {
			this.animateToOffset(0);
		} else {
			this.setScrollOffset(0);
		}
	}

	public scrollToBottom(trans = false) {
		const max = Math.max(0, this.getContentSize() - this.getViewportSize());
		if (trans) {
			this.animateToOffset(max);
		} else {
			this.setScrollOffset(max);
		}
	}

	public scrollToOffsetPercent(percent: number, trans = false) {
		const normalized = math.clamp(percent, 0, 1);
		const max = Math.max(0, this.getContentSize() - this.getViewportSize());
		const target = max * normalized;
		if (trans) {
			this.animateToOffset(target);
		} else {
			this.setScrollOffset(target);
		}
	}

	protected setScrollOffset(target: number) {
		this.stopScrollAnimation();
		const max = Math.max(0, this.getContentSize() - this.getViewportSize());
		this._scrollOffset = math.clamp(target, 0, max);
		this._velocity = 0;
		this.requestLayout();
	}

	protected isGridMode(): boolean {
		return this.layout === ListLayout.GRID && !!this._gridDelegate;
	}

	protected animateToOffset(target: number, duration = 0.25) {
		const max = Math.max(0, this.getContentSize() - this.getViewportSize());
		const clamped = math.clamp(target, 0, max);
		if (Math.abs(clamped - this._scrollOffset) < 0.5) {
			this.setScrollOffset(clamped);
			return;
		}
		this._scrollAnimActive = true;
		this._scrollAnimStartOffset = this._scrollOffset;
		this._scrollAnimTarget = clamped;
		this._scrollAnimDuration = Math.max(0.05, duration);
		this._scrollAnimElapsed = 0;
		this._velocity = 0;
		this.requestLayout();
	}

	protected stopScrollAnimation() {
		if (!this._scrollAnimActive) {
			return;
		}
		this._scrollAnimActive = false;
		this._scrollAnimElapsed = 0;
	}

	protected stepScrollAnimation(dt: number) {
		if (!this._scrollAnimActive) {
			return;
		}
		this._scrollAnimElapsed += dt;
		const progress = math.clamp(this._scrollAnimElapsed / this._scrollAnimDuration, 0, 1);
		const eased = 1 - Math.pow(1 - progress, 3);
		this._scrollOffset = math.lerp(this._scrollAnimStartOffset, this._scrollAnimTarget, eased);
		this.requestLayout();
		if (progress >= 1) {
			this._scrollOffset = this._scrollAnimTarget;
			this.stopScrollAnimation();
		}
	}

	protected updateGridMeasurement(lineIndex: number, size: number) {
		const meta = this._gridLineMeta.get(lineIndex);
		if (!meta || Math.abs(size - meta.size) < 0.5) {
			return;
		}
		const delta = size - meta.size;
		meta.size = size;
		this._itemLayouts.forEach((layout) => {
			if (layout.lineIndex === lineIndex) {
				layout.size = size;
			}
		});
		let adjust = false;
		for (const idx of this._gridLineOrder) {
			if (idx === lineIndex) {
				adjust = true;
				continue;
			}
			if (adjust) {
				const info = this._gridLineMeta.get(idx);
				if (info) {
					info.offset += delta;
				}
			}
		}
		this._itemLayouts.forEach((layout) => {
			if (layout.lineIndex === undefined) {
				return;
			}
			const info = this._gridLineMeta.get(layout.lineIndex);
			if (info) {
				layout.offset = info.offset;
			}
		});
		const firstLine = this.getLineIndexForItem(this._firstVisibleIndex);
		if (firstLine !== null && lineIndex <= firstLine && this._scrollOffset > 0) {
			this._scrollOffset += delta;
			this.clampScroll();
		}
		this.requestLayout();
	}

	protected computeGridCrossCenter(index: number, layout: ItemLayout, itemCrossSize: number, axisSize: number): number {
		const lineInfo = layout.gridInfo ?? this._gridDelegate?.getGridLineInfo(index);
		if (!lineInfo || axisSize <= 0) {
			return 0;
		}
		const spacing = this.crossSpacing;
		const total = lineInfo.itemsInLine * itemCrossSize + Math.max(0, lineInfo.itemsInLine - 1) * spacing;
		const alignment = lineInfo.alignment ?? GridAlignment.CENTER;
		let startBase = 0;
		if (alignment === GridAlignment.START) {
			startBase = 0;
		} else if (alignment === GridAlignment.END) {
			startBase = Math.max(0, axisSize - total);
		} else {
			startBase = Math.max(0, (axisSize - total) / 2);
		}
		const offsetFromStart = startBase + lineInfo.indexInLine * (itemCrossSize + spacing) + itemCrossSize / 2;
		if (this.direction === VirtualListDirection.VERTICAL) {
			return -axisSize / 2 + offsetFromStart;
		}
		return axisSize / 2 - offsetFromStart;
	}

	protected getLineIndexForItem(index: number): number | null {
		if (index < 0 || index >= this._itemLayouts.length) {
			return null;
		}
		const value = this._itemLayouts[index].lineIndex;
		return value === undefined ? null : value;
	}

	protected findIndexByOffset(offset: number): number {
		const layouts = this._itemLayouts;
		if (layouts.length === 0) {
			return 0;
		}
		let low = 0;
		let high = layouts.length - 1;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			const current = layouts[mid];
			if (offset < current.offset) {
				high = mid - 1;
			} else if (offset > current.offset + current.size) {
				low = mid + 1;
			} else {
				return mid;
			}
		}
		return math.clamp(low, 0, layouts.length - 1);
	}

	/**
	 * Grid 模式下，将 index 扩展到同一行的边界，确保整行一起渲染
	 */
	protected expandToLineEdge(index: number, direction: -1 | 1): number {
		if (!this.isGridMode() || index < 0 || index >= this._itemLayouts.length) {
			return math.clamp(index, 0, Math.max(0, this._itemLayouts.length - 1));
		}
		const targetLine = this._itemLayouts[index]?.lineIndex;
		if (targetLine === undefined) {
			return index;
		}
		let cursor = index;
		if (direction < 0) {
			while (cursor > 0 && this._itemLayouts[cursor - 1]?.lineIndex === targetLine) {
				cursor--;
			}
		} else {
			while (cursor < this._itemLayouts.length - 1 && this._itemLayouts[cursor + 1]?.lineIndex === targetLine) {
				cursor++;
			}
		}
		return cursor;
	}

	protected applyDragResistance(offset: number): number {
		const max = this.getMaxScrollOffset();
		if (offset < 0) {
			return -this.calcResistance(-offset);
		}
		if (offset > max) {
			return max + this.calcResistance(offset - max);
		}
		return offset;
	}

	protected calcResistance(value: number): number {
		const range = this.maxOverscroll;
		const ratio = value / range;
		return range * (1 - 1 / (ratio + 1));
	}

	protected getOverflowDistance(): number {
		const max = this.getMaxScrollOffset();
		if (this._scrollOffset < 0) {
			return -this._scrollOffset;
		}
		if (this._scrollOffset > max) {
			return max - this._scrollOffset;
		}
		return 0;
	}

	private getNow(): number {
		return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
	}

	private integrateInertia(dt: number) {
		if (Math.abs(this._velocity) <= this.inertiaClamp && Math.abs(this.getOverflowDistance()) < 0.5) {
			this._velocity = 0;
			return;
		}
		this._scrollOffset += this._velocity * dt;
		const overflow = this.getOverflowDistance();
		if (overflow !== 0) {
			const spring = overflow * this.springStiffness;
			const damp = -this._velocity * this.springDamping;
			this._velocity += (spring + damp) * dt;
		} else {
			const friction = this.friction;
			this._velocity -= this._velocity * friction * dt;
		}
		this.clampScroll();
		this.requestLayout();
	}

	/**
	 * 输出当前列表的调试信息，方便排查性能或复用情况
	 */
	public logDebugInfo(context: string = "VirtualList") {
		const activeCount = this._activeItems.size;
		let pooledCount = 0;
		this._pools.forEach((nodes) => (pooledCount += nodes.length));
		const layoutCount = this._itemLayouts.length;
		const info = {
			context,
			scrollOffset: this._scrollOffset.toFixed(2),
			velocity: this._velocity.toFixed(2),
			viewport: this.getViewportSize().toFixed(2),
			content: this.getContentSize().toFixed(2),
			activeCount,
			pooledCount,
			itemCount: layoutCount
		};
		console.log("[VirtualList][Debug]", info);
	}

	public beginTouchFrom(event: EventTouch) {
		this.stopScrollAnimation();
		const pos = event.getUILocation();
		this._touchStartPos = this.direction === VirtualListDirection.VERTICAL ? pos.y : pos.x;
		this._touchStartOffset = this._scrollOffset;
		this._touching = true;
		this._velocity = 0;
		this._lastTouchTime = this.getNow();
	}

	public cancelTouch() {
		this._touching = false;
		this._velocity = 0;
	}

	public shouldReleaseForDelta(delta: Vec2 | undefined | null): boolean {
		this._pendingOverflowReleaseDir = null;
		if (!delta) {
			return false;
		}
		const axisDelta = this.getAxisDelta(delta);
		const crossDelta = this.getCrossAxisDelta(delta);
		const absAxis = Math.abs(axisDelta);
		const absCross = Math.abs(crossDelta);
		const magnitude = Math.max(absAxis, absCross);
		if (magnitude < 0.1) {
			return false;
		}

		// 跨轴滑动主导：只有当跨轴滑动明显大于主轴时才释放
		const bias = 1.5;
		if (absCross > absAxis * bias) {
			return true;
		}

		// 主轴滑动主导但无内容可滚动
		if (absAxis > absCross && !this.hasScrollableContent()) {
			return true;
		}

		// 主轴边界溢出
		if (!this.canScrollAlongAxis(axisDelta)) {
			const sign = Math.sign(axisDelta);
			this._pendingOverflowReleaseDir = sign === 0 ? null : sign;
			return true;
		}
		return false;
	}

	public consumeOverflowReleaseDir(): number | null {
		const value = this._pendingOverflowReleaseDir;
		this._pendingOverflowReleaseDir = null;
		return value;
	}

	private hasScrollableContent(): boolean {
		const content = this.getContentSize();
		const viewport = this.getViewportSize();
		return content - viewport > 1;
	}

	public getAxisDelta(delta: Vec2): number {
		return this.direction === VirtualListDirection.VERTICAL ? delta.y : -delta.x;
	}

	public getCrossAxisDelta(delta: Vec2): number {
		return this.direction === VirtualListDirection.VERTICAL ? delta.x : delta.y;
	}

	public canScrollAlongAxis(delta: number): boolean {
		if (!this.hasScrollableContent()) {
			return false;
		}
		if (Math.abs(delta) < 1e-3) {
			return true;
		}
		const max = this.getMaxScrollOffset();
		const tolerance = 0.5;
		if (delta > 0) {
			return this._scrollOffset < max - tolerance;
		}
		if (delta < 0) {
			return this._scrollOffset > tolerance;
		}
		return true;
	}

	public getScrollOffset(): number {
		return this._scrollOffset;
	}

	public getViewportTransform(): UITransform | null {
		const node = this.viewport ?? this.node;
		return node?.getComponent(UITransform) ?? null;
	}

	private findGroup(): VirtualListGroup | null {
		let cursor: Node | null = this.node;
		while (cursor) {
			const group = cursor.getComponent(VirtualListGroup);
			if (group) {
				return group;
			}
			cursor = cursor.parent;
		}
		return null;
	}

	/**
	 * 创建共享的点击处理函数（只创建一次）
	 * @private
	 */
	private createSharedClickHandler(): (event: EventTouch) => void {
		return (event: EventTouch) => {
			if (!this._itemClickCallback) {
				return;
			}

			// 检查是否在滚动中（滚动时不触发点击）
			if (Math.abs(this._velocity) > 0.5) {
				return;
			}

			// 从事件目标获取节点
			const targetNode = event.target as Node;
			if (!targetNode) {
				return;
			}

			// 从存储的数据中获取点击信息
			const clickData = this._itemClickData.get(targetNode);
			if (!clickData) {
				return;
			}

			// 创建点击事件对象
			const clickEvent: VirtualListItemClickEvent = {
				index: clickData.index,
				data: clickData.data,
				node: targetNode,
				itemType: clickData.itemType,
				list: this,
				touch: event,
				stopPropagation: () => {
					event.propagationStopped = true;
				}
			};

			// 调用回调
			this._itemClickCallback(clickEvent);
		};
	}

	/**
	 * 为 item 节点注册点击监听器（优化版：使用共享处理函数）
	 * @private
	 */
	private registerItemClickListener(node: Node, index: number, data: unknown, itemType: ListItemTyepe): void {
		// 如果没有设置点击回调或共享处理函数未初始化，不注册监听器
		if (!this._itemClickCallback || !this._sharedClickHandler) {
			return;
		}

		// 先移除旧的监听器（如果存在）
		this.removeItemClickListener(node);

		// 存储点击数据到 Map 中
		this._itemClickData.set(node, { index, data, itemType });

		// 注册共享的点击事件处理函数
		node.on(Node.EventType.TOUCH_END, this._sharedClickHandler, this);
	}

	/**
	 * 移除 item 节点的点击监听器
	 * @private
	 */
	private removeItemClickListener(node: Node): void {
		// 移除点击数据
		if (this._itemClickData.has(node)) {
			this._itemClickData.delete(node);
		}
		
		// 移除事件监听（如果共享处理函数存在）
		if (this._sharedClickHandler) {
			node.off(Node.EventType.TOUCH_END, this._sharedClickHandler, this);
		}
	}
}