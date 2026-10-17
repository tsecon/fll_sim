import type { VisualBlock } from '../runtime/spike-scratch-importer';

/**
 * Editable numeric values inside Word Blocks.
 *
 * Python code is not regenerated from blocks (tabs may contain extra lines such as
 * print() calls), so each spec reproduces the exact statement the importer / palette
 * emitted for a block. Editing a value rewrites only that statement in the code.
 */
type Params = Record<string, string>;
type Mark = (param: string) => string;

interface BlockValueSpec {
  /** Params the user may edit (must hold a plain number) */
  values: string[];
  /** Params that must be whole numbers */
  integers?: string[];
  /** Label text; editable values are wrapped with mark() */
  label: (p: Params, mark: Mark) => string;
  /** First Python line the block produces, without indentation */
  python: (p: Params) => string;
}

const num = (v: string) => parseFloat(v) || 0;
const lower = (port: string | undefined) => (port || 'a').toLowerCase();

const SPECS: Record<string, BlockValueSpec> = {};

function define(opcodes: string[], spec: BlockValueSpec): void {
  for (const op of opcodes) SPECS[op] = spec;
}

// --- Imported SPIKE App blocks (mirrors SpikeScratchImporter.processBlock) ---
define(['flippermove_movementSpeed', 'spike_movementSpeed'], {
  values: ['speed'],
  label: (_p, m) => `Set movement speed to [${m('speed')}%]`,
  python: (p) => `motors.set_default_speed(${p.speed})`,
});
define(['flippermove_move', 'spike_move'], {
  values: ['value'],
  label: (p, m) => `Move [${p.direction}] for [${m('value')}] [${p.unit}]`,
  python: (p) => {
    const v = num(p.value);
    const finalVal = p.direction === 'back' ? -Math.abs(v) : Math.abs(v);
    return `motors.move(${finalVal}, '${p.unit}')`;
  },
});
define(['flippermove_startSteer', 'spike_startSteer'], {
  values: ['steering', 'speed'],
  label: (_p, m) => `Start steering [${m('steering')}] at [${m('speed')}%]`,
  python: (p) => `motors.start(${p.steering}, ${p.speed})`,
});
define(['flippermoremove_startDualSpeed', 'spike_startDualSpeed'], {
  values: ['left', 'right'],
  label: (_p, m) => `Start moving tank Left: [${m('left')}%], Right: [${m('right')}%]`,
  python: (p) => `motors.start_tank(${p.left}, ${p.right})`,
});
define(['flippermoremove_moveDualSpeed', 'spike_moveDualSpeed'], {
  values: ['value', 'left', 'right'],
  label: (p, m) => `Move tank for [${m('value')}] [${p.unit}] Left: [${m('left')}%], Right: [${m('right')}%]`,
  python: (p) => `motors.move_tank(${p.value}, '${p.unit}', ${p.left}, ${p.right})`,
});
define(['flippermotor_motorTurnForDirection', 'spike_motorTurnForDirection'], {
  values: ['value'],
  label: (p, m) => `Turn Motor [Port ${p.port}] [${p.direction}] for [${m('value')}] [${p.unit}]`,
  python: (p) => {
    const v = num(p.value);
    const sign = p.direction === 'counterclockwise' ? -1 : 1;
    const motor = `motor_${lower(p.port)}`;
    if (p.unit === 'rotations') return `${motor}.run_for_degrees(${v * 360 * sign})`;
    if (p.unit === 'degrees') return `${motor}.run_for_degrees(${v * sign})`;
    return `${motor}.run_for_seconds(${v})`;
  },
});
define(['flippermotor_motorStartDirection', 'spike_motorStartDirection'], {
  values: ['speed'],
  label: (p, m) => `Start Motor [Port ${p.port}] [${p.direction}] at [${m('speed')}%]`,
  python: (p) => `motor_${lower(p.port)}.start(${p.direction === 'counterclockwise' ? '-' : ''}${p.speed})`,
});
define(['flippermotor_motorSetSpeed', 'spike_motorSetSpeed'], {
  values: ['speed'],
  label: (p, m) => `Set Motor [Port ${p.port}] speed to [${m('speed')}%]`,
  python: (p) => `motor_${lower(p.port)}.set_default_speed(${p.speed})`,
});
define(['control_wait'], {
  values: ['duration'],
  label: (_p, m) => `Wait [${m('duration')}] seconds`,
  python: (p) => `wait_for_seconds(${p.duration})`,
});
define(['control_repeat'], {
  values: ['times'],
  integers: ['times'],
  label: (_p, m) => `Repeat [${m('times')}] times`,
  python: (p) => `for _ in range(${p.times}):`,
});
define(['data_setvariableto'], {
  values: ['value'],
  label: (p, m) => `Set [${p.variable}] to [${m('value')}]`,
  python: (p) => `${p.variable} = ${p.value}`,
});
define(['data_changevariableby'], {
  values: ['value'],
  label: (p, m) => `Change [${p.variable}] by [${m('value')}]`,
  python: (p) => `${p.variable} += ${p.value}`,
});

// --- Palette blocks (mirrors SPIKE_PALETTE_ITEMS pythonSnippet) ---
for (const unit of ['rotations', 'degrees', 'seconds']) {
  define([`motor.run_for_${unit}`], {
    values: ['amount'],
    label: (p, m) => `[${p.port} ▾] run [↻ ▾] for (${m('amount')}) ${unit}`,
    python: (p) => `motor_${lower(p.port)}.run_for_${unit}(${p.amount}, '${p.dir}')`,
  });
}
define(['motor.set_default_speed'], {
  values: ['speed'],
  label: (p, m) => `set [${p.port} ▾] speed to (${m('speed')})%`,
  python: (p) => `motor_${lower(p.port)}.set_default_speed(${p.speed})`,
});
define(['motor_e.run_degrees'], {
  values: ['degrees'],
  label: (_p, m) => `[E ▾] (Left Aux Arm) run [↻ ▾] for (${m('degrees')}) deg`,
  python: (p) => `motor_e.run_for_degrees(${p.degrees}, 'clockwise')`,
});
define(['motor_f.run_degrees'], {
  values: ['degrees'],
  label: (_p, m) => `[F ▾] (Right Aux Arm) run [↻ ▾] for (${m('degrees')}) deg`,
  python: (p) => `motor_f.run_for_degrees(${p.degrees}, 'clockwise')`,
});
for (const op of ['motors.move_cm', 'motors.move_rotations', 'motors.move_seconds']) {
  define([op], {
    values: ['amount'],
    label: (p, m) => `move [⬆ ▾] for (${m('amount')}) ${p.unit}`,
    python: (p) => `motors.move(${p.amount}, '${p.unit}', 0)`,
  });
}
define(['motors.set_default_speed'], {
  values: ['speed'],
  label: (_p, m) => `set movement speed to (${m('speed')})%`,
  python: (p) => `motors.set_default_speed(${p.speed})`,
});
define(['control.wait'], {
  values: ['seconds'],
  label: (_p, m) => `wait (${m('seconds')}) seconds`,
  python: (p) => `time.sleep(${p.seconds})`,
});
define(['control.wait_until'], {
  values: ['dist'],
  label: (_p, m) => `wait until <distance < (${m('dist')}) cm>`,
  python: (p) => `while not (distance_sensor.get_distance_cm() < ${p.dist}):`,
});
define(['control.repeat'], {
  values: ['times'],
  integers: ['times'],
  label: (_p, m) => `repeat (${m('times')})`,
  python: (p) => `for _ in range(${p.times}):`,
});
define(['distance.is_less_than'], {
  values: ['dist'],
  label: (_p, m) => `distance < (${m('dist')}) cm ?`,
  python: (p) => `distance_sensor.get_distance_cm() < ${p.dist}`,
});
define(['operator.less_than'], {
  values: ['threshold'],
  label: (_p, m) => `( ) < (${m('threshold')})`,
  python: (p) => `< ${p.threshold}`,
});
define(['operator.random'], {
  values: ['min', 'max'],
  integers: ['min', 'max'],
  label: (_p, m) => `pick random (${m('min')}) to (${m('max')})`,
  python: (p) => `random.randint(${p.min}, ${p.max})`,
});

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

/** Params of this block whose value can be edited right now */
export function getEditableParams(block: VisualBlock): string[] {
  const spec = SPECS[block.opcode];
  if (!spec) return [];
  return spec.values.filter((k) => NUMBER_RE.test(String(block.params?.[k] ?? '').trim()));
}

/**
 * Label with editable values wrapped as `open + param + close`, or null when the
 * block has no editable values (callers then keep using block.label).
 */
export function buildEditableLabel(block: VisualBlock, open: string, close: string): string | null {
  const spec = SPECS[block.opcode];
  const editable = getEditableParams(block);
  if (!spec || editable.length === 0) return null;
  return spec.label(block.params, (k) => (editable.includes(k) ? `${open}${k}${close}` : block.params[k]));
}

/** Validates user input; returns the normalized Python literal or an error message */
export function normalizeValue(block: VisualBlock, param: string, raw: string): { value: string } | { error: string } {
  const text = raw.trim();
  if (!NUMBER_RE.test(text)) return { error: `"${raw}" is not a number` };
  const value = String(Number(text));
  if (SPECS[block.opcode]?.integers?.includes(param) && !Number.isInteger(Number(value))) {
    return { error: `${param} must be a whole number` };
  }
  return { value };
}

function flatten(blocks: VisualBlock[], out: VisualBlock[] = []): VisualBlock[] {
  for (const b of blocks) {
    out.push(b);
    if (b.children) flatten(b.children, out);
    if (b.elseChildren) flatten(b.elseChildren, out);
  }
  return out;
}

export interface BlockValueEditResult {
  ok: boolean;
  code: string;
  error?: string;
}

/**
 * Sets block.params[param] and rewrites the matching Python statement in `code`.
 * The n-th block (in program order) producing statement S maps to the n-th code
 * line equal to S. On failure the block is left unchanged.
 */
export function applyBlockValueEdit(
  blocks: VisualBlock[],
  code: string,
  blockId: string,
  param: string,
  raw: string
): BlockValueEditResult {
  const all = flatten(blocks);
  const block = all.find((b) => b.id === blockId);
  const spec = block ? SPECS[block.opcode] : undefined;
  if (!block || !spec || !getEditableParams(block).includes(param)) {
    return { ok: false, code, error: 'This value cannot be edited' };
  }

  const normalized = normalizeValue(block, param, raw);
  if ('error' in normalized) return { ok: false, code, error: normalized.error };
  if (normalized.value === block.params[param]) return { ok: true, code };

  const oldStmt = spec.python(block.params);
  const ordinal = all
    .slice(0, all.indexOf(block))
    .filter((b) => SPECS[b.opcode] && SPECS[b.opcode].python(b.params) === oldStmt).length;

  const lines = code.split('\n');
  let seen = 0;
  const lineIdx = lines.findIndex((line) => line.trim() === oldStmt && seen++ === ordinal);
  if (lineIdx === -1) {
    return { ok: false, code, error: `Could not find "${oldStmt}" in the Python code` };
  }

  const newParams = { ...block.params, [param]: normalized.value };
  const indent = lines[lineIdx].match(/^\s*/)?.[0] ?? '';
  lines[lineIdx] = indent + spec.python(newParams);

  block.params = newParams;
  block.label = spec.label(newParams, (k) => newParams[k]);
  return { ok: true, code: lines.join('\n') };
}
