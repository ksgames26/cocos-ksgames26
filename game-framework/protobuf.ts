import { _decorator, assert, js } from "cc";
import { DEBUG } from "cc/env";
import { logger } from "./core/log";
import { MessageType } from "./protobuf-ts";
import { implementation } from "./core/misc";

const { ccclass } = _decorator;

export * from "./protobuf-ts";

@ccclass("ProtobufSerializer")
@implementation("IGameFramework.ISerializable")
export class ProtobufSerializer implements IGameFramework.ISerializable {
    private _map = new Map<string | number, MessageType<object> & IGameFramework.ISerializer>();
    private _nameMap = new Map<string, MessageType<object> & IGameFramework.ISerializer>();

    public registerType<T extends MessageType<object> & IGameFramework.ISerializer>(clazz: IGameFramework.Constructor<T>): void {
        const inst = new clazz();
        this.registerInst(inst);
    }

    public registerInst<T extends MessageType<object> & IGameFramework.ISerializer>(inst: T): void {
        DEBUG && assert(!this._map.has(inst.protoId), `ProtobufSerializer: ${inst.protoId} is already registered.`);
        this._map.set(inst.protoId, inst);
    }

    public encoder<T extends IGameFramework.ISerializer>(clazz: T): IGameFramework.Nullable<Uint8Array> {
        const protoId = clazz.protoId;
        DEBUG && assert(!!protoId, `ProtobufSerializer: ${js.getClassName(clazz)} prototype protoId is undefined`);
        const message = this._map.get(protoId) as MessageType<object> | undefined;
        if (!message) {
            return null;
        }

        return message.toBinary(clazz);
    }

    public decoder<T extends IGameFramework.ISerializer>(protoId: string | number, buffer: Uint8Array): IGameFramework.Nullable<T> {
        const message = this._map.get(protoId) as MessageType<object> | undefined;
        if (!message) {
            return null;
        }

        return message.fromBinary(buffer) as T;
    }

    public create<T extends IGameFramework.ISerializer>(protoId: string | number): IGameFramework.Nullable<T> {
        const message = this._map.get(protoId) as MessageType<object> | undefined;
        if (!message) {
            logger.error(`ProtobufSerializer: ${protoId} is not registered.`);
            return null;
        }

        const msg = message.create() as T;
        (msg as IGameFramework.Writable<T>).protoId = protoId;
        return msg;
    }

    public getNameById(id: string | number): string | null {
        const message = this._map.get(id);
        return message ? message.typeName : null;
    }

    public createByName<T extends IGameFramework.ISerializer>(name: string): IGameFramework.Nullable<T> {
        let message = this._nameMap.get(name);

        if (!message) {
            for (const [, msg] of this._map) {
                if (msg.typeName === name) {
                    message = msg as MessageType<object> & IGameFramework.ISerializer;
                    this._nameMap.set(name, message);
                    break;
                }
            }

            if (!message) {
                logger.error(`ProtobufSerializer: ${name} is not registered.`);
                return null as any;
            }
        }

        DEBUG && assert(!!message, `ProtobufSerializer: ${name} is not registered.`);
        const msg = message.create() as T;
        (msg as IGameFramework.Writable<T>).protoId = message.protoId;
        return msg;
    }

    public clone<T>(protoId: string | number, source: T): IGameFramework.Nullable<T> {
        const message = this._map.get(protoId) as MessageType<object> | undefined;
        if (!message) {
            logger.error(`ProtobufSerializer: ${protoId} is not registered.`);
            return null;
        }

        const msg = message.clone(source as object) as T;
        (msg as IGameFramework.Writable<IGameFramework.ISerializer>).protoId = protoId;
        return msg;
    }
}
