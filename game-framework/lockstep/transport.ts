import { colyseus } from "../colyseus";
import type { LockstepMatchResult } from "./network";

/** A dedicated FS connection. The existing GS client/room remains owned by the lobby. */
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
        // Explicit reconnect must complete history synchronization before gameplay resumes.
        room.reconnection.enabled = false;
        return room;
    }

    async reconnect(reconnectionToken: string) {
        const room = await this.client.reconnect(reconnectionToken);
        room.reconnection.enabled = false;
        return room;
    }
}
