import { Runner } from './engine';

const map = new Map<string, Runner>();

export function register(run: Runner) {
  map.set(run.run_id, run);
}

export function get(run_id: string): Runner | undefined {
  return map.get(run_id);
}

export function stop(run_id: string): boolean {
  const r = map.get(run_id);
  if (!r) return false;
  r.stop();
  map.delete(run_id);
  return true;
}

export function list(): string[] {
  return Array.from(map.keys());
}

