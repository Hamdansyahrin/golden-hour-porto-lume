// Golden Hour's renderer: a small hand-written WebGL2 engine for flat-shaded low-poly
// geometry. One vertex format everywhere (position, normal, colour, emissive), one shader
// with a warm directional sun, distance fog the colour of the sunset, and a gradient sky
// drawn as a fullscreen pass behind the world. No textures, no files, no network: every
// colour is a vertex colour chosen by the builders in city.js and actors.js.

// ------------------------------------------------------------------ matrices

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

/** View matrix for a camera at pos looking along yaw (around Y) and pitch (up positive). */
function viewFrom(pos, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  // Forward on the ground plane is (-sin yaw, -cos yaw) in xz; pitch lifts it.
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  // Right is forward crossed with world-up, kept in the ground plane; up completes the basis.
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  // up = cross(right, forward) with right = (rx, 0, rz):
  const uX = 0 * fz - rz * fy;
  const uY = rz * fx - rx * fz;
  const uZ = rx * fy - 0 * fx;
  const m = new Float32Array(16);
  m[0] = rx; m[1] = uX; m[2] = -fx;
  m[4] = 0; m[5] = uY; m[6] = -fy;
  m[8] = rz; m[9] = uZ; m[10] = -fz;
  m[12] = -(rx * pos.x + rz * pos.z);
  m[13] = -(uX * pos.x + uY * pos.y + uZ * pos.z);
  m[14] = fx * pos.x + fy * pos.y + fz * pos.z;
  m[15] = 1;
  return m;
}

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}

// ------------------------------------------------------------------ mesh builder

const FACES = [
  { n: [0, 1, 0], c: [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] }, // top
  { n: [0, -1, 0], c: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]] }, // bottom
  { n: [0, 0, -1], c: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] }, // north
  { n: [0, 0, 1], c: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] }, // south
  { n: [1, 0, 0], c: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] }, // east
  { n: [-1, 0, 0], c: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] }, // west
];

/**
 * Accumulates coloured triangles. Coordinates are world metres; a box is placed by its
 * centre, sized sx/sy/sz and rotated around Y by ry. `shade` multiplies the colour (used
 * for baked variety); `emissive` 1 marks a vertex the sun cannot dim (lit windows, lamps).
 */
export class MeshBuilder {
  constructor() { this.data = []; }
  clear() { this.data.length = 0; }
  vertex(x, y, z, nx, ny, nz, r, g, b, e) { this.data.push(x, y, z, nx, ny, nz, r, g, b, e); }
  tri(a, b, c, n, col, e) {
    this.vertex(a[0], a[1], a[2], n[0], n[1], n[2], col[0], col[1], col[2], e);
    this.vertex(b[0], b[1], b[2], n[0], n[1], n[2], col[0], col[1], col[2], e);
    this.vertex(c[0], c[1], c[2], n[0], n[1], n[2], col[0], col[1], col[2], e);
  }
  box(cx, cy, cz, sx, sy, sz, ry, col, opts = {}) {
    const shade = opts.shade ?? 1;
    const e = opts.emissive ? 1 : 0;
    const rgb = [col[0] * shade, col[1] * shade, col[2] * shade];
    const cos = Math.cos(ry || 0), sin = Math.sin(ry || 0);
    for (const face of FACES) {
      const pts = face.c.map(([lx, ly, lz]) => {
        const wx = lx * sx, wz = lz * sz;
        return [cx + wx * cos - wz * sin, cy + ly * sy, cz + wx * sin + wz * cos];
      });
      const n = face.n;
      const wn = [n[0] * cos - n[2] * sin, n[1], n[0] * sin + n[2] * cos];
      this.tri(pts[0], pts[1], pts[2], wn, rgb, e);
      this.tri(pts[0], pts[2], pts[3], wn, rgb, e);
    }
  }
  /** A flat quad on the ground (or any height), facing up. Corners given as [x, z] pairs. */
  groundQuad(x0, z0, x1, z1, y, col, opts = {}) {
    const e = opts.emissive ? 1 : 0;
    const n = [0, 1, 0];
    this.tri([x0, y, z0], [x1, y, z0], [x1, y, z1], n, col, e);
    this.tri([x0, y, z0], [x1, y, z1], [x0, y, z1], n, col, e);
  }
  /** A vertical quad facing a compass direction (0=north -z, 1=south +z, 2=east +x, 3=west -x). */
  wallQuad(cx, cy, cz, w, h, dir, col, opts = {}) {
    const e = opts.emissive ? 1 : 0;
    const hw = w / 2, hh = h / 2;
    let n, a, b, c, d;
    if (dir === 0) { n = [0, 0, -1]; a = [cx + hw, cy - hh, cz]; b = [cx - hw, cy - hh, cz]; c = [cx - hw, cy + hh, cz]; d = [cx + hw, cy + hh, cz]; }
    else if (dir === 1) { n = [0, 0, 1]; a = [cx - hw, cy - hh, cz]; b = [cx + hw, cy - hh, cz]; c = [cx + hw, cy + hh, cz]; d = [cx - hw, cy + hh, cz]; }
    else if (dir === 2) { n = [1, 0, 0]; a = [cx, cy - hh, cz + hw]; b = [cx, cy - hh, cz - hw]; c = [cx, cy + hh, cz - hw]; d = [cx, cy + hh, cz + hw]; }
    else { n = [-1, 0, 0]; a = [cx, cy - hh, cz - hw]; b = [cx, cy - hh, cz + hw]; c = [cx, cy + hh, cz + hw]; d = [cx, cy + hh, cz - hw]; }
    this.tri(a, b, c, n, col, e);
    this.tri(a, c, d, n, col, e);
  }
  /** A low prism (cylinder with few sides) — lighthouse shaft, planters, the fountain. */
  prism(cx, cy, cz, radius, height, sides, col, opts = {}) {
    const e = opts.emissive ? 1 : 0;
    const shade = opts.shade ?? 1;
    const rgb = [col[0] * shade, col[1] * shade, col[2] * shade];
    const top = [], bot = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
      top.push([x, cy + height / 2, z]); bot.push([x, cy - height / 2, z]);
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const mx = (bot[i][0] + bot[j][0]) / 2 - cx, mz = (bot[i][2] + bot[j][2]) / 2 - cz;
      const ml = Math.hypot(mx, mz) || 1;
      const n = [mx / ml, 0, mz / ml];
      this.tri(bot[i], bot[j], top[j], n, rgb, e);
      this.tri(bot[i], top[j], top[i], n, rgb, e);
      this.tri([cx, cy + height / 2, cz], top[i], top[j], [0, 1, 0], rgb, e);
    }
  }
  /** A soft dark ellipse on the ground: the blob shadow every actor carries. */
  blob(x, z, radius, y = 0.03) {
    const col = [0.09, 0.05, 0.03];
    const seg = 10;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri([x, y, z], [x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius],
        [x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius], [0, 1, 0], col, 0);
    }
  }
  toFloat32() { return new Float32Array(this.data); }
  get vertexCount() { return this.data.length / 10; }
}

// ------------------------------------------------------------------ shaders

const VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec3 aCol;
layout(location=3) in float aEmi;
uniform mat4 uMVP;
uniform mat4 uView;
out vec3 vCol; out vec3 vNor; out float vEmi; out float vDist;
void main(){
  vec4 wp = vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  vDist = -vp.z;
  vCol = aCol; vNor = aNor; vEmi = aEmi;
  gl_Position = uMVP * wp;
}`;

const FRAG = `#version 300 es
precision mediump float;
uniform vec3 uSun;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
in vec3 vCol; in vec3 vNor; in float vEmi; in float vDist;
out vec4 oCol;
void main(){
  vec3 n = normalize(vNor);
  float dl = max(dot(n, uSun), 0.0);
  float light = 0.42 + 0.62 * dl;
  vec3 warm = vCol * vec3(1.06, 0.97, 0.86);
  vec3 lit = warm * light;
  vec3 col = mix(lit, vCol * 1.15, vEmi);
  float f = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFog, f * 0.82);
  oCol = vec4(col, 1.0);
}`;

const SKY_VERT = `#version 300 es
layout(location=0) in vec2 aP;
out vec2 vP;
void main(){ vP = aP; gl_Position = vec4(aP, 0.999, 1.0); }`;

const SKY_FRAG = `#version 300 es
precision mediump float;
in vec2 vP;
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec2 uSunDir;
out vec4 oCol;
void main(){
  float h = vP.y * 0.5 + 0.5;
  vec3 col = mix(uLow, uMid, smoothstep(0.0, 0.52, h));
  col = mix(col, uTop, smoothstep(0.5, 1.0, h));
  float sunAmt = pow(max(dot(normalize(vec3(vP.x * 1.4, vP.y + 0.12, 0.55)), normalize(vec3(uSunDir, 0.55))), 0.0), 18.0);
  col += vec3(1.0, 0.62, 0.28) * sunAmt * 0.85;
  float disc = smoothstep(0.055, 0.045, length(vec2(vP.x * 1.4, vP.y + 0.12) - uSunDir));
  col += vec3(1.0, 0.78, 0.45) * disc * 0.9;
  oCol = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ renderer

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
  return sh;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}

export const SUN_DIR = (() => { const v = [-0.55, 0.62, -0.42]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
export const FOG_COLOUR = [0.98, 0.62, 0.36];
export const SKY = { top: [0.36, 0.42, 0.72], mid: [0.99, 0.62, 0.34], low: [1.0, 0.8, 0.52] };

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true, depth: true });
  if (!gl) throw new Error('WebGL2 unavailable');
  const prog = program(gl, VERT, FRAG);
  const skyProg = program(gl, SKY_VERT, SKY_FRAG);
  const uMVP = gl.getUniformLocation(prog, 'uMVP');
  const uView = gl.getUniformLocation(prog, 'uView');
  const uSun = gl.getUniformLocation(prog, 'uSun');
  const uFog = gl.getUniformLocation(prog, 'uFog');
  const uFogNear = gl.getUniformLocation(prog, 'uFogNear');
  const uFogFar = gl.getUniformLocation(prog, 'uFogFar');
  const sTop = gl.getUniformLocation(skyProg, 'uTop');
  const sMid = gl.getUniformLocation(skyProg, 'uMid');
  const sLow = gl.getUniformLocation(skyProg, 'uLow');
  const sSun = gl.getUniformLocation(skyProg, 'uSunDir');

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const skyVao = gl.createVertexArray();
  const skyVbo = gl.createBuffer();
  gl.bindVertexArray(skyVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, skyVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  bindMesh(); // set up the dynamic VAO's attribute layout once; draw() reuses it

  function bindMesh() {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  }

  function upload(builder, usage) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, builder.toFloat32(), usage);
    return builder.vertexCount;
  }

  let staticCount = 0;
  return {
    gl,
    /**
     * Paint one frame: sky, then the static city, then the dynamic actors the caller
     * rebuilt into `dyn` this frame. `camera` is {x, y, z, yaw, pitch}.
     */
    draw(camera, dyn) {
      const w = canvas.clientWidth || 1280, h = canvas.clientHeight || 800;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      // Sky (depth write off, drawn at the far plane).
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(skyProg);
      gl.uniform3fv(sTop, SKY.top); gl.uniform3fv(sMid, SKY.mid); gl.uniform3fv(sLow, SKY.low);
      gl.uniform2f(sSun, -0.52, 0.06);
      gl.bindVertexArray(skyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // World.
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(prog);
      const proj = perspective(1.0, W / H, 0.1, 420);
      const view = viewFrom(camera, camera.yaw, camera.pitch);
      gl.uniformMatrix4fv(uView, false, view);
      gl.uniformMatrix4fv(uMVP, false, multiply(proj, view));
      gl.uniform3fv(uSun, SUN_DIR);
      gl.uniform3fv(uFog, FOG_COLOUR);
      gl.uniform1f(uFogNear, 55);
      gl.uniform1f(uFogFar, 210);
      // Static geometry lives in its own buffer and VAO; dynamic actors in the other.
      gl.bindVertexArray(this._svao);
      gl.drawArrays(gl.TRIANGLES, 0, staticCount);
      gl.bindVertexArray(vao);
      const dynCount = upload(dyn, gl.DYNAMIC_DRAW);
      if (dynCount > 0) gl.drawArrays(gl.TRIANGLES, 0, dynCount);
    },
    /** Prepare the dedicated static buffer (called once by main after setStatic data exists). */
    initStatic(builder) {
      const svao = gl.createVertexArray();
      const svbo = gl.createBuffer();
      gl.bindVertexArray(svao);
      gl.bindBuffer(gl.ARRAY_BUFFER, svbo);
      gl.bufferData(gl.ARRAY_BUFFER, builder.toFloat32(), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
      this._svao = svao;
      staticCount = builder.vertexCount;
    },
  };
}
