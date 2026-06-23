import { ILoginAdapter, IPal } from "../ipal";

export class EmptyPal implements IPal {
    private _adapter: ILoginAdapter = null!;

    public set adapter(adapter: ILoginAdapter) {
        this._adapter = adapter;
    }
    public get adapter(): ILoginAdapter {
        return this._adapter;
    }

    public get openId(): string {
        return "empty";
    }

    public async login<T>(username?: string, password?: string): Promise<T> {
        return Promise.resolve(1 as T);
    }

    public async logout(): Promise<void> {

    }
}