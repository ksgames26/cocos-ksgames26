export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type HttpQueryValue = string | number | boolean | null | undefined;
export type HttpQuery = Readonly<
    Record<string, HttpQueryValue | readonly HttpQueryValue[]>
>;

export interface HttpCredentialStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface HttpGameSession {
    readonly userId: string;
    readonly realmId: number;
    readonly worldId: number;
    readonly expiresInSeconds: number;
    readonly expiresAt: number;
}

export interface HttpGameClientOptions {
    /** Public HTTP origin, optionally with a reverse-proxy prefix; do not append /api. */
    baseUrl: string;
    realmId?: number;
    storage: HttpCredentialStorage;
    /** Separates games sharing the same public address. */
    storageNamespace?: string;
    timeoutMs?: number;
    /** Non-authentication headers shared by login and business requests. */
    headers?: Readonly<Record<string, string>>;
    /** Cocos uses its platform XMLHttpRequest adapter by default. */
    createXHR?: () => XMLHttpRequest;
}

export interface HttpRequestOptions {
    method?: HttpMethod;
    query?: HttpQuery;
    body?: unknown;
    headers?: Readonly<Record<string, string>>;
    timeoutMs?: number;
    /** Explicitly public routes do not log in or send a session token. */
    auth?: boolean;
}

export type HttpRequestErrorKind =
    | 'http'
    | 'network'
    | 'timeout'
    | 'cancelled'
    | 'invalid-response'
    | 'configuration'
    | 'storage';

export class HttpRequestError extends Error {
    constructor(
        message: string,
        public readonly kind: HttpRequestErrorKind,
        public readonly status = 0,
        public readonly serverCode?: number,
    ) {
        super(message);
        this.name = 'HttpRequestError';
    }
}

type AuthSession = {
    info: Readonly<HttpGameSession>;
    token: string;
    refreshAt: number;
};
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function configuration(message: string): never {
    throw new HttpRequestError(message, 'configuration');
}

function timeout(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
        configuration('HTTP timeout must be a positive 32-bit integer');
    }
    return value;
}

function headers(...sources: (Readonly<Record<string, string>> | undefined)[]) {
    const result: Record<string, string> = { accept: 'application/json' };
    for (const source of sources) {
        for (const [name, value] of Object.entries(source ?? {})) {
            const key = name.toLowerCase();
            if (
                !/^[a-z0-9-]+$/.test(key) ||
                typeof value !== 'string' ||
                /[\r\n]/.test(value)
            ) {
                configuration('Invalid HTTP header');
            }
            if (
                [
                    'authorization',
                    'cookie',
                    'host',
                    'content-type',
                    'content-length',
                ].includes(key)
            ) {
                configuration(
                    'Authentication and content headers are managed by HttpGameClient',
                );
            }
            result[key] = value;
        }
    }
    return result;
}

function queryString(query?: HttpQuery): string {
    const parts: string[] = [];
    for (const [key, raw] of Object.entries(query ?? {})) {
        for (const value of Array.isArray(raw) ? raw : [raw]) {
            if (value === null || value === undefined) continue;
            if (
                !['string', 'number', 'boolean'].includes(typeof value) ||
                (typeof value === 'number' && !Number.isFinite(value))
            ) {
                configuration(
                    'HTTP query values must be finite numbers, strings or booleans',
                );
            }
            parts.push(
                encodeURIComponent(key) +
                    '=' +
                    encodeURIComponent(String(value)),
            );
        }
    }
    return parts.length ? '?' + parts.join('&') : '';
}

/** JSON client for the independent HTTP + DB server. No Player, room or protobuf dependency. */
export class HttpGameClient {
    public readonly baseUrl: string;
    public readonly realmId: number;
    private readonly storageKey: string;
    private readonly storage: HttpCredentialStorage;
    private readonly timeoutMs: number;
    private readonly defaultHeaders: Record<string, string>;
    private readonly createXHR: () => XMLHttpRequest;
    private readonly active = new Set<() => void>();
    private authSession?: AuthSession;
    private pendingLogin?: Promise<AuthSession>;
    private credential?: string;
    private epoch = 0;
    private disposed = false;

    constructor(options: HttpGameClientOptions) {
        const base = options.baseUrl.replace(/\/+$/, '');
        // Keep credentials on this configured origin; paths cannot select another origin.
        if (
            !/^https?:\/\/(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::\d+)?(?:\/[a-zA-Z0-9_-]+)*$/.test(
                base,
            )
        ) {
            configuration(
                'Expected an HTTP(S) base URL without credentials, query or fragment',
            );
        }
        if (base.endsWith('/api'))
            configuration('baseUrl must not include the /api prefix');
        this.baseUrl = base;
        this.realmId = options.realmId ?? 0;
        if (!Number.isSafeInteger(this.realmId) || this.realmId < 0)
            configuration('Invalid realmId');
        this.storage = options.storage;
        this.storageKey = `ksgames26.http.guest:${encodeURIComponent(options.storageNamespace ?? 'game')}:${encodeURIComponent(base)}:realm:${this.realmId}`;
        this.timeoutMs = timeout(options.timeoutMs ?? 15000);
        this.defaultHeaders = headers(options.headers);
        this.createXHR = options.createXHR ?? (() => new XMLHttpRequest());
    }

    /** Snapshot excludes both credentials. worldId is refreshed when the session is renewed. */
    public get session(): Readonly<HttpGameSession> | null {
        return this.authSession?.info ?? null;
    }

    public get isDisposed(): boolean {
        return this.disposed;
    }

    /** Coalesces concurrent logins, restoring the persisted credential before creating a guest. */
    public async loginGuest(): Promise<Readonly<HttpGameSession>> {
        const epoch = this.epoch;
        const session = await this.ensureSession(epoch);
        this.check(epoch);
        return session.info;
    }

    public get<T = unknown>(path: string, query?: HttpQuery): Promise<T> {
        return this.request<T>(path, { query });
    }

    public post<T = unknown>(path: string, body?: unknown): Promise<T> {
        return this.request<T>(path, { method: 'POST', body });
    }

    public async request<T = unknown>(
        path: string,
        options: HttpRequestOptions = {},
    ): Promise<T> {
        const epoch = this.epoch;
        this.check(epoch);
        if (!/^\/(?:[a-zA-Z0-9_%-]+(?:\/[a-zA-Z0-9_%-]+)*)?$/.test(path)) {
            configuration(
                'Use an API-relative path and pass query parameters in query',
            );
        }
        try {
            for (const segment of path.split('/').slice(1)) {
                const decoded = decodeURIComponent(segment);
                if (
                    decoded === '.' ||
                    decoded === '..' ||
                    /[\\/\x00-\x1f]/.test(decoded)
                ) {
                    configuration('Invalid HTTP path segment');
                }
            }
        } catch {
            configuration('Invalid HTTP path encoding');
        }
        if (path === '/auth/guest')
            configuration('Use loginGuest() for guest authentication');
        const method = options.method ?? 'GET';
        if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
            configuration('Invalid HTTP method');
        if (method === 'GET' && options.body !== undefined)
            configuration('GET requests cannot have a body');
        const url = this.baseUrl + '/api' + path + queryString(options.query);
        const requestHeaders = headers(this.defaultHeaders, options.headers);
        const duration = timeout(options.timeoutMs ?? this.timeoutMs);
        let body: string | undefined;
        try {
            body =
                options.body === undefined
                    ? undefined
                    : JSON.stringify(options.body);
            if (options.body !== undefined && body === undefined)
                throw new Error();
        } catch {
            configuration('HTTP body must be JSON serializable');
        }
        const authenticated = options.auth !== false;
        let session = authenticated
            ? await this.ensureSession(epoch)
            : undefined;
        // Only GET can be replayed after rejected authentication; writes are never replayed.
        for (let attempt = 0; ; attempt++) {
            this.check(epoch);
            try {
                const result = await this.send(
                    url,
                    method,
                    body,
                    requestHeaders,
                    duration,
                    epoch,
                    session?.token,
                );
                this.check(epoch);
                return result as T;
            } catch (error) {
                this.check(epoch);
                if (
                    !(error instanceof HttpRequestError) ||
                    error.status !== 401 ||
                    !authenticated
                )
                    throw error;
                if (this.authSession === session) this.authSession = undefined;
                if (method !== 'GET' || attempt > 0) throw error;
                session = await this.ensureSession(epoch);
            }
        }
    }

    /** Local logout; the server has no revoke endpoint. Durable credentials remain by default. */
    public logout(options: { forgetCredential?: boolean } = {}): void {
        this.epoch++;
        this.authSession = undefined;
        this.pendingLogin = undefined;
        for (const cancel of [...this.active]) cancel();
        if (options.forgetCredential) {
            try {
                this.storage.removeItem(this.storageKey);
                this.credential = undefined;
            } catch {
                throw new HttpRequestError(
                    'Cannot remove guest credential',
                    'storage',
                );
            }
        }
    }

    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.logout();
    }

    private check(epoch: number): void {
        if (this.disposed || epoch !== this.epoch) {
            throw new HttpRequestError(
                'HTTP client closed or session changed',
                'cancelled',
            );
        }
    }

    private ensureSession(epoch: number): Promise<AuthSession> {
        this.check(epoch);
        if (this.authSession && Date.now() < this.authSession.refreshAt)
            return Promise.resolve(this.authSession);
        if (this.pendingLogin) return this.pendingLogin;
        const pending = this.authenticate(epoch);
        this.pendingLogin = pending;
        // Both outcomes clear only their own login, never a replacement started after logout.
        const clear = () => {
            if (this.pendingLogin === pending) this.pendingLogin = undefined;
        };
        void pending.then(clear, clear);
        return pending;
    }

    private async authenticate(epoch: number): Promise<AuthSession> {
        let credential: string;
        try {
            credential =
                this.credential ?? this.storage.getItem(this.storageKey) ?? '';
        } catch {
            throw new HttpRequestError(
                'Cannot read guest credential',
                'storage',
            );
        }
        if (credential && !tokenPattern.test(credential)) {
            throw new HttpRequestError(
                'Saved guest credential is invalid; it was retained',
                'storage',
            );
        }
        const previousUserId = this.authSession?.info.userId;
        const started = Date.now();
        const result = await this.send(
            this.baseUrl + '/api/auth/guest',
            'POST',
            JSON.stringify({ realmId: this.realmId, loginToken: credential }),
            this.defaultHeaders,
            this.timeoutMs,
            epoch,
        );
        this.check(epoch);
        if (!result || typeof result !== 'object' || Array.isArray(result))
            this.invalidLogin();
        const login = result as Record<string, unknown>;
        if (
            typeof login.userId !== 'string' ||
            !login.userId ||
            login.realmId !== this.realmId ||
            !Number.isSafeInteger(login.worldId) ||
            Number(login.worldId) < 0 ||
            typeof login.loginToken !== 'string' ||
            !tokenPattern.test(login.loginToken) ||
            typeof login.sessionToken !== 'string' ||
            !tokenPattern.test(login.sessionToken) ||
            !Number.isSafeInteger(login.expiresInSeconds) ||
            Number(login.expiresInSeconds) <= 0 ||
            (credential && login.loginToken !== credential) ||
            (previousUserId && login.userId !== previousUserId)
        )
            this.invalidLogin();
        const seconds = Number(login.expiresInSeconds);
        const expiresAt = started + seconds * 1000;
        if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())
            this.invalidLogin();
        // Persist before exposing a successful login, so a restart restores the same account.
        this.credential = login.loginToken as string;
        try {
            this.storage.setItem(this.storageKey, login.loginToken as string);
        } catch {
            throw new HttpRequestError(
                'Cannot save guest credential',
                'storage',
            );
        }
        const info = Object.freeze({
            userId: login.userId as string,
            realmId: this.realmId,
            worldId: Number(login.worldId),
            expiresInSeconds: seconds,
            expiresAt,
        });
        const session = {
            info,
            token: login.sessionToken as string,
            refreshAt: expiresAt - Math.min(30000, seconds * 100),
        };
        this.authSession = session;
        return session;
    }

    private invalidLogin(): never {
        throw new HttpRequestError(
            'Invalid guest login response; saved credential was retained',
            'invalid-response',
        );
    }

    private send(
        url: string,
        method: HttpMethod,
        body: string | undefined,
        requestHeaders: Record<string, string>,
        duration: number,
        epoch: number,
        token?: string,
    ): Promise<unknown> {
        this.check(epoch);
        return new Promise((resolve, reject) => {
            let xhr: XMLHttpRequest | undefined;
            let finished = false;
            const finish = (error?: HttpRequestError, value?: unknown) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                this.active.delete(cancel);
                if (xhr)
                    xhr.onreadystatechange =
                        xhr.onerror =
                        xhr.ontimeout =
                        xhr.onabort =
                            null;
                if (error) reject(error);
                else resolve(value);
            };
            const abort = (error: HttpRequestError) => {
                finish(error);
                try {
                    xhr?.abort();
                } catch {
                    /* The Promise has already settled. */
                }
            };
            const cancel = () =>
                abort(
                    new HttpRequestError('HTTP request cancelled', 'cancelled'),
                );
            const timer = setTimeout(
                () =>
                    abort(
                        new HttpRequestError(
                            'HTTP request timed out',
                            'timeout',
                        ),
                    ),
                duration,
            );
            this.active.add(cancel);
            try {
                xhr = this.createXHR();
                xhr.open(method, url, true);
                xhr.timeout = duration;
                for (const [name, value] of Object.entries(requestHeaders))
                    xhr.setRequestHeader(name, value);
                if (body !== undefined)
                    xhr.setRequestHeader('content-type', 'application/json');
                if (token)
                    xhr.setRequestHeader('authorization', 'Bearer ' + token);
                xhr.onreadystatechange = () => {
                    if (xhr!.readyState !== 4 || finished) return;
                    const status = xhr!.status;
                    if (!status) return; // Native error/abort event or our deadline will settle it.
                    let result: unknown = null;
                    try {
                        result = xhr!.responseText
                            ? JSON.parse(xhr!.responseText)
                            : null;
                    } catch {
                        if (status >= 200 && status < 300) {
                            finish(
                                new HttpRequestError(
                                    'Invalid JSON response',
                                    'invalid-response',
                                    status,
                                ),
                            );
                            return;
                        }
                    }
                    if (status < 200 || status >= 300) {
                        const error = result as {
                            error?: unknown;
                            code?: unknown;
                        } | null;
                        finish(
                            new HttpRequestError(
                                typeof error?.error === 'string'
                                    ? error.error
                                    : `HTTP request failed (${status})`,
                                'http',
                                status,
                                typeof error?.code === 'number'
                                    ? error.code
                                    : undefined,
                            ),
                        );
                    } else finish(undefined, result);
                };
                xhr.onerror = () =>
                    finish(
                        new HttpRequestError(
                            'HTTP network request failed',
                            'network',
                        ),
                    );
                xhr.ontimeout = () =>
                    abort(
                        new HttpRequestError(
                            'HTTP request timed out',
                            'timeout',
                        ),
                    );
                xhr.onabort = () =>
                    finish(
                        new HttpRequestError(
                            'HTTP request cancelled',
                            'cancelled',
                        ),
                    );
                xhr.send(body ?? null);
            } catch {
                abort(
                    new HttpRequestError(
                        'HTTP transport could not send the request',
                        'network',
                    ),
                );
            }
        });
    }
}
