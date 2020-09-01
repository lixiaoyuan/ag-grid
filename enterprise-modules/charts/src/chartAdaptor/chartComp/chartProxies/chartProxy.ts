import {
    _,
    AgChartCaptionOptions,
    AgChartLegendOptions,
    AgNavigatorOptions,
    CaptionOptions,
    ChartOptions,
    ChartOptionsChanged,
    ChartType,
    ColumnApi,
    DropShadowOptions,
    Events,
    EventService,
    FontOptions,
    GridApi,
    LegendOptions,
    NavigatorOptions,
    PaddingOptions,
    ProcessChartOptionsParams,
    ProcessChartParams,
    SeriesOptions,
} from "@ag-grid-community/core";
import {
    AgChartTheme,
    AgChartThemePalette,
    AreaSeries,
    BarSeries,
    Caption,
    CategoryAxis,
    Chart,
    ChartTheme,
    DropShadow,
    getChartTheme,
    Padding,
    PieSeries
} from "ag-charts-community";
import {deepMerge} from "../object";

export interface ChartProxyParams {
    chartId: string;
    chartType: ChartType;
    chartThemeIndex: number;
    width?: number;
    height?: number;
    parentElement: HTMLElement;
    grouping: boolean;
    document: Document;
    processChartOptions: (params: ProcessChartOptionsParams) => ChartOptions<SeriesOptions>;
    processChartFunc: (params: ProcessChartParams) => void;
    getChartThemeIndex: () => number;
    getChartThemes: () => string[];
    getCustomChartThemes: { [name: string]: AgChartTheme } | undefined
    getGridOptionsChartThemeOverrides: () => AgChartTheme | undefined;
    apiChartThemeOverrides: AgChartTheme | undefined;
    allowPaletteOverride: boolean;
    isDarkTheme: () => boolean;
    eventService: EventService;
    gridApi: GridApi;
    columnApi: ColumnApi;
}

export interface FieldDefinition {
    colId: string;
    displayName: string;
}

export interface UpdateChartParams {
    data: any[];
    grouping: boolean;
    category: {
        id: string;
        name: string;
    };
    fields: FieldDefinition[];
}

export abstract class ChartProxy<TChart extends Chart, TOptions extends ChartOptions<any>> {
    protected readonly chartId: string;
    protected readonly chartType: ChartType;
    protected readonly eventService: EventService;
    private readonly gridApi: GridApi;
    private readonly columnApi: ColumnApi;

    protected chart: TChart;
    protected customPalette: AgChartThemePalette;
    protected chartOptions: TOptions;
    protected chartTheme: ChartTheme;

    protected constructor(protected readonly chartProxyParams: ChartProxyParams) {
        this.chartId = chartProxyParams.chartId;
        this.chartType = chartProxyParams.chartType;
        this.eventService = chartProxyParams.eventService;
        this.gridApi = chartProxyParams.gridApi;
        this.columnApi = chartProxyParams.columnApi;
    }

    protected abstract createChart(options?: TOptions): TChart;

    public recreateChart(options?: TOptions): void {
        if (this.chart) {
            this.destroyChart();
        }

        this.chart = this.createChart(options);
    }

    public abstract update(params: UpdateChartParams): void;

    public getChart(): TChart {
        return this.chart;
    }

    public downloadChart(): void {
        const { chart } = this;
        const fileName = chart.title ? chart.title.text : 'chart';
        chart.scene.download(fileName);
    }

    public getChartImageDataURL(type?: string) {
        return this.chart.scene.getDataURL(type);
    }

    private isDarkTheme = () => this.chartProxyParams.isDarkTheme();
    protected getFontColor = (): string => this.isDarkTheme() ? 'rgb(221, 221, 221)' : 'rgb(87, 87, 87)';
    protected getAxisGridColor = (): string => this.isDarkTheme() ? 'rgb(100, 100, 100)' : 'rgb(219, 219, 219)';
    protected getBackgroundColor = (): string => this.isDarkTheme() ? '#2d3436' : 'white';

    protected abstract getDefaultOptions(): TOptions;

    protected initChartOptions(): void {
        this.initChartTheme();

        this.chartOptions = this.getDefaultOptionsFromTheme(this.chartTheme);

        // allow users to override options before they are applied
        const { processChartOptions } = this.chartProxyParams;
        if (processChartOptions) {
            const params: ProcessChartOptionsParams = { type: this.chartType, options: this.chartOptions };
            const overriddenOptions = processChartOptions(params) as TOptions;

            // ensure we have everything we need, in case the processing removed necessary options
            const safeOptions = this.getDefaultOptions();
            _.mergeDeep(safeOptions, overriddenOptions, false);

            this.chartOptions = safeOptions;
        }
    }

    private initChartTheme() {
        const themeName = this.getSelectedTheme();
        const stockTheme = this.isStockTheme(themeName);

        let gridOptionsThemeOverrides: AgChartTheme = this.chartProxyParams.getGridOptionsChartThemeOverrides();
        let apiThemeOverrides: AgChartTheme = this.chartProxyParams.apiChartThemeOverrides;
        if (gridOptionsThemeOverrides || apiThemeOverrides) {
            const themeOverrides = {
                defaults: this.mergeThemeOverrides(gridOptionsThemeOverrides, apiThemeOverrides)
            };
            const getCustomTheme = () => deepMerge(this.lookupCustomChartTheme(themeName), themeOverrides);
            const theme = stockTheme ? {baseTheme: themeName, ...themeOverrides} : getCustomTheme();
            this.chartTheme = getChartTheme(theme);
        } else {
            this.chartTheme = getChartTheme(stockTheme ? themeName : this.lookupCustomChartTheme(themeName));
        }
    }

    private lookupCustomChartTheme(selectedThemeName: string) {
        const customChartTheme = this.chartProxyParams.getCustomChartThemes[selectedThemeName];
        if (!customChartTheme) {
            console.warn("ag-Grid: no stock theme exists with the name '" + selectedThemeName + "' and no " +
                "custom chart theme with that name was supplied to 'customChartThemes'");
        }
        return customChartTheme;
    }

    private isStockTheme(themeName: string): boolean {
        const stockThemeNames = ['default', 'dark', 'material', 'material-dark', 'pastel', 'pastel-dark', 'solar', 'solar-dark', 'vivid', 'vivid-dark'];
        return _.includes(stockThemeNames, themeName);
    }

    private mergeThemeOverrides(gridOptionsThemeOverrides: AgChartTheme, apiThemeOverrides: AgChartTheme) {
        if (!gridOptionsThemeOverrides) return apiThemeOverrides;
        if (!apiThemeOverrides) return gridOptionsThemeOverrides;
        return deepMerge(gridOptionsThemeOverrides, apiThemeOverrides);
    }

    private integratedToStandaloneChartType(integratedChartType: string): string {
        switch (integratedChartType) {
            case ChartType.GroupedBar:
            case ChartType.StackedBar:
            case ChartType.NormalizedBar:
                return 'bar';
            case ChartType.GroupedColumn:
            case ChartType.StackedColumn:
            case ChartType.NormalizedColumn:
                return 'column';
            case ChartType.Line:
                return 'line';
            case ChartType.Area:
            case ChartType.StackedArea:
            case ChartType.NormalizedArea:
                return 'area';
            case ChartType.Scatter:
            case ChartType.Bubble:
                return 'scatter';
            case ChartType.Histogram:
                return 'histogram';
            case ChartType.Pie:
            case ChartType.Doughnut:
                return 'pie';
            default:
                return 'cartesian';
        }
    }

    protected getStandaloneChartType(): string {
        return this.integratedToStandaloneChartType(this.chartType);
    }

    // Merges theme defaults into default options. To be overridden in subclasses.
    protected getDefaultOptionsFromTheme(theme: ChartTheme): TOptions {
        const options = {} as TOptions;

        const standaloneChartType = this.getStandaloneChartType();

        options.title = theme.getConfig<AgChartCaptionOptions>(standaloneChartType + '.title') as CaptionOptions;
        options.subtitle = theme.getConfig<AgChartCaptionOptions>(standaloneChartType + '.subtitle') as CaptionOptions;
        options.background = theme.getConfig(standaloneChartType + '.background');
        options.legend =  theme.getConfig<AgChartLegendOptions>(standaloneChartType + '.legend') as LegendOptions;
        options.navigator = theme.getConfig<AgNavigatorOptions>(standaloneChartType + '.navigator') as NavigatorOptions;
        options.tooltipClass = theme.getConfig(standaloneChartType + '.tooltipClass');
        options.tooltipTracking = theme.getConfig(standaloneChartType + '.tooltipTracking');
        options.listeners = theme.getConfig(standaloneChartType + '.listeners');
        options.padding = theme.getConfig(standaloneChartType + '.padding');

        return options;
    }

    private getSelectedTheme(): string {
        const params = this.chartProxyParams;
        const chartThemeIndex = params.getChartThemeIndex();
        return params.getChartThemes()[chartThemeIndex];
    }

    public getChartOptions(): TOptions {
        return this.chartOptions;
    }

    public getCustomPalette(): AgChartThemePalette | undefined {
        return this.customPalette;
    }

    public getChartOption<T = string>(expression: string): T {
        return _.get(this.chartOptions, expression, undefined) as T;
    }

    public setChartOption(expression: string, value: any): void {
        if (_.get(this.chartOptions, expression, undefined) === value) {
            // option is already set to the specified value
            return;
        }

        _.set(this.chartOptions, expression, value);

        const mappings: any = {
            'legend.item.marker.strokeWidth': 'legend.strokeWidth',
            'legend.item.marker.size': 'legend.markerSize',
            'legend.item.marker.padding': 'legend.itemSpacing',
            'legend.item.label.fontFamily': 'legend.fontFamily',
            'legend.item.label.fontStyle': 'legend.fontStyle',
            'legend.item.label.fontWeight': 'legend.fontWeight',
            'legend.item.label.fontSize': 'legend.fontSize',
            'legend.item.label.color': 'legend.color',
            'legend.item.paddingX': 'legend.layoutHorizontalSpacing',
            'legend.item.paddingY': 'legend.layoutVerticalSpacing',
        };

        _.set(this.chart, mappings[expression] || expression, value);

        this.raiseChartOptionsChangedEvent();
    }

    public getSeriesOption<T = string>(expression: string): T {
        return _.get(this.chartOptions.seriesDefaults, expression, undefined) as T;
    }

    public setSeriesOption(expression: string, value: any): void {
        if (_.get(this.chartOptions.seriesDefaults, expression, undefined) === value) {
            // option is already set to the specified value
            return;
        }

        _.set(this.chartOptions.seriesDefaults, expression, value);

        const mappings: { [key: string]: string; } = {
            'stroke.width': 'strokeWidth',
            'stroke.opacity': 'strokeOpacity',
            'fill.opacity': 'fillOpacity',
            'tooltip.enabled': 'tooltipEnabled',
            'callout.colors': 'calloutColors'
        };

        const series = this.chart.series;
        series.forEach(s => _.set(s, mappings[expression] || expression, value));

        this.raiseChartOptionsChangedEvent();
    }

    public setTitleOption(property: keyof CaptionOptions, value: any) {
        if (_.get(this.chartOptions.title, property, undefined) === value) {
            // option is already set to the specified value
            return;
        }

        (this.chartOptions.title as any)[property] = value;

        if (!this.chart.title) {
            this.chart.title = {} as Caption;
        }

        (this.chart.title as any)[property] = value;

        if (property === 'text') {
            this.setTitleOption('enabled', _.exists(value));
        }

        this.raiseChartOptionsChangedEvent();
    }

    public getTitleOption(property: keyof CaptionOptions) {
        return (this.chartOptions.title as any)[property];
    }

    public getChartPaddingOption = (property: keyof PaddingOptions): string => this.chartOptions.padding ? `${this.chartOptions.padding[property]}` : '';

    public setChartPaddingOption(property: keyof PaddingOptions, value: number): void {
        let { padding } = this.chartOptions;

        if (_.get(padding, property, undefined) === value) {
            // option is already set to the specified value
            return;
        }

        if (!padding) {
            padding = this.chartOptions.padding = { top: 0, right: 0, bottom: 0, left: 0 };
            this.chart.padding = new Padding(0);
        }

        padding[property] = value;

        this.chart.padding[property] = value;

        this.chart.performLayout();
        this.raiseChartOptionsChangedEvent();
    }

    public getShadowEnabled = (): boolean => !!this.getShadowProperty('enabled');

    public getShadowProperty(property: keyof DropShadowOptions): any {
        const { seriesDefaults } = this.chartOptions;

        return seriesDefaults.shadow ? seriesDefaults.shadow[property] : '';
    }

    public setShadowProperty(property: keyof DropShadowOptions, value: any): void {
        const { seriesDefaults } = this.chartOptions;

        if (_.get(seriesDefaults.shadow, property, undefined) === value) {
            // option is already set to the specified value
            return;
        }

        if (!seriesDefaults.shadow) {
            seriesDefaults.shadow = {
                enabled: false,
                blur: 0,
                xOffset: 0,
                yOffset: 0,
                color: 'rgba(0,0,0,0.5)'
            };
        }

        seriesDefaults.shadow[property] = value;

        const series = this.getChart().series as (BarSeries | AreaSeries | PieSeries)[];

        series.forEach(s => {
            if (!s.shadow) {
                const shadow = new DropShadow();
                shadow.enabled = false;
                shadow.blur = 0;
                shadow.xOffset = 0;
                shadow.yOffset = 0;
                shadow.color = 'rgba(0,0,0,0.5)';
                s.shadow = shadow;
            }

            (s.shadow as any)[property] = value;
        });

        this.raiseChartOptionsChangedEvent();
    }

    public raiseChartOptionsChangedEvent(): void {
        const event: ChartOptionsChanged = Object.freeze({
            type: Events.EVENT_CHART_OPTIONS_CHANGED,
            chartId: this.chartId,
            chartType: this.chartType,
            chartThemeIndex: this.chartProxyParams.getChartThemeIndex(),
            chartOptions: this.chartOptions,
            api: this.gridApi,
            columnApi: this.columnApi,
        });

        this.eventService.dispatchEvent(event);
    }

    protected getDefaultFontOptions(): FontOptions {
        return {
            fontStyle: 'normal',
            fontWeight: 'normal',
            fontSize: 12,
            fontFamily: 'Verdana, sans-serif',
            color: this.getFontColor()
        };
    }

    protected getDefaultDropShadowOptions(): DropShadowOptions {
        return {
            enabled: false,
            blur: 5,
            xOffset: 3,
            yOffset: 3,
            color: 'rgba(0, 0, 0, 0.5)',
        };
    }

    protected getPredefinedPalette(): AgChartThemePalette {
        return this.chartTheme.palette;
    }

    protected getPalette(): AgChartThemePalette {
        return this.customPalette || this.chartTheme.palette;
    }

    //TODO remove all 'integrated' default chart options
    protected getDefaultChartOptions(): ChartOptions<SeriesOptions> {
        return {
            background: {},
            padding: {},
            title: {},
            subtitle: {},
            legend: {},
            navigator: {},
            seriesDefaults: {},
            listeners: {}
        } as any;
    }

    protected transformData(data: any[], categoryKey: string): any[] {
        if (this.chart.axes.filter(a => a instanceof CategoryAxis).length < 1) {
            return data;
        }

        // replace the values for the selected category with a complex object to allow for duplicated categories
        return data.map((d, index) => {
            const value = d[categoryKey];
            const valueString = value && value.toString ? value.toString() : '';
            const datum = { ...d };

            datum[categoryKey] = { id: index, value, toString: () => valueString };

            return datum;
        });
    }

    public destroy(): void {
        this.destroyChart();
    }

    protected destroyChart(): void {
        if (this.chart) {
            this.chart.destroy();
            this.chart = undefined;
        }
    }
}