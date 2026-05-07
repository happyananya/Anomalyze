import axios from "axios";
import type {
  AnomalyMetrics,
  AnomalyRecordsResponse,
  ComponentData,
  ErrorRatePoint,
  HeatmapData,
  OverviewData,
  RawLogsResponse,
  SpikePoint,
  TimelinePoint,
  TimeseriesPoint,
} from "../types";

const api = axios.create({ baseURL: "/api" });

export async function fetchOverview(): Promise<OverviewData> {
  const { data } = await api.get("/overview");
  return data;
}

export async function fetchTimeseries(): Promise<TimeseriesPoint[]> {
  const { data } = await api.get("/logs/timeseries");
  return data;
}

export async function fetchErrorRate(): Promise<ErrorRatePoint[]> {
  const { data } = await api.get("/logs/error-rate");
  return data;
}

export async function fetchComponents(): Promise<ComponentData[]> {
  const { data } = await api.get("/logs/components");
  return data;
}

export async function fetchHeatmap(): Promise<HeatmapData> {
  const { data } = await api.get("/logs/heatmap");
  return data;
}

export async function fetchRawLogs(
  textFilter: string,
  limit: number,
  offset: number
): Promise<RawLogsResponse> {
  const { data } = await api.get("/logs/raw", {
    params: {
      text_filter: textFilter || undefined,
      limit,
      offset,
    },
  });
  return data;
}

export async function fetchAnomalyMetrics(): Promise<AnomalyMetrics> {
  const { data } = await api.get("/anomalies/metrics");
  return data;
}

export async function fetchAnomalyTimeline(): Promise<TimelinePoint[]> {
  const { data } = await api.get("/anomalies/timeline");
  return data;
}

export async function fetchSpikes(): Promise<SpikePoint[]> {
  const { data } = await api.get("/anomalies/spikes");
  return data;
}

export async function fetchAnomalyRecords(
  limit: number,
  offset: number
): Promise<AnomalyRecordsResponse> {
  const { data } = await api.get("/anomalies/records", {
    params: { limit, offset },
  });
  return data;
}
