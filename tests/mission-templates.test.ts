import { describe, it, expect } from 'vitest';
import { MISSION_TEMPLATES } from '../src/ui/mission-templates';
import { SAMPLE_MISSIONS } from '../src/ui/hud';
import { applyBlockValueEdit, deleteBlock, getEditableParams } from '../src/ui/word-block-values';
import type { VisualBlock } from '../src/runtime/spike-scratch-importer';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { VirtualSensorManager } from '../src/sensors/sensor-manager';
import { VirtualSpikeApi } from '../src/runtime/spike-api';
import { PythonScriptRunner } from '../src/runtime/python-runner';

const clone = (blocks: VisualBlock[]): VisualBlock[] => JSON.parse(JSON.stringify(blocks));

function leaves(blocks: VisualBlock[], out: VisualBlock[] = []): VisualBlock[] {
  for (const b of blocks) {
    if (b.children || b.elseChildren) {
      leaves(b.children ?? [], out);
      leaves(b.elseChildren ?? [], out);
    } else {
      out.push(b);
    }
  }
  return out;
}

async function runTemplate(code: string) {
  const engine = new SimulationPhysicsEngine();
  await engine.init();
  const sensors = new VirtualSensorManager(engine.robot);
  const api = new VirtualSpikeApi(engine, sensors);
  const runner = new PythonScriptRunner(api);
  const start = engine.robot.getPosition();
  const timer = setInterval(() => engine.update(1 / 60), 16);
  try {
    await runner.execute(code);
  } finally {
    clearInterval(timer);
  }
  const end = engine.robot.getPosition();
  return { yaw: sensors.getYaw(), distance: Math.hypot(end.x - start.x, end.z - start.z) };
}

describe('Gyro control mission templates', () => {
  it('are registered as sample missions', () => {
    for (const key of Object.keys(MISSION_TEMPLATES)) {
      expect(SAMPLE_MISSIONS[key]).toBe(MISSION_TEMPLATES[key]);
    }
  });

  it.each(Object.entries(MISSION_TEMPLATES))('%s: every block can be deleted in sync with the code', (_key, tpl) => {
    for (const block of leaves(tpl.visualBlocks)) {
      if (block.category === 'event') continue;
      const blocks = clone(tpl.visualBlocks);
      const res = deleteBlock(blocks, tpl.code, block.id);
      expect(res.error, block.id).toBeUndefined();
      expect(res.code).not.toBe(tpl.code);
    }
  });

  it.each(Object.entries(MISSION_TEMPLATES))('%s: numeric inputs are editable from Word Blocks', (_key, tpl) => {
    const numeric = leaves(tpl.visualBlocks).filter(
      (b) => b.opcode === 'data_setvariableto' && getEditableParams(b).includes('value')
    );
    expect(numeric.length).toBeGreaterThan(0);
    for (const block of numeric) {
      const res = applyBlockValueEdit(clone(tpl.visualBlocks), tpl.code, block.id, 'value', '7');
      expect(res.error, block.id).toBeUndefined();
      expect(res.code).toContain(`${block.params.variable} = 7`);
    }
  });

  it('editing kp in P Control Gyro Turn rewrites only that line', () => {
    const tpl = MISSION_TEMPLATES.tpl_p_gyro_turn;
    const res = applyBlockValueEdit(clone(tpl.visualBlocks), tpl.code, 'pgt-kp', 'value', '0.7');
    expect(res.ok).toBe(true);
    expect(res.code).toBe(tpl.code.replace('kp = 0.5', 'kp = 0.7'));
  });

  it('Basic Gyro Turn stops near the target angle', async () => {
    const { yaw } = await runTemplate(MISSION_TEMPLATES.tpl_basic_gyro_turn.code);
    expect(yaw).toBeGreaterThanOrEqual(84);
    expect(yaw).toBeLessThanOrEqual(100);
  }, 20000);

  it('P Control Gyro Turn settles within tolerance in both directions', async () => {
    const right = await runTemplate(MISSION_TEMPLATES.tpl_p_gyro_turn.code);
    expect(Math.abs(right.yaw - 90)).toBeLessThanOrEqual(4);
    const left = await runTemplate(MISSION_TEMPLATES.tpl_p_gyro_turn.code.replace('target_angle = 90', 'target_angle = -45'));
    expect(Math.abs(left.yaw + 45)).toBeLessThanOrEqual(4);
  }, 30000);

  it.each(['tpl_p_gyro_straight', 'tpl_pid_gyro_straight'])('%s drives forward holding heading 0', async (key) => {
    const { yaw, distance } = await runTemplate(MISSION_TEMPLATES[key].code);
    expect(distance).toBeGreaterThan(0.2);
    expect(Math.abs(yaw)).toBeLessThanOrEqual(3);
  }, 30000);

});
