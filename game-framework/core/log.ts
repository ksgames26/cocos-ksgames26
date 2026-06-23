import { error, log, sys, warn } from "cc";

/**
 * 空函数
 * 
 * @exports
 */
const fnEmpty = () => { };

// 日志配置存储 
const loggers = new Map<string, {
    debug: boolean;
    info: boolean;
    warn: boolean;
    error: boolean;
    style: { infoColor: string; warnColor: string; errorColor: string };
}>();

/**
 * 日志等级
 *
 * @
 * @enum {number}
 */
export const enum LoggerLevel {
    NONE,
    ERROR,
    WARN,
    INFO,
    DEBUG,
}

/**
 * 日志输出类型
 *
 * @
 * @enum {number}
 */
export const enum LoggerType {
    CONSOLE,
    CUSTOME,
    COCOS,
    File,
    HTTP,
}

let type = LoggerType.CONSOLE;
let level = LoggerLevel.INFO;
let _globalEnabled = true; // 全局日志开关

// HTTP日志配置
interface HttpLogConfig {
    url: string;
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    batchSize?: number;
    flushInterval?: number;
    enabled?: boolean;
}

let httpConfig: HttpLogConfig | null = null;
let logBuffer: Array<{ level: string; tag: string; message: any[]; timestamp: number }> = [];
let flushTimer: NodeJS.Timeout | null = null;

/**
 * 发送日志到HTTP服务器
 */
async function sendLogsToHttp(logs: Array<{ level: string; tag: string; message: any[]; timestamp: number }>) {
    if (!httpConfig || !httpConfig.enabled || logs.length === 0) return;

    try {
        const xhr = new XMLHttpRequest();
        xhr.open(httpConfig.method || 'POST', httpConfig.url, true);

        // 设置请求头
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (httpConfig.headers) {
            for (const key in httpConfig.headers) {
                xhr.setRequestHeader(key, httpConfig.headers[key]);
            }
        }

        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4 && xhr.status !== 200) {
                console.error('Failed to send logs to server:', xhr.statusText);
            }
        };

        const payload = {
            logs: logs.map(log => ({
                level: log.level,
                tag: log.tag,
                message: log.message,
                timestamp: log.timestamp,
                userAgent: navigator.userAgent,
                url: window.location.href
            }))
        };

        xhr.send(JSON.stringify(payload));
    } catch (error) {
        console.error('Error sending logs to server:', error);
    }
}

/**
 * 刷新日志缓冲区
 */
function flushLogBuffer() {
    if (logBuffer.length > 0) {
        sendLogsToHttp([...logBuffer]);
        logBuffer = [];
    }
}

/**
 * 添加日志到缓冲区
 */
function addLogToBuffer(level: string, tag: string, message: any[]) {
    if (!httpConfig || !httpConfig.enabled) return;

    logBuffer.push({
        level,
        tag,
        message,
        timestamp: Date.now()
    });

    // 如果达到批次大小，立即发送
    if (logBuffer.length >= (httpConfig.batchSize || 10)) {
        flushLogBuffer();
    }

    // 设置定时器定期发送
    if (flushTimer) {
        clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(flushLogBuffer, httpConfig.flushInterval || 5000);
}

/**
 * 日志等级
 */
function consoleTable<T extends object>(data: T[], properties?: (keyof T)[], colors?: Map<string, string>): void {
    if (!data || data.length === 0) {
        console.log('No data to display.');
        return;
    }

    // 如果没有指定属性，则使用对象的所有键
    const keys = properties ? properties : (Object.keys(data[0]) as (keyof T)[]);

    // 打印表头
    console.log(keys.map(key => (<string>key).padEnd(20)).join('|'));
    console.log(keys.map(() => '---'.padEnd(20, '-')).join('|'));

    if (colors) {
        data.forEach(row => {
            const formatParts: string[] = [];
            const args: any[] = [];

            // 行里每一列
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                // 支持数组行或对象行
                const cell = Array.isArray(row) ? (row as any)[i] : (row as any)[key];
                const isObject = typeof cell === 'object' && cell !== null;
                const cellStr = isObject ? JSON.stringify(cell) : String(cell);

                // 计算样式
                let style = '';
                for (const [substr, col] of colors.entries()) {
                    if (cellStr.includes(substr)) {
                        style = `color: ${col};background:rgba(211,211,211,255);font-weight:bold`;
                        break;
                    }
                }

                if (isObject) {
                    // 用 %o 展开对象，配合样式 %c
                    formatParts.push("%c%o");
                    args.push(style);
                    args.push(cell);
                } else {
                    formatParts.push("%c%s");
                    args.push(style);
                    args.push(cellStr.padEnd(20));
                }
            }

            const format = formatParts.join(" ");
            console.log.apply(console, [format, ...args]);
        });
    } else {
        data.forEach(row => {
            const cells = keys.map(key => {
                const val = (row as any)[key];
                if (typeof val === 'object' && val !== null) {
                    // 展开对象，格式化为可读的 JSON
                    try {
                        return JSON.stringify(val, null, 2).replace(/\n/g, ' ');
                    } catch {
                        return String(val);
                    }
                }
                return String(val).padEnd(20);
            });
            console.log(cells.join('|'));
        });
    }
}

/**
 * 统一的日志打印函数
 */
function printLog(tag?: string, infoColor?: string): (...info: any[]) => void {
    if (!_globalEnabled) return function () { };

    switch (type) {
        case LoggerType.CONSOLE:
            // 移动端不打印样式日志
            if (sys.isMobile) {
                return log;
            }
            return console.log.bind(console, `%c[${tag ?? "logger"}]`, `color: ${infoColor ?? '#28a745'}; text-decoration: underline;`);
        case LoggerType.HTTP:
            return (...info: any[]) => {
                addLogToBuffer('LOG', 'GLOBAL', info);
            };
        case LoggerType.COCOS:
        default:
            return log;
    }
}

/**
 * 统一的警告打印函数
 */
function printWarn(tag?: string, warnColor?: string): (...info: any[]) => void {
    if (!_globalEnabled) return function () { };

    switch (type) {
        case LoggerType.CONSOLE:
            // 移动端不打印样式日志
            if (sys.isMobile) {
                return warn;
            }
            return console.warn.bind(console, `%c[${tag ?? "logger"}]`, `color: ${warnColor ?? '#ffc107'};  text-decoration: underline;`);
        case LoggerType.HTTP:
            return (...info: any[]) => {
                addLogToBuffer('WARN', 'GLOBAL', info);
            };
        case LoggerType.COCOS:
        default:
            return warn;
    }
}

/**
 * 统一的错误打印函数
 */
function printError(tag?: string, errorColor?: string): (...info: any[]) => void {
    if (!_globalEnabled) return function () { };

    switch (type) {
        case LoggerType.CONSOLE:
            // 移动端不打印样式日志
            if (sys.isMobile) {
                return error;
            }
            return console.error.bind(console, `%c[${tag ?? "logger"}]`, `color: ${errorColor ?? '#dc3545'}; text-decoration: underline;`);
        case LoggerType.HTTP:
            return (...info: any[]) => {
                addLogToBuffer('ERROR', 'GLOBAL', info);
            };
        case LoggerType.COCOS:
        default:
            return error;
    }
}

/**
 * 统一的表格打印函数
 */
function printTable(): (...args: any[]) => void {
    if (!_globalEnabled) return function () { };
    return console.table.bind(console);
}

/**
 * 日志接口
 */
export interface ILogger {
    readonly tag: string;
    debug(...info: any[]): void;
    info(...info: any[]): void;
    warn(...info: any[]): void;
    error(...info: any[]): void;
    consoleTable(...args: any[]): void;
}

/**
 * 获取日志实例
 *
 * @param tag 日志标签
 * @returns 日志实例
 */
export function getLogger(tag: string, options?: { style: { infoColor: string, warnColor: string, errorColor: string } }): ILogger {

    let registered = false;
    let config = loggers.get(tag)!;

    // 延迟注入
    // 只有在首次访问具体日志方法时，才会注册该日志标签的配置
    // 确保全局配置已经初始化
    const lazyRegister = () => {
        if (registered) return;

        // 获取或创建配置
        if (!loggers.has(tag)) {
            loggers.set(tag, {
                debug: level >= LoggerLevel.DEBUG,
                info: level >= LoggerLevel.INFO,
                warn: level >= LoggerLevel.WARN,
                error: level >= LoggerLevel.ERROR,
                style: options?.style ?? { infoColor: '#28a745', warnColor: '#ffc107', errorColor: '#dc3545' }
            });
        } else if (options?.style) {
            const existing = loggers.get(tag)!;
            existing.style = options.style;
        }

        config = loggers.get(tag)!;
        registered = true;
    };

    return {
        tag,
        get debug() {
            lazyRegister();

            if (config.debug) {
                if (type === LoggerType.HTTP) {
                    return function (...info: any[]): void {
                        addLogToBuffer('DEBUG', tag, info);
                    }
                } else {
                    return printLog(tag, config.style.infoColor);
                }
            } else {
                return fnEmpty;
            }
        },
        get info() {
            lazyRegister();

            if (config.info) {
                if (type === LoggerType.HTTP) {
                    return function (...info: any[]): void {
                        addLogToBuffer('INFO', tag, info);
                    }
                } else {
                    return printLog(tag, config.style.infoColor);
                }
            } else {
                return fnEmpty;
            }
        },
        get warn() {
            lazyRegister();

            if (config.warn) {
                if (type === LoggerType.HTTP) {
                    return function (...info: any[]): void {
                        addLogToBuffer('WARN', tag, info);
                    }
                } else {
                    return printWarn(tag, config.style.warnColor);
                }
            } else {
                return fnEmpty;
            }
        },
        get error() {
            lazyRegister();

            if (config.error) {
                if (type === LoggerType.HTTP) {
                    return function (...info: any[]): void {
                        addLogToBuffer('ERROR', tag, info);
                    }
                } else {
                    return printError(tag, config.style.errorColor);
                }
            } else {
                return fnEmpty;
            }
        },
        get consoleTable() {
            lazyRegister();
            if (level < LoggerLevel.DEBUG) return function () { };
            if (type === LoggerType.HTTP) {
                return function (...args: any[]): void {
                    addLogToBuffer('TABLE', tag, args);
                }
            } else {
                if (sys.isMobile) {
                    return printTable();
                }

                return consoleTable;
            }
        }
    };
}

/**
 * 日志实例
 */
export const logger = {

    getDefaultColorStyle: () => ({ infoColor: '#28a745', warnColor: '#ffc107', errorColor: '#dc3545' }),

    initialize: (configs?: {
        global?: { enabled?: boolean },
        http?: HttpLogConfig,
        loggers?: Record<string, {
            debug?: boolean;
            info?: boolean;
            warn?: boolean;
            error?: boolean;
            enable?: boolean;
            style?: { infoColor: string; warnColor: string; errorColor: string };
        }>,
    }) => {
        if (!configs) return;

        // 设置全局开关
        if (configs.global !== undefined) {
            _globalEnabled = configs.global.enabled ?? true;
        }

        // 设置HTTP配置
        if (configs.http) {
            httpConfig = {
                batchSize: 10,
                flushInterval: 5000,
                method: 'POST',
                enabled: true,
                ...configs.http
            };
        }

        // 设置各个日志器的配置
        if (configs.loggers) {
            Object.entries(configs.loggers).forEach(([tag, config]) => {
                const existing = loggers.get(tag) || {
                    debug: level >= LoggerLevel.DEBUG,
                    info: level >= LoggerLevel.INFO,
                    warn: level >= LoggerLevel.WARN,
                    error: level >= LoggerLevel.ERROR,
                    style: { infoColor: '#28a745', warnColor: '#ffc107', errorColor: '#dc3545' }
                };

                // 更新现有配置
                if (!config.enable) {
                    existing.debug = false;
                    existing.info = false;
                    existing.warn = false;
                    existing.error = false;
                }

                loggers.set(tag, {
                    debug: config.debug ?? existing.debug,
                    info: config.info ?? existing.info,
                    warn: config.warn ?? existing.warn,
                    error: config.error ?? existing.error,
                    style: config.style || existing.style || { infoColor: '#28a745', warnColor: '#ffc107', errorColor: '#dc3545' }
                });
            });
        }
    },

    /**
     * 设置指定标签日志的开关状态
     * @param tag 日志标签
     * @param levelType 日志级别类型
     * @param enabled 是否启用
     */
    setLoggerEnabled: (tag: string, levelType: 'debug' | 'info' | 'warn' | 'error', enabled: boolean) => {
        const existing = loggers.get(tag) || { debug: true, info: true, warn: true, error: true, style: { infoColor: '#28a745', warnColor: '#ffc107', errorColor: '#dc3545' } };
        existing[levelType] = enabled;
        loggers.set(tag, existing);
    },

    /**
     * 设置指定标签所有级别的开关状态
     * @param tag 日志标签
     * @param enabled 是否启用
     */
    setLoggerAllEnabled: (tag: string, enabled: boolean) => {
        loggers.set(tag, {
            debug: enabled,
            info: enabled,
            warn: enabled,
            error: enabled,
            style: { infoColor: '#28a745', warnColor: '#ffc107', errorColor: '#dc3545' }
        });
    },

    /**
     * 获取指定标签日志的配置
     * @param tag 日志标签
     */
    getLoggerConfig: (tag: string) => {
        return loggers.get(tag) || { debug: true, info: true, warn: true, error: true };
    },

    /**
     * 设置全局日志开关
     * @param enabled 是否启用
     */
    setGlobalEnabled: (enabled: boolean) => {
        _globalEnabled = enabled;
    },

    /**
     * 获取全局日志开关状态
     */
    getGlobalEnabled: () => _globalEnabled,

    /**
     * 清除所有日志配置
     */
    clearLoggerConfigs: () => {
        loggers.clear();
    },

    /**
     * 输出调试信息
     */
    get log(): (...info: any[]) => void {
        if (level < LoggerLevel.INFO) return function () { };
        return printLog();
    },

    get debug(): (...info: any[]) => void {
        if (level < LoggerLevel.DEBUG) return function () { };
        return printLog();
    },

    get warn(): (...info: any[]) => void {
        if (level < LoggerLevel.WARN) return function () { };
        return printWarn();
    },

    get error(): (...info: any[]) => void {
        if (level < LoggerLevel.ERROR) return function () { };
        return printError();
    },

    get table(): (...args: any[]) => void {
        if (level < LoggerLevel.DEBUG) return function () { };
        return printTable();
    },

    get consoleTable() {
        if (level < LoggerLevel.DEBUG) return function () { };
        if (sys.isMobile) {
            return printTable();
        }
        return consoleTable;
    },

    /**
     * 日志级别
     */
    /**
         * 获取日志级别
         */
    get level() {
        return level;
    },

    /**
     * 设置日志级别
     * @param value 日志级别
     */
    set level(value: LoggerLevel) {
        level = value;

        // 更新所有现有 logger 的配置
        loggers.forEach((config, tag) => {
            config.debug = level >= LoggerLevel.DEBUG;
            config.info = level >= LoggerLevel.INFO;
            config.warn = level >= LoggerLevel.WARN;
            config.error = level >= LoggerLevel.ERROR;
        });
    },

    /**
     * 日志输出类型
     */
    get type() {
        return type;
    },

    /**
     * 设置日志输出类型
     */
    set type(value: LoggerType) {
        type = value;

        // 如果切换到非HTTP模式，先刷新缓冲区
        if (value !== LoggerType.HTTP && logBuffer.length > 0) {
            flushLogBuffer();
        }
    },

    /**
     * 配置HTTP日志传输
     * @param config HTTP配置
     */
    configureHttp: (config: HttpLogConfig) => {
        httpConfig = {
            batchSize: 10,
            flushInterval: 5000,
            method: 'POST',
            enabled: true,
            ...config
        };
    },

    /**
     * 立即发送所有缓存的日志
     */
    flushLogs: () => {
        flushLogBuffer();
    },

    /**
     * 获取HTTP配置
     */
    getHttpConfig: () => httpConfig,
}