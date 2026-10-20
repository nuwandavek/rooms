import * as THREE from 'three';

// Builds three.js materials from library/materials.json definitions. Every texture is
// drawn procedurally on a canvas and sized in metres: geometry carries metre UVs, so
// `repeat` is one over the texture's real-world size and a 0.8 m tile is 0.8 m anywhere.
//
//   paint    {colour, roughness?, metalness?}
//   tiles    {size:[w,h], colour, grout?:{width, colour}, pattern?:grid|brick|diagonal,
//             variation?, veining?, veinColour?, motif?:lattice, motifColour?}
//   marble   {size:[w,h], colour, veinColour, veins?:soft|stripes, density?}
//   speckle  {colour, flecks:[colours], density?, scale?}
//   wood     {colour, grain, size?}
//   stripes  {colours:[...], width}   vertical bands
//
// `roughness` and `metalness` apply to every kind. Kinds and fields are checked at build
// time by kit/fitout.js.
const PX=512;

function random(seed) {
  let h=1779033703;
  for(const c of seed)h=Math.imul(h^c.charCodeAt(0),3432918353),h=h<<13|h>>>19;
  return ()=>{h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return ((h^=h>>>16)>>>0)/4294967296;};
}
const shade=(hex,amount)=>{const c=new THREE.Color(hex);c.offsetHSL(0,0,amount);return `#${c.getHexString()}`;};

function veins(ctx,rand,w,h,colour,style,density=1) {
  ctx.strokeStyle=colour;
  if(style==='stripes') {
    // Straight vertical bands of varying weight, like banded marble.
    for(let x=0;x<w;) {
      ctx.globalAlpha=.15+rand()*.5;ctx.lineWidth=1+rand()*rand()*w*.03;
      ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();  // Exactly vertical, so it repeats without a seam.
      x+=(2+rand()*w*.05)/density;
    }
  } else {
    // Soft drifting veins: a broad faint pass under a thin one, wandering gently.
    for(let i=0;i<Math.round(5*density);i++) {
      let x=rand()*w,y=rand()*h,a=rand()*Math.PI;const points=[[x,y]];
      for(let s=0;s<40;s++){a+=(rand()-.5)*.35;x+=Math.cos(a)*w*.025;y+=Math.sin(a)*h*.025;points.push([x,y]);}
      for(const [width,alpha] of [[3+rand()*5,.06],[.6+rand(),.18+rand()*.15]]) {
        ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.lineJoin='round';
        ctx.beginPath();points.forEach(([px,py],k)=>k?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.stroke();
      }
    }
  }
  ctx.globalAlpha=1;
}

// Returns {canvas, size:[metres across, metres up]} for one repeat of the pattern.
function draw(id,def) {
  const rand=random(id),canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  const square=(size)=>{canvas.width=PX;canvas.height=Math.round(PX*size[1]/size[0]);return [canvas.width,canvas.height];};
  if(def.kind==='tiles') {
    const [tw,th]=def.size,cols=2,rows=2;
    const [W,H]=square([tw*cols,th*rows]),cw=W/cols,ch=H/rows,g=Math.max(1,(def.grout?.width ?? .002)/tw*cw);
    ctx.fillStyle=def.grout?.colour || shade(def.colour,-.08);ctx.fillRect(0,0,W,H);
    const tile=(x,y)=>{
      ctx.save();ctx.beginPath();ctx.rect(x+g/2,y+g/2,cw-g,ch-g);ctx.clip();
      ctx.fillStyle=shade(def.colour,(rand()-.5)*(def.variation ?? .03)*2);ctx.fillRect(x,y,cw,ch);
      if(def.veining){ctx.translate(x,y);veins(ctx,rand,cw,ch,def.veinColour || shade(def.colour,-.25),'soft',def.veining*2);ctx.translate(-x,-y);}
      if(def.motif==='lattice') {
        ctx.strokeStyle=def.motifColour || shade(def.colour,-.12);ctx.lineWidth=Math.max(1,cw*.012);
        const step=cw/5;
        for(let k=-ch;k<cw+ch;k+=step){ctx.beginPath();ctx.moveTo(x+k,y);ctx.lineTo(x+k+ch,y+ch);ctx.moveTo(x+k,y+ch);ctx.lineTo(x+k+ch,y);ctx.stroke();}
      }
      ctx.restore();
    };
    for(let r=0;r<rows;r++)for(let c=-1;c<=cols;c++) {
      const offset=def.pattern==='brick'&&r%2?cw/2:0;
      tile(c*cw+offset,r*ch);
    }
    return {canvas,size:[tw*cols,th*rows]};
  }
  if(def.kind==='marble') {
    const [W,H]=square(def.size);
    ctx.fillStyle=def.colour;ctx.fillRect(0,0,W,H);
    veins(ctx,rand,W,H,def.veinColour,def.veins || 'soft',def.density ?? 1);
    return {canvas,size:def.size};
  }
  if(def.kind==='speckle') {
    const size=def.scale ?? .4,[W,H]=square([size,size]);
    ctx.fillStyle=def.colour;ctx.fillRect(0,0,W,H);
    const count=Math.round(W*H*(def.density ?? .4)*.02);
    for(let i=0;i<count;i++){ctx.fillStyle=def.flecks[Math.floor(rand()*def.flecks.length)];const r=.6+rand()*rand()*3;ctx.fillRect(rand()*W,rand()*H,r,r);}
    return {canvas,size:[size,size]};
  }
  if(def.kind==='wood') {
    const size=def.size ?? [.6,.6],[W,H]=square(size);
    ctx.fillStyle=def.colour;ctx.fillRect(0,0,W,H);
    // Grain runs vertically, the usual direction on doors and cabinet fronts.
    for(let x=0;x<W;x+=1+rand()*4){ctx.globalAlpha=.08+rand()*.25;ctx.strokeStyle=def.grain;ctx.lineWidth=.5+rand()*1.5;
      ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+(rand()-.5)*8,H/3,x+(rand()-.5)*8,H*2/3,x,H);ctx.stroke();}
    ctx.globalAlpha=1;
    return {canvas,size};
  }
  if(def.kind==='stripes') {
    const total=def.width*def.colours.length,[W,H]=square([total,total]);
    def.colours.forEach((c,i)=>{ctx.fillStyle=c;ctx.fillRect(i*W/def.colours.length,0,W/def.colours.length,H);});
    return {canvas,size:[total,total]};
  }
  return null;
}

const cache=new Map();
export function buildMaterial(id,def) {
  if(cache.has(id))return cache.get(id);
  const material=new THREE.MeshStandardMaterial({color:def.kind==='paint'?def.colour:'#ffffff',
    roughness:def.roughness ?? .7,metalness:def.metalness ?? 0});
  const drawn=def.kind==='paint'?null:draw(id,def);
  if(drawn) {
    const map=new THREE.CanvasTexture(drawn.canvas);
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
    map.repeat.set(1/drawn.size[0],1/drawn.size[1]);
    if(def.pattern==='diagonal')map.rotation=Math.PI/4;  // Diamond layout.
    material.map=map;
  }
  material.name=id;cache.set(id,material);
  return material;
}
