import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BrandMark } from '../src/components/layout/brand-mark';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessState,
} from '../src/components/feedback/state-panel';
import { Button } from '../src/components/ui/button';
import { Dialog } from '../src/components/ui/dialog';
import { FormField, TextInput } from '../src/components/ui/input';
import { DataTable } from '../src/components/ui/table';
import { ThemeToggle } from '../src/components/ui/theme-toggle';

describe('UI and feedback primitives', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.head.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('disables Button and exposes aria-busy with loadingLabel when loading', () => {
    render(
      <Button loading loadingLabel="Submitting…">
        Submit
      </Button>,
    );

    const button = screen.getByRole('button', { name: /submitting…/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('connects FormField label, hint, and error via aria-describedby and aria-invalid', () => {
    render(
      <FormField
        id="sample-field"
        label="Team name"
        hint="2–80 characters"
        required
        error="Required"
      >
        {({ id, describedBy, invalid }) => (
          <TextInput id={id} invalid={invalid} aria-describedby={describedBy} />
        )}
      </FormField>,
    );

    const input = screen.getByLabelText(/team name/i);
    expect(input.getAttribute('id')).toBe('sample-field');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('sample-field-hint sample-field-error');
    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('opens and closes native Dialog via showModal/close when available or open attribute fallback', () => {
    function DialogHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Open modal</Button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Confirm action">
            <p>Modal body content</p>
          </Dialog>
        </>
      );
    }

    const showModalSpy = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    const closeSpy = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });

    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModalSpy,
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: closeSpy,
    });

    render(<DialogHarness />);
    fireEvent.click(screen.getByRole('button', { name: /open modal/i }));

    expect(showModalSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Confirm action')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('renders semantic DataTable with caption and column headers', () => {
    render(
      <DataTable
        caption="Sample schedule"
        columns={[
          { key: 'time', header: 'Time', render: (row) => row.time },
          { key: 'event', header: 'Milestone', render: (row) => row.event },
        ]}
        rows={[{ id: '1', time: '20:00', event: 'Mini-CTF opens' }]}
        getRowKey={(row) => row.id}
      />,
    );

    expect(screen.getByText('Sample schedule')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Time' }).getAttribute('scope')).toBe('col');
    expect(screen.getByText('Mini-CTF opens')).toBeTruthy();
  });

  it('renders LoadingState, EmptyState, ErrorState retry action, and SuccessState', () => {
    const onRetry = vi.fn();

    render(
      <>
        <LoadingState title="Loading status" message="Wait…" />
        <EmptyState title="Nothing queued" message="No items yet." />
        <ErrorState title="Failed request" message="Server error" onRetry={onRetry} />
        <SuccessState title="Saved" message="Changes recorded" />
      </>,
    );

    expect(screen.getByRole('progressbar', { name: 'Loading status' })).toBeTruthy();
    expect(screen.getByText('Nothing queued')).toBeTruthy();
    expect(screen.getByText('Saved')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders neutral LilTech wordmark fallback in BrandMark before official SVG assets arrive', () => {
    render(<BrandMark />);
    const link = screen.getByRole('link', { name: /liltech 2026/i });
    expect(link.getAttribute('href')).toBe('/');
  });

  it('syncs ThemeToggle choice with meta[name="color-scheme"] and localStorage', () => {
    const meta = document.createElement('meta');
    meta.name = 'color-scheme';
    meta.content = 'light dark';
    document.head.appendChild(meta);

    render(<ThemeToggle />);

    const darkButton = screen.getByRole('button', { name: 'Dark' });
    fireEvent.click(darkButton);
    expect(meta.content).toBe('dark');
    expect(window.localStorage.getItem('color-scheme')).toBe('dark');
    expect(darkButton.getAttribute('aria-pressed')).toBe('true');

    const systemButton = screen.getByRole('button', { name: 'System' });
    fireEvent.click(systemButton);
    expect(meta.content).toBe('light dark');
    expect(window.localStorage.getItem('color-scheme')).toBeNull();
    expect(systemButton.getAttribute('aria-pressed')).toBe('true');
  });
});
