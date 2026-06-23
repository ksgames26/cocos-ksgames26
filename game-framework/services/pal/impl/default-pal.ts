import { getUrlParam, isEmptyStr, uuidGenerator } from "../../../core/misc";
import { sys } from "cc";
import { ILoginAdapter, IPal } from "../ipal";

export class DefaultPal implements IPal {
    private _adapter: ILoginAdapter = null!;

    public set adapter(adapter: ILoginAdapter) {
        this._adapter = adapter;
    }
    public get adapter(): ILoginAdapter {
        return this._adapter;
    }

    private _openId: string = "";

    public get openId(): string {
        return this._openId;
    }

    public async login<T>(username?: string, password?: string): Promise<T> {
        let userId = getUrlParam(location.href, "userId");
        if (isEmptyStr(userId)) {
            userId = sys.localStorage.getItem("userId");
            if (!userId) {
                userId = uuidGenerator(16, 10);
                sys.localStorage.setItem("userId", userId);
            }
        }
        this._openId = userId;

        if (this._adapter) {
            return this._adapter.login(this._openId);
        } else {
            return Promise.resolve(null as T);
        }
    }

    public async logout(): Promise<void> {
        if (this._adapter) {
            return this._adapter.logout();
        }
    }
}