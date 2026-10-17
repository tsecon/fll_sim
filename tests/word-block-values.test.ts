import { describe, it, expect } from 'vitest';
import { SpikeScratchImporter, VisualBlock } from '../src/runtime/spike-scratch-importer';
import { PythonScriptRunner } from '../src/runtime/python-runner';
import { SAMPLE_MISSIONS, SPIKE_PALETTE_ITEMS } from '../src/ui/hud';
import { applyBlockValueEdit, buildEditableLabel, deleteBlock, getDisplayValue, getEditableParams } from '../src/ui/word-block-values';

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
      const defaultLabel = buildEditableLabel(b, '\u0001', '\u0002')!.replace(/\u0001(\w+)\u0002/g, (_m, k) => getDisplayValue(b, k));
      expect(defaultLabel, item.id).toBe(item.label);

      const firstLine = item.pythonSnippet.split('\n')[0];
      const numeric = getEditableParams(b).find((k) => /^-?\d/.test(b.params[k]));
      if (!numeric) continue;
      const res = applyBlockValueEdit([b], item.pythonSnippet, item.id, numeric, '7');
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

describe('Word Block dropdown editing', () => {
  it('switches move direction and unit for imported blocks', () => {
    const sample = SAMPLE_MISSIONS.drive_straight;
    const blocks = clone(sample.visualBlocks!);

    let res = applyBlockValueEdit(blocks, sample.code, 'ds-move', 'direction', 'back');
    expect(res.code).toContain("motors.move(-30, 'cm')");
    res = applyBlockValueEdit(blocks, res.code, 'ds-move', 'unit', 'rotations');
    expect(res.code).toContain("motors.move(-30, 'rotations')");
    expect(blocks.find((b) => b.id === 'ds-move')!.label).toBe('Move [back] for [30] [rotations]');
  });

  it('rejects values outside the option list and identical pair ports', () => {
    const sample = SAMPLE_MISSIONS.drive_straight;
    const blocks = clone(sample.visualBlocks!);
    expect(applyBlockValueEdit(blocks, sample.code, 'ds-move', 'unit', 'miles').ok).toBe(false);

    const res = applyBlockValueEdit(blocks, sample.code, 'ds-pair', 'left', 'B');
    expect(res.ok).toBe(false);
    expect(res.code).toBe(sample.code);
    expect(blocks.find((b) => b.id === 'ds-pair')!.params.left).toBe('A');

    const ok = applyBlockValueEdit(blocks, sample.code, 'ds-pair', 'right', 'C');
    expect(ok.code).toContain("motors = MotorPair('A', 'C')");
  });

  it('declares the motor and imports Motor when the port changes', () => {
    const blocks = [block('t', 'flippermotor_motorTurnForDirection', { port: 'C', direction: 'clockwise', value: '1', unit: 'rotations' })];
    const code = [
      'from spike import PrimeHub, Motor, MotorPair',
      'hub = PrimeHub()',
      "motor_c = Motor('C')",
      '',
      'motor_c.run_for_degrees(360)',
      '',
    ].join('\n');

    const res = applyBlockValueEdit(blocks, code, 't', 'port', 'D');
    expect(res.code.split('\n')).toEqual([
      'from spike import PrimeHub, Motor, MotorPair',
      'hub = PrimeHub()',
      "motor_c = Motor('C')",
      "motor_d = Motor('D')",
      '',
      'motor_d.run_for_degrees(360)',
      '',
    ]);
    expect(blocks[0].label).toBe('Turn Motor [Port D] [clockwise] for [1] [rotations]');
  });

  it('adds the Motor import for palette motor blocks in code without it', () => {
    const item = SPIKE_PALETTE_ITEMS.find((i) => i.id === 'motor_run_degrees')!;
    const blocks = [block('p', item.opcode, { ...item.params })];
    const code = `from spike import PrimeHub, MotorPair\n\nhub = PrimeHub()\nmotors = MotorPair('A', 'B')\n\n${item.pythonSnippet}\n`;

    let res = applyBlockValueEdit(blocks, code, 'p', 'port', 'E');
    res = applyBlockValueEdit(blocks, res.code, 'p', 'dir', 'counterclockwise');
    expect(res.code).toBe(
      `from spike import PrimeHub, MotorPair, Motor\n\nhub = PrimeHub()\nmotors = MotorPair('A', 'B')\nmotor_e = Motor('E')\n\nmotor_e.run_for_degrees(360, 'counterclockwise')\n`
    );
    expect(blocks[0].label).toBe('[E ▾] run [↺ ▾] for (360) degrees');
  });

  it('maps palette move direction to sign and steering', () => {
    const item = SPIKE_PALETTE_ITEMS.find((i) => i.id === 'move_cm')!;
    const blocks = [block('p', item.opcode, { ...item.params })];
    let res = applyBlockValueEdit(blocks, item.pythonSnippet, 'p', 'dir', 'back');
    expect(res.code).toBe("motors.move(-10, 'cm', 0)");
    res = applyBlockValueEdit(blocks, res.code, 'p', 'dir', 'right');
    expect(res.code).toBe("motors.move(10, 'cm', 100)");
    res = applyBlockValueEdit(blocks, res.code, 'p', 'unit', 'in');
    expect(res.code).toBe("motors.move(10, 'in', 100)");
  });

  it('edits multi-line palette statements as a whole', () => {
    const item = SPIKE_PALETTE_ITEMS.find((i) => i.id === 'sensor_wait_color_c')!;
    const blocks = [block('p', item.opcode, { ...item.params })];
    const res = applyBlockValueEdit(blocks, `${item.pythonSnippet}\nprint("done")\n`, 'p', 'color', 'green');
    expect(res.code).toBe(`while color_sensor_c.get_color() != 'green':\n    time.sleep(0.01)\nprint("done")\n`);
  });
});

describe('Word Block deletion', () => {
  it('removes the block and only its Python line', () => {
    const sample = SAMPLE_MISSIONS.drive_straight;
    const blocks = clone(sample.visualBlocks!);
    const res = deleteBlock(blocks, sample.code, 'ds-spd');
    expect(res.ok).toBe(true);
    expect(res.code).toBe(sample.code.replace('motors.set_default_speed(50)\n', ''));
    expect(blocks.map((b) => b.id)).toEqual(['ds-hat', 'ds-pair', 'ds-move']);
  });

  it('deletes the matching duplicate', () => {
    const blocks = [block('w1', 'control_wait', { duration: '1' }), block('w2', 'control_wait', { duration: '1' })];
    const res = deleteBlock(blocks, 'wait_for_seconds(1)\nprint("x")\nwait_for_seconds(1)\n', 'w2');
    expect(res.code).toBe('wait_for_seconds(1)\nprint("x")\n');
    expect(blocks.map((b) => b.id)).toEqual(['w1']);
  });

  it('deletes nested blocks and keeps an emptied body valid with pass', () => {
    const child = block('w', 'control_wait', { duration: '1' });
    const blocks = [block('r', 'control_repeat', { times: '3' }, { children: [child] }), block('s', 'flippermove_stopMove', {})];
    const res = deleteBlock(blocks, 'for _ in range(3):\n    wait_for_seconds(1)\nmotors.stop()\n', 'w');
    expect(res.code).toBe('for _ in range(3):\n    pass\nmotors.stop()\n');
    expect(blocks[0].children).toEqual([]);
  });

  it('removes every line of multi-line statements', () => {
    const imported = block('u', 'control_wait_until', { condition: 'x', conditionPy: 'dist_d.get_distance_cm() < 10' });
    const code = 'while not (dist_d.get_distance_cm() < 10):\n    wait_for_seconds(0.01)\nmotors.stop()\n';
    const res = deleteBlock([imported], code, 'u');
    expect(res.code).toBe('motors.stop()\n');
  });

  it('removes unsupported imported blocks without touching code', () => {
    const blocks = [block('x', 'flipperlight_lightDisplayText', { noPython: 'true' })];
    const res = deleteBlock(blocks, 'motors.stop()\n', 'x');
    expect(res).toEqual({ ok: true, code: 'motors.stop()\n' });
    expect(blocks).toEqual([]);
  });

  it('refuses to delete when the statement cannot be found', () => {
    const blocks = [block('w', 'control_wait', { duration: '1' })];
    const res = deleteBlock(blocks, 'print("hand edited")\n', 'w');
    expect(res.ok).toBe(false);
    expect(blocks).toHaveLength(1);
  });
});

describe('Word Blocks from a SPIKE App import', () => {
  const scratch: Record<string, any> = {
    hat: { opcode: 'flipperevents_whenProgramStarts', next: 'spd', topLevel: true },
    spd: { opcode: 'flippermove_movementSpeed', inputs: { SPEED: [1, [4, '40']] }, next: 'loop' },
    loop: { opcode: 'control_repeat', inputs: { TIMES: [1, [4, '2']], SUBSTACK: [2, 'mv'] }, next: 'arm' },
    mv: { opcode: 'flippermove_move', inputs: { DIRECTION: [1, [4, 'forward']], VALUE: [1, [4, '10']] }, fields: { UNIT: ['cm'] }, next: null },
    arm: {
      opcode: 'flippermotor_motorTurnForDirection',
      inputs: { PORT: [1, [4, 'C']], DIRECTION: [1, [4, 'clockwise']], VALUE: [1, [4, '0.5']] },
      fields: { UNIT: ['rotations'] },
      next: 'until',
    },
    until: { opcode: 'control_wait_until', inputs: { CONDITION: [2, 'cond'] }, next: 'light' },
    cond: { opcode: 'flippersensors_isDistance', inputs: { PORT: [1, [4, 'D']], VALUE: [1, [4, '15']] }, fields: { COMPARISON: ['<'] } },
    light: { opcode: 'flipperlight_lightDisplayText', inputs: {}, next: 'stop' },
    stop: { opcode: 'flippermove_stopMove', inputs: {}, next: null },
  };

  const assertValidPython = (code: string) => {
    const js = PythonScriptRunner.transpilePythonToJs(code);
    expect(() => new Function('PrimeHub', 'Motor', 'MotorPair', 'ColorSensor', 'DistanceSensor', 'wait_for_seconds', 'time', '__yield', 'console', `return (async () => {\n${js}\n})();`)).not.toThrow();
  };

  it('every imported block can be deleted, one by one, keeping valid Python', () => {
    const imported = SpikeScratchImporter.transpileBlocks(scratch, 'Import');
    const blocks = imported.visualBlocks;
    let code = imported.pythonCode;
    for (const id of ['spd', 'mv', 'arm', 'until', 'light', 'stop']) {
      const res = deleteBlock(blocks, code, id);
      expect(res.ok, id).toBe(true);
      code = res.code;
      assertValidPython(code);
    }
    expect(code).toContain('for _ in range(2):\n    pass');
    expect(code).not.toMatch(/motors\.(move|stop|set_default_speed)\(|run_for_degrees|while not/);
  });

  it('edits imported values and dropdowns, keeping valid Python', () => {
    const imported = SpikeScratchImporter.transpileBlocks(scratch, 'Import');
    const blocks = imported.visualBlocks;
    const edits: [string, string, string][] = [
      ['spd', 'speed', '60'],
      ['loop', 'times', '5'],
      ['mv', 'value', '12.5'],
      ['mv', 'direction', 'back'],
      ['arm', 'port', 'E'],
      ['arm', 'unit', 'degrees'],
      ['arm', 'direction', 'counterclockwise'],
    ];
    let code = imported.pythonCode;
    for (const [id, param, value] of edits) {
      const res = applyBlockValueEdit(blocks, code, id, param, value);
      expect(res.ok, `${id}.${param}`).toBe(true);
      code = res.code;
    }
    assertValidPython(code);
    expect(code).toContain('motors.set_default_speed(60)');
    expect(code).toContain("for _ in range(5):\n    motors.move(-12.5, 'cm')");
    expect(code).toContain("motor_e = Motor('E')");
    expect(code).toContain('motor_e.run_for_degrees(-0.5)');
  });
});


describe('Word Block code matching edge cases (review regressions)', () => {
  const pairScratch: Record<string, any> = {
    hat: { opcode: 'flipperevents_whenProgramStarts', next: 'pair', topLevel: true },
    pair: { opcode: 'flippermove_setMovementPair', inputs: { PAIR: [1, [4, 'CD']] }, next: 'mv' },
    mv: { opcode: 'flippermove_move', inputs: { DIRECTION: [1, [4, 'forward']], VALUE: [1, [4, '10']] }, fields: { UNIT: ['cm'] }, next: null },
  };

  it('edits the movement pair statement in the program body, not the device header', () => {
    const imported = SpikeScratchImporter.transpileBlocks(pairScratch, 'Pair');
    const blocks = imported.visualBlocks;
    const header = imported.pythonCode.split('# --- Main Program ---')[0];
    expect(header).toContain("motors = MotorPair('C', 'D')");

    const res = applyBlockValueEdit(blocks, imported.pythonCode, 'pair', 'left', 'E');
    const [newHeader, body] = res.code.split('# --- Main Program ---');
    expect(newHeader).toBe(header);
    expect(body).toContain("motors = MotorPair('E', 'D')");

    const del = deleteBlock(blocks, res.code, 'pair');
    expect(del.code.split('# --- Main Program ---')[0]).toBe(header);
    expect(del.code.split('# --- Main Program ---')[1]).not.toContain('MotorPair');
  });

  it('maps a palette pair block after a code header to its own appended line', () => {
    const item = SPIKE_PALETTE_ITEMS.find((i) => i.id === 'move_set_pair')!;
    const blocks = [block('p', item.opcode, { ...item.params })];
    const code = `from spike import PrimeHub, MotorPair\nmotors = MotorPair('A', 'B')\n\nmotors.move(10, 'cm')\n${item.pythonSnippet}`;
    const res = applyBlockValueEdit(blocks, code, 'p', 'pair', 'C+D');
    expect(res.code).toBe(`from spike import PrimeHub, MotorPair\nmotors = MotorPair('A', 'B')\n\nmotors.move(10, 'cm')\nmotors = MotorPair('C', 'D')`);
  });

  it('does not confuse a palette forever block with an imported forever loop', () => {
    const imported = block('f', 'control_forever', {}, { children: [block('w', 'control_wait', { duration: '1' })] });
    const palette = block('pf', 'control.forever', {});
    const code = 'while True:\n    wait_for_seconds(1)\nwhile True:';
    const res = deleteBlock([imported, palette], code, 'pf');
    expect(res.code).toBe('while True:\n    wait_for_seconds(1)');
  });

  it('does not match a wait against the inner line of an earlier wait-until loop', () => {
    const until = block('u', 'control_wait_until', { condition: 'x', conditionPy: 'x < 1' });
    const wait = block('w', 'control_wait', { duration: '0.01' });
    const code = 'while not (x < 1):\n    wait_for_seconds(0.01)\nwait_for_seconds(0.01)\n';
    const res = applyBlockValueEdit([until, wait], code, 'w', 'duration', '2');
    expect(res.code).toBe('while not (x < 1):\n    wait_for_seconds(0.01)\nwait_for_seconds(2)\n');
  });

  it('deletes blocks saved before noPython / conditionPy existed', () => {
    const fallback = block('x', 'flipperlight_lightDisplayText', {}, { icon: '🧩', colorHex: '#64748b' });
    const oldUntil = block('u', 'control_wait_until', { condition: 'Distance < 10 cm' });
    const code = 'while not (dist_d.get_distance_cm() < 10):\n    wait_for_seconds(0.01)\nmotors.stop()\n';
    const blocks = [fallback, oldUntil];

    expect(deleteBlock(blocks, code, 'x')).toEqual({ ok: true, code });
    const res = deleteBlock(blocks, code, 'u');
    expect(res.code).toBe('motors.stop()\n');
    expect(blocks).toEqual([]);
  });

  it('refuses to delete a block that still has children', () => {
    const blocks = [block('r', 'control_repeat', { times: '2' }, { children: [block('w', 'control_wait', { duration: '1' })] })];
    const res = deleteBlock(blocks, 'for _ in range(2):\n    wait_for_seconds(1)\n', 'r');
    expect(res.ok).toBe(false);
    expect(blocks[0].children).toHaveLength(1);
  });

  it('adds pass after a header with a trailing comment', () => {
    const blocks = [block('r', 'control_repeat', { times: '2' }, { children: [block('w', 'control_wait', { duration: '1' })] })];
    const res = deleteBlock(blocks, 'for _ in range(2):  # loop\n    wait_for_seconds(1)\n', 'w');
    expect(res.code).toBe('for _ in range(2):  # loop\n    pass\n');
  });

  it('keeps wildcard imports and adds an import when none exists', () => {
    const turn = () => [block('t', 'flippermotor_motorStop', { port: 'A' })];
    let res = applyBlockValueEdit(turn(), 'from spike import *\nmotor_a.stop()\n', 't', 'port', 'B');
    expect(res.code).toBe("from spike import *\nmotor_b = Motor('B')\nmotor_b.stop()\n");

    res = applyBlockValueEdit(turn(), 'motor_a.stop()\n', 't', 'port', 'B');
    expect(res.code).toBe("from spike import Motor\nmotor_b = Motor('B')\nmotor_b.stop()\n");
  });
});

describe('Word Block label rendering', () => {
  it('escapes HTML coming from imported labels', async () => {
    const { SimulatorHud } = await import('../src/ui/hud');
    const html = SimulatorHud.prototype.formatBlockLabel('Set [x] to [<img src=x onerror=alert(1)//] and <a <b> "q"');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<a\b|<b>/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)//');
  });
});

describe('Word Block tabs do not share block objects', () => {
  it('editing a tab opened from a sample leaves the sample untouched', async () => {
    const { SimulatorHud } = await import('../src/ui/hud');
    const original = clone(SAMPLE_MISSIONS.drive_straight.visualBlocks!);
    const hud: any = {
      scriptTabs: [],
      activeTabIndex: 0,
      codeTextarea: { value: '' },
      popoutTextarea: { value: '' },
      topbarProgramSelect: { value: '' },
      openScriptTab: SimulatorHud.prototype.openScriptTab,
      renderScriptTabs: () => {},
      showBlocksReadOnlyBanner: () => {},
      updatePaletteAvailability: () => {},
      updateTopbarProgramSelect: () => {},
      renderVisualBlocks: () => {},
      saveScriptTabsToStorage: () => {},
    };
    const sample = SAMPLE_MISSIONS.drive_straight;
    hud.openScriptTab('Mission 1', sample.code, 'blocks', sample.visualBlocks);
    const tab = hud.scriptTabs[0];

    applyBlockValueEdit(tab.visualBlocks, tab.code, 'ds-move', 'value', '50');
    deleteBlock(tab.visualBlocks, tab.code, 'ds-spd');

    expect(sample.visualBlocks).toEqual(original);
  });
});
