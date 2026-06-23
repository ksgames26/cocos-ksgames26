import { js } from "cc";
import { DEBUG } from "cc/env";
import { logger } from "./log";

/**
 * 依赖注入相关的工具类
 */
export class Injector {
    private static _injectedParams: Map<IGameFramework.Constructor<unknown>, { propertyKey: string | symbol, parameterIndex: number }[]> = new Map();
    private static _dependencyTypes: Map<string, IGameFramework.Constructor<unknown>> = new Map();

    /**
     * 参数注入装饰器
     *
     * @static
     * @template T
     * @param {IGameFramework.Constructor<T>} dependencyType
     * @return {*}  
     * @memberof Injector
     */
    public static injectObj<T extends Object>(dependencyType: IGameFramework.Constructor<T>) {
        return function (target: Object, propertyKey: string | symbol, parameterIndex: number) {
            if (!Injector._injectedParams.has(target.constructor as IGameFramework.Constructor<unknown>)) {
                Injector._injectedParams.set(target.constructor as IGameFramework.Constructor<unknown>, []);
            }
            Injector._injectedParams.get(target.constructor as IGameFramework.Constructor<unknown>)!.push({ propertyKey, parameterIndex });

            // 存储依赖类型
            const key = `${target.constructor.name}_${String(propertyKey)}_${parameterIndex}`;
            Injector._dependencyTypes.set(key, dependencyType);
        };
    }

    /**
     * 执行依赖注入
     *
     * @static
     * @param {Object} instance
     * @param {(ctor: IGameFramework.Constructor<Object>) => any} getDependency 获取依赖的回调函数
     * @memberof Injector
     */
    public static performInjection(instance: Object, getDependency: (ctor: IGameFramework.Constructor<Object>) => any) {
        const ctor = instance.constructor as IGameFramework.Constructor<unknown>;
        const injectedParams = Injector._injectedParams.get(ctor);

        if (!injectedParams || injectedParams.length === 0) {
            return;
        }

        // 检查实例是否有inject方法
        if (typeof (instance as any).inject === 'function') {
            // 构建inject方法的参数
            const injectArgs: any[] = [];

            // 按参数索引排序
            const sortedParams = injectedParams.sort((a, b) => a.parameterIndex - b.parameterIndex);

            for (let param of sortedParams) {
                const dependencyType = Injector._getDependencyType(ctor, param.propertyKey, param.parameterIndex);
                if (dependencyType) {
                    const dependency = getDependency(dependencyType as IGameFramework.Constructor<Object>);
                    if (!dependency) {
                        DEBUG && logger.error(`Dependency ${js.getClassName(dependencyType)} not found for ${js.getClassName(ctor)}`);
                        continue;
                    }
                    injectArgs[param.parameterIndex] = dependency;
                }
            }

            // 调用inject方法
            (instance as any).inject(...injectArgs);
        }
    }

    /**
     * 获取依赖类型
     *
     * @private
     * @static
     * @param {IGameFramework.Constructor<unknown>} ctor
     * @param {(string | symbol)} propertyKey
     * @param {number} parameterIndex
     * @return {*}  {IGameFramework.Nullable<IGameFramework.Constructor<unknown>>}
     * @memberof Injector
     */
    private static _getDependencyType(ctor: IGameFramework.Constructor<unknown>, propertyKey: string | symbol, parameterIndex: number): IGameFramework.Nullable<IGameFramework.Constructor<unknown>> {
        const key = `${ctor.name}_${String(propertyKey)}_${parameterIndex}`;
        return Injector._dependencyTypes.get(key) || null;
    }

    /**
     * 清空注入参数缓存
     *
     * @static
     * @memberof Injector
     */
    public static clearCache() {
        Injector._injectedParams.clear();
        Injector._dependencyTypes.clear();
    }

    /**
     * 检查是否有注入参数
     *
     * @static
     * @param {IGameFramework.Constructor<unknown>} ctor
     * @return {*}  {boolean}
     * @memberof Injector
     */
    public static hasInjectedParams(ctor: IGameFramework.Constructor<unknown>): boolean {
        const params = Injector._injectedParams.get(ctor);
        return !!(params && params.length > 0);
    }
}
