/** Structural protobuf codec, shared by generated client protocols. */
export interface ResponseCodec<T = any> {
  readonly protoId: number;
  fromBinary(bytes: Uint8Array): T;
}
export type ResponseMap = Readonly<Record<string, ResponseCodec>>;
export type ResponseResult<R extends ResponseMap> = {
  [K in keyof R]: { kind: K; body: ReturnType<R[K]["fromBinary"]> };
}[keyof R];

export interface ReplyEnvelope {
  resUniqueId: number;
  resBodyId: number;
  resBody: Uint8Array;
  resCode: number;
}

export class ProtocolRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "ProtocolRequestError";
  }
}

/** Owns only outstanding requests. Every completion path removes its timer and callback. */
export class ProtocolRequests {
  private readonly pending = new Map<
    number,
    {
      receive(reply: ReplyEnvelope): void;
      reject(error: Error): void;
    }
  >();

  public get size(): number {
    return this.pending.size;
  }

  public request<const R extends ResponseMap>(
    id: number,
    responses: R,
    send: () => void,
    timeoutMs = 20000,
  ): Promise<ResponseResult<R>> {
    const entries = Object.entries(responses);
    if (
      !entries.length ||
      new Set(entries.map(([, codec]) => codec.protoId)).size !== entries.length
    ) {
      return Promise.reject(
        new ProtocolRequestError(
          "Responses must have distinct IDs and cannot be empty",
        ),
      );
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || this.pending.has(id)) {
      return Promise.reject(
        new ProtocolRequestError("Invalid timeout or duplicate request ID"),
      );
    }
    return new Promise((resolve, reject) => {
      const finish = (error?: Error, value?: ResponseResult<R>) => {
        if (!this.pending.delete(id)) return;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value!);
      };
      const timer = setTimeout(
        () => finish(new ProtocolRequestError("Request timed out")),
        timeoutMs,
      );
      this.pending.set(id, {
        reject: (error) => finish(error),
        receive: (envelope) => {
          try {
            if (envelope.resCode !== 0) {
              throw new ProtocolRequestError(
                "Server rejected request",
                envelope.resCode,
              );
            }
            const selected = entries.find(
              ([, codec]) => codec.protoId === envelope.resBodyId,
            );
            if (!selected)
              throw new ProtocolRequestError(
                "Unexpected response protocol: " + envelope.resBodyId,
              );
            const [kind, codec] = selected;
            finish(undefined, {
              kind,
              body: codec.fromBinary(envelope.resBody),
            } as ResponseResult<R>);
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
          }
        },
      });
      try {
        send();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Return true when an envelope belongs to a typed request. Decode before legacy dispatch. */
  public accept(reply: ReplyEnvelope): boolean {
    const request = this.pending.get(reply.resUniqueId);
    if (!request) return false;
    request.receive(reply);
    return true;
  }

  public close(): void {
    for (const request of this.pending.values()) {
      request.reject(new ProtocolRequestError("Room closed"));
    }
  }
}
