import { describe, it, expect } from 'vitest';
import { SimulationPhysicsEngine } from '../src/physics/engine';
import { DEFAULT_REALISTIC_PHYSICS, IDEAL_PHYSICS, PhysicsRealismSettings } from '../src/physics/robot-body';

const NO_MISMATCH: PhysicsRealismSettings = { enabled: true, wheelMismatchPct: 0, motorMismatchPct: 0 };

async function createEngine(realism?: PhysicsRealismSettings) {
  const engine = new SimulationPhysicsEngine(realism ? { realism } : {});
  await engine.init();
  for (let i = 0; i < 6; i++) engine.update(1 / 60); // settle onto the mat
  return engine;
}

/** Heading change in SPIKE convention (right turn positive), wrapped to ±180 */
const headingChange = (from: number, to: number) => ((to - from + 540) % 360) - 180;

const step = (engine: SimulationPhysicsEngine, ticks: number) => {
  for (let i = 0; i < ticks; i++) engine.update(1 / 60);
};

function stopDrive(engine: SimulationPhysicsEngine) {
  engine.robot.motors.get('A')!.stop();
  engine.robot.motors.get('B')!.stop();
  engine.robot.brakeChassisAndWheels();
}

/** Spins right in place until the heading passes stopAt, then brakes; returns the settled heading change */
async function turnAndStop(realism: PhysicsRealismSettings | undefined, speed: number, stopAt: number) {
  const engine = await createEngine(realism);
  const yaw0 = engine.robot.getYawDegrees();
  const turned = () => headingChange(yaw0, engine.robot.getYawDegrees());
  engine.robot.motors.get('A')!.start(speed);
  engine.robot.motors.get('B')!.start(-speed);
  for (let i = 0; i < 600 && turned() < stopAt; i++) step(engine, 1);
  stopDrive(engine);
  step(engine, 60);
  return turned();
}

/** Drives straight with equal motor speeds; returns heading change (deg) and distance (cm) */
async function driveStraight(realism: PhysicsRealismSettings | undefined, ticks = 150) {
  const engine = await createEngine(realism);
  const yaw0 = engine.robot.getYawDegrees();
  const p0 = engine.robot.getPosition();
  engine.robot.motors.get('A')!.start(40);
  engine.robot.motors.get('B')!.start(40);
  step(engine, ticks);
  stopDrive(engine);
  step(engine, 60);
  const p1 = engine.robot.getPosition();
  return {
    engine,
    drift: headingChange(yaw0, engine.robot.getYawDegrees()),
    distanceCm: Math.hypot(p1.x - p0.x, p1.z - p0.z) * 100,
  };
}

describe('Physics realism', () => {
  it('engine defaults to ideal physics', async () => {
    const engine = await createEngine();
    expect(engine.robot.realism).toEqual(IDEAL_PHYSICS);
  });

  it('ideal physics stops a turn dead; realistic physics carries momentum past the stop point', async () => {
    const ideal = await turnAndStop(undefined, 30, 85);
    const real = await turnAndStop(NO_MISMATCH, 30, 85);
    expect(ideal - 85).toBeLessThan(2);
    expect(real - 85).toBeGreaterThan(3);
    expect(real - 85).toBeLessThan(15);
  });

  it('a faster turn overshoots more', async () => {
    const slow = await turnAndStop(NO_MISMATCH, 30, 85);
    const fast = await turnAndStop(NO_MISMATCH, 60, 85);
    expect(fast).toBeGreaterThan(slow + 2);
  });

  it('the robot comes to rest after braking', async () => {
    const { engine } = await driveStraight(NO_MISMATCH);
    const v = engine.robot.chassisBody.linvel();
    expect(Math.hypot(v.x, v.z)).toBeLessThan(0.01);
    expect(Math.abs(engine.robot.chassisBody.angvel().y)).toBeLessThan(0.05);
  });

  it('a perfectly matched robot drives straight without the heading lock', async () => {
    const { drift, distanceCm } = await driveStraight(NO_MISMATCH);
    expect(Math.abs(drift)).toBeLessThan(1);
    expect(distanceCm).toBeGreaterThan(40);
  });

  it('a smaller right tire / weaker right motor drifts right; flipping the sign drifts left', async () => {
    const right = await driveStraight(DEFAULT_REALISTIC_PHYSICS);
    const left = await driveStraight({ enabled: true, wheelMismatchPct: -0.5, motorMismatchPct: -1.5 });
    expect(right.drift).toBeGreaterThan(1);
    expect(left.drift).toBeLessThan(-1);
  });

  it('a bigger mismatch drifts more', async () => {
    const small = await driveStraight(DEFAULT_REALISTIC_PHYSICS);
    const big = await driveStraight({ enabled: true, wheelMismatchPct: 2, motorMismatchPct: 4 });
    expect(big.drift).toBeGreaterThan(small.drift * 2);
  });

  it('settings can be changed on a live engine and turned back off', async () => {
    const engine = await createEngine(DEFAULT_REALISTIC_PHYSICS);
    engine.setRealism(IDEAL_PHYSICS);
    expect(engine.robot.realism.enabled).toBe(false);
    engine.resetRobot();
    const yaw0 = engine.robot.getYawDegrees();
    engine.robot.motors.get('A')!.start(40);
    engine.robot.motors.get('B')!.start(40);
    step(engine, 150);
    expect(Math.abs(headingChange(yaw0, engine.robot.getYawDegrees()))).toBeLessThan(0.5);
  });

  it('encoders follow the real wheel rotation, including coasting after stop', async () => {
    const { engine, distanceCm } = await driveStraight(NO_MISMATCH);
    const wheelCm = 2 * Math.PI * engine.robot.wheelRadius * 100;
    const encoderCm = (engine.robot.motors.get('A')!.degrees / 360) * wheelCm;
    expect(Math.abs(encoderCm - distanceCm)).toBeLessThan(distanceCm * 0.05);
  });

  it.each([
    [90, 100],
    [90, 30],
    [720, 50],
  ])('a %i° move at %i%% completes on real wheel travel and settles near the target', async (deg, speed) => {
    const engine = await createEngine(DEFAULT_REALISTIC_PHYSICS);
    const motor = engine.robot.motors.get('A')!;
    let doneAt: number | null = null;
    motor.runForDegrees(deg, speed, () => {
      doneAt = motor.degrees;
    });
    step(engine, 300);
    expect(doneAt).not.toBeNull();
    expect(doneAt!).toBeGreaterThanOrEqual(deg - 1);
    expect(Math.abs(motor.degrees - deg)).toBeLessThan(6);
  });
});
