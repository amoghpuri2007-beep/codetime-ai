export interface ChartData {
  labels: string[];
  values: number[];
  colors?: string[];
  highlight?: boolean[];
}

export interface WeeklyChartData {
  labels: string[];
  values: number[];
  highlightIndex: number;
}

export interface TrendChartData {
  labels: string[];
  values: number[];
  focusPoints: boolean[];
}

export interface IChartBuilder {
  buildTimeChart(labels: string[], values: number[]): ChartData;
  buildLanguageChart(labels: string[], values: number[]): ChartData;
  buildProjectChart(labels: string[], values: number[]): ChartData;
  buildWeeklyChart(dailySeconds: Record<string, number>): WeeklyChartData;
  buildTrendChart(
    dailySeconds: Record<string, number>,
    focusDays: Record<string, number>
  ): TrendChartData;
}

const CHART_COLORS = [
  '#4e9eff', // blue
  '#a78bfa', // purple
  '#34d399', // green
  '#f87171', // red
  '#fbbf24', // yellow
  '#60a5fa', // light blue
  '#f472b6', // pink
  '#2dd4bf', // teal
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export class ChartBuilder implements IChartBuilder {

  buildTimeChart(labels: string[], values: number[]): ChartData {
    return {
      labels,
      values: values.map(v => Math.round(v / 60)), // seconds to minutes
      colors: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
    };
  }

  buildLanguageChart(labels: string[], values: number[]): ChartData {
    return {
      labels,
      values: values.map(v => Math.round(v / 3600 * 10) / 10), // seconds to hours
      colors: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
    };
  }

  buildProjectChart(labels: string[], values: number[]): ChartData {
    return {
      labels,
      values: values.map(v => Math.round(v / 60)), // seconds to minutes
      colors: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
    };
  }

  buildWeeklyChart(dailySeconds: Record<string, number>): WeeklyChartData {
    const today = new Date();
    const todayDay = today.getDay(); // 0=Sun, 1=Mon...
    // Convert to Mon=0 index
    const todayIndex = todayDay === 0 ? 6 : todayDay - 1;

    // Build Mon-Sun dates for current week
    const weekDates: string[] = [];
    const monday = new Date(today);
    monday.setDate(today.getDate() - todayIndex);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekDates.push(this.formatDateKey(d));
    }

    const values = weekDates.map(date => {
      const seconds = dailySeconds[date] ?? 0;
      return Math.round(seconds / 3600 * 10) / 10; // hours, 1 decimal
    });

    return {
      labels: DAY_LABELS,
      values,
      highlightIndex: todayIndex,
    };
  }

  buildTrendChart(
    dailySeconds: Record<string, number>,
    focusDays: Record<string, number>
  ): TrendChartData {
    // Last 30 days
    const days = 30;
    const labels: string[] = [];
    const values: number[] = [];
    const focusPoints: boolean[] = [];

    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = this.formatDateKey(d);

      labels.push(this.formatShortDate(d));
      const seconds = dailySeconds[key] ?? 0;
      values.push(Math.round(seconds / 3600 * 10) / 10); // hours
      focusPoints.push((focusDays[key] ?? 0) > 0);
    }

    return { labels, values, focusPoints };
  }

  private formatDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private formatShortDate(date: Date): string {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${m}/${d}`;
  }
}