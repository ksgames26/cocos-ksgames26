
import { assert, js } from "cc";
import { DEBUG, EDITOR, EDITOR_NOT_IN_PREVIEW } from "cc/env";
import { SortedSet } from "../structures/sorted-set";
import { logger } from "./log";
import { getClassInterface, interfaceOf } from "./misc";

/**
 * 依赖注入容器类
 *
 * @export
 * @class Container
 */
export class Container {

    private static _injectables: Set<IGameFramework.Constructor<unknown>> = new Set();

    /**
     * 单例类型
     * 
     * 这里面的类型都是实现了ISingleton接口的类型
     * 
     * 接收每帧update驱动
     *
     * @private
     * @static
     * @type {Array<IGameFramework.ISingleton>}
     * @memberof Container
     */
    private static _singletons: SortedSet<IGameFramework.ISingleton> = new SortedSet<IGameFramework.ISingleton>((a, b) => {
        let aOrder = a.updateOrder ?? 0;
        let bOrder = b.updateOrder ?? 0;
        return aOrder - bOrder;
    });

    static {
        // @ts-ignore
        globalThis.__GF_Container ??= Container;
    }

    /**
     * 有且仅有一个实例的类，但是没有实现ISingleton接口
     * 
     * 每帧不参与update驱动
     *
     * @private
     * @static
     * @type {Map<IGameFramework.Constructor<unknown>, Object>}
     * @memberof Container
     */
    private static _otherInstances: Map<IGameFramework.Constructor<unknown>, Object> = new Map();

    /**
     * 这些是实现了特殊接口的类，可以通过接口创建的类型
     *
     * @private
     * @static
     * @type {Map<string, IGameFramework.Constructor<unknown>>}
     * @memberof Container
     */
    private static _types: Map<string, IGameFramework.Constructor<unknown>> = new Map();

    /**
     * 每帧更新所有单例
     * 
     * 请在游戏主循环中调用此方法
     *
     * @static
     * @memberof Container
     */
    public static update() {
        for (let singleton of Container._singletons) {
            singleton.enableUpdate && singleton.onUpdate();
        }
    }

    /**
     * 获取单例或者其他实例
     *
     * @static
     * @template T
     * @param {IGameFramework.Constructor<T>} t
     * @return {*}  {IGameFramework.Nullable<T>}
     * @memberof Container
     */
    public static get<T>(t: IGameFramework.Constructor<T>): IGameFramework.Nullable<T> {
        return Container._cast(t);
    }

    /**
     * 根据名称获取实例
     *
     * @static
     * @template T
     * @param {string} name
     * @return {*}  {IGameFramework.Nullable<T>}
     * @memberof Container
     */
    public static getByName<T>(name: string): IGameFramework.Nullable<T> {
        const type = Container._types.get(name);
        if (type) {
            return Container._cast(type as IGameFramework.Constructor<T>);
        } else {
            logger.error("Container.getByName: " + name + " not found");
        }
    }

    /**
     * 如果实力已经注入接口类型
     * 
     * 则可以通过接口获取实例
     * 
     * 注入接口请使用implementation类装饰器
     *
     * @static
     * @template T
     * @param {string} iface
     * @return {*}  {IGameFramework.Nullable}
     * @memberof Container
     */
    public static getInterface<U extends (keyof IGameFramework)>(iface: U): IGameFramework.Nullable<IGameFramework.StringInterface<U>> {
        for (let instance of Container._singletons) {
            if (interfaceOf(instance, iface)) {
                return instance as IGameFramework.StringInterface<U>;
            }
        }

        for (let [_, other] of Container._otherInstances) {
            if (interfaceOf(other, iface)) {
                return other as IGameFramework.StringInterface<U>;
            }
        }

        return null;
    }

    /**
     * 是否存在单例或者其他实例
     *
     * @static
     * @param { IGameFramework.Constructor<T>} t
     * @return {*}  {boolean}
     * @memberof Container
     */
    public static contains<T>(t: IGameFramework.Constructor<T>): boolean {
        return !!Container._cast(t);
    }

    /**
     * 注入单例
     *
     * @static
     * @template T
     * @param {IGameFramework.Constructor<T>} ctor
     * @param {Parameters<InstanceType<typeof ctor>["onStart"]>[0]} [args]
     * @return {*}  {T}
     * @memberof Container
     */
    public static addSingleton<T extends IGameFramework.ISingleton>(ctor: IGameFramework.Constructor<T>, args?: Parameters<InstanceType<typeof ctor>["onStart"]>[0]): T {
        const cast = Container._cast(ctor);
        if (cast) {
            return cast;
        }

        const instance = new ctor();
        instance.onStart(args);
        Container._singletons.add(instance);

        const name = js.getClassName(ctor);
        Container._registerType(name, ctor);

        DEBUG && logger.log("注入实例: " + js.getClassName(instance));

        return instance;
    }

    /**
     * 注入其他实例
     *
     * @static
     * @template T
     * @param {IGameFramework.Constructor<T>} t
     * @return {*}  {T}
     * @memberof Container
     */
    public static addInstance<T extends object>(t: IGameFramework.Constructor<T>): T {
        let instance = Container._cast(t);
        if (instance) {
            return instance;
        }

        instance = new t();
        Container._otherInstances.set(t, instance);

        const name = js.getClassName(t);
        Container._registerType(name, t);

        DEBUG && logger.log("注入实例: " + js.getClassName(instance));

        return instance;
    }

    /**
     * 自动注册实例
     *
     * @static
     * @template TargetPath
     * @memberof Container
     */
    public static injectable<T>(): (target: IGameFramework.Constructor<T>) => IGameFramework.Constructor<T> {
        const invoke = (target: IGameFramework.Constructor<T>) => {
            Container._injectables.add(target);
            return target;
        };

        if (EDITOR) {
            if (!EDITOR_NOT_IN_PREVIEW) {
                return invoke;
            }

            return (target: IGameFramework.Constructor<T>) => {
                return target;
            };
        }

        return invoke;
    }

    /**
     * 注册所有injectables
     *
     * @static
     * @memberof Container
     */
    public static registerInjectables() {
        for (let ctor of Container._injectables) {

            const name = js.getClassName(ctor);
            Container._registerType(name, ctor);

            const cast = Container._cast(ctor);
            if (cast) {
                continue;
            }

            const instance = new (ctor as IGameFramework.Constructor<IGameFramework.ISingleton>)();
            if ("onUpdate" in instance && "onStart" in instance) {
                instance.onStart(null);
                Container._singletons.add(instance);
            } else {
                Container._otherInstances.set(ctor, instance)
            }
            DEBUG && logger.log("注入实例: " + js.getClassName(instance));
        }

        // 清空所有注册相关的缓存
        Container._injectables.clear();
    }

    /**
     * 注入一个实现了某个接口的类型
     *
     * @static
     * @template T
     * @param {IGameFramework.Constructor<T>} ctor
     * @memberof Container
     */
    public static registerType<T>(ctor: IGameFramework.Constructor<T>) {
        let iface = getClassInterface(ctor);
        DEBUG && assert(!!iface, `${js.getClassName(ctor)} must implement some interface`);
        DEBUG && assert(Container._types.get(iface) === void 0, `${js.getClassName(ctor)} has been registered`);

        Container._registerType(iface, ctor);
    }

    /**
     * 根据接口获取实例
     *
     * @static
     * @template T
     * @param {string} iface
     * @return {*}  {IGameFramework.Nullable<T>}
     * @memberof Container
     */
    public static newType<T>(iface: string, ...args: any[]): IGameFramework.Nullable<T> {
        let ctor = Container._types.get(iface) as IGameFramework.Nullable<IGameFramework.Constructor<T>>;
        if (!ctor) {
            return null;
        }
        return new ctor(args);
    }

    private static _registerType(nameOrIface: string, type: IGameFramework.Constructor<unknown>): void {
        const has = Container._types.get(nameOrIface);
        if (has) {
            logger.error("有同名类型多次注入");
            return;
        }

        Container._types.set(nameOrIface, type);
    }

    private static _cast<T>(t: IGameFramework.Constructor<T>): IGameFramework.Nullable<T> {
        for (let instance of Container._singletons) {
            if (instance.constructor === t) {
                return instance as T;
            }
        }

        if (Container._otherInstances.has(t)) {
            return Container._otherInstances.get(t) as T;
        }

        return null;
    }
}

