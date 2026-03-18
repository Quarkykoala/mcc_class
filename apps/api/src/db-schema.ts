import { query } from './db';

const tableColumnCache = new Map<string, Set<string>>();

export const getTableColumns = async (tableName: string): Promise<Set<string>> => {
    const cached = tableColumnCache.get(tableName);
    if (cached) {
        return cached;
    }

    const rows = await query<{ COLUMN_NAME: string }>(
        `SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
    );

    const columns = new Set(rows.map((row) => row.COLUMN_NAME));
    tableColumnCache.set(tableName, columns);
    return columns;
};

export const tableHasColumn = async (tableName: string, columnName: string): Promise<boolean> => {
    const columns = await getTableColumns(tableName);
    return columns.has(columnName);
};

export const pickExistingColumns = async (tableName: string, columnNames: string[]): Promise<string[]> => {
    const columns = await getTableColumns(tableName);
    return columnNames.filter((columnName) => columns.has(columnName));
};
