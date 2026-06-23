import { game, sys } from "cc";
import { EventDispatcher } from "../core/event-dispatcher";
import { isEmptyStr } from "../core/misc";

const encoder = ($0: string): string => {
    return Array.from($0)
        .map((char) => String.fromCharCode(char.charCodeAt(0) + 3))
        .join('');
};

const decoder = ($0: string): string => {
    return Array.from($0)
        .map((char) => String.fromCharCode(char.charCodeAt(0) - 3))
        .join('');
};

export abstract class SaveProxy<T> extends EventDispatcher<{ value: T }> {
    protected _key: string = "";
    protected _hashKey: string = "";
    protected _defaultValue: T = null!;
    protected _value: T = null!;
    protected _encoding: boolean = true;
    protected _start: number = 0;
    protected _end: number = 0;

    public static clearAll(): void {
        sys.localStorage.clear();
    }

    public initialize(end: number): this {
        this._end = end;
        const value = sys.localStorage.getItem(this.getHashKey());
        if (value == null || value == "" || value == void 0) {
            sys.localStorage.setItem(this._hashKey, this.getHashValue());
        } else {
            this.setValue(value);
        }

        return this;
    }

    public constructor(key: string, initValue: T, encoding: boolean) {
        super();
        this._key = key;
        this._defaultValue = initValue;
        this._value = initValue;
        this._encoding = encoding;
        this._hashKey = this.getHashKey();
    }

    public get key(): string {
        return this._key;
    }

    public get value(): T {
        return this._value;
    }

    public refresh(value: T): void {
        this._value = value;
        sys.localStorage.setItem(this._hashKey, this.getHashValue());
        this.dirty();
    }

    public dirty(): void {
        this.dispatch("value", this._value);
    }

    public update(value: T): void {
        this._start += game.deltaTime;
        if (this._start >= this._end) {
            this.refresh(value);
            this._start = 0;
        }
    }

    public setDefault(): void {
        this._value = this._defaultValue;
        sys.localStorage.setItem(this._hashKey, this.getHashValue());
    }

    public remove(): void {
        sys.localStorage.removeItem(this.getHashKey());
    }

    protected getHashKey(): string {
        throw new Error("Method not implemented.");
    }

    protected getHashValue(): string {
        throw new Error("Method not implemented.");
    }

    protected setValue(value: string): void {
        throw new Error("Method not implemented.");
    }

    protected encoder(str: string): string {
        if (this._encoding) {
            return encoder(str);
        }
        return str;
    }

    protected decoder(str: string): string {
        if (this._encoding) {
            return decoder(str);
        }
        return str;
    }
}

export class SaveStringProxy extends SaveProxy<string> {

    protected override getHashKey(): string {
        // encoder
        if (this._encoding) {
            return encoder(this._key);
        }
        return this._key;
    }

    protected override getHashValue(): string {
        // encoder
        if (this._encoding) {
            return encoder(this._value!);
        }
        return this._value as string;
    }

    protected override setValue(value: string): void {
        // decoder
        if (this._encoding) {
            this._value = decoder(value);
        } else {
            this._value = value;
        }
    }
}

export class SaveNumberProxy extends SaveProxy<number> {

    protected override getHashKey(): string {
        // encoder
        if (this._encoding) {
            return encoder(this._key);
        }
        return this._key;
    }

    protected override getHashValue(): string {
        // encoder
        if (this._encoding) {
            return encoder(`${this._value}`);
        }
        return `${this._value}`;
    }

    protected override setValue(value: string): void {
        // decoder
        if (this._encoding) {
            this._value = parseFloat(decoder(value));
        } else {
            this._value = parseFloat(value);
        }
    }
}

export class SaveMonoblockArrayProxy<U> extends SaveProxy<Array<U>> {
    private _equals: IGameFramework.Nullable<(a: U, b: U) => boolean> = null;

    public setEquals(equals: (a: U, b: U) => boolean): void {
        this._equals = equals;
    }

    public pushVal(value: U): void {
        this._value!.push(value);

        this.refresh(this._value!);
    }

    public findVal(val: U): IGameFramework.Nullable<U> {
        if (!this._equals) {
            throw new Error("equals is null");
        }

        return this._value!.find(e => this._equals!(e, val));
    }

    public changeVal(val: U, newVal: U): void {
        if (!this._equals) {
            throw new Error("equals is null");
        }

        const index = this._value!.findIndex(e => this._equals!(e, val));
        if (index === -1) {
            return;
        }
        this._value![index] = newVal;
        this.refresh(this._value!);
    }

    public removeVal(val: U): void {
        if (!this._equals) {
            throw new Error("equals is null");
        }

        const index = this._value!.findIndex(e => this._equals!(e, val));
        if (index === -1) {
            return;
        }
        this._value!.splice(index, 1);
        this.refresh(this._value!);
    }

    public setDefault(): void {
        // deep copy
        this._value = JSON.parse(JSON.stringify(this._defaultValue));
        sys.localStorage.setItem(this.getHashKey(), this.getHashValue());
    }

    protected override getHashKey(): string {
        // encoder
        if (this._encoding) {
            return encoder(this._key);
        }
        return this._key;
    }

    protected override getHashValue(): string {
        // encoder
        if (this._encoding) {
            return encoder(this._value!.map(e => JSON.stringify(e)).join("&"));
        }
        return this._value!.map(e => JSON.stringify(e)).join("&");
    }

    protected override setValue(value: string): void {
        if (isEmptyStr(value)) {
            this._value = [];
            return;
        }

        // decoder
        if (this._encoding) {
            this._value = decoder(value).split("&").map(v => JSON.parse(v));
        } else {
            this._value = value.split("&").map(v => JSON.parse(v));
        }
    }
}

export class SaveBlockArrayProxy<U> extends SaveProxy<Array<U>> {
    private _equals: IGameFramework.Nullable<(a: U, b: U) => boolean> = null;
    public setEquals(equals: (a: U, b: U) => boolean): void {
        this._equals = equals;
    }

    private _getUid: IGameFramework.Nullable<(val: U) => string | number> = null;
    public setGetUid(getUid: (val: U) => string | number): void {
        this._getUid = getUid;
    }

    public initialize(end: number): this {
        this._end = end;
        const infos = sys.localStorage.getItem(this.getHashKey()) as IGameFramework.Nullable<string>;
        if (infos == null || infos == "" || infos == void 0) {
            this.iterSet();
        } else {
            let infosArray = super.decoder(infos).split("&");
            let prefix = infosArray[0];
            let keys = JSON.parse(infosArray[1]);

            for (let i = 0; i < keys.length; ++i) {
                this._value.push(JSON.parse(sys.localStorage.getItem(super.encoder(`${prefix}-${keys[i]}`))));
            }
        }

        return this;
    }

    public setDefault(): void {
        // deep copy
        this._value = JSON.parse(JSON.stringify(this._defaultValue));
        this.clear();
        this.iterSet();
    }

    public pushVal(value: U): void {
        this._value!.push(value);
        sys.localStorage.setItem(super.encoder(`${this._key}-${this._getUid!(value)}`), super.encoder(JSON.stringify(value)));
        this.setRawInfo();
    }

    public removeVal(val: U): void {
        if (!this._equals) {
            throw new Error("equals is null");
        }

        const index = this._value!.findIndex(e => this._equals!(e, val));
        if (index === -1) {
            return;
        }
        const u = this._value!.splice(index, 1)[0];
        sys.localStorage.removeItem(super.encoder(`${this._key}-${this._getUid!(u)}`));
        this.setRawInfo();
        super.dirty();
    }

    public findVal(val: U): IGameFramework.Nullable<U> {
        if (!this._equals) {
            throw new Error("equals is null");
        }

        return this._value!.find(e => this._equals!(e, val));
    }

    public refreshVal(value: U): void {
        if (!this._equals) {
            throw new Error("equals is null");
        }

        const index = this._value.findIndex(e => this._equals!(e, value));
        if (index !== -1) {
            this._value[index] = value;
        }
        sys.localStorage.setItem(super.encoder(`${this._key}-${this._getUid!(this._value[index])}`), super.encoder(JSON.stringify(this._value![index])));

        super.dirty();
    }

    public refresh(value: Array<U>): void {
        this._value = value;
        this.clear();
        this.iterSet();
        super.dirty();
    }

    protected override getHashKey(): string {
        // encoder
        if (this._encoding) {
            return encoder(this._key);
        }
        return this._key;
    }

    private setRawInfo(): void {
        sys.localStorage.setItem(this.getHashKey(), super.encoder(`${this._key}&${JSON.stringify(this._value.map(v => this._getUid!(v)))}`));
    }

    private clear(): void {
        const infos = sys.localStorage.getItem(this.getHashKey()) as IGameFramework.Nullable<string>;
        if (infos) {
            for (let i = 0; i < this._value.length; ++i) {
                sys.localStorage.removeItem(super.encoder(`${this._key}-${this._getUid!(this._value[i])}`));
            }
        }

        sys.localStorage.removeItem(this.getHashKey());
    }

    private iterSet(): void {
        this.setRawInfo();
        if (this._value.length > 0) {
            for (let i = 0; i < this._value.length; ++i) {
                sys.localStorage.setItem(super.encoder(`${this._key}-${this._getUid!(this._value[i])}`), super.encoder(JSON.stringify(this._value![i])));
            }
        }
    }
}

export class SaveJsonProxy<U> extends SaveProxy<U> {

    protected override getHashKey(): string {
        // encoder
        if (this._encoding) {
            return encoder(this._key);
        }
        return this._key;
    }

    protected override getHashValue(): string {
        // encoder
        if (this._encoding) {
            return encoder(JSON.stringify(this._value));
        }
        return JSON.stringify(this._value);
    }

    protected override setValue(value: string): void {
        // decoder
        if (this._encoding) {
            this._value = JSON.parse(decoder(value));
        } else {
            this._value = JSON.parse(value);
        }
    }
}