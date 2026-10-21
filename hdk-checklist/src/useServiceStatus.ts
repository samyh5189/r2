import { useEffect, useState } from "react";
import type { InspectionLog, ServiceSettings } from "./types";
import { getLogs, getServiceSettings } from "./storage";
import { serviceStatus, type ServiceStatus } from "./service";

/** Engine service status; loads the logs itself unless they're passed in (null = still loading) */
export function useServiceStatus(logs?: InspectionLog[] | null): ServiceStatus | null {
  const [settings, setSettings] = useState<ServiceSettings | null>(null);
  const [ownLogs, setOwnLogs] = useState<InspectionLog[] | null>(null);
  useEffect(() => { getServiceSettings().then(setSettings); }, []);
  useEffect(() => { if (logs === undefined) getLogs().then(setOwnLogs); }, [logs]);
  const all = logs ?? ownLogs;
  return settings && all ? serviceStatus(all, settings) : null;
}
