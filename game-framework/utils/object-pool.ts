

export class OPError extends Error {
    public constructor(info: string) {
        super(info);
    }
}

/**
 * 对象池
 *
 * @export
 * @abstract
 * @class ObjectPools
 * @template T
 */
export class ObjectPools<T extends IGameFramework.IPoolObject | Omit<IGameFramework.IPoolObject, IGameFramework.Obj>> implements IGameFramework.IDisposable {
    /**
     * 对象池
     *
     * @private
     * @type {Array<T>}
     * @memberof ObjectPools
     */
    private _pools: Array<T>;

    /**
     * 池内回收对象最大上限
     *
     * @private
     * @type {number}
     * @memberof ObjectPools
     */
    private _max: number;

    private _disposed: boolean = false;

    public get isDisposed(): boolean {
        return this._disposed;
    }

    /**
     * Creates an instance of ObjectPools.
     * @param {() => T} newObject
     * @memberof ObjectPools
     */
    public constructor(newObject: () => T, max: number = 128, initialize: number) {
        this.newObject = newObject
        if (initialize > max) {
            initialize = max;
        }

        if (initialize > 0) {
            const pools: T[] = (this._pools = []);
            for (let index = 0; index < pools.length; index++) {
                pools.push(newObject());
                (pools[index]! as IGameFramework.IPoolObject).inPoool = true;
            }
        } else {
            this._pools = [];
        }

        this._max = max;
    }

    /**
     * 获得
     *
     * @returns {T}
     * @memberof ObjectPools
     */
    public obtain(): T {
        const obj =
            this._pools.length === 0
                ? (this.newObject() as IGameFramework.IPoolObject)
                : (this._pools.pop() as IGameFramework.IPoolObject);
        obj.onCreate && obj.onCreate();
        obj.inPoool = false;
        return obj as T;
    }

    /**
     * 清理
     *
     * @memberof ObjectPools
     */
    public clear(): void {
        const pools = this._pools;

        for (let i = 0, l = this._pools.length; i < l; i++) {
            const o = pools[i] as IGameFramework.IPoolObject;
            o.dispose && o.dispose();
            o.inPoool = false;
        }

        this._pools.length = 0;
    }

    /**
     * 获取个数
     *
     * @returns {number}
     * @memberof ObjectPools
     */
    public getLength(): number {
        return this._pools.length;
    }

    /**
     * 回收
     *
     * @param {T} obj
     * @memberof ObjectPools
     */
    public free(obj: T): void {
        if (!obj) {
            throw new OPError('object cannot be null');
        }


        // 当前仅当onfree返回true且当前池内对象没有超过最大上限
        const o = obj as IGameFramework.IPoolObject;
        // 不允许二次回收
        if (o.inPoool) {
            return;
        }
        if (((o.onFree && o.onFree()) || !o.onFree) && this._pools.length <= this._max) {
            o.inPoool = true;
            this._pools.push(o as T);
        }
    }

    /**
     * 销毁
     *
     * @memberof ObjectPools
     */
    public dispose(): void {
        if (this._disposed) return;
        this._disposed = true;

        const pools = this._pools;

        for (let i = 0, l = this._pools.length; i < l; i++) {
            const o = pools[i] as IGameFramework.IPoolObject;
            o.dispose && o.dispose();
            o.inPoool = false;
        }

        this._pools.length = 0;
    }

    /**
     * 子类复写
     *
     * @protected
     * @returns {T}
     * @memberof ObjectPools
     */
    protected newObject(): T {
        throw new OPError('error');
    }
}
