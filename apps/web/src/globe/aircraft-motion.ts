import type { AircraftPosition } from "../aircraft";

export const POSITION_TTL_MS = 10 * 60 * 1000;
export const TRANSITION_MS = 30000;

export function freshAircraft(aircraft: AircraftPosition[], now: number) {
  return aircraft.filter((position) => {
    const age = now - Date.parse(position.lastUpdated);
    return Number.isFinite(age) && age >= -60000 && age < POSITION_TTL_MS;
  });
}

function angleDelta(from: number, to: number) {
  return ((((to - from + 180) % 360) + 360) % 360) - 180;
}

interface Track {
  from: AircraftPosition;
  to: AircraftPosition;
  started: number;
}

// Interpolate only reported positions. Never extrapolate a cached observation.
export class AircraftMotion {
  private tracks = new Map<string, Track>();

  update(aircraft: AircraftPosition[], now: number, reducedMotion = false) {
    const current = new Map(this.sample(now).map((p) => [p.id, p]));
    const next = new Map<string, Track>();
    for (const position of freshAircraft(aircraft, now)) {
      const previous = this.tracks.get(position.id);
      const timestamp = Date.parse(position.lastUpdated);
      if (previous && timestamp <= Date.parse(previous.to.lastUpdated)) {
        // Cached metadata may change, but must not restart movement or rewind it.
        next.set(position.id, {
          ...previous,
          to:
            timestamp === Date.parse(previous.to.lastUpdated)
              ? {
                  ...position,
                  latitude: previous.to.latitude,
                  longitude: previous.to.longitude,
                  headingDegrees: previous.to.headingDegrees,
                }
              : previous.to,
        });
        continue;
      }
      next.set(position.id, {
        from: reducedMotion ? position : (current.get(position.id) ?? position),
        to: position,
        started: now,
      });
    }
    this.tracks = next;
  }

  sample(now: number, reducedMotion = false): AircraftPosition[] {
    const result: AircraftPosition[] = [];
    for (const [id, track] of this.tracks) {
      if (!freshAircraft([track.to], now).length) {
        this.tracks.delete(id);
        continue;
      }
      const t = reducedMotion
        ? 1
        : Math.max(0, Math.min(1, (now - track.started) / TRANSITION_MS));
      const { from, to } = track;
      result.push({
        ...to,
        latitude: from.latitude + (to.latitude - from.latitude) * t,
        longitude:
          ((from.longitude +
            angleDelta(from.longitude, to.longitude) * t +
            540) %
            360) -
          180,
        headingDegrees:
          from.headingDegrees === null || to.headingDegrees === null
            ? to.headingDegrees
            : (from.headingDegrees +
                angleDelta(from.headingDegrees, to.headingDegrees) * t +
                360) %
              360,
      });
    }
    return result;
  }

  isMoving(now: number) {
    return [...this.tracks.values()].some(
      ({ started, from, to }) =>
        now < started + TRANSITION_MS &&
        (from.latitude !== to.latitude ||
          from.longitude !== to.longitude ||
          from.headingDegrees !== to.headingDegrees),
    );
  }
}
