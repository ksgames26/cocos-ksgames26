import { EventDispatcher } from "../core/event-dispatcher";

export class ObserverValue<T> extends EventDispatcher<{ change: T }> {
    protected _key: string;
    protected _value: T;

    public constructor(k: string, t: T) {
        super();
        this._key = k;
        this._value = t;
    }

    public set value(t: T) {
        if (this._value == t) {
            return;
        }

        this._value = t;
        this.emit();
    }
    
    public emit(): void {
        this.dispatch("change", this._value);
    }

    public get value() {
        return this._value;
    }
}