/**
 * 一个迭代器不能多次迭代
 *
 * @export
 * @class AsyncGeneratorMultipleCallsError
 * @extends {Error}
 */
export class AsyncGeneratorMultipleCallsError extends Error {
    constructor() {
        super('AsyncGenerator can only be iterated once');
    }
}

/**
 * 参数错误
 *
 * @export
 * @class ArgumentsTypeError
 * @extends {Error}
 */
export class ArgumentsTypeError extends Error {
    constructor(message: string) {
        super("arguments type error: " + message);
    }
}