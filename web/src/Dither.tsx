import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

/// M1 (web/DESIGN.md): the landing hero's sky. A slow value-noise field, brighter toward the bottom like a horizon,
/// quantized to four tones (ground, deep blue, electric blue, lime) with a 4×4 Bayer dither in 3px cells. Runs only
/// while on screen, draws one still frame under reduced motion, and leaves .hero-bg's CSS gradient showing if WebGL
/// is unavailable. No loseContext() on cleanup: StrictMode remounts on the same canvas and a lost context stays blank.
const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
const FRAG = `precision mediump float;
uniform vec2 r;uniform float t;uniform float cell;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int k=0;k<5;k++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
float b2(vec2 a){a=floor(a);return fract(a.x*.5+a.y*a.y*.75);}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
void main(){
  vec2 px=floor(gl_FragCoord.xy/cell);
  vec2 uv=px*cell/r.y;
  float y=gl_FragCoord.y/r.y;
  float v=fbm(uv*1.6+vec2(t*.05,-t*.03))*.85+(1.-y)*.34-.14;
  float q=v+(b4(px)-.5)*.28;
  vec3 g=vec3(.027,.039,.09),d=vec3(.07,.12,.37),a=vec3(.169,.349,1.),l=vec3(.776,.957,.196);
  gl_FragColor=vec4(q<.42?g:(q<.55?d:(q<.68?a:l)),1.);
}`;

export function Dither() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const gl = c?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!c || !gl) return;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, "r"), uT = gl.getUniformLocation(prog, "t"), uCell = gl.getUniformLocation(prog, "cell");

    const still = prefersReducedMotion();
    const t0 = performance.now();
    let raf = 0, visible = true;
    const draw = (now: number) => {
      gl.uniform1f(uT, (now - t0) / 1000 + 4);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.max(1, Math.round(c.clientWidth * dpr));
      c.height = Math.max(1, Math.round(c.clientHeight * dpr));
      gl.viewport(0, 0, c.width, c.height);
      gl.uniform2f(uR, c.width, c.height);
      gl.uniform1f(uCell, Math.round(3 * dpr));
      draw(performance.now());
    };
    const tick = (now: number) => {
      draw(now);
      if (visible) raf = requestAnimationFrame(tick);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !still) raf = requestAnimationFrame(tick);
    });
    io.observe(c);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="dither" aria-hidden="true" />;
}
