import "server-only";

import os from "node:os";
import type { TeamHostStatusSnapshot } from "@/lib/team/status";

type CpuSample = {
  idle: number;
  total: number;
};

let previousCpuSample: CpuSample | null = null;

const roundToTenths = (value: number): number => {
  return Math.round(value * 10) / 10;
};

const readCpuSample = (): CpuSample => {
  return os.cpus().reduce<CpuSample>(
    (sample, cpu) => {
      const total =
        cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;

      sample.idle += cpu.times.idle;
      sample.total += total;

      return sample;
    },
    {
      idle: 0,
      total: 0,
    },
  );
};

const sampleCpuPercent = (): number | null => {
  const currentCpuSample = readCpuSample();
  const lastCpuSample = previousCpuSample;

  previousCpuSample = currentCpuSample;

  if (!lastCpuSample) {
    return null;
  }

  const totalDelta = currentCpuSample.total - lastCpuSample.total;
  const idleDelta = currentCpuSample.idle - lastCpuSample.idle;

  if (totalDelta <= 0) {
    return null;
  }

  const activeDelta = Math.max(totalDelta - idleDelta, 0);
  return roundToTenths((activeDelta / totalDelta) * 100);
};

export const getTeamHostStatusSnapshot = (): TeamHostStatusSnapshot => {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;

  return {
    cpuPercent: sampleCpuPercent(),
    memoryPercent: roundToTenths((usedMemoryBytes / totalMemoryBytes) * 100),
    usedMemoryBytes,
    freeMemoryBytes,
    totalMemoryBytes,
  };
};
