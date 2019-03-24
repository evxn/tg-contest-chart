declare const d: Document;
declare const getById: (elementId: string) => HTMLElement;
declare const raf: (callback: FrameRequestCallback) => number;
declare const floor: any;
declare const ceil: any;
declare const svgNS = "http://www.w3.org/2000/svg";
declare const fill: FillMode;
declare const MIN_WIN_SIZE = 30;
declare const AVERAGE_TICK = 80;
declare const DUR = 100;
declare const epsilon = 0.005;
declare const head: (l: any[]) => any;
declare const second: ([_, x]: [any, any]) => any;
declare const tail: (l: any) => any;
declare const range: (size: number, start?: number, step?: number) => ReadonlyArray<number>;
declare const normalize: (max: number) => (x: number) => number;
declare const denorm: (max: number) => (t: number) => number;
declare const lerp: (a: number, b: number) => (t: number) => number;
declare const concat: (l1: ReadonlyArray<number>, l2: ReadonlyArray<number>) => number[];
declare const subtract: <T>(a: Set<T>, b: Set<T>) => Set<T>;
declare const max2: (x1: number, x2: number) => number;
declare const min2: (x1: number, x2: number) => number;
declare const throttle: (timeout: number) => (fn: Function) => (...args: any[]) => void;
declare const throttleMin: (fn: Function) => (...args: any[]) => void;
declare const dateString: (ms: number) => string;
declare const getWidth: (w: Element) => number;
declare const ael: (el: Element | Document | Window, type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => void;
declare const rel: (el: Element | Document, type: string, listener: EventListener, options?: boolean | EventListenerOptions) => void;
declare const qs: (el: Element, selector: string) => Element;
interface Line {
    color: Readonly<string>;
    data: ReadonlyArray<number>;
    name: Readonly<string>;
}
interface Chart {
    length: Readonly<number>;
    lines: ReadonlyArray<Line>;
    t: ReadonlyArray<number>;
}
declare const enum Actions {
    WIDTH = "WIDTH",
    COORD = "COORD",
    TOGGLE_LINE = "TOGGLE_LINE",
    DAY = "DAY",
    NIGHT = "NIGHT"
}
interface ChartState {
    coord: [number, number];
    hiddenLines: Set<number>;
}
interface AppState {
    [index: number]: ChartState;
    night: boolean;
    w?: number;
}
declare const initialAppState: Readonly<AppState>;
declare const initialChartState: Readonly<ChartState>;
declare const appState: [AppState, AppState | {}];
declare type StateListener<T> = (curr: T, prev: T) => void;
declare const _stateListeners: {
    [key: string]: {
        cb: StateListener<any>;
        once: boolean;
    }[];
};
declare const subscribe: <T>(key: string | number, cb: StateListener<T>, once?: boolean) => void;
declare const pushState: (key: string | number, curr: any, prev: any) => void;
declare type Reducer<T> = (type: Actions, payload: any, state: T) => T;
declare const _reducers: {
    [key: string]: Reducer<any>[];
};
declare const listenActions: (key: string | number, cb: Reducer<any>) => void;
declare const emit: (key: string | number, type: Actions, payload: any) => void;
declare const nightReducer: (type: Actions, payload: any, state: boolean) => boolean;
declare const widthReducer: (type: Actions, payload: any, state: number) => any;
declare const chartReducer: (type: Actions, payload: any, state?: ChartState) => {
    coord: any;
    hiddenLines: Set<number>;
};
declare const parseRawData: (_: any) => Chart[];
declare const lineToPoints: (maxY: number, data: ReadonlyArray<number>) => [number, number][];
declare const pointsToStr: (points: [number, number][]) => string;
declare const createLine: (x1: number, y1: number, x2: number, y2: number, color: string, width?: number) => SVGLineElement;
declare const lineToPolylineEl: (line: Line, lineIdx: number, lines: ReadonlyArray<Line>, hiddenLines: Set<number>) => SVGPolylineElement;
declare const createTick: (ms: number, i: number, ticks: ReadonlyArray<number>) => HTMLElement;
declare const createPlot: (index: number, chart: Chart, curr: ChartState) => HTMLElement;
declare const createMinimap: (index: number, lines: ReadonlyArray<Line>, { coord, hiddenLines }: ChartState) => HTMLElement;
declare const emitCoord: (...args: any[]) => void;
declare const addControlsListeners: (index: number, controls: HTMLElement) => void;
declare const createButtons: (index: number, chart: Chart, hiddenLines: Set<number>) => HTMLDivElement;
declare const createButton: (index: number, lineIdx: number, lines: ReadonlyArray<Line>, hiddenLines: Set<number>) => HTMLElement;
declare const emitDay: () => void;
declare const emitNight: () => void;
declare const switchText: (night: any) => "Switch to Day Mode" | "Switch To Night Mode";
declare const createNightSwitch: (night: boolean) => HTMLDivElement;
declare function main(): void;
