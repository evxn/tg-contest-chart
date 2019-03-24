const d = document;
const getById: (elementId: string) => HTMLElement = d.getElementById.bind(d);
const raf: (callback: FrameRequestCallback) => number = window.requestAnimationFrame.bind(window);
const floor = Math.floor.bind(Math);
const ceil = Math.ceil.bind(Math);

const svgNS = 'http://www.w3.org/2000/svg';
const fill: FillMode = 'forwards';
const MIN_WIN_SIZE = 30;
const AVERAGE_TICK = 80;
const DUR = 100;
const epsilon = 0.005;

const head = (l: any[]) => l[0];
const second = ([_,x]) => x;
const tail = (l) => l.slice(1);
const range = (size: number, start: number = 0, step: number = 1) => [...Array(size).keys()].map(i => start + step*i) as ReadonlyArray<number>
const normalize = (max: number) => (x: number) => x/max
const denorm = (max: number) => (t: number) => t * max
const lerp = (a: number, b: number) => (t: number) => (1 - t) * a + t * b
const concat = (l1: ReadonlyArray<number>,l2: ReadonlyArray<number>) => l1.concat(l2)
const subtract = <T>(a: Set<T>, b: Set<T>) => new Set([...a].filter(x => !b.has(x)));
const max2 = (x1: number,x2:number) => Math.max(x1,x2);
const min2 = (x1: number,x2:number) => Math.min(x1,x2);
const throttle = (timeout: number) => (fn: Function) => {
	let executed: number, tId: number;
	return (...args) => {
		if (!executed) {
			fn(...args);
			executed = Date.now();
		} else {
			clearTimeout(tId);
			tId = setTimeout(function() {
				if ((Date.now() - executed) >= timeout) {
					fn(...args);
					executed = Date.now();
				}
			}, timeout - (Date.now() - executed));
		}
	}
}
const throttleMin = throttle(DUR);
const dateString = (ms: number) => new Date(ms).toLocaleDateString("en-US",{month: 'short', day: 'numeric'})

const getWidth = (w: Element) => w.getBoundingClientRect().width;
const ael: (el: Element | Document | Window, type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => void = (el, ...args) => el.addEventListener(...args);
const rel: (el: Element | Document, type: string, listener: EventListener, options?: boolean | EventListenerOptions) => void = (el, ...args) => el.removeEventListener(...args);
const qs: (el: Element, selector: string) => Element = (el: Element, selector: string) => el.querySelector(selector)!

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

const enum Actions {
	WIDTH = 'WIDTH',
	COORD = 'COORD',
	TOGGLE_LINE = 'TOGGLE_LINE',
	DAY = 'DAY',
	NIGHT = 'NIGHT',
}

interface ChartState {
	coord: [number, number],
	hiddenLines: Set<number>;
}

interface AppState {
	[index: number]: ChartState;
	night: boolean;
	w?: number;
}

const initialAppState: Readonly<AppState> = {
	night: true,
}

const initialChartState: Readonly<ChartState> = {
	coord: [.9, 1],
	hiddenLines: new Set(),
}

const appState: [AppState, AppState | {}] = [initialAppState, {}];

type StateListener<T> = (curr: T, prev: T) => void;
const _stateListeners: {
	[key: string]: {
		cb: StateListener<any>,
		once: boolean
	}[]
} = {};
const subscribe = <T>(key: number | string, cb: StateListener<T> , once: boolean = false) => {
	const listeners = _stateListeners[key] || [];
	_stateListeners[key] = [...listeners, {cb, once}];
}
const pushState = (key: number | string, curr: any, prev: any) => {
	appState[0][key] = curr;
	appState[1][key] = prev;
	if (_stateListeners[key]) {
		_stateListeners[key].forEach(({cb}) => cb(curr, prev));
		_stateListeners[key] = _stateListeners[key].filter(({once})=>!once);
	}
}

type Reducer<T> = (type: Actions, payload: any, state: T) => T;
const _reducers: {[key: string] : Reducer<any>[]} = {};
const listenActions = (key: number | string, cb: Reducer<any>) => {
	const listeners = _reducers[key] || [];
	_reducers[key] = [...listeners, cb];
}
const emit = (key: number | string, type: Actions, payload: any) => {
	const reducers = _reducers[key];
	if (reducers) {
		const prev = head(appState)[key];
		const curr = reducers.reduce((prev,reduce) => reduce(type, payload,prev), prev);
		if (prev !== curr) {
			pushState(key, curr, prev);
		}
	}
}

const nightReducer = (type: Actions, payload: any, state: boolean) => {
	switch (type) {
		case Actions.DAY: return false;
		case Actions.NIGHT: return true;
		default: return state;
	}
}

const widthReducer = (type: Actions, payload: any, state: number) => {
	switch (type) {
		case Actions.WIDTH: return payload;
		default: return state;
	}
}

const chartReducer = (type: Actions, payload: any, state: ChartState = initialChartState) => {
	switch (type) {
		case Actions.COORD: {
			if (head(state.coord) !== head(payload) ||
				second(state.coord) !== second(payload)
			) {
				return {
					...state,
					coord: payload
				};
			}
			return state;

		}
		case Actions.TOGGLE_LINE: {
			const {lineIdx: i, maxSize} = payload;
			const hl = new Set([...state.hiddenLines.values()]);
			hl.has(i) ? hl.delete(i): hl.add(i);
			if (hl.size > maxSize) {
				return state;
			}
			return {
				...state,
				hiddenLines: hl
			};
		}
		default: return state;
	}
}

const parseRawData: (_) => Chart[] = (rawData) => {
	const enum ChartTypesEnum {
		LINE = 'line',
		X = 'x',
	}
	return rawData.map(rawChart => {
		const keys: string[] = rawChart.columns.map(col => head(col))
		const keyedData: Map<string, number[]> = new Map(rawChart.columns.map(col => [head(col), tail(col)]))

		const typedColumns = keys.map(key => {
			const type: ChartTypesEnum = rawChart.types[key];
			const data: number[] = keyedData.get(key)!;

			switch(type){
				case ChartTypesEnum.LINE: {
					const color: string = rawChart.colors[key];
					const name: string = rawChart.names[key];

					return [
						type,
						{
							color,
							data,
							name,
						}
					];
				}
				case ChartTypesEnum.X: {
					return [
						type,
						data
					];
				}
			}
		});

		const lines: Line[] = typedColumns
			.filter(([type]) => type === ChartTypesEnum.LINE)
			.map(second);

		const t: number[] = typedColumns
			.filter(([type]) => type === ChartTypesEnum.X)
			.map(second)[0];

		return {lines, t, length: t.length};
	});
}

const lineToPoints = (maxY: number,data: ReadonlyArray<number>) => {
	const l = data.length;
	const x = range(l).map(normalize(l - 1));
	const y = data.map(normalize(maxY));
	return range(l).map<[number,number]>((_,i) => [x[i],y[i]])
}

const pointsToStr = (points: [number,number][]) => points.map(point => point.join(' ')).join()

const createLine = (x1: number, y1: number, x2: number, y2: number, color: string, width: number = .5) => {
	const line = d.createElementNS(svgNS,'line') as SVGLineElement;
	line.setAttribute('stroke', color);
	line.setAttribute('stroke-width', ''+width);
	line.setAttribute('x1', ''+x1);
	line.setAttribute('y1', ''+y1);
	line.setAttribute('x2', ''+x2);
	line.setAttribute('y2', ''+y2);
	return line;
}

const lineToPolylineEl = (line: Line, lineIdx: number, lines: ReadonlyArray<Line>, hiddenLines: Set<number>) => {
	const p = d.createElementNS(svgNS,'polyline') as SVGPolylineElement;
	p.setAttribute('stroke', line.color);

	if (hiddenLines.has(lineIdx)) {
		p.style.opacity = '0';
	}

	const maxY = lines
		.filter((l, i) =>!hiddenLines.has(i))
		.map(l=>l.data)
		.reduce(concat)
		.reduce(max2, -Infinity);
	const points = lineToPoints(maxY,line.data);
	p.setAttribute('points', pointsToStr(points));
	return p;
}

const createTick = (ms: number, i: number, ticks: ReadonlyArray<number>) => {
	const tick = d.createElement('span') as HTMLElement;
	tick.classList.add('tick');
	const n = ticks.length - 1;
	const x = normalize(n)(i-.25);
	tick.style.left = `${x*100}%`;
	tick.style.top = '0';
	tick.appendChild(d.createTextNode(dateString(ms)));
	return tick;
}

const createPlot = (index: number, chart: Chart, curr: ChartState) =>{
	const tpl: HTMLTemplateElement = getById('tplPlot') as HTMLTemplateElement;
	const plotRoot: HTMLElement = tpl.content.cloneNode(true) as HTMLElement;
	const plot = qs(plotRoot,'.plot') as SVGSVGElement;
	const ticksRoot = qs(plotRoot,'.ticks') as HTMLElement;
	const polylines = chart.lines.map((line, lineIdx, lines) => lineToPolylineEl(line, lineIdx, lines, curr.hiddenLines));
	polylines.forEach(polyline => plot.appendChild(polyline));
	const toIndex = denorm(chart.length -1);

	const ticks = tail(chart.t.map(createTick).slice(0,chart.length-1));
	ticks.forEach(tick => ticksRoot.appendChild(tick))

	const [left,right] = curr.coord;
	const allData = chart.lines.filter((l, i) =>!curr.hiddenLines.has(i)).map(l=>l.data);
	const visibleData = allData.map(data => data.slice(floor(toIndex(left)),ceil(toIndex(right))));

	const maxY = allData.reduce(concat,[]).reduce(max2, -Infinity);
	const maxVisibleY = visibleData.reduce(concat,[]).reduce(max2, -Infinity);
	const scaleY = maxY/maxVisibleY;
	let scaleX = 1/(right - left);
	const translateX = -100 * left;

	polylines.forEach(polyline => {
		polyline.style.transform = `scale(${scaleX}, ${scaleY}) translate(${translateX}%)`;
	});

	let ticksW;

	raf(()=>{
		ticksW = getWidth(ticksRoot);

		ticksRoot.style.transform = `translate(${translateX}%)`;
		ticksRoot.style.width = `${scaleX*ticksW}px`;

		const speed = ticksW*scaleX/(AVERAGE_TICK * chart.length);

		let step = 1;
		while (speed * step < 1){
			step += 1;
		}
		ticks.forEach((tick,i) =>{
			tick.style.opacity = i % step ? '0' : `1`;
		})

		let animations: Animation[] = [];
		let ticksRootAnimation: Animation;
		let ticksAnimations: Animation[] = [];
		let prevScaleY = scaleY;
		let prevScaleX = scaleX;
		let prevStep = step;
		let prevTranslateX = translateX;
		let prevScaleYLerp = lerp(prevScaleY, prevScaleY);
		let prevScaleXLerp = lerp(prevScaleX, prevScaleX);
		let prevTranslateXLerp = lerp(prevTranslateX, prevTranslateX);
		let disappearing: Set<number> = new Set();
		let appearing: Set<number> = new Set();

		subscribe<ChartState>(index, (curr, prev) => {
			const duration = DUR;
			const currentTime = animations.length >= 1 && animations[0].currentTime || 0;
			const t = currentTime!/duration;
			animations.forEach(a => a.cancel());
			ticksRootAnimation && ticksRootAnimation.cancel();
			ticksAnimations.forEach(a => a.cancel());

			const toDisappear = subtract(curr.hiddenLines, prev.hiddenLines);
			const toAppear = subtract(prev.hiddenLines, curr.hiddenLines);

			const [left,right] = curr.coord;

			const maxY = chart.lines
				.map(l=>l.data)
				.reduce(concat,[])
				.reduce(max2, -Infinity);

			const allVisibleData = chart.lines.filter((l, i) =>!curr.hiddenLines.has(i)).map(l=>l.data);
			const maxVisibleY = allVisibleData.reduce(concat,[]).reduce(max2, -Infinity);
			const inViewData = allVisibleData.map(data => data.slice(floor(toIndex(left)),ceil(toIndex(right))));
			const maxInViewY = inViewData.reduce(concat,[]).reduce(max2, -Infinity);
			const scaleVisibleY = maxVisibleY/maxInViewY;

			const epsilonData = allVisibleData.map(data => data.slice(max2(0,floor(toIndex(left - epsilon))),min2(chart.length -1, ceil(toIndex(right + epsilon)))));
			const maxEpsilonY = epsilonData.reduce(concat,[]).reduce(max2, -Infinity);
			const scaleEpsY = maxVisibleY/maxEpsilonY;
			const scaleY = 0.5 * (scaleVisibleY + scaleEpsY) * (maxY / maxVisibleY);
			scaleX = 1/(right - left);
			const translateX = -left*100;

			animations = polylines.map((poly, lineIdx) => {
				const transform = [
					`scale(${prevScaleXLerp(t)},${prevScaleYLerp(t)}) translate(${prevTranslateXLerp(t)}%)`,
					`scale(${scaleX}, ${scaleY}) translate(${translateX}%)`,
				];
				const opacityFrom = disappearing.has(lineIdx) ?
					lerp(1,0)(t) :
					appearing.has(lineIdx) ?
						lerp(0,1)(t):
						toAppear.has(lineIdx) ?
							'0':
							toDisappear.has(lineIdx) ?
								'1':
								curr.hiddenLines.has(lineIdx) ?
									'0':
									'1';
				const opacityTo = curr.hiddenLines.has(lineIdx) ? '0' : '1';
				const opacity = [opacityFrom, opacityTo];
				return poly.animate({transform, opacity} as PropertyIndexedKeyframes,{duration, fill});
			});

			(()=>{
				const transform = [
					`translate(${prevTranslateXLerp(t)}%)`,
					`translate(${translateX}%)`,
				];
				const width = [
					`${prevScaleXLerp(t)*ticksW}px`,
					`${scaleX*ticksW}px`,
				];
				ticksRootAnimation = ticksRoot.animate({transform, width} as PropertyIndexedKeyframes,{duration, fill});
			})();

			const speed = ticksW*scaleX/(AVERAGE_TICK * chart.length);
			let step = 1;
			while (speed * step < 1){
				step += 1;
			}
			ticksAnimations = [];
			ticks.forEach((tick,i) =>{
				const opacity = [
					`${i % prevStep ? 0 : 1}`,
					`${i % step ? 0 : 1}`
				];
				ticksAnimations.push(tick.animate({opacity} as PropertyIndexedKeyframes,{duration: DUR*3, fill}));
			})

			prevScaleYLerp = lerp(prevScaleY, scaleY);
			prevScaleXLerp = lerp(prevScaleX, scaleX);
			prevTranslateXLerp = lerp(prevTranslateX, translateX);
			prevScaleY = scaleY;
			prevScaleX = scaleX;
			prevStep = step;
			prevTranslateX = translateX;
			disappearing = toDisappear;
			appearing = toAppear;

			animations.forEach(a => a.play());
			ticksAnimations.forEach(a => a.play());
			ticksRootAnimation.play();
		});
	});

	return plotRoot;
}

const createMinimap = (index: number, lines: ReadonlyArray<Line>, {coord,hiddenLines}: ChartState) => {
	const tpl: HTMLTemplateElement = getById('tplMini') as HTMLTemplateElement;
	const minimap: HTMLElement = tpl.content.cloneNode(true) as HTMLElement;

	const controls = qs(minimap,'.minimap-controls') as HTMLElement;
	const ltint = qs(controls, '.ltint') as HTMLElement;
	const rtint = qs(controls, '.rtint') as HTMLElement;

	subscribe<number>('w',() => {
		const controlsWidth = getWidth(controls);
		ltint.style.flexBasis = head(appState[0][index].coord) * controlsWidth + 'px';
		rtint.style.flexBasis = (1 - second(appState[0][index].coord)) * controlsWidth + 'px';
	});

	addControlsListeners(index, controls);

	const plot = qs(minimap,'.minimap-plot') as SVGSVGElement;
	const polylines = lines.map((line, lineIdx, lines) => lineToPolylineEl(line, lineIdx, lines, hiddenLines));
	polylines.forEach(polyline => plot.appendChild(polyline));

	let animations: Animation[] = [];
	let prevScaleY = 1;
	let prevScaleYLerp = lerp(prevScaleY,prevScaleY);
	let disappearing: Set<number> = new Set();
	let appearing: Set<number> = new Set();

	subscribe<ChartState>(index, (curr, prev) => {
		const duration = DUR;
		if (prev.hiddenLines !== curr.hiddenLines) {
			const currentTime = animations.length >= 1 && animations[0].currentTime || 0;
			const t = currentTime!/duration;
			animations.forEach(a => a.cancel());

			const toDisappear = subtract(curr.hiddenLines, prev.hiddenLines);
			const toAppear = subtract(prev.hiddenLines, curr.hiddenLines);

			const prevMaxY = lines
				.filter((l, i) =>!prev.hiddenLines.has(i))
				.map(l=>l.data)
				.reduce(concat,[])
				.reduce(max2, -Infinity);

			const maxY = lines
				.filter((l, i) =>!curr.hiddenLines.has(i))
				.map(l=>l.data)
				.reduce(concat,[])
				.reduce(max2, -Infinity);

			const scaleY = prevScaleY * prevMaxY/maxY;
			const fill: FillMode = 'forwards';

			animations = polylines
				.map((poly, lineIdx) => {
					const transform = [`scale(1,${prevScaleYLerp(t)})`, `scale(1,${scaleY})`];
					const opacityFrom = disappearing.has(lineIdx) ?
						lerp(1,0)(t) :
						appearing.has(lineIdx) ?
							lerp(0,1)(t):
							toAppear.has(lineIdx) ?
								'0':
								toDisappear.has(lineIdx) ?
									'1':
									curr.hiddenLines.has(lineIdx) ?
										'0':
										'1';
					const opacityTo = curr.hiddenLines.has(lineIdx) ? '0' : '1';
					const opacity = [opacityFrom, opacityTo];
					return poly.animate({transform, opacity} as PropertyIndexedKeyframes,{duration, fill});
				});

			prevScaleYLerp = lerp(prevScaleY, scaleY);
			prevScaleY = scaleY;
			disappearing = toDisappear;
			appearing = toAppear;

			animations.forEach(a => a.play());
		}
	});

	return minimap;
}

const emitCoord = throttleMin((index, left, right) => emit(index, Actions.COORD, [left,right]));
const addControlsListeners = (index: number, controls: HTMLElement) => {
	const ltint = qs(controls, '.ltint') as HTMLElement;
	const rtint = qs(controls, '.rtint') as HTMLElement;
	const lframe = qs(controls, '.lframe') as HTMLElement;
	const rframe = qs(controls, '.rframe') as HTMLElement;
	const win = qs(controls, '.window') as HTMLElement;

	const onMouseDown = ({target,x}: MouseEvent) => {
		const origX = x;

		const controlsWidth = getWidth(controls);
		const ltintW = getWidth(ltint);
		const rtintW = getWidth(rtint);
		const fullWinW = controlsWidth - ltintW - rtintW;

		const onMouseMove = ({x}: MouseEvent) => {
			switch (target) {
				case lframe: {
					let wl = max2(ltintW + (x - origX), 0);
					const available = controlsWidth - rtintW - MIN_WIN_SIZE;
					wl = wl < available ? wl : available;

					emitCoord(index,wl/controlsWidth,(controlsWidth - rtintW)/controlsWidth);

					raf(() => {
						ltint.style.flexBasis = wl + 'px';
					})

					break;
				}
				case rframe: {
					let wr = max2(rtintW - (x - origX), 0);
					const available = controlsWidth - ltintW - MIN_WIN_SIZE;
					wr = wr < available ? wr : available;

					emitCoord(index, ltintW/controlsWidth, (controlsWidth - wr)/controlsWidth);

					raf(() => {
						rtint.style.flexBasis = wr + 'px';
					})
					break;
				}
				case win: {
					let wl = max2(ltintW + (x - origX), 0);
					let wr = max2(rtintW - (x - origX), 0);
					const available = controlsWidth - fullWinW;

					if (wr + wl > available) {
						wl = wr === 0 ? available : wl;
						wr = wl === 0 ? available : wr;
					}

					emitCoord(index, wl/controlsWidth, (controlsWidth - wr)/controlsWidth);

					raf(() => {
						ltint.style.flexBasis = wl + 'px';
						rtint.style.flexBasis = wr + 'px';
					})

					break;
				}
			}
		}

		const onEnd = (e: MouseEvent) => {
			rel(d, 'mouseup', onEnd);
			rel(d, 'mousemove', onMouseMove);
		}

		ael(d, 'mouseup', onEnd);
		ael(d, 'mousemove', onMouseMove);
	}

	subscribe<number>('w',(curr) => {
		rel(lframe, 'mousedown', onMouseDown);
		rel(rframe, 'mousedown', onMouseDown);
		rel(win, 'mousedown', onMouseDown);
		ael(lframe, 'mousedown', onMouseDown);
		ael(rframe, 'mousedown', onMouseDown);
		ael(win, 'mousedown', onMouseDown);
	});
}

const createButtons = (index: number, chart: Chart, hiddenLines: Set<number>) => {
	const btns = d.createElement('div');
	btns.classList.add('buttons');
	chart.lines
		.map((_, lineIdx, lines) => createButton(index, lineIdx, lines, hiddenLines))
		.forEach(btn => btns.appendChild(btn));
	return btns;
}

const createButton = (index: number, lineIdx: number, lines: ReadonlyArray<Line>, hiddenLines: Set<number>) => {
	const line = lines[lineIdx];
	const tpl: HTMLTemplateElement = getById('tplBtn') as HTMLTemplateElement;
	const btnRoot: HTMLElement = tpl.content.cloneNode(true) as HTMLElement;
	const btn = qs(btnRoot,'.btn') as HTMLElement;
	const icon = qs(btn, '.icon');
	icon.setAttribute('fill', line.color);

	btn.appendChild(d.createTextNode(line.name));

	if (hiddenLines.has(lineIdx)) {
		qs(btn, '.empty-circle').setAttribute('r','40');
	}
	const maxSize = lines.length - 1;
	const emitToggle = () => emit(index, Actions.TOGGLE_LINE, {lineIdx, maxSize});
	ael(btn, 'click', emitToggle);

	const growC = qs(btn, '[d=grow-c]') as any;
	const shrinkC = qs(btn, '[d=shrink-c]') as any;

	subscribe<ChartState>(index, (curr, prev) => {
		const currChecked = curr && !curr.hiddenLines.has(lineIdx);
		const prevChecked = prev && !prev.hiddenLines.has(lineIdx);
		if (currChecked !== prevChecked) {
			currChecked ?  shrinkC.beginElement() : growC.beginElement();
		}
		if (currChecked && prevChecked && curr.hiddenLines.size === maxSize && prev.hiddenLines.size < maxSize) {
			btn.classList.add('disabled');
		} else if (currChecked && prevChecked && prev.hiddenLines.size === maxSize && curr.hiddenLines.size < maxSize) {
			btn.classList.remove('disabled');
		}
	});

	return btn;
}

const emitDay = () => emit('night', Actions.DAY, void(0));
const emitNight = () => emit('night', Actions.NIGHT, void(0));
const switchText = (night) => night ? 'Switch to Day Mode' : 'Switch To Night Mode';

const createNightSwitch = (night: boolean) => {
	const f = d.createElement('div');
	f.classList.add('footer');
	const link = d.createElement('a');
	link.classList.add('switcher');
	link.text = switchText(night)

	ael(link, 'click', night ? emitDay : emitNight);

	subscribe<boolean>('night', (night) => link.text = switchText(night));
	subscribe<boolean>('night', (night) => {
		rel(link, 'click', night ? emitNight : emitDay);
		ael(link, 'click', night ? emitDay : emitNight);
	});

	f.appendChild(link);
	return f;
}

function main() {
	fetch('../chart_data.json').then((res) => {
		res.json().then(rawData => {
			const data = parseRawData(rawData);
			const root = getById('root')!;

			data.forEach((chart,index) => {
				subscribe<ChartState>(index,(curr, prev) => {
					root.appendChild(createPlot(index, chart, curr));
					root.appendChild(createMinimap(index, chart.lines, curr));
					root.appendChild(createButtons(index, chart, curr.hiddenLines));
				},true);

				listenActions(index, chartReducer);
				pushState(index, initialChartState, void 0);
			})

			subscribe<boolean>('night', (night) => {
				root.appendChild(createNightSwitch(night));
			}, true);
			subscribe<boolean>('night', (night) => {
				night ? d.body.classList.add('night') : d.body.classList.remove('night');
			});

			listenActions('night', nightReducer);
			pushState('night', initialAppState.night, void 0);

			listenActions('w', widthReducer);
			pushState('w', getWidth(root) - 40, void 0);
			ael(window, 'resize', () => {
				emit('w', Actions.WIDTH,getWidth(root) - 40);
			})
		})
	});
}

main();
