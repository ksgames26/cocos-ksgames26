import { Vec3 } from "cc";
const temp1 = new Vec3();
const temp2 = new Vec3();

/**
 * 随机整数
 * 
 * @param start 
 * @param end 
 * @returns 
 */
export const randomInt = (start: number, end: number): number =>
    parseInt(`${Math.random() * (end - start + 1) + start}`, 10);

/**
 * 贝塞尔曲线
 *
 * @export
 * @param {Vec3} begin
 * @param {Vec3} second
 * @param {Vec3} end
 * @param {number} t
 * @param {Vec3} [out]
 * @return {*}  
 */
export function bezier(begin: Vec3, second: Vec3, end: Vec3, t: number, out?: Vec3): Vec3 {
    Vec3.lerp(temp1, begin, second, t);
    Vec3.lerp(temp2, second, end, t);
    return Vec3.lerp(out ?? new Vec3(), temp1, temp2, t);
}

/**
 * 贝塞尔曲线长度计算，分段计算
 *
 * @export
 * @param {Vec3} begin
 * @param {Vec3} second
 * @param {Vec3} end
 * @param {number} [samples=10]
 * @return {*}  {number}
 */
export function bezierLength(begin: Vec3, second: Vec3, end: Vec3, samples: number = 10): number {
    let length = 0;
    let prevPoint = begin.clone();

    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const point = bezier(begin, second, end, t);
        length += Vec3.distance(prevPoint, point);
        prevPoint.set(point);
    }

    return length;
}

/**
 * 贝塞尔曲线长度计算，高斯积分法
 *
 * @export
 * @param {Vec3} begin
 * @param {Vec3} second
 * @param {Vec3} end
 * @return {*}  {number}
 */
export function bezierLengthGauss(begin: Vec3, second: Vec3, end: Vec3): number {
    const gaussCoefficients = [
        [0.2369268850561891, 0.9061798459386640],
        [0.4786286704993665, 0.5384693101056831],
        [0.5688888888888889, 0.0000000000000000],
        [0.4786286704993665, -0.5384693101056831],
        [0.2369268850561891, -0.9061798459386640]
    ];

    let length = 0;

    for (const [weight, abscissa] of gaussCoefficients) {
        const t = 0.5 * (abscissa + 1);
        const dt = 1 - t;

        const dx = 2 * (second.x - begin.x) * dt + 2 * (end.x - second.x) * t;
        const dy = 2 * (second.y - begin.y) * dt + 2 * (end.y - second.y) * t;
        const dz = 2 * (second.z - begin.z) * dt + 2 * (end.z - second.z) * t;

        const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        length += weight * segmentLength;
    }

    return 0.5 * length;
}

/**
 * 格式化时间
 *
 * @export
 * @param {number} milliseconds
 * @return {*}  {string}
 */
export function formatTime(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (num: number) => num.toString().padStart(2, '0');

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}