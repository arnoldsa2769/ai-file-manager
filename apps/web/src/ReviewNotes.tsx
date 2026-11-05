import { useState } from 'react';
import { Field, PageControls, short, timestamp, useConsole } from './components.js';
import { usePage } from './pages.js';

export function ReviewNotes({ changeId }: { changeId: string }) {
  const { client, wid, data, generation, run, busy } = useConsole();
  const reviews = usePage(client, wid, 'reviews', { changeSetId: changeId }, generation);
  const [note, setNote] = useState('');
  return (
    <section className="reviews" aria-label="Review notes">
      <h2>Review notes</h2>
      <p className="muted">Newest first. Agent reviews are advisory; notes load in pages.</p>
      {reviews.items.map((review) => (
        <article key={review.id}>
          <div>
            <strong>
              {review.authorId === 'operator'
                ? 'Operator'
                : (data.agents.find((agent) => agent.id === review.authorId)?.name ??
                  short(review.authorId))}
            </strong>
            <small>{timestamp(review.createdAt)}</small>
          </div>
          <p>{review.body}</p>
        </article>
      ))}
      <PageControls state={reviews} label="review notes" />
      {!reviews.loading && !reviews.error && !reviews.items.length && (
        <p className="muted">No review notes yet. Add a note to share your findings.</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await client.review(wid, changeId, note);
            setNote('');
          }, 'Review note added.');
        }}
      >
        <Field label="Review note">
          <textarea
            value={note}
            required
            maxLength={4000}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
          />
        </Field>
        <button className="secondary" disabled={busy || !note.trim()}>
          Add review note
        </button>
      </form>
    </section>
  );
}
