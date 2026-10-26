import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../api/catalog-api.model';
import type { Item } from '../api/catalog-api.model';
import { buildItem, createApiMock, deferred } from '../testing/fake-catalog-api';
import { Dashboard } from './dashboard';

const dune = buildItem({ id: 'b1', title: 'Dune' });
const emma = buildItem({ id: 'b2', title: 'Emma', author: 'Jane Austen', publicationYear: 1815 });
const abbeyRoad = buildItem({
  id: 'v1',
  kind: 'vinyl',
  title: 'Abbey Road',
  author: 'The Beatles',
  publicationYear: 1969,
  identifier: '036000291452',
  aiClassification: 'Rock',
});
const matrix = buildItem({
  id: 'f1',
  kind: 'video-file',
  title: 'Matrix',
  author: null,
  publicationYear: null,
  aiClassification: null,
  enrichmentCompleted: false,
  identifier: '/home/user/matrix.mkv',
});
const items = [dune, emma, abbeyRoad, matrix];

const setup = (data: readonly Item[] = items) => {
  const api = createApiMock(data);
  const user = userEvent.setup();
  const view = render(<Dashboard api={api} />);
  return { api, user, ...view };
};

const cardTitles = (): string[] =>
  screen
    .queryAllByRole('listitem')
    .map((card) => within(card).getByRole('button').textContent ?? '');

describe('Dashboard', () => {
  describe('global grid view', () => {
    it('loads and shows every item as a card', async () => {
      const { api } = setup();

      expect(
        await screen.findByRole('button', { name: 'Open details of Dune' }),
      ).toBeInTheDocument();
      expect(api.listItems).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole('listitem')).toHaveLength(4);
      expect(screen.getByRole('button', { name: 'Open details of Matrix' })).toBeInTheDocument();
    });

    it('shows kind, author and year on each card, and flags items that are not enriched', async () => {
      setup();

      const card = (
        await screen.findByRole('button', { name: 'Open details of Abbey Road' })
      ).closest('li') as HTMLElement;
      expect(card).toHaveTextContent('Vinyl');
      expect(card).toHaveTextContent('The Beatles · 1969');
      expect(card).not.toHaveTextContent('Not enriched');

      const matrixCard = screen
        .getByRole('button', { name: 'Open details of Matrix' })
        .closest('li');
      expect(matrixCard).toHaveTextContent('Unknown');
      expect(matrixCard).toHaveTextContent('Not enriched');
    });

    it('shows a loading indicator until the data arrives', async () => {
      const pending = deferred<Item[]>();
      const api = createApiMock();
      api.listItems.mockReturnValue(pending.promise);
      render(<Dashboard api={api} />);

      expect(screen.getByRole('status')).toHaveTextContent('Loading the catalog');

      pending.resolve([dune]);
      expect(await screen.findByText('Dune')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('explains that the catalog is empty', async () => {
      setup([]);

      expect(await screen.findByText(/The catalog is empty/)).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('shows the error and retries when asked to', async () => {
      const api = createApiMock([dune]);
      api.listItems.mockRejectedValueOnce(
        new ApiError(0, 'network_error', 'The server cannot be reached.'),
      );
      const user = userEvent.setup();
      render(<Dashboard api={api} />);

      expect(await screen.findByRole('alert')).toHaveTextContent('The server cannot be reached.');

      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Dune')).toBeInTheDocument();
      expect(api.listItems).toHaveBeenCalledTimes(2);
    });

    it('reloads the list when the refresh key changes', async () => {
      const api = createApiMock([dune]);
      const { rerender } = render(<Dashboard api={api} refreshKey={0} />);
      await screen.findByText('Dune');

      rerender(<Dashboard api={api} refreshKey={1} />);

      await waitFor(() => expect(api.listItems).toHaveBeenCalledTimes(2));
    });
  });

  describe('filter tabs view', () => {
    it('shows one tab per type plus "All", with "All" selected at start', async () => {
      setup();
      await screen.findByText('Dune');

      const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
      expect(tabs).toEqual(['All', 'Books', 'Vinyls', 'CDs', 'Video files', 'Audio files']);
      expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    });

    it('loads and shows only the items of the clicked type', async () => {
      const { api, user } = setup();
      await screen.findByText('Dune');

      await user.click(screen.getByRole('tab', { name: 'Vinyls' }));

      await waitFor(() => expect(cardTitles()).toHaveLength(1));
      expect(api.listItemsByType).toHaveBeenCalledWith('vinyl');
      expect(
        screen.getByRole('button', { name: 'Open details of Abbey Road' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('Dune')).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Vinyls' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false');
    });

    it('filters books and goes back to every item with "All"', async () => {
      const { user } = setup();
      await screen.findByText('Dune');

      await user.click(screen.getByRole('tab', { name: 'Books' }));
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));

      await user.click(screen.getByRole('tab', { name: 'All' }));
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
    });

    it('names the type in the empty message of a tab', async () => {
      const { user } = setup();
      await screen.findByText('Dune');

      await user.click(screen.getByRole('tab', { name: 'CDs' }));

      expect(await screen.findByText('No cds yet.')).toBeInTheDocument();
    });

    it('shows the error of a failed filter and recovers on retry', async () => {
      const { api, user } = setup();
      await screen.findByText('Dune');
      api.listItemsByType.mockRejectedValueOnce(
        new ApiError(500, 'internal_error', 'Internal server error.'),
      );

      await user.click(screen.getByRole('tab', { name: 'Books' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error.');

      await user.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    });

    it('ignores a slow answer that arrives after the user changed tab', async () => {
      const slow = deferred<Item[]>();
      const { api, user } = setup();
      await screen.findByText('Dune');
      api.listItemsByType.mockReturnValueOnce(slow.promise);

      await user.click(screen.getByRole('tab', { name: 'Books' }));
      await user.click(screen.getByRole('tab', { name: 'Vinyls' }));
      await screen.findByRole('button', { name: 'Open details of Abbey Road' });

      slow.resolve([dune, emma]);

      await waitFor(() => expect(cardTitles()).toHaveLength(1));
      expect(screen.queryByText('Emma')).not.toBeInTheDocument();
    });
  });

  describe('single card detail view', () => {
    it('opens the detail of the clicked item with all its attributes', async () => {
      const { user } = setup();

      await user.click(await screen.findByRole('button', { name: 'Open details of Abbey Road' }));

      expect(screen.getByRole('heading', { name: 'Abbey Road' })).toBeInTheDocument();
      expect(screen.getByText('Vinyl')).toBeInTheDocument();
      expect(screen.getByText('The Beatles')).toBeInTheDocument();
      expect(screen.getByText('1969')).toBeInTheDocument();
      expect(screen.getByText('Rock')).toBeInTheDocument();
      expect(screen.getByText('036000291452')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('uses the labels of the type: absolute path for files, ISBN for books', async () => {
      const { user } = setup();

      await user.click(await screen.findByRole('button', { name: 'Open details of Matrix' }));
      expect(screen.getByText('Absolute path')).toBeInTheDocument();
      expect(screen.getByText('/home/user/matrix.mkv')).toBeInTheDocument();
      expect(screen.getByText('Director')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Back to the list/ }));
      await user.click(await screen.findByRole('button', { name: 'Open details of Dune' }));
      expect(screen.getByText('ISBN')).toBeInTheDocument();
      expect(screen.getByText('9780306406157')).toBeInTheDocument();
    });

    it('shows readable fallbacks for missing values and a pending enrichment', async () => {
      const { user } = setup();

      await user.click(await screen.findByRole('button', { name: 'Open details of Matrix' }));

      expect(screen.getAllByText('Unknown')).toHaveLength(2);
      expect(screen.getByText('Not classified')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('goes back to the grid on the tab that was selected', async () => {
      const { user } = setup();
      await screen.findByText('Dune');
      await user.click(screen.getByRole('tab', { name: 'Books' }));
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
      await user.click(screen.getByRole('button', { name: 'Open details of Emma' }));

      await user.click(screen.getByRole('button', { name: /Back to the list/ }));

      expect(await screen.findByRole('tab', { name: 'Books' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    });
  });

  describe('managing the item in the detail view', () => {
    const confirmDeletion = (answer = true) =>
      jest.spyOn(window, 'confirm').mockReturnValue(answer);

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('deletes the item after the confirmation and returns to the global grid without it', async () => {
      const confirm = confirmDeletion();
      const { api, user } = setup();
      await user.click(screen.getByRole('tab', { name: 'Books' }));
      await user.click(await screen.findByRole('button', { name: 'Open details of Emma' }));
      api.listItems.mockResolvedValue(items.filter((item) => item !== emma));

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(confirm).toHaveBeenCalledWith('Delete "Emma"? This action cannot be undone.');
      expect(api.deleteItem).toHaveBeenCalledWith('b2');
      expect(await screen.findByRole('tab', { name: 'All' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
      expect(
        screen.queryByRole('button', { name: 'Open details of Emma' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Emma' })).not.toBeInTheDocument();
    });

    it('stays on the detail card when the user does not confirm the deletion', async () => {
      confirmDeletion(false);
      const { api, user } = setup();
      await user.click(await screen.findByRole('button', { name: 'Open details of Dune' }));

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(api.deleteItem).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Dune' })).toBeInTheDocument();
    });

    it('stays on the detail card with an error when the deletion fails', async () => {
      confirmDeletion();
      const { api, user } = setup();
      api.deleteItem.mockRejectedValue(new ApiError(404, 'not_found', 'Item "b1" not found.'));
      await user.click(await screen.findByRole('button', { name: 'Open details of Dune' }));

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Item "b1" not found.');
      expect(screen.getByRole('heading', { name: 'Dune' })).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('edits the item in place, notifies the success and shows the new values in the grid', async () => {
      const { api, user } = setup();
      await user.click(await screen.findByRole('button', { name: 'Open details of Dune' }));
      api.listItems.mockResolvedValue([
        { ...dune, title: 'Dune Messiah' },
        emma,
        abbeyRoad,
        matrix,
      ]);

      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Dune Messiah');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(
        await screen.findByText(/“Dune Messiah” was updated successfully/),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Dune Messiah' })).toBeInTheDocument();
      expect(api.updateItem).toHaveBeenCalledWith('b1', { title: 'Dune Messiah' });

      await user.click(screen.getByRole('button', { name: /Back to the list/ }));

      expect(
        await screen.findByRole('button', { name: 'Open details of Dune Messiah' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Open details of Dune' }),
      ).not.toBeInTheDocument();
    });
  });
});
