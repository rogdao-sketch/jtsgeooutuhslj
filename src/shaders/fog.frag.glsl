precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uRes;
uniform float uReveal;
uniform float uPulse;
uniform float uScroll;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 p0 = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec2 p = p0 + vec2(uScroll * 0.35, uScroll * 1.6);
  float t = uTime * 0.045;

  // domain-warped fog, pushed by the pointer like a soft fluid
  vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 4.2));
  vec2 push = uMouse * 0.18;
  float d = length(p - push * 0.6);
  vec2 w = p + (q - 0.5) * 0.9 - push * exp(-d * 2.2);
  float f = fbm(w * 1.8 + vec2(0.0, -t * 2.0));
  float f2 = fbm(w * 3.4 + q * 2.0 + t);

  vec3 deep = vec3(0.435, 0.475, 0.560);
  vec3 mid  = vec3(0.620, 0.655, 0.725);
  vec3 high = vec3(0.835, 0.860, 0.905);
  vec3 col = mix(deep, mid, smoothstep(0.25, 0.65, f));
  col = mix(col, high, smoothstep(0.5, 0.85, f * 0.6 + f2 * 0.55));

  // horizon haze
  col = mix(col, high, smoothstep(0.1, -0.5, p0.y) * 0.55);
  col = mix(col, col * vec3(0.9, 0.93, 1.0), smoothstep(0.1, 0.7, uScroll) * 0.35);

  col *= 1.0 - smoothstep(0.55, 1.15, length(p0 * vec2(0.9, 1.15))) * 0.38;
  float g = hash(uv * uRes + fract(uTime)) - 0.5;
  col += g * 0.045;

  // fade in from the flat preloader colour
  vec3 base = vec3(0.604, 0.639, 0.710);
  // the composer works in linear space and encodes sRGB at the end
  gl_FragColor = vec4(pow(mix(base, col, uReveal), vec3(2.2)), 1.0);
}
