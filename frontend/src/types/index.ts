export interface FilterOptions {
  date_range: { min: string | null; max: string | null };
  levels: string[];
  components: string[];
  methods: string[];
}

export interface FiltersState {
  startDate: string;
  endDate: string;
  levels: string[];
  components: string[];
  methods: string[];
  blockSearch: string;
  granularity: "1min" | "5min" | "15min" | "1h";
  autoRefresh: boolean;
}

export interface OverviewData {
  total_logs: number;
  error_logs: number;
  total_anomalies: number;
  if_anomalies: number;
}

export interface TimeseriesPoint {
  time: string;
  [level: string]: string | number;
}

export interface ErrorRatePoint {
  time: string;
  error_rate: number;
}

export interface ComponentData {
  component: string;
  total: number;
  [level: string]: string | number;
}

export interface HeatmapData {
  components: string[];
  hours: number[];
  values: number[][];
}

export interface RawLogItem {
  ts: string;
  level: string;
  component: string;
  block_id: string | null;
}

export interface RawLogsResponse {
  total: number;
  items: RawLogItem[];
}

export interface AnomalyMetrics {
  has_data: boolean;
  has_labels?: boolean;
  has_full_metrics?: boolean;
  detected?: number;
  tp?: number;
  fp?: number;
  fn?: number;
  tn?: number;
  precision?: number;
  recall?: number;
  f1?: number;
  confusion_matrix?: [[number, number], [number, number]];
  method_counts?: Record<string, number>;
}

export interface TimelinePoint {
  time: string;
  "True Positive"?: number;
  "False Positive"?: number;
  [key: string]: string | number | undefined;
}

export interface SpikePoint {
  time: string;
  error_count: number;
}

export interface AnomalyRecord {
  method: string;
  block_id?: string | null;
  true_label?: string | null;
  correct?: string | null;
  minute?: string | null;
  error_count?: number | null;
  detected_at?: string;
}

export interface AnomalyRecordsResponse {
  total: number;
  items: AnomalyRecord[];
}
