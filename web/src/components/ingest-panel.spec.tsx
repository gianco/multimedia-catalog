import { describe, expect, it } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../api/catalog-api.model';
import { buildItem, createApiMock, deferred } from '../testing/fake-catalog-api';
import type { Item } from '../api/catalog-api.model';
import { IngestPanel } from './ingest-panel';

const setup = (api = createApiMock(), onCreated?: (item: Item) => void) => {
  const user = userEvent.setup();
  render(<IngestPanel api={api} {...(onCreated && { onCreated })} />);
  return { user, api };
};

const selectKind = (user: ReturnType<typeof userEvent.setup>, label: string) =>
  user.selectOptions(screen.getByLabelText('Type'), label);

describe('IngestPanel', () => {
  describe('fields adapt to the selected type', () => {
    it('starts with the manual entry of a book', () => {
      setup();

      expect(screen.getByLabelText('Type')).toHaveValue('book');
      expect(screen.getByLabelText('ISBN')).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toBeInTheDocument();
      expect(screen.getByLabelText('Author')).toBeInTheDocument();
      expect(screen.getByLabelText('Publication year')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
    });

    it.each([
      ['Vinyl', 'Barcode', 'Artist'],
      ['CD', 'Barcode', 'Artist'],
      ['Video file', 'Absolute path', 'Director'],
      ['Audio file', 'Absolute path', 'Artist'],
    ])(
      'relabels the fields when the type becomes %s',
      async (kind, identifierLabel, creatorLabel) => {
        const { user } = setup();

        await selectKind(user, kind);

        expect(screen.getByLabelText(identifierLabel)).toBeInTheDocument();
        expect(screen.getByLabelText(creatorLabel)).toBeInTheDocument();
        expect(screen.queryByLabelText('ISBN')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Author')).not.toBeInTheDocument();
      },
    );

    it('shows an ISBN field only for books', async () => {
      const { user } = setup();
      expect(screen.getByLabelText('ISBN')).toBeInTheDocument();

      await selectKind(user, 'Vinyl');
      expect(screen.queryByLabelText('ISBN')).not.toBeInTheDocument();

      await selectKind(user, 'Book');
      expect(screen.getByLabelText('ISBN')).toBeInTheDocument();
    });

    it('uses a path placeholder for local files and a barcode one for CDs', async () => {
      const { user } = setup();

      await selectKind(user, 'Audio file');
      expect(screen.getByLabelText('Absolute path')).toHaveAttribute(
        'placeholder',
        expect.stringMatching(/^\//),
      );

      await selectKind(user, 'CD');
      expect(screen.getByLabelText('Barcode')).toHaveAttribute('placeholder', '4006381333931');
    });

    it('clears the identifier when the type changes', async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText('ISBN'), '9780306406157');

      await selectKind(user, 'Vinyl');

      expect(screen.getByLabelText('Barcode')).toHaveValue('');
    });

    it('offers a different AI mode label for each family of types', async () => {
      const { user } = setup();
      expect(screen.getByLabelText('Enrich from ISBN')).toBeInTheDocument();

      await selectKind(user, 'CD');
      expect(screen.getByLabelText('Enrich from barcode')).toBeInTheDocument();

      await selectKind(user, 'Video file');
      expect(screen.getByLabelText('Scan file and enrich')).toBeInTheDocument();
    });

    it('lists every supported type in the selector', () => {
      setup();

      const options = screen.getAllByRole('option').map((option) => option.textContent);
      expect(options).toEqual(['Book', 'Vinyl', 'CD', 'Video file', 'Audio file']);
    });
  });

  describe('AI mode', () => {
    it('hides the manual fields and keeps only the identifier', async () => {
      const { user } = setup();

      await user.click(screen.getByLabelText('Enrich from ISBN'));

      expect(screen.getByLabelText('ISBN')).toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Author')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Publication year')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Enrich and add' })).toBeInTheDocument();
    });

    it('keeps the AI mode while the type changes and shows the matching field', async () => {
      const { user } = setup();
      await user.click(screen.getByLabelText('Enrich from ISBN'));

      await selectKind(user, 'Audio file');

      expect(screen.getByLabelText('Scan file and enrich')).toBeChecked();
      expect(screen.getByLabelText('Absolute path')).toBeInTheDocument();
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    });

    it('brings the manual fields back when returning to manual entry', async () => {
      const { user } = setup();
      await user.click(screen.getByLabelText('Enrich from ISBN'));

      await user.click(screen.getByLabelText('Manual entry'));

      expect(screen.getByLabelText('Title')).toBeInTheDocument();
    });
  });

  describe('submitting', () => {
    it('sends a manual request with only the filled optional fields', async () => {
      const { user, api } = setup();
      await user.type(screen.getByLabelText('ISBN'), '9780306406157');
      await user.type(screen.getByLabelText('Title'), '  Dune ');
      await user.type(screen.getByLabelText('Publication year'), '1965');

      await user.click(screen.getByRole('button', { name: 'Add item' }));

      await waitFor(() => expect(api.createItem).toHaveBeenCalledTimes(1));
      expect(api.createItem).toHaveBeenCalledWith({
        mode: 'manual',
        kind: 'book',
        identifier: '9780306406157',
        title: 'Dune',
        publicationYear: 1965,
      });
    });

    it('sends an enrich request for a CD built from its barcode', async () => {
      const { user, api } = setup();
      await selectKind(user, 'CD');
      await user.click(screen.getByLabelText('Enrich from barcode'));
      await user.type(screen.getByLabelText('Barcode'), '4006381333931');

      await user.click(screen.getByRole('button', { name: 'Enrich and add' }));

      await waitFor(() =>
        expect(api.createItem).toHaveBeenCalledWith({
          mode: 'enrich',
          kind: 'cd',
          identifier: '4006381333931',
        }),
      );
    });

    it('sends a scan request for a video file built from its absolute path', async () => {
      const { user, api } = setup();
      await selectKind(user, 'Video file');
      await user.click(screen.getByLabelText('Scan file and enrich'));
      await user.type(screen.getByLabelText('Absolute path'), '/home/user/matrix.mkv');

      await user.click(screen.getByRole('button', { name: 'Enrich and add' }));

      await waitFor(() =>
        expect(api.createItem).toHaveBeenCalledWith({
          mode: 'scan',
          kind: 'video-file',
          absolutePath: '/home/user/matrix.mkv',
        }),
      );
    });

    it('confirms the creation, resets the values and notifies the parent', async () => {
      const created: Item[] = [];
      const { user } = setup(createApiMock(), (item) => created.push(item));
      await user.type(screen.getByLabelText('ISBN'), '9780306406157');
      await user.type(screen.getByLabelText('Title'), 'Dune');

      await user.click(screen.getByRole('button', { name: 'Add item' }));

      expect(await screen.findByText(/“Dune” was added to the catalog/)).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toHaveValue('');
      expect(screen.getByLabelText('ISBN')).toHaveValue('');
      expect(created).toHaveLength(1);
    });

    it('shows a spinner and locks the form while the AI is processing', async () => {
      const pending = deferred<Item>();
      const api = createApiMock();
      api.createItem.mockReturnValue(pending.promise);
      const { user } = setup(api);
      await user.click(screen.getByLabelText('Enrich from ISBN'));
      await user.type(screen.getByLabelText('ISBN'), '9780306406157');

      await user.click(screen.getByRole('button', { name: 'Enrich and add' }));

      expect(await screen.findByRole('status')).toHaveTextContent(/Asking the AI to enrich/);
      expect(screen.getByRole('button', { name: 'Enrich and add' })).toBeDisabled();
      expect(screen.getByLabelText('ISBN')).toBeDisabled();
      expect(screen.getByLabelText('Type')).toBeDisabled();

      pending.resolve(buildItem());

      await waitFor(() => expect(screen.queryByText(/Asking the AI/)).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Enrich and add' })).toBeEnabled();
    });

    it('does not send twice when the button is clicked again while loading', async () => {
      const pending = deferred<Item>();
      const api = createApiMock();
      api.createItem.mockReturnValue(pending.promise);
      const { user } = setup(api);
      await user.type(screen.getByLabelText('ISBN'), '9780306406157');
      await user.type(screen.getByLabelText('Title'), 'Dune');

      await user.click(screen.getByRole('button', { name: 'Add item' }));
      await user.click(screen.getByRole('button', { name: 'Add item' }));

      expect(api.createItem).toHaveBeenCalledTimes(1);

      pending.resolve(buildItem());
      // Let the submission finish inside the test, so no state update happens after it ends.
      expect(await screen.findByText(/was added to the catalog/)).toBeInTheDocument();
    });
  });

  describe('validation and errors', () => {
    it('blocks an empty submission and shows the missing fields without calling the API', async () => {
      const { user, api } = setup();

      await user.click(screen.getByRole('button', { name: 'Add item' }));

      expect(screen.getByText('This field is required.')).toBeInTheDocument();
      expect(screen.getByText('The title is required.')).toBeInTheDocument();
      expect(screen.getByLabelText('ISBN')).toHaveAttribute('aria-invalid', 'true');
      expect(api.createItem).not.toHaveBeenCalled();
    });

    it('rejects an invalid year before calling the API', async () => {
      const { user, api } = setup();
      await user.type(screen.getByLabelText('ISBN'), '9780306406157');
      await user.type(screen.getByLabelText('Title'), 'Dune');
      await user.type(screen.getByLabelText('Publication year'), '19x5');

      await user.click(screen.getByRole('button', { name: 'Add item' }));

      expect(screen.getByText(/Enter a year between/)).toBeInTheDocument();
      expect(api.createItem).not.toHaveBeenCalled();
    });

    it('only requires the identifier in AI mode', async () => {
      const { user, api } = setup();
      await user.click(screen.getByLabelText('Enrich from ISBN'));

      await user.click(screen.getByRole('button', { name: 'Enrich and add' }));

      expect(screen.getByText('This field is required.')).toBeInTheDocument();
      expect(screen.queryByText('The title is required.')).not.toBeInTheDocument();
      expect(api.createItem).not.toHaveBeenCalled();
    });

    it('shows the error returned by the backend and keeps what the user typed', async () => {
      const api = createApiMock();
      api.createItem.mockRejectedValue(
        new ApiError(502, 'ai_enrichment_failed', 'The AI answer is not valid JSON.'),
      );
      const { user } = setup(api);
      await user.click(screen.getByLabelText('Enrich from ISBN'));
      await user.type(screen.getByLabelText('ISBN'), '9780306406157');

      await user.click(screen.getByRole('button', { name: 'Enrich and add' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The AI answer is not valid JSON.',
      );
      expect(screen.getByLabelText('ISBN')).toHaveValue('9780306406157');
      expect(screen.getByRole('button', { name: 'Enrich and add' })).toBeEnabled();
    });

    it('hides unexpected error details behind a generic message', async () => {
      const api = createApiMock();
      api.createItem.mockRejectedValue(new TypeError('Cannot read properties of undefined'));
      const { user } = setup(api);
      await user.type(screen.getByLabelText('ISBN'), '9780306406157');
      await user.type(screen.getByLabelText('Title'), 'Dune');

      await user.click(screen.getByRole('button', { name: 'Add item' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Something went wrong. Please try again.');
      expect(alert).not.toHaveTextContent('undefined');
    });

    it('clears the previous error as soon as the user edits a field', async () => {
      const api = createApiMock();
      api.createItem.mockRejectedValue(new ApiError(422, 'domain_violation', 'Invalid ISBN.'));
      const { user } = setup(api);
      await user.type(screen.getByLabelText('ISBN'), '123');
      await user.type(screen.getByLabelText('Title'), 'Dune');
      await user.click(screen.getByRole('button', { name: 'Add item' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();

      await user.type(screen.getByLabelText('ISBN'), '4');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
