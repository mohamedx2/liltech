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
      {/* Explicit roles keep table semantics when phones restyle rows as cards. */}
      <table className={styles.table} role="table">
        <caption className={styles.caption}>{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((column) => (
              <th key={column.key} scope="col" role="columnheader">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr key={getRowKey(row)} role="row">
              {columns.map((column) => (
                <td key={column.key} data-label={column.header} role="cell">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
