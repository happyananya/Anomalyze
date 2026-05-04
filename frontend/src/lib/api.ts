import axios from "axios";
import type {
  AnomalyMetrics,
  AnomalyRecordsResponse,
  ComponentData,
  ErrorRatePoint,
  FilterOptions,
  FiltersState,
  HeatmapData,
  OverviewData,
  RawLogsResponse,
  SpikePoint,
  TimelinePoint,
  TimeseriesPoint,
} from "../types";

const api = axios.create({ baseURL: "/api" });

function logsParams(f: FiltersState) {
  return {
    start_date: f.startDate || undefined,
    end_date: f.endDate || undefined,
    levels: f.levels.length ? f.levels.join(",") : undefined,
    components: f.components.length ? f.components.join(",") : undefined,
    granularity: f.granularity,
  };
}

function anomalyParams(f: FiltersState) {
  return {
    methods: f.methods.length ? f.methods.join(",") : undefined,
    block_search: f.blockSearch || undefined,
  };
}

export async function fetchFilters(): Promise<FilterOptions> {
  const { data } = await api.get("/filters");
  return data;
}

export async function fetchOverview(f: FiltersState): Promise<OverviewData> {
  const { data } = await api.get("/overview", {
    params: { ...logsParams(f), ...anomalyParams(f) },
  });
  return data;
}

export async function fetchTimeseries(f: FiltersState): Promise<TimeseriesPoint[]> {
  const { data } = await api.get("/logs/timeseries", { params: logsParams(f) });
  return data;
}

export async function fetchErrorRate(f: FiltersState): Promise<ErrorRatePoint[]> {
  const { data } = await api.get("/logs/error-rate", { params: logsParams(f) });
  return data;
}

export async function fetchComponents(f: FiltersState): Promise<ComponentData[]> {
  const { data } = await api.get("/logs/components", { params: logsParams(f) });
  return data;
}

export async function fetchHeatmap(f: FiltersState): Promise<HeatmapData> {
  const { data } = await api.get("/logs/heatmap", { params: logsParams(f) });
  return data;
}

export async function fetchRawLogs(
  f: FiltersState,
  textFilter: string,
  limit: number,
  offset: number
): Promise<RawLogsResponse> {
  const { data } = await api.get("/logs/raw", {
    params: {
      ...logsParams(f),
      text_filter: textFilter || undefined,
      limit,
      offset,
    },
  });
  return data;
}

export async function fetchAnomalyMetrics(f: FiltersState): Promise<AnomalyMetrics> {
  const { data } = await api.get("/anomalies/metrics", { params: anomalyParams(f) });
  return data;
}

export async function fetchAnomalyTimeline(f: FiltersState): Promise<TimelinePoint[]> {
  const { data } = await api.get("/anomalies/timeline", { params: anomalyParams(f) });
  return data;
}

export async function fetchSpikes(): Promise<SpikePoint[]> {
  const { data } = await api.get("/anomalies/spikes");
  return data;
}

export async function fetchAnomalyRecords(
  f: FiltersState,
  limit: number,
  offset: number
): Promise<AnomalyRecordsResponse> {
  const { data } = await api.get("/anomalies/records", {
    params: { ...anomalyParams(f), limit, offset },
  });
  return data;
}
