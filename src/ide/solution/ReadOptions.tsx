/**
 * How one parameter row of the format editor is read (FormatForm.tsx): the mode, its counts,
 * and the options of the DSL extensions — values over several lines (flow) and lines as they
 * are (raw). Also the header row of a block.
 */
import { isArrayType, isGridType, type ParamType } from '@/solution/dsl';
import { isMultiMode, type BlockInfo, type ParamRow, type RowMode } from '@/solution/table';

const MODE_LABELS: Record<RowMode, string> = {
  new: '새 줄에서',
  same: '같은 줄에서',
  repeat: '여러 줄에서',
  until: '끝내는 줄까지',
  eof: '입력 끝까지',
};

/** Shown as the tooltip of end line fields. */
export const END_HINT =
  '이 줄이 나오면 읽기를 멈춰요. 예: 0, -1 -1, <0 (음수로 시작), <=0 (0 이하로 시작), #* (#으로 시작)';

/** What a mode means for a type, shown as the select's tooltip. */
function modeHint(mode: RowMode, type: ParamType): string {
  if (mode === 'new') return '새 줄을 시작해 읽어요';
  if (mode === 'same') return '앞 매개변수와 같은 줄에서 이어 읽어요';
  const each = isGridType(type)
    ? '한 줄에 한 행씩'
    : type === 'line[]'
      ? '한 줄씩 통째로 (공백 포함)'
      : '한 줄에 하나씩';
  if (mode === 'until')
    return `끝내는 줄이 나올 때까지 ${each} 읽어요. 끝내는 줄은 값에 넣지 않아요`;
  if (mode === 'eof') return `입력이 끝날 때까지 ${each} 읽어요`;
  return `정한 줄 수만큼 ${each} 읽어요`;
}

export function ReadOptions(props: {
  row: ParamRow;
  index: number;
  modes: RowMode[];
  onChange: (patch: Partial<ParamRow>) => void;
}) {
  const { row, index, modes, onChange } = props;
  const n = index + 1;
  const grid = isGridType(row.type);
  const counted = isArrayType(row.type) && !isMultiMode(row.mode);
  return (
    <div class="format-read">
      <select
        class="format-mode"
        aria-label={`${n}번째 매개변수 읽는 방법`}
        title={modeHint(row.mode, row.type)}
        value={row.mode}
        disabled={modes.length < 2}
        onChange={(e) => onChange({ mode: e.currentTarget.value as RowMode })}
      >
        {modes.map((m) => (
          <option key={m} value={m}>
            {MODE_LABELS[m]}
          </option>
        ))}
      </select>
      {counted && (
        <CountInput
          label={`${n}번째 매개변수 개수`}
          prefix="개수"
          placeholder="줄 끝까지"
          value={row.count}
          onChange={(count) => onChange({ count })}
        />
      )}
      {counted && row.count.trim() !== '' && (
        <Check
          label="여러 줄에 걸침"
          title="값이 여러 줄에 나뉘어 있어도 개수만큼 읽어요 (예: 한 줄에 10개씩)"
          checked={row.flow === true}
          onChange={(flow) => onChange({ flow })}
        />
      )}
      {row.mode === 'repeat' && (
        <CountInput
          label={`${n}번째 매개변수 줄 수`}
          prefix={grid ? '행' : '줄 수'}
          placeholder="예: n"
          value={row.count}
          onChange={(count) => onChange({ count })}
        />
      )}
      {row.mode === 'until' && (
        <CountInput
          label={`${n}번째 매개변수를 끝내는 줄`}
          prefix="끝"
          placeholder="예: 0"
          title={END_HINT}
          value={row.count}
          onChange={(count) => onChange({ count })}
        />
      )}
      {grid && (
        <CountInput
          label={`${n}번째 매개변수 열 수`}
          prefix="열"
          placeholder="줄 전체"
          value={row.cols}
          onChange={(cols) => onChange({ cols })}
        />
      )}
      {(row.type === 'line' || row.type === 'line[]') && (
        <Check
          label="빈 줄·공백 그대로"
          title="빈 줄도 값으로 읽고, 줄 앞뒤의 공백을 지우지 않아요"
          checked={row.raw === true}
          onChange={(raw) => onChange({ raw })}
        />
      )}
    </div>
  );
}

const BLOCK_TEXT: Record<BlockInfo['mode'], string> = {
  repeat: '번 반복해 읽어요',
  until: '줄까지 반복해 읽어요',
  eof: '입력이 끝날 때까지 반복해 읽어요',
};

/**
 * The header of a block: the rows under it are read together, again and again; each becomes
 * an array in solution (one value per block). Only the count or end line is edited here.
 */
export function BlockHeader(props: { block: BlockInfo; onCount: (count: string) => void }) {
  const { block, onCount } = props;
  return (
    <div class="format-read">
      <span class="format-field">블록</span>
      {block.mode !== 'eof' && (
        <CountInput
          label={block.mode === 'repeat' ? '블록 반복 횟수' : '블록을 끝내는 줄'}
          prefix={block.mode === 'repeat' ? '횟수' : '끝'}
          placeholder={block.mode === 'repeat' ? '예: n' : '예: 0'}
          {...(block.mode === 'until' ? { title: END_HINT } : {})}
          value={block.count}
          onChange={onCount}
        />
      )}
      <span class="format-where">
        {BLOCK_TEXT[block.mode]}. 아래 매개변수는 블록마다 값이 하나씩 모여 배열이 돼요. 블록에 넣고
        빼는 것은 아직 표에서 할 수 없어요.
      </span>
    </div>
  );
}

function Check(props: {
  label: string;
  title: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label class="format-check" title={props.title}>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      {props.label}
    </label>
  );
}

export function CountInput(props: {
  label: string;
  prefix: string;
  placeholder: string;
  title?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span class="format-field">
      <span class="format-field-label" aria-hidden="true">
        {props.prefix}
      </span>
      <input
        type="text"
        class="format-count"
        aria-label={props.label}
        placeholder={props.placeholder}
        title={props.title ?? '숫자나 앞에서 읽은 정수로 된 식 (n, n-1, 2*n-1, n*m, 2*(n+m))'}
        spellcheck={false}
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
      />
    </span>
  );
}
