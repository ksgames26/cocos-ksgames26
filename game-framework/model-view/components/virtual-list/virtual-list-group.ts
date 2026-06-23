import { _decorator, Component, EventTouch, Node, Vec3 } from "cc";
import { NestedScrollPriority, VirtualList } from "./virtual-list";

const { ccclass } = _decorator;

/**
 * 触摸控制权交接记录
 */
interface HandoffRecord {
    /** 溢出方向：1 表示向前溢出（顶部/左侧），-1 表示向后溢出（底部/右侧） */
    direction: number | null;
    /** 发生溢出的子列表，用于反向夺回控制权 */
    candidate: VirtualList | null;
}

/**
 * 虚拟列表组管理器
 * 
 * 用于管理一组嵌套的 VirtualList，处理触摸事件的分发和控制权转移
 * 应该挂载在最外层列表所在的节点上
 * 
 * 即使只有一个列表也需要挂载此组件，否则列表无法响应触摸事件
 * 
 * @example
 * ```
 * Scene
 * └── ParentList (VirtualList + VirtualListGroup)
 *     └── Item
 *         └── ChildList (VirtualList)
 * ```
 */
@ccclass('GameFramework/VirtualList/VirtualListGroup')
export class VirtualListGroup extends Component {
    /** 已注册的所有列表 */
    private _lists: Set<VirtualList> = new Set();
    /** 触摸ID到当前拥有者的映射 */
    private _touchOwners: Map<number, VirtualList> = new Map();
    /** 触摸ID到控制权交接记录的映射，用于反向夺回机制 */
    private _handoffMemory: Map<number, HandoffRecord> = new Map();

    /**
     * 注册列表到组
     * 
     * 当 VirtualList 启用时会自动调用此方法
     * 
     * @param list 要注册的列表实例
     */
    public registerList(list: VirtualList): void {
        this._lists.add(list);
    }

    /**
     * 取消注册列表
     * 
     * 当 VirtualList 禁用时会自动调用此方法
     * 同时会释放该列表拥有的所有触摸事件
     * 
     * @param list 要取消注册的列表实例
     */
    public unregisterList(list: VirtualList): void {
        this._lists.delete(list);
        this.releaseTouchesFor(list);
    }

    /**
     * 解析触摸事件的拥有者
     * 
     * 核心方法，负责判断当前触摸事件应该由哪个列表处理
     * 处理触摸开始、移动、结束三个阶段的逻辑
     * 
     * @param event 触摸事件对象
     * @param requester 请求处理触摸的列表
     * @param phase 触摸阶段：start（开始）、move（移动）、end（结束）
     * @returns 如果 requester 应该处理此事件返回 true，否则返回 false
     * 
     * @remarks
     * - start 阶段：选择最合适的列表作为初始拥有者
     * - move 阶段：检查是否需要转移控制权（边界溢出、反向夺回、跨轴滑动等）
     * - end 阶段：清理触摸状态
     */
    public resolveTouchOwner(event: EventTouch, requester: VirtualList, phase: "start" | "move" | "end"): boolean {
        const identifier = event.getID() ?? -1;
        const current = this._touchOwners.get(identifier);

        if (phase === "start") {
            const candidate = this.pickTouchCandidate(event) ?? requester;
            this._touchOwners.set(identifier, candidate);
            this._handoffMemory.delete(identifier);

            return candidate === requester;
        }

        if (phase === "end") {
            if (current === requester) {
                this._handoffMemory.delete(identifier);
                this._touchOwners.delete(identifier);

                return true;
            }
            return false;
        }

        if (!current) {
            const fallback = this.pickTouchCandidate(event);
            if (!fallback) {
                return false;
            }
            this._touchOwners.set(identifier, fallback);
            fallback.beginTouchFrom(event);

            return fallback === requester;
        }

        // phase === "move"
        const delta = event.getDelta();
        if (!delta) {
            return current === requester;
        }

        // 检查是否需要切换到子列表（反向夺回）
        const record = this._handoffMemory.get(identifier);
        if (record && record.candidate && record.direction !== null) {
            const childDelta = record.candidate.getAxisDelta(delta);
            // 方向相反：溢出方向和当前滑动方向相反（即往回滑）
            const isReverse = Math.abs(childDelta) > 0.1 && childDelta * record.direction < 0;
            const canScroll = record.candidate.node.activeInHierarchy && record.candidate.canScrollAlongAxis(childDelta);

            // 方向相反且子列表能滚动
            if (isReverse && canScroll) {
                const next = this.doTransfer(event, current, identifier, record.candidate);

                // 反向夺回成功后清空记录，避免重复切换
                this._handoffMemory.delete(identifier);
                if (next) {
                    return next === requester;
                }
            }
        }

        // 检查当前拥有者是否需要释放
        if (current.shouldReleaseForDelta(delta)) {
            const releaseDir = current.consumeOverflowReleaseDir();
            const fromList = releaseDir !== null ? current : null;

            // 只在边界溢出时才记录/更新 handoff（非边界释放时保留原记录）
            if (releaseDir !== null) {
                this.recordHandoff(identifier, releaseDir, fromList);
            }
            const next = this.doTransfer(event, current, identifier, null);

            if (next) {
                return next === requester;
            }
        }

        return current === requester;
    }

    /**
     * 释放触摸事件
     * 
     * 当列表完成触摸处理后调用，清理相关状态
     * 
     * @param event 触摸事件对象，如果为空则释放该列表拥有的所有触摸
     * @param list 要释放触摸的列表
     */
    public releaseTouch(event: EventTouch | null | undefined, list: VirtualList): void {
        if (!event) {
            this.releaseTouchesFor(list);
            return;
        }
        const identifier = event.getID() ?? -1;
        const owner = this._touchOwners.get(identifier);
        if (owner === list) {
            this._touchOwners.delete(identifier);
            this._handoffMemory.delete(identifier);
        }
    }

    /**
     * 执行控制权转移
     * 
     * 将触摸控制权从一个列表转移到另一个列表
     * 
     * @param event 触摸事件对象
     * @param previous 之前的拥有者
     * @param identifier 触摸ID
     * @param preferred 优先选择的新拥有者，如果为 null 则自动选择
     * @returns 新的拥有者，如果转移失败则返回之前的拥有者
     */
    private doTransfer(event: EventTouch, previous: VirtualList, identifier: number, preferred: VirtualList | null): VirtualList | null {
        const next = preferred ?? this.pickTouchCandidate(event, previous);
        if (!next || next === previous) {
            return previous;
        }
        previous.cancelTouch();
        this._touchOwners.set(identifier, next);
        next.beginTouchFrom(event);
        return next;
    }

    /**
     * 记录控制权交接信息
     * 
     * 当子列表滚动到边界溢出时，记录溢出方向和子列表引用
     * 用于后续的反向夺回机制
     * 
     * @param identifier 触摸ID
     * @param direction 溢出方向：1（向前）或 -1（向后），null 表示清除记录
     * @param candidate 发生溢出的子列表
     * 
     * @example
     * 子列表向上滚动到顶部时，direction = -1（向上是负方向）
     * 此时如果用户反向向下滑动，子列表可以夺回控制权
     */
    private recordHandoff(identifier: number, direction: number | null, candidate: VirtualList | null): void {
        if (direction === null && !candidate) {
            this._handoffMemory.delete(identifier);
            return;
        }
        this._handoffMemory.set(identifier, {
            direction,
            candidate: candidate ?? null
        });
    }

    /**
     * 选择触摸候选列表
     * 
     * 根据触摸位置和层级关系选择最合适的列表来处理触摸事件
     * 
     * @param event 触摸事件对象
     * @param exclude 要排除的列表（通常是当前拥有者）
     * @returns 选中的候选列表，如果没有合适的返回 null
     * 
     * @remarks
     * 选择规则：
     * 1. 过滤出包含触摸点且处于激活状态的列表
     * 2. 按层级深度排序（深度越大越优先）
     * 3. 从最深的列表开始，优先选择 CHILD_FIRST 的列表
     * 4. 如果列表设置了 PARENT_FIRST，则作为备选
     */
    private pickTouchCandidate(event: EventTouch, exclude?: VirtualList | null): VirtualList | null {
        const candidates: VirtualList[] = [];
        this._lists.forEach((list) => {
            if (!list.node.activeInHierarchy) {
                return;
            }
            if (!this.containsPointer(list, event)) {
                return;
            }
            candidates.push(list);
        });
        if (candidates.length === 0) {
            return null;
        }
        candidates.sort((a, b) => this.getHierarchyDepth(a) - this.getHierarchyDepth(b));
        let fallback: VirtualList | null = null;
        for (let i = candidates.length - 1; i >= 0; i--) {
            const candidate = candidates[i];
            if (exclude && candidate === exclude) {
                continue;
            }
            if (!fallback) {
                fallback = candidate;
            }
            const preferParent = candidate.nestedScrollPriority === NestedScrollPriority.PARENT_FIRST && !exclude;
            if (preferParent) {
                fallback = candidate;
                continue;
            }
            return candidate;
        }
        return fallback;
    }

    /**
     * 释放列表拥有的所有触摸
     * 
     * 遍历所有触摸记录，清除指定列表拥有的触摸状态
     * 通常在列表禁用时调用
     * 
     * @param list 要释放触摸的列表
     */
    private releaseTouchesFor(list: VirtualList): void {
        const pending: number[] = [];
        this._touchOwners.forEach((owner, key) => {
            if (owner === list) {
                pending.push(key);
            }
        });
        pending.forEach((key) => {
            this._touchOwners.delete(key);
            this._handoffMemory.delete(key);
        });
    }

    /**
     * 检查触摸点是否在列表范围内
     * 
     * 将触摸点转换到列表的本地坐标系，判断是否在视口范围内
     * 
     * @param list 要检查的列表
     * @param event 触摸事件对象
     * @returns 触摸点在列表范围内返回 true，否则返回 false
     */
    private containsPointer(list: VirtualList, event: EventTouch): boolean {
        const transform = list.getViewportTransform();
        if (!transform) {
            return false;
        }
        const location = event.getUILocation();
        const local = transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
        const halfWidth = transform.width / 2;
        const halfHeight = transform.height / 2;
        return Math.abs(local.x) <= halfWidth && Math.abs(local.y) <= halfHeight;
    }

    /**
     * 获取列表在节点树中的层级深度
     * 
     * 从列表节点向上遍历到根节点，计算层级数
     * 层级越深表示越接近叶子节点
     * 
     * @param list 要计算深度的列表
     * @returns 层级深度值，根节点为 1
     * 
     * @remarks
     * 用于在多个候选列表中选择最合适的处理者
     * 通常优先选择层级更深（更接近用户交互）的列表
     */
    private getHierarchyDepth(list: VirtualList): number {
        let depth = 0;
        let cursor: Node | null = list.viewport ?? list.node;
        while (cursor) {
            depth += 1;
            cursor = cursor.parent;
        }
        return depth;
    }
}
