import { describe, it, expect } from 'vitest';
import { VisualBlock } from '../src/runtime/spike-scratch-importer';
import { SAMPLE_MISSIONS, SPIKE_PALETTE_ITEMS } from '../src/ui/hud';
import { applyBlockValueEdit, buildEditableLabel, getEditableParams } from '../src/ui/word-block-values';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const block = (id: string, opcode: string, params: Record<string, string>, extra: Partial<VisualBlock> = {}): VisualBlock => ({
  id,
  opcode,
  category: 'control',
  icon: '',
  label: '',
  colorHex: '#000',
  params,
  ...extra,
});

describe('Word Block value editing', () => {
  it('edits the sample mission move distance and rewrites only that Python line', () => {
    const sample = SAMPLE_MISSIONS.drive_straight;
    const blocks = clone(sample.visualBlocks!);

    const res = applyBlockValueEdit(blocks, sample.code, 'ds-move', 'value', '45');

    expect(res.ok).toBe(true);
    expect(res.code).toBe(sample.code.replace("motors.move(30, 'cm')", "motors.move(45, 'cm')"));
    const move = blocks.find((b) => b.id === 'ds-move')!;
    expect(move.params.value).toBe('45');
    expect(move.label).toBe('Move [forward] for [45] [cm]');
  });

  it('keeps sign handling for backward moves', () => {
    const blocks = [block('m', 'flippermove_move', { direction: 'back', value: '10', unit: 'cm' })];
    const res = applyBlockValueEdit(blocks, "motors.move(-10, 'cm')\n", 'm', 'value', '25');
    expect(res.code).toBe("motors.move(-25, 'cm')\n");
  });

  it('matches the right line when several blocks share the same statement', () => {
    const blocks = [
      block('w1', 'control_wait', { duration: '1' }),
      block('w2', 'control_wait', { duration: '1' }),
    ];
    const code = 'wait_for_seconds(1)\nprint("x")\nwait_for_seconds(1)\n';
    const res = applyBlockValueEdit(blocks, code, 'w2', 'duration', '2.5');
    expect(res.code).toBe('wait_for_seconds(1)\nprint("x")\nwait_for_seconds(2.5)\n');
  });

  it('preserves indentation of nested blocks and edits loop counts', () => {
    const child = block('w', 'control_wait', { duration: '1' });
    const blocks = [block('r', 'control_repeat', { times: '3' }, { children: [child] })];
    const code = 'for _ in range(3):\n    wait_for_seconds(1)\n';

    let res = applyBlockValueEdit(blocks, code, 'w', 'duration', '0.5');
    expect(res.code).toBe('for _ in range(3):\n    wait_for_seconds(0.5)\n');

    res = applyBlockValueEdit(blocks, res.code, 'r', 'times', '4');
    expect(res.code).toBe('for _ in range(4):\n    wait_for_seconds(0.5)\n');
  });

  it('edits palette blocks using their python snippet', () => {
    const item = SPIKE_PALETTE_ITEMS.find((i) => i.id === 'move_cm')!;
    const blocks = [block('p', item.opcode, { ...item.params }, { label: item.label })];
    const res = applyBlockValueEdit(blocks, item.pythonSnippet + '\n', 'p', 'amount', '20');
    expect(res.code).toBe("motors.move(20, 'cm', 0)\n");
    expect(blocks[0].label).toBe('move [⬆ ▾] for (20) cm');
  });

  it('palette specs reproduce every default snippet exactly', () => {
    for (const item of SPIKE_PALETTE_ITEMS) {
      const b = block(item.id, item.opcode, { ...item.params }, { label: item.label });
      if (getEditableParams(b).length === 0) continue;
      const defaultLabel = buildEditableLabel(b, '\u0001', '\u0002')!.replace(/\u0001(\w+)\u0002/g, (_m, k) => b.params[k]);
      expect(defaultLabel, item.id).toBe(item.label);

      const firstLine = item.pythonSnippet.split('\n')[0];
      const res = applyBlockValueEdit([b], item.pythonSnippet, item.id, getEditableParams(b)[0], '7');
      expect(res.ok, item.id).toBe(true);
      expect(res.code.split('\n')[0], item.id).not.toBe(firstLine);
    }
  });

  it('rejects invalid input and leaves block and code unchanged', () => {
    const blocks = [block('r', 'control_repeat', { times: '3' })];
    const code = 'for _ in range(3):\n    pass\n';
    for (const bad of ['abc', '', '1e3', '2.5']) {
      const res = applyBlockValueEdit(blocks, code, 'r', 'times', bad);
      expect(res.ok, bad).toBe(false);
      expect(res.code).toBe(code);
      expect(blocks[0].params.times).toBe('3');
    }
  });

  it('normalizes leading zeros so Python stays valid', () => {
    const blocks = [block('w', 'control_wait', { duration: '1' })];
    const res = applyBlockValueEdit(blocks, 'wait_for_seconds(1)\n', 'w', 'duration', '007');
    expect(res.code).toBe('wait_for_seconds(7)\n');
  });

  it('fails without changing the block when the Python line is missing', () => {
    const blocks = [block('w', 'control_wait', { duration: '1' })];
    const res = applyBlockValueEdit(blocks, 'print("edited by hand")\n', 'w', 'duration', '2');
    expect(res.ok).toBe(false);
    expect(blocks[0].params.duration).toBe('1');
  });

  it('does not offer editing for non-numeric values or unknown blocks', () => {
    expect(getEditableParams(block('v', 'data_setvariableto', { variable: 'x', value: 'y + 1' }))).toEqual([]);
    expect(getEditableParams(block('h', 'event_whenprogramstarts', {}))).toEqual([]);
  });
});
