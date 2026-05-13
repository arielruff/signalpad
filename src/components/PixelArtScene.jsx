import React, { useRef, useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";

// Landscape canvas: 200×36 internal pixels, rendered CSS width:100% height:100%
// Each pixel ≈ 2×2 screen pixels in the 402×72-ish art panel
const W = 200, H = 36;

export const SCENES = [
  { id: "rain-mountains",   label: "Rain in Mountains",  category: "Weather" },
  { id: "thunderstorm",     label: "Thunderstorm",       category: "Weather" },
  { id: "snow-forest",      label: "Snowy Forest",       category: "Weather" },
  { id: "sunny-beach",      label: "Sunny Beach",        category: "Weather" },
  { id: "foggy-valley",     label: "Foggy Valley",       category: "Weather" },
  { id: "cyberpunk-city",   label: "Cyberpunk City",     category: "Scenes"  },
  { id: "space-nebula",     label: "Space Nebula",       category: "Scenes"  },
  { id: "cozy-cabin",       label: "Cozy Cabin",         category: "Scenes"  },
  { id: "deep-ocean",       label: "Deep Ocean",         category: "Scenes"  },
  { id: "cherry-blossom",   label: "Cherry Blossom",     category: "Scenes"  },
  { id: "starfield",        label: "Starfield",          category: "Scenes"  },
  { id: "ancient-ruins",    label: "Ancient Ruins",      category: "Scenes"  },
  { id: "campfire",         label: "Campfire",           category: "Scenes"  },
  { id: "northern-lights",  label: "Northern Lights",    category: "Scenes"  },
  { id: "desert-sunset",    label: "Desert Sunset",      category: "Scenes"  },
  { id: "underwater-cave",  label: "Underwater Cave",    category: "Scenes"  },
  { id: "lantern-festival", label: "Lantern Festival",   category: "Scenes"  },
  { id: "pixel-dungeon",    label: "Pixel Dungeon",      category: "Scenes"  },
  { id: "floating-islands", label: "Floating Islands",   category: "Scenes"  },
  { id: "arcade-room",      label: "Retro Arcade",       category: "Scenes"  },
];

// ─── Drawing primitives ────────────────────────────────────────────────────────

function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.max(1, w), Math.max(1, h));
}

function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

function hGrad(ctx, x, y, w, h, c1, c2) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

// Seed cache — stable randoms per scene
const SEEDS = {};
function seed(sceneId, key, factory) {
  if (!SEEDS[sceneId]) SEEDS[sceneId] = {};
  if (SEEDS[sceneId][key] === undefined) SEEDS[sceneId][key] = factory();
  return SEEDS[sceneId][key];
}
function rnd(min, max) { return Math.random() * (max - min) + min; }
function ri(min, max)  { return Math.floor(rnd(min, max + 1)); }

// ─── Horizon helper — draw a mountain ridge row by row ────────────────────────
function mountainRidge(ctx, color, peakY, slopeFactor) {
  for (let x = 0; x < W; x++) {
    // multi-octave to get irregular silhouette
    const h2 = peakY +
      Math.sin(x * 0.09) * 4 +
      Math.sin(x * 0.05 + 1.2) * 5 +
      Math.sin(x * 0.03 + 2.1) * 3;
    rect(ctx, x, Math.floor(h2), 1, H - Math.floor(h2), color);
  }
}

// ─── 1. Rain in Mountains ─────────────────────────────────────────────────────
function drawRainMountains(ctx, t) {
  hGrad(ctx, 0, 0, W, H, "#0f1e30", "#1a2e44");
  // distant range
  mountainRidge(ctx, "#1e3550", 16);
  // closer range
  mountainRidge(ctx, "#152840", 22);
  // ground
  rect(ctx, 0, 30, W, 6, "#0a1520");
  rect(ctx, 0, 30, W, 1, "#1e3040");
  // rain
  const drops = seed("rain-mountains", "drops", () =>
    Array.from({ length: 90 }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(1.5, 3.5) }))
  );
  ctx.fillStyle = "rgba(140,200,255,0.55)";
  drops.forEach(d => {
    const y = (d.y + t * d.s * 0.045) % H;
    ctx.fillRect(Math.floor(d.x), Math.floor(y), 1, 3);
  });
  // clouds
  [[10,3,45,6],[80,2,55,5],[155,4,40,6]].forEach(([x,y,w,h]) => {
    rect(ctx, x, y, w, h, "#182a3c");
    rect(ctx, x+4, y-2, w-8, 3, "#182a3c");
  });
}

// ─── 2. Thunderstorm ─────────────────────────────────────────────────────────
function drawThunderstorm(ctx, t) {
  const flash = Math.sin(t * 0.0025) > 0.96;
  rect(ctx, 0, 0, W, H, flash ? "#2a2a40" : "#09090f");
  // clouds
  [[0,0,90,14],[70,2,90,12],[140,0,60,13]].forEach(([x,y,w,h]) => {
    rect(ctx, x, y, w, h, flash ? "#40405a" : "#131320");
    rect(ctx, x+5, y-2, w-10, 5, flash ? "#40405a" : "#131320");
  });
  // lightning bolt
  if (flash) {
    const lx = 95;
    rect(ctx, lx-1, 12, 3, 6, "#ffffbb");
    rect(ctx, lx-3, 18, 6, 2, "#ffffbb");
    rect(ctx, lx, 20, 2, 8, "#ffffbb");
    ctx.fillStyle = "rgba(255,255,160,0.1)";
    ctx.fillRect(lx-12, 10, 26, 22);
  }
  // ground/puddles
  rect(ctx, 0, 31, W, 5, "#06060c");
  // heavy rain
  const drops = seed("thunderstorm", "drops", () =>
    Array.from({ length: 120 }, () => ({ x: rnd(0, W), y: rnd(0, H), s: rnd(2.5, 5) }))
  );
  ctx.fillStyle = "rgba(130,170,255,0.5)";
  drops.forEach(d => {
    const y = (d.y + t * d.s * 0.06) % H;
    ctx.fillRect(Math.floor(d.x), Math.floor(y), 1, 4);
  });
}

// ─── 3. Snow Forest ──────────────────────────────────────────────────────────
function drawSnowForest(ctx, t) {
  hGrad(ctx, 0, 0, W, H, "#c0ccd8", "#8898a8");
  // distant trees silhouette
  for (let x = 0; x < W; x += 9) {
    const h2 = 12 + Math.sin(x * 0.4) * 4;
    rect(ctx, x-1, H-6-h2, 3, h2, "#5a7080");
    rect(ctx, x-4, H-6-h2+3, 8, h2/2, "#5a7080");
  }
  // close trees
  const trees = seed("snow-forest", "trees", () =>
    Array.from({ length: 14 }, (_, i) => ({ x: i*15+ri(-3,3), h: ri(14,22) }))
  );
  trees.forEach(({ x, h: th }) => {
    rect(ctx, x-1, H-5-th, 2, th, "#2a3820");
    for (let i = 0; i < 3; i++) {
      const lw = 3+(2-i)*4, ly = H-5-th+i*(th/3);
      rect(ctx, x-lw, ly, lw*2, th/3+1, "#1a4a28");
      rect(ctx, x-lw+1, ly, lw*2-2, 2, "#d8e8f0");
    }
  });
  // snow ground
  rect(ctx, 0, H-5, W, 5, "#d0e0ef");
  rect(ctx, 0, H-6, W, 2, "#e8f0f8");
  // snowflakes
  const flakes = seed("snow-forest", "flakes", () =>
    Array.from({ length: 50 }, () => ({ x: rnd(0,W), y: rnd(0,H), s: rnd(0.3,0.9) }))
  );
  ctx.fillStyle = "#ffffff";
  flakes.forEach(f => {
    ctx.fillRect(Math.floor(f.x), Math.floor((f.y + t*f.s*0.015)%H), 1, 1);
  });
}

// ─── 4. Sunny Beach ──────────────────────────────────────────────────────────
function drawSunnyBeach(ctx, t) {
  hGrad(ctx, 0, 0, W, H*0.5, "#5bbaf0", "#7aceff");
  // sun
  rect(ctx, 168, 4, 10, 10, "#ffe060");
  [[168,2,10,2],[168,12,10,2],[165,5,3,6],[177,5,3,6]].forEach(([x,y,w,h]) => rect(ctx,x,y,w,h,"#ffe060"));
  // ocean
  const wv = Math.sin(t*0.002)*1;
  hGrad(ctx, 0, Math.floor(H*0.5+wv), W, Math.floor(H*0.35), "#1880c0", "#1060a0");
  // wave crests
  for (let i = 0; i < 5; i++) {
    const wx = (i*42 + Math.floor(t*0.04)) % (W+10) - 5;
    rect(ctx, wx, Math.floor(H*0.52+wv), 14, 1, "#60ccff");
  }
  // sand
  rect(ctx, 0, Math.floor(H*0.84), W, H, "#d4aa5a");
  rect(ctx, 0, Math.floor(H*0.84), W, 2, "#e8c870");
  // palm
  rect(ctx, 18, Math.floor(H*0.5), 2, Math.floor(H*0.38), "#5a3a1a");
  [[-10,-4],[4,-6],[9,-1],[-5,3]].forEach(([dx,dy]) => rect(ctx,18+dx,Math.floor(H*0.5)+dy,9,2,"#2a8040"));
}

// ─── 5. Foggy Valley ─────────────────────────────────────────────────────────
function drawFoggyValley(ctx, t) {
  hGrad(ctx, 0, 0, W, H, "#b0c0b8", "#90a898");
  // layered hills
  [{ y:18, c:"rgba(70,90,80,0.25)" }, { y:22, c:"rgba(60,80,70,0.3)" }, { y:26, c:"rgba(50,70,60,0.35)" }].forEach(({ y, c }) => {
    ctx.fillStyle = c;
    for (let x = 0; x < W; x++) {
      const h2 = Math.sin(x*0.05)*3 + Math.sin(x*0.03+1)*4 + 5;
      ctx.fillRect(x, Math.floor(y+h2*0.5), 1, Math.floor(h2));
    }
  });
  // rolling fog bands
  [0.18, 0.28, 0.35].forEach((a, i) => {
    const fogY = 14 + i*5 + Math.sin(t*0.001+i)*2;
    for (let y2 = 0; y2 < 8; y2++) {
      const fa = a * (1 - y2/8);
      ctx.fillStyle = `rgba(190,205,198,${fa.toFixed(2)})`;
      ctx.fillRect(0, Math.floor(fogY+y2), W, 1);
    }
  });
  rect(ctx, 0, H-5, W, 5, "#7a9080");
}

// ─── 6. Cyberpunk City ───────────────────────────────────────────────────────
function drawCyberpunkCity(ctx, t) {
  rect(ctx, 0, 0, W, H, "#04020a");
  // buildings silhouette
  const blds = seed("cyberpunk-city", "blds", () =>
    Array.from({ length: 22 }, (_, i) => ({ x: i*10-2+ri(-2,2), w: ri(7,13), h: ri(12,30) }))
  );
  blds.forEach(b => {
    rect(ctx, b.x, H-4-b.h, b.w, b.h, "#0a0618");
    // windows
    for (let wy = H-4-b.h+2; wy < H-5; wy+=3) {
      for (let wx = b.x+1; wx < b.x+b.w-1; wx+=3) {
        if (Math.sin(t*0.001+wx*0.4+wy*0.3)>0.2) {
          const cols = ["#ff1a3a","#00ffcc","#ff9900","#aa00ff","#00aaff"];
          px(ctx, wx, wy, cols[ri(0,4)]);
        }
      }
    }
  });
  // ground glow
  rect(ctx, 0, H-4, W, 4, "#07030d");
  rect(ctx, 0, H-4, W, 1, "#1a0030");
  // moving car/speeder
  const carX = (t*0.05)%(W+20)-10;
  rect(ctx, Math.floor(carX), H-6, 10, 2, "#ff1a3a");
  px(ctx, Math.floor(carX)-2, H-5, "#ff6644");
  px(ctx, Math.floor(carX)+11, H-5, "#00ffcc");
  // neon sign blink
  if (Math.sin(t*0.003)>0) rect(ctx, 40, 4, 20, 4, "rgba(0,255,200,0.3)");
}

// ─── 7. Space Nebula ─────────────────────────────────────────────────────────
function drawSpaceNebula(ctx, t) {
  rect(ctx, 0, 0, W, H, "#02010a");
  // nebula washes
  const neb = seed("space-nebula", "neb", () =>
    Array.from({ length: 60 }, () => ({ x: ri(0,W), y: ri(0,H), r: ri(3,12), hue: ri(240,320) }))
  );
  neb.forEach(n => {
    const a = 0.04 + Math.sin(t*0.0005+n.x)*0.015;
    ctx.fillStyle = `hsla(${n.hue},70%,55%,${a.toFixed(3)})`;
    for (let dy=-n.r; dy<=n.r; dy++)
      for (let dx=-n.r; dx<=n.r; dx++)
        if (dx*dx+dy*dy<=n.r*n.r) ctx.fillRect(n.x+dx, n.y+dy, 1, 1);
  });
  // stars
  const stars = seed("space-nebula", "stars", () =>
    Array.from({ length: 80 }, () => ({ x: rnd(0,W), y: rnd(0,H), b: rnd(0.3,1) }))
  );
  stars.forEach(s => {
    const b = s.b*(0.7+Math.sin(t*0.002+s.x)*0.3);
    ctx.fillStyle = `rgba(255,255,255,${b.toFixed(2)})`;
    ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
  });
  // planet left side
  for (let dy=-8; dy<=8; dy++)
    for (let dx=-8; dx<=8; dx++)
      if (dx*dx+dy*dy<=64) rect(ctx,15+dx,18+dy,1,1,`rgb(${30+dx+8},${20},${90+dy+8})`);
  // ring
  for (let dx=-13; dx<=13; dx++) {
    const dy = Math.floor(Math.sin(dx*0.15)*2);
    if (Math.abs(dx)>6) px(ctx,15+dx,18+dy,"#9966ff");
  }
}

// ─── 8. Cozy Cabin ───────────────────────────────────────────────────────────
function drawCozyCabin(ctx, t) {
  // night sky
  rect(ctx, 0, 0, W, H, "#040810");
  const stars = seed("cozy-cabin","stars",() => Array.from({length:35},()=>({x:rnd(0,W),y:rnd(0,18)})));
  stars.forEach(s => px(ctx,Math.floor(s.x),Math.floor(s.y),"rgba(255,255,220,0.8)"));
  // moon
  rect(ctx, 180, 3, 10, 10, "#e0d8b0");
  rect(ctx, 182, 5, 6, 6, "#040810"); // crescent
  // snow ground
  rect(ctx, 0, H-7, W, 7, "#b8ccd8");
  rect(ctx, 0, H-8, W, 2, "#d0e0ec");
  // cabin
  rect(ctx, 60, H-22, 80, 15, "#2a1608");
  // roof
  for (let i=0;i<18;i++) rect(ctx,60+i*2.2,H-22-i*0.9,Math.max(1,80-i*4.4),1,"#1a1208");
  rect(ctx, 0, H-24, W, 2, "#1a1208");
  // warm windows glow
  const fl = Math.sin(t*0.007)*0.04;
  rect(ctx, 70, H-20, 14, 10, `rgba(255,160,40,${0.85+fl})`);
  rect(ctx, 116, H-20, 14, 10, `rgba(255,160,40,${0.85+fl})`);
  // warm glow on snow
  ctx.fillStyle = `rgba(255,120,30,${0.06+fl*0.5})`;
  ctx.fillRect(55, H-10, 90, 10);
  // distant trees
  [10,25,40,155,170,185].forEach(x => {
    const th = ri(10,16);
    rect(ctx,x-1,H-7-th,2,th,"#081810");
    rect(ctx,x-4,H-7-th,8,th/2,"#081810");
  });
  // chimney smoke
  const smX = 125;
  for (let i=1;i<=4;i++) {
    const sy = H-24-i*4+Math.sin(t*0.005+i)*2;
    ctx.fillStyle = `rgba(180,180,200,${0.15-i*0.03})`;
    ctx.fillRect(Math.floor(smX+Math.sin(t*0.004+i)*3), Math.floor(sy), 4, 3);
  }
}

// ─── 9. Deep Ocean ───────────────────────────────────────────────────────────
function drawDeepOcean(ctx, t) {
  for (let y=0;y<H;y++) {
    const f=y/H;
    rect(ctx,0,y,W,1,`rgb(${Math.floor(2+f*8)},${Math.floor(20+f*35)},${Math.floor(65-f*45)})`);
  }
  // light shafts
  for (let i=0;i<6;i++) {
    const rx = 20+i*32+Math.sin(t*0.001+i)*6;
    ctx.fillStyle = "rgba(80,180,255,0.035)";
    for (let y=0;y<H*0.7;y++) { const w2=y*0.12+1; ctx.fillRect(Math.floor(rx-w2/2),y,Math.ceil(w2),1); }
  }
  // seaweed
  const weeds = seed("deep-ocean","weeds",()=>Array.from({length:14},()=>({x:ri(5,W-5),seg:ri(4,7)})));
  weeds.forEach(w => {
    for (let i=0;i<w.seg;i++) {
      const sx = w.x+Math.sin(t*0.002+w.x+i)*3;
      rect(ctx,Math.floor(sx),H-4-i*3,2,3,"#1a6030");
    }
  });
  // fish
  const fish = seed("deep-ocean","fish",()=>Array.from({length:8},()=>({x:rnd(0,W),y:rnd(5,H-8),s:rnd(0.2,0.8),c:["#ff8800","#ff3366","#00ffcc","#ffff44"][ri(0,3)]})));
  fish.forEach(f => {
    const fx=(f.x+t*f.s*0.025)%(W+10)-5;
    rect(ctx,Math.floor(fx),Math.floor(f.y),7,3,f.c);
    rect(ctx,Math.floor(fx)-3,Math.floor(f.y)+1,4,2,f.c);
    px(ctx,Math.floor(fx)+6,Math.floor(f.y)+1,"#fff");
  });
  // bubbles
  const bubs = seed("deep-ocean","bubs",()=>Array.from({length:12},()=>({x:rnd(5,W-5),y:rnd(0,H),s:rnd(0.15,0.4)})));
  bubs.forEach(b => {
    const by=(b.y-t*b.s*0.02+H)%H;
    ctx.fillStyle="rgba(150,220,255,0.45)";
    ctx.fillRect(Math.floor(b.x),Math.floor(by),2,2);
  });
}

// ─── 10. Cherry Blossom ──────────────────────────────────────────────────────
function drawCherryBlossom(ctx, t) {
  hGrad(ctx, 0, 0, W, H, "#fce8f2", "#f8d8e8");
  // ground
  rect(ctx, 0, H-6, W, 6, "#c8e0a0");
  rect(ctx, 0, H-7, W, 2, "#d8eca8");
  // path
  rect(ctx, 70, H-6, 60, 6, "#e0d0b0");
  // trees
  [20, 55, 100, 145, 175].forEach(x => {
    const th = ri(16, 24);
    rect(ctx, x-2, H-6-th, 4, th, "#5a3020");
    // blossom
    for (let dy=-10;dy<=2;dy++) for (let dx=-12;dx<=12;dx++)
      if (dx*dx*0.5+dy*dy<80 && Math.random()>0.35)
        px(ctx,x+dx,H-6-th+dy,Math.random()>0.4?"#f090b8":"#fbbad0");
  });
  // petals
  const petals = seed("cherry-blossom","petals",()=>Array.from({length:45},()=>({x:rnd(0,W),y:rnd(0,H),s:rnd(0.2,0.65),sw:rnd(0,Math.PI*2)})));
  petals.forEach(p => {
    const py=(p.y+t*p.s*0.02)%H;
    const px2=p.x+Math.sin(t*0.002+p.sw)*5;
    rect(ctx,Math.floor(px2),Math.floor(py),2,2,"#f090b8");
  });
}

// ─── 11. Starfield ───────────────────────────────────────────────────────────
function drawStarfield(ctx, t) {
  rect(ctx, 0, 0, W, H, "#01020a");
  // milky way band
  ctx.fillStyle = "rgba(160,140,220,0.04)";
  for (let x=0;x<W;x++) { const bh=6+Math.sin(x*0.06)*4; ctx.fillRect(x,Math.floor(14+Math.sin(x*0.05)*5),1,Math.floor(bh)); }
  // three parallax layers
  [{ n:40,s:0.6 },{ n:30,s:0.35 },{ n:20,s:0.18 }].forEach(({ n, s }, li) => {
    const stars = seed("starfield",`l${li}`,()=>Array.from({length:n},()=>({x:rnd(0,W),y:rnd(0,H)})));
    stars.forEach(st => {
      const sx=(st.x+t*s*0.008)%W;
      const b=0.5+Math.sin(t*0.002+st.x*0.5)*0.5;
      ctx.fillStyle=`rgba(255,255,255,${b.toFixed(2)})`;
      ctx.fillRect(Math.floor(sx),Math.floor(st.y),1,1);
    });
  });
  // shooting star
  const ss=(t*0.05)%(W*2);
  if (ss<W+20) {
    rect(ctx,Math.floor(W-ss),Math.floor(8+ss*0.04),6,1,"#ffffff");
    rect(ctx,Math.floor(W-ss+6),Math.floor(8+ss*0.04),10,1,"rgba(255,255,255,0.25)");
  }
}

// ─── 12. Ancient Ruins ───────────────────────────────────────────────────────
function drawAncientRuins(ctx, t) {
  hGrad(ctx, 0, 0, W, H*0.7, "#4a2810", "#1a0e06");
  rect(ctx, 0, Math.floor(H*0.7), W, H, "#18100a");
  rect(ctx, 0, Math.floor(H*0.7), W, 2, "#2a1808");
  // column silhouettes
  [15,35,58,80,108,130,155,175].forEach(x => {
    const ch = ri(18,28);
    rect(ctx,x-3,H-5-ch,6,ch,"#0e0a06");
    rect(ctx,x-5,H-5-ch,10,3,"#151008");
    rect(ctx,x-5,H-5-Math.floor(ch/2),10,3,"#151008");
  });
  // ruins arch
  rect(ctx,85,H-20,30,15,"#0c0806");
  rect(ctx,85,H-20,8,12,"#151008");
  rect(ctx,107,H-20,8,12,"#151008");
  rect(ctx,85,H-22,30,4,"#181208");
  // fireflies
  const flies = seed("ancient-ruins","flies",()=>Array.from({length:10},()=>({x:rnd(20,W-20),y:rnd(12,H-8)})));
  flies.forEach((f,i) => {
    if (Math.sin(t*0.003+i*1.3)>0.2) {
      const gx=f.x+Math.sin(t*0.0008+i)*20, gy=f.y+Math.cos(t*0.0008+i)*8;
      ctx.fillStyle="rgba(180,255,80,0.8)";
      ctx.fillRect(Math.floor(gx),Math.floor(gy),1,1);
      ctx.fillStyle="rgba(180,255,80,0.15)";
      ctx.fillRect(Math.floor(gx)-1,Math.floor(gy)-1,3,3);
    }
  });
  // vines
  const vines=seed("ancient-ruins","vines",()=>Array.from({length:16},()=>({x:ri(0,W),y:ri(0,12),l:ri(4,14)})));
  vines.forEach(v => rect(ctx,v.x,v.y,1,v.l,"#1a4015"));
}

// ─── 13. Campfire ────────────────────────────────────────────────────────────
function drawCampfire(ctx, t) {
  rect(ctx, 0, 0, W, H, "#040804");
  // stars
  const stars=seed("campfire","stars",()=>Array.from({length:40},()=>({x:rnd(0,W),y:rnd(0,18)})));
  stars.forEach(s=>px(ctx,Math.floor(s.x),Math.floor(s.y),"rgba(255,255,230,0.75)"));
  // tree silhouettes
  [5,22,38,155,172,190].forEach(x=>{
    const th=ri(14,22);
    rect(ctx,x-2,H-5-th,3,th,"#020604");
    for(let i=0;i<3;i++){const lw=(3-i)*6;rect(ctx,x-lw,H-5-th+i*(th/3),lw*2,th/3+1,"#020604");}
  });
  // ground
  rect(ctx, 0, H-5, W, 5, "#070c06");
  // logs
  rect(ctx,88,H-8,24,5,"#2a1208");
  rect(ctx,82,H-10,12,4,"#2a1208");
  rect(ctx,106,H-10,12,4,"#2a1208");
  // fire
  const fl=Math.sin(t*0.012)*2;
  rect(ctx,96,H-14-Math.floor(fl),8,9+Math.floor(fl),"#ff4400");
  rect(ctx,98,H-17-Math.floor(fl),5,11+Math.floor(fl),"#ff8800");
  rect(ctx,99,H-19-Math.floor(fl*0.6),3,9+Math.floor(fl*0.6),"#ffcc00");
  // glow
  ctx.fillStyle=`rgba(255,100,0,${0.07+Math.sin(t*0.012)*0.025})`;
  ctx.fillRect(70,H-22,60,22);
  // sparks
  const sparks=seed("campfire","sparks",()=>Array.from({length:10},()=>({dx:rnd(-4,4),s:rnd(0.4,0.9)})));
  sparks.forEach((s,i)=>{
    const sy=H-18-((t*s.s*0.025+i*3)%18);
    const sx=100+s.dx+Math.sin(t*0.006+i)*2;
    if(sy<H-10&&Math.random()>0.3)px(ctx,Math.floor(sx),Math.floor(sy),Math.random()>0.5?"#ff8800":"#ffff00");
  });
}

// ─── 14. Northern Lights ─────────────────────────────────────────────────────
function drawNorthernLights(ctx, t) {
  rect(ctx, 0, 0, W, H, "#010a0a");
  // stars
  const stars=seed("northern-lights","stars",()=>Array.from({length:45},()=>({x:rnd(0,W),y:rnd(0,22)})));
  stars.forEach(s=>px(ctx,Math.floor(s.x),Math.floor(s.y),"rgba(255,255,255,0.65)"));
  // aurora bands
  [{ hue:150,off:0 },{ hue:170,off:1.2 },{ hue:190,off:2.4 },{ hue:270,off:3.6 }].forEach(({hue,off})=>{
    for(let x=0;x<W;x++){
      const base=6+Math.sin(x*0.04+t*0.001+off)*5;
      const bh=8+Math.sin(x*0.06+t*0.0012+off)*4;
      for(let y=base;y<base+bh;y++){
        const a=(1-Math.abs((y-base-bh/2)/(bh/2)))*0.18;
        ctx.fillStyle=`hsla(${hue},80%,60%,${a.toFixed(3)})`;
        ctx.fillRect(x,Math.floor(y),1,1);
      }
    }
  });
  // mountain silhouette
  for(let x=0;x<W;x++){
    const h2=H-6-(Math.sin(x*0.07)*5+Math.sin(x*0.04+1.2)*6+5);
    rect(ctx,x,Math.floor(h2),1,H-Math.floor(h2),"#000a08");
  }
}

// ─── 15. Desert Sunset ───────────────────────────────────────────────────────
function drawDesertSunset(ctx, t) {
  // sunset sky gradient
  hGrad(ctx, 0, 0, W, Math.floor(H*0.65), "#ff6020", "#ffcc40");
  hGrad(ctx, 0, Math.floor(H*0.3), W, Math.floor(H*0.35), "#cc4010", "#ff6020");
  // sun
  for(let dy=-7;dy<=7;dy++) for(let dx=-7;dx<=7;dx++) if(dx*dx+dy*dy<=49) rect(ctx,160+dx,12+dy,1,1,"#ffee00");
  // dunes
  for(let x=0;x<W;x++){
    const dh=Math.sin(x*0.04)*5+Math.sin(x*0.025)*8+10;
    rect(ctx,x,Math.floor(H*0.65+dh*0.4),1,H,"#b06828");
  }
  rect(ctx,0,Math.floor(H*0.65),W,H,"#b06828");
  // dune highlight
  for(let x=0;x<W;x++){
    const dh=Math.sin(x*0.04)*5+Math.sin(x*0.025)*8+10;
    rect(ctx,x,Math.floor(H*0.65+dh*0.4),1,2,"#d0883a");
  }
  // cacti
  [[20,H-10],[65,H-12],[120,H-9],[165,H-11]].forEach(([x,y])=>{
    rect(ctx,x-2,y-12,4,12,"#1a5020");
    rect(ctx,x-7,y-9,5,3,"#1a5020"); rect(ctx,x-7,y-12,2,4,"#1a5020");
    rect(ctx,x+2,y-7,5,3,"#1a5020"); rect(ctx,x+4,y-10,2,4,"#1a5020");
  });
}

// ─── 16. Underwater Cave ─────────────────────────────────────────────────────
function drawUnderwaterCave(ctx, t) {
  rect(ctx, 0, 0, W, H, "#010809");
  // bio glow patches
  const glows=seed("underwater-cave","glows",()=>Array.from({length:18},()=>({x:rnd(10,W-10),y:rnd(8,H-8),r:rnd(3,9),hue:ri(155,220)})));
  glows.forEach(g=>{
    const a=0.04+Math.sin(t*0.002+g.x)*0.025;
    ctx.fillStyle=`hsla(${g.hue},90%,60%,${a.toFixed(3)})`;
    for(let dy=-g.r;dy<=g.r;dy++) for(let dx=-g.r;dx<=g.r;dx++)
      if(dx*dx+dy*dy<=g.r*g.r) ctx.fillRect(Math.floor(g.x+dx),Math.floor(g.y+dy),1,1);
  });
  // stalactites from top
  const stals=seed("underwater-cave","stals",()=>Array.from({length:16},()=>({x:ri(5,W-5),h:ri(4,12),w:ri(2,5)})));
  stals.forEach(s=>{
    for(let i=0;i<s.h;i++){const ww=Math.max(1,Math.floor((s.h-i)/s.h*s.w));rect(ctx,s.x-Math.floor(ww/2),i,ww,1,"#030c0e");}
  });
  // cave floor bumps
  for(let x=0;x<W;x++){const bh=2+Math.sin(x*0.2)*2;rect(ctx,x,H-Math.floor(bh)-1,1,Math.floor(bh)+1,"#030c0e");}
  // glowing fish
  const fish=seed("underwater-cave","fish",()=>Array.from({length:5},()=>({x:rnd(0,W),y:rnd(8,H-10),s:rnd(0.15,0.5),hue:ri(150,300)})));
  fish.forEach(f=>{
    const fx=(f.x+t*f.s*0.02)%(W+8)-4;
    ctx.fillStyle=`hsl(${f.hue},90%,70%)`;
    ctx.fillRect(Math.floor(fx),Math.floor(f.y),6,2);
    ctx.fillStyle=`hsla(${f.hue},90%,70%,0.3)`;
    ctx.fillRect(Math.floor(fx)-2,Math.floor(f.y)-1,10,4);
  });
}

// ─── 17. Lantern Festival ────────────────────────────────────────────────────
function drawLanternFestival(ctx, t) {
  rect(ctx, 0, 0, W, H, "#06030f");
  // stars
  const stars=seed("lantern-festival","stars",()=>Array.from({length:40},()=>({x:rnd(0,W),y:rnd(0,22)})));
  stars.forEach(s=>px(ctx,Math.floor(s.x),Math.floor(s.y),"rgba(255,255,200,0.7)"));
  // pagoda silhouette at right
  [[172,H-6,20],[175,H-11,16],[178,H-15,12]].forEach(([x,y,w])=>{
    rect(ctx,x-w/2,y,w,6,"#08040d");
    rect(ctx,x-w/2-3,y,w+6,2,"#08040d");
  });
  // lanterns
  const lanterns=seed("lantern-festival","lanterns",()=>Array.from({length:22},()=>({
    x:rnd(5,165),y:rnd(4,H-6),s:rnd(0.08,0.35),sw:rnd(0,Math.PI*2),
    c:["#ff6600","#ff3300","#ffaa00","#ff4400"][ri(0,3)]
  })));
  lanterns.forEach((l,i)=>{
    const ly=(l.y-t*l.s*0.015+H*2)%(H-2)+1;
    const lx=l.x+Math.sin(t*0.001+l.sw)*4;
    ctx.fillStyle=`rgba(255,140,0,${(0.05+Math.sin(t*0.003+i)*0.02).toFixed(3)})`;
    ctx.fillRect(Math.floor(lx)-4,Math.floor(ly)-4,8,8);
    ctx.fillStyle=l.c;
    ctx.fillRect(Math.floor(lx)-2,Math.floor(ly)-3,5,6);
    px(ctx,Math.floor(lx),Math.floor(ly)-4,"#ffff88");
  });
}

// ─── 18. Pixel Dungeon ───────────────────────────────────────────────────────
function drawPixelDungeon(ctx, t) {
  rect(ctx, 0, 0, W, H, "#080508");
  // stone bricks
  for(let y=0;y<H;y+=6) for(let x=(y%12===0?0:3);x<W;x+=6){
    rect(ctx,x,y,5,5,"#0f0c0f"); rect(ctx,x,y,5,1,"#141014"); rect(ctx,x,y,1,5,"#141014");
  }
  // floor
  rect(ctx,0,H-6,W,6,"#0a0808");
  for(let x=0;x<W;x+=8) rect(ctx,x,H-6,1,6,"#070606");
  // corridor
  rect(ctx,60,0,80,H,"#080508");
  for(let y=0;y<H;y+=6){rect(ctx,60,y,1,5,"#0d0a0d");rect(ctx,139,y,1,5,"#0d0a0d");}
  // torches
  [[30,H-18],[100,H-22],[170,H-18]].forEach(([x,y])=>{
    rect(ctx,x-1,y+6,3,8,"#3a1a08");
    const fl=Math.sin(t*0.015+x)*2;
    rect(ctx,x-2,y-Math.floor(fl),5,8+Math.floor(fl),"#ff5500");
    rect(ctx,x-1,y-2-Math.floor(fl),3,6+Math.floor(fl),"#ff9900");
    px(ctx,x,y-4-Math.floor(fl),"#ffee00");
    ctx.fillStyle=`rgba(255,110,0,${(0.06+Math.sin(t*0.015+x)*0.02).toFixed(3)})`;
    ctx.fillRect(x-10,y-8,20,18);
  });
  // door
  rect(ctx,90,H-16,20,16,"#1e0c06");rect(ctx,91,H-15,18,14,"#140a04");rect(ctx,107,H-10,2,4,"#3a1a08");
}

// ─── 19. Floating Islands ────────────────────────────────────────────────────
function drawFloatingIslands(ctx, t) {
  hGrad(ctx, 0, 0, W, H, "#6ab4ee", "#a8d4f8");
  // clouds bg
  [[10,6,40,8],[90,4,50,7],[160,8,35,6]].forEach(([x,y,w,h])=>{
    ctx.fillStyle="rgba(255,255,255,0.7)";
    ctx.fillRect(x,y,w,h);ctx.fillRect(x+4,y-3,w-8,h);
  });
  // islands
  seed("floating-islands","islands",()=>[
    {x:30,y:16,w:55,h:8},{x:110,y:22,w:45,h:7},{x:165,y:14,w:40,h:7},{x:5,y:25,w:30,h:6}
  ]).forEach((isl,i)=>{
    const bob=Math.sin(t*0.001+i*1.5)*2;
    const iy=Math.floor(isl.y+bob);
    rect(ctx,isl.x,iy,isl.w,4,"#5a9830");rect(ctx,isl.x,iy,isl.w,2,"#78b840");
    for(let r=0;r<isl.h;r++){const sh=Math.floor(r*0.25);rect(ctx,isl.x+sh,iy+3+r,Math.max(4,isl.w-sh*2),1,"#4a3018");}
    // trees
    rect(ctx,isl.x+4,iy-10,2,10,"#2a1a0a");rect(ctx,isl.x,iy-14,10,8,"#1a6028");rect(ctx,isl.x+2,iy-18,6,7,"#1a6028");
    // waterfall from first island
    if(i===0) for(let wy=iy+isl.h+3;wy<iy+isl.h+12;wy++){
      ctx.fillStyle=`rgba(100,180,255,${(0.4+Math.sin(t*0.006+wy)*0.2).toFixed(2)})`;
      ctx.fillRect(isl.x+isl.w-6,wy,4,1);
    }
  });
}

// ─── 20. Retro Arcade ────────────────────────────────────────────────────────
function drawArcadeRoom(ctx, t) {
  rect(ctx, 0, 0, W, H, "#080510");
  // floor
  rect(ctx,0,H-7,W,7,"#0c0810");
  for(let y=H-7;y<H;y+=4) for(let x=0;x<W;x+=4) if(((Math.floor(x/4)+Math.floor(y/4))%2)===0)rect(ctx,x,y,4,4,"#100c18");
  // cabinets
  const cabs=[{x:5,sc:"#00ffcc",cc:"#0a001a"},{x:30,sc:"#ff1a3a",cc:"#1a000a"},{x:57,sc:"#00aaff",cc:"#00081a"},{x:84,sc:"#ffcc00",cc:"#0e0a00"},{x:113,sc:"#ff44aa",cc:"#180010"},{x:140,sc:"#44ffaa",cc:"#001808"},{x:167,sc:"#ff8800",cc:"#180400"}];
  cabs.forEach(c=>{
    rect(ctx,c.x,H-7-28,18,28,c.cc);
    rect(ctx,c.x+1,H-7-26,16,14,"#080508");
    // glowing screen
    const sg=0.6+Math.sin(t*0.005+c.x)*0.3;
    ctx.fillStyle=c.sc+Math.floor(sg*255).toString(16).padStart(2,"0");
    ctx.fillRect(c.x+2,H-32,14,12);
    // screen glow
    ctx.fillStyle=c.sc.replace("rgb","rgba").replace(")",`,${(sg*0.08).toFixed(3)})`)||`rgba(100,200,255,${(sg*0.06).toFixed(3)})`;
    ctx.fillRect(c.x-2,H-35,22,18);
    // buttons
    [c.x+3,c.x+8,c.x+13].forEach((bx,i)=>px(ctx,bx,H-14,["#ff0044","#00ee88","#0055ff"][i]));
    rect(ctx,c.x+5,H-10,8,4,"#1a1228");
    px(ctx,c.x+9,H-13,"#aaa");
  });
  // neon signs
  const sg=0.7+Math.sin(t*0.004)*0.3;
  ctx.fillStyle=`rgba(0,200,255,${sg.toFixed(2)})`;
  rect(ctx,60,3,20,3,`rgba(0,200,255,${(sg*0.4).toFixed(2)})`);
  for(let i=0;i<4;i++) ctx.fillRect(61+i*5,3,3,3);
  ctx.fillStyle=`rgba(255,0,100,${sg.toFixed(2)})`;
  for(let i=0;i<4;i++) ctx.fillRect(100+i*5,3,3,3);
}

// ─── Scene dispatch ────────────────────────────────────────────────────────────

const SCENE_FNS = {
  "rain-mountains":   drawRainMountains,
  "thunderstorm":     drawThunderstorm,
  "snow-forest":      drawSnowForest,
  "sunny-beach":      drawSunnyBeach,
  "foggy-valley":     drawFoggyValley,
  "cyberpunk-city":   drawCyberpunkCity,
  "space-nebula":     drawSpaceNebula,
  "cozy-cabin":       drawCozyCabin,
  "deep-ocean":       drawDeepOcean,
  "cherry-blossom":   drawCherryBlossom,
  "starfield":        drawStarfield,
  "ancient-ruins":    drawAncientRuins,
  "campfire":         drawCampfire,
  "northern-lights":  drawNorthernLights,
  "desert-sunset":    drawDesertSunset,
  "underwater-cave":  drawUnderwaterCave,
  "lantern-festival": drawLanternFestival,
  "pixel-dungeon":    drawPixelDungeon,
  "floating-islands": drawFloatingIslands,
  "arcade-room":      drawArcadeRoom,
};

// ─── Document snapshot ─────────────────────────────────────────────────────────

function drawDocSnapshot(ctx, noteContent) {
  rect(ctx, 0, 0, W, H, "#0a0c14");
  // title bar sim
  rect(ctx, 6, 4, W-40, 3, "#3a4060");
  rect(ctx, 6, 10, W-60, 1, "#252a3a");
  // simulated text lines
  const div = document.createElement("div");
  div.innerHTML = noteContent || "";
  const text = (div.textContent || "").slice(0, 300);
  const words = text.split(/\s+/).filter(Boolean);
  let x = 6, y = 15, lineH = 4;
  words.forEach(word => {
    const wl = Math.min(word.length * 2, W - 14);
    if (x + wl > W - 8) { x = 6; y += lineH + 2; }
    if (y > H - 5) return;
    ctx.fillStyle = `rgba(160,170,200,${(0.15 + Math.random() * 0.12).toFixed(2)})`;
    ctx.fillRect(x, y, wl, 2);
    x += wl + 3;
  });
  ctx.strokeStyle = "#1e2440";
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, W-2, H-2);
}

// ─── SceneCanvas ──────────────────────────────────────────────────────────────

export function SceneCanvas({ sceneId, noteContent }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const t0        = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    function frame() {
      const t = performance.now() - t0.current;
      ctx.clearRect(0, 0, W, H);
      if (sceneId && SCENE_FNS[sceneId]) SCENE_FNS[sceneId](ctx, t);
      else drawDocSnapshot(ctx, noteContent);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sceneId, noteContent]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block" }}
    />
  );
}

// ─── Card scene picker ────────────────────────────────────────────────────────
// (imported by SignalPad — not used here directly)

export default SceneCanvas;
