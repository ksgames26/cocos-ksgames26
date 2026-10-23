import { colyseus } from "../colyseus";
import type { LockstepMatchResult } from "./network";

/** 创建独立 FS 连接；已有 GS 客户端和房间仍由大厅持有。 */
export class LockstepTransport {
    private readonly client: InstanceType<typeof colyseus.Client>;

    constructor(endpoint: string) {
        this.client = new colyseus.Client(endpoint);
    }

    async connect(result: LockstepMatchResult) {
        if (
            result.status !== "matched" ||
            !result.manifest ||
            !result.reservation
        ) {
            throw new Error("A server-issued match reservation is required");
        }
        const reservation = result.reservation as Parameters<
            typeof this.client.consumeSeatReservation
        >[0];
        const room = await this.client.consumeSeatReservation(reservation);
        // 通过显式重连流程补齐历史帧后，再恢复玩法逻辑。
        room.reconnection.enabled = false;
        return room;
    }

    async reconnect(reconnectionToken: string) {
        const room = await this.client.reconnect(reconnectionToken);
        room.reconnection.enabled = false;
        return room;
    }
}
