import { CCClass, assert, js } from "cc";
import { DEBUG } from "cc/env";
import { type BaseService } from "../model-view/base-service";
import { type BaseView } from "../model-view/base-view";

type Listener = { event: string, value: IGameFramework.EventListener<unknown>, global: boolean, count: number };
const events = new Map<Function, Listener[]>();

/**
 * 获取指定目标对象的所有事件监听器
 *
 * @param target 目标对象，继承自BaseView<BaseService>的实例
 * @returns 返回事件监听器的数组，若目标对象没有绑定任何事件监听器，则返回空数组
 */
export function getEventListeners(target: BaseView<BaseService>) {
    return events.get(target.constructor) || [];
}

/**
 * 视图事件监听器装饰器工厂函数
 * 
 * 此方法会额外增加一份内存用来存储事件信息
 * 
 * 比手写监听事件更方便，但会额外占用内存
 *
 * @param event 事件名称, 如果事件名称不填写，会用函数名称，但是如果在你的项目发布后函数名称参与了混淆，那么在分发事件的时候，可能并不能正确的监听到事件
 * @param gloabl 是否为全局事件
 * @param count 事件触发的次数限制
 * @returns 返回装饰器函数
 */
export function eventViewListener<T extends string>(event?: T, gloabl: boolean = false, count: number = Number.MAX_VALUE) {
    /**
     * 视图事件监听器装饰器
     *
     * @param target 目标视图类
     * @param propertyKey 属性名
     * @param descriptor 属性描述符
     * @returns 返回原始方法
     */
    return function (target: BaseView<BaseService>, propertyKey: string, descriptor: PropertyDescriptor) {
        event ??= descriptor.value.name as T;
        addEventListenerToView(target, event, gloabl, count, descriptor.value);
        return descriptor.value;
    };
}



/**
 *  给节点添加适配屏幕的属性
 *
 * @export
 * @param {boolean} fixTop
 * @param {boolean} fixBottom
 * @return {*}  
 */
export function adaptationOfShapedScreen(fixTop: boolean, fixBottom: boolean): (target: any, propertyKey: string) => void {
    return function (target: any, propertyKey: string) {
        let attr = CCClass.attr(target, "gameframework");
        if (attr) {
            let adpatations = attr.adaptationOfShapedScreen;
            if (!adpatations) {
                adpatations = js.createMap();
                CCClass.Attr.setClassAttr(target, "gameframework", "adaptationOfShapedScreens", adpatations);

                // 标记为不可序列化
                CCClass.Attr.setClassAttr(target, "gameframework", "serializable", false);
            }

            adpatations[propertyKey] = { fixTop, fixBottom };
        }
    };
}


/**
 * 向视图类添加事件监听器
 *
 * @param target 目标视图类
 * @param event 事件名称
 * @param gloabl 是否为全局事件
 * @param count 事件触发的次数限制
 * @param handle 事件处理函数
 */
function addEventListenerToView<T extends string>(target: BaseView<BaseService>, event: T, gloabl: boolean, count: number, handle: any) {
    let handles: Array<Listener> | undefined = events.get(target.constructor);
    DEBUG && handles && assert(!handles.find(handleItem => handleItem.event === event && handleItem.global === gloabl && handleItem.value === handle), `event ${event} already exists in ${target.constructor.name}`);

    if (!handles) {
        handles = [
            {
                event,
                value: handle,
                global: gloabl,
                count,
            }
        ];
        events.set(target.constructor, handles);
    } else {
        handles.push({
            event,
            value: handle,
            global: gloabl,
            count
        });
    }
}