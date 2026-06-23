import { Enum, Layout, UITransform, Vec2, Vec3, _decorator, js } from "cc";

const { ccclass, disallowMultiple } = _decorator;
const horizontalDirection = Layout.HorizontalDirection as unknown as Record<string, number>;
const verticalDirection = Layout.VerticalDirection as unknown as Record<string, number>;
const axisDirection = Layout.AxisDirection as unknown as Record<string, number>;


horizontalDirection["JUSTIFY_DISTRIBUTE"] = 2;
js.value(Layout.HorizontalDirection, String(2), "JUSTIFY_DISTRIBUTE");
Enum.update(Layout.HorizontalDirection);

horizontalDirection["CENTER_TO_SIDE"] = 3;
js.value(Layout.HorizontalDirection, String(3), "CENTER_TO_SIDE");
Enum.update(Layout.HorizontalDirection);

verticalDirection["JUSTIFY_DISTRIBUTE"] = 2;
js.value(Layout.VerticalDirection, String(2), "JUSTIFY_DISTRIBUTE");
Enum.update(Layout.VerticalDirection);

verticalDirection["CENTER_TO_SIDE"] = 3;
js.value(Layout.VerticalDirection, String(3), "CENTER_TO_SIDE");
Enum.update(Layout.VerticalDirection);

axisDirection["VERTICAL_HORIZONTAL"] = 2;
js.value(Layout.AxisDirection, String(2), "VERTICAL_HORIZONTAL")
Enum.update(Layout.AxisDirection);

@ccclass("LayoutPlus")
@disallowMultiple()
export class LayoutPlus extends Layout {
    protected _doLayoutHorizontally(baseWidth: number, rowBreak: boolean, fnPositionY: (...args: any[]) => number, applyChildren: boolean): number {
        if (this._horizontalDirection as number == Layout.HorizontalDirection.LEFT_TO_RIGHT || this._horizontalDirection as number == Layout.HorizontalDirection.RIGHT_TO_LEFT) {
            return super._doLayoutHorizontally(baseWidth, rowBreak, fnPositionY, applyChildren);
        }

        // JUSTIFY_DISTRIBUTE 
        if (this._horizontalDirection as number == horizontalDirection["JUSTIFY_DISTRIBUTE"]) {
            return this._doJustifyDistributeLayout(baseWidth, rowBreak, fnPositionY, applyChildren);
        }

        // CENTER_TO_SIDE
        if (this._horizontalDirection as number == horizontalDirection["CENTER_TO_SIDE"]) {
            return this._doCenterToSideLayout(baseWidth, rowBreak, fnPositionY, applyChildren);
        }

        return super._doLayoutHorizontally(baseWidth, rowBreak, fnPositionY, applyChildren);
    }

    protected _doLayoutGrid(): void {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const layoutSize = trans.contentSize;

        if (this.startAxis === Layout.AxisDirection.HORIZONTAL) {
            this._doLayoutGridAxisHorizontal(layoutAnchor, layoutSize);
        } else if (this.startAxis === Layout.AxisDirection.VERTICAL) {
            this._doLayoutGridAxisVertical(layoutAnchor, layoutSize);
        } else if (this.startAxis == axisDirection["VERTICAL_HORIZONTAL"]) {
            this._doLayoutGridAxisVertical(layoutAnchor, layoutSize);
            this._doLayoutGridAxisHorizontal(layoutAnchor, layoutSize);
        }
    }

    protected _doLayoutVertically(baseHeight: number, columnBreak: boolean, fnPositionX: (...args: any[]) => number, applyChildren: boolean): number {
        if (this._verticalDirection as number == Layout.VerticalDirection.TOP_TO_BOTTOM || this._verticalDirection as number == Layout.VerticalDirection.BOTTOM_TO_TOP) {
            return super._doLayoutVertically(baseHeight, columnBreak, fnPositionX, applyChildren);
        }

        if (this._verticalDirection as number == verticalDirection["JUSTIFY_DISTRIBUTE"]) {
            return this._doJustifyDistributeVerticalLayout(baseHeight, columnBreak, fnPositionX, applyChildren);
        }

        if (this._verticalDirection as number == verticalDirection["CENTER_TO_SIDE"]) {
            return this._doCenterToSideVerticalLayout(baseHeight, columnBreak, fnPositionX, applyChildren);
        }

        return super._doLayoutVertically(baseHeight, columnBreak, fnPositionX, applyChildren);
    }

    _getUsedScaleValue(value: number) {
        return this.affectedByScale ? Math.abs(value) : 1;
    }

    /**
     * JUSTIFY_DISTRIBUTE 模式的优化布局方法
     * 直接计算最终位置，避免重复计算
     * 支持 LayoutConstraint 固定列数分行
     */
    private _doJustifyDistributeLayout(baseWidth: number, rowBreak: boolean, fnPositionY: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const limit = this._getFixedBreakingNum();
        const children = this._usefulLayoutObj;

        if (children.length === 0) {
            return this._getPaddingV();
        }

        // limit <= 0 时保持原有单行逻辑
        if (limit <= 0) {
            return this._doJustifyDistributeLayoutSingleRow(baseWidth, fnPositionY, applyChildren);
        }

        // 按固定列数分行
        const rows = this._groupChildrenByFixedLimit(children, limit, rowBreak);

        // 处理子节点大小调整
        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const paddingH = this._getPaddingH();
            let newChildWidth = this._cellSize.width;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildWidth = (baseWidth - paddingH - (limit - 1) * this._spacingX) / limit;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.width = newChildWidth / childScaleX;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.height = this._cellSize.height / childScaleY;
                }
            }
        }

        // 计算每行高度和总高度
        let totalHeight = this._paddingTop;
        const rowHeights: number[] = [];

        for (const row of rows) {
            let rowMaxHeight = 0;
            for (const childTrans of row) {
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);
                const childBoundingBoxHeight = childTrans.height * childScaleY;
                if (childBoundingBoxHeight > rowMaxHeight) {
                    rowMaxHeight = childBoundingBoxHeight;
                }
            }
            rowHeights.push(rowMaxHeight);
            totalHeight += rowMaxHeight;
            if (rows.indexOf(row) < rows.length - 1) {
                totalHeight += this._spacingY;
            }
        }
        totalHeight += this._paddingBottom;

        const containerResizeBoundary = totalHeight;

        if (applyChildren) {
            // 计算每行的 Y 位置并应用布局
            let currentY = (1 - layoutAnchor.y) * trans.height - this._paddingTop;

            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                const rowHeight = rowHeights[rowIndex];

                // 设置该行所有元素的 Y 坐标
                for (const childTrans of row) {
                    const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);
                    const childBoundingBoxHeight = childTrans.height * childScaleY;
                    const anchorY = childTrans.anchorY;
                    const finalPositionY = currentY - rowHeight + anchorY * childBoundingBoxHeight;
                    const currentPos = childTrans.node.position;
                    childTrans.node.setPosition(currentPos.x, finalPositionY, currentPos.z);
                }

                currentY -= rowHeight + this._spacingY;
            }

            // 对每行应用水平居中布局
            for (const row of rows) {
                this._applyRowCenterLayout(row, baseWidth, layoutAnchor);
            }
        }

        return containerResizeBoundary;
    }

    /**
     * JUSTIFY_DISTRIBUTE 单行模式（无固定列数限制时）
     */
    private _doJustifyDistributeLayoutSingleRow(baseWidth: number, fnPositionY: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const children = this._usefulLayoutObj;

        // 处理子节点大小调整
        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const activeChildCount = children.length;
            const paddingH = this._getPaddingH();
            let newChildWidth = this._cellSize.width;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildWidth = (baseWidth - paddingH - (activeChildCount - 1) * this._spacingX) / activeChildCount;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.width = newChildWidth / childScaleX;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.height = this._cellSize.height / childScaleY;
                }
            }
        }

        // 计算高度
        let totalHeight = 0;
        let rowMaxHeight = 0;
        let tempMaxHeight = 0;
        let maxHeight = 0;

        for (const childTrans of children) {
            const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);
            const childBoundingBoxHeight = childTrans.height * childScaleY;

            if (childBoundingBoxHeight > tempMaxHeight) {
                maxHeight = Math.max(tempMaxHeight, maxHeight);
                rowMaxHeight = tempMaxHeight || childBoundingBoxHeight;
                tempMaxHeight = childBoundingBoxHeight;
            }
        }

        rowMaxHeight = Math.max(rowMaxHeight, tempMaxHeight);
        const containerResizeBoundary = Math.max(maxHeight, totalHeight + rowMaxHeight) + this._getPaddingV();

        if (applyChildren) {
            for (const childTrans of children) {
                const finalPositionY = fnPositionY(childTrans.node, childTrans, totalHeight);
                const currentPos = childTrans.node.position;
                childTrans.node.setPosition(currentPos.x, finalPositionY, currentPos.z);
            }

            this._applyCustomCenterLayout(children, baseWidth, layoutAnchor);
        }

        return containerResizeBoundary;
    }

    private _doJustifyDistributeVerticalLayout(baseHeight: number, columnBreak: boolean, fnPositionX: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const limit = this._getFixedBreakingNum();
        const children = this._usefulLayoutObj;

        if (children.length === 0) {
            return this._getPaddingH();
        }

        // limit <= 0 时保持原有单列逻辑
        if (limit <= 0) {
            return this._doJustifyDistributeVerticalLayoutSingleColumn(baseHeight, fnPositionX, applyChildren);
        }

        // 按固定行数分列
        const columns = this._groupChildrenByFixedLimitVertical(children, limit, columnBreak);

        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const paddingV = this._getPaddingV();
            let newChildHeight = this._cellSize.height;

            if (this._layoutType !== Layout.Type.GRID) {
                const maxColCount = limit > 0 ? limit : children.length;
                newChildHeight = (baseHeight - paddingV - (maxColCount - 1) * this._spacingY) / maxColCount;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.height = newChildHeight / childScaleY;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.width = this._cellSize.width / childScaleX;
                }
            }
        }

        // 计算每列宽度和总宽度
        let totalWidth = this._paddingLeft;
        const columnWidths: number[] = [];

        for (const column of columns) {
            let colMaxWidth = 0;
            for (const childTrans of column) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childBoundingBoxWidth = childTrans.width * childScaleX;
                if (childBoundingBoxWidth > colMaxWidth) {
                    colMaxWidth = childBoundingBoxWidth;
                }
            }
            columnWidths.push(colMaxWidth);
            totalWidth += colMaxWidth;
            if (columns.indexOf(column) < columns.length - 1) {
                totalWidth += this._spacingX;
            }
        }
        totalWidth += this._paddingRight;

        const containerResizeBoundary = totalWidth;

        if (applyChildren) {
            // 计算每列的 X 位置并应用布局
            let currentX = -layoutAnchor.x * trans.width + this._paddingLeft;

            for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                const column = columns[colIndex];
                const colWidth = columnWidths[colIndex];

                // 设置该列所有元素的 X 坐标
                for (const childTrans of column) {
                    const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                    const childBoundingBoxWidth = childTrans.width * childScaleX;
                    const anchorX = childTrans.anchorX;
                    const finalPositionX = currentX + anchorX * childBoundingBoxWidth;
                    const currentPos = childTrans.node.position;
                    childTrans.node.setPosition(finalPositionX, currentPos.y, currentPos.z);
                }

                currentX += colWidth + this._spacingX;
            }

            // 对每列应用垂直居中布局
            for (const column of columns) {
                this._applyColumnCenterLayout(column, baseHeight, layoutAnchor);
            }
        }

        return containerResizeBoundary;
    }

    private _doCenterToSideVerticalLayout(baseHeight: number, columnBreak: boolean, fnPositionX: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const limit = this._getFixedBreakingNum();
        const children = this._usefulLayoutObj;

        if (children.length === 0) {
            return this._getPaddingH();
        }

        // limit <= 0 时保持原有单列逻辑
        if (limit <= 0) {
            return this._doCenterToSideVerticalLayoutSingleColumn(baseHeight, fnPositionX, applyChildren);
        }

        // 按固定行数分列
        const columns = this._groupChildrenByFixedLimitVertical(children, limit, columnBreak);

        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const paddingV = this._getPaddingV();
            let newChildHeight = this._cellSize.height;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildHeight = (baseHeight - paddingV - (limit - 1) * this._spacingY) / limit;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.height = newChildHeight / childScaleY;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.width = this._cellSize.width / childScaleX;
                }
            }
        }

        // 计算每列宽度和总宽度
        let totalWidth = this._paddingLeft;
        const columnWidths: number[] = [];

        for (const column of columns) {
            let colMaxWidth = 0;
            for (const childTrans of column) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childBoundingBoxWidth = childTrans.width * childScaleX;
                if (childBoundingBoxWidth > colMaxWidth) {
                    colMaxWidth = childBoundingBoxWidth;
                }
            }
            columnWidths.push(colMaxWidth);
            totalWidth += colMaxWidth;
            if (columns.indexOf(column) < columns.length - 1) {
                totalWidth += this._spacingX;
            }
        }
        totalWidth += this._paddingRight;

        const containerResizeBoundary = totalWidth;

        if (applyChildren) {
            // 计算每列的 X 位置
            let currentX = -layoutAnchor.x * trans.width + this._paddingLeft;

            for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                const column = columns[colIndex];
                const colWidth = columnWidths[colIndex];

                // 设置该列所有元素的 X 坐标（用于后续垂直居中）
                for (const childTrans of column) {
                    const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                    const childBoundingBoxWidth = childTrans.width * childScaleX;
                    const anchorX = childTrans.anchorX;
                    const finalPositionX = currentX + anchorX * childBoundingBoxWidth;
                    const currentPos = childTrans.node.position;
                    childTrans.node.setPosition(finalPositionX, currentPos.y, currentPos.z);
                }

                currentX += colWidth + this._spacingX;
            }

            // 对每列应用 CENTER_TO_SIDE 垂直布局
            for (const column of columns) {
                this._applyCenterToSideColumnLayout(column, (0.5 - layoutAnchor.y) * baseHeight, layoutAnchor, baseHeight, fnPositionX, 0);
            }
        }

        return containerResizeBoundary;
    }

    /**
     * 总是居中，无论一排多少个元素
     * 支持 LayoutConstraint 固定列数分行
     */
    private _doCenterToSideLayout(baseWidth: number, rowBreak: boolean, fnPositionY: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const limit = this._getFixedBreakingNum();
        const children = this._usefulLayoutObj;

        if (children.length === 0) {
            return this._getPaddingV();
        }

        // limit <= 0 时保持原有单行逻辑
        if (limit <= 0) {
            return this._doCenterToSideLayoutSingleRow(baseWidth, fnPositionY, applyChildren);
        }

        // 按固定列数分行
        const rows = this._groupChildrenByFixedLimit(children, limit, rowBreak);

        // 处理子节点大小调整
        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const paddingH = this._getPaddingH();
            let newChildWidth = this._cellSize.width;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildWidth = (baseWidth - paddingH - (limit - 1) * this._spacingX) / limit;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.width = newChildWidth / childScaleX;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.height = this._cellSize.height / childScaleY;
                }
            }
        }

        // 计算每行高度和总高度
        let totalHeight = this._paddingTop;
        const rowHeights: number[] = [];

        for (const row of rows) {
            let rowMaxHeight = 0;
            for (const childTrans of row) {
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);
                const childBoundingBoxHeight = childTrans.height * childScaleY;
                if (childBoundingBoxHeight > rowMaxHeight) {
                    rowMaxHeight = childBoundingBoxHeight;
                }
            }
            rowHeights.push(rowMaxHeight);
            totalHeight += rowMaxHeight;
            if (rows.indexOf(row) < rows.length - 1) {
                totalHeight += this._spacingY;
            }
        }
        totalHeight += this._paddingBottom;

        const containerResizeBoundary = totalHeight;

        // 应用居中布局
        if (applyChildren) {
            // 计算每行的 Y 位置并应用布局
            let currentY = (1 - layoutAnchor.y) * trans.height - this._paddingTop;

            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                const rowHeight = rowHeights[rowIndex];

                // 设置该行所有元素的 Y 坐标
                for (const childTrans of row) {
                    const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);
                    const childBoundingBoxHeight = childTrans.height * childScaleY;
                    const anchorY = childTrans.anchorY;
                    const finalPositionY = currentY - rowHeight + anchorY * childBoundingBoxHeight;
                    const currentPos = childTrans.node.position;
                    childTrans.node.setPosition(currentPos.x, finalPositionY, currentPos.z);
                }

                currentY -= rowHeight + this._spacingY;
            }

            // 对每行应用 CENTER_TO_SIDE 水平居中布局
            for (const row of rows) {
                this._applyCenterToSideRowLayout(row, (0.5 - layoutAnchor.x) * baseWidth, layoutAnchor, baseWidth, fnPositionY, 0);
            }
        }

        return containerResizeBoundary;
    }

    /**
     * 计算所有元素的总宽度，然后整体居中
     */
    private _applyCenterToSideLayout(children: UITransform[], baseWidth: number, layoutAnchor: any, fnPositionY: (...args: any[]) => number, totalHeight: number) {
        if (children.length === 0) return;

        const centerX = (0.5 - layoutAnchor.x) * baseWidth;

        // 按行分组
        const rowGroups = this._groupChildrenByRow(children);

        rowGroups.forEach(rowChildren => {
            this._applyCenterToSideRowLayout(rowChildren, centerX, layoutAnchor, baseWidth, fnPositionY, totalHeight);
        });
    }

    /**
     * 对单行应用CENTER_TO_SIDE居中布局
     */
    private _applyCenterToSideRowLayout(rowChildren: UITransform[], centerX: number, layoutAnchor: any, baseWidth: number, fnPositionY: (...args: any[]) => number, totalHeight: number) {
        if (rowChildren.length === 0) return;

        // 计算整行的总宽度（包括间距）
        let totalRowWidth = 0;
        for (let i = 0; i < rowChildren.length; i++) {
            const child = rowChildren[i];
            const childScaleX = this._getUsedScaleValue(child.node.scale.x);
            totalRowWidth += child.width * childScaleX;

            // 添加间距,除了最后一个元素
            if (i < rowChildren.length - 1) {
                totalRowWidth += this._spacingX;
            }
        }

        // 计算起始位置，使整行居中
        let currentX = centerX - totalRowWidth * 0.5;

        // 逐个设置每个子元素的位置
        for (const child of rowChildren) {
            const childScaleX = this._getUsedScaleValue(child.node.scale.x);
            const anchorX = child.anchorX;
            const childBoundingBoxWidth = child.width * childScaleX;

            // 设置Y位置
            const finalPositionY = fnPositionY(child.node, child, totalHeight);

            // 计算X位置,考虑锚点
            const positionX = currentX + anchorX * childBoundingBoxWidth;

            // 设置最终位置
            child.node.setPosition(new Vec3(positionX, finalPositionY, 0));

            // 移动到下一个位置
            currentX += childBoundingBoxWidth + this._spacingX;
        }
    }

    private _applyCenterToSideLayoutVertical(children: UITransform[], baseHeight: number, layoutAnchor: any, fnPositionX: (...args: any[]) => number, totalWidth: number) {
        if (children.length === 0) return;

        const centerY = (0.5 - layoutAnchor.y) * baseHeight;
        const columnGroups = this._groupChildrenByColumn(children);

        columnGroups.forEach(columnChildren => {
            this._applyCenterToSideColumnLayout(columnChildren, centerY, layoutAnchor, baseHeight, fnPositionX, totalWidth);
        });
    }

    private _applyCenterToSideColumnLayout(columnChildren: UITransform[], centerY: number, layoutAnchor: any, baseHeight: number, fnPositionX: (...args: any[]) => number, totalWidth: number) {
        if (columnChildren.length === 0) return;

        let totalColumnHeight = 0;
        for (let i = 0; i < columnChildren.length; i++) {
            const child = columnChildren[i];
            const childScaleY = this._getUsedScaleValue(child.node.scale.y);
            totalColumnHeight += child.height * childScaleY;

            if (i < columnChildren.length - 1) {
                totalColumnHeight += this._spacingY;
            }
        }

        let currentY = centerY - totalColumnHeight * 0.5;

        for (const child of columnChildren) {
            const childScaleY = this._getUsedScaleValue(child.node.scale.y);
            const anchorY = child.anchorY;
            const childBoundingBoxHeight = child.height * childScaleY;

            const finalPositionX = fnPositionX(child.node, child, totalWidth);
            const positionY = currentY + anchorY * childBoundingBoxHeight;

            child.node.setPosition(new Vec3(finalPositionX, positionY, 0));

            currentY += childBoundingBoxHeight + this._spacingY;
        }
    }

    /**
     * 应用自定义居中布局逻辑
     * 1个元素：完全居中
     * 2个元素：最左和最右
     * 3个元素：最左、居中、最右
     */
    private _applyCustomCenterLayout(children: UITransform[], baseWidth: number, layoutAnchor: Readonly<Vec2>) {
        // 按行分组子节点
        const rowGroups = this._groupChildrenByRow(children);

        rowGroups.forEach(rowChildren => {
            this._applyRowCenterLayout(rowChildren, baseWidth, layoutAnchor);
        });
    }

    private _applyCustomCenterVerticalLayout(children: UITransform[], baseHeight: number, layoutAnchor: Readonly<Vec2>) {
        const columnGroups = this._groupChildrenByColumn(children);

        columnGroups.forEach(columnChildren => {
            this._applyColumnCenterLayout(columnChildren, baseHeight, layoutAnchor);
        });
    }

    /**
     * 按行分组子节点
     */
    private _groupChildrenByRow(children: UITransform[]): UITransform[][] {
        const rows: UITransform[][] = [];
        let currentRow: UITransform[] = [];
        let lastY = Number.MIN_SAFE_INTEGER;

        for (const child of children) {
            if (!child.node.activeInHierarchy) {
                continue;
            }

            const childY = child.node.position.y;
            if (Math.abs(childY - lastY) > 1) {
                if (currentRow.length > 0) {
                    rows.push(currentRow);
                }
                currentRow = [child];
                lastY = childY;
            } else {
                currentRow.push(child);
            }
        }

        if (currentRow.length > 0) {
            rows.push(currentRow);
        }

        return rows;
    }

    private _groupChildrenByColumn(children: UITransform[]): UITransform[][] {
        const columns: UITransform[][] = [];
        let currentColumn: UITransform[] = [];
        let lastX = Number.MIN_SAFE_INTEGER;

        for (const child of children) {
            if (!child.node.activeInHierarchy) {
                continue;
            }

            const childX = child.node.position.x;
            if (Math.abs(childX - lastX) > 1) {
                if (currentColumn.length > 0) {
                    columns.push(currentColumn);
                }
                currentColumn = [child];
                lastX = childX;
            } else {
                currentColumn.push(child);
            }
        }

        if (currentColumn.length > 0) {
            columns.push(currentColumn);
        }

        return columns;
    }

    /**
     * 对单行应用居中布局
     */
    private _applyRowCenterLayout(rowChildren: UITransform[], baseWidth: number, layoutAnchor: Readonly<Vec2>) {
        const count = rowChildren.length;
        if (count === 0) return;

        const centerX = (0.5 - layoutAnchor.x) * baseWidth;
        const paddingH = this._getPaddingH();
        const availableWidth = baseWidth - paddingH;

        if (count === 1) {
            // 1个元素：完全居中
            const child = rowChildren[0];
            child.node.setPosition(new Vec3(0, child.node.position.y, 0));
        } else if (count === 2) {
            // 2个元素：左边元素锚点在0点，右边元素锚点在最大长度上
            const leftChild = rowChildren[0];
            const rightChild = rowChildren[1];

            // 计算布局边界（锚点位置范围）
            const leftBoundary = this._paddingLeft + (-layoutAnchor.x) * baseWidth;
            const rightBoundary = (1 - layoutAnchor.x) * baseWidth - this._paddingRight;

            // 左边元素锚点在leftBoundary
            leftChild.node.setPosition(new Vec3(leftBoundary, leftChild.node.position.y, 0));

            // 右边元素锚点在rightBoundary
            rightChild.node.setPosition(new Vec3(rightBoundary, rightChild.node.position.y, 0));
        } else {
            // 计算布局边界（锚点位置范围）
            const leftBoundary = this._paddingLeft + (-layoutAnchor.x) * baseWidth;
            const rightBoundary = (1 - layoutAnchor.x) * baseWidth - this._paddingRight;
            const totalAvailableWidth = rightBoundary - leftBoundary;

            // 计算锚点间距：总可用宽度 / (元素数量 - 1)
            const anchorSpacing = totalAvailableWidth / (count - 1);

            // 布局所有元素
            // 第一个元素锚点在leftBoundary，最后一个元素锚点在rightBoundary
            for (let i = 0; i < count; i++) {
                const child = rowChildren[i];

                // 计算当前元素的锚点位置
                const anchorPositionX = leftBoundary + i * anchorSpacing;

                // 设置元素位置（锚点位置就是元素的实际位置）
                child.node.setPosition(new Vec3(anchorPositionX, child.node.position.y, 0));
            }
        }
    }

    private _applyColumnCenterLayout(columnChildren: UITransform[], baseHeight: number, layoutAnchor: Readonly<Vec2>) {
        const count = columnChildren.length;
        if (count === 0) return;

        const centerY = (0.5 - layoutAnchor.y) * baseHeight;

        if (count === 1) {
            const child = columnChildren[0];
            child.node.setPosition(new Vec3(child.node.position.x, 0, 0));
        } else if (count === 2) {
            const bottomBoundary = this._paddingBottom + (-layoutAnchor.y) * baseHeight;
            const topBoundary = (1 - layoutAnchor.y) * baseHeight - this._paddingTop;

            const bottomChild = columnChildren[0];
            const topChild = columnChildren[1];

            bottomChild.node.setPosition(new Vec3(bottomChild.node.position.x, bottomBoundary, 0));
            topChild.node.setPosition(new Vec3(topChild.node.position.x, topBoundary, 0));
        } else {
            const bottomBoundary = this._paddingBottom + (-layoutAnchor.y) * baseHeight;
            const topBoundary = (1 - layoutAnchor.y) * baseHeight - this._paddingTop;
            const totalAvailableHeight = topBoundary - bottomBoundary;
            const anchorSpacing = totalAvailableHeight / (count - 1);

            for (let i = 0; i < count; i++) {
                const child = columnChildren[i];
                const anchorPositionY = bottomBoundary + i * anchorSpacing;
                child.node.setPosition(new Vec3(child.node.position.x, anchorPositionY, 0));
            }
        }
    }

    /**
     * 计算一行子节点的总宽度
     */
    private _getTotalChildrenWidth(children: UITransform[]): number {
        let totalWidth = 0;
        for (const child of children) {
            const childScaleX = this._getUsedScaleValue(child.node.scale.x);
            totalWidth += child.width * childScaleX;
        }
        return totalWidth;
    }

    /**
     * 按固定列数将子节点分组到多行（用于水平布局）
     * @param children 子节点列表
     * @param limit 每行最大元素数（0 表示不限制）
     * @param rowBreak 是否允许换行
     */
    private _groupChildrenByFixedLimit(children: UITransform[], limit: number, rowBreak: boolean): UITransform[][] {
        if (!rowBreak || limit <= 0) {
            // 不换行或无限制，所有元素在同一行
            return [children.slice()];
        }

        const rows: UITransform[][] = [];
        for (let i = 0; i < children.length; i += limit) {
            rows.push(children.slice(i, i + limit));
        }
        return rows;
    }

    /**
     * 按固定行数将子节点分组到多列（用于垂直布局）
     * @param children 子节点列表
     * @param limit 每列最大元素数（0 表示不限制）
     * @param columnBreak 是否允许换列
     */
    private _groupChildrenByFixedLimitVertical(children: UITransform[], limit: number, columnBreak: boolean): UITransform[][] {
        if (!columnBreak || limit <= 0) {
            // 不换列或无限制，所有元素在同一列
            return [children.slice()];
        }

        const columns: UITransform[][] = [];
        for (let i = 0; i < children.length; i += limit) {
            columns.push(children.slice(i, i + limit));
        }
        return columns;
    }

    /**
     * JUSTIFY_DISTRIBUTE 垂直单列模式（无固定行数限制时）
     */
    private _doJustifyDistributeVerticalLayoutSingleColumn(baseHeight: number, fnPositionX: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const children = this._usefulLayoutObj;

        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const activeChildCount = children.length;
            const paddingV = this._getPaddingV();
            let newChildHeight = this._cellSize.height;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildHeight = (baseHeight - paddingV - (activeChildCount - 1) * this._spacingY) / activeChildCount;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.height = newChildHeight / childScaleY;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.width = this._cellSize.width / childScaleX;
                }
            }
        }

        let totalWidth = 0;
        let columnMaxWidth = 0;
        let tempMaxWidth = 0;
        let maxWidth = 0;

        for (const childTrans of children) {
            const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
            const childBoundingBoxWidth = childTrans.width * childScaleX;

            if (childBoundingBoxWidth > tempMaxWidth) {
                maxWidth = Math.max(tempMaxWidth, maxWidth);
                columnMaxWidth = tempMaxWidth || childBoundingBoxWidth;
                tempMaxWidth = childBoundingBoxWidth;
            }
        }

        columnMaxWidth = Math.max(columnMaxWidth, tempMaxWidth);
        const containerResizeBoundary = Math.max(maxWidth, totalWidth + columnMaxWidth) + this._getPaddingH();

        if (applyChildren) {
            for (const childTrans of children) {
                const finalPositionX = fnPositionX(childTrans.node, childTrans, totalWidth);
                const currentPos = childTrans.node.position;
                childTrans.node.setPosition(finalPositionX, currentPos.y, currentPos.z);
            }

            this._applyCustomCenterVerticalLayout(children, baseHeight, layoutAnchor);
        }

        return containerResizeBoundary;
    }

    /**
     * CENTER_TO_SIDE 水平单行模式（无固定列数限制时）
     */
    private _doCenterToSideLayoutSingleRow(baseWidth: number, fnPositionY: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const children = this._usefulLayoutObj;

        // 处理子节点大小调整
        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const activeChildCount = children.length;
            const paddingH = this._getPaddingH();
            let newChildWidth = this._cellSize.width;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildWidth = (baseWidth - paddingH - (activeChildCount - 1) * this._spacingX) / activeChildCount;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.width = newChildWidth / childScaleX;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.height = this._cellSize.height / childScaleY;
                }
            }
        }

        // 计算高度
        let totalHeight = 0;
        let rowMaxHeight = 0;
        let tempMaxHeight = 0;
        let maxHeight = 0;

        for (const childTrans of children) {
            const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);
            const childBoundingBoxHeight = childTrans.height * childScaleY;

            if (childBoundingBoxHeight > tempMaxHeight) {
                maxHeight = Math.max(tempMaxHeight, maxHeight);
                rowMaxHeight = tempMaxHeight || childBoundingBoxHeight;
                tempMaxHeight = childBoundingBoxHeight;
            }
        }

        rowMaxHeight = Math.max(rowMaxHeight, tempMaxHeight);
        const containerResizeBoundary = Math.max(maxHeight, totalHeight + rowMaxHeight) + this._getPaddingV();

        // 应用居中布局
        if (applyChildren) {
            this._applyCenterToSideLayout(children, baseWidth, layoutAnchor, fnPositionY, totalHeight);
        }

        return containerResizeBoundary;
    }

    /**
     * CENTER_TO_SIDE 垂直单列模式（无固定行数限制时）
     */
    private _doCenterToSideVerticalLayoutSingleColumn(baseHeight: number, fnPositionX: (...args: any[]) => number, applyChildren: boolean): number {
        const trans = this.node._uiProps.uiTransformComp!;
        const layoutAnchor = trans.anchorPoint;
        const children = this._usefulLayoutObj;

        if (this._resizeMode === Layout.ResizeMode.CHILDREN) {
            const activeChildCount = children.length;
            const paddingV = this._getPaddingV();
            let newChildHeight = this._cellSize.height;

            if (this._layoutType !== Layout.Type.GRID) {
                newChildHeight = (baseHeight - paddingV - (activeChildCount - 1) * this._spacingY) / activeChildCount;
            }

            for (const childTrans of children) {
                const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
                const childScaleY = this._getUsedScaleValue(childTrans.node.scale.y);

                childTrans.height = newChildHeight / childScaleY;
                if (this._layoutType === Layout.Type.GRID) {
                    childTrans.width = this._cellSize.width / childScaleX;
                }
            }
        }

        let totalWidth = 0;
        let columnMaxWidth = 0;
        let tempMaxWidth = 0;
        let maxWidth = 0;

        for (const childTrans of children) {
            const childScaleX = this._getUsedScaleValue(childTrans.node.scale.x);
            const childBoundingBoxWidth = childTrans.width * childScaleX;

            if (childBoundingBoxWidth > tempMaxWidth) {
                maxWidth = Math.max(tempMaxWidth, maxWidth);
                columnMaxWidth = tempMaxWidth || childBoundingBoxWidth;
                tempMaxWidth = childBoundingBoxWidth;
            }
        }

        columnMaxWidth = Math.max(columnMaxWidth, tempMaxWidth);
        const containerResizeBoundary = Math.max(maxWidth, totalWidth + columnMaxWidth) + this._getPaddingH();

        if (applyChildren) {
            this._applyCenterToSideLayoutVertical(children, baseHeight, layoutAnchor, fnPositionX, totalWidth);
        }

        return containerResizeBoundary;
    }

}
