import { describe, expect, it } from 'vitest';
import {
  briefLocal,
  classifyLocal,
  deriveTitle,
  greetingFor,
  prioritiseLocal,
  rankLocal,
  reasonFor,
  reflectLocal,
  REASONS,
  scoreItem,
} from '@/lib/local-mode';
import { makeItem } from '../fixtures/items';

const NOW = new Date('2026-08-10T09:00:00.000Z');
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe('classifyLocal', () => {
  it.each([
    ['Listen to this album by Khruangbin', 'music', 'Music'],
    ['A poem I want to finish, second stanza is wrong', 'poetry', 'Poetry'],
    ['Read this paper on transformer attention', 'learning', 'AI Learning'],
    ['Idea: build a tool that files links for you', 'idea', 'Product Ideas'],
    ['Call the plumber tomorrow', 'task', 'Personal'],
    ['Nothing much here', 'note', 'Personal'],
  ])('classifies %j as %s in %s', (raw, type, group) => {
    const result = classifyLocal(raw);
    expect(result.type).toBe(type);
    expect(result.group).toBe(group);
  });

  it('routes fitness keywords to the Fitness group regardless of type', () => {
    expect(classifyLocal('Squat 3x5 then mobility work').group).toBe('Fitness');
  });

  it('puts tasks straight into todo and everything else into inbox', () => {
    expect(classifyLocal('Remind me to pay rent').state).toBe('todo');
    expect(classifyLocal('A stray thought').state).toBe('inbox');
  });

  it('caps the title at ten words and the summary at eighteen', () => {
    const raw = `${Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')}`;
    const result = classifyLocal(raw);
    expect(result.title.split(' ')).toHaveLength(10);
    expect(result.summary.split(' ').length).toBeLessThanOrEqual(18);
  });

  it('uses platform as a signal when there is no prose', () => {
    const result = classifyLocal('https://open.spotify.com/track/abc123');
    expect(result.type).toBe('music');
    expect(result.tags).toContain('spotify');
  });

  it('never invents a summary it could not read', () => {
    expect(classifyLocal('https://example.com/thing').summary).toBe('');
  });
});

describe('deriveTitle', () => {
  it('takes the first non-URL line', () => {
    expect(deriveTitle('https://example.com/a\nThe actual thought', 'web')).toBe(
      'The actual thought',
    );
  });

  it('builds a readable title from a bare URL slug', () => {
    expect(deriveTitle('https://example.com/how-to-rest-well', 'web')).toBe('How To Rest Well');
  });

  it('falls back to the platform name when the slug is useless', () => {
    expect(deriveTitle('https://instagram.com/p/12345', 'instagram')).toBe('Saved from Instagram');
  });
});

describe('scoreItem', () => {
  it('scores the documented bases', () => {
    expect(scoreItem(makeItem({ state: 'doing', touched_at: NOW.toISOString() }), NOW)).toBe(55);
    expect(scoreItem(makeItem({ state: 'todo' }), NOW)).toBe(32);
    expect(scoreItem(makeItem({ state: 'inbox', created_at: NOW.toISOString() }), NOW)).toBe(15);
  });

  it.each([
    [1, 30],
    [2, 18],
    [3, 8],
  ] as const)('adds %d priority as +%d', (priority, bonus) => {
    expect(scoreItem(makeItem({ state: 'todo', priority }), NOW)).toBe(32 + bonus);
  });

  it.each([
    [0.5, 30],
    [2, 20],
    [5, 10],
    [30, 0],
  ])('adds a due-date bonus of %d days => +%d', (days, bonus) => {
    expect(scoreItem(makeItem({ state: 'todo', due_at: daysFromNow(days) }), NOW)).toBe(32 + bonus);
  });

  it('adds idle pressure to doing items, capped at 12', () => {
    expect(scoreItem(makeItem({ state: 'doing', touched_at: daysAgo(3) }), NOW)).toBe(55 + 6);
    expect(scoreItem(makeItem({ state: 'doing', touched_at: daysAgo(40) }), NOW)).toBe(55 + 12);
  });

  it('penalises stale inbox items by 5', () => {
    expect(scoreItem(makeItem({ state: 'inbox', created_at: daysAgo(9) }), NOW)).toBe(10);
  });

  it('gives someday and done nothing to stand on', () => {
    expect(scoreItem(makeItem({ state: 'someday' }), NOW)).toBe(0);
  });
});

describe('reasonFor', () => {
  it('prefers in-motion over everything', () => {
    const item = makeItem({ state: 'doing', priority: 1, due_at: daysFromNow(0.5) });
    expect(reasonFor(item, NOW)).toBe(REASONS.inMotion);
  });

  it('names the due date before the priority', () => {
    expect(reasonFor(makeItem({ state: 'todo', priority: 1, due_at: daysFromNow(2) }), NOW)).toBe(
      REASONS.dueSoon,
    );
  });

  it('names P1 when nothing is due', () => {
    expect(reasonFor(makeItem({ state: 'todo', priority: 1 }), NOW)).toBe(REASONS.p1);
  });

  it('falls back to queue order', () => {
    expect(reasonFor(makeItem({ state: 'todo' }), NOW)).toBe(REASONS.queue);
  });
});

describe('rankLocal / prioritiseLocal', () => {
  it('excludes done items', () => {
    const ranked = rankLocal([makeItem({ state: 'done' }), makeItem({ state: 'todo' })], NOW);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.item.state).toBe('todo');
  });

  it('finishes before it starts: doing outranks a fresh P1 todo', () => {
    const doing = makeItem({ state: 'doing', title: 'Half-written essay' });
    const todo = makeItem({ state: 'todo', priority: 1, title: 'Shiny new thing' });
    const result = prioritiseLocal([todo, doing], NOW);
    expect(result.itemId).toBe(doing.id);
    expect(result.why).toBe(REASONS.inMotion);
  });

  it('offers at most two alternatives', () => {
    const items = Array.from({ length: 6 }, () => makeItem({ state: 'todo' }));
    expect(prioritiseLocal(items, NOW).alsoConsider).toHaveLength(2);
  });

  it('says so plainly when there is nothing to do', () => {
    const result = prioritiseLocal([makeItem({ state: 'done' })], NOW);
    expect(result.itemId).toBeNull();
    expect(result.why).toMatch(/Rare air/);
  });
});

describe('templates', () => {
  it.each([
    [3, 'Still up.'],
    [8, 'Morning.'],
    [14, 'Afternoon.'],
    [20, 'Evening.'],
    [23, 'Late one.'],
  ])('greets hour %d with %s', (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected);
  });

  it('names a first win and never uses emoji', () => {
    const brief = briefLocal({
      hour: 8,
      firstWin: { id: 'a', title: 'Ship the migration' },
      dueToday: 2,
      inMotion: 1,
      workoutToday: 'Push',
      workoutWhy: 'I want to still be lifting at sixty',
    });
    expect(brief.greeting).toBe('Morning.');
    expect(brief.body).toContain('Ship the migration');
    expect(brief.body).toContain('2 due today');
    expect(brief.body).toContain('I want to still be lifting at sixty');
    expect(brief.body).not.toMatch(/\p{Extended_Pictographic}/u);
    expect((brief.body.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it('treats rest days as training', () => {
    const brief = briefLocal({
      hour: 7,
      firstWin: null,
      dueToday: 0,
      inMotion: 0,
      workoutToday: 'Rest',
      workoutWhy: '',
    });
    expect(brief.body).toContain('Recovery is training too');
  });

  it('reflects without flattery', () => {
    const text = reflectLocal({
      done: 4,
      captured: 11,
      inMotion: 2,
      inboxOverdue: 3,
      topGroup: 'Travel',
    });
    expect(text).toContain('You finished 4 things this week.');
    expect(text).toContain('Travel');
    expect(text).toContain('3 items have been in the inbox over a week');
    expect(text).not.toMatch(/amazing|great job|proud|crushing/i);
  });
});

describe('briefLocal punctuation', () => {
  const base = {
    hour: 8,
    firstWin: null,
    dueToday: 0,
    inMotion: 0,
    workoutToday: 'Legs',
  };

  it('does not double the full stop when the reason ends in one', () => {
    const { body } = briefLocal({ ...base, workoutWhy: 'Because I said I would.' });
    expect(body).toContain('You said: Because I said I would. That does not change');
    expect(body).not.toContain('..');
  });

  it('reads the same when the reason has no punctuation', () => {
    const { body } = briefLocal({ ...base, workoutWhy: 'Because I said I would' });
    expect(body).toContain('You said: Because I said I would. That does not change');
  });

  it('says nothing about a reason that was never written', () => {
    const { body } = briefLocal({ ...base, workoutWhy: '   ' });
    expect(body).toContain('Legs today.');
    expect(body).not.toContain('You said');
  });

  it('never uses an emoji and at most one exclamation', () => {
    const { body, greeting } = briefLocal({ ...base, workoutWhy: 'Because I said I would!' });
    const text = `${greeting} ${body}`;
    expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
    expect((text.match(/!/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});

describe('deriveTitle with an inline link', () => {
  it('strips a link that shares a line with the note', () => {
    expect(
      deriveTitle('Read the attention paper properly https://arxiv.org/abs/1706.03762', 'web'),
    ).toBe('Read the attention paper properly');
  });

  it('strips a link that leads the line', () => {
    expect(deriveTitle('https://example.com/a worth a second look', 'web')).toBe(
      'worth a second look',
    );
  });

  it('still builds a title from the slug when the drop is only a link', () => {
    expect(deriveTitle('https://example.com/how-to-rest-well', 'web')).toBe('How To Rest Well');
  });

  it('keeps the summary free of links too', () => {
    const result = classifyLocal(
      'Read the attention paper https://arxiv.org/abs/1706.03762\nthe one everyone cites',
    );
    expect(result.title).not.toContain('http');
    expect(result.summary).not.toContain('http');
    expect(result.summary).toContain('everyone cites');
  });

  it('never returns an empty title for a link-only drop with no slug', () => {
    expect(deriveTitle('https://instagram.com/p/12345', 'instagram')).toBe('Saved from Instagram');
  });
});
