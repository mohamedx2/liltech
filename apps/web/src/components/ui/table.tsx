import type { ReactNode } from 'react';
import styles from './table.module.css';

export interface TableColumn<TRow> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: TRow) => ReactNode;
}

export interface DataTableProps<TRow> {
  caption: string;
  columns: readonly TableColumn<TRow>[];
  rows: readonly TRow[];
  getRowKey: (row: TRow) => string;
}

export function DataTable<TRow>({ caption, columns, rows, getRowKey }: DataTableProps<TRow>) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
