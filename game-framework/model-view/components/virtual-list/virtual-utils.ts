import { Node, Prefab, EventTouch } from "cc";

/**
 * 虚拟列表滑动方向
 */
export enum VirtualListDirection {
    VERTICAL = 0,
    HORIZONTAL = 1
}

/**
 * 列表布局类型
 */
export enum ListLayout {
    /** 方向布局，依据 VirtualListDirection 设置 */
    DIRECTION = 0,
    /** 网格布局 */
    GRID = 2
}

/**
 * 列表条目类型
 */
export enum ListItemTyepe {
    NORMAL = 0,
    STICKY_HEADER = 1,
    STICKY_FOOTER = 2
}

/** GRID 对齐方式（作用于交叉轴） */
export enum GridAlignment {
    START = 0,
    CENTER = 1,
    END = 2
}

/** 数据源接口，业务方可按需实现 */
export interface VirtualListDataProvider<T = unknown> {
    getItemCount(): number;
    getItemData(index: number): T;
    getItemType?(index: number): ListItemTyepe;
}

/** GRID 布局信息 */
export interface VirtualGridLineInfo {
    /** 行/列索引（主轴方向上的索引） */
    lineIndex: number;
    /** 当前元素在该行/列内的序号 */
    indexInLine: number;
    /** 该行/列包含的元素数量 */
    itemsInLine: number;
    /** 该行/列的交叉轴对齐方式，默认居中 */
    alignment?: GridAlignment;
}

/** GRID 布局委托，负责告知每个元素所属行列 */
export interface VirtualListGridDelegate {
    getGridLineInfo(index: number): VirtualGridLineInfo | null;
}

/** prefab 选择回调 */
export type VirtualListPrefabProxy<T = unknown> = (index: number, itemType: ListItemTyepe, data: T) => Prefab | null;

/** item 渲染回调 */
export type VirtualListRenderCallback<T = unknown> = (node: Node, index: number, data: T, itemType: ListItemTyepe) => void;

/**
 * 列表 Item 点击事件数据
 */
export interface VirtualListItemClickEvent<T = unknown> {
    /** 被点击的 item 索引 */
    index: number;
    /** 该 item 对应的数据 */
    data: T;
    /** item 节点 */
    node: Node;
    /** item 类型 */
    itemType: ListItemTyepe;
    /** 触发此事件的列表实例 */
    list: any; // 避免循环引用，使用 any
    /** 原始触摸事件 */
    touch: EventTouch;
    /**
     * 阻止事件继续向父列表传播
     * 在嵌套列表中，子列表 item 被点击时可调用此方法阻止父列表的点击回调
     */
    stopPropagation(): void;
}

/** item 点击回调 */
export type VirtualListItemClickCallback<T = unknown> = (event: VirtualListItemClickEvent<T>) => void;