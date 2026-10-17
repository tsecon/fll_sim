import type { VisualBlock } from '../runtime/spike-scratch-importer';

/**
 * Gyro control mission templates from the 2026 FLL Advanced Coding Camp (FRC 9023).
 *
 * Each template keeps its My Block inputs (Target Angle, Speed, Degrees, gains) as
 * variables at the top so they can be edited directly in Word Blocks. Every block's
 * Python statement (see word-block-values.ts) appears verbatim in the code, which is
 * what lets block edits rewrite the code; comments therefore sit on their own lines.
 */
export interface MissionTemplate {
  title: string;
  code: string;
  visualBlocks: VisualBlock[];
}

const COLOR = {
  event: '#eab308',
  movement: '#0284c7',
  motor: '#06b6d4',
  sensor: '#a855f7',
  control: '#f97316',
  variable: '#ea580c',
};

const programStart = (id: string): VisualBlock => ({
  id,
  opcode: 'event_whenprogramstarts',
  category: 'event',
  icon: '🚩',
  label: 'When Program Starts',
  params: {},
  colorHex: COLOR.event,
});

const movementPair = (id: string): VisualBlock => ({
  id,
  opcode: 'flippermove_setMovementPair',
  category: 'movement',
  icon: '🚗',
  label: 'Set movement motors to [A+B]',
  params: { left: 'A', right: 'B' },
  colorHex: COLOR.movement,
});

const resetYaw = (id: string): VisualBlock => ({
  id,
  opcode: 'flippersensors_resetYaw',
  category: 'sensor',
  icon: '🧭',
  label: 'Reset Yaw angle to 0°',
  params: {},
  colorHex: COLOR.sensor,
});

const resetDegrees = (id: string, port: string): VisualBlock => ({
  id,
  opcode: 'flippermoremotor_motorSetDegreeCounted',
  category: 'motor',
  icon: '🔢',
  label: `Set relative position of [Port ${port}] to [0]`,
  params: { port, value: '0' },
  colorHex: COLOR.motor,
});

/** `label` is shown when `value` is an expression (numbers get an editable label) */
const setVar = (id: string, variable: string, value: string, label?: string): VisualBlock => ({
  id,
  opcode: 'data_setvariableto',
  category: 'variable',
  icon: '📦',
  label: label ?? `Set [${variable}] to [${value}]`,
  params: { variable, value },
  colorHex: COLOR.variable,
});

const changeVar = (id: string, variable: string, value: string): VisualBlock => ({
  id,
  opcode: 'data_changevariableby',
  category: 'variable',
  icon: '📦',
  label: `Change [${variable}] by [${value}]`,
  params: { variable, value },
  colorHex: COLOR.variable,
});

const tank = (id: string, left: string, right: string): VisualBlock => ({
  id,
  opcode: 'flippermoremove_startDualSpeed',
  category: 'movement',
  icon: '🎛️',
  label: `Start moving tank Left: [${left}%], Right: [${right}%]`,
  params: { left, right },
  colorHex: COLOR.movement,
});

const steer = (id: string): VisualBlock => ({
  id,
  opcode: 'flippermove_startSteer',
  category: 'movement',
  icon: '🔄',
  label: 'Start steering [steering] at [speed%]',
  params: { steering: 'steering', speed: 'speed' },
  colorHex: COLOR.movement,
});

const stopMoving = (id: string): VisualBlock => ({
  id,
  opcode: 'flippermove_stopMove',
  category: 'movement',
  icon: '⏹️',
  label: 'Stop moving',
  params: {},
  colorHex: COLOR.movement,
});

const wait = (id: string, duration: string): VisualBlock => ({
  id,
  opcode: 'control_wait',
  category: 'control',
  icon: '⏳',
  label: `Wait [${duration}] seconds`,
  params: { duration },
  colorHex: COLOR.control,
});

const waitUntil = (id: string, condition: string, conditionPy: string): VisualBlock => ({
  id,
  opcode: 'control_wait_until',
  category: 'control',
  icon: '⏳',
  label: `Wait until <${condition}>`,
  params: { condition, conditionPy },
  colorHex: COLOR.control,
});

const repeatUntil = (id: string, condition: string, conditionPy: string, children: VisualBlock[]): VisualBlock => ({
  id,
  opcode: 'control_repeat_until',
  category: 'control',
  icon: '🔁',
  label: `Repeat until <${condition}>`,
  params: { condition, conditionPy },
  colorHex: COLOR.control,
  children,
});

const ifThen = (id: string, condition: string, conditionPy: string, children: VisualBlock[]): VisualBlock => ({
  id,
  opcode: 'control_if',
  category: 'control',
  icon: '❓',
  label: `If <${condition}> then`,
  params: { condition, conditionPy },
  colorHex: COLOR.control,
  children,
});

const AVERAGE_DEGREES = '(abs(motor_a.get_degrees_counted()) + abs(motor_b.get_degrees_counted())) / 2';
const HEADING_ERROR = 'target_angle - hub.motion_sensor.get_yaw_angle()';

export const MISSION_TEMPLATES: Record<string, MissionTemplate> = {
  tpl_basic_gyro_turn: {
    title: 'Basic Gyro Turn',
    code: `from spike import PrimeHub, MotorPair
from spike.control import wait_for_seconds

hub = PrimeHub()
motors = MotorPair('A', 'B')

# My Block: Basic Gyro Turn Rate(Target Angle)
# Constant-speed right turn that stops 'overshoot' degrees early,
# letting inertia carry the robot the rest of the way.
target_angle = 90
overshoot = 5
turn_speed = 30

hub.motion_sensor.reset_yaw_angle()
adjusted_target = target_angle - overshoot
print("Basic Gyro Turn: target", target_angle, "deg, stopping at", adjusted_target)

# Left and right wheels spin in opposite directions
motors.start_tank(turn_speed, -turn_speed)
while not (hub.motion_sensor.get_yaw_angle() >= adjusted_target):
    wait_for_seconds(0.01)
motors.stop()

wait_for_seconds(0.5)
print("Final heading:", hub.motion_sensor.get_yaw_angle(), "deg")
`,
    visualBlocks: [
      programStart('bgt-hat'),
      movementPair('bgt-pair'),
      setVar('bgt-target', 'target_angle', '90'),
      setVar('bgt-overshoot', 'overshoot', '5'),
      setVar('bgt-speed', 'turn_speed', '30'),
      resetYaw('bgt-reset-yaw'),
      setVar('bgt-adjusted', 'adjusted_target', 'target_angle - overshoot', 'Set [adjusted_target] to [target_angle − overshoot]'),
      tank('bgt-tank', 'turn_speed', '-turn_speed'),
      waitUntil('bgt-wait-until', 'Yaw Angle ≥ adjusted_target', 'hub.motion_sensor.get_yaw_angle() >= adjusted_target'),
      stopMoving('bgt-stop'),
      wait('bgt-settle', '0.5'),
    ],
  },

  tpl_p_gyro_turn: {
    title: 'P Control Gyro Turn',
    code: `from spike import PrimeHub, MotorPair
from spike.control import wait_for_seconds

hub = PrimeHub()
motors = MotorPair('A', 'B')

# My Block: P Control Gyro Turn(Target Angle)
# Decelerating turn: speed = kp * error, so the robot slows down near the target.
# Positive target_angle turns right, negative turns left.
target_angle = 90
kp = 0.5
min_speed = 5
tolerance = 2

hub.motion_sensor.reset_yaw_angle()
error = target_angle - hub.motion_sensor.get_yaw_angle()

# Repeat until |error| <= tolerance (stops hunting back and forth)
while not (abs(error) <= tolerance):
    error = target_angle - hub.motion_sensor.get_yaw_angle()
    speed = error * kp
    # Lower bound clamp: too little power cannot move the robot
    if abs(speed) < min_speed:
        speed = min_speed if error > 0 else -min_speed
    motors.start_tank(speed, -speed)
    wait_for_seconds(0.01)
motors.stop()

wait_for_seconds(0.5)
print("Final heading:", hub.motion_sensor.get_yaw_angle(), "deg")
`,
    visualBlocks: [
      programStart('pgt-hat'),
      movementPair('pgt-pair'),
      setVar('pgt-target', 'target_angle', '90'),
      setVar('pgt-kp', 'kp', '0.5'),
      setVar('pgt-min', 'min_speed', '5'),
      setVar('pgt-tol', 'tolerance', '2'),
      resetYaw('pgt-reset-yaw'),
      setVar('pgt-error-init', 'error', HEADING_ERROR, 'Set [error] to [target_angle − Yaw Angle]'),
      repeatUntil('pgt-loop', '|error| ≤ tolerance', 'abs(error) <= tolerance', [
        setVar('pgt-error', 'error', HEADING_ERROR, 'Set [error] to [target_angle − Yaw Angle]'),
        setVar('pgt-p', 'speed', 'error * kp', 'Set [speed] to [error × kp]'),
        ifThen('pgt-clamp', '|speed| < min_speed', 'abs(speed) < min_speed', [
          setVar('pgt-clamp-set', 'speed', 'min_speed if error > 0 else -min_speed', 'Set [speed] to [±min_speed (sign of error)]'),
        ]),
        tank('pgt-tank', 'speed', '-speed'),
        wait('pgt-tick', '0.01'),
      ]),
      stopMoving('pgt-stop'),
      wait('pgt-settle', '0.5'),
    ],
  },

  tpl_p_gyro_straight: {
    title: 'P Control Gyro Straight',
    code: `from spike import PrimeHub, MotorPair, Motor
from spike.control import wait_for_seconds

hub = PrimeHub()
motors = MotorPair('A', 'B')
motor_a = Motor('A')
motor_b = Motor('B')

# My Block: P Control Gyro Straight(Speed, Degrees)
# Holds heading 0 while driving: steering = error * kp.
# Tune kp between 0.5 and 0.8: too high snakes left/right, too low drifts.
speed = 40
degrees = 1000
kp = 0.8
target_angle = 0

motor_a.set_degrees_counted(0)
motor_b.set_degrees_counted(0)
hub.motion_sensor.reset_yaw_angle()
average_degrees = 0

while not (average_degrees >= degrees):
    average_degrees = ${AVERAGE_DEGREES}
    error = ${HEADING_ERROR}
    steering = error * kp
    motors.start(steering, speed)
    wait_for_seconds(0.01)
motors.stop()

print("Drove", average_degrees, "deg, final heading:", hub.motion_sensor.get_yaw_angle(), "deg")
`,
    visualBlocks: [
      programStart('pgs-hat'),
      movementPair('pgs-pair'),
      setVar('pgs-speed', 'speed', '40'),
      setVar('pgs-degrees', 'degrees', '1000'),
      setVar('pgs-kp', 'kp', '0.8'),
      setVar('pgs-target', 'target_angle', '0'),
      resetDegrees('pgs-reset-a', 'A'),
      resetDegrees('pgs-reset-b', 'B'),
      resetYaw('pgs-reset-yaw'),
      setVar('pgs-avg-init', 'average_degrees', '0'),
      repeatUntil('pgs-loop', 'average_degrees ≥ degrees', 'average_degrees >= degrees', [
        setVar('pgs-avg', 'average_degrees', AVERAGE_DEGREES, 'Set [average_degrees] to [(|A| + |B|) ÷ 2]'),
        setVar('pgs-error', 'error', HEADING_ERROR, 'Set [error] to [target_angle − Yaw Angle]'),
        setVar('pgs-p', 'steering', 'error * kp', 'Set [steering] to [error × kp]'),
        steer('pgs-steer'),
        wait('pgs-tick', '0.01'),
      ]),
      stopMoving('pgs-stop'),
    ],
  },

  tpl_pid_gyro_straight: {
    title: 'PID Control Gyro Straight',
    code: `from spike import PrimeHub, MotorPair, Motor
from spike.control import wait_for_seconds

hub = PrimeHub()
motors = MotorPair('A', 'B')
motor_a = Motor('A')
motor_b = Motor('B')

# My Block: PID Control Gyro Straight(Speed, Degrees)
# P reacts to the current error, I corrects steady drift (uneven weight, worn motor),
# D damps sudden heading changes. P alone is usually enough in FLL.
speed = 40
degrees = 1500
kp = 0.8
ki = 0.02
kd = 0.35
integral_cap = 100
target_angle = 0

motor_a.set_degrees_counted(0)
motor_b.set_degrees_counted(0)
hub.motion_sensor.reset_yaw_angle()
integral = 0
last_error = 0
average_degrees = 0

while not (average_degrees >= degrees):
    average_degrees = ${AVERAGE_DEGREES}
    error = ${HEADING_ERROR}
    integral += error
    # Integral windup guard (e.g. wheels spinning against a wall)
    if abs(integral) > integral_cap:
        integral = integral_cap if integral > 0 else -integral_cap
    derivative = error - last_error
    steering = (error * kp) + (integral * ki) + (derivative * kd)
    motors.start(steering, speed)
    # Must update last_error at the end of every loop, or D stops working
    last_error = error
    wait_for_seconds(0.01)
motors.stop()

print("Drove", average_degrees, "deg, final heading:", hub.motion_sensor.get_yaw_angle(), "deg")
`,
    visualBlocks: [
      programStart('pid-hat'),
      movementPair('pid-pair'),
      setVar('pid-speed', 'speed', '40'),
      setVar('pid-degrees', 'degrees', '1500'),
      setVar('pid-kp', 'kp', '0.8'),
      setVar('pid-ki', 'ki', '0.02'),
      setVar('pid-kd', 'kd', '0.35'),
      setVar('pid-cap', 'integral_cap', '100'),
      setVar('pid-target', 'target_angle', '0'),
      resetDegrees('pid-reset-a', 'A'),
      resetDegrees('pid-reset-b', 'B'),
      resetYaw('pid-reset-yaw'),
      setVar('pid-integral-init', 'integral', '0'),
      setVar('pid-last-init', 'last_error', '0'),
      setVar('pid-avg-init', 'average_degrees', '0'),
      repeatUntil('pid-loop', 'average_degrees ≥ degrees', 'average_degrees >= degrees', [
        setVar('pid-avg', 'average_degrees', AVERAGE_DEGREES, 'Set [average_degrees] to [(|A| + |B|) ÷ 2]'),
        setVar('pid-error', 'error', HEADING_ERROR, 'Set [error] to [target_angle − Yaw Angle]'),
        changeVar('pid-integral', 'integral', 'error'),
        ifThen('pid-windup', '|integral| > integral_cap', 'abs(integral) > integral_cap', [
          setVar('pid-windup-set', 'integral', 'integral_cap if integral > 0 else -integral_cap', 'Set [integral] to [±integral_cap]'),
        ]),
        setVar('pid-derivative', 'derivative', 'error - last_error', 'Set [derivative] to [error − last_error]'),
        setVar('pid-steering', 'steering', '(error * kp) + (integral * ki) + (derivative * kd)', 'Set [steering] to [error×kp + integral×ki + derivative×kd]'),
        steer('pid-steer'),
        setVar('pid-last', 'last_error', 'error'),
        wait('pid-tick', '0.01'),
      ]),
      stopMoving('pid-stop'),
    ],
  },
};
