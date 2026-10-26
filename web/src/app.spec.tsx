import { describe, expect, it } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildItem, createApiMock } from './testing/fake-catalog-api';
import { App } from './app';

describe('App', () => {
  it('shows the ingest form next to the catalog dashboard', async () => {
    render(<App api={createApiMock([buildItem()])} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Multimedia Catalog' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add an item' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Catalog' })).toBeInTheDocument();
    expect(await screen.findByText('Dune')).toBeInTheDocument();
  });

  it('refreshes the catalog after an item is created', async () => {
    const api = createApiMock();
    const user = userEvent.setup();
    render(<App api={api} />);
    expect(await screen.findByText(/The catalog is empty/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('ISBN'), '9780306406157');
    await user.type(screen.getByLabelText('Title'), 'Dune');
    api.listItems.mockResolvedValue([buildItem({ title: 'Dune' })]);
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    const grid = await screen.findByRole('tabpanel');
    expect(await within(grid).findByText('Dune')).toBeInTheDocument();
    expect(api.listItems).toHaveBeenCalledTimes(2);
  });
});
