import { useEffect, useState } from "react";
import type { ServiceSettings } from "./types";
import { getOverview, getServiceSettings } from "./storage";
import { serviceStatus, toReadings, type HoursReading, type ServiceStatus } from "./service";

/** Engine service status; loads the engine hours itself unless they're passed in (null = still loading) */
export function useServiceStatus(readings?: HoursReading[] | null): ServiceStatus | null {
  const [settings, setSettings] = useState<ServiceSettings | null>(null);
  const [own, setOwn] = useState<HoursReading[] | null>(null);
  useEffect(() => { getServiceSettings().then(setSettings); }, []);
  useEffect(() => { if (readings === undefined) getOverview().then((o) => setOwn(toReadings(o.engine))); }, [readings]);
  const all = readings ?? own;
  return settings && all ? serviceStatus(all, settings) : null;
}
