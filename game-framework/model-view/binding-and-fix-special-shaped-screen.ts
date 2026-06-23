import { bfsGetFirstChildByName, getWindowSize, isChildClassOf } from "../core/misc";
import { logger } from "../core/log";
import { CCClass, CCObject, Component, Node, Rect, UITransform, Widget, assert, equals, screen, sys } from "cc";
import { DEBUG, EDITOR } from "cc/env";
import { type BaseService } from "./base-service";
import { type BaseView } from "./base-view";
import { type BaseViewComponent } from "./base-view-component";

export const ignore = ["_name", "_objFlags", "__scriptAsset", "node", "_enabled", "__prefab", "__editorExtras__"];

/**
 * 绑定并修复异形屏幕
 * 
 * ```
 * safeArea 
 *           xMax yMax
 *   -------------
 *   |           |
 *   |           |
 *   |           |
 *   |           |
 *   |           |
 *   |           |
 *   |           |
 *   —————————————
 * xMin yMin
 * ```
 *
 * @param curr 当前视图或组件
 * @param safeArea 安全区域（矩形）
 * @param ancestor 祖先视图
 * @param cache 缓存（可选）
 * @returns 无返回值
 */
export function bindingAndFixSpecialShapedScreen(curr: BaseView<BaseService> | BaseViewComponent<BaseService, BaseView<BaseService>>, safeArea: Rect, ancestor: BaseView<BaseService>, cache?: Map<string, Node>) {
    const props = (curr.constructor as typeof CCObject).__props__.filter(p => !ignore.includes(p));
    for (let key of props) {
        let find = key;
        if (!ignore.includes(key) && key.startsWith("_")) {
            const attr = CCClass.attr(curr.constructor, key);

            // 没有ctor说明不是一个绑定装饰器
            if (attr && attr.ctor) {
                const userData = attr.userData as IGameFramework.PropertypeDefine;
                if (userData && userData.binding) {
                    if (typeof userData.binding == "boolean" && !userData.binding) continue;
                    else if (typeof userData.binding == "string") {
                        find = userData.binding;
                    }
                }

                const ignore = userData && userData.specialShapedScreen && userData.specialShapedScreen.ignore;
                const compIndex = userData && userData.compIndex && userData.compIndex;

                if (!binding(attr, curr, key, find, cache, ignore, compIndex)) {
                    continue;
                }

                if (DEBUG) {
                    const currRecord = curr as unknown as Record<string, unknown>;
                    if (!(key in currRecord) || !currRecord[key]) {
                        logger.error(`can not bind ${key} in ${curr.node.name}`);
                        continue;
                    }
                }

                if (isChildClassOf((<Record<string, any>>curr)[key].constructor, "BaseViewComponent")) {
                    bindBaseViewComponent(curr, key, safeArea, ancestor, cache);
                }

                // 在编辑器预览暂时不要做异形屏适配，因为现在编辑器预览返回的safeArea是错误的
                if (EDITOR) {
                    continue;
                }

                if (userData && userData.specialShapedScreen) {
                    fixSpecialShapedScreen(userData, safeArea, curr, key, attr);
                }
            }
        }
    }
}

/**
 * 绑定属性到视图或视图组件
 *
 * @param attr 属性对象，包含要绑定的属性名和对应的类型
 * @param curr 当前视图或视图组件实例
 * @param key 绑定的属性名
 * @param find 查找子节点的名称
 * @param cache 缓存已查找过的节点，可选参数
 * @returns 如果成功绑定，则返回true；否则返回false
 */
function binding(
    attr: { [attributeName: string]: any; },
    curr: BaseView<BaseService> | BaseViewComponent<BaseService, BaseView<BaseService>>,
    key: string,
    find: string,
    cache?: Map<string, Node>,
    ignore = false,
    compIndex = 0
) {
    if (attr.ctor === Node) {
        const n = bfsGetFirstChildByName(curr.node, find, cache);
        if (!n) {
            DEBUG && !ignore && assert((<Record<string, any>>curr)[key] != void 0, `can not find ${key} in ${curr.node.name}`);
            return false;
        }

        (<Record<string, any>>curr)[key] = bfsGetFirstChildByName(curr.node, find, cache);
    } else {
        let n = bfsGetFirstChildByName(curr.node, find, cache)!;
        if (!n) {

            if (isChildClassOf(attr.ctor, "ViewState")) {
                n = curr.node;
            } else {
                DEBUG && !ignore && assert((<Record<string, any>>curr)[key] != void 0, `can not find ${key} in ${curr.node.name}`);
                return false;
            }
        }

        if (compIndex == 0) {
            (<Record<string, any>>curr)[key] = n.getComponent(attr.ctor);
        } else {
            (<Record<string, any>>curr)[key] = n.getComponents(attr.ctor)[compIndex];
        }
    }

    return true;
}

/**
 * 绑定基础视图组件
 *
 * @param curr 当前视图或视图组件，类型为BaseView<BaseService>或BaseViewComponent<BaseService, BaseView<BaseService>>
 * @param key 组件属性名
 * @param safeArea 安全区域，类型为Rect
 * @param ancestor 祖先视图，类型为BaseView<BaseService>
 * @param cache 缓存节点，类型为Map<string, Node>，默认为undefined
 */
function bindBaseViewComponent(curr: BaseView<BaseService> | BaseViewComponent<BaseService, BaseView<BaseService>>, key: string, safeArea: Rect, ancestor: BaseView<BaseService>, cache?: Map<string, Node>) {
    const baseComponent = (<Record<string, any>>curr)[key] as BaseViewComponent<BaseService, BaseView<BaseService>>;

    const isBaseView = isChildClassOf(curr.constructor, "BaseView") || isChildClassOf(curr.constructor, "BaseViewComponent");

    if (isBaseView) {
        (curr as BaseView<BaseService>).viewComponents.push((<Record<string, any>>curr)[key]);
    }
    // 注入祖试图
    baseComponent.view = ancestor;

    // 查询子类的时候不要使用当前子类顶层的map做cache缓存。可能会节点同名冲突
    // 如果最外层启用了cache查询，这里才能开启cache缓存查询，否则不开启cache缓存查询
    bindingAndFixSpecialShapedScreen((<Record<string, any>>curr)[key], safeArea, ancestor, cache ? new Map() : void 0);
}

/**
 * 修复异形屏布局
 *
 * @param userData 游戏框架的用户数据
 * @param safeArea 安全区域
 * @param curr 当前视图或组件
 * @param key 属性键名
 * @param attr 属性对象
 */
function fixSpecialShapedScreen(userData: IGameFramework.PropertypeDefine, safeArea: Rect, curr: BaseView<BaseService> | BaseViewComponent<BaseService, BaseView<BaseService>>, key: string, attr: { [attributeName: string]: any; }) {
    if (equals(safeArea.y, 0) && equals(safeArea.height, getWindowSize().height)) {
        return;
    }

    const node = attr.ctor === Node ? (<Record<string, any>>curr)[key] as Node : ((<Record<string, any>>curr)[key] as Component).node;
    const sss = userData.specialShapedScreen!;
    const trans = node.getComponent(UITransform);
    if (!trans) return;

    // 只考虑了竖屏
    // 异形屏的情况可能非常特殊，以下实现还未达到完全体，需要充分测试和优化
    if (sss.fixWxRightTop && !sss.fixBottom) {
        if (sys.platform == sys.Platform.WECHAT_GAME) {
            fixWxTop(node, safeArea);
        } else {
            fixTop(node, safeArea);
        }
    } if (sss.fixTop && !sss.fixBottom) {
        fixTop(node, safeArea);
    }
    else if (!sss.fixTop && sss.fixBottom) {
        fixBottom(node, safeArea);
    }
    else if (sss.fixTop && sss.fixBottom) {
        fixTopAndBottom(node, safeArea);
    }
}

/**
 * 修复微信平台上右上角节点的顶部位置，以适应安全区域
 *
 * @param {Node} node
 * @param {Rect} safeArea
 */
function fixWxTop(node: Node, safeArea: Rect) {
    const widget = node.getComponent(Widget);
    if (widget) {
        DEBUG && assert(!widget.isStretchHeight, `${widget.name} is stretch height, not support fixTop`);
        DEBUG && assert(!widget.isAlignBottom, `${widget.name} is align bottom, not support fixTop`);

        // 如果是适配竖屏的异形屏，最好就是AlignTop
        if (widget.isAlignTop || widget.isAlignVerticalCenter) {
            widget.top += getWindowSize().height - safeArea.yMax;
        }
    } else {
        DEBUG && assert(false, `${node.name} is not widget, not support fixTop`);
    }
}

/**
 * 修复节点的顶部位置，以适应安全区域
 *
 * @param node 要处理的节点
 * @param safeArea 安全区域矩形，包含xMin, yMin, xMax, yMax四个属性
 */
function fixTop(node: Node, safeArea: Rect) {
    const widget = node.getComponent(Widget);
    if (widget) {
        DEBUG && assert(!widget.isStretchHeight, `${widget.name} is stretch height, not support fixTop`);
        DEBUG && assert(!widget.isAlignBottom, `${widget.name} is align bottom, not support fixTop`);

        // 如果是适配竖屏的异形屏，最好就是AlignTop
        if (widget.isAlignTop || widget.isAlignVerticalCenter) {
            widget.top += getWindowSize().height - safeArea.yMax;
        }
    } else {
        DEBUG && assert(false, `${node.name} is not widget, not support fixTop`);
    }
}

/**
 * 调整底部位置以适应安全区域
 *
 * @param node 需要调整的节点
 * @param safeArea 安全区域的大小和位置，格式为{xMin, yMin, xMax, yMax}的矩形对象
 */
function fixBottom(node: Node, safeArea: Rect) {
    const widget = node.getComponent(Widget);
    if (widget) {
        DEBUG && assert(widget.isAlignBottom || widget.isAlignHorizontalCenter, `${widget.name} is not align bottom or horizontal center, not support fixBottom`);

        if (widget.isAlignBottom || widget.isAlignVerticalCenter) {
            widget.bottom += safeArea.yMin / screen.devicePixelRatio;
        }
    } else {
        DEBUG && assert(false, `${node.name} is not widget, not support fixBottom`);
    }
}

/**
 * 修复节点的顶部和底部位置，使其适应安全区域
 *
 * @param node 要处理的节点
 * @param safeArea 安全区域信息，包含顶部和底部的安全距离
 */
function fixTopAndBottom(node: Node, safeArea: Rect) {
    const widget = node.getComponent(Widget);
    if (widget) {
        DEBUG && assert(widget.isStretchHeight, `${widget.name} is not stretch height, not support fixTop and fixBottom`);

        // 保证父节点以至于祖节点上都要有widget，并且widget的bottom要靠下为0
        if (widget.isStretchHeight) {
            widget.top += safeArea.y;
            widget.bottom += safeArea.yMin / screen.devicePixelRatio;
        }
    } else {
        DEBUG && assert(false, `${node.name} is not widget, not support fixTop and fixBottom`);
    }
}
