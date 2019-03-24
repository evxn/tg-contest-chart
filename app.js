const d = document;
const getById = d.getElementById.bind(d);
const raf = window.requestAnimationFrame.bind(window);
const floor = Math.floor.bind(Math);
const ceil = Math.ceil.bind(Math);
const svgNS = 'http://www.w3.org/2000/svg';
const fill = 'forwards';
const MIN_WIN_SIZE = 30;
const AVERAGE_TICK = 80;
const DUR = 100;
const epsilon = 0.005;
const head = (l) => l[0];
const second = ([_, x]) => x;
const tail = (l) => l.slice(1);
const range = (size, start = 0, step = 1) => [...Array(size).keys()].map(i => start + step * i);
const normalize = (max) => (x) => x / max;
const denorm = (max) => (t) => t * max;
const lerp = (a, b) => (t) => (1 - t) * a + t * b;
const concat = (l1, l2) => l1.concat(l2);
const subtract = (a, b) => new Set([...a].filter(x => !b.has(x)));
const max2 = (x1, x2) => Math.max(x1, x2);
const min2 = (x1, x2) => Math.min(x1, x2);
const throttle = (timeout) => (fn) => {
    let executed, tId;
    return (...args) => {
        if (!executed) {
            fn(...args);
            executed = Date.now();
        }
        else {
            clearTimeout(tId);
            tId = setTimeout(function () {
                if ((Date.now() - executed) >= timeout) {
                    fn(...args);
                    executed = Date.now();
                }
            }, timeout - (Date.now() - executed));
        }
    };
};
const throttleMin = throttle(DUR);
const dateString = (ms) => new Date(ms).toLocaleDateString("en-US", { month: 'short', day: 'numeric' });
const getWidth = (w) => w.getBoundingClientRect().width;
const ael = (el, ...args) => el.addEventListener(...args);
const rel = (el, ...args) => el.removeEventListener(...args);
const qs = (el, selector) => el.querySelector(selector);
const initialAppState = {
    night: true,
};
const initialChartState = {
    coord: [.9, 1],
    hiddenLines: new Set(),
};
const appState = [initialAppState, {}];
const _stateListeners = {};
const subscribe = (key, cb, once = false) => {
    const listeners = _stateListeners[key] || [];
    _stateListeners[key] = [...listeners, { cb, once }];
};
const pushState = (key, curr, prev) => {
    appState[0][key] = curr;
    appState[1][key] = prev;
    if (_stateListeners[key]) {
        _stateListeners[key].forEach(({ cb }) => cb(curr, prev));
        _stateListeners[key] = _stateListeners[key].filter(({ once }) => !once);
    }
};
const _reducers = {};
const listenActions = (key, cb) => {
    const listeners = _reducers[key] || [];
    _reducers[key] = [...listeners, cb];
};
const emit = (key, type, payload) => {
    const reducers = _reducers[key];
    if (reducers) {
        const prev = head(appState)[key];
        const curr = reducers.reduce((prev, reduce) => reduce(type, payload, prev), prev);
        if (prev !== curr) {
            pushState(key, curr, prev);
        }
    }
};
const nightReducer = (type, payload, state) => {
    switch (type) {
        case "DAY" /* DAY */: return false;
        case "NIGHT" /* NIGHT */: return true;
        default: return state;
    }
};
const widthReducer = (type, payload, state) => {
    switch (type) {
        case "WIDTH" /* WIDTH */: return payload;
        default: return state;
    }
};
const chartReducer = (type, payload, state = initialChartState) => {
    switch (type) {
        case "COORD" /* COORD */: {
            if (head(state.coord) !== head(payload) ||
                second(state.coord) !== second(payload)) {
                return Object.assign({}, state, { coord: payload });
            }
            return state;
        }
        case "TOGGLE_LINE" /* TOGGLE_LINE */: {
            const { lineIdx: i, maxSize } = payload;
            const hl = new Set([...state.hiddenLines.values()]);
            hl.has(i) ? hl.delete(i) : hl.add(i);
            if (hl.size > maxSize) {
                return state;
            }
            return Object.assign({}, state, { hiddenLines: hl });
        }
        default: return state;
    }
};
const parseRawData = (rawData) => {
    return rawData.map(rawChart => {
        const keys = rawChart.columns.map(col => head(col));
        const keyedData = new Map(rawChart.columns.map(col => [head(col), tail(col)]));
        const typedColumns = keys.map(key => {
            const type = rawChart.types[key];
            const data = keyedData.get(key);
            switch (type) {
                case "line" /* LINE */: {
                    const color = rawChart.colors[key];
                    const name = rawChart.names[key];
                    return [
                        type,
                        {
                            color,
                            data,
                            name,
                        }
                    ];
                }
                case "x" /* X */: {
                    return [
                        type,
                        data
                    ];
                }
            }
        });
        const lines = typedColumns
            .filter(([type]) => type === "line" /* LINE */)
            .map(second);
        const t = typedColumns
            .filter(([type]) => type === "x" /* X */)
            .map(second)[0];
        return { lines, t, length: t.length };
    });
};
const lineToPoints = (maxY, data) => {
    const l = data.length;
    const x = range(l).map(normalize(l - 1));
    const y = data.map(normalize(maxY));
    return range(l).map((_, i) => [x[i], y[i]]);
};
const pointsToStr = (points) => points.map(point => point.join(' ')).join();
const createLine = (x1, y1, x2, y2, color, width = .5) => {
    const line = d.createElementNS(svgNS, 'line');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '' + width);
    line.setAttribute('x1', '' + x1);
    line.setAttribute('y1', '' + y1);
    line.setAttribute('x2', '' + x2);
    line.setAttribute('y2', '' + y2);
    return line;
};
const lineToPolylineEl = (line, lineIdx, lines, hiddenLines) => {
    const p = d.createElementNS(svgNS, 'polyline');
    p.setAttribute('stroke', line.color);
    if (hiddenLines.has(lineIdx)) {
        p.style.opacity = '0';
    }
    const maxY = lines
        .filter((l, i) => !hiddenLines.has(i))
        .map(l => l.data)
        .reduce(concat)
        .reduce(max2, -Infinity);
    const points = lineToPoints(maxY, line.data);
    p.setAttribute('points', pointsToStr(points));
    return p;
};
const createTick = (ms, i, ticks) => {
    const tick = d.createElement('span');
    tick.classList.add('tick');
    const n = ticks.length - 1;
    const x = normalize(n)(i - .25);
    tick.style.left = `${x * 100}%`;
    tick.style.top = '0';
    tick.appendChild(d.createTextNode(dateString(ms)));
    return tick;
};
const createPlot = (index, chart, curr) => {
    const tpl = getById('tplPlot');
    const plotRoot = tpl.content.cloneNode(true);
    const plot = qs(plotRoot, '.plot');
    const ticksRoot = qs(plotRoot, '.ticks');
    const polylines = chart.lines.map((line, lineIdx, lines) => lineToPolylineEl(line, lineIdx, lines, curr.hiddenLines));
    polylines.forEach(polyline => plot.appendChild(polyline));
    const toIndex = denorm(chart.length - 1);
    const ticks = tail(chart.t.map(createTick).slice(0, chart.length - 1));
    ticks.forEach(tick => ticksRoot.appendChild(tick));
    const [left, right] = curr.coord;
    const allData = chart.lines.filter((l, i) => !curr.hiddenLines.has(i)).map(l => l.data);
    const visibleData = allData.map(data => data.slice(floor(toIndex(left)), ceil(toIndex(right))));
    const maxY = allData.reduce(concat, []).reduce(max2, -Infinity);
    const maxVisibleY = visibleData.reduce(concat, []).reduce(max2, -Infinity);
    const scaleY = maxY / maxVisibleY;
    let scaleX = 1 / (right - left);
    const translateX = -100 * left;
    polylines.forEach(polyline => {
        polyline.style.transform = `scale(${scaleX}, ${scaleY}) translate(${translateX}%)`;
    });
    let ticksW;
    raf(() => {
        ticksW = getWidth(ticksRoot);
        ticksRoot.style.transform = `translate(${translateX}%)`;
        ticksRoot.style.width = `${scaleX * ticksW}px`;
        const speed = ticksW * scaleX / (AVERAGE_TICK * chart.length);
        let step = 1;
        while (speed * step < 1) {
            step += 1;
        }
        ticks.forEach((tick, i) => {
            tick.style.opacity = i % step ? '0' : `1`;
        });
        let animations = [];
        let ticksRootAnimation;
        let ticksAnimations = [];
        let prevScaleY = scaleY;
        let prevScaleX = scaleX;
        let prevStep = step;
        let prevTranslateX = translateX;
        let prevScaleYLerp = lerp(prevScaleY, prevScaleY);
        let prevScaleXLerp = lerp(prevScaleX, prevScaleX);
        let prevTranslateXLerp = lerp(prevTranslateX, prevTranslateX);
        let disappearing = new Set();
        let appearing = new Set();
        subscribe(index, (curr, prev) => {
            const duration = DUR;
            const currentTime = animations.length >= 1 && animations[0].currentTime || 0;
            const t = currentTime / duration;
            animations.forEach(a => a.cancel());
            ticksRootAnimation && ticksRootAnimation.cancel();
            ticksAnimations.forEach(a => a.cancel());
            const toDisappear = subtract(curr.hiddenLines, prev.hiddenLines);
            const toAppear = subtract(prev.hiddenLines, curr.hiddenLines);
            const [left, right] = curr.coord;
            const maxY = chart.lines
                .map(l => l.data)
                .reduce(concat, [])
                .reduce(max2, -Infinity);
            const allVisibleData = chart.lines.filter((l, i) => !curr.hiddenLines.has(i)).map(l => l.data);
            const maxVisibleY = allVisibleData.reduce(concat, []).reduce(max2, -Infinity);
            const inViewData = allVisibleData.map(data => data.slice(floor(toIndex(left)), ceil(toIndex(right))));
            const maxInViewY = inViewData.reduce(concat, []).reduce(max2, -Infinity);
            const scaleVisibleY = maxVisibleY / maxInViewY;
            const epsilonData = allVisibleData.map(data => data.slice(max2(0, floor(toIndex(left - epsilon))), min2(chart.length - 1, ceil(toIndex(right + epsilon)))));
            const maxEpsilonY = epsilonData.reduce(concat, []).reduce(max2, -Infinity);
            const scaleEpsY = maxVisibleY / maxEpsilonY;
            const scaleY = 0.5 * (scaleVisibleY + scaleEpsY) * (maxY / maxVisibleY);
            scaleX = 1 / (right - left);
            const translateX = -left * 100;
            animations = polylines.map((poly, lineIdx) => {
                const transform = [
                    `scale(${prevScaleXLerp(t)},${prevScaleYLerp(t)}) translate(${prevTranslateXLerp(t)}%)`,
                    `scale(${scaleX}, ${scaleY}) translate(${translateX}%)`,
                ];
                const opacityFrom = disappearing.has(lineIdx) ?
                    lerp(1, 0)(t) :
                    appearing.has(lineIdx) ?
                        lerp(0, 1)(t) :
                        toAppear.has(lineIdx) ?
                            '0' :
                            toDisappear.has(lineIdx) ?
                                '1' :
                                curr.hiddenLines.has(lineIdx) ?
                                    '0' :
                                    '1';
                const opacityTo = curr.hiddenLines.has(lineIdx) ? '0' : '1';
                const opacity = [opacityFrom, opacityTo];
                return poly.animate({ transform, opacity }, { duration, fill });
            });
            (() => {
                const transform = [
                    `translate(${prevTranslateXLerp(t)}%)`,
                    `translate(${translateX}%)`,
                ];
                const width = [
                    `${prevScaleXLerp(t) * ticksW}px`,
                    `${scaleX * ticksW}px`,
                ];
                ticksRootAnimation = ticksRoot.animate({ transform, width }, { duration, fill });
            })();
            const speed = ticksW * scaleX / (AVERAGE_TICK * chart.length);
            let step = 1;
            while (speed * step < 1) {
                step += 1;
            }
            ticksAnimations = [];
            ticks.forEach((tick, i) => {
                const opacity = [
                    `${i % prevStep ? 0 : 1}`,
                    `${i % step ? 0 : 1}`
                ];
                ticksAnimations.push(tick.animate({ opacity }, { duration: DUR * 3, fill }));
            });
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
};
const createMinimap = (index, lines, { coord, hiddenLines }) => {
    const tpl = getById('tplMini');
    const minimap = tpl.content.cloneNode(true);
    const controls = qs(minimap, '.minimap-controls');
    const ltint = qs(controls, '.ltint');
    const rtint = qs(controls, '.rtint');
    subscribe('w', () => {
        const controlsWidth = getWidth(controls);
        ltint.style.flexBasis = head(appState[0][index].coord) * controlsWidth + 'px';
        rtint.style.flexBasis = (1 - second(appState[0][index].coord)) * controlsWidth + 'px';
    });
    addControlsListeners(index, controls);
    const plot = qs(minimap, '.minimap-plot');
    const polylines = lines.map((line, lineIdx, lines) => lineToPolylineEl(line, lineIdx, lines, hiddenLines));
    polylines.forEach(polyline => plot.appendChild(polyline));
    let animations = [];
    let prevScaleY = 1;
    let prevScaleYLerp = lerp(prevScaleY, prevScaleY);
    let disappearing = new Set();
    let appearing = new Set();
    subscribe(index, (curr, prev) => {
        const duration = DUR;
        if (prev.hiddenLines !== curr.hiddenLines) {
            const currentTime = animations.length >= 1 && animations[0].currentTime || 0;
            const t = currentTime / duration;
            animations.forEach(a => a.cancel());
            const toDisappear = subtract(curr.hiddenLines, prev.hiddenLines);
            const toAppear = subtract(prev.hiddenLines, curr.hiddenLines);
            const prevMaxY = lines
                .filter((l, i) => !prev.hiddenLines.has(i))
                .map(l => l.data)
                .reduce(concat, [])
                .reduce(max2, -Infinity);
            const maxY = lines
                .filter((l, i) => !curr.hiddenLines.has(i))
                .map(l => l.data)
                .reduce(concat, [])
                .reduce(max2, -Infinity);
            const scaleY = prevScaleY * prevMaxY / maxY;
            const fill = 'forwards';
            animations = polylines
                .map((poly, lineIdx) => {
                const transform = [`scale(1,${prevScaleYLerp(t)})`, `scale(1,${scaleY})`];
                const opacityFrom = disappearing.has(lineIdx) ?
                    lerp(1, 0)(t) :
                    appearing.has(lineIdx) ?
                        lerp(0, 1)(t) :
                        toAppear.has(lineIdx) ?
                            '0' :
                            toDisappear.has(lineIdx) ?
                                '1' :
                                curr.hiddenLines.has(lineIdx) ?
                                    '0' :
                                    '1';
                const opacityTo = curr.hiddenLines.has(lineIdx) ? '0' : '1';
                const opacity = [opacityFrom, opacityTo];
                return poly.animate({ transform, opacity }, { duration, fill });
            });
            prevScaleYLerp = lerp(prevScaleY, scaleY);
            prevScaleY = scaleY;
            disappearing = toDisappear;
            appearing = toAppear;
            animations.forEach(a => a.play());
        }
    });
    return minimap;
};
const emitCoord = throttleMin((index, left, right) => emit(index, "COORD" /* COORD */, [left, right]));
const addControlsListeners = (index, controls) => {
    const ltint = qs(controls, '.ltint');
    const rtint = qs(controls, '.rtint');
    const lframe = qs(controls, '.lframe');
    const rframe = qs(controls, '.rframe');
    const win = qs(controls, '.window');
    const onMouseDown = ({ target, x }) => {
        const origX = x;
        const controlsWidth = getWidth(controls);
        const ltintW = getWidth(ltint);
        const rtintW = getWidth(rtint);
        const fullWinW = controlsWidth - ltintW - rtintW;
        const onMouseMove = ({ x }) => {
            switch (target) {
                case lframe: {
                    let wl = max2(ltintW + (x - origX), 0);
                    const available = controlsWidth - rtintW - MIN_WIN_SIZE;
                    wl = wl < available ? wl : available;
                    emitCoord(index, wl / controlsWidth, (controlsWidth - rtintW) / controlsWidth);
                    raf(() => {
                        ltint.style.flexBasis = wl + 'px';
                    });
                    break;
                }
                case rframe: {
                    let wr = max2(rtintW - (x - origX), 0);
                    const available = controlsWidth - ltintW - MIN_WIN_SIZE;
                    wr = wr < available ? wr : available;
                    emitCoord(index, ltintW / controlsWidth, (controlsWidth - wr) / controlsWidth);
                    raf(() => {
                        rtint.style.flexBasis = wr + 'px';
                    });
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
                    emitCoord(index, wl / controlsWidth, (controlsWidth - wr) / controlsWidth);
                    raf(() => {
                        ltint.style.flexBasis = wl + 'px';
                        rtint.style.flexBasis = wr + 'px';
                    });
                    break;
                }
            }
        };
        const onEnd = (e) => {
            rel(d, 'mouseup', onEnd);
            rel(d, 'mousemove', onMouseMove);
        };
        ael(d, 'mouseup', onEnd);
        ael(d, 'mousemove', onMouseMove);
    };
    subscribe('w', (curr) => {
        rel(lframe, 'mousedown', onMouseDown);
        rel(rframe, 'mousedown', onMouseDown);
        rel(win, 'mousedown', onMouseDown);
        ael(lframe, 'mousedown', onMouseDown);
        ael(rframe, 'mousedown', onMouseDown);
        ael(win, 'mousedown', onMouseDown);
    });
};
const createButtons = (index, chart, hiddenLines) => {
    const btns = d.createElement('div');
    btns.classList.add('buttons');
    chart.lines
        .map((_, lineIdx, lines) => createButton(index, lineIdx, lines, hiddenLines))
        .forEach(btn => btns.appendChild(btn));
    return btns;
};
const createButton = (index, lineIdx, lines, hiddenLines) => {
    const line = lines[lineIdx];
    const tpl = getById('tplBtn');
    const btnRoot = tpl.content.cloneNode(true);
    const btn = qs(btnRoot, '.btn');
    const icon = qs(btn, '.icon');
    icon.setAttribute('fill', line.color);
    btn.appendChild(d.createTextNode(line.name));
    if (hiddenLines.has(lineIdx)) {
        qs(btn, '.empty-circle').setAttribute('r', '40');
    }
    const maxSize = lines.length - 1;
    const emitToggle = () => emit(index, "TOGGLE_LINE" /* TOGGLE_LINE */, { lineIdx, maxSize });
    ael(btn, 'click', emitToggle);
    const growC = qs(btn, '[d=grow-c]');
    const shrinkC = qs(btn, '[d=shrink-c]');
    subscribe(index, (curr, prev) => {
        const currChecked = curr && !curr.hiddenLines.has(lineIdx);
        const prevChecked = prev && !prev.hiddenLines.has(lineIdx);
        if (currChecked !== prevChecked) {
            currChecked ? shrinkC.beginElement() : growC.beginElement();
        }
        if (currChecked && prevChecked && curr.hiddenLines.size === maxSize && prev.hiddenLines.size < maxSize) {
            btn.classList.add('disabled');
        }
        else if (currChecked && prevChecked && prev.hiddenLines.size === maxSize && curr.hiddenLines.size < maxSize) {
            btn.classList.remove('disabled');
        }
    });
    return btn;
};
const emitDay = () => emit('night', "DAY" /* DAY */, void (0));
const emitNight = () => emit('night', "NIGHT" /* NIGHT */, void (0));
const switchText = (night) => night ? 'Switch to Day Mode' : 'Switch To Night Mode';
const createNightSwitch = (night) => {
    const f = d.createElement('div');
    f.classList.add('footer');
    const link = d.createElement('a');
    link.classList.add('switcher');
    link.text = switchText(night);
    ael(link, 'click', night ? emitDay : emitNight);
    subscribe('night', (night) => link.text = switchText(night));
    subscribe('night', (night) => {
        rel(link, 'click', night ? emitNight : emitDay);
        ael(link, 'click', night ? emitDay : emitNight);
    });
    f.appendChild(link);
    return f;
};
function main() {
    fetch('chart_data.json').then((res) => {
        res.json().then(rawData => {
            const data = parseRawData(rawData);
            const root = getById('root');
            data.forEach((chart, index) => {
                subscribe(index, (curr, prev) => {
                    root.appendChild(createPlot(index, chart, curr));
                    root.appendChild(createMinimap(index, chart.lines, curr));
                    root.appendChild(createButtons(index, chart, curr.hiddenLines));
                }, true);
                listenActions(index, chartReducer);
                pushState(index, initialChartState, void 0);
            });
            subscribe('night', (night) => {
                root.appendChild(createNightSwitch(night));
            }, true);
            subscribe('night', (night) => {
                night ? d.body.classList.add('night') : d.body.classList.remove('night');
            });
            listenActions('night', nightReducer);
            pushState('night', initialAppState.night, void 0);
            listenActions('w', widthReducer);
            pushState('w', getWidth(root) - 40, void 0);
            ael(window, 'resize', () => {
                emit('w', "WIDTH" /* WIDTH */, getWidth(root) - 40);
            });
        });
    });
}
main();
