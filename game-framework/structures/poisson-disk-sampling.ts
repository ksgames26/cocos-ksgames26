import { random } from "cc";

function tinyNDArrayOfInteger(gridShape: [number, number]) {
    return {
        strideX: gridShape[1],
        data: new Uint32Array(gridShape[0] * gridShape[1]),
    };
}

type ITinyResultType = ReturnType<typeof tinyNDArrayOfInteger>;

const piDiv3 = Math.PI / 3;
const neighbourhood = [
    [0, 0],
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -2],
    [-2, 0],
    [2, 0],
    [0, 2],
    [-1, -2],
    [1, -2],
    [-2, -1],
    [2, -1],
    [-2, 1],
    [2, 1],
    [-1, 2],
    [1, 2],
];
const neighbourhoodLength = neighbourhood.length;

/**泊松盘采样 */
export class FastPoissonDiskSampling {
    private width: number = 0;
    private height: number = 0;
    private radius: number = 0;
    private maxTries: number = 0;
    private squaredRadius: number = 0;
    private radiusPlusEpsilon: number = 0;
    private cellSize: number = 0;
    private angleIncrement: number = 0;
    private angleIncrementOnSuccess: number = 0;
    private triesIncrementOnSuccess: number = 0;
    private processList: [number, number, number, number][] = [];
    private samplePoints: [number, number][] = [];
    private gridShape: [number, number] = [0, 0];
    private grid: ITinyResultType = null!;
    private rng: typeof random;

    public constructor(
        options: {
            shape: [number, number];
            radius: number;
            tries: number;
        },
        rng: () => number = random
    ) {
        this.width = options.shape[0];
        this.height = options.shape[1];
        this.radius = options.radius;
        this.maxTries = Math.max(3, Math.ceil(options.tries || 30));
        this.rng = rng;

        const floatPrecisionMitigation = Math.max(
            1,
            (Math.max(this.width, this.height) / 64) | 0
        );
        const epsilonRadius = 1e-14 * floatPrecisionMitigation;
        const epsilonAngle = 2e-14;

        this.squaredRadius = this.radius * this.radius;
        this.radiusPlusEpsilon = this.radius + epsilonRadius;
        this.cellSize = this.radius * Math.SQRT1_2;

        this.angleIncrement = (Math.PI * 2) / this.maxTries;
        this.angleIncrementOnSuccess = piDiv3 + epsilonAngle;
        this.triesIncrementOnSuccess = Math.ceil(
            this.angleIncrementOnSuccess / this.angleIncrement
        );

        this.processList = [];
        this.samplePoints = [];

        // cache grid

        this.gridShape = [
            Math.ceil(this.width / this.cellSize),
            Math.ceil(this.height / this.cellSize),
        ];

        this.grid = tinyNDArrayOfInteger(this.gridShape); //will store references to samplePoints
    }

    public fill(): [number, number][] {
        this.start();

        while (this.next()) { }

        return this.samplePoints;
    }

    public getAllPoints() {
        return this.samplePoints;
    }

    public reset() {
        var gridData = this.grid.data,
            i: number;

        // reset the cache grid
        for (i = 0; i < gridData.length; i++) {
            gridData[i] = 0;
        }

        // new array for the samplePoints as it is passed by reference to the outside
        this.samplePoints = [];

        // reset the internal state
        this.processList.length = 0;
    }

    public start(): void {
        if (this.samplePoints.length === 0) {
            this.addRandomPoint();
        }
    }

    public next(): IGameFramework.Nullable<[number, number]> {
        var tries: number,
            currentPoint: [number, number, number, number],
            currentAngle: number,
            newPoint: [number, number, number, number];

        while (this.processList.length > 0) {
            var index = (this.processList.length * this.rng()) | 0;

            currentPoint = this.processList[index];
            currentAngle = currentPoint[2];
            tries = currentPoint[3];

            if (tries === 0) {
                currentAngle = currentAngle + (this.rng() - 0.5) * piDiv3 * 4;
            }

            for (; tries < this.maxTries; tries++) {
                newPoint = [
                    currentPoint[0] + Math.cos(currentAngle) * this.radiusPlusEpsilon,
                    currentPoint[1] + Math.sin(currentAngle) * this.radiusPlusEpsilon,
                    currentAngle,
                    0,
                ];

                if (
                    newPoint[0] >= 0 &&
                    newPoint[0] < this.width &&
                    newPoint[1] >= 0 &&
                    newPoint[1] < this.height &&
                    !this.inNeighbourhood(newPoint)
                ) {
                    currentPoint[2] =
                        currentAngle +
                        this.angleIncrementOnSuccess +
                        this.rng() * this.angleIncrement;
                    currentPoint[3] = tries + this.triesIncrementOnSuccess;
                    return this.directAddPoint(newPoint);
                }

                currentAngle = currentAngle + this.angleIncrement;
            }

            if (tries >= this.maxTries) {
                const r = this.processList.pop()!;
                if (index < this.processList.length) {
                    this.processList[index] = r;
                }
            }
        }

        return null;
    }

    public inNeighbourhood(point: [number, number, number, number]): boolean {
        let strideX = this.grid.strideX,
            boundX = this.gridShape[0],
            boundY = this.gridShape[1],
            cellX = (point[0] / this.cellSize) | 0,
            cellY = (point[1] / this.cellSize) | 0,
            neighbourIndex,
            internalArrayIndex,
            currentDimensionX,
            currentDimensionY,
            existingPoint;

        for (
            neighbourIndex = 0;
            neighbourIndex < neighbourhoodLength;
            neighbourIndex++
        ) {
            currentDimensionX = cellX + neighbourhood[neighbourIndex][0];
            currentDimensionY = cellY + neighbourhood[neighbourIndex][1];

            internalArrayIndex =
                currentDimensionX < 0 ||
                    currentDimensionY < 0 ||
                    currentDimensionX >= boundX ||
                    currentDimensionY >= boundY
                    ? -1
                    : currentDimensionX * strideX + currentDimensionY;

            if (
                internalArrayIndex !== -1 &&
                this.grid.data[internalArrayIndex] !== 0
            ) {
                existingPoint =
                    this.samplePoints[this.grid.data[internalArrayIndex] - 1];

                if (
                    Math.pow(point[0] - existingPoint[0], 2) +
                    Math.pow(point[1] - existingPoint[1], 2) <
                    this.squaredRadius
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    public addPoint(point: [number, number]): IGameFramework.Nullable<[number, number]> {
        const valid =
            point.length === 2 &&
            point[0] >= 0 &&
            point[0] < this.width &&
            point[1] >= 0 &&
            point[1] < this.height;

        return valid
            ? this.directAddPoint([point[0], point[1], this.rng() * Math.PI * 2, 0])
            : null;
    }

    public addRandomPoint(): [number, number] {
        return this.directAddPoint([
            this.rng() * this.width,
            this.rng() * this.height,
            this.rng() * Math.PI * 2,
            0,
        ]);
    }

    public directAddPoint(
        point: [number, number, number, number]
    ): [number, number] {
        const coordsOnly = [point[0], point[1]] as [number, number];
        this.processList.push(point);
        this.samplePoints.push(coordsOnly);

        const internalArrayIndex =
            ((point[0] / this.cellSize) | 0) * this.grid.strideX +
            ((point[1] / this.cellSize) | 0);

        this.grid.data[internalArrayIndex] = this.samplePoints.length; // store the point reference

        return coordsOnly;
    }
}
