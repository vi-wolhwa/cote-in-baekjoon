/**
 * Help text rendered as elements with the search words marked. inlineParts() splits the
 * inline marks and highlight() the matches; every piece is a text node, never parsed as HTML.
 */
import { inlineParts } from '@/shared/help-content';
import { highlight } from '@/shared/help-search';

/** Plain text with the query words wrapped in <mark>. */
export function Marked({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {highlight(text, terms).map((segment, i) =>
        segment.mark ? <mark key={i}>{segment.text}</mark> : segment.text,
      )}
    </>
  );
}

/** Help text with `code`, **bold** and links as elements, and the query words marked. */
export function Inline({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {inlineParts(text).map((part, i) =>
        part.kind === 'code' ? (
          <code key={i}>
            <Marked text={part.text} terms={terms} />
          </code>
        ) : part.kind === 'strong' ? (
          <strong key={i}>
            <Marked text={part.text} terms={terms} />
          </strong>
        ) : part.kind === 'link' ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            <Marked text={part.text} terms={terms} />
          </a>
        ) : (
          <Marked key={i} text={part.text} terms={terms} />
        ),
      )}
    </>
  );
}
