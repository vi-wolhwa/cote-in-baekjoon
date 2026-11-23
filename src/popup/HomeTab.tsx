import { useState } from 'preact/hooks';
import { CheckIcon, ClockIcon, CodeIcon, CrossIcon, DotsIcon } from './icons';
import {
  parseProblemInput,
  relativeTime,
  type RecentProblem,
  type Stats,
  type StatusKind,
} from './model';

export interface HomeProps {
  /** The Baekjoon problem open in the active tab. */
  active?: { id: number; title?: string };
  stats: Stats;
  recent: RecentProblem[];
  now: number;
  /** Error shown under the hero button, e.g. when the page needs a reload. */
  openError?: string;
  onOpenIde: () => void;
  onOpenProblem: (id: number) => void;
}

export function HomeTab(props: HomeProps) {
  const { active, stats, recent, now } = props;
  return (
    <>
      {active ? (
        <section class="hero" aria-label="지금 보는 문제">
          <p class="hero-label">지금 보는 문제</p>
          <p class="hero-id">{active.id}번</p>
          {active.title && <p class="hero-title">{active.title}</p>}
          <button type="button" class="hero-button" onClick={props.onOpenIde}>
            코테 화면으로 풀기 →
          </button>
          {props.openError && (
            <p class="hero-error" role="alert">
              {props.openError}
            </p>
          )}
        </section>
      ) : (
        <SearchCard onOpen={props.onOpenProblem} />
      )}

      <section class="stats" aria-label="기록">
        <StatTile label="제출한 문제" value={stats.submitted} />
        <StatTile label="맞은 문제" value={stats.accepted} />
        <StatTile label="최근 7일" value={stats.lastWeek} />
      </section>

      <section class="card recent" aria-labelledby="recent-title">
        <h2 id="recent-title" class="card-title">
          최근 푼 문제
        </h2>
        {recent.length === 0 ? (
          <p class="empty">아직 푼 문제가 없어요. 백준 문제를 열어 시작해 보세요.</p>
        ) : (
          <ul class="recent-list">
            {recent.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  class="recent-row"
                  data-testid="recent"
                  onClick={() => props.onOpenProblem(p.id)}
                >
                  <StatusCircle kind={p.status} label={p.resultText} />
                  <span class="recent-main">
                    <span class="recent-name">
                      {p.title ? `${p.id} · ${p.title}` : `${p.id}번`}
                    </span>
                    <span class="recent-time">{relativeTime(p.at, now)}</span>
                  </span>
                  {p.language && <span class="badge">{p.language}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SearchCard({ onOpen }: { onOpen: (id: number) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const submit = (e: Event) => {
    e.preventDefault();
    const parsed = parseProblemInput(value);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError(undefined);
    onOpen(parsed.id);
  };
  return (
    <form class="card search" onSubmit={submit} noValidate>
      <label class="card-title" for="problem-number">
        문제 번호
      </label>
      <div class="search-row">
        <input
          id="problem-number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="예: 1000"
          value={value}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'problem-number-error' : undefined}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
        <button type="submit" class="btn-primary">
          열기
        </button>
      </div>
      {error && (
        <p id="problem-number-error" class="field-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div class="stat" data-testid="stat">
      <span class="stat-value">{value}</span>
      <span class="stat-label">{label}</span>
    </div>
  );
}

const STATUS_LABEL: Record<StatusKind, string> = {
  accepted: '맞았습니다',
  wrong: '틀렸습니다',
  other: '틀림',
  judging: '채점 중',
  opened: '아직 제출하지 않음',
};

function StatusCircle({ kind, label }: { kind: StatusKind; label?: string }) {
  const Icon =
    kind === 'accepted'
      ? CheckIcon
      : kind === 'wrong'
        ? CrossIcon
        : kind === 'other'
          ? ClockIcon
          : kind === 'judging'
            ? DotsIcon
            : CodeIcon;
  return (
    <span class={`status status-${kind}`} role="img" aria-label={label ?? STATUS_LABEL[kind]}>
      <Icon size={16} />
    </span>
  );
}
