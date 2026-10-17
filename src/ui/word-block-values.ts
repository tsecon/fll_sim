import type { VisualBlock } from '../runtime/spike-scratch-importer';

/**
 * Editing and deleting Word Blocks while keeping the tab's Python code in sync.
 *
 * Python code is not regenerated from blocks (tabs may contain extra lines such as
 * print() calls), so each spec reproduces the exact statement the importer / palette
 * emitted for a block. Edits rewrite only that statement; deletes remove only it.
 * Blocks are matched to code in program order (see locate), so the i-th block
 * producing statement S maps to its own occurrence of S.
 */
type Params = Record<string, string>;
type Mark = (param: string) => string;

export interface Choice {
  value: string;
  label: string;
}

interface BlockSpec {
  /** Params editable as plain numbers */
  values?: string[];
  /** Params that must be whole numbers */
  integers?: string[];
  /** Params editable from a fixed list */
  choices?: Record<string, Choice[]>;
  /** Params holding a motor port that needs a `motor_x = Motor('X')` declaration */
  motorPorts?: string[];
  /** Extra validation across params; returns an error message */
  validate?: (p: Params) => string | null;
  /** Label text; editable params are wrapped with mark() */
  label: (p: Params, mark: Mark) => string;
  /** Python the block produces, without base indentation (may span lines); null if unknown */
  python: (p: Params) => string | null;
}

const num = (v: string) => parseFloat(v) || 0;
const lower = (port: string | undefined) => (port || 'a').toLowerCase();
const same = (values: string[]): Choice[] => values.map((value) => ({ value, label: value }));

const PORTS = same(['A', 'B', 'C', 'D', 'E', 'F']);
const MOTOR_DIRS = same(['clockwise', 'counterclockwise']);
const MOTOR_DIRS_ICON: Choice[] = [
  { value: 'clockwise', label: '↻' },
  { value: 'counterclockwise', label: '↺' },
];
const MOVE_DIRS = same(['forward', 'back']);
const MOVE_UNITS = same(['cm', 'in', 'rotations', 'degrees', 'seconds']);
const MOTOR_UNITS = same(['rotations', 'degrees', 'seconds']);
/** Colors VirtualSensorManager can classify */
const COLORS = same(['black', 'blue', 'green', 'yellow', 'red', 'white']);
const PALETTE_MOVE_DIRS: Choice[] = [
  { value: 'straight', label: '⬆' },
  { value: 'back', label: '⬇' },
  { value: 'right', label: '↻' },
  { value: 'left', label: '↺' },
];
const MOTOR_PAIRS: Choice[] = same(
  PORTS.flatMap((l) => PORTS.filter((r) => r.value !== l.value).map((r) => `${l.value}+${r.value}`))
);
const distinctPair = (p: Params) => (p.left === p.right ? 'Left and right motors must be different ports' : null);

const SPECS: Record<string, BlockSpec> = {};

function define(opcodes: string[], spec: BlockSpec): void {
  for (const op of opcodes) SPECS[op] = spec;
}

// --- Imported SPIKE App blocks (mirrors SpikeScratchImporter.processBlock) ---
define(['flippermove_setMovementPair', 'spike_setMovementPair'], {
  choices: { left: PORTS, right: PORTS },
  validate: distinctPair,
  label: (_p, m) => `Set movement motors to [${m('left')}+${m('right')}]`,
  python: (p) => `motors = MotorPair('${p.left}', '${p.right}')`,
});
define(['flippermove_movementSpeed', 'spike_movementSpeed'], {
  values: ['speed'],
  label: (_p, m) => `Set movement speed to [${m('speed')}%]`,
  python: (p) => `motors.set_default_speed(${p.speed})`,
});
define(['flippermove_move', 'spike_move'], {
  values: ['value'],
  choices: { direction: MOVE_DIRS, unit: MOVE_UNITS },
  label: (_p, m) => `Move [${m('direction')}] for [${m('value')}] [${m('unit')}]`,
  python: (p) => {
    const v = num(p.value);
    const finalVal = p.direction === 'back' ? -Math.abs(v) : Math.abs(v);
    return `motors.move(${finalVal}, '${p.unit}')`;
  },
});
define(['flippermove_startMove', 'spike_startMove'], {
  choices: { direction: MOVE_DIRS },
  label: (_p, m) => `Start moving [${m('direction')}]`,
  python: (p) => (p.direction === 'back' ? 'motors.start(0, -50)' : 'motors.start()'),
});
define(['flippermove_startSteer', 'spike_startSteer'], {
  values: ['steering', 'speed'],
  label: (_p, m) => `Start steering [${m('steering')}] at [${m('speed')}%]`,
  python: (p) => `motors.start(${p.steering}, ${p.speed})`,
});
define(['flippermove_stopMove', 'spike_stopMove'], {
  label: () => 'Stop moving',
  python: () => 'motors.stop()',
});
define(['flippermoremove_startDualSpeed', 'spike_startDualSpeed'], {
  values: ['left', 'right'],
  label: (_p, m) => `Start moving tank Left: [${m('left')}%], Right: [${m('right')}%]`,
  python: (p) => `motors.start_tank(${p.left}, ${p.right})`,
});
define(['flippermoremove_moveDualSpeed', 'spike_moveDualSpeed'], {
  values: ['value', 'left', 'right'],
  choices: { unit: MOVE_UNITS },
  label: (_p, m) => `Move tank for [${m('value')}] [${m('unit')}] Left: [${m('left')}%], Right: [${m('right')}%]`,
  python: (p) => `motors.move_tank(${p.value}, '${p.unit}', ${p.left}, ${p.right})`,
});
define(['flippermotor_motorTurnForDirection', 'spike_motorTurnForDirection'], {
  values: ['value'],
  choices: { port: PORTS, direction: MOTOR_DIRS, unit: MOTOR_UNITS },
  motorPorts: ['port'],
  label: (_p, m) => `Turn Motor [Port ${m('port')}] [${m('direction')}] for [${m('value')}] [${m('unit')}]`,
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
  choices: { port: PORTS, direction: MOTOR_DIRS },
  motorPorts: ['port'],
  label: (_p, m) => `Start Motor [Port ${m('port')}] [${m('direction')}] at [${m('speed')}%]`,
  python: (p) => `motor_${lower(p.port)}.start(${p.direction === 'counterclockwise' ? '-' : ''}${p.speed})`,
});
define(['flippermotor_motorStop', 'spike_motorStop'], {
  choices: { port: PORTS },
  motorPorts: ['port'],
  label: (_p, m) => `Stop Motor [Port ${m('port')}]`,
  python: (p) => `motor_${lower(p.port)}.stop()`,
});
define(['flippermotor_motorSetSpeed', 'spike_motorSetSpeed'], {
  values: ['speed'],
  choices: { port: PORTS },
  motorPorts: ['port'],
  label: (_p, m) => `Set Motor [Port ${m('port')}] speed to [${m('speed')}%]`,
  python: (p) => `motor_${lower(p.port)}.set_default_speed(${p.speed})`,
});
define(['flippersensors_resetYaw', 'spike_resetYaw'], {
  label: () => 'Reset Yaw angle to 0°',
  python: () => 'hub.motion_sensor.reset_yaw_angle()',
});
define(['flippersensors_resetTimer', 'sensing_resettimer'], {
  label: () => 'Reset Timer',
  python: () => 'timer.reset()',
});
define(['control_wait'], {
  values: ['duration'],
  label: (_p, m) => `Wait [${m('duration')}] seconds`,
  python: (p) => `wait_for_seconds(${p.duration})`,
});
define(['control_wait_until'], {
  label: (p) => `Wait until <${p.condition}>`,
  python: (p) => (p.conditionPy ? `while not (${p.conditionPy}):\n    wait_for_seconds(0.01)` : null),
});
define(['control_repeat'], {
  values: ['times'],
  integers: ['times'],
  label: (_p, m) => `Repeat [${m('times')}] times`,
  python: (p) => `for _ in range(${p.times}):`,
});
define(['control_forever'], {
  label: () => 'Forever',
  python: () => 'while True:',
});
define(['control_if'], {
  label: (p) => `If <${p.condition}> then`,
  python: (p) => (p.conditionPy ? `if ${p.conditionPy}:` : null),
});
define(['control_if_else'], {
  label: (p) => `If <${p.condition}> then ... else`,
  python: (p) => (p.conditionPy ? `if ${p.conditionPy}:` : null),
});
define(['control_repeat_until'], {
  label: (p) => `Repeat until <${p.condition}>`,
  python: (p) => (p.conditionPy ? `while not (${p.conditionPy}):` : null),
});
define(['flippermoremotor_motorSetDegreeCounted'], {
  values: ['value'],
  choices: { port: PORTS },
  motorPorts: ['port'],
  label: (_p, m) => `Set relative position of [Port ${m('port')}] to [${m('value')}]`,
  python: (p) => `motor_${lower(p.port)}.set_degrees_counted(${p.value})`,
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
    choices: { port: PORTS, dir: MOTOR_DIRS_ICON },
    motorPorts: ['port'],
    label: (_p, m) => `[${m('port')} ▾] run [${m('dir')} ▾] for (${m('amount')}) ${unit}`,
    python: (p) => `motor_${lower(p.port)}.run_for_${unit}(${p.amount}, '${p.dir}')`,
  });
}
define(['motor.start'], {
  choices: { port: PORTS, dir: MOTOR_DIRS_ICON },
  motorPorts: ['port'],
  label: (_p, m) => `[${m('port')} ▾] start [${m('dir')} ▾]`,
  python: (p) => `motor_${lower(p.port)}.start('${p.dir}')`,
});
define(['motor.stop'], {
  choices: { port: PORTS },
  motorPorts: ['port'],
  label: (_p, m) => `[${m('port')} ▾] stop`,
  python: (p) => `motor_${lower(p.port)}.stop()`,
});
define(['motor.set_default_speed'], {
  values: ['speed'],
  choices: { port: PORTS },
  motorPorts: ['port'],
  label: (_p, m) => `set [${m('port')} ▾] speed to (${m('speed')})%`,
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
    choices: { dir: PALETTE_MOVE_DIRS, unit: MOVE_UNITS },
    label: (_p, m) => `move [${m('dir')} ▾] for (${m('amount')}) ${m('unit')}`,
    python: (p) => {
      const amount = Math.abs(num(p.amount));
      if (p.dir === 'back') return `motors.move(${-amount}, '${p.unit}', 0)`;
      const steering = p.dir === 'right' ? 100 : p.dir === 'left' ? -100 : 0;
      return `motors.move(${amount}, '${p.unit}', ${steering})`;
    },
  });
}
define(['motors.start'], {
  label: () => 'start moving [⬆ ▾]',
  python: (p) => `motors.start(${p.steering ?? 0})`,
});
define(['motors.start_tank'], {
  label: (p) => `start moving with steering (${p.left})`,
  python: (p) => `motors.start_tank(${p.left}, ${p.right})`,
});
define(['motors.stop'], {
  label: () => 'stop moving',
  python: () => 'motors.stop()',
});
define(['motors.set_pair'], {
  choices: { pair: MOTOR_PAIRS },
  label: (_p, m) => `set movement motors to [${m('pair')} ▾]`,
  python: (p) => {
    const [l, r] = (p.pair || 'A+B').split('+');
    return `motors = MotorPair('${l}', '${r}')`;
  },
});
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
  python: (p) => `while not (distance_sensor.get_distance_cm() < ${p.dist}):\n    time.sleep(0.01)`,
});
define(['control.repeat'], {
  values: ['times'],
  integers: ['times'],
  label: (_p, m) => `repeat (${m('times')})`,
  python: (p) => `for _ in range(${p.times}):`,
});
define(['control.forever'], {
  label: () => 'forever',
  python: () => 'while True:',
});
define(['motion.reset_yaw'], {
  label: () => 'reset yaw angle',
  python: () => 'hub.motion_sensor.reset_yaw_angle()',
});
define(['color.wait_until'], {
  choices: { color: COLORS },
  label: (p, m) => `wait until color [${p.port} ▾] is [${m('color')} ▾]`,
  python: (p) => `while color_sensor_${lower(p.port)}.get_color() != '${p.color}':\n    time.sleep(0.01)`,
});
define(['color.is_color'], {
  choices: { color: COLORS },
  label: (p, m) => `is color [${p.port} ▾] [${m('color')} ▾] ?`,
  python: (p) => `color_sensor_${lower(p.port)}.get_color() == '${p.color}'`,
});
define(['distance.is_less_than'], {
  values: ['dist'],
  label: (_p, m) => `distance < (${m('dist')}) cm ?`,
  python: (p) => `distance_sensor.get_distance_cm() < ${p.dist}`,
});
define(['operator.add'], {
  label: () => '( ) + ( )',
  python: () => '0 + 0',
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

export type ParamKind = 'number' | 'choice';

export function getParamKind(block: VisualBlock, param: string): ParamKind | null {
  const spec = SPECS[block.opcode];
  if (!spec) return null;
  if (spec.choices?.[param]?.some((c) => c.value === block.params?.[param])) return 'choice';
  if (spec.values?.includes(param) && NUMBER_RE.test(String(block.params?.[param] ?? '').trim())) return 'number';
  return null;
}

/** Params of this block whose value can be edited right now */
export function getEditableParams(block: VisualBlock): string[] {
  const spec = SPECS[block.opcode];
  if (!spec) return [];
  const params = [...(spec.values ?? []), ...Object.keys(spec.choices ?? {})];
  return params.filter((k) => getParamKind(block, k) !== null);
}

export function getChoices(block: VisualBlock, param: string): Choice[] {
  return SPECS[block.opcode]?.choices?.[param] ?? [];
}

/** Text shown for a param (choice label, e.g. ↻ for clockwise) */
export function getDisplayValue(block: VisualBlock, param: string): string {
  const value = block.params?.[param] ?? '';
  return getChoices(block, param).find((c) => c.value === value)?.label ?? value;
}

function plainLabel(spec: BlockSpec, block: VisualBlock): string {
  return spec.label(block.params, (k) => getDisplayValue(block, k));
}

/**
 * Label with editable params wrapped as `open + param + close`, or null when the
 * block has nothing editable (callers then keep using block.label).
 */
export function buildEditableLabel(block: VisualBlock, open: string, close: string): string | null {
  const spec = SPECS[block.opcode];
  const editable = getEditableParams(block);
  if (!spec || editable.length === 0) return null;
  return spec.label(block.params, (k) => (editable.includes(k) ? `${open}${k}${close}` : getDisplayValue(block, k)));
}

/** Validates user input; returns the value to store or an error message */
export function normalizeValue(block: VisualBlock, param: string, raw: string): { value: string } | { error: string } {
  const kind = getParamKind(block, param);
  const text = raw.trim();
  if (kind === 'choice') {
    return getChoices(block, param).some((c) => c.value === text) ? { value: text } : { error: `"${raw}" is not a valid option` };
  }
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

const indentOf = (line: string) => line.match(/^\s*/)?.[0] ?? '';
/** Marker the importer writes between its device header and the program body */
const MAIN_PROGRAM_MARKER = '# --- Main Program ---';
const WAIT_UNTIL_RE = /^\s*while not \((.*)\):$/;

/** Whether a block emits no Python (unsupported imported SPIKE block) */
function hasNoPython(b: VisualBlock): boolean {
  if (b.params?.noPython === 'true') return true;
  // Imports saved before the noPython marker existed: the importer's generic fallback shape
  return !SPECS[b.opcode] && b.icon === '🧩' && b.colorHex === '#64748b' && Object.keys(b.params ?? {}).length === 0;
}

/** Last line in [from, to) where `stmt` starts and fits entirely before `to`, or -1 */
function findStatement(lines: string[], stmt: string, from: number, to: number): number {
  const stmtLines = stmt.split('\n');
  for (let i = to - stmtLines.length; i >= from; i--) {
    const base = indentOf(lines[i]);
    if (stmtLines.every((s, j) => lines[i + j].trimEnd() === base + s)) return i;
  }
  return -1;
}

/** Python of a block; wait-until blocks saved without conditionPy are recovered from the code */
function statementOf(b: VisualBlock, lines: string[], from: number, to: number): string | null {
  const stmt = SPECS[b.opcode]?.python(b.params) ?? null;
  if (stmt !== null || b.opcode !== 'control_wait_until') return stmt;
  for (let i = to - 2; i >= from; i--) {
    const m = lines[i].match(WAIT_UNTIL_RE);
    if (m && lines[i + 1].trimEnd() === `${indentOf(lines[i])}    wait_for_seconds(0.01)`) {
      return `while not (${m[1]}):\n    wait_for_seconds(0.01)`;
    }
  }
  return null;
}

/**
 * Finds where `block`'s statement starts. Blocks are matched from the last one
 * backwards, each above the next block's match, so lines that only look like a
 * block's statement (device headers such as `motors = MotorPair(...)`, which sit
 * above the program) are not mistaken for it.
 */
function locate(all: VisualBlock[], block: VisualBlock, lines: string[]): { at: number; stmt: string } | null {
  const floor = lines.findIndex((l) => l.trim() === MAIN_PROGRAM_MARKER) + 1;
  let limit = lines.length;
  for (const b of [...all].reverse()) {
    if (hasNoPython(b)) continue;
    const stmt = statementOf(b, lines, floor, limit);
    const at = stmt === null ? -1 : findStatement(lines, stmt, floor, limit);
    if (b === block) return stmt === null || at === -1 ? null : { at, stmt };
    if (at !== -1) limit = at;
  }
  return null;
}

/** Adds `motor_x = Motor('X')` (and the Motor import) when the code lacks it */
function ensureMotorDeclared(lines: string[], port: string): void {
  const name = `motor_${lower(port)}`;
  if (lines.some((l) => new RegExp(`^${name}\\s*=`).test(l))) return;

  const lastIdx = (re: RegExp) => lines.reduce((found, l, i) => (re.test(l) ? i : found), -1);
  let at = lastIdx(/^motor_[a-z]\s*=\s*Motor\(/);
  if (at === -1) at = lastIdx(/^motors\s*=\s*MotorPair\(/);
  if (at === -1) at = lastIdx(/^hub\s*=\s*PrimeHub\(\)/);
  if (at === -1) at = lastIdx(/^(from|import)\s/);
  lines.splice(at + 1, 0, `${name} = Motor('${port.toUpperCase()}')`);

  const importIdx = lines.findIndex((l) => /^from spike import /.test(l));
  if (importIdx === -1) {
    lines.unshift('from spike import Motor');
    return;
  }
  const imported = lines[importIdx].replace(/^from spike import /, '');
  if (/[*(]/.test(imported)) return;
  if (!imported.split(',').map((s) => s.trim()).includes('Motor')) lines[importIdx] = `${lines[importIdx]}, Motor`;
}

export interface BlockCodeResult {
  ok: boolean;
  code: string;
  error?: string;
}

/**
 * Sets block.params[param] and rewrites the matching Python statement in `code`.
 * On failure the block is left unchanged.
 */
export function applyBlockValueEdit(
  blocks: VisualBlock[],
  code: string,
  blockId: string,
  param: string,
  raw: string
): BlockCodeResult {
  const all = flatten(blocks);
  const block = all.find((b) => b.id === blockId);
  const spec = block ? SPECS[block.opcode] : undefined;
  if (!block || !spec || !getEditableParams(block).includes(param)) {
    return { ok: false, code, error: 'This value cannot be edited' };
  }

  const normalized = normalizeValue(block, param, raw);
  if ('error' in normalized) return { ok: false, code, error: normalized.error };
  if (normalized.value === block.params[param]) return { ok: true, code };

  const newParams = { ...block.params, [param]: normalized.value };
  const invalid = spec.validate?.(newParams);
  if (invalid) return { ok: false, code, error: invalid };

  const newStmt = spec.python(newParams);
  const lines = code.split('\n');
  const found = locate(all, block, lines);
  if (!found || newStmt === null) {
    return { ok: false, code, error: `Could not find this block's statement in the Python code` };
  }

  const base = indentOf(lines[found.at]);
  lines.splice(found.at, found.stmt.split('\n').length, ...newStmt.split('\n').map((s) => base + s));
  if (spec.motorPorts?.includes(param)) ensureMotorDeclared(lines, normalized.value);

  block.params = newParams;
  block.label = plainLabel(spec, block);
  return { ok: true, code: lines.join('\n') };
}

/**
 * Removes the block (searching nested stacks) and its Python statement.
 * A body left empty gets `pass` so the code stays valid. On failure nothing changes.
 */
export function deleteBlock(blocks: VisualBlock[], code: string, blockId: string): BlockCodeResult {
  const all = flatten(blocks);
  const block = all.find((b) => b.id === blockId);
  if (!block) return { ok: false, code, error: 'Block not found' };
  if (block.children?.length || block.elseChildren?.length) {
    return { ok: false, code, error: 'Delete the blocks inside this one first' };
  }

  let newCode = code;
  if (!hasNoPython(block)) {
    const lines = code.split('\n');
    const found = locate(all, block, lines);
    if (!found) {
      return { ok: false, code, error: `Could not find this block's statement in the Python code; edit it in Python mode instead` };
    }
    const { at, stmt } = found;
    const indent = indentOf(lines[at]);
    lines.splice(at, stmt.split('\n').length);

    const prev = lines.slice(0, at).reverse().find((l) => l.trim() !== '');
    const next = lines.slice(at).find((l) => l.trim() !== '');
    const stripComment = (l: string) => l.replace(/\s+#.*$/, '').trimEnd();
    const opensBody = prev !== undefined && stripComment(prev).endsWith(':') && indentOf(prev).length < indent.length;
    if (opensBody && (next === undefined || indentOf(next).length < indent.length)) {
      lines.splice(at, 0, `${indent}pass`);
    }
    newCode = lines.join('\n');
  }

  const removeFrom = (list: VisualBlock[] | undefined): boolean => {
    if (!list) return false;
    const idx = list.indexOf(block);
    if (idx !== -1) {
      list.splice(idx, 1);
      return true;
    }
    return list.some((b) => removeFrom(b.children) || removeFrom(b.elseChildren));
  };
  removeFrom(blocks);
  return { ok: true, code: newCode };
}
