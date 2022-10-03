let geojson;
let width = 900;
let height = 450;
let state = {
  type: 'Equirectangular',
  scale: 120,
  translateX: width / 2,
  translateY: height / 2,
  centerLon: 0,
  centerLat: 0,
  rotateLambda: 0.1,
  rotatePhi: 0,
  rotateGamma: 0
}
let projectionTypes = [
  'AzimuthalEqualArea',
  'AzimuthalEquidistant',
  'Gnomonic',
  'Orthographic',
  'Stereographic',
  'Albers',
  'ConicConformal',
  'ConicEqualArea',
  'ConicEquidistant',
  'Equirectangular',
  'Mercator',
  'TransverseMercator'
];

let projection = d3['geo' + state.type]().precision(0.1).scale(state.scale).center([0, 0]).translate([ state.translateX, state.translateY]);;
let geoGenerator = d3.geoPath()
  .projection(projection);

let graticule = d3.geoGraticule();

let circles = [
  [-135, 0], [-90, 0], [-45, 0], [0, 0], [45, 0], [90, 0], [135, 0], [180, 0],
  [0, -70], [0, -35], [0, 35], [0, 70],
  [180, -70], [180, -35], [180, 35], [180, 70],
];

let geoCircle = d3.geoCircle().radius(10).precision(1);
const antipode = ([longitude, latitude]) => [longitude + 180, -latitude];
const now = new Date;
const day = new Date(+now).setUTCHours(0, 0, 0, 0);
const t = solar.century(now);
const longitude = (day - now) / 864e5 * 360 - 180;
const sun = () => {
  return [longitude - solar.equationOfTime(t) / 4, solar.declination(t)];
}
const night = d3.geoCircle().radius(90).center(antipode(sun()));

let scaleExtent = [1, 8];

projection = d3['geo' + state.type]().precision(0.1).scale(state.scale).center([0, 0]).translate([ state.translateX, state.translateY]);

function initMenu() {
  d3.select('#menu')
    .selectAll('.slider.item input')
    .on('input', function (d) {
      let attr = d3.select(this).attr('name');
      state[attr] = this.value;
      d3.select(this.parentNode.parentNode).select('.value').text(this.value);
      update()
    });

  const projectionSelect = d3.select('#menu .projection-type select');
  projectionSelect
    .on('change', function (d) {
      state.type = this.options[this.selectedIndex].value;
      update()
    })
    .selectAll('option')
    .data(projectionTypes)
    .enter()
    .append('option')
    .attr('value', function (d) { return d; })
    .text(function (d) { return d; });

    projectionSelect.node().value = 'Equirectangular';
}

let v0, q0, r0, a0, tl, y0, y1;

const zoom = d3.zoom()
  .scaleExtent(scaleExtent.map(x => x * state.scale))
  .on("start", onZoomStart)
  .on("zoom", onZoomEnd);

function point(event, that) {
  const t = d3.pointers(event, that);

  if (t.length !== tl) {
    tl = t.length;
    if (tl > 1) a0 = Math.atan2(t[1][1] - t[0][1], t[1][0] - t[0][0]);
    onZoomStart.call(that, event);
  }

  return tl > 1
    ? [
      d3.mean(t, p => p[0]),
      d3.mean(t, p => p[1]),
      Math.atan2(t[1][1] - t[0][1], t[1][0] - t[0][0])
    ]
    : t[0];
}

function onZoomStart(event) { 
  y0 = state.translateY;
  y1 = point(event, this)[1];
  v0 = versor.cartesian(projection.invert(point(event, this)));
  q0 = versor((r0 = projection.rotate()));
}

function onZoomEnd(event) {
  state.scale = Math.round(event.transform.k);
  document.getElementById('scale').value = state.scale;
  document.getElementById('scaleLabel').innerHTML = state.scale;
  projection.scale(event.transform.k);
  const pt = point(event, this);
  const v1 = versor.cartesian(projection.rotate(r0).invert(pt));
  const delta = versor.delta(v0, v1);
  let q1 = versor.multiply(q0, delta);
  const yChange = pt[1] - y1;
  state.translateY = y0 + yChange < 0 ? 0 : y0 + yChange > height ? height : Math.round(y0 + yChange);
  document.getElementById('translateY').value = state.translateY;
  document.getElementById('yLabel').innerHTML = state.translateY;
  
  // For multitouch, compose with a rotation around the axis.
  if (pt[2]) {
    const d = (pt[2] - a0) / 2;
    const s = -Math.sin(d);
    const c = Math.sign(Math.cos(d));
    q1 = versor.multiply([Math.sqrt(1 - s * s), 0, 0, c * s], q1);
  }
  
  const rotateLambda = versor.rotation(q1)[0];
  state.rotateLambda = Math.round(rotateLambda);
  document.getElementById('rotateLambda').value = state.rotateLambda;
  document.getElementById('lambdaLabel').innerHTML = state.rotateLambda;
  projection.rotate(versor.rotation(q1));

  // In vicinity of the antipode (unstable) of q0, restart.
  if (delta[0] < 0.7) {
    onZoomStart.call(this, event);
  }
  update();
}

function update() {
  // Update projection
  projection = d3['geo' + state.type]().precision(0.1).scale(state.scale).center([0, 0]).translate([ state.translateX, state.translateY]);
  geoGenerator.projection(projection);

  projection
    .scale(state.scale)
    .translate([state.translateX, state.translateY])
    .center([state.centerLon, state.centerLat])
    .rotate([state.rotateLambda, state.rotatePhi, state.rotateGamma])

  // Update world map
  let u = d3.select('g.map')
    .selectAll('path')
    .data(geojson.features)

  u.enter()
    .append('path')
    .merge(u)
    .attr('d', geoGenerator)

  // Update projection center
  let projectedCenter = projection([state.centerLon, state.centerLat]);
  d3.select('.projection-center')
    .attr('cx', projectedCenter[0])
    .attr('cy', projectedCenter[1]);

  // Update graticule
  d3.select('.graticule path')
    .datum(graticule())
    .attr('d', geoGenerator);

  // Update circles
  u = d3.select('.circles')
    .selectAll('path')
    .data(circles.map(function (d) {
      geoCircle.center(d);
      return geoCircle();
    }));

  u.enter()
    .append('path')
    .merge(u)
    .attr('d', geoGenerator);

  d3.select('.night path')
    .datum(night())
    .attr('d', geoGenerator);
}


d3.json('https://gist.githubusercontent.com/d3indepth/f28e1c3a99ea6d84986f35ac8646fac7/raw/c58cede8dab4673c91a3db702d50f7447b373d98/ne_110m_land.json')
  .then(function (json) {
    geojson = json;
    const transform = d3.zoomIdentity.translate(width / 2, height / 2).scale(120);
    d3.select('#world-map')
    .attr("viewBox", [0, 0, width, height])
    .call(zoom)
    // .call(zoom.transform, transform);
    initMenu();
    update();
  });
