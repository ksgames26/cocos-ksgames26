import { readFileSync } from "node:fs";
import { extname } from "node:path";

/**
 * 解析行列字符串 "row-col" 为数字对象
 * @param rowCol 格式为 "row-col" 的字符串
 * @returns { row: number, col: number }
 */
export function parseRowCol(rowCol: string): { row: number; col: number } {
    const parts = rowCol.split("-");
    return {
        row: parseInt(parts[0], 10) || 0,
        col: parseInt(parts[1], 10) || 0,
    };
}

/**
 * I18N 配置数据结构
 * key: 语言代码 (如 "zh", "en", "ja", "de" 等)
 * value: { key: 翻译文本 }
 */
export interface I18NData {
    [language: string]: {
        [key: string]: string;
    };
}

/**
 * 解析 Excel 或 CSV 文件中的 i18n 配置
 * @param filePath 配置文件路径
 * @param startRowCol 起始行列 "row-col" (1-based)，指向数据开始行
 * @param endRowCol 结束行列 "row-col" (1-based), 如果为 "0-0" 则读取到最后空白处
 * @param langCodeRow 语言代码所在行 (1-based)，默认为2（即第2行包含 id, zh, en 等）
 * @returns I18NData 对象
 */
export async function parseI18NConfig(
    filePath: string,
    startRowCol: string,
    endRowCol: string,
    langCodeRow: number = 2
): Promise<I18NData> {
    const fileType = extname(filePath).toLowerCase();

    if (fileType === ".csv") {
        return parseCSV(filePath, startRowCol, endRowCol, langCodeRow);
    } else if (fileType === ".xlsx" || fileType === ".xls") {
        return parseExcel(filePath, startRowCol, endRowCol, langCodeRow);
    }

    throw new Error(`Unsupported file type: ${fileType}`);
}

/**
 * 解析 CSV 文件
 */
function parseCSV(
    filePath: string,
    startRowCol: string,
    endRowCol: string,
    langCodeRow: number
): I18NData {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);

    const start = parseRowCol(startRowCol);
    const end = parseRowCol(endRowCol);

    // 转换为 0-based 索引
    const startRow = start.row - 1;
    const startCol = start.col - 1;
    const endRow = end.row === 0 ? -1 : end.row - 1;
    const endCol = end.col === 0 ? -1 : end.col - 1;
    const langRow = langCodeRow - 1; // 语言代码行 (0-based)

    // 解析所有 CSV 行
    const allRows: string[][] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) {
            // 如果结束行为0，遇到空行则停止（但只在数据区域）
            if (endRow === -1 && i >= startRow) {
                break;
            }
            allRows.push([]);
            continue;
        }
        allRows.push(parseCSVLine(line));
    }

    // 提取语言代码行
    const langCodeRowData = allRows[langRow] || [];
    const languageCodes = langCodeRowData.slice(startCol);

    // 提取数据行
    const dataRows: string[][] = [];
    const actualEndRow = endRow === -1 ? allRows.length - 1 : endRow;
    for (let r = startRow; r <= actualEndRow && r < allRows.length; r++) {
        const row = allRows[r];
        if (row.length === 0) break; // 遇到空行停止
        dataRows.push(row.slice(startCol));
    }

    return extractI18NDataFromRows(languageCodes, dataRows);
}

/**
 * 简单的 CSV 行解析
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

/**
 * 解析 Excel 文件 (xlsx/xls)
 * 使用 xlsx 库
 */
async function parseExcel(
    filePath: string,
    startRowCol: string,
    endRowCol: string,
    langCodeRow: number
): Promise<I18NData> {
    // 动态导入 xlsx 库
    let XLSX: typeof import("xlsx");
    try {
        XLSX = await import("xlsx");
    } catch (e) {
        throw new Error(
            "xlsx library is not installed. Please run: npm install xlsx"
        );
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 获取工作表范围
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");

    const start = parseRowCol(startRowCol);
    const end = parseRowCol(endRowCol);

    // 转换为 0-based 索引
    const startRow = start.row - 1;
    const startCol = start.col - 1;
    const langRow = langCodeRow - 1; // 语言代码行 (0-based)
    let endRow = end.row === 0 ? range.e.r : end.row - 1;
    let endCol = end.col === 0 ? range.e.c : end.col - 1;

    // 如果结束行列为 0-0，需要找到最后一个非空行
    if (end.row === 0 && end.col === 0) {
        endRow = findLastNonEmptyRow(worksheet, startRow, startCol, range.e.r, XLSX);
        endCol = range.e.c;
    }

    // 读取语言代码行
    const languageCodes: string[] = [];
    for (let c = startCol; c <= endCol; c++) {
        const cellAddress = XLSX.utils.encode_cell({ r: langRow, c });
        const cell = worksheet[cellAddress];
        const value = cell ? String(cell.v ?? "") : "";
        languageCodes.push(value.trim());
    }

    // 读取数据行
    const dataRows: string[][] = [];
    for (let r = startRow; r <= endRow; r++) {
        const row: string[] = [];
        let allEmpty = true;

        for (let c = startCol; c <= endCol; c++) {
            const cellAddress = XLSX.utils.encode_cell({ r, c });
            const cell = worksheet[cellAddress];
            const value = cell ? String(cell.v ?? "") : "";
            row.push(value);
            if (value.trim()) {
                allEmpty = false;
            }
        }

        // 如果整行都是空的且结束行未指定，则停止
        if (allEmpty && end.row === 0) {
            break;
        }

        dataRows.push(row);
    }

    return extractI18NDataFromRows(languageCodes, dataRows);
}

/**
 * 找到最后一个非空行
 */
function findLastNonEmptyRow(
    worksheet: any,
    startRow: number,
    startCol: number,
    maxRow: number,
    XLSX: typeof import("xlsx")
): number {
    let lastNonEmptyRow = startRow;

    for (let r = startRow; r <= maxRow; r++) {
        let hasContent = false;
        for (let c = startCol; c <= startCol + 10; c++) {
            // 检查前10列
            const cellAddress = XLSX.utils.encode_cell({ r, c });
            const cell = worksheet[cellAddress];
            if (cell && String(cell.v ?? "").trim()) {
                hasContent = true;
                break;
            }
        }
        if (hasContent) {
            lastNonEmptyRow = r;
        } else {
            // 遇到空行，停止
            break;
        }
    }

    return lastNonEmptyRow;
}

/**
 * 从行数据中提取 I18N 数据
 * @param languageCodes 语言代码数组 (如: ['id', 'zh', 'en', 'ja', 'de'])，第一个是key列
 * @param dataRows 数据行数组，每行格式为 [key, zh_value, en_value, ja_value, ...]
 * @returns I18NData 对象
 */
function extractI18NDataFromRows(
    languageCodes: string[],
    dataRows: string[][]
): I18NData {
    const result: I18NData = {};

    if (languageCodes.length < 2 || dataRows.length === 0) {
        return result;
    }

    // 第一列是 key (如 'id')，后面的列是语言代码
    // languageCodes[0] = 'id' (key列标识)
    // languageCodes[1] = 'zh'
    // languageCodes[2] = 'en'
    // ...
    const languages: { code: string; colIndex: number }[] = [];
    for (let c = 1; c < languageCodes.length; c++) {
        const langCode = languageCodes[c]?.trim();
        if (langCode) {
            languages.push({ code: langCode, colIndex: c });
            result[langCode] = {};
        }
    }

    // 遍历数据行
    for (const row of dataRows) {
        const key = row[0]?.trim(); // 第一列是 key

        if (!key) {
            continue; // 跳过没有 key 的行
        }

        // 读取每个语言的值
        for (const lang of languages) {
            const value = row[lang.colIndex]?.trim() ?? "";
            result[lang.code][key] = value;
        }
    }

    return result;
}
