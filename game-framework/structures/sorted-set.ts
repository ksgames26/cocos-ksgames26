/**
 * 有序集合
 *
 * @export
 * @class SortedSet
 * @template T
 */
export class SortedSet<T> {
    private _length: number;
    private _elements: Array<T>;

    /**
     * 比较函数
     *
     * @private
     * @memberof AbilitySet
     */
    private compatator: (a: T, b: T) => number;

    /**
     *
     * @param compatator 比较函数
     *
     * (a,b) => {return a-b};
     */
    public constructor(compatator: (a: T, b: T) => number) {
        this._length = 0;
        this._elements = [];

        this.clear();
        this.compatator = compatator;
    }

    /**
     * 总长度
     */
    public size() {
        return this._elements.length;
    }

    /**
     * 返回最后一个
     */
    public last(): T {
        return this._elements[this._length - 1];
    }

    /**
     * 返回第一个
     */
    public first(): T {
        return this._elements[0];
    }

    /**
     * 是否是空Set
     */
    public get isEmpty() {
        return this.size() === 0;
    }

    /**
     * 移除最后一个
     */
    public pollLast() {
        if (this._length > 0) {
            this._length--;
            return this._elements.splice(this._length, 1)[0];
        }
        return null;
    }

    /**
     * 移除第一个
     */
    public pollFirst() {
        if (this._length > 0) {
            this._length--;
            return this._elements.splice(0, 1)[0];
        }
        return null;
    }

    /**
     * 遍历当前所有的元素
     * 
     * 回调函数如果返回的true，则删除该元素
     * 
     * @param cb
     */
    public erase(cb: (e: T) => boolean): T[] {
        const removes: Array<T> = [];
        for (let i = 0; i < this._length; ++i) {
            let remove = cb(this._elements[i]);
            if (remove) {
                removes.push(this._elements.splice(i, 1)[0]);
                --i;
                this._length--;
            }
        }
        return removes;
    }

    public find(cb: (e: T) => boolean): IGameFramework.Nullable<T> {
        for (let i = 0; i < this._length; ++i) {
            let remove = cb(this._elements[i]);
            if (remove) {
                return this._elements[i];
            }
        }

        return null;
    }

    public findIndex(cb: (e: T) => boolean): number {
        for (let i = 0; i < this._length; ++i) {
            let remove = cb(this._elements[i]);
            if (remove) {
                return i;
            }
        }

        return -1;
    }

    public remove(cb: (e: T) => boolean): IGameFramework.Nullable<T> {
        for (let i = 0; i < this._length; ++i) {
            let remove = cb(this._elements[i]);
            if (remove) {
                this._length--;
                return this._elements.splice(i, 1)[0];
            }
        }

        return null;
    }

    /**
     * 遍历当前所有的元素
     * 
     * 回调函数如果返回的true，则删除该元素
     * 
     * @param cb
     */
    public forEach(cb: (e: T) => boolean): void {
        for (let i = 0; i < this._length; ++i) {
            let remove = cb(this._elements[i]);
            if (remove) {
                this._elements.splice(i, 1);
                --i;
                this._length--;
            }
        }
    }

    /**
     * 添加一个值
     * @param element
     */
    public add(element: T) {
        let index = this.binarySearch(element);
        if (index > -1 && this._elements[index] === element) {
            return;
        }

        if (index < 0) {
            index = -index - 1;
        }
        this._elements.splice(index, 0, element);
        this._length++;
    }

    /**
     * 删除
     * @param element 值
     */
    public removeEle(element: T): boolean {
        let idx = this._elements.indexOf(element);
        if (idx != -1) {
            this._elements.splice(idx, 1);
            this._length--;

            return true;
        }

        return false;
    }

    /**
     * 删除指定索引的元素
     *
     * @param {number} index
     * @memberof SortedSet
     */
    public delete(index: number): void {
        this._elements.splice(index, 1);
        this._length--;
    }

    /**
     * 清理Set
     */
    public clear(): void {
        this._length = 0;
        this._elements = [];
    }

    public [Symbol.iterator]() {
        return this._elements[Symbol.iterator]();
    }

    /**
     * 查索引
     * @param value
     */
    public binarySearch(value: T): number {
        let low = 0;
        let high = this._elements.length - 1;

        const compatator = this.compatator;
        const elements = this._elements;
        while (low <= high) {
            let mid = (low + high) >>> 1;
            let midValue = elements[mid];
            let cmp = compatator.call(this, midValue, value);
            if (cmp < 0) {
                low = mid + 1;
            } else if (cmp > 0) {
                high = mid - 1;
            } else {
                return mid;
            }
        }

        return -(low + 1);
    }
}
