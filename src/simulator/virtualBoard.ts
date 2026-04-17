import type { RefloatValues } from '../vesc/types';

export const VIRTUAL_BOARD_NAME = 'Virtual Board (Demo)';

const TICK_MS = 100;

type Phase = 'idle' | 'mounting' | 'accelerating' | 'cruising' | 'tiltback' | 'decelerating' | 'fault';

const PHASE_DURATIONS: Record<Phase, number> = {
  idle:         4_000,
  mounting:     2_000,
  accelerating: 5_000,
  cruising:     8_000,
  tiltback:     3_000,
  decelerating: 4_000,
  fault:        3_000,
};

const PHASE_ORDER: Phase[] = [
  'idle', 'mounting', 'accelerating', 'cruising', 'tiltback', 'decelerating', 'fault',
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function approach(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

function jitter(amplitude: number): number {
  return (Math.random() * 2 - 1) * amplitude;
}

function buildValues(
  phase: Phase,
  t: number,
  odometer: number,
  tempMosfet: number,
  tempMotor: number,
): RefloatValues {
  const batteryVoltage = Math.max(58.0, 63.5 - (odometer / 1000) * 0.8);

  const base: RefloatValues = {
    hasFault: false, faultCode: 0,
    pitch: 0, roll: 0, balancePitch: 0, balanceCurrent: 0,
    speed: 0, erpm: 0, dutyCycle: 0,
    batteryVoltage, motorCurrent: 0, batteryCurrent: 0,
    state: 0, switchState: 0, adc1: 0, adc2: 0,
    odometer, tempMosfet, tempMotor,
  };

  switch (phase) {
    case 'idle':
      return { ...base, state: 0x00 };

    case 'mounting': {
      const adc = lerp(0, 0.85, t);
      const state = t > 0.5 ? 0x01 : 0x00;
      return {
        ...base,
        state,
        switchState: t > 0.5 ? 3 : 0,
        adc1: adc, adc2: adc,
      };
    }

    case 'accelerating': {
      const speed = lerp(0, 22, t) + jitter(0.3);
      const dutyCycle = lerp(0, 0.35, t);
      const motorCurrent = lerp(0, 18, t) + jitter(1);
      const batteryCurrent = lerp(0, 8, t) + jitter(0.5);
      const pitch = lerp(0, -4.5, t) + jitter(0.2);
      const erpm = (speed / 3.6) * 30 * 60;
      return {
        ...base,
        state: 0x01, switchState: 3, adc1: 0.85, adc2: 0.85,
        speed, erpm, dutyCycle, motorCurrent, batteryCurrent,
        pitch, balancePitch: pitch, balanceCurrent: motorCurrent * 0.6,
      };
    }

    case 'cruising': {
      const speed = 20 + jitter(1.5);
      const dutyCycle = 0.30 + jitter(0.03);
      const motorCurrent = 6 + jitter(2);
      const batteryCurrent = 3 + jitter(1);
      const pitch = -1.5 + jitter(0.5);
      const erpm = (speed / 3.6) * 30 * 60;
      return {
        ...base,
        state: 0x01, switchState: 3, adc1: 0.85, adc2: 0.85,
        speed, erpm, dutyCycle, motorCurrent, batteryCurrent,
        pitch, balancePitch: pitch, balanceCurrent: motorCurrent * 0.6,
      };
    }

    case 'tiltback': {
      const speed = lerp(22, 15, t) + jitter(0.5);
      const dutyCycle = lerp(0.35, 0.20, t);
      const motorCurrent = lerp(18, 8, t) + jitter(1);
      const pitch = lerp(-4.5, 3.5, t) + jitter(0.3);
      const erpm = (speed / 3.6) * 30 * 60;
      return {
        ...base,
        state: 0x02, switchState: 3, adc1: 0.85, adc2: 0.85,
        speed, erpm, dutyCycle, motorCurrent,
        batteryCurrent: motorCurrent * 0.4,
        pitch, balancePitch: pitch, balanceCurrent: motorCurrent * 0.6,
      };
    }

    case 'decelerating': {
      const speed = lerp(15, 0, t) + jitter(0.2);
      const dutyCycle = lerp(0.20, 0, t);
      const motorCurrent = lerp(8, 0, t) + jitter(0.5);
      const pitch = lerp(3.5, 0, t) + jitter(0.2);
      const erpm = (speed / 3.6) * 30 * 60;
      return {
        ...base,
        state: 0x01, switchState: 3, adc1: 0.85, adc2: lerp(0.85, 0, t),
        speed, erpm, dutyCycle, motorCurrent,
        batteryCurrent: motorCurrent * 0.3,
        pitch, balancePitch: pitch, balanceCurrent: motorCurrent * 0.6,
      };
    }

    case 'fault':
      return {
        ...base,
        hasFault: true,
        faultCode: 11, // ENCODER_SPI
        state: 0x00, switchState: 0,
        adc1: 0, adc2: 0,
      };
  }
}

/**
 * Starts the virtual board simulation loop.
 * @returns Cleanup function — call it to stop the simulation.
 */
export function startVirtualSimulation(
  onTick: (values: RefloatValues, latency: number) => void,
): () => void {
  let phaseIndex = 0;
  let phaseStartTime = Date.now();
  let odometer = 0;
  let tempMosfet = 30;
  let tempMotor = 30;

  const handle = setInterval(() => {
    const now = Date.now();
    const phase = PHASE_ORDER[phaseIndex]!;
    const duration = PHASE_DURATIONS[phase];
    const elapsed = now - phaseStartTime;
    const t = Math.min(elapsed / duration, 1);

    if (elapsed >= duration) {
      phaseIndex = (phaseIndex + 1) % PHASE_ORDER.length;
      phaseStartTime = now;
    }

    const values = buildValues(phase, t, odometer, tempMosfet, tempMotor);

    odometer += (Math.abs(values.speed) / 3.6) * (TICK_MS / 1000);

    const isRiding = phase === 'accelerating' || phase === 'cruising'
                  || phase === 'tiltback'     || phase === 'decelerating';
    if (isRiding) {
      tempMosfet = approach(tempMosfet, 65, 0.02);
      tempMotor  = approach(tempMotor,  55, 0.02);
    } else {
      tempMosfet = approach(tempMosfet, 30, 0.01);
      tempMotor  = approach(tempMotor,  30, 0.01);
    }

    const latency = 30 + Math.floor(Math.random() * 30);
    onTick(values, latency);
  }, TICK_MS);

  return () => clearInterval(handle);
}
