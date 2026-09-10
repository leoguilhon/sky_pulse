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
  positionStarted: number;
  telemetryStarted: number;
}

const observationTime = (position: AircraftPosition) =>
  Date.parse(position.lastUpdated);

const positionTime = (position: AircraftPosition) =>
  Date.parse(position.positionUpdatedAt ?? position.lastUpdated);

const interpolateValue = (
  from: number | null,
  to: number | null,
  progress: number,
) => (from === null || to === null ? to : from + (to - from) * progress);

function retainReportedState(
  reported: AircraftPosition,
  previous: AircraftPosition,
) {
  return {
    ...reported,
    latitude: previous.latitude,
    longitude: previous.longitude,
    altitudeMeters: previous.altitudeMeters,
    speedMetersPerSecond: previous.speedMetersPerSecond,
    headingDegrees: previous.headingDegrees,
    verticalRateMetersPerSecond: previous.verticalRateMetersPerSecond,
    onGround: previous.onGround,
    positionUpdatedAt: previous.positionUpdatedAt,
    lastUpdated: previous.lastUpdated,
  };
}

// Interpolate only reported positions. Never extrapolate a cached observation.
export class AircraftMotion {
  private tracks = new Map<string, Track>();

  update(aircraft: AircraftPosition[], now: number, reducedMotion = false) {
    const current = new Map(this.sample(now).map((p) => [p.id, p]));
    const next = new Map<string, Track>();
    for (const position of freshAircraft(aircraft, now)) {
      const previous = this.tracks.get(position.id);
      const timestamp = observationTime(position);
      if (previous && timestamp <= observationTime(previous.to)) {
        // Catalog metadata may change on a cached response, but reported flight
        // data must not restart a transition or rewind to an older observation.
        next.set(position.id, {
          ...previous,
          to:
            timestamp === observationTime(previous.to)
              ? retainReportedState(position, previous.to)
              : previous.to,
        });
        continue;
      }
      if (!previous) {
        next.set(position.id, {
          from: position,
          to: position,
          positionStarted: now,
          telemetryStarted: now,
        });
        continue;
      }
      const displayed = current.get(position.id) ?? position;
      const hasNewPosition = positionTime(position) > positionTime(previous.to);
      next.set(position.id, {
        from: reducedMotion
          ? position
          : {
              ...displayed,
              latitude: hasNewPosition
                ? displayed.latitude
                : previous.from.latitude,
              longitude: hasNewPosition
                ? displayed.longitude
                : previous.from.longitude,
            },
        to: hasNewPosition
          ? position
          : {
              ...position,
              latitude: previous.to.latitude,
              longitude: previous.to.longitude,
              positionUpdatedAt: previous.to.positionUpdatedAt,
            },
        positionStarted: hasNewPosition ? now : previous.positionStarted,
        telemetryStarted: now,
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
      const positionProgress = reducedMotion
        ? 1
        : Math.max(
            0,
            Math.min(1, (now - track.positionStarted) / TRANSITION_MS),
          );
      const telemetryProgress = reducedMotion
        ? 1
        : Math.max(
            0,
            Math.min(1, (now - track.telemetryStarted) / TRANSITION_MS),
          );
      const { from, to } = track;
      result.push({
        ...to,
        latitude:
          from.latitude + (to.latitude - from.latitude) * positionProgress,
        longitude:
          ((from.longitude +
            angleDelta(from.longitude, to.longitude) * positionProgress +
            540) %
            360) -
          180,
        altitudeMeters: interpolateValue(
          from.altitudeMeters,
          to.altitudeMeters,
          telemetryProgress,
        ),
        speedMetersPerSecond: interpolateValue(
          from.speedMetersPerSecond,
          to.speedMetersPerSecond,
          telemetryProgress,
        ),
        headingDegrees:
          from.headingDegrees === null || to.headingDegrees === null
            ? to.headingDegrees
            : (from.headingDegrees +
                angleDelta(from.headingDegrees, to.headingDegrees) *
                  telemetryProgress +
                360) %
              360,
        verticalRateMetersPerSecond: interpolateValue(
          from.verticalRateMetersPerSecond,
          to.verticalRateMetersPerSecond,
          telemetryProgress,
        ),
      });
    }
    return result;
  }

  isMoving(now: number) {
    return [...this.tracks.values()].some(
      ({ positionStarted, telemetryStarted, from, to }) =>
        (now < positionStarted + TRANSITION_MS &&
          (from.latitude !== to.latitude || from.longitude !== to.longitude)) ||
        (now < telemetryStarted + TRANSITION_MS &&
          (from.altitudeMeters !== to.altitudeMeters ||
            from.speedMetersPerSecond !== to.speedMetersPerSecond ||
            from.headingDegrees !== to.headingDegrees ||
            from.verticalRateMetersPerSecond !==
              to.verticalRateMetersPerSecond)),
    );
  }
}
