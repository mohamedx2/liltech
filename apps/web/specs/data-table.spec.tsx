import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { DataTable } from '../src/components/ui/table';

interface Row {
  id: string;
  name: string;
  status: string;
}

const ROWS: Row[] = [
  { id: 'a', name: 'Alpha', status: 'active' },
  { id: 'b', name: 'Beta', status: 'withdrawn' },
];

describe('DataTable', () => {
  afterEach(() => cleanup());

  it('labels every cell with its column header so phones can show rows as cards', () => {
    render(
      <DataTable
        caption="Teams"
        rows={ROWS}
        getRowKey={(row) => row.id}
        columns={[
          { key: 'name', header: 'Team', render: (row) => row.name },
          { key: 'status', header: 'Standing', render: (row) => row.status },
        ]}
      />,
    );

    const table = screen.getByRole('table', { name: 'Teams' });
    const cells = within(table).getAllByRole('cell');
    expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Team',
      'Standing',
      'Team',
      'Standing',
    ]);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Team', 'Standing']);
  });
});
