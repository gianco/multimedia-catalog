import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../api/catalog-api.model';
import type { Item } from '../api/catalog-api.model';
import { buildItem, createApiMock, deferred } from '../testing/fake-catalog-api';
import { ItemDetail } from './item-detail';

const dune = buildItem({ id: 'b1', title: 'Dne', author: 'F. Herbert', publicationYear: 1956 });

function setup(item: Item = dune, confirmAnswer = true) {
  const api = createApiMock([item]);
  const user = userEvent.setup();
  const onBack = jest.fn();
  const onDeleted = jest.fn();
  const onUpdated = jest.fn();
  const confirm = jest.fn<(message: string) => boolean>().mockReturnValue(confirmAnswer);
  const view = render(
    <ItemDetail
      api={api}
      item={item}
      onBack={onBack}
      onDeleted={onDeleted}
      onUpdated={onUpdated}
      confirm={confirm}
    />,
  );
  return { api, user, onBack, onDeleted, onUpdated, confirm, ...view };
}

describe('ItemDetail', () => {
  describe('static card', () => {
    it('shows the item with the Edit and Delete buttons', () => {
      setup();

      expect(screen.getByRole('heading', { name: 'Dne' })).toBeInTheDocument();
      expect(screen.getByText('F. Herbert')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    });

    it('goes back to the list', async () => {
      const { user, onBack } = setup();

      await user.click(screen.getByRole('button', { name: /Back to the list/ }));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Delete', () => {
    it('asks for confirmation naming the item, then deletes it and notifies the parent', async () => {
      const { user, api, confirm, onDeleted } = setup();

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm).toHaveBeenCalledWith('Delete "Dne"? This action cannot be undone.');
      await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
      expect(api.deleteItem).toHaveBeenCalledTimes(1);
      expect(api.deleteItem).toHaveBeenCalledWith('b1');
    });

    it('does nothing when the user cancels the confirmation', async () => {
      const { user, api, onDeleted } = setup(dune, false);

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(api.deleteItem).not.toHaveBeenCalled();
      expect(onDeleted).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    });

    it('shows a spinner and locks every action while the item is being deleted', async () => {
      const pending = deferred<void>();
      const { user, api, onDeleted } = setup();
      api.deleteItem.mockReturnValue(pending.promise);

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Deleting the item');
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Back to the list/ })).toBeDisabled();
      expect(onDeleted).not.toHaveBeenCalled();

      pending.resolve();
      await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    });

    it('keeps the card and shows the error when the deletion fails', async () => {
      const { user, api, onDeleted } = setup();
      api.deleteItem.mockRejectedValue(new ApiError(404, 'not_found', 'Item "b1" not found.'));

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Item "b1" not found.');
      expect(onDeleted).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Dne' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    });

    it('hides unexpected error details behind a generic message', async () => {
      const { user, api } = setup();
      api.deleteItem.mockRejectedValue(new TypeError('Cannot read properties of undefined'));

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Something went wrong. Please try again.');
      expect(alert).not.toHaveTextContent('undefined');
    });
  });

  describe('Edit', () => {
    it('replaces the static card with an inline form prefilled with the current values', async () => {
      const { user } = setup();

      await user.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByRole('form', { name: 'Edit Dne' })).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('Dne');
      expect(screen.getByLabelText('Author')).toHaveValue('F. Herbert');
      expect(screen.getByLabelText('Publication year')).toHaveValue('1956');
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(screen.queryByRole('term')).not.toBeInTheDocument();
    });

    it('labels the creator field by item type', async () => {
      const { user } = setup(buildItem({ kind: 'vinyl', identifier: '036000291452' }));

      await user.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByLabelText('Artist')).toBeInTheDocument();
      expect(screen.queryByLabelText('Author')).not.toBeInTheDocument();
    });

    it('does not let the user edit the identifier, the type or the AI data', async () => {
      const { user } = setup();

      await user.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.queryByLabelText('ISBN')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Type')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/classification/i)).not.toBeInTheDocument();
      expect(screen.getByText(/cannot be edited/)).toBeInTheDocument();
    });

    it('sends a PUT request with only the corrected fields and shows a success notification', async () => {
      const { user, api, onUpdated } = setup();
      await user.click(screen.getByRole('button', { name: 'Edit' }));

      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Dune');
      await user.clear(screen.getByLabelText('Publication year'));
      await user.type(screen.getByLabelText('Publication year'), '1965');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByText(/“Dune” was updated successfully/)).toBeInTheDocument();
      expect(api.updateItem).toHaveBeenCalledTimes(1);
      expect(api.updateItem).toHaveBeenCalledWith('b1', { title: 'Dune', publicationYear: 1965 });
      expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 'b1', title: 'Dune' }));
    });

    it('goes back to the static card after saving, with the notice and the Edit button', async () => {
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Dune');

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('status')).toHaveTextContent('updated successfully');
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('clears the author with null when the input is emptied', async () => {
      const { user, api } = setup();
      await user.click(screen.getByRole('button', { name: 'Edit' }));

      await user.clear(screen.getByLabelText('Author'));
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith('b1', { author: null }));
    });

    it('discards the changes on Cancel without calling the API', async () => {
      const { user, api } = setup();
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Something else');

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(api.updateItem).not.toHaveBeenCalled();
      expect(screen.getByRole('heading', { name: 'Dne' })).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('does not call the API nor show a notice when nothing changed', async () => {
      const { user, api } = setup();
      await user.click(screen.getByRole('button', { name: 'Edit' }));

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(api.updateItem).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.queryByText(/updated successfully/)).not.toBeInTheDocument();
    });
  });

  describe('Edit - validation and errors', () => {
    it('blocks an empty title and an invalid year without calling the API', async () => {
      const { user, api } = setup();
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.clear(screen.getByLabelText('Publication year'));
      await user.type(screen.getByLabelText('Publication year'), '19x5');

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(screen.getByText('The title is required.')).toBeInTheDocument();
      expect(screen.getByText(/Enter a year between 1 and/)).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
      expect(api.updateItem).not.toHaveBeenCalled();
    });

    it('shows a spinner and locks the form while saving', async () => {
      const pending = deferred<Item>();
      const { user, api } = setup();
      api.updateItem.mockReturnValue(pending.promise);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Dune');

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Saving the changes');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.getByLabelText('Title')).toBeDisabled();

      pending.resolve({ ...dune, title: 'Dune' });
      expect(await screen.findByText(/was updated successfully/)).toBeInTheDocument();
    });

    it('does not send twice when the form is submitted again while saving', async () => {
      const pending = deferred<Item>();
      const { user, api } = setup();
      api.updateItem.mockReturnValue(pending.promise);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Dune');

      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await user.type(screen.getByLabelText('Title'), '{Enter}');

      expect(api.updateItem).toHaveBeenCalledTimes(1);
      pending.resolve({ ...dune, title: 'Dune' });
      expect(await screen.findByText(/was updated successfully/)).toBeInTheDocument();
    });

    it('shows the error of the backend and keeps the form with what the user typed', async () => {
      const { user, api, onUpdated } = setup();
      // The form accepts this year; a rule that only the backend knows rejects the correction.
      api.updateItem.mockRejectedValue(
        new ApiError(
          422,
          'domain_violation',
          'VideoFile: the absolute path must not coincide with the title.',
        ),
      );
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Publication year'));
      await user.type(screen.getByLabelText('Publication year'), '1965');

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'must not coincide with the title',
      );
      expect(screen.getByLabelText('Publication year')).toHaveValue('1965');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
      expect(onUpdated).not.toHaveBeenCalled();
      expect(screen.queryByText(/updated successfully/)).not.toBeInTheDocument();
    });

    it('hides unexpected error details behind a generic message', async () => {
      const { user, api } = setup();
      api.updateItem.mockRejectedValue(new TypeError('Cannot read properties of undefined'));
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Dune');

      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Something went wrong. Please try again.');
      expect(alert).not.toHaveTextContent('undefined');
    });

    it('clears the previous error as soon as the user edits a field', async () => {
      const { user, api } = setup();
      api.updateItem.mockRejectedValue(
        new ApiError(500, 'internal_error', 'Internal server error.'),
      );
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.clear(screen.getByLabelText('Title'));
      await user.type(screen.getByLabelText('Title'), 'Dune');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Title'), '!');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
